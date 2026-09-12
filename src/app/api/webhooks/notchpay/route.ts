import { NextResponse } from "next/server";
import { settlePayment } from "@/lib/payments/core";
import { verifyPayment, verifyWebhook } from "@/lib/payments/providers/notchpay";

export const dynamic = "force-dynamic";

/**
 * NotchPay tells us a payment happened.
 *
 * Two independent checks before anything is granted, because this endpoint is
 * public and a forged POST to it would be free Pro:
 *
 *   1. The signature. HMAC-SHA256 of the RAW body against the webhook hash.
 *      The raw text is read before any parsing — re-serialising the parsed
 *      JSON changes the bytes and the signature would never match.
 *   2. The provider's own answer. Even a correctly signed notification is only
 *      a hint; we call NotchPay back and ask what the transaction's status
 *      really is. A signing key that leaks is then still not enough to grant
 *      anything.
 *
 * Failures return 200 where the notification is genuinely not actionable, so
 * NotchPay stops retrying something that will never succeed, and non-200 only
 * where a retry might actually help.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-notch-signature");

  if (!verifyWebhook(raw, signature)) {
    // Either forged, or the webhook hash is not configured. Both mean we
    // cannot tell a real notification from an invented one.
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let event: { event?: string; data?: { reference?: string; merchant_reference?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // NotchPay quotes our own reference back. Prefer the merchant reference when
  // present, since that is unambiguously the one we issued.
  const reference = event.data?.merchant_reference ?? event.data?.reference;
  if (!reference) {
    return NextResponse.json({ ok: true, ignored: "no_reference" });
  }

  const verified = await verifyPayment(reference);
  if (!verified.paid) {
    // A `pending` or `failed` notification is normal and needs no action. Say
    // OK so it is not retried forever.
    return NextResponse.json({ ok: true, ignored: verified.status });
  }

  try {
    const result = await settlePayment({
      provider: "notchpay",
      reference,
      amount: verified.amount,
      currency: verified.currency,
      raw: event,
    });
    return NextResponse.json({ ok: true, outcome: result.outcome });
  } catch (error) {
    console.error("[Tools.cm] notchpay settlement failed:", error);
    // A database problem IS worth retrying — the money arrived and the
    // customer has nothing yet.
    return NextResponse.json({ error: "settlement_failed" }, { status: 500 });
  }
}
