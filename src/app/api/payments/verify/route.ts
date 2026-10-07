import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server-client";
import { markPaymentFailed, settlePayment } from "@/lib/payments/core";
import { hit } from "@/lib/rate-limit";
import { receiptReference } from "@/lib/payments/receipt";
import { requireAdminClient } from "@/lib/supabase/admin";
import { verifyPayment } from "@/lib/payments/providers/notchpay";
import { retrieveSession } from "@/lib/payments/providers/stripe";
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
/**
 * Has the provider given a final no?
 *
 * Deliberately a short allow-list of words that MEAN refused, rather than
 * "anything that is not success". A status nobody anticipated — a new one, a
 * typo, an empty string from a timeout — must keep the payment pending and
 * keep polling, because writing off a payment that is merely slow is the one
 * mistake here that costs a customer money they already spent.
 */
function isTerminalFailure(status: string | null | undefined): boolean {
  const value = String(status ?? "").trim().toLowerCase();
  return ["failed", "failure", "cancelled", "canceled", "expired", "rejected", "declined"].includes(
    value,
  );
}

export async function POST(request: Request) {
  // Per ACCOUNT, not per address. This endpoint is signed in, and the person
  // it has to be paced against is the one holding the session — two customers
  // behind one Cameroonian mobile network share an address far more often
  // than they share an account, and limiting by address would make one
  // customer's polling refuse another's.
  //
  // Generous: the return page legitimately polls eight times with backoff
  // while a Mobile Money confirmation lands, and a customer who reloads the
  // page starts that over.
  const caller = await currentUser();
  if (caller) {
    const verdict = await hit({
      bucket: "verify",
      key: caller.id,
      max: 60,
      windowSeconds: 300,
    });
    if (!verdict.allowed) {
      return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
    }
  }

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

  // Still pending on our side — ask the provider. Every provider is asked,
  // including Stripe.
  //
  // Stripe used to be excluded here, on the reasoning that its webhook handles
  // the return. That reasoning has one failure mode and it is the worst
  // available: if the webhook secret is unset, or the endpoint is
  // misconfigured, or Stripe's delivery fails, the customer is charged and
  // never upgraded — and nothing in the application ever notices, because the
  // return page was told to report "pending" and stop. The webhook is still
  // the fast path; this is the one that makes a missed webhook survivable.
  if (provider === "campay") {
    // CamPay's status endpoint takes THEIR reference, stored when the payment
    // link was created. Without it there is nothing to ask about.
    const providerRef = row.raw?.providerRef;
    if (!providerRef) return NextResponse.json({ status: "pending" });

    const verified = await verifyCampayPayment(providerRef);
    if (!verified.paid) {
      // A terminal refusal is recorded rather than polled for ever. The
      // customer is watching this screen: telling them "still waiting" about a
      // payment the operator has already declined wastes their next five
      // minutes and leaves a row that claims to be undecided.
      if (isTerminalFailure(verified.status)) {
        await markPaymentFailed({ provider, reference, reason: verified.status });
        return NextResponse.json({ status: "failed", providerStatus: verified.status });
      }
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
      if (isTerminalFailure(verified.status)) {
        await markPaymentFailed({ provider, reference, reason: verified.status });
        return NextResponse.json({ status: "failed", providerStatus: verified.status });
      }
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

  if (provider === "stripe") {
    // Stripe's own session id, stored at checkout. Payments created before
    // that was stored have none, and for those this is still a no-op — the
    // webhook remains their only route, which is no worse than before.
    const sessionId = row.raw?.providerRef;
    if (!sessionId) return NextResponse.json({ status: "pending" });

    const verified = await retrieveSession(String(sessionId));
    if (!verified.paid) return NextResponse.json({ status: "pending" });

    // The reference Stripe hands back must be the one we are verifying.
    // Without this check, a session id belonging to somebody else's payment
    // would settle THIS row — the row has already been proven to belong to the
    // caller, so the hole would be narrow, but it would be a hole.
    if (verified.reference && verified.reference !== reference) {
      console.error("[Tools.cm] a Stripe session pointed at a different reference");
      return NextResponse.json({ status: "pending" });
    }

    const result = await settlePayment({
      provider,
      reference,
      amount: verified.amount ?? undefined,
      currency: verified.currency ?? undefined,
      raw: { verifiedOnReturn: true, sessionId },
    });

    if (result.outcome === "granted") {
      return NextResponse.json({
        status: "paid",
        receipt: receiptFor(result.paidAt, result.proUntil, result.days),
      });
    }
    return NextResponse.json({ status: "paid", receipt: null });
  }

  return NextResponse.json({ status: "pending" });
}
