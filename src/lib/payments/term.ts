/**
 * How long a payment buys, and when it runs out.
 *
 * Pure date arithmetic, kept out of the server-only module so it can be tested
 * directly in Node. Getting this wrong charges real people real money for days
 * they do not receive, so it is tested rather than assumed.
 */

/** One month of Pro, the only term sold. */
export const TERM_DAYS = 30;

/**
 * Extend from whichever is later: now, or the current end date.
 *
 * Paying on the 20th while already covered until the 30th must give until the
 * 30th of next month, not thirty days from today — otherwise paying early
 * quietly costs the customer ten days. Everything is computed in UTC, because
 * the database stores UTC and "which day is it" must not depend on where the
 * server happens to run.
 */
export function nextEndDate(
  currentEnd: string | null,
  days: number,
  now: Date = new Date(),
): Date {
  const current = currentEnd ? new Date(currentEnd) : null;
  const stillRunning = current && !Number.isNaN(current.getTime()) && current > now;

  const base = stillRunning ? new Date(current) : new Date(now);
  base.setUTCDate(base.getUTCDate() + days);
  return base;
}
