import "server-only";

import { adminClient } from "./supabase/admin";
import type { Role } from "./auth/owner";
import type { AuditAction } from "./audit-labels";

export { ACTION_LABEL } from "./audit-labels";
export type { AuditAction } from "./audit-labels";

/**
 * What happened on the platform, and who did it.
 *
 * Append-only by privilege: 0005 revokes UPDATE and DELETE on the table from
 * every role, service_role included. That is deliberate and it is the whole
 * value of the thing — a log the application can edit proves nothing, and the
 * one pressure a log has to survive is somebody wanting to tidy it.
 *
 * Writing is best-effort and never blocks the action it describes. A grant
 * that succeeded and a log line that failed is a worse outcome than a missing
 * log line, because the customer is left without what the administrator just
 * decided to give them. The failure is logged to the console instead, which is
 * where the next question would be asked anyway.
 *
 * Two kinds of thing are deliberately NOT recorded: anything secret (keys,
 * tokens, passwords, card numbers — there is no code path that puts them in
 * `metadata`, and reviewers should keep it that way), and reads. An audit of
 * every page view is an audit nobody reads; this records decisions.
 */

export type AuditEntry = {
  id: number;
  actorEmail: string | null;
  actorRole: string;
  action: AuditAction;
  targetUser: string | null;
  targetEmail: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type RecordInput = {
  action: AuditAction;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: Role;
  targetUser?: string | null;
  targetEmail?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** PostgreSQL's code for "that relation does not exist". */
const UNDEFINED_TABLE = "42P01";

export async function record(input: RecordInput): Promise<void> {
  const client = adminClient();
  if (!client) return;

  const { error } = await client.from("admin_audit_log").insert({
    actor_id: input.actorId ?? null,
    // Stored alongside the id on purpose. The address AT THE TIME is part of
    // the record: an account deleted or renamed later must not turn a log line
    // into a bare uuid nobody can resolve.
    actor_email: input.actorEmail ?? null,
    actor_role: input.actorRole ?? "admin",
    action: input.action,
    target_user: input.targetUser ?? null,
    target_email: input.targetEmail ?? null,
    reason: input.reason?.trim() || null,
    metadata: input.metadata ?? null,
  });

  if (error && error.code !== UNDEFINED_TABLE) {
    console.error("[Tools.cm] could not write the audit log:", error.message);
  }
}

type Row = {
  id: number;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  target_user: string | null;
  target_email: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

/**
 * The most recent entries, newest first.
 *
 * `targetUser` narrows it to one account, which is what the user detail page
 * asks for — "what has been done to this person" is a different question from
 * "what has been done lately", and answering the first by filtering the second
 * in JavaScript stops working at the exact moment the log becomes useful.
 */
export async function recent(
  options: { limit?: number; targetUser?: string } = {},
): Promise<AuditEntry[]> {
  const client = adminClient();
  if (!client) return [];

  let query = client
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(options.limit ?? 50, 300)));

  if (options.targetUser) query = query.eq("target_user", options.targetUser);

  const { data, error } = await query;
  if (error) {
    if (error.code !== UNDEFINED_TABLE) {
      console.error("[Tools.cm] could not read the audit log:", error.message);
    }
    return [];
  }

  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    actorEmail: row.actor_email,
    actorRole: row.actor_role ?? "admin",
    action: row.action as AuditAction,
    targetUser: row.target_user,
    targetEmail: row.target_email,
    reason: row.reason,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));
}
