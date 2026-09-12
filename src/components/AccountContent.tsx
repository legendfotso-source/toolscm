"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { browserClient } from "@/lib/supabase/browser";
import { type Receipt, receiptMessage } from "@/lib/payments/receipt";
import { ManualPayment } from "./ManualPayment";
import { Badge, Button, ButtonLink, Notice, SectionHeading } from "./ui";
import { Breadcrumbs } from "./Breadcrumbs";

export function AccountContent({
  email,
  isPro,
  proUntil,
  configured,
  receipts,
}: {
  email: string | null;
  isPro: boolean;
  proUntil: string | null;
  configured: boolean;
  receipts: Receipt[];
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

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
              <p className="text-[13px] uppercase tracking-wide text-ink-soft">
                {t("auth.email")}
              </p>
              <p className="mt-1 text-[15px] font-medium text-ink">{email}</p>

              <div className="mt-5 border-t border-line pt-5">
                <p className="text-[13px] uppercase tracking-wide text-ink-soft">
                  {t("auth.plan")}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[17px] font-bold text-ink">
                    {isPro ? t("auth.planPro") : t("auth.planFree")}
                  </span>
                  {isPro ? <Badge tone="violet">{t("auth.planPro")}</Badge> : null}
                </div>
                {isPro && until ? (
                  <p className="mt-1 text-[13.5px] text-ink-soft">
                    {t("auth.proUntil", { date: until })}
                  </p>
                ) : null}
              </div>
            </div>

            {!isPro ? (
              <div className="mt-4">
                <ManualPayment />
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
          {fr ? "Pro actif jusqu'au " : "Pro active until "}
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
