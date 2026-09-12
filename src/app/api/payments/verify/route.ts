import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server-client";
import { settlePayment } from "@/lib/payments/core";
import { receiptReference } from "@/lib/payments/receipt";
import { requireAdminClient } from "@/lib/supabase/admin";
import { verifyPayment } from "@/lib/payments/providers/notchpay";
import { verifyPayment as verifyCampayPayment } from "@/lib/payments/providers/campay";

export const dynamic = "force-dynamic";

const Body = z.object({
  provider: z.enum(["notchpay", "campay", "stripe"]),
  reference: z.string().trim().min(6).max(120),
});

/**
 * The customer has come back from the payment page. Did they actually pay?
 *
 * This exists because webhooks are not instant and phones on 3G lose
 * connections: a customer who has genuinely paid should not be told "not yet"
 * and left to wonder. So the return page asks here, and here we ask the
 * provider.
 *
 * What this route deliberately does NOT do is believe the browser. The request
 * carries a reference, not a verdict — `?status=success` in the return URL is
 * something anyone can type, and it is never read. The reference is checked
 * against the signed-in user before anything is granted, so one customer
 * cannot settle another customer's payment by guessing a reference.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { provider, reference } = parsed.data;
  const client = requireAdminClient();

  const { data } = await client
    .from("payments")
    .select("id, user_id, status, amount, currency, created_at, raw")
    .eq("provider", provider)
    .eq("transaction_id", reference)
    .maybeSingle();

  const row = data as {
    id: string;
    user_id: string | null;
    status: string;
    amount: number;
    currency: string;
    created_at: string;
    raw: { days?: number; providerRef?: string } | null;
  } | null;

  // Unknown, or somebody else's. Same answer either way: a probing customer
  // learns nothing about references that are not theirs.
  if (!row || row.user_id !== user.id) {
    return NextResponse.json({ status: "unknown" }, { status: 404 });
  }

  const receiptFor = (paidAt: string, proUntil: string | null, days: number) => ({
    reference: receiptReference(row.id),
    email: user.email ?? "",
    amount: row.amount,
    currency: row.currency,
    paidAt,
    proUntil,
    days,
  });

  if (row.status === "succeeded") {
    const { data: sub } = await client
      .from("subscriptions")
      .select("end_date")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("end_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      status: "paid",
      receipt: receiptFor(
        row.created_at,
        (sub as { end_date: string | null } | null)?.end_date ?? null,
        row.raw?.days ?? 30,
      ),
    });
  }

  // Still pending on our side — ask the provider. Stripe's own return is
  // handled by its webhook; only NotchPay is polled here, because its
  // Mobile Money confirmations can take a minute and the customer is watching
  // the screen the whole time.
  if (provider === "campay") {
    // CamPay's status endpoint takes THEIR reference, stored when the payment
    // link was created. Without it there is nothing to ask about.
    const providerRef = row.raw?.providerRef;
    if (!providerRef) return NextResponse.json({ status: "pending" });

    const verified = await verifyCampayPayment(providerRef);
    if (!verified.paid) {
      return NextResponse.json({ status: "pending", providerStatus: verified.status });
    }

    const result = await settlePayment({
      provider,
      reference,
      amount: verified.amount,
      currency: verified.currency,
      raw: { verifiedOnReturn: true, providerRef },
    });

    if (result.outcome === "granted") {
      return NextResponse.json({
        status: "paid",
        receipt: receiptFor(result.paidAt, result.proUntil, result.days),
      });
    }
    return NextResponse.json({ status: "paid", receipt: null });
  }

  if (provider === "notchpay") {
    const verified = await verifyPayment(reference);
    if (!verified.paid) {
      return NextResponse.json({ status: "pending", providerStatus: verified.status });
    }

    const result = await settlePayment({
      provider,
      reference,
      amount: verified.amount,
      currency: verified.currency,
      raw: { verifiedOnReturn: true },
    });

    if (result.outcome === "granted") {
      return NextResponse.json({
        status: "paid",
        receipt: receiptFor(result.paidAt, result.proUntil, result.days),
      });
    }
    // The webhook beat us to it, which is the happy path.
    return NextResponse.json({ status: "paid", receipt: null });
  }

  return NextResponse.json({ status: "pending" });
}
