/**
 * What each plan actually gives you.
 *
 * Every number in this file is enforced somewhere real: the daily allowance in
 * `usage/server.ts`, the batch size in the upload zone AND on the server that
 * counts operations, the file size in the tool workbench. Nothing here is
 * decoration for the pricing page — if a limit appears in this table it is
 * because code reads it, and if code stops reading it the limit must come out
 * of the table too. A pricing page that promises a limit nobody enforces is a
 * lie that takes money.
 *
 * The tier is separate from the TERM (monthly / quarterly / yearly, in
 * plans.ts). A customer buys a tier for a length of time; those are two
 * different questions and conflating them is how "3 months of Max" becomes
 * unrepresentable.
 */

export type TierId = "free" | "pro" | "max";

export const TIER_IDS: TierId[] = ["free", "pro", "max"];

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
};

export function tierOf(value: string | null | undefined): TierId {
  // Anything unrecognised is free. A corrupt or unexpected value in the
  // database must not accidentally grant a paid plan.
  return value === "pro" || value === "max" ? value : "free";
}

export function tierPriceXaf(monthlyXaf: number, tier: TierId): number {
  const multiplier = TIERS[tier].priceMultiplier;
  if (multiplier === 0) return 0;
  // To the nearest 500 FCFA, because a price of 4,833 is a price nobody can
  // pay in cash and nobody trusts.
  return Math.round((monthlyXaf * multiplier) / 500) * 500;
}

export function tierName(tier: TierId, fr: boolean): string {
  if (tier === "max") return "Max";
  if (tier === "pro") return "Pro";
  return fr ? "Gratuit" : "Free";
}

/** True when `have` is at least as good as `need`. */
export function tierAtLeast(have: TierId, need: TierId): boolean {
  return TIER_IDS.indexOf(have) >= TIER_IDS.indexOf(need);
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
  return Math.round(toolMaxBytes * TIERS[tier].fileSizeMultiplier);
}
