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
 * hands here: the customer sends the amount to the MTN or Orange number below
 * and forwards the confirmation, and an admin activates Pro from /admin
 * against the transaction id. It is slower than an API and completely real —
 * nothing is granted until the money has arrived.
 *
 * Both operators are listed because customers do not all have both. Someone on
 * Orange sending to an MTN number pays a transfer fee on top of the 2,000
 * FCFA, and enough of them will simply give up instead.
 *
 * These are public by design: they are printed on the pricing page so people
 * can pay. Environment variables override them so a staging deployment can
 * point somewhere harmless.
 */
export type MomoAccount = {
  operator: "MTN" | "Orange";
  /** As a Cameroonian reads it out loud. */
  number: string;
  /** The name the sender will see confirming the transfer — reassurance that it is the right person. */
  name: string;
};

export const MOMO_ACCOUNTS: MomoAccount[] = [
  {
    operator: "MTN",
    number: process.env.NEXT_PUBLIC_MTN_NUMBER ?? "+237 652 11 64 11",
    name: process.env.NEXT_PUBLIC_MTN_NAME ?? "Gakam Sylvie",
  },
  {
    operator: "Orange",
    number: process.env.NEXT_PUBLIC_ORANGE_NUMBER ?? "+237 699 74 49 70",
    name: process.env.NEXT_PUBLIC_ORANGE_NAME ?? "Epse Simo Gakam Sylvie",
  },
].filter((account) => account.number.trim().length > 0) as MomoAccount[];

/**
 * The WhatsApp number customers send their proof of payment to, and that
 * receipts are sent from. Digits only, international format, for wa.me links.
 */
export const SUPPORT_WHATSAPP = (
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "237652116411"
).replace(/\D/g, "");

export function isManualPaymentAvailable(): boolean {
  return MOMO_ACCOUNTS.length > 0;
}

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
