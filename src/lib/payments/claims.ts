import "server-only";

import { requireAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { grantPro } from "./core";
import { planForTier, type PaidTier, type PlanId } from "./plans";
import { receiptReference } from "./receipt";

/**
 * "I have paid." — and the one place that turns it into access.
 *
 * Before this existed, a customer who sent 2,000 FCFA to the MTN number had
 * no way to tell the site about it. They had to find Fortune on WhatsApp,
 * he had to read the reference off a phone screen, and he had to type it into
 * /admin himself. Every step of that is a place for the payment to be lost,
 * and the customer spends it wondering whether they have been robbed.
 *
 * A claim is a REQUEST and nothing more. Three properties hold, and each of
 * them is the answer to a way this could be used to steal a subscription:
 *
 *   * **A claim grants nothing.** The row carries no access. Only
 *     `approveClaim` calls `grantPro`, and only an admin can reach it.
 *   * **The amount is never taken from the browser.** The server recomputes
 *     the price from the tier and the plan length using `planForTier` — the
 *     same function the pricing page and the checkout use. A claim that says
 *     "I sent 100 FCFA for Max" cannot exist; what is stored is what Max
 *     costs, which is what the admin checks the transfer against.
 *   * **A reference can only be claimed once.** The unique index on
 *     `lower(transaction_id)` means a customer tapping the button four times
 *     leaves one row, and the same reference cannot be re-used next month to
 *     ask for another free term.
 *
 * Approval then goes through `grantPro`, which is idempotent on
 * (provider, transaction_id). So approving a claim twice — two admins, a
 * double tap, a retried request — extends the subscription once.
 */

export type ClaimStatus = "pending" | "approved" | "rejected";

export type Claim = {
  id: string;
  userId: string;
  email: string;
  tier: PaidTier;
  days: number;
  amount: number;
  currency: string;
  operator: string | null;
  phone: string | null;
  transactionId: string;
  status: ClaimStatus;
  note: string | null;
  decisionNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type CreateClaimInput = {
  userId: string;
  tier: PaidTier;
  plan: PlanId;
  operator?: string | null;
  phone?: string | null;
  transactionId: string;
  note?: string | null;
};

export type CreateClaimResult =
  | { ok: true; claim: Claim }
  | { ok: false; reason: "duplicate_reference" | "already_pending" | "write_failed" };

/** Postgres unique-violation — the same code the grant path relies on. */
const UNIQUE_VIOLATION = "23505";

/** PostgreSQL's code for "that relation does not exist". */
const UNDEFINED_TABLE = "42P01";

export function claimsTableMissing(code: string | undefined): boolean {
  return code === UNDEFINED_TABLE;
}

export async function createClaim(input: CreateClaimInput): Promise<CreateClaimResult> {
  const client = requireAdminClient();
  const settings = await getSettings();
  // The price comes from the server's own settings, never from the request.
  const plan = planForTier(settings, input.tier, input.plan);

  // One open claim at a time. Somebody whose first claim is still waiting does
  // not need a second one in the queue; they need Fortune to get to the first.
  const open = await client
    .from("payment_claims")
    .select("id")
    .eq("user_id", input.userId)
    .eq("status", "pending")
    .limit(1);
  if (!open.error && (open.data ?? []).length > 0) {
    return { ok: false, reason: "already_pending" };
  }

  const inserted = await client
    .from("payment_claims")
    .insert({
      user_id: input.userId,
      tier: input.tier,
      days: plan.days,
      amount: plan.amountXaf,
      currency: "XAF",
      operator: input.operator?.trim() || null,
      phone: input.phone?.trim() || null,
      transaction_id: input.transactionId.trim(),
      note: input.note?.trim() || null,
      // Written rather than left to the column default. The default is still
      // there, and the RLS insert policy checks it so a browser cannot create
      // an already-approved claim — but a row this code writes should say what
      // it is rather than depend on where it was written.
      status: "pending",
    })
    .select("*")
    .single();

  if (inserted.error) {
    if (inserted.error.code === UNIQUE_VIOLATION) {
      return { ok: false, reason: "duplicate_reference" };
    }
    console.error("[Tools.cm] could not record the claim:", inserted.error.message);
    return { ok: false, reason: "write_failed" };
  }

  return { ok: true, claim: toClaim(inserted.data as Row, "") };
}

/** The caller's own claims, newest first. */
export async function claimsForUser(userId: string, limit = 5): Promise<Claim[]> {
  const client = requireAdminClient();
  const { data, error } = await client
    .from("payment_claims")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return ((data ?? []) as Row[]).map((row) => toClaim(row, ""));
}

/**
 * The queue.
 *
 * Oldest pending first, because that is the order the people waiting have
 * been waiting in. Decided claims are listed newest first — nobody works
 * through history from the beginning.
 */
export async function listClaims(status: ClaimStatus = "pending", limit = 100): Promise<Claim[]> {
  const client = requireAdminClient();
  const { data, error } = await client
    .from("payment_claims")
    .select("*, profiles(email)")
    .eq("status", status)
    .order("created_at", { ascending: status === "pending" })
    .limit(limit);

  if (error) {
    if (!claimsTableMissing(error.code)) {
      console.error("[Tools.cm] could not list claims:", error.message);
    }
    return [];
  }

  return ((data ?? []) as (Row & { profiles: { email: string } | null })[]).map((row) =>
    toClaim(row, row.profiles?.email ?? ""),
  );
}

export type DecisionResult =
  | {
      ok: true;
      status: "approved";
      duplicate: boolean;
      proUntil: string | null;
      receipt: {
        reference: string;
        amount: number;
        currency: string;
        paidAt: string;
        proUntil: string | null;
        days: number;
        tier: PaidTier;
      } | null;
    }
  | { ok: true; status: "rejected" }
  | { ok: false; reason: "not_found" | "not_pending" | "grant_failed" };

/**
 * Approve a claim: record the payment, grant the term, close the row.
 *
 * The claim's own `transaction_id` is what goes to `grantPro`, deliberately.
 * That is the customer's Mobile Money reference, so the payment row can be
 * reconciled against a real statement — and it is what makes a second
 * approval of the same claim a no-op rather than a second month.
 *
 * The claim is marked approved AFTER the grant, and only if the grant
 * succeeded. The other order would close the queue item and leave the
 * customer with nothing, which is the one failure they cannot see or report.
 */
export async function approveClaim(
  claimId: string,
  adminUserId: string,
  decisionNote?: string,
): Promise<DecisionResult> {
  const client = requireAdminClient();
  const found = await client.from("payment_claims").select("*").eq("id", claimId).maybeSingle();
  const claim = found.data as Row | null;
  if (found.error || !claim) return { ok: false, reason: "not_found" };
  if (claim.status !== "pending") return { ok: false, reason: "not_pending" };

  let result;
  try {
    result = await grantPro({
      userId: claim.user_id,
      provider: "manual",
      transactionId: claim.transaction_id,
      amount: claim.amount,
      currency: claim.currency,
      days: claim.days,
      tier: claim.tier as PaidTier,
      raw: {
        enteredBy: "admin",
        fromClaim: claim.id,
        operator: claim.operator,
        phone: claim.phone,
        note: decisionNote ?? null,
        at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error(
      "[Tools.cm] approving a claim failed:",
      error instanceof Error ? error.message : error,
    );
    return { ok: false, reason: "grant_failed" };
  }

  await client
    .from("payment_claims")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminUserId,
      decision_note: decisionNote?.trim() || null,
      payment_id: result.paymentId,
    })
    .eq("id", claimId)
    .eq("status", "pending");

  return {
    ok: true,
    status: "approved",
    duplicate: result.duplicate,
    proUntil: result.proUntil,
    receipt: result.paymentId
      ? {
          reference: receiptReference(result.paymentId),
          amount: claim.amount,
          currency: claim.currency,
          paidAt: result.paidAt ?? new Date().toISOString(),
          proUntil: result.proUntil,
          days: result.days,
          tier: claim.tier as PaidTier,
        }
      : null,
  };
}

/**
 * Refuse a claim.
 *
 * A reason is required by the interface rather than by this function, because
 * "refused" with no explanation is what makes somebody who really did pay
 * give up on the site instead of correcting a mistyped reference.
 */
export async function rejectClaim(
  claimId: string,
  adminUserId: string,
  decisionNote?: string,
): Promise<DecisionResult> {
  const client = requireAdminClient();
  const { data, error } = await client
    .from("payment_claims")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminUserId,
      decision_note: decisionNote?.trim() || null,
    })
    .eq("id", claimId)
    .eq("status", "pending")
    .select("id");

  if (error) return { ok: false, reason: "grant_failed" };
  if (!data || data.length === 0) return { ok: false, reason: "not_pending" };
  return { ok: true, status: "rejected" };
}

type Row = {
  id: string;
  user_id: string;
  tier: string;
  days: number;
  amount: number;
  currency: string;
  operator: string | null;
  phone: string | null;
  transaction_id: string;
  status: string;
  note: string | null;
  decision_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

function toClaim(row: Row, email: string): Claim {
  return {
    id: row.id,
    userId: row.user_id,
    email,
    tier: row.tier === "max" ? "max" : "pro",
    days: row.days,
    amount: row.amount,
    currency: row.currency,
    operator: row.operator,
    phone: row.phone,
    transactionId: row.transaction_id,
    status:
      row.status === "approved" ? "approved" : row.status === "rejected" ? "rejected" : "pending",
    note: row.note,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}
