/**
 * Prices as a customer reads them.
 *
 * One place, so "2 000 FCFA" on the pricing card and "2 000 FCFA" on the
 * checkout button cannot drift into two spellings of two numbers.
 */

export function formatXaf(amount: number, fr: boolean): string {
  // fr-FR groups with a narrow no-break space; a plain space reads the same
  // and survives being copied into a WhatsApp message.
  const digits = amount.toLocaleString(fr ? "fr-FR" : "en-GB").replace(/\u202f|\u00a0/g, " ");
  return `${digits} FCFA`;
}

export function formatUsd(cents: number, fr: boolean): string {
  const whole = cents % 100 === 0;
  const value = (cents / 100).toFixed(whole ? 0 : 2);
  // French writes 12,50 $; English writes $12.50.
  return fr ? `${value.replace(".", ",")} $` : `$${value}`;
}
