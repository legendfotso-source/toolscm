import "server-only";

import { verifyNotchpaySignature } from "../signatures";

/**
 * NotchPay — Mobile Money and cards for Cameroon.
 *
 * Written against the published API (https://developer.notchpay.co):
 *
 *   POST https://api.notchpay.co/payments          initialise, returns authorization_url
 *   GET  https://api.notchpay.co/payments/{ref}    verify, returns transaction.status
 *   Header: Authorization: <public key>            (the private key goes in
 *                                                   X-Grant, and is only needed
 *                                                   for transfers and balances,
 *                                                   which this app never does)
 *   Webhook: x-notch-signature, HMAC-SHA256 of the RAW body, keyed on the
 *            webhook hash from the Business suite.
 *
 * Everything here is inert without keys, and `payments_enabled` in /admin is a
 * second switch on top of that. Nothing has been exercised against a live
 * NotchPay account yet — see README. The parts that decide whether money was
 * really received are deliberately strict: an unknown status is treated as
 * "not paid", never as "probably fine".
 */

const BASE = process.env.NOTCHPAY_BASE_URL ?? "https://api.notchpay.co";

export function notchpayConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_NOTCHPAY_PUBLIC_KEY);
}

function publicKey(): string {
  const key = process.env.NEXT_PUBLIC_NOTCHPAY_PUBLIC_KEY ?? "";
  if (!key) throw new Error("NotchPay is not configured");
  return key;
}

export type InitialisedPayment = {
  authorizationUrl: string;
  /** What NotchPay will quote back to us in the webhook. */
  reference: string;
};

/**
 * Start a payment and get the page to send the customer to.
 *
 * `reference` is ours, not theirs: we generate it, we store it against the
 * user before the customer ever leaves the site, and it is how the webhook is
 * matched back to an account. Letting the provider allocate the identifier
 * would mean trusting whatever came back in the callback URL.
 */
export async function initialisePayment(input: {
  amount: number;
  currency: string;
  email: string;
  reference: string;
  description: string;
  callbackUrl: string;
}): Promise<InitialisedPayment> {
  const response = await fetch(`${BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: publicKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency,
      email: input.email,
      reference: input.reference,
      description: input.description,
      callback: input.callbackUrl,
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as {
    authorization_url?: string;
    transaction?: { reference?: string };
    message?: string;
  } | null;

  if (!response.ok || !payload?.authorization_url) {
    throw new Error(
      `NotchPay refused the payment (${response.status}): ${payload?.message ?? "no authorization_url"}`,
    );
  }

  return {
    authorizationUrl: payload.authorization_url,
    reference: payload.transaction?.reference ?? input.reference,
  };
}

/** The only status that means the money actually arrived. */
const SETTLED = "complete";

export type VerifiedPayment = {
  paid: boolean;
  status: string;
  amount: number | null;
  currency: string | null;
};

/**
 * Ask NotchPay directly whether a payment succeeded.
 *
 * This is the only source of truth about a provider payment. The browser
 * arriving back at /payment/return with `status=success` in the query string
 * proves nothing — anyone can type that URL — so the return page calls this,
 * and so does the webhook handler.
 */
export async function verifyPayment(reference: string): Promise<VerifiedPayment> {
  const response = await fetch(`${BASE}/payments/${encodeURIComponent(reference)}`, {
    headers: { Authorization: publicKey() },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as {
    transaction?: { status?: string; amount?: number; currency?: string };
  } | null;

  if (!response.ok || !payload?.transaction) {
    return { paid: false, status: `unreachable_${response.status}`, amount: null, currency: null };
  }

  const status = String(payload.transaction.status ?? "unknown");

  return {
    // Strict equality against the one settled status. `pending`, `processing`,
    // `failed`, `canceled`, `expired` and anything new they add later all mean
    // "do not grant".
    paid: status === SETTLED,
    status,
    amount: typeof payload.transaction.amount === "number" ? payload.transaction.amount : null,
    currency: payload.transaction.currency ?? null,
  };
}

/**
 * Is this webhook really from NotchPay?
 *
 * The mechanics live in ../signatures.ts so they can be tested without a
 * running server; this only supplies the secret. No secret configured means
 * every notification is rejected — failing open here would let anyone grant
 * themselves Pro with a single POST.
 */
export function verifyWebhook(rawBody: string, signature: string | null): boolean {
  return verifyNotchpaySignature(rawBody, signature, process.env.NOTCHPAY_WEBHOOK_HASH ?? "");
}
