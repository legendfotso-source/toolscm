import "server-only";

import { tierOf, tierRank, type TierId } from "./payments/tiers";
import { adminClient } from "./supabase/admin";
import { isOwnerEmail } from "./auth/owner";
import {
  accountStatus,
  bestGrantTier,
  grantExpiry,
  liveGrants,
  statusAllowsUse,
  type AccountStatus,
} from "./accounts";
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
  /**
   * Is this person an administrator?
   *
   * Carried here rather than fetched separately because the profile row it
   * comes from is already being read for `is_unlimited` — asking twice for
   * one row, on every page, to answer two questions about it.
   */
  isAdmin: boolean;
  /**
   * The account's own state, independent of what it bought.
   *
   * Carried on the entitlement because every gate in the application already
   * asks for an entitlement, and "may this person act" is the same question
   * as "what may they do" one step earlier. A blocked account that still had
   * a valid subscription would otherwise keep working, which is the one thing
   * blocking has to prevent.
   */
  status: AccountStatus;
  /**
   * How they got this tier. The brief asks that a manual grant never looks
   * like a sale, and this is the field that keeps them apart in the UI and in
   * the figures.
   */
  source: "none" | "owner" | "grant" | "subscription";
};

const FREE: Entitlement = {
  tier: "free",
  isPro: false,
  userId: null,
  proUntil: null,
  isAdmin: false,
  status: "active",
  source: "none",
};

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
/**
 * Record, if we can, that the owner has unlimited access.
 *
 * Unconditional rather than "only when it differs": skipping the write when
 * the flag already matches would need a read first, so the saving is one
 * round trip traded for another, on one row, for one person.
 *
 * Best effort and nothing more. Returns no value, throws nothing, and is never
 * consulted: a failure here means the profile row disagrees with the
 * environment for a while, which costs a wrong figure on the members table and
 * nothing else.
 */
async function markOwnerUnlimited(userId: string): Promise<void> {
  const client = adminClient();
  if (!client) return;
  const { error } = await client
    .from("profiles")
    .update({ is_unlimited: true, is_admin: true })
    .eq("id", userId);
  if (error && error.code !== UNDEFINED_COLUMN) {
    console.warn("[Tools.cm] could not mark the owner unlimited:", error.message);
  }
}

