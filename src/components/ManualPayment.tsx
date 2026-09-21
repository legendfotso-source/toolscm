"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import {
  MOMO_ACCOUNTS,
  PRICE_XAF,
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP,
  isManualPaymentAvailable,
} from "@/lib/site";
import { useState } from "react";
import { tierName, tierPriceXaf } from "@/lib/payments/tiers";
import type { PaidTier } from "@/lib/payments/plans";
import { formatXaf } from "@/lib/payments/format";
import { Notice, cx } from "./ui";

/**
 * How to pay, before there is a payment API.
 *
 * Three honest steps: send the money, send the proof, get activated. No button
 * that pretends to charge a card, no spinner that resolves into nothing. If no
 * Mobile Money account is configured, this renders the plain "not available
 * yet" message instead — an empty payment instruction would be worse than
 * none.
 *
 * Both operators are shown side by side rather than one "preferred" number,
 * because a customer on Orange sending to MTN pays a transfer fee on top of
 * the subscription, and some of them will just abandon the payment.
 */
export function ManualPayment({
  compact = false,
  prices,
}: {
  compact?: boolean;
  /**
   * Monthly price of each paid tier, from the server's settings. Places that
   * cannot pass it (the paywall inside a tool) fall back to the published
   * default, priced by the same rule the checkout uses.
   */
  prices?: Record<PaidTier, number>;
}) {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [tier, setTier] = useState<PaidTier>("pro");

  if (!isManualPaymentAvailable()) {
    return <Notice tone="warn">{t("paywall.unavailable")}</Notice>;
  }

  const amounts: Record<PaidTier, number> = prices ?? {
    pro: PRICE_XAF,
    max: tierPriceXaf(PRICE_XAF, "max"),
  };
  const price = formatXaf(amounts[tier], fr);
  const plan = tierName(tier, fr);

  // The tier is in the message so the admin activates what was paid for,
  // not whatever is the default in /admin.
  const message = fr
    ? `Bonjour, je viens d'envoyer ${price} pour Tools.cm ${plan} (1 mois).\nOpérateur : \nID de transaction : \nE-mail de mon compte : `
    : `Hello, I have just sent ${price} for Tools.cm ${plan} (1 month).\nOperator: \nTransaction id: \nMy account email: `;

  return (
    <div
      className={
        compact
          ? "rounded-xl border border-violet-border bg-violet-light p-4"
          : "rounded-2xl border border-violet-border bg-violet-light p-5"
      }
    >
      <p className="text-[15px] font-bold text-ink">
        {fr ? "Payer par Mobile Money" : "Pay by Mobile Money"}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={fr ? "Formule" : "Plan"}>
        {(["pro", "max"] as PaidTier[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTier(id)}
            aria-pressed={id === tier}
            className={cx(
              "min-h-11 rounded-xl border px-3 py-2 text-left",
              id === tier ? "border-violet-deep bg-white ring-1 ring-violet-deep" : "border-violet-border bg-white/60",
            )}
          >
            <span className="block text-[14px] font-bold text-ink">{tierName(id, fr)}</span>
            <span className="block text-[12.5px] tabular-nums text-ink-soft">
              {formatXaf(amounts[id], fr)} {fr ? "/ mois" : "/ month"}
            </span>
          </button>
        ))}
      </div>

      {/* Step 1 — the numbers, given the most room, because this is the step
          someone will be reading off their screen while dialling. */}
      <div className="mt-3 flex gap-2.5">
        <StepNumber n={1} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-6 text-ink">
            {fr ? "Envoyez " : "Send "}
            <strong>{price}</strong>
            {fr ? " à l'un de ces numéros :" : " to either of these numbers:"}
          </p>

          <ul className="mt-2 space-y-2">
            {MOMO_ACCOUNTS.map((account) => (
              <li
                key={account.number}
                className="rounded-lg border border-violet-border bg-white px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-bold tabular-nums tracking-tight text-ink">
                    {account.number}
                  </span>
                  <span
                    className={
                      account.operator === "MTN"
                        ? "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold text-[#8A6A00] bg-[#FFF4CC]"
                        : "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold text-[#8A3B00] bg-[#FFE8D6]"
                    }
                  >
                    {account.operator}
                  </span>
                </div>
                <p className="mt-0.5 text-[12.5px] leading-4 text-ink-soft">{account.name}</p>
              </li>
            ))}
          </ul>

          <p className="mt-2 text-[12.5px] leading-5 text-ink-soft">
            {fr
              ? "Choisissez le numéro de votre propre opérateur : un transfert entre opérateurs vous coûterait des frais en plus."
              : "Pick the number on your own network: sending across operators costs you an extra fee."}
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2.5">
        <StepNumber n={2} />
        <p className="flex-1 text-[14px] leading-6 text-ink">
          {fr ? (
            <>
              Envoyez le SMS de confirmation avec{" "}
              <strong>l&apos;adresse e-mail de votre compte Tools.cm</strong>.
            </>
          ) : (
            <>
              Send the confirmation SMS along with{" "}
              <strong>the email address of your Tools.cm account</strong>.
            </>
          )}
        </p>
      </div>

      <div className="mt-3 flex gap-2.5">
        <StepNumber n={3} />
        <p className="flex-1 text-[14px] leading-6 text-ink">
          {fr
            ? `Votre accès ${plan} est activé et vous recevez un reçu sur WhatsApp, généralement en moins de 24 heures.`
            : `Your ${plan} access is activated and you get a receipt on WhatsApp, usually within 24 hours.`}
        </p>
      </div>

      {SUPPORT_WHATSAPP ? (
        <a
          href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-deep px-4 text-[15px] font-semibold text-white transition-colors hover:bg-violet-mid"
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

function StepNumber({ n }: { n: number }) {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-deep text-[11px] font-bold text-white">
      {n}
    </span>
  );
}
