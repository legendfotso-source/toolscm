import "server-only";

import { verifyStripeSignature } from "../signatures";

/**
 * Stripe — cards, for customers outside the Mobile Money world.
 *
 * Called over plain HTTPS rather than through the `stripe` npm package. That
 * package is large, and this app uses exactly three endpoints; pulling in a
 * dependency for that would add weight to a project whose whole point is being
 * light.
 *
 * Inert without keys, and gated again by `payments_enabled` in /admin.
 */

const BASE = "https://api.stripe.com/v1";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function secretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key) throw new Error("Stripe is not configured");
  return key;
}

/** Stripe takes form-encoded bodies, including for nested fields. */
function formEncode(fields: Record<string, string | number>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

/**
 * Create a Checkout session and return the page to send the customer to.
 *
 * `client_reference_id` carries OUR reference — the same one already stored
 * against the user as a pending payment — so the webhook can be matched to an
 * account without trusting anything in the return URL.
 */
export async function createCheckoutSession(input: {
  amount: number;
  currency: string;
  email: string;
  reference: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  const response = await fetch(`${BASE}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // Stripe deduplicates on this, so a customer double-tapping "Pay" gets
      // one session rather than two.
      "Idempotency-Key": input.reference,
    },
    body: formEncode({
      mode: "payment",
      "line_items[0][quantity]": 1,
      "line_items[0][price_data][currency]": input.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": input.amount,
      "line_items[0][price_data][product_data][name]": input.description,
      customer_email: input.email,
      client_reference_id: input.reference,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as {
    url?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok || !payload?.url) {
    throw new Error(
      `Stripe refused the session (${response.status}): ${payload?.error?.message ?? "no url"}`,
    );
  }

  return { url: payload.url };
}

/**
 * Verify a Stripe webhook signature.
 *
 * The mechanics — including the timestamp check that stops a captured
 * signature being replayed forever — live in ../signatures.ts so they can be
 * tested directly. This only supplies the secret.
 */
export function verifyWebhook(rawBody: string, header: string | null): boolean {
  return verifyStripeSignature(rawBody, header, process.env.STRIPE_WEBHOOK_SECRET ?? "");
}

/** Ask Stripe directly whether a session was paid. */
export async function retrieveSession(
  sessionId: string,
): Promise<{ paid: boolean; reference: string | null; amount: number | null; currency: string | null }> {
  const response = await fetch(`${BASE}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as {
    payment_status?: string;
    client_reference_id?: string;
    amount_total?: number;
    currency?: string;
  } | null;

  if (!response.ok || !payload) {
    return { paid: false, reference: null, amount: null, currency: null };
  }

  return {
    paid: payload.payment_status === "paid",
    reference: payload.client_reference_id ?? null,
    amount: typeof payload.amount_total === "number" ? payload.amount_total : null,
    currency: payload.currency ?? null,
  };
}
