import "server-only";

import { adminClient } from "./supabase/admin";
import { isOwnerEmail, type Role } from "./auth/owner";
import { record } from "./audit";
import type { AccountStatus, GrantKind, GrantTier } from "./accounts";

/**
 * Everything an administrator can do to an account.
 *
 * One module, because every one of these needs the same three things and
 * getting any of them wrong is the kind of mistake nobody notices: the owner
 * must be untouchable, the action must be written to the audit log, and a
 * failure must leave the account as it was rather than half-changed.
 *
 * Each function takes the actor. Not fetched inside — passed in, by the route,
 * which has already established who is calling. A module that works out its
 * own caller is a module that can be called from somewhere that has not
 * checked, and then the audit log records an action with no actor.
 */

export type Actor = {
  id: string | null;
  email: string | null;
  role: Role;
};

export type ActionResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "protected" | "failed" | "forbidden" };

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_COLUMN = "42703";

function migrationMissing(code: string | undefined): boolean {
  return code === UNDEFINED_TABLE || code === UNDEFINED_COLUMN;
}

/**
 * Is this account the platform owner, and therefore off limits?
 *
 * Asked by email against OWNER_EMAILS rather than by a column, so it holds
 * even on a database where nothing has been flagged. The matching database
 * trigger in 0005 refuses the same operations — the application says no first
 * so the person gets a sentence instead of a 500, and the database says no
 * last so a path nobody thought of cannot get through.
 */
async function isProtected(userId: string): Promise<boolean> {
  const client = adminClient();
  if (!client) return true; // cannot check, so cannot touch: fail closed
  const { data } = await client
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  const email = (data as { email: string | null } | null)?.email ?? "";
  return isOwnerEmail(email);
}

// ---------------------------------------------------------------------------
// Account status
// ---------------------------------------------------------------------------

const STATUS_ACTION = {
  active: "account.restore",
  suspended: "account.suspend",
  blocked: "account.block",
  deactivated: "account.deactivate",
} as const;

