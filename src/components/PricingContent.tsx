"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import { PricingCard } from "./PricingCard";
import { FAQ } from "./FAQ";
import { Breadcrumbs } from "./Breadcrumbs";
import { ManualPayment } from "./ManualPayment";
import { CheckoutButtons } from "./CheckoutButtons";
import { Card, Notice, SectionHeading } from "./ui";
import { isManualPaymentAvailable } from "@/lib/site";
import { TIER_IDS, TIERS } from "@/lib/payments/tiers";
import type { PaidTier, Plan } from "@/lib/payments/plans";
import { formatUsd, formatXaf } from "@/lib/payments/format";
import type { ToolFaqEntry } from "@/types/tool";

const PRICING_FAQ: ToolFaqEntry[] = [
  {
    q: {
      fr: "Pourquoi les paiements ne sont-ils pas encore actifs ?",
      en: "Why are payments not live yet?",
    },
    a: {
      fr: "Parce qu'un paiement qui échoue à moitié est pire que pas de paiement du tout. L'intégration Mobile Money et carte est en cours de mise en place avec vérification côté serveur : tant que ce circuit n'est pas fiable de bout en bout, nous ne prenons l'argent de personne. Tous les outils publiés restent utilisables gratuitement.",
      en: "Because a payment that half fails is worse than no payment at all. The Mobile Money and card integration is being set up with server-side verification: until that path is reliable end to end, we take nobody's money. Every published tool stays free to use.",
    },
  },
  {
    q: {
      fr: "Que veut dire « usage étendu » plutôt qu'« illimité » ?",
      en: "What does \"extended use\" mean rather than \"unlimited\"?",
    },
    a: {
      fr: "Le traitement a lieu sur votre appareil. Nous pouvons retirer notre limite quotidienne, mais nous ne pouvons pas rendre votre téléphone capable de compresser un PDF de 400 pages. Promettre « illimité » serait promettre quelque chose qui ne dépend pas de nous.",
      en: "Processing happens on your device. We can lift our daily limit, but we cannot make your phone capable of compressing a 400-page PDF. Promising \"unlimited\" would be promising something that is not ours to give.",
    },
  },
  {
    q: {
      fr: "Faut-il un compte pour utiliser Tools.cm ?",
      en: "Do I need an account to use Tools.cm?",
    },
    a: {
      fr: "Non. L'usage gratuit ne demande aucune inscription. Un compte ne deviendra nécessaire que pour gérer un abonnement Pro, quand celui-ci existera.",
      en: "No. Free use requires no sign-up. An account will only become necessary to manage a Pro subscription, once that exists.",
    },
  },
  {
    q: {
      fr: "Y a-t-il de la publicité aujourd'hui ?",
      en: "Is there advertising today?",
    },
    a: {
      fr: "Non. Aucune régie publicitaire n'est branchée pour l'instant, et nous n'affichons pas d'emplacement vide en attendant. Le jour où la publicité arrivera, elle sera visible et les abonnés Pro ne la verront pas.",
      en: "No. No ad network is connected yet, and we do not display an empty placeholder in the meantime. When advertising arrives it will be visible, and Pro subscribers will not see it.",
    },
  },
];

