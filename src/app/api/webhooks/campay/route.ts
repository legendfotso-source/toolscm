import { NextResponse } from "next/server";

import { hit, requesterKey, sweepOldHits } from "@/lib/rate-limit";
import { settlePayment } from "@/lib/payments/core";
import { verifyPayment } from "@/lib/payments/providers/campay";

export const dynamic = "force-dynamic";

/**
 * CamPay says something happened.
 *
 * READ THIS BEFORE CHANGING IT. Unlike the NotchPay and Stripe handlers, this
 * one does not verify a signature — CamPay does not publish a webhook signing
 * scheme, and inventing one would be worse than having none: a signature check
 * that is subtly wrong feels safe while protecting nothing.
 *
 * So this endpoint grants nothing on the strength of what it receives. The
 * notification is treated as a nudge meaning "go and look". The answer comes
 * from an authenticated call to CamPay's own status endpoint, and only
 * `SUCCESSFUL` there grants anything.
 *
 * That makes a forged POST useless rather than dangerous: the worst an
 * attacker achieves is making this server ask CamPay about a payment, and
 * CamPay says PENDING or FAILED, and nobody gets a subscription. The one real
 * cost is an extra HTTP request per notification, which is a fair price for
 * not guessing at cryptography.
 */
export async function POST(request: Request) {
  // Before anything, and before any outbound call.
  //
  // This endpoint has no signature, deliberately: forging one grants nothing,
  // because the handler re-asks CamPay before settling. What that reasoning
  // missed is volume — every POST here makes the server fetch a token and then
  // a status from CamPay, so an unlimited endpoint is an amplifier pointed at
  // the CamPay quota and the function budget. The ceiling is generous enough
  // that a real burst of notifications passes and tight enough that a loop
  // does not.
  const verdict = await hit({
    bucket: "webhook:campay",
    key: await requesterKey(request.headers),
    max: 120,
    windowSeconds: 60,
  });
  void sweepOldHits();
  if (!verdict.allowed) {
    // 429 with no body. CamPay retries on a 5xx, which is right for a real
    // failure and wrong here: this request was not a failure, it was one too
    // many, and inviting a retry would make the burst worse.
    return new NextResponse(null, { status: 429 });
  }

  let event: {
    reference?: string;
    external_reference?: string;
    status?: string;
  };

  try {
    const raw = await request.text();
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // CamPay's own reference is what the status endpoint takes.
  const providerRef = event.reference;
  if (!providerRef) {
    return NextResponse.json({ ok: true, ignored: "no_reference" });
  }

  const verified = await verifyPayment(providerRef);

  if (!verified.paid) {
    // Normal: notifications arrive for pending and failed payments too.
    // 200 so CamPay does not retry something that will never change.
    return NextResponse.json({ ok: true, ignored: verified.status });
  }

  // Our reference comes back from CamPay, not from the request body — so a
  // forged notification cannot point a real payment at somebody else's
  // account.
  const reference = verified.externalReference;
  if (!reference) {
    console.warn("[Tools.cm] campay payment", providerRef, "carried no external reference");
    return NextResponse.json({ ok: true, ignored: "no_external_reference" });
  }

  try {
    const result = await settlePayment({
      provider: "campay",
      reference,
      amount: verified.amount,
      currency: verified.currency,
      raw: { providerRef, status: verified.status },
    });
    return NextResponse.json({ ok: true, outcome: result.outcome });
  } catch (error) {
    console.error("[Tools.cm] campay settlement failed:", error);
    // Worth retrying: the money arrived and the customer has nothing yet.
    return NextResponse.json({ error: "settlement_failed" }, { status: 500 });
  }
}
