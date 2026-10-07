import "server-only";

import { mailer } from "./mailer";
import { looksLikeEmail } from "./address";
import { receiptMessage, receiptReference, type Receipt } from "../payments/receipt";

/**
 * Telling the customer their payment went through.
 *
 * Until now the site activated access silently. Someone sent 2 000 FCFA from
 * their own Mobile Money account to a phone number, the webhook landed, the
 * subscription row was extended — and nothing anywhere told them. The only way
 * to find out was to go back to the site, sign in, and look. People who are
 * not sure a payment worked do not do that; they send a WhatsApp message
 * asking, and somebody answers it by hand. That hand-answering was the
 * product's notification system.
 *
 * Three rules, all of them learned from the payment code next door:
 *
 * **Never throw.** This is called from inside settlement, after the money has
 * been confirmed and the subscription written. An exception here would turn a
 * mail outage into a failed activation, and a failed activation into a customer
 * who paid for nothing. Every function returns, and a failure is a log line.
 *
 * **Never be the record.** The receipt is derived from the payment row and can
 * be re-derived at any time; the email is a copy of it. If the mail is lost,
 * the receipt still exists on the account page, with the same reference.
 *
 * **Send once.** Not by remembering what has been sent — by being called from
 * the one place that happens once. `settlePayment` grants through a conditional
 * update that exactly one racing caller can match, and `grantPro` through a
 * unique index; both already return "this one was yours" to a single caller.
 * The idempotency key is the belt to that: Resend keeps one for 24 hours, so
 * the same payment cannot produce two mails even if a request is retried
 * inside the provider's own retry window.
 */

const PLAN_LABEL: Record<"pro" | "max", string> = { pro: "Pro", max: "Max" };

/** What goes in the From line, and whether a customer can receive it at all. */
function senderIsShared(): boolean {
  // Resend's onboarding sender delivers ONLY to the address that owns the
  // Resend account. With it, a receipt to a customer is accepted by the API and
  // then dropped — the worst shape of failure, because the send looks fine.
  // Saying so in the log is how that gets noticed before a customer does.
  return !(process.env.EMAIL_FROM ?? "").trim();
}

export type NotifyResult =
  | { sent: true; id: string }
  | { sent: false; reason: string };

function skip(reason: string): NotifyResult {
  return { sent: false, reason };
}

/**
 * The receipt, by email.
 *
 * The body is `receiptMessage()` — the same text the admin screen copies into
 * WhatsApp. Deliberately the same: two wordings of one receipt is two things
 * to keep correct, and the day they disagree is the day a customer puts them
 * side by side and asks which is right.
 *
 * The asterisks WhatsApp uses for bold are stripped for mail, where they are
 * just punctuation.
 */
export async function sendReceiptEmail(
  receipt: Receipt,
  locale: "fr" | "en" = "fr",
): Promise<NotifyResult> {
  if (!looksLikeEmail(receipt.email)) return skip("no deliverable address on the account");

  const post = mailer();
  if (!post) return skip("no mail provider configured");

  const text = receiptMessage(receipt, locale).replace(/\*/g, "");
  const plan = PLAN_LABEL[receipt.tier ?? "pro"];
  const subject =
    locale === "fr"
      ? `Tools.cm — votre accès ${plan} est activé (${receipt.reference})`
      : `Tools.cm — your ${plan} access is on (${receipt.reference})`;

  if (senderIsShared()) {
    console.warn(
      `[Tools.cm] sending a receipt from the shared Resend sender; ${receipt.email} will ` +
        "almost certainly not receive it. Verify a domain in Resend and set EMAIL_FROM.",
    );
  }

  const result = await post.send({
    to: receipt.email,
    subject,
    text,
    html: asHtml(text),
    // The reference is derived from the payment id, so this key is stable for
    // the payment and unique across payments — which is exactly the property
    // an idempotency key needs and a timestamp does not have.
    idempotencyKey: `receipt:${receipt.reference}`,
  });

  if (!result.ok) {
    console.error(`[Tools.cm] receipt to ${receipt.email} was not sent: ${result.reason}`);
    return skip(result.reason);
  }

  return { sent: true, id: result.id };
}

/**
 * Plain text as a readable email body.
 *
 * Hand-written, with no template engine and no CSS framework: this is eight
 * lines of facts, and a layout around it would only give more ways for it to
 * render badly in the Gmail Android app, which is where it will be read. The
 * text part remains the real message; this is the same message, legible.
 */
function asHtml(text: string): string {
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const body = text
    .split("\n")
    .map((line) => (line.trim() ? `<p style="margin:0 0 10px">${escape(line)}</p>` : ""))
    .join("\n");

  return (
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;` +
    `font-size:15px;line-height:1.55;color:#111">\n${body}\n</div>`
  );
}

/** Everything the receipt needs that settlement already has in hand. */
export type SettledForReceipt = {
  email: string | null;
  paymentId: string;
  amount: number;
  currency: string;
  paidAt: string;
  proUntil: string | null;
  days: number;
  tier?: "pro" | "max";
};

/**
 * Build the receipt from a settled payment and send it.
 *
 * Separate from `sendReceiptEmail` so the composition — which is where a wrong
 * reference or a wrong date would come from — can be tested without a mail
 * provider, by passing an account with no address.
 */
export async function notifyPaymentSettled(
  settled: SettledForReceipt,
  locale: "fr" | "en" = "fr",
): Promise<NotifyResult> {
  if (!settled.email) return skip("the account has no email address");

  return sendReceiptEmail(
    {
      reference: receiptReference(settled.paymentId),
      email: settled.email,
      amount: settled.amount,
      currency: settled.currency,
      paidAt: settled.paidAt,
      proUntil: settled.proUntil,
      days: settled.days,
      tier: settled.tier,
    },
    locale,
  );
}
