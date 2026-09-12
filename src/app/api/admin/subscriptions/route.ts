import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin";
import { requireAdminClient } from "@/lib/supabase/admin";
import { TERM_DAYS, findUserIdByEmail, grantPro } from "@/lib/payments/core";

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
  /** The mobile-money transaction id from the SMS confirmation. */
  transactionId: z.string().trim().min(3).max(120),
  amount: z.number().int().min(0).max(10_000_000),
  currency: z.string().trim().length(3).toUpperCase(),
  days: z.number().int().min(1).max(3650).default(TERM_DAYS),
  note: z.string().trim().max(500).optional(),
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
      transactionId: parsed.data.transactionId,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      days: parsed.data.days,
      raw: { enteredBy: "admin", note: parsed.data.note ?? null, at: new Date().toISOString() },
    });

    return NextResponse.json({
      ok: true,
      action: "grant",
      duplicate: result.duplicate,
      proUntil: result.proUntil,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "grant_failed", detail: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
