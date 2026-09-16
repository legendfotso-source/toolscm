import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin";
import { requireAdminClient } from "@/lib/supabase/admin";
import { TERM_DAYS, findUserIdByEmail, grantPro } from "@/lib/payments/core";
import { receiptReference } from "@/lib/payments/receipt";

export const dynamic = "force-dynamic";

/**
 * Activate or end Pro by hand.
 *
 * This exists because in Cameroon the realistic first version of "taking money"
 * is not a payment API — it is someone sending 2,000 FCFA to an MTN or Orange
 * Money number and you confirming it. That flow needs no provider integration,
 * works today, and is honest: the money genuinely arrived before anything is
 * granted.
 *
 * It records a real payment row with provider 'manual' and the mobile-money
 * transaction id, so the admin revenue figure counts it and so there is a
 * reference to point at if the customer ever disputes. The unique index on
 * (provider, transaction_id) means entering the same transaction id twice
 * extends nothing — which is exactly what you want when you are not sure
 * whether you already processed a payment.
 */
const Grant = z.object({
  action: z.literal("grant"),
  email: z.string().email(),
  /**
   * The mobile-money transaction id from the SMS confirmation.
   *
   * Optional, because the admin screen also has a one-click "Activer Pro"
   * button next to each member and stopping to copy a transaction id is not
   * what "one click" means. When it is absent a reference is derived below
   * that is stable for that person for that day — see `dailyReference`.
   */
  transactionId: z.string().trim().min(3).max(120).optional(),
  amount: z.number().int().min(0).max(10_000_000),
  currency: z.string().trim().length(3).toUpperCase(),
  days: z.number().int().min(1).max(3650).default(TERM_DAYS),
  /** Which plan the admin is activating. Defaults to Pro. */
  tier: z.enum(["pro", "max"]).default("pro"),
  note: z.string().trim().max(500).optional(),
  /** The customer's WhatsApp number, so the receipt can be sent to them. */
  phone: z.string().trim().max(40).optional(),
});

const Revoke = z.object({
  action: z.literal("revoke"),
  email: z.string().email(),
  reason: z.string().trim().max(500).optional(),
});

const Body = z.discriminatedUnion("action", [Grant, Revoke]);

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    // 404, not 403: someone who is not an admin learns nothing about what
    // exists here.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", detail: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const userId = await findUserIdByEmail(parsed.data.email);
  if (!userId) {
    // A deliberate, useful message: the usual cause is that the customer paid
    // but has not created an account yet, and the admin needs to know that
    // rather than guess.
    return NextResponse.json({ error: "no_such_account" }, { status: 404 });
  }

  if (parsed.data.action === "revoke") {
    const client = requireAdminClient();
    const { error } = await client
      .from("subscriptions")
      .update({
        status: "cancelled",
        end_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("status", "active");

    if (error) return NextResponse.json({ error: "write_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, action: "revoke" });
  }

  try {
    const result = await grantPro({
      userId,
      provider: "manual",
      transactionId: parsed.data.transactionId ?? dailyReference(userId),
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      days: parsed.data.days,
      tier: parsed.data.tier,
      raw: {
        enteredBy: "admin",
        oneClick: !parsed.data.transactionId,
        note: parsed.data.note ?? null,
        phone: parsed.data.phone ?? null,
        at: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      ok: true,
      action: "grant",
      duplicate: result.duplicate,
      proUntil: result.proUntil,
      // Everything the receipt needs. Built here rather than in the browser so
      // the reference is derived from the real payment row, not from anything
      // the admin screen happened to have in state.
      receipt: result.paymentId
        ? {
            reference: receiptReference(result.paymentId),
            email: parsed.data.email,
            amount: parsed.data.amount,
            currency: parsed.data.currency,
            paidAt: result.paidAt ?? new Date().toISOString(),
            proUntil: result.proUntil,
            days: result.days,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "grant_failed", detail: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}

/**
 * A reference for an activation made without a transaction id.
 *
 * Deliberately NOT random. The unique index on (provider, transaction_id) is
 * what stops the same payment being granted twice, and a random reference
 * would throw that protection away: a double-tap on a phone would quietly
 * hand out two months instead of one.
 *
 * Keyed to the person and the day, so pressing the button twice this
 * afternoon extends nothing and reports `duplicate`, while a genuine second
 * payment from the same customer next month goes through normally.
 */
function dailyReference(userId: string): string {
  return `admin-${new Date().toISOString().slice(0, 10)}-${userId.slice(0, 8)}`;
}
