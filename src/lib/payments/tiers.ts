/**
 * What each plan actually gives you.
 *
 * Every number in this file is read by real code: the daily allowance by
 * `usage/server.ts`, on the server; the batch size and the file size by the
 * tool workbench, in the browser. Nothing here is
 * decoration for the pricing page — if a limit appears in this table it is
 * because code reads it, and if code stops reading it the limit must come out
 * of the table too. A pricing page that promises a limit nobody enforces is a
 * lie that takes money.
 *
 * Where each limit is enforced matters, and is stated rather than blurred.
 * The daily allowance is decided by the server, which the browser cannot
 * argue with. The batch and file-size limits are applied in the browser,
 * because the files never reach the server — that is the privacy promise —
 * so there is nothing there to count. Someone who edits the page's JavaScript
 * can get round them on their own device. They are product limits, not
 * security boundaries, and nothing that costs us money depends on them.
 *
 * The tier is separate from the TERM (monthly / quarterly / yearly, in
 * plans.ts). A customer buys a tier for a length of time; those are two
 * different questions and conflating them is how "3 months of Max" becomes
 * unrepresentable.
 */

export type TierId = "free" | "pro" | "max" | "owner";

/** The tiers that can be bought and that the pricing page compares. */
export type PublicTier = "free" | "pro" | "max";

/**
 * The tiers on the pricing page, cheapest first.
 *
 * `owner` is deliberately absent, and everything that shows or sells a plan
 * reads THIS list rather than the table below. It is not a plan: it cannot be
 * bought, it has no price, and putting it here would add a fourth column to
 * the comparison table offering unlimited everything for nothing.
 */
export const TIER_IDS: PublicTier[] = ["free", "pro", "max"];

/** Every tier that exists, weakest first. For ranking, never for display. */
export const ALL_TIER_IDS: TierId[] = ["free", "pro", "max", "owner"];

/**
 * "No limit", as a number.
 *
 * Not `Infinity`: these values are compared, multiplied, passed to `slice`,
 * and some of them cross into the browser as JSON — where `Infinity` becomes
 * `null` and `null > 5` is false, so an unlimited account would end up with
 * the tightest limit of all. A very large integer survives all four.
 */
export const NO_LIMIT = Number.MAX_SAFE_INTEGER;

/** Where a tier sits in the order. Higher is better. */
export function tierRank(tier: TierId): number {
  const rank = ALL_TIER_IDS.indexOf(tier);
  // An unknown value ranks lowest rather than highest: a typo must not grant.
  return rank < 0 ? 0 : rank;
}

/** Is this tier one somebody can pay for? */
export function isPublicTier(tier: TierId): tier is PublicTier {
  return (TIER_IDS as TierId[]).includes(tier);
}

export type Tier = {
  id: TierId;
  /**
   * Price as a multiple of the monthly Pro price set in /admin.
   *
   * Derived rather than stored so that changing `price_xaf` moves both paid
   * tiers together and the gap between them stays where it was put.
   */
  priceMultiplier: number;
  /** Operations per day. -1 means no daily cap. */
  dailyOperations: number;
  /** Files accepted in one go by a tool that takes several. */
  batchFiles: number;
  /**
   * How much bigger this tier's file limit is than the tool's own default.
   *
   * Multiplied rather than replaced: a 25 MB ceiling makes sense for a PDF
   * merge and not for a passport photo, and the per-tool number already
   * encodes that difference. Doubling it keeps the relationship.
   */
  fileSizeMultiplier: number;
  /** May download a whole batch as one ZIP. */
  zipDownload: boolean;
};

export const TIERS: Record<TierId, Tier> = {
  free: {
    id: "free",
    priceMultiplier: 0,
    dailyOperations: 3,
    // Three, not one. Free users can already merge several PDFs today, and
    // taking that away to sell it back would make merge-PDF — one of the most
    // used tools on the site — useless on the plan most people are on.
    batchFiles: 3,
    fileSizeMultiplier: 1,
    zipDownload: false,
  },
  pro: {
    id: "pro",
    priceMultiplier: 1,
    dailyOperations: -1,
    batchFiles: 10,
    fileSizeMultiplier: 2,
    zipDownload: true,
  },
  max: {
    id: "max",
    priceMultiplier: 2.5,
    dailyOperations: -1,
    batchFiles: 50,
    fileSizeMultiplier: 4,
    zipDownload: true,
  },
  /**
   * The owner's own account. Nothing is capped.
   *
   * Not a plan and not for sale: it is granted by `profiles.is_unlimited`, a
   * column only the service role can write, and it can never be reached
   * through a payment — `tierOf()` below will not return it whatever a
   * subscription row says, and `TIER_IDS` leaves it off the pricing page.
   *
   * Fortune runs this site and tests every tool on it; being stopped by his
   * own daily allowance while checking whether compression works on a
   * 400 MB PDF is not a limit that protects anything.
   */
  owner: {
    id: "owner",
    priceMultiplier: 0,
    dailyOperations: -1,
    batchFiles: NO_LIMIT,
    fileSizeMultiplier: NO_LIMIT,
    zipDownload: true,
  },
};