export async function setStatus(
  userId: string,
  status: AccountStatus,
  actor: Actor,
  reason?: string,
): Promise<ActionResult> {
  const client = adminClient();
  if (!client) return { ok: false, reason: "failed" };
  if (await isProtected(userId)) return { ok: false, reason: "protected" };

  const { data: before } = await client
    .from("profiles")
    .select("email, status")
    .eq("id", userId)
    .maybeSingle();
  if (!before) return { ok: false, reason: "not_found" };
  const target = before as { email: string | null; status?: string | null };

  const { error } = await client
    .from("profiles")
    .update({
      status,
      status_reason: reason?.trim() || null,
      status_changed_at: new Date().toISOString(),
      status_changed_by: actor.id,
      // Restoring clears the soft-delete stamp as well, or a restored account
      // would read as active in one column and deleted in the other.
      deleted_at: status === "deactivated" ? new Date().toISOString() : null,
    })
    .eq("id", userId);

  if (error) {
    console.error("[Tools.cm] could not change an account status:", error.message);
    return { ok: false, reason: migrationMissing(error.code) ? "failed" : "failed" };
  }

  await record({
    action: STATUS_ACTION[status],
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    targetUser: userId,
    targetEmail: target.email,
    reason,
    metadata: { from: target.status ?? "active", to: status },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Grants
// ---------------------------------------------------------------------------

export type GrantInput = {
  tier: GrantTier;
  kind?: GrantKind;
  /** null or absent means for ever. */
  expiresAt?: string | null;
  reason?: string;
};

export async function grantAccess(
  userId: string,
  input: GrantInput,
  actor: Actor,
): Promise<ActionResult> {
  const client = adminClient();
  if (!client) return { ok: false, reason: "failed" };

  const { data: target } = await client
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { ok: false, reason: "not_found" };

  const { error } = await client.from("entitlement_grants").insert({
    user_id: userId,
    tier: input.tier,
    kind: input.kind ?? "admin",
    reason: input.reason?.trim() || null,
    expires_at: input.expiresAt ?? null,
    granted_by: actor.id,
  });

  if (error) {
    console.error("[Tools.cm] could not record a grant:", error.message);
    return { ok: false, reason: "failed" };
  }

  await record({
    action: "grant.create",
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    targetUser: userId,
    targetEmail: (target as { email: string | null }).email,
    reason: input.reason,
    // The whole grant in the log, because "what exactly was given" is the
    // question somebody asks three months later and the grant row itself may
    // have been revoked by then.
    metadata: {
      tier: input.tier,
      kind: input.kind ?? "admin",
      expiresAt: input.expiresAt ?? null,
    },
  });
  return { ok: true };
}

export async function revokeGrant(
  grantId: string,
  actor: Actor,
  reason?: string,
): Promise<ActionResult> {
  const client = adminClient();
  if (!client) return { ok: false, reason: "failed" };

  const { data } = await client
    .from("entitlement_grants")
    .select("id, user_id, tier, revoked_at")
    .eq("id", grantId)
    .maybeSingle();
  const grant = data as
    | { id: string; user_id: string; tier: string; revoked_at: string | null }
    | null;
  if (!grant) return { ok: false, reason: "not_found" };
  // Already revoked is a success, not an error: the caller wanted it gone and
  // it is gone. Returning a failure here makes a double-click look broken.
  if (grant.revoked_at) return { ok: true };

  const { error } = await client
    .from("entitlement_grants")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: actor.id,
      revoke_reason: reason?.trim() || null,
    })
    .eq("id", grantId)
    // Conditional, so two administrators revoking at the same moment do not
    // both write — the second finds nothing to update and the log gets one
    // entry rather than two.
    .is("revoked_at", null);

  if (error) {
    console.error("[Tools.cm] could not revoke a grant:", error.message);
    return { ok: false, reason: "failed" };
  }

  const { data: target } = await client
    .from("profiles")
    .select("email")
    .eq("id", grant.user_id)
    .maybeSingle();

  await record({
    action: "grant.revoke",
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    targetUser: grant.user_id,
    targetEmail: (target as { email: string | null } | null)?.email ?? null,
    reason,
    metadata: { grantId, tier: grant.tier },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Private notes
// ---------------------------------------------------------------------------

export async function addNote(
  userId: string,
  body: string,
  actor: Actor,
): Promise<ActionResult> {
  const client = adminClient();
  if (!client) return { ok: false, reason: "failed" };
  const text = body.trim();
  if (!text) return { ok: false, reason: "failed" };

  const { error } = await client.from("admin_notes").insert({
    user_id: userId,
    author_id: actor.id,
    author_email: actor.email,
    body: text.slice(0, 4000),
  });
  if (error) {
    console.error("[Tools.cm] could not add a note:", error.message);
    return { ok: false, reason: "failed" };
  }

  // The note's TEXT is not copied into the audit log. The log records that a
  // note was added and by whom; the note itself lives in one place, so
  // redacting or correcting it later does not leave a copy behind in a table
  // that nothing is allowed to edit.
  await record({
    action: "note.add",
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    targetUser: userId,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Appointing administrators — owner only
// ---------------------------------------------------------------------------

export async function setAdmin(
  userId: string,
  makeAdmin: boolean,
  actor: Actor,
  reason?: string,
): Promise<ActionResult> {
  // Owner only, checked here as well as in the route. The brief lists changing
  // another administrator's role among the owner-only actions, and a rule
  // enforced in exactly one place is a rule that survives until somebody adds
  // a second caller.
  if (actor.role !== "owner") return { ok: false, reason: "forbidden" };

  const client = adminClient();
  if (!client) return { ok: false, reason: "failed" };
  if (!makeAdmin && (await isProtected(userId))) return { ok: false, reason: "protected" };

  const { data: target } = await client
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { ok: false, reason: "not_found" };

  const { error } = await client
    .from("profiles")
    .update({ is_admin: makeAdmin })
    .eq("id", userId);
  if (error) {
    console.error("[Tools.cm] could not change an admin flag:", error.message);
    return { ok: false, reason: "failed" };
  }

  await record({
    action: makeAdmin ? "admin.appoint" : "admin.dismiss",
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    targetUser: userId,
    targetEmail: (target as { email: string | null }).email,
    reason,
  });
  return { ok: true };
}
