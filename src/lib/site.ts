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

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
