import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhook signature verification.
 *
 * Kept in its own module, free of `server-only`, for one reason: this is the
 * code that stands between a stranger with curl and a free Pro subscription,
 * and it has to be testable directly rather than only through a running
 * server. Everything here is pure — raw bytes and a secret in, a boolean out.
 *
 * Both verifiers fail closed. A missing secret, a missing header, a malformed
 * header and a wrong signature all return false. There is no path through this
 * file that returns true without a matching HMAC.
 */

/** Constant-time compare of two hex strings, safe on length mismatch. */
function sameSignature(expected: string, given: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  // timingSafeEqual throws when the lengths differ, and the exception itself
  // would leak the expected length. Compare lengths first, in the clear —
  // the length of a hex digest is not a secret.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * NotchPay: `x-notch-signature` is HMAC-SHA256 of the raw body, hex, keyed on
 * the webhook hash.
 */
export function verifyNotchpaySignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return sameSignature(expected, signature.trim().toLowerCase());
}

/** Stripe's recommended tolerance for replayed notifications. */
export const STRIPE_TOLERANCE_SECONDS = 300;

/**
 * Stripe: `Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>]`.
 *
 * The signed payload is `${t}.${rawBody}` — the body alone will never match.
 * The timestamp is checked too: without that, one captured signature stays
 * valid forever and can be replayed to grant Pro over and over.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  now: number = Date.now(),
): boolean {
  if (!secret || !header) return false;

  let timestamp = "";
  const candidates: string[] = [];

  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "t") timestamp = value;
    // Stripe sends several v1 entries while a secret is being rotated.
    if (key === "v1" && value) candidates.push(value);
  }

  if (!timestamp || candidates.length === 0) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return false;

  const age = Math.abs(Math.floor(now / 1000) - sentAt);
  if (age > STRIPE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  return candidates.some((candidate) => sameSignature(expected, candidate));
}
