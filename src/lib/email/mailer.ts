import "server-only";

import { resendMailer } from "./resend";

/**
 * Sending email, without committing the application to one provider.
 *
 * Tools.cm had no email capability at all: the contact form opened the
 * visitor's own mail client and the site itself never sent anything. Receipts,
 * renewal reminders and claim decisions were all text to be copied into
 * WhatsApp by hand.
 *
 * The shape here mirrors how payments are already done in this codebase — a
 * small interface, one implementation per provider, chosen at call time from
 * what is configured — so adding a second provider later is a file, not a
 * refactor. Deliberately no SDK: sending an email is one POST, and a package
 * that wraps one POST is a dependency that can fail to install on the one day
 * it matters.
 *
 * Every function here returns a result rather than throwing. Mail is a
 * notification, never the record: a contact message is saved to the database
 * first and emailed second, so a provider outage costs a notification and not
 * a customer. A sender that throws would invert that.
 */

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /**
   * Where a reply goes. For the contact form this is the VISITOR, so that
   * hitting reply in Gmail answers the person who wrote — the single detail
   * that makes a contact form usable rather than a notification you then have
   * to copy an address out of.
   */
  replyTo?: string;
  /**
   * Stops the same mail going twice if a request is retried. Resend keeps
   * these for 24 hours, which is longer than any retry this app performs.
   */
  idempotencyKey?: string;
};

export type SendResult =
  | { ok: true; id: string; provider: string }
  | { ok: false; reason: string; provider: string };

export type Mailer = {
  name: string;
  configured(): boolean;
  send(mail: Mail): Promise<SendResult>;
};

/** Where contact messages go. Never user-supplied — see the route. */
export function contactRecipient(): string {
  return (process.env.CONTACT_TO_EMAIL ?? "legendfotso@gmail.com").trim();
}

/**
 * Who the mail appears to come from.
 *
 * Defaults to Resend's own `onboarding@resend.dev`, which works with no
 * domain set up at all — and only delivers to the address that owns the Resend
 * account. For the contact form that is exactly right: the one recipient IS
 * the account owner. The moment Fortune verifies a domain, EMAIL_FROM replaces
 * this and the same code sends to anybody.
 */
export function defaultFrom(): string {
  return (process.env.EMAIL_FROM ?? "Tools.cm <onboarding@resend.dev>").trim();
}

let cached: Mailer | null | undefined;

/**
 * The mailer to use, or null when none is configured.
 *
 * Null rather than a stub that pretends to send. A fake success is the worst
 * possible behaviour here: the site would report "message sent" to a customer
 * whose message reached nobody, and nothing anywhere would say so.
 */
export function mailer(): Mailer | null {
  if (cached !== undefined) return cached;
  // A static import, not a lazy require. The first version used require() to
  // avoid loading the implementation on a project with no mail provider —
  // which saves nothing measurable, does not work in a plain ES module, and
  // meant the one module worth testing in isolation could not be loaded by a
  // test at all.
  const candidate = resendMailer();
  cached = candidate.configured() ? candidate : null;
  return cached;
}

/** For tests and for the settings route, which changes nothing here. */
export function resetMailer(): void {
  cached = undefined;
}

export function mailConfigured(): boolean {
  return mailer() !== null;
}

/**
 * Send, and say plainly what happened.
 *
 * Wrapped so that no caller has to care which provider is in use, nor whether
 * one is configured at all.
 */
export async function send(mail: Mail): Promise<SendResult> {
  const provider = mailer();
  if (!provider) {
    return { ok: false, reason: "no_mail_provider", provider: "none" };
  }
  try {
    return await provider.send(mail);
  } catch (error) {
    return {
      ok: false,
      provider: provider.name,
      reason: error instanceof Error ? error.message : "unknown",
    };
  }
}