/**
 * Read a tier out of the database.
 *
 * Anything unrecognised is free: a corrupt or unexpected value must not
 * accidentally grant a paid plan. `owner` is unrecognised ON PURPOSE — it is
 * granted by a profile flag, so a subscription row saying "owner", however it
 * got there, buys nothing.
 */
export function tierOf(value: string | null | undefined): TierId {
  return value === "pro" || value === "max" ? value : "free";
}

export function tierPriceXaf(monthlyXaf: number, tier: TierId): number {
  const multiplier = TIERS[tier].priceMultiplier;
  if (multiplier === 0) return 0;
  // Pro IS the admin's price. Rounding it would quietly change a price
  // somebody typed on purpose.
  if (multiplier === 1) return monthlyXaf;
  // To the nearest 500 FCFA, because a price of 4,833 is a price nobody can
  // pay in cash and nobody trusts.
  return Math.round((monthlyXaf * multiplier) / 500) * 500;
}

/** The same, for the card price, in US cents — to the nearest 50 cents. */
export function tierPriceUsdCents(monthlyUsdCents: number, tier: TierId): number {
  const multiplier = TIERS[tier].priceMultiplier;
  if (multiplier === 0) return 0;
  if (multiplier === 1) return monthlyUsdCents;
  return Math.round((monthlyUsdCents * multiplier) / 50) * 50;
}

export function tierName(tier: TierId, fr: boolean): string {
  if (tier === "owner") return fr ? "Illimité" : "Unlimited";
  if (tier === "max") return "Max";
  if (tier === "pro") return "Pro";
  return fr ? "Gratuit" : "Free";
}

/** True when `have` is at least as good as `need`. */
export function tierAtLeast(have: TierId, need: TierId): boolean {
  return tierRank(have) >= tierRank(need);
}

/**
 * The size ceiling to SHOW on the upload box, or null when there is none.
 *
 * Separate from `fileSizeLimit` because what is enforced and what is drawn had
 * drifted apart, in the direction that costs a customer the thing they paid
 * for: the upload box printed the tool's own figure — "PDF jusqu'à 50,0 Mo" —
 * to everybody, including a Max subscriber whose real ceiling was 200 MB and
 * the owner, who has none. Nobody tries a 120 MB file when the page has just
 * told them the limit is 50.
 *
 * Reported by Fortune on 1 October 2026, signed in on his own site.
 */
export function displayedFileSizeLimit(tier: TierId, toolMaxBytes: number): number | null {
  const limit = fileSizeLimit(tier, toolMaxBytes);
  return limit >= NO_LIMIT ? null : limit;
}

/**
 * Is there anything left to sell this person?
 *
 * The "Devenir Pro" button in the header was shown to everyone, which is an
 * advert pointed at the people who have already paid — and at the owner.
 */
export function canUpgrade(tier: TierId): boolean {
  return tier === "free";
}

/** How many files at a time, in words — because NO_LIMIT is not a number to show. */
export function batchLabel(tier: TierId, fr: boolean): string {
  const files = TIERS[tier].batchFiles;
  if (files >= NO_LIMIT) return fr ? "autant que vous voulez" : "as many as you like";
  return fr ? `jusqu'à ${files}` : `up to ${files}`;
}

/**
 * How many files this tier may hand a tool at once.
 *
 * Capped by the tool's own appetite as well: a tier allowing 50 files does not
 * make a single-file tool take 50.
 */
export function batchLimit(tier: TierId, toolTakesMultiple: boolean): number {
  return toolTakesMultiple ? TIERS[tier].batchFiles : 1;
}

/** The size ceiling for one file, in bytes, for this tier and this tool. */
export function fileSizeLimit(tier: TierId, toolMaxBytes: number): number {
  const multiplier = TIERS[tier].fileSizeMultiplier;
  // Multiplying by NO_LIMIT would overflow into Infinity, which does not
  // survive a trip through JSON. Return the sentinel itself instead: every
  // real file is smaller than it, and it is still a number.
  if (multiplier >= NO_LIMIT) return NO_LIMIT;
  return Math.round(toolMaxBytes * multiplier);
}
