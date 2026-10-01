"use client";

import { useRouter } from "next/navigation";
import { TIERS, batchLabel, tierName, type TierId } from "@/lib/payments/tiers";
import type { PaidTier } from "@/lib/payments/plans";
import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { browserClient } from "@/lib/supabase/browser";
import { type Receipt, receiptMessage } from "@/lib/payments/receipt";
import { REMIND_WITHIN_DAYS, daysUntil } from "@/lib/payments/reminders";
import { ManualPayment } from "./ManualPayment";
import { Badge, Button, ButtonLink, Notice, SectionHeading } from "./ui";
import { Breadcrumbs } from "./Breadcrumbs";

export function AccountContent({
  email,
  name,
  avatarUrl,
  provider,
  memberSince,
  isPro,
  tier = isPro ? "pro" : "free",
  prices,
  proUntil,
  dailyLimit,
  configured,
  receipts,
}: {
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  provider: string | null;
  memberSince: string | null;
  isPro: boolean;
  /** Which plan the database says this person is on. */
  tier?: TierId;
  /** Monthly price of each paid plan, from the server's settings. */
  prices?: Record<PaidTier, number>;
  proUntil: string | null;
  /** The free allowance, or null while the limit is switched off. */
  dailyLimit: number | null;
  configured: boolean;
  receipts: Receipt[];
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const fr = locale === "fr";
  const longDate = (value: string) =>
    new Intl.DateTimeFormat(fr ? "fr-FR" : "en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(value));

  const signOut = async () => {
    const client = browserClient();
    if (!client) return;
    setBusy(true);
    await client.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const until = proUntil
    ? new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(proUntil))
    : null;

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="mx-auto max-w-lg">
        <Breadcrumbs items={[{ label: t("auth.accountTitle") }]} />
        <SectionHeading title={t("auth.accountTitle")} />

        {!configured ? (
          <Notice tone="warn">{t("auth.notConfigured")}</Notice>
        ) : (
          <>
            <div className="rounded-2xl border border-line bg-white p-5">
              {/* Who this is. The point of this block is that somebody can
                  look at it and be certain the account is theirs — on a shared
                  phone or a cybercafé machine that is not a small thing. */}
              <div className="flex items-center gap-3.5">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt=""
                    width={52}
                    height={52}
                    referrerPolicy="no-referrer"
                    className="h-13 w-13 shrink-0 rounded-full object-cover"
                    style={{ width: 52, height: 52 }}
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex shrink-0 items-center justify-center rounded-full bg-violet-light text-[22px] font-bold text-violet-deep"
                    style={{ width: 52, height: 52 }}
                  >
                    {(name || email || "?").trim().charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  {name ? (
                    <p className="truncate text-[16px] font-bold text-ink">{name}</p>
                  ) : null}
                  <p className="break-all text-[14px] text-ink-soft">{email}</p>
                  {provider ? (
                    <p className="mt-1 text-[12.5px] text-ink-soft">
                      {provider === "google"
                        ? fr
                          ? "Connecté avec Google"
                          : "Signed in with Google"
                        : fr
                          ? "Connecté avec une adresse email"
                          : "Signed in with an email address"}
                    </p>
                  ) : null}
                </div>
              </div>

              {memberSince ? (
                <p className="mt-4 text-[12.5px] text-ink-soft">
                  {fr ? "Compte créé le " : "Account created on "}
                  {longDate(memberSince)}
                </p>
              ) : null}

              <div className="mt-5 border-t border-line pt-5">
                <p className="text-[13px] uppercase tracking-wide text-ink-soft">
                  {t("auth.plan")}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[17px] font-bold text-ink">
                    {tierName(tier, fr)}
                  </span>
                  {isPro ? <Badge tone="violet">{tierName(tier, fr)}</Badge> : null}
                </div>
                {isPro && until ? (
                  <p className="mt-1 text-[13.5px] text-ink-soft">
                    {t("auth.proUntil", { date: until })}
                  </p>
                ) : null}

                {/* What the plan actually means today, in the words the
                    pricing page uses. A plan name on its own tells somebody
                    nothing about what they are allowed to do. */}
                <p className="mt-2 text-[13px] leading-5 text-ink-soft">
                  {tier === "owner"
                    ? fr
                      ? "Aucune limite : pas de quota quotidien, pas de limite de taille de fichier, pas de limite de lot."
                      : "No limits at all: no daily quota, no file-size ceiling, no batch ceiling."
                    : isPro
                    ? fr
                      ? `Usage étendu, sans limite quotidienne, ${batchLabel(tier, true)} fichiers à la fois sur les outils compatibles.`
                      : `Extended use, no daily limit, ${batchLabel(tier, false)} files at a time on the tools that support it.`
                    : dailyLimit === null
                      ? fr
                        ? "Tous les outils sont actuellement illimités pour tout le monde."
                        : "Every tool is currently unlimited for everybody."
                      : fr
                        ? `${dailyLimit} opérations par jour, jusqu'à ${TIERS.free.batchFiles} fichiers à la fois.`
                        : `${dailyLimit} operations a day, up to ${TIERS.free.batchFiles} files at a time.`}
                </p>
              </div>
            </div>

            {/* A quiet warning beats a surprise loss of access. Shown only
                inside the reminder window, so it is not permanent furniture. */}
            {isPro && proUntil && daysUntil(proUntil) <= REMIND_WITHIN_DAYS ? (
              <Notice tone="warn" className="mt-4">
                {(() => {
                  const left = daysUntil(proUntil);
                  if (left <= 0) {
                    return locale === "fr"
                      ? `Votre accès ${tierName(tier, true)} se termine aujourd'hui.`
                      : `Your ${tierName(tier, false)} access ends today.`;
                  }
                  if (left === 1) {
                    return locale === "fr"
                      ? `Votre accès ${tierName(tier, true)} se termine demain. Renouvelez pour ne pas être interrompu.`
                      : `Your ${tierName(tier, false)} access ends tomorrow. Renew to avoid an interruption.`;
                  }
                  return locale === "fr"
                    ? `Votre accès ${tierName(tier, true)} se termine dans ${left} jours.`
                    : `Your ${tierName(tier, false)} access ends in ${left} days.`;
                })()}
              </Notice>
            ) : null}

            {!isPro || (proUntil && daysUntil(proUntil) <= REMIND_WITHIN_DAYS) ? (
              <div className="mt-4">
                <ManualPayment prices={prices} />
              </div>
            ) : null}

            {receipts.length > 0 ? (
              <div className="mt-6">
                <h2 className="text-[15px] font-bold text-ink">
                  {locale === "fr" ? "Vos reçus" : "Your receipts"}
                </h2>
                <p className="mt-1 text-[13px] leading-5 text-ink-soft">
                  {locale === "fr"
                    ? "Conservez la référence : c'est ce qui permet de retrouver votre paiement."
                    : "Keep the reference — it is how a payment is found again."}
                </p>
                <ul className="mt-3 space-y-2.5">
                  {receipts.map((receipt) => (
                    <ReceiptRow key={receipt.reference} receipt={receipt} locale={locale} />
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/pricing" variant="secondary" size="lg" className="flex-1">
                {t("nav.pricing")}
              </ButtonLink>
              <Button variant="ghost" size="lg" onClick={signOut} disabled={busy}>
                {t("auth.signOut")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReceiptRow({ receipt, locale }: { receipt: Receipt; locale: string }) {
  const fr = locale === "fr";
  const money = `${receipt.amount.toLocaleString(fr ? "fr-FR" : "en-GB")} ${receipt.currency}`;
  const paid = new Intl.DateTimeFormat(fr ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Douala",
  }).format(new Date(receipt.paidAt));

  const [copied, setCopied] = useState(false);

  return (
    <li className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[13.5px] font-bold tracking-tight text-violet-deep">
          {receipt.reference}
        </span>
        <span className="shrink-0 text-[14px] font-bold tabular-nums text-ink">{money}</span>
      </div>
      <p className="mt-1 text-[13px] text-ink-soft">{paid}</p>
      {receipt.proUntil ? (
        <p className="mt-0.5 text-[13px] text-ink-soft">
          {fr ? "Actif jusqu'au " : "Active until "}
          <strong className="text-ink">
            {new Intl.DateTimeFormat(fr ? "fr-FR" : "en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "Africa/Douala",
            }).format(new Date(receipt.proUntil))}
          </strong>
        </p>
      ) : null}

      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(receiptMessage(receipt, fr ? "fr" : "en"));
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
        className="mt-2.5 min-h-11 text-[13.5px] font-semibold text-violet-deep underline underline-offset-2"
      >
        {copied
          ? fr
            ? "Reçu copié"
            : "Receipt copied"
          : fr
            ? "Copier le reçu"
            : "Copy the receipt"}
      </button>
    </li>
  );
}
