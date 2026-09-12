/**
 * Receipts.
 *
 * A customer who has just sent 2,000 FCFA to a phone number — not to a
 * company, to a person's Mobile Money account — has no proof of anything until
 * you give them some. The receipt is what turns that into a transaction they
 * can point at: what they paid, when, and exactly what day it runs until.
 *
 * Pure functions, no database and no server-only import, so both the admin
 * screen and the customer's own account page render the same text and the
 * whole thing can be tested directly.
 */

export type Receipt = {
  /** Short, human-readable, stable for a given payment. */
  reference: string;
  email: string;
  amount: number;
  currency: string;
  /** ISO timestamps. */
  paidAt: string;
  proUntil: string | null;
  days: number;
};

/**
 * Crockford base32: no I, L, O or U.
 *
 * Receipts get read aloud over the phone and copied by hand off a cracked
 * screen. Dropping the four characters that are mistaken for 1, 0 and V costs
 * nothing and removes most of the "is that an O or a zero" calls.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Derive the reference from the payment's own id.
 *
 * Deterministic on purpose: re-opening a payment must show the same reference,
 * so a customer quoting one from three weeks ago can still be found. Nothing
 * is stored — the reference IS the payment id, just shorter to say.
 */
export function receiptReference(paymentId: string): string {
  // Twelve hex characters is 48 bits, which is exactly representable as a
  // JavaScript number (the limit is 53). Deliberately not BigInt: the compile
  // target is ES2017 so that the bundle still runs on the older Android
  // Chrome this site is built for, and BigInt literals are not available
  // there.
  const hex = paymentId.replace(/[^0-9a-fA-F]/g, "").slice(0, 12);
  let value = hex ? Number.parseInt(hex, 16) : 0;
  if (!Number.isFinite(value)) value = 0;

  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out = ALPHABET[value % 32] + out;
    value = Math.floor(value / 32);
  }

  return `TCM-${out.slice(0, 4)}-${out.slice(4)}`;
}

function formatDate(iso: string, fr: boolean): string {
  return new Date(iso).toLocaleDateString(fr ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Douala",
  });
}

function formatDateTime(iso: string, fr: boolean): string {
  return new Date(iso).toLocaleString(fr ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    // The customer is in Douala. Showing them UTC would be showing them the
    // wrong time by an hour, on the one document meant to reassure them.
    timeZone: "Africa/Douala",
  });
}

/**
 * The message sent to the customer on WhatsApp.
 *
 * Written to be read on a phone: short lines, the dates up front, thanks at
 * the end rather than a paragraph of marketing before the facts.
 */
export function receiptMessage(receipt: Receipt, locale: "fr" | "en" = "fr"): string {
  const fr = locale === "fr";
  const amount = `${receipt.amount.toLocaleString(fr ? "fr-FR" : "en-GB")} ${receipt.currency}`;

  if (fr) {
    return [
      `*Tools.cm — Reçu de paiement*`,
      ``,
      `Référence : ${receipt.reference}`,
      `Compte : ${receipt.email}`,
      `Montant : ${amount}`,
      `Payé le : ${formatDateTime(receipt.paidAt, true)}`,
      `Durée : ${receipt.days} jours`,
      receipt.proUntil ? `Pro actif jusqu'au : ${formatDate(receipt.proUntil, true)}` : ``,
      ``,
      `Votre accès Pro est activé. Merci d'utiliser Tools.cm 🙏`,
      `Conservez cette référence : elle nous permet de retrouver votre paiement.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `*Tools.cm — Payment receipt*`,
    ``,
    `Reference: ${receipt.reference}`,
    `Account: ${receipt.email}`,
    `Amount: ${amount}`,
    `Paid on: ${formatDateTime(receipt.paidAt, false)}`,
    `Length: ${receipt.days} days`,
    receipt.proUntil ? `Pro active until: ${formatDate(receipt.proUntil, false)}` : ``,
    ``,
    `Your Pro access is on. Thank you for using Tools.cm 🙏`,
    `Keep this reference — it is how we find your payment again.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Turn a Cameroonian number as a person writes it into what wa.me needs.
 *
 * People type "699 74 49 70", "+237 699744970" and "00237699744970"
 * interchangeably. All three must produce the same link, or the thank-you
 * message silently goes nowhere.
 */
export function whatsappNumber(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("00")) digits = digits.slice(2);
  // A bare Cameroonian mobile number is 9 digits starting with 6.
  if (digits.length === 9 && digits.startsWith("6")) digits = `237${digits}`;

  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}