export async function getEntitlement(): Promise<Entitlement> {
  const user = await currentUser();
  if (!user) return FREE;

  // The owner, decided from the environment, before anything that needs a
  // database. Above the `client` check on purpose: when the service-role key
  // is missing or rejected, every signed-in account used to drop to free —
  // including Fortune's — so the one person who could diagnose it saw the same
  // capped, admin-less site as a stranger. The owner is a deployment fact, not
  // a row, and a database he cannot reach must not be able to demote him.
  if (isOwnerEmail(user.email)) {
    // The answer is already decided. The write below only keeps the profile
    // row agreeing with it, so the admin members table shows the owner as
    // unlimited like everybody else — it is a display detail, awaited so it
    // cannot become a floating promise in a serverless function, and its
    // failure is ignored on purpose. The entitlement does not depend on it;
    // that is the whole point of answering before the database is consulted.
    await markOwnerUnlimited(user.id);
    return {
      tier: "owner",
      isPro: true,
      userId: user.id,
      proUntil: null,
      isAdmin: true,
      // The owner's own account is never suspended by this path. The database
      // trigger in 0005 refuses it too, so the two agree.
      status: "active",
      source: "owner",
    };
  }

  const client = adminClient();
  if (!client) return { ...FREE, userId: user.id };

  // The account's own state, before anything about what it bought.
  //
  // A blocked account with a valid subscription is still blocked — that is the
  // whole meaning of blocking, and evaluating the subscription first would
  // produce an entitlement that says "Max" for somebody who may not use the
  // site at all. Returned as free with the real status attached, so a caller
  // can both refuse the action and say why.
  const status = await accountStatus(user.id);
  if (!statusAllowsUse(status)) {
    return { ...FREE, userId: user.id, status };
  }

  const flags = await profileFlags(client, user.id, user.email ?? "");
  if (flags.isUnlimited) {
    return {
      tier: "owner",
      isPro: true,
      userId: user.id,
      proUntil: null,
      isAdmin: flags.isAdmin,
      status,
      source: "grant",
    };
  }

  // Granted access, next. Above the subscription on purpose: the priority the
  // brief sets is OWNER, UNLIMITED, MAX, PRO, FREE, and a grant is how
  // somebody gets Max without a payment. A grant that is weaker than what the
  // person actually bought does not take anything away — `bestOf` below keeps
  // whichever is stronger.
  const grants = await liveGrants(user.id);
  const grantedTier = bestGrantTier(grants);

  // Evaluate expiry at read time rather than trusting a status column that a
  // cron job may not have updated yet.
  const row = await activeSubscription(client, user.id);
  const subscriptionValid = row ? !row.end_date || new Date(row.end_date) > new Date() : false;

  if (row && !subscriptionValid) {
    // Lazily record the expiry so the admin figures stay honest.
    await client
      .from("subscriptions")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("status", "active")
      .lte("end_date", new Date().toISOString());
  }

  // A paid row with no tier recorded is Pro: every subscription sold before
  // Max existed was a Pro subscription, and reading those as free would take
  // away something people paid for.
  const paidTier: TierId | null = row && subscriptionValid ? tierOf(row.tier ?? "pro") : null;

  if (!grantedTier && !paidTier) {
    return { ...FREE, userId: user.id, isAdmin: flags.isAdmin, status };
  }

  // Whichever is stronger wins, and the source follows the winner — so a
  // customer who also happens to hold a promotional grant is reported by
  // whichever actually decides what they can do.
  const grantWins =
    !!grantedTier && (!paidTier || tierRank(grantedTier) >= tierRank(paidTier));
  const tier = (grantWins ? grantedTier : paidTier) as TierId;

  return {
    tier,
    isPro: true,
    userId: user.id,
    proUntil: grantWins ? grantExpiry(grants) : (row?.end_date ?? null),
    isAdmin: flags.isAdmin,
    status,
    source: grantWins ? "grant" : "subscription",
  };
}


/**
 * The two flags that live on the profile row, read in one query.
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
async function profileFlags(
  client: NonNullable<ReturnType<typeof adminClient>>,
  userId: string,
  email: string,
): Promise<{ isUnlimited: boolean; isAdmin: boolean }> {
  const ask = (columns: string) =>
    client.from("profiles").select(columns).eq("id", userId).maybeSingle();

  let result = await ask("is_unlimited, is_admin");
  // Pre-migration database: `is_unlimited` does not exist yet. Ask again
  // without it rather than losing the admin flag too — the order of the code
  // deploy and the hand-run migration must not decide who can reach /admin.
  if (result.error?.code === UNDEFINED_COLUMN) result = await ask("is_admin");

  const row = result.data as { is_unlimited?: boolean; is_admin?: boolean } | null;
  const isAdmin = !result.error && row?.is_admin === true;

  if (!result.error && row?.is_unlimited === true) return { isUnlimited: true, isAdmin };

  const configured = (process.env.OWNER_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const mine = email.trim().toLowerCase();
  if (!mine || !configured.includes(mine)) return { isUnlimited: false, isAdmin };

  const write = await client.from("profiles").update({ is_unlimited: true }).eq("id", userId);
  if (write.error) {
    console.error("[Tools.cm] could not set is_unlimited:", write.error.message);
    // Say yes anyway. The variable named this address as the owner; failing to
    // persist that is a database problem, not a reason to cap the owner.
    return { isUnlimited: write.error.code !== UNDEFINED_COLUMN, isAdmin };
  }

  console.warn(`[Tools.cm] ${email} was given unlimited access from OWNER_EMAILS.`);
  return { isUnlimited: true, isAdmin };
}
