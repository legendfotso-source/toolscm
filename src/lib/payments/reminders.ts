/**
 * Renewal reminders.
 *
 * A subscriber who lapses without noticing is the most expensive kind of lost
 * customer: they were already convinced, already paying, and they leave by
 * accident. On a manual Mobile Money flow there is no card on file to charge
 * again, so the only thing standing between a renewal and a silent departure
 * is somebody telling them.
 *
 * Pure functions — the message text and the day arithmetic — so the admin
 * screen and the account banner say the same thing, and so it is testable.
 */

export type Expiring = {
  email: string;
  /** Whatever phone number was recorded with their last payment, if any. */
  phone: string | null;
  proUntil: string;
  daysLeft: number;
};

/** Whole days from now until an end date, in Douala rather than UTC. */
export function daysUntil(endDate: string, now: Date = new Date()): number {
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return 0;

  // Compare calendar days, not 24-hour blocks: someone whose access ends at
  // 08:00 tomorrow has "1 day left", not "0" because it is 14 hours away.
  const dayInDouala = (date: Date) =>
    Math.floor((date.getTime() + 60 * 60 * 1000) / 86_400_000);

  return dayInDouala(end) - dayInDouala(now);
}

/**
 * When to nudge.
 *
 * Three days is far enough ahead that a customer can act — get to a Mobile
 * Money agent, wait for a salary — and close enough that it does not read as
 * pestering. One reminder, not a sequence.
 */
export const REMIND_WITHIN_DAYS = 3;

export function reminderMessage(
  entry: Pick<Expiring, "daysLeft" | "proUntil">,
  price: string,
  locale: "fr" | "en" = "fr",
): string {
  const fr = locale === "fr";
  const until = new Date(entry.proUntil).toLocaleDateString(fr ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "Africa/Douala",
  });

  if (fr) {
    const when =
      entry.daysLeft <= 0
        ? "a expiré"
        : entry.daysLeft === 1
          ? `expire demain (${until})`
          : `expire dans ${entry.daysLeft} jours (${until})`;

    return [
      `Bonjour 👋`,
      ``,
      `Votre accès Tools.cm Pro ${when}.`,
      `Pour continuer sans limite quotidienne : ${price}.`,
      ``,
      `Envoyez le paiement au numéro habituel, puis renvoyez-nous le SMS de confirmation — nous réactivons dans la journée.`,
      ``,
      `Merci de votre confiance 🙏`,
    ].join("\n");
  }

  const when =
    entry.daysLeft <= 0
      ? "has expired"
      : entry.daysLeft === 1
        ? `expires tomorrow (${until})`
        : `expires in ${entry.daysLeft} days (${until})`;

  return [
    `Hello 👋`,
    ``,
    `Your Tools.cm Pro access ${when}.`,
    `To keep going without the daily limit: ${price}.`,
    ``,
    `Send the payment to the usual number, then forward us the confirmation SMS — we reactivate the same day.`,
    ``,
    `Thank you 🙏`,
  ].join("\n");
}

/**
 * Has this expiry already been announced?
 *
 * `reminded_for` holds the `end_date` a reminder was last sent FOR, not a flag
 * and not "when we last wrote to them". That choice is what makes the daily
 * job safe to run every day and correct across renewals at the same time:
 *
 *   sent for this expiry  → the values match → not due again today;
 *   never sent            → null             → due;
 *   renewed since         → end_date moved   → due again, for the NEW expiry,
 *                                              with nothing to reset.
 *
 * Compared as instants rather than as strings. Postgres may hand back a
 * timestamptz formatted differently from the one that was written — a
 * different offset, more or fewer fractional digits — and a string comparison
 * would then find them unequal and re-send the same reminder every morning
 * until the subscription expired.
 *
 * An unparseable `reminded_for` counts as "never sent". Sending one reminder
 * too many is a mild annoyance; skipping it loses a subscriber who would have
 * renewed.
 */
export function reminderDue(endDate: string, remindedFor: string | null | undefined): boolean {
  if (!remindedFor) return true;

  const sentFor = new Date(remindedFor).getTime();
  const ends = new Date(endDate).getTime();
  if (Number.isNaN(sentFor) || Number.isNaN(ends)) return true;

  return sentFor !== ends;
}
