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

function roundTo500(amount: number): number {
  return Math.round(amount / 500) * 500;
}

export function plans(monthlyXaf: number): Plan[] {
  return (Object.keys(MULTIPLIERS) as PlanId[]).map((id) => {
    const { months, pay } = MULTIPLIERS[id];
    const amountXaf = id === "monthly" ? monthlyXaf : roundTo500(monthlyXaf * pay);
    const full = monthlyXaf * months;

    return {
      id,
      days: TERM_DAYS * months,
      amountXaf,
      savingPercent: full > 0 ? Math.round((1 - amountXaf / full) * 100) : 0,
    };
  });
}

export function getPlan(monthlyXaf: number, id: PlanId): Plan {
  const found = plans(monthlyXaf).find((plan) => plan.id === id);
  // Callers pass a validated id, but falling back to monthly is safer than
  // throwing inside a payment path.
  return found ?? plans(monthlyXaf)[0];
}

export function planName(id: PlanId, fr: boolean): string {
  if (id === "quarterly") return fr ? "3 mois" : "3 months";
  if (id === "yearly") return fr ? "12 mois" : "12 months";
  return fr ? "1 mois" : "1 month";
}
