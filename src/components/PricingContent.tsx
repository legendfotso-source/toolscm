"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import { PricingCard } from "./PricingCard";
import { FAQ } from "./FAQ";
import { Breadcrumbs } from "./Breadcrumbs";
import { ManualPayment } from "./ManualPayment";
import { Notice, SectionHeading } from "./ui";
import { isManualPaymentAvailable } from "@/lib/site";
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

export function PricingContent() {
  const { t } = useLocale();

  const manualPayment = isManualPaymentAvailable();

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="mx-auto max-w-4xl" id="how-to-pay">
        <Breadcrumbs items={[{ label: t("nav.pricing") }]} />

        <SectionHeading title={t("pricing.title")} description={t("pricing.subtitle")} align="center" />

        {manualPayment ? (
          // Mobile Money is configured, so Pro can genuinely be bought today —
          // by hand, which is slower than an API and entirely real.
          <div className="mx-auto mb-8 max-w-2xl">
            <ManualPayment />
          </div>
        ) : (
          <Notice tone="info" className="mx-auto mb-8 max-w-2xl text-center">
            <p className="font-semibold">{t("pricing.comingSoonTitle")}</p>
            <p className="mt-1">{t("pricing.comingSoonText")}</p>
          </Notice>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
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
            price={t("pricing.proPrice")}
            secondaryPrice={`${t("pricing.proPriceIntl")} / ${t("pricing.proPeriod")}`}
            period={t("pricing.proPeriod")}
            features={[
              t("pricing.proFeature1"),
              t("pricing.proFeature2"),
              t("pricing.proFeature3"),
              t("pricing.proFeature4"),
              t("pricing.proFeature5"),
            ]}
            note={t("pricing.proNote")}
            ctaLabel={
              manualPayment
                ? t("pricing.proCta")
                : t("pricing.comingSoonTitle")
            }
            ctaHref={manualPayment ? "#how-to-pay" : "/contact"}
            ctaDisabled={!manualPayment}
          />
        </div>

        <div className="mt-14">
          <FAQ items={PRICING_FAQ} title={t("pricing.faqTitle")} />
        </div>
      </div>
    </div>
  );
}
