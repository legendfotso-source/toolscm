/**
 * Deployment-level constants. Everything here can be overridden with an
 * environment variable so the same build works on a preview URL, a staging
 * domain and the real one.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://tools.cm")
).replace(/\/$/, "");

export const SITE_NAME = "Tools.cm";

export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "contact@tools.cm";

/** Google AdSense client id. Absent means no ad markup is rendered at all. */
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";

export const PRICE_XAF = 2000;
export const PRICE_USD = 5;

/**
 * Mobile Money, taken by hand.
 *
 * Before any payment provider is wired up, this is how money actually changes
 * hands here: the customer sends the amount to an MTN or Orange number and
 * forwards the confirmation, and an admin activates Pro from /admin against
 * the transaction id. It is slower than an API and completely real — nothing
 * is granted until the money has arrived.
 *
 * While MOMO_NUMBER is empty, none of this is shown: the paywall says plainly
 * that payment is not available yet rather than pointing at an empty number.
 */
export const MOMO_NUMBER = process.env.NEXT_PUBLIC_MOMO_NUMBER ?? "";
export const MOMO_NAME = process.env.NEXT_PUBLIC_MOMO_NAME ?? "";
/** Digits only, international format, for the wa.me link. */
export const MOMO_WHATSAPP = (process.env.NEXT_PUBLIC_MOMO_WHATSAPP ?? "").replace(/\D/g, "");

export function isManualPaymentAvailable(): boolean {
  return MOMO_NUMBER.trim().length > 0;
}

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
