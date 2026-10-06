import "server-only";

import { adminClient } from "./supabase/admin";
import type { TierId } from "./payments/tiers";

/**
 * Account status and granted access — the two things that are true about a
 * person independently of what they bought.
 *
 * Kept apart from `entitlement.ts`, which answers "what may this person do".
 * This file answers "what is this account, and what has been given to it",
 * and the separation matters because the two have different authorities: a
 * subscription comes from a payment, a grant comes from an administrator, and
 * mixing them is how a gift ends up in the revenue figures.
 */

export type AccountStatus = "active" | "suspended" | "blocked" | "deactivated";

/** Tiers that can be granted. `unlimited` is not a plan and is not sold. */
export type GrantTier = "pro" | "max" | "unlimited";

export type GrantKind = "admin" | "promotional" | "trial" | "compensation" | "staff";

export type Grant = {
  id: string;
  userId: string;
  tier: GrantTier;
  kind: GrantKind;
  reason: string | null;
  startsAt: string;
  /** null means for ever. */
  expiresAt: string | null;
  grantedBy: string | null;
  revokedAt: string | null;
  createdAt: string;
};

/** PostgreSQL's code for "that relation does not exist". */
const UNDEFINED_TABLE = "42P01";
const UNDEFINED_COLUMN = "42703";

export function accountsTablesMissing(code: string | undefined): boolean {
  return code === UNDEFINED_TABLE || code === UNDEFINED_COLUMN;
}

type GrantRow = {
  id: string;
  user_id: string;
  tier: string;
  kind: string;
  reason: string | null;
  starts_at: string;
  expires_at: string | null;
  granted_by: string | null;
  revoked_at: string | null;
  created_at: string;
};

function toGrant(row: GrantRow): Grant {
  return {
    id: row.id,
    userId: row.user_id,
    tier: row.tier as GrantTier,
    kind: row.kind as GrantKind,
    reason: row.reason,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    grantedBy: row.granted_by,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

/**
 * The grants that are live for this person right now.
 *
 * Expiry is evaluated here, at read time, against the clock — not by trusting
 * a status column that something would have to have updated. The same rule the
 * subscription path already follows, and for the same reason: there is no cron
 * job on this deployment, so a column saying "active" means only that nothing
 * has looked at it since.
 *
 * Returns [] rather than throwing when the table does not exist. The code
 * deploy and the hand-run migration land at different moments, and a missing
 * table must mean "nobody has been granted anything yet" rather than "every
 * paying customer is now free".
 */
export async function liveGrants(userId: string): Promise<Grant[]> {
  const client = adminClient();
  if (!client || !userId) return [];

  const now = new Date().toISOString();
  const { data, error } = await client
    .from("entitlement_grants")
    .select("*")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .lte("starts_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at", { ascending: false });

  if (error) {
    if (!accountsTablesMissing(error.code)) {
      console.error("[Tools.cm] could not read grants:", error.message);
    }
    return [];
  }
  return ((data ?? []) as GrantRow[]).map(toGrant);
}

/** Where a tier sits, for picking the best of several grants. */
const GRANT_RANK: Record<GrantTier, number> = { pro: 1, max: 2, unlimited: 3 };

/**
 * The strongest live grant, as a tier the rest of the app understands.
 *
 * `unlimited` maps to the `owner` tier, which is the one with no caps. Named
 * differently on purpose: `owner` is the PLATFORM owner and comes from an
 * environment variable; an unlimited GRANT is something an administrator gave
 * somebody, and it can be revoked. They happen to allow the same things, and
 * conflating the two in the database would make an unlimited grant a way to
 * become the platform owner.
 */
export function bestGrantTier(grants: Grant[]): TierId | null {
  if (!grants.length) return null;
  const best = grants.reduce((top, grant) =>
    GRANT_RANK[grant.tier] > GRANT_RANK[top.tier] ? grant : top,
  );
  return best.tier === "unlimited" ? "owner" : best.tier;
}

/** When the strongest live grant runs out, or null if it never does. */
export function grantExpiry(grants: Grant[]): string | null {
  if (!grants.length) return null;
  const best = grants.reduce((top, grant) =>
    GRANT_RANK[grant.tier] > GRANT_RANK[top.tier] ? grant : top,
  );
  return best.expiresAt;
}

/**
 * This person's account status.
 *
 * `active` is returned when the column does not exist yet, which is the
 * pre-migration case: the alternative — defaulting to blocked — would lock
 * every customer out of a site that was working a minute earlier, because a
 * SQL file had not been pasted yet.
 */
export async function accountStatus(userId: string): Promise<AccountStatus> {
  const client = adminClient();
  if (!client || !userId) return "active";
  const { data, error } = await client
    .from("profiles")
    .select("status, deleted_at")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return "active";
  const row = data as { status?: string | null; deleted_at?: string | null };
  if (row.deleted_at) return "deactivated";
  const status = (row.status ?? "active") as AccountStatus;
  return (["active", "suspended", "blocked", "deactivated"] as const).includes(status)
    ? status
    : "active";
}

/**
 * May this account use the site at all?
 *
 * Blocked and suspended both mean no. Deactivated means the person closed
 * their own account, which also means no until they restore it — but it is a
 * different sentence, and the caller is expected to say which.
 */
export function statusAllowsUse(status: AccountStatus): boolean {
  return status === "active";
}