export function PricingContent({
  notchpay = false,
  campay = false,
  stripe = false,
  signedIn = false,
  prices,
}: {
  notchpay?: boolean;
  campay?: boolean;
  stripe?: boolean;
  signedIn?: boolean;
  /** Every plan length for each paid tier, priced on the server. */
  prices: Record<PaidTier, Plan[]>;
}) {
  const { t, locale } = useLocale();
  const fr = locale === "fr";

  // The cards show the monthly price of each tier, computed by the same
  // function the checkout API charges with. Never a translated string: a
  // price typed into a translation file is a price that stops being true the
  // first time the admin changes it.
  const monthly = (tier: PaidTier) => prices[tier].find((plan) => plan.id === "monthly") ?? prices[tier][0];
  const proMonthly = monthly("pro");
  const maxMonthly = monthly("max");

  const manualPayment = isManualPaymentAvailable();
  // "Payable" means there is a real way to hand over money today — through a
  // provider, or by Mobile Money and a human. Not "a provider exists".
  const payable = notchpay || campay || stripe || manualPayment;

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="mx-auto max-w-4xl" id="how-to-pay">
        <Breadcrumbs items={[{ label: t("nav.pricing") }]} />

        <SectionHeading title={t("pricing.title")} description={t("pricing.subtitle")} align="center" />

        {notchpay || campay || stripe ? (
          // A payment provider is live: the customer can pay without anyone
          // being involved.
          <Card className="mx-auto mb-8 max-w-2xl p-5">
            <CheckoutButtons
              prices={prices}
              notchpay={notchpay}
              campay={campay}
              stripe={stripe}
              signedIn={signedIn}
            />
          </Card>
        ) : manualPayment ? (
          // No provider, but Mobile Money is configured — so Pro can genuinely
          // be bought today, by hand. Slower than an API and entirely real.
          <div className="mx-auto mb-8 max-w-2xl">
            <ManualPayment prices={{ pro: proMonthly.amountXaf, max: maxMonthly.amountXaf }} />
          </div>
        ) : (
          <Notice tone="info" className="mx-auto mb-8 max-w-2xl text-center">
            <p className="font-semibold">{t("pricing.comingSoonTitle")}</p>
            <p className="mt-1">{t("pricing.comingSoonText")}</p>
          </Notice>
        )}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <PricingCard
            name={t("pricing.freeName")}
            price={t("pricing.freePrice")}
            period={t("pricing.freePeriod")}
            features={[
              t("pricing.freeFeature2"),
              t("pricing.freeFeature4"),
              t("pricing.freeFeature1"),
              t("pricing.freeFeature3"),
            ]}
            ctaLabel={t("pricing.freeCta")}
            ctaHref="/"
          />

          <PricingCard
            featured
            name={t("pricing.proName")}
            price={formatXaf(proMonthly.amountXaf, fr)}
            secondaryPrice={`${formatUsd(proMonthly.amountUsdCents, fr)} / ${t("pricing.proPeriod")}`}
            period={t("pricing.proPeriod")}
            features={[
              t("pricing.proFeature1"),
              t("pricing.proFeature2"),
              t("pricing.proFeature6"),
              t("pricing.proFeature3"),
              t("pricing.proFeature4"),
              t("pricing.proFeature5"),
            ]}
            note={t("pricing.proNote")}
            ctaLabel={
              payable ? t("pricing.proCta") : t("pricing.comingSoonTitle")
            }
            ctaHref={payable ? "#how-to-pay" : "/contact"}
            ctaDisabled={!payable}
          />

          <PricingCard
            name={t("pricing.maxName")}
            price={formatXaf(maxMonthly.amountXaf, fr)}
            secondaryPrice={`${formatUsd(maxMonthly.amountUsdCents, fr)} / ${t("pricing.maxPeriod")}`}
            period={t("pricing.maxPeriod")}
            features={[
              t("pricing.maxFeature1"),
              t("pricing.maxFeature2"),
              t("pricing.maxFeature3"),
              t("pricing.maxFeature4"),
            ]}
            note={t("pricing.maxNote")}
            ctaLabel={payable ? t("pricing.maxCta") : t("pricing.comingSoonTitle")}
            ctaHref={payable ? "#how-to-pay" : "/contact"}
            ctaDisabled={!payable}
          />
        </div>

        <PlanComparison />

        <div className="mt-14">
          <FAQ items={PRICING_FAQ} title={t("pricing.faqTitle")} />
        </div>
      </div>
    </div>
  );
}


/**
 * The comparison table, built from the SAME tier definitions the server
 * enforces.
 *
 * Deliberately not a hand-written table: a pricing page and an enforcement
 * table that are maintained separately will disagree, and the disagreement is
 * always discovered by a customer who paid for a number that was never real.
 * Every figure below is read from `TIERS`.
 */
function PlanComparison() {
  const { t } = useLocale();

  const rows: Array<{ label: string; values: [string, string, string] }> = [
    { label: t("pricing.rowTools"), values: ["✓", "✓", "✓"] },
    {
      label: t("pricing.rowDaily"),
      values: TIER_IDS.map((id) =>
        TIERS[id].dailyOperations < 0
          ? t("pricing.unlimited")
          : String(TIERS[id].dailyOperations),
      ) as [string, string, string],
    },
    {
      label: t("pricing.rowBatch"),
      values: TIER_IDS.map((id) => String(TIERS[id].batchFiles)) as [string, string, string],
    },
    {
      label: t("pricing.rowSize"),
      values: TIER_IDS.map((id) =>
        TIERS[id].fileSizeMultiplier === 1
          ? t("pricing.standard")
          : `×${TIERS[id].fileSizeMultiplier}`,
      ) as [string, string, string],
    },
    {
      label: t("pricing.rowZip"),
      values: TIER_IDS.map((id) => (TIERS[id].zipDownload ? "✓" : "—")) as [string, string, string],
    },
    { label: t("pricing.rowAds"), values: ["—", "✓", "✓"] },
    { label: t("pricing.rowSupport"), values: ["—", "✓", "✓"] },
  ];

  return (
    <div className="mt-12">
      <SectionHeading title={t("pricing.compareTitle")} />
      <Card className="mt-4 overflow-x-auto p-0">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <caption className="sr-only">{t("pricing.compareTitle")}</caption>
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className="px-4 py-3 font-semibold">
                {t("pricing.colFeature")}
              </th>
              <th scope="col" className="px-4 py-3 text-center font-semibold">
                {t("pricing.freeName")}
              </th>
              <th scope="col" className="px-4 py-3 text-center font-semibold text-violet-deep">
                {t("pricing.proName")}
              </th>
              <th scope="col" className="px-4 py-3 text-center font-semibold">
                {t("pricing.maxName")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-line/60 last:border-0">
                <th scope="row" className="px-4 py-3 text-left font-normal text-ink-soft">
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td key={index} className="px-4 py-3 text-center tabular-nums">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-center text-[12.5px] text-ink-soft">{t("pricing.compareNote")}</p>
    </div>
  );
}
