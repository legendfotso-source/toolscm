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
  const { data, error } = await client
    .from("subscriptions")
    .select("end_date, status, tier")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("end_date", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return { ...FREE, userId: user.id };
  }

  const row = data[0] as { end_date: string | null; status: string; tier: string | null };
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
