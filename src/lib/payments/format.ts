/**
 * Prices as a customer reads them.
 *
 * One place, so "2 000 FCFA" on the pricing card and "2 000 FCFA" on the
 * checkout button cannot drift into two spellings of two numbers.
 */

export function formatXaf(amount: number, fr: boolean): string {
  // Every space is a no-break space, so "2 000 FCFA" never breaks across two
  // lines on a narrow card. fr-FR's own separator is the NARROW no-break
  // space, which some Android fonts draw as a box; the ordinary no-break
  // space looks the same and renders everywhere.
  const digits = amount.toLocaleString(fr ? "fr-FR" : "en-GB").replace(/\u202f/g, "\u00a0");
  return `${digits}\u00a0FCFA`;
}

export function formatUsd(cents: number, fr: boolean): string {
  const whole = cents % 100 === 0;
  const value = (cents / 100).toFixed(whole ? 0 : 2);
  // French writes 12,50 $; English writes $12.50.
  return fr ? `${value.replace(".", ",")} $` : `$${value}`;
}
