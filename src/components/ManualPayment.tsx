"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import {
  MOMO_NAME,
  MOMO_NUMBER,
  MOMO_WHATSAPP,
  PRICE_XAF,
  SUPPORT_EMAIL,
  isManualPaymentAvailable,
} from "@/lib/site";
import { Notice } from "./ui";

/**
 * How to pay, before there is a payment API.
 *
 * Three honest steps: send the money, send the proof, get activated. No button
 * that pretends to charge a card, no spinner that resolves into nothing. If no
 * Mobile Money number is configured, this renders the plain "not available
 * yet" message instead — an empty payment instruction would be worse than
 * none.
 */
export function ManualPayment({ compact = false }: { compact?: boolean }) {
  const { t, locale } = useLocale();
  const fr = locale === "fr";

  if (!isManualPaymentAvailable()) {
    return <Notice tone="warn">{t("paywall.unavailable")}</Notice>;
  }

  const price = PRICE_XAF.toLocaleString(fr ? "fr-FR" : "en-GB");

  const message = fr
    ? `Bonjour, je viens d'envoyer ${price} FCFA pour Tools.cm Pro. Mon e-mail de compte est : `
    : `Hello, I have just sent ${price} FCFA for Tools.cm Pro. My account email is: `;

  const steps = fr
    ? [
        <>
          Envoyez <strong>{price} FCFA</strong> au <strong>{MOMO_NUMBER}</strong>
          {MOMO_NAME ? <> ({MOMO_NAME})</> : null}.
        </>,
        <>
          Envoyez la capture ou le SMS de confirmation, avec{" "}
          <strong>l&apos;adresse e-mail de votre compte Tools.cm</strong>.
        </>,
        <>Votre accès Pro est activé manuellement, généralement en moins de 24 heures.</>,
      ]
    : [
        <>
          Send <strong>{price} FCFA</strong> to <strong>{MOMO_NUMBER}</strong>
          {MOMO_NAME ? <> ({MOMO_NAME})</> : null}.
        </>,
        <>
          Send the screenshot or confirmation SMS, along with{" "}
          <strong>the email address of your Tools.cm account</strong>.
        </>,
        <>Your Pro access is activated by hand, usually within 24 hours.</>,
      ];

  return (
    <div
      className={
        compact
          ? "rounded-xl border border-violet-border bg-violet-light p-4"
          : "rounded-2xl border border-violet-border bg-violet-light p-5"
      }
    >
      <p className="text-[14.5px] font-bold text-ink">
        {fr ? "Payer par Mobile Money" : "Pay by Mobile Money"}
      </p>

      <ol className="mt-3 space-y-2.5">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-2.5 text-[14px] leading-6 text-ink">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-deep text-[11px] font-bold text-white">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      {MOMO_WHATSAPP ? (
        <a
          href={`https://wa.me/${MOMO_WHATSAPP}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl bg-violet-deep px-4 text-[15px] font-semibold text-white transition-colors hover:bg-violet-mid"
        >
          {fr ? "Envoyer la preuve sur WhatsApp" : "Send the proof on WhatsApp"}
        </a>
      ) : (
        <p className="mt-4 text-[13px] leading-5 text-ink-soft">
          {fr ? "Envoyez la preuve à " : "Send the proof to "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      )}

      <p className="mt-3 text-[12.5px] leading-5 text-ink-soft">
        {fr
          ? "Rien n'est activé avant réception du paiement. Vous gardez vos 3 opérations gratuites par jour en attendant."
          : "Nothing is activated before the payment arrives. You keep your 3 free operations a day in the meantime."}
      </p>
    </div>
  );
}
