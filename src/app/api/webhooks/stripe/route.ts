import { NextResponse } from "next/server";
import { settlePayment } from "@/lib/payments/core";
import { retrieveSession, verifyWebhook } from "@/lib/payments/providers/stripe";

export const dynamic = "force-dynamic";

/**
 * Stripe tells us a Checkout session completed.
 *
 * Same shape as the NotchPay handler and for the same reasons: verify the
 * signature against the raw body, then ask Stripe itself rather than believing
 * the payload. The signature here also carries a timestamp, and the verifier
 * rejects anything older than five minutes — without that, one captured
 * signature could be replayed to grant Pro indefinitely.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!verifyWebhook(raw, signature)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { object?: { id?: string; client_reference_id?: string } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    // Stripe sends a great many event types. Acknowledging the rest keeps the
    // endpoint healthy in their dashboard.
    return NextResponse.json({ ok: true, ignored: event.type ?? "unknown" });
  }

  const sessionId = event.data?.object?.id;
  if (!sessionId) return NextResponse.json({ ok: true, ignored: "no_session" });

  const session = await retrieveSession(sessionId);
  if (!session.paid || !session.reference) {
    return NextResponse.json({ ok: true, ignored: "not_paid" });
  }

  try {
    const result = await settlePayment({
      provider: "stripe",
      reference: session.reference,
      amount: session.amount,
      currency: session.currency,
      raw: { sessionId },
    });
    return NextResponse.json({ ok: true, outcome: result.outcome });
  } catch (error) {
    console.error("[Tools.cm] stripe settlement failed:", error);
    return NextResponse.json({ error: "settlement_failed" }, { status: 500 });
  }
}
