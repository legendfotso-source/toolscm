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

  /**
   * The documented shape is:
   *
   *   { id: "evt_...", type: "payment.complete", created_at, data: {
   *       id: "pay_...",        // NotchPay's own id
   *       reference: "tcm_...", // OUR reference, echoed back
   *       amount, currency, status, customer, created_at, completed_at } }
   *
   * `data.reference` is the merchant reference — the one we issued. `data.id`
   * is theirs.
   */
  let event: {
    type?: string;
    data?: { reference?: string; merchant_reference?: string; id?: string };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Read the merchant reference from either spelling. Being tolerant here
  // costs nothing and is worth it: if the field were ever named differently
  // than documented, a payment would silently never be granted and the
  // customer would be out of pocket with no error anywhere.
  const reference = event.data?.reference ?? event.data?.merchant_reference;
  if (!reference) {
    // Deliberately 200: a notification we cannot act on will never become
    // actionable, so there is nothing for NotchPay to retry.
    console.warn("[Tools.cm] notchpay webhook carried no reference:", event.type);
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
