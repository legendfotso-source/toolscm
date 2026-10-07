import "server-only";

import { adminClient } from "./supabase/admin";
import { expireStalePayments } from "./payments/core";
import { sweepOldHits } from "./rate-limit";
import { daysUntil, reminderDue, reminderMessage, REMIND_WITHIN_DAYS } from "./payments/reminders";
import { mailer } from "./email/mailer";
import { looksLikeEmail } from "./email/address";
import { getSettings } from "./settings";

/**
 * The work that has to happen when nobody is looking.
 *
 * Tools.cm sells on a manual Mobile Money flow: there is no card on file, so
 * nothing renews itself. A subscriber who lapses without noticing is the most
 * expensive kind of lost customer — already convinced, already paying, gone by
 * accident — and the only thing standing between a renewal and a silent
 * departure is somebody telling them. Until now that somebody was the owner,
 * opening /admin and tapping a WhatsApp link per person, every morning.
 *
 * Three rules.
 *
 * **Every job runs even if the one before it failed.** They are unrelated, and
 * a reminder that is not sent because a cleanup query failed is a renewal lost
 * to a bug in something else.
 *
 * **Nothing throws.** The route reports what happened; a scheduled request
 * that 500s is retried by the platform, and a retry of a half-finished mail
 * run is the one way this code could send a customer two of the same message.
 *
 * **Every send is recorded before the next one is decided.** Writing
 * `reminded_for` after each mail, rather than once at the end, means an
 * interrupted run resumes where it stopped instead of starting over.
 */

export type JobResult = { job: string; ok: boolean; detail: string };

/**
 * Tell everyone whose access ends within the window, once per expiry.
 *
 * Eligibility is `reminded_for IS DISTINCT FROM end_date`, not a boolean and
 * not a timestamp. When the customer renews, `end_date` moves, the recorded
 * value stops matching, and they become eligible again for the NEXT expiry —
 * with nothing to reset. A flag would have had to be cleared on renewal, and
 * the renewal path would have had to remember to clear it.
 */
export async function sendRenewalReminders(): Promise<JobResult> {
  const job = "renewal-reminders";
  const client = adminClient();
  if (!client) return { job, ok: false, detail: "no database connection" };

  const post = mailer();
  if (!post) {
    // Not a failure. The site works without a mail provider; saying "failed"
    // here would put a red mark on the admin panel for a configuration the
    // owner has deliberately not done yet.
    return { job, ok: true, detail: "no mail provider configured — nothing sent" };
  }

  const horizon = new Date(Date.now() + REMIND_WITHIN_DAYS * 86_400_000).toISOString();
  const now = new Date().toISOString();

  const { data, error } = await client
    .from("subscriptions")
    .select("id, end_date, reminded_for, profiles!inner(email)")
    .eq("status", "active")
    .gte("end_date", now)
    .lte("end_date", horizon)
    .order("end_date", { ascending: true })
    // A ceiling, not a page. If this ever returns hundreds, something is wrong
    // upstream and the right answer is to notice it rather than to spend a
    // mail quota finding out.
    .limit(100);

  if (error) return { job, ok: false, detail: error.message };

  const rows = (data ?? []) as unknown as {
    id: string;
    end_date: string;
    reminded_for: string | null;
    profiles: { email: string | null } | null;
  }[];

  const due = rows.filter((row) => reminderDue(row.end_date, row.reminded_for));

  if (due.length === 0) return { job, ok: true, detail: "nobody is expiring in the window" };

  const settings = await getSettings();
  const price = `${settings.price_xaf.toLocaleString("fr-FR")} FCFA`;

  let sent = 0;
  let skipped = 0;

  for (const row of due) {
    const email = row.profiles?.email?.trim() ?? "";
    if (!looksLikeEmail(email)) {
      skipped += 1;
      // Marked anyway. There is no address, so there is nothing a second
      // attempt tomorrow would do except ask this question again every day
      // until the subscription expires.
      await mark(client, row.id, row.end_date);
      continue;
    }

    const daysLeft = daysUntil(row.end_date);
    const text = reminderMessage({ daysLeft, proUntil: row.end_date }, price, "fr");

    const result = await post.send({
      to: email,
      subject:
        daysLeft <= 1
          ? "Tools.cm — votre accès Pro expire demain"
          : `Tools.cm — votre accès Pro expire dans ${daysLeft} jours`,
      text,
      // Stable for this subscription AND this expiry: a retried run cannot
      // duplicate the mail, and the next expiry gets its own key.
      idempotencyKey: `renewal:${row.id}:${row.end_date}`,
    });

    if (!result.ok) {
      // Left unmarked on purpose. A provider that refused today may accept
      // tomorrow, and there is still time inside the window.
      console.error(`[Tools.cm] renewal reminder to ${email} failed: ${result.reason}`);
      continue;
    }

    // Written per message, not once at the end: an interrupted run resumes
    // instead of starting over.
    await mark(client, row.id, row.end_date);
    sent += 1;
  }

  const detail =
    `${sent} reminder${sent === 1 ? "" : "s"} sent` +
    (skipped ? `, ${skipped} with no usable address` : "") +
    (due.length - sent - skipped ? `, ${due.length - sent - skipped} refused by the provider` : "");

  return { job, ok: true, detail };
}

