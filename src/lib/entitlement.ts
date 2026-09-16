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
