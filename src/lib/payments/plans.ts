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