async function mark(
  client: NonNullable<ReturnType<typeof adminClient>>,
  subscriptionId: string,
  endDate: string,
): Promise<void> {
  await client.from("subscriptions").update({ reminded_for: endDate }).eq("id", subscriptionId);
}

/** Close checkouts that were opened and walked away from. */
export async function closeAbandonedCheckouts(): Promise<JobResult> {
  const job = "expire-stale-payments";
  try {
    const closed = await expireStalePayments(12);
    return { job, ok: true, detail: `${closed} abandoned checkout${closed === 1 ? "" : "s"} closed` };
  } catch (error) {
    return { job, ok: false, detail: error instanceof Error ? error.message : "unknown error" };
  }
}

/**
 * Run everything, record what happened, and never throw.
 *
 * Each job is isolated: one failing must not stop the next. The results are
 * written to `cron_runs` so the admin panel can say when this last ran — a
 * scheduled job that silently stops is otherwise indistinguishable from a
 * quiet month, which is the exact class of fault the health panel exists for.
 */
export async function runScheduledWork(): Promise<JobResult[]> {
  const results: JobResult[] = [];

  for (const run of [sendRenewalReminders, closeAbandonedCheckouts]) {
    try {
      results.push(await run());
    } catch (error) {
      results.push({
        job: run.name,
        ok: false,
        detail: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  // Opportunistic elsewhere, deliberate here: this is the one moment the table
  // can be trimmed without a visitor's request paying for it.
  try {
    await sweepOldHits(1);
  } catch {
    /* housekeeping, never worth reporting */
  }

  await record(results);
  return results;
}

async function record(results: JobResult[]): Promise<void> {
  const client = adminClient();
  if (!client) return;

  const ok = results.every((result) => result.ok);
  const detail = results.map((result) => `${result.job}: ${result.detail}`).join(" · ");

  const { error } = await client
    .from("cron_runs")
    .upsert({ job: "daily", ran_at: new Date().toISOString(), ok, detail }, { onConflict: "job" });

  // A missing table means 0008 has not been pasted yet. The work still ran;
  // only the record of it is lost, and the health panel says exactly that.
  if (error && error.code !== "42P01") {
    console.error(`[Tools.cm] could not record the scheduled run: ${error.message}`);
  }
}

export type LastRun = { ranAt: string; ok: boolean; detail: string | null } | null;

/** When the scheduled work last ran, for the health panel. */
export async function lastScheduledRun(): Promise<LastRun> {
  const client = adminClient();
  if (!client) return null;

  const { data, error } = await client
    .from("cron_runs")
    .select("ran_at, ok, detail")
    .eq("job", "daily")
    .maybeSingle();

  if (error || !data) return null;
  const row = data as { ran_at: string; ok: boolean; detail: string | null };
  return { ranAt: row.ran_at, ok: row.ok, detail: row.detail };
}
