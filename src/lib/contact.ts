import "server-only";

import { adminClient } from "./supabase/admin";
import { contactRecipient, send } from "./email/mailer";
export { looksLikeEmail } from "./email/address";

/**
 * The contact form: stored first, emailed second.
 *
 * That order is the design. Email delivery fails — an outage, a bounce, a spam
 * folder, an unverified sender — and a contact form whose only record is an
 * email that did not arrive loses customers in complete silence. The row is
 * the record; the mail is the notification. When the notification fails the
 * row says so, and the admin inbox shows the message anyway.
 *
 * Rate limiting is done against the database rather than in memory. This runs
 * on Vercel: a counter in a module variable lives in one lambda, and the next
 * request lands in another one with an empty counter — a rate limit that works
 * on a laptop and does nothing in production. `contact_messages` already has
 * an index on (sender_hash, created_at), so counting is one cheap query.
 */

export const MAX_PER_HOUR = 3;
export const MAX_PER_DAY = 10;

export type ContactInput = {
  name: string;
  email: string;
  subject: string;
  message: string;
  senderHash: string;
  userId?: string | null;
};

export type ContactResult =
  | { ok: true; id: string; emailed: boolean }
  | { ok: false; reason: "rate_limited" | "duplicate" | "store_failed" | "unavailable" };

/** PostgreSQL's code for "that relation does not exist". */
const UNDEFINED_TABLE = "42P01";

/**
 * Has this sender had their turn recently?
 *
 * Two windows rather than one. An hourly cap alone lets somebody post three an
 * hour all day; a daily cap alone lets them post ten in ten seconds. Together
 * they bound both the burst and the total, which is what a rate limit is for.
 */
export async function withinRateLimit(senderHash: string): Promise<boolean> {
  const client = adminClient();
  if (!client || !senderHash) return true;

  const now = Date.now();
  for (const [windowMs, cap] of [
    [60 * 60 * 1000, MAX_PER_HOUR],
    [24 * 60 * 60 * 1000, MAX_PER_DAY],
  ] as const) {
    const since = new Date(now - windowMs).toISOString();
    const { count, error } = await client
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_hash", senderHash)
      .gte("created_at", since);
    // A counting failure lets the message through. The alternative is a
    // database hiccup silently turning the contact form off, which is a worse
    // outcome than one extra message.
    if (error) return true;
    if ((count ?? 0) >= cap) return false;
  }
  return true;
}

/**
 * The same message, sent twice, within a few minutes.
 *
 * Usually a double submit or an impatient second click rather than abuse, so
 * this is not counted against the rate limit — it simply returns the first
 * message's id and sends nothing. The visitor sees the same confirmation they
 * saw the first time, which is the truth.
 */
async function recentDuplicate(input: ContactInput): Promise<string | null> {
  const client = adminClient();
  if (!client) return null;
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("contact_messages")
    .select("id")
    .eq("email", input.email.trim().toLowerCase())
    .eq("message", input.message.trim())
    .gte("created_at", since)
    .limit(1);
  if (error) return null;
  const rows = (data ?? []) as { id: string }[];
  return rows[0]?.id ?? null;
}

export async function submitContact(input: ContactInput): Promise<ContactResult> {
  const client = adminClient();
  if (!client) return { ok: false, reason: "unavailable" };

  const duplicate = await recentDuplicate(input);
  if (duplicate) return { ok: true, id: duplicate, emailed: true };

  if (!(await withinRateLimit(input.senderHash))) {
    return { ok: false, reason: "rate_limited" };
  }

  const row = {
    user_id: input.userId ?? null,
    name: input.name.trim().slice(0, 120),
    email: input.email.trim().toLowerCase().slice(0, 320),
    subject: input.subject.trim().slice(0, 200),
    message: input.message.trim().slice(0, 5000),
    sender_hash: input.senderHash || null,
  };

  const stored = await client.from("contact_messages").insert(row).select("id").maybeSingle();
  if (stored.error || !stored.data) {
    if (stored.error?.code === UNDEFINED_TABLE) {
      console.error("[Tools.cm] contact_messages does not exist; run the migrations.");
    } else {
      console.error("[Tools.cm] could not store a contact message:", stored.error?.message);
    }
    return { ok: false, reason: "store_failed" };
  }

  const id = (stored.data as { id: string }).id;

  // Now the notification. The message is already safe; whatever happens next
  // is recorded on the row rather than shown to the visitor, because a
  // provider outage is not their problem and not something they can act on.
  const result = await send({
    to: contactRecipient(),
    subject: `[Tools.cm] ${row.subject}`,
    // Reply-To is the visitor. Hitting reply in Gmail then answers the person
    // who wrote, which is the single detail that makes a contact form usable
    // rather than a notification you have to copy an address out of.
    replyTo: row.email,
    // The id is in the key, so a retry of the same request cannot send twice.
    idempotencyKey: `contact-${id}`,
    text: [
      `De : ${row.name} <${row.email}>`,
      `Sujet : ${row.subject}`,
      "",
      row.message,
      "",
      "—",
      `Reçu le ${new Date().toISOString()}`,
      `Référence : ${id}`,
      input.userId ? `Compte : ${input.userId}` : "Envoyé sans compte",
    ].join("\n"),
  });

  await client
    .from("contact_messages")
    .update({
      emailed: result.ok,
      email_error: result.ok ? null : result.reason.slice(0, 300),
    })
    .eq("id", id);

  if (!result.ok) {
    console.error("[Tools.cm] contact message stored but not emailed:", result.reason);
  }

  return { ok: true, id, emailed: result.ok };
}
