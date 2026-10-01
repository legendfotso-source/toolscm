/**
 * What you can buy.
 *
 * Three lengths, one product. The longer plans are not upsells — they exist
 * because of a cost the customer bears that we do not see: every Mobile Money
 * transfer carries an operator fee, and a card payment carries a fixed
 * processor charge. Someone paying monthly pays that twelve times a year. A
 * quarterly plan is cheaper for them even at the same monthly rate, and it
 * means fewer manual activations for us.
 *
 * Prices are derived from the monthly price so that changing `price_xaf` in
 * /admin moves all three together, and the discount stays where it was put
 * rather than drifting out of proportion.
 */
import { TERM_DAYS } from "./term";
import { tierPriceUsdCents, tierPriceXaf, type TierId } from "./tiers";

export type PlanId = "monthly" | "quarterly" | "yearly";

export type Plan = {
  id: PlanId;
  days: number;
  /** Minor units, same convention as the payments table. XAF has none. */
  amountXaf: number;
  /**
   * The same plan in US cents, for card payments.
   *
   * Derived from the SAME multipliers as the FCFA price. It has to be: the
   * plan selector shows one discount badge, computed once, and a card customer
   * being charged full price while the button says −25% would be a promise the
   * checkout does not keep.
   */
  amountUsdCents: number;
  /** What the customer saves against paying monthly, as a percentage. */
  savingPercent: number;
};

/**
 * Multipliers, not prices.
 *
 *   quarterly: 3 months for the price of 2.5 → ~17% off
 *   yearly:   12 months for the price of 9   → 25% off
 *
 * Rounded to the nearest 500 FCFA, because a price of 4,833 FCFA is a price
 * nobody can pay in cash and nobody trusts.
 */
const MULTIPLIERS: Record<PlanId, { months: number; pay: number }> = {
  monthly: { months: 1, pay: 1 },
  quarterly: { months: 3, pay: 2.5 },
  yearly: { months: 12, pay: 9 },
};

function roundTo(amount: number, step: number): number {
  return Math.round(amount / step) * step;
}

/** The monthly card price, in US cents. */
const DEFAULT_MONTHLY_USD_CENTS = 500;

export function plans(
  monthlyXaf: number,
  monthlyUsdCents: number = DEFAULT_MONTHLY_USD_CENTS,
): Plan[] {
  return (Object.keys(MULTIPLIERS) as PlanId[]).map((id) => {
    const { months, pay } = MULTIPLIERS[id];

    // FCFA to the nearest 500, dollars to the nearest 50 cents — both so the
    // price is one a person can say out loud.
    const amountXaf = id === "monthly" ? monthlyXaf : roundTo(monthlyXaf * pay, 500);
    const amountUsdCents =
      id === "monthly" ? monthlyUsdCents : roundTo(monthlyUsdCents * pay, 50);

    const full = monthlyXaf * months;

    return {
      id,
      days: TERM_DAYS * months,
      amountXaf,
      amountUsdCents,
      savingPercent: full > 0 ? Math.round((1 - amountXaf / full) * 100) : 0,
    };
  });
}

export function getPlan(
  monthlyXaf: number,
  id: PlanId,
  monthlyUsdCents?: number,
): Plan {
  const all = plans(monthlyXaf, monthlyUsdCents);
  // Callers pass a validated id, but falling back to monthly is safer than
  // throwing inside a payment path.
  return all.find((plan) => plan.id === id) ?? all[0];
}

export function planName(id: PlanId, fr: boolean): string {
  if (id === "quarterly") return fr ? "3 mois" : "3 months";
  if (id === "yearly") return fr ? "12 mois" : "12 months";
  return fr ? "1 mois" : "1 month";
}

/**
 * A tier somebody can actually buy.
 *
 * `owner` is excluded as well as `free`: it is granted, not sold, so it has
 * no price, no plan length and no checkout. Written as an exclusion rather
 * than a fresh union so that a fifth tier added to `TierId` has to be
 * classified here before anything compiles.
 */
export type PaidTier = Exclude<TierId, "free" | "owner">;

/**
 * Every plan length for one tier, priced from the admin settings.
 *
 * The ONE function that turns settings into a price. The pricing page, the
 * checkout buttons, the Mobile Money instructions and the checkout API all
 * call it, so the number a customer reads is the number they are charged —
 * by construction, not by keeping several calculations in step. They were
 * once computed separately, and choosing Max showed Pro prices while the
 * server charged Max ones.
 *
 * The tier multiplier is applied to the monthly price first and the term
 * discount second, so Max quarterly is discounted off the Max price.
 */
export function plansForTier(
  settings: { price_xaf: number; price_usd: number },
  tier: PaidTier,
): Plan[] {
  return plans(
    tierPriceXaf(settings.price_xaf, tier),
    tierPriceUsdCents(Math.round(settings.price_usd * 100), tier),
  );
}

export function planForTier(
  settings: { price_xaf: number; price_usd: number },
  tier: PaidTier,
  id: PlanId,
): Plan {
  const all = plansForTier(settings, tier);
  return all.find((plan) => plan.id === id) ?? all[0];
}

/** Both paid tiers at once, for the pages that show them side by side. */
export function pricesByTier(settings: { price_xaf: number; price_usd: number }): Record<PaidTier, Plan[]> {
  return { pro: plansForTier(settings, "pro"), max: plansForTier(settings, "max") };
}
