import "server-only";

import { defaultFrom, type Mail, type Mailer, type SendResult } from "./mailer";

/**
 * Resend, over plain fetch.
 *
 * Checked against the current API reference on 6 October 2026:
 *   POST https://api.resend.com/emails
 *   Authorization: Bearer re_…
 *   required: from, to, subject        optional: html, text, reply_to, …
 *   optional header: Idempotency-Key   (kept 24h, max 256 chars)
 *
 * The field is `reply_to`, in snake case, and getting that wrong is silent:
 * Resend accepts the request and simply ignores the unknown key, so replies go
 * to the sender address instead of to the customer and nobody notices until
 * somebody tries to answer one.
 *
 * No npm package. One POST does not need a wrapper, and a wrapper is one more
 * thing that can fail to install.
 */

const ENDPOINT = "https://api.resend.com/emails";

export function resendMailer(): Mailer {
  return {
    name: "resend",

    configured(): boolean {
      return Boolean((process.env.RESEND_API_KEY ?? "").trim());
    },

    async send(mail: Mail): Promise<SendResult> {
      const key = (process.env.RESEND_API_KEY ?? "").trim();
      if (!key) return { ok: false, reason: "no_api_key", provider: "resend" };

      const headers: Record<string, string> = {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      };
      if (mail.idempotencyKey) {
        headers["Idempotency-Key"] = mail.idempotencyKey.slice(0, 256);
      }

      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify({
            from: defaultFrom(),
            to: mail.to,
            subject: mail.subject,
            text: mail.text,
            ...(mail.html ? { html: mail.html } : {}),
            ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
          }),
          // A contact form that hangs for thirty seconds is a contact form the
          // visitor abandons. The message is already saved by the time this
          // runs, so giving up early costs a notification, not a customer.
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        return {
          ok: false,
          provider: "resend",
          reason: error instanceof Error ? error.message : "network_error",
        };
      }

      let payload: Record<string, unknown> = {};
      try {
        payload = (await response.json()) as Record<string, unknown>;
      } catch {
        /* a body we cannot read is reported by status alone */
      }

      if (!response.ok) {
        // Resend's own sentence, not a rephrasing of it. "The from address is
        // not verified" and "API key is invalid" need completely different
        // answers, and a generic message costs the difference.
        const message =
          (typeof payload.message === "string" && payload.message) ||
          (typeof payload.error === "string" && payload.error) ||
          `HTTP ${response.status}`;
        return { ok: false, provider: "resend", reason: message };
      }

      const id = typeof payload.id === "string" ? payload.id : "";
      return { ok: true, id, provider: "resend" };
    },
  };
}
