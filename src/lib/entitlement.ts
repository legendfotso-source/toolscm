import "server-only";

import { tierOf, type TierId } from "./payments/tiers";
import { adminClient } from "./supabase/admin";
import { currentUser } from "./supabase/server-client";

export type Entitlement = {
  /** Which plan the database says this person is on. The authority. */
  tier: TierId;
  /**
   * Derived from `tier`, kept because a dozen call sites ask this question and
   * "pro or better" is what most of them actually mean. Never stored.
   */
  isPro: boolean;
  userId: string | null;
  /** When the current paid term ends, if there is one. */
  proUntil: string | null;
};

const FREE: Entitlement = { tier: "free", isPro: false, userId: null, proUntil: null };

/** PostgreSQL's code for "that column does not exist". */
const UNDEFINED_COLUMN = "42703";

type SubscriptionRow = { end_date: string | null; status: string; tier?: string | null };

/**
 * The caller's live subscription row, if there is one.
 *
 * Asked for twice when necessary. The code and the database are deployed by
 * two different people at two different moments — Vercel redeploys the instant
 * the code is pushed, while `0002_tiers.sql` is run by hand in the Supabase SQL
 * editor — so there is a window in which the new code is live and the `tier`
 * column does not exist yet. Without this, every SELECT in that window fails,
 * and the failure path returns FREE: every paying customer would silently lose
 * what they paid for until somebody noticed. Asking again without the column
 * costs one extra round trip in a window that should last minutes, and makes
 * the order of the two deploys stop mattering.
 */
async function activeSubscription(
  client: NonNullable<ReturnType<typeof adminClient>>,
  userId: string,
): Promise<SubscriptionRow | null> {
  const ask = async (columns: string) =>
    client
      .from("subscriptions")
      .select(columns)
      .eq("user_id", userId)
      .eq("status", "active")
      .order("end_date", { ascending: false })
      .limit(1);

  let result = await ask("end_date, status, tier");
  if (result.error?.code === UNDEFINED_COLUMN) {
    // Pre-migration database. A paid row is a Pro row; `tier` stays undefined
    // and the caller reads it as Pro, which is what it was sold as.
    result = await ask("end_date, status");
  }

  const rows = result.data as unknown as SubscriptionRow[] | null;
  if (result.error || !rows || rows.length === 0) return null;
  return rows[0];
}

/**
 * Is the caller Pro?
 *
 * Answered from the database, for the user identified by a signed session
 * cookie. Nothing the browser sends is consulted: there is no "isPro" field in
 * any request this function reads, so there is nothing for a user to edit in
 * dev tools.
 */
export async function getEntitlement(): Promise<Entitlement> {
  const user = await currentUser();
  if (!user) return FREE;

  const client = adminClient();
  if (!client) return { ...FREE, userId: user.id };

  // The owner's own account comes first, and short-circuits everything below.
  // It is not a subscription — there is no end date to check and no payment
  // to have expired — so asking about subscriptions at all would only be a
  // way to get the answer wrong.
  if (await hasUnlimited(client, user.id, user.email ?? "")) {
    return { tier: "owner", isPro: true, userId: user.id, proUntil: null };
  }

  // Evaluate expiry at read time rather than trusting a status column that a
  // cron job may not have updated yet.
  const row = await activeSubscription(client, user.id);
  if (!row) return { ...FREE, userId: user.id };

  const stillValid = !row.end_date || new Date(row.end_date) > new Date();

  if (!stillValid) {
    // Lazily record the expiry so the admin figures stay honest.
    await client
      .from("subscriptions")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("status", "active")
      .lte("end_date", new Date().toISOString());
    return { ...FREE, userId: user.id };
  }

  // A paid row with no tier recorded is Pro: every subscription sold before
  // Max existed was a Pro subscription, and reading those as free would take
  // away something people paid for.
  const tier = tierOf(row.tier ?? "pro");
  return { tier, isPro: true, userId: user.id, proUntil: row.end_date };
}


/**
 * Does this account have the no-limits flag?
 *
 * Read from `profiles.is_unlimited`, which `authenticated` has no UPDATE
 * grant on at all — so there is nothing here a user can set from the browser,
 * in dev tools, or by signing up with a particular address.
 *
 * `OWNER_EMAILS` exists for the same reason `ADMIN_EMAIL` does: on a fresh
 * deployment the only other way to set the flag is a hand-written UPDATE
 * against production, which is a step people get wrong or skip while leaving
 * the service-role key somewhere convenient. It is a server-side variable,
 * never sent to the browser, and it writes the flag ONCE — after that the
 * column is the authority and the variable can be cleared.
 */
async function hasUnlimited(
  client: NonNullable<ReturnType<typeof adminClient>>,
  userId: string,
  email: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("profiles")
    .select("is_unlimited")
    .eq("id", userId)
    .maybeSingle();

  // Pre-migration database: the column does not exist yet. Not an error worth
  // failing over — the answer is simply "no" until 0003 has been run.
  if (error?.code === UNDEFINED_COLUMN) return false;
  if (!error && (data as { is_unlimited?: boolean } | null)?.is_unlimited === true) return true;

  const configured = (process.env.OWNER_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const mine = email.trim().toLowerCase();
  if (!mine || !configured.includes(mine)) return false;

  const write = await client.from("profiles").update({ is_unlimited: true }).eq("id", userId);
  if (write.error) {
    console.error("[Tools.cm] could not set is_unlimited:", write.error.message);
    // Say yes anyway. The variable named this address as the owner; failing to
    // persist that is a database problem, not a reason to cap the owner.
    return write.error.code !== UNDEFINED_COLUMN;
  }

  console.warn(`[Tools.cm] ${email} was given unlimited access from OWNER_EMAILS.`);
  return true;
}
