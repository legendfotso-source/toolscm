"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { CATEGORY_ORDER, popularTools, toolsInCategory } from "@/lib/tools/registry";
import { ToolGrid } from "@/components/ToolGrid";
import { ToolSearch } from "@/components/ToolSearch";
import { ButtonLink, SectionHeading } from "@/components/ui";

export function HomeContent() {
  const { t } = useLocale();

  return (
    <>
      <Hero />

      <section aria-labelledby="popular-heading" className="container-page pt-14 sm:pt-16">
        <SectionHeading
          id="popular-heading"
          title={t("home.popularTitle")}
          description={t("home.popularSubtitle")}
        />
        <ToolGrid tools={popularTools()} />
      </section>

      {CATEGORY_ORDER.map((category) => (
        <section
          key={category}
          id={category}
          aria-labelledby={`${category}-heading`}
          className="container-page scroll-mt-28 pt-14 sm:pt-16"
        >
          <SectionHeading
            id={`${category}-heading`}
            title={t(`categories.${category}`)}
            description={t(`categories.${category}Description`)}
          />
          <ToolGrid tools={toolsInCategory(category)} />
        </section>
      ))}

      <ValueProps />
      <HowItWorks />
      <PrivacySection />
    </>
  );
}

function Hero() {
  const { t } = useLocale();

  return (
    <section className="border-b border-line bg-gradient-to-b from-violet-light/70 to-white">
      <div className="container-page py-12 text-center sm:py-16 lg:py-20">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#bbf7d0] bg-success-light px-3 py-1.5 text-[12.5px] font-medium text-[#166534]">
          <LockGlyph />
          {t("home.heroPrivacy")}
        </p>

        <h1 className="mx-auto mt-5 max-w-3xl text-[30px] font-extrabold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[40px] lg:text-[46px]">
          {t("home.heroTitle")}
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-[16px] leading-7 text-ink-soft sm:text-[17px]">
          {t("home.heroSubtitle")}
        </p>

        <div className="mx-auto mt-7 max-w-xl">
          <ToolSearch />
          <p className="mt-2 text-[12.5px] text-ink-soft">{t("home.searchHint")}</p>
        </div>

        <div className="mx-auto mt-6 flex max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
          <ButtonLink href="#popular-heading" size="lg" className="sm:px-7">
            {t("home.ctaPrimary")}
          </ButtonLink>
          <ButtonLink href="#pdf" variant="secondary" size="lg">
            {t("home.ctaSecondary")}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

function ValueProps() {
  const { t } = useLocale();

  const cards = [
    { icon: "📱", title: t("home.valueMobile"), text: t("home.valueMobileText") },
    { icon: "⚡", title: t("home.valueFast"), text: t("home.valueFastText") },
    { icon: "🔒", title: t("home.valuePrivate"), text: t("home.valuePrivateText") },
    { icon: "💜", title: t("home.valueAffordable"), text: t("home.valueAffordableText") },
  ];

  return (
    <section aria-labelledby="value-heading" className="container-page pt-16 sm:pt-20">
      <div className="rounded-3xl border border-line bg-surface-alt px-5 py-10 sm:px-10">
        <SectionHeading
          id="value-heading"
          title={t("home.valuePropTitle")}
          description={t("home.valuePropText")}
          align="center"
        />
        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((card) => (
            <div key={card.title} className="rounded-[14px] border border-line bg-white p-4">
              <span className="text-[22px]" aria-hidden="true">
                {card.icon}
              </span>
              <h3 className="mt-2 text-[14.5px] font-semibold text-ink">{card.title}</h3>
              <p className="mt-1 text-[12.5px] leading-5 text-ink-soft">{card.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useLocale();

  const steps = [
    { title: t("home.howStep1"), text: t("home.howStep1Text") },
    { title: t("home.howStep2"), text: t("home.howStep2Text") },
    { title: t("home.howStep3"), text: t("home.howStep3Text") },
  ];

  return (
    <section aria-labelledby="how-heading" className="container-page pt-16 sm:pt-20">
      <SectionHeading id="how-heading" title={t("home.howTitle")} align="center" />
      <ol className="mt-8 grid gap-4 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="rounded-[14px] border border-line bg-white p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-deep text-[15px] font-bold text-white">
              {index + 1}
            </span>
            <h3 className="mt-3 text-[15.5px] font-semibold text-ink">{step.title}</h3>
            <p className="mt-1 text-[13.5px] leading-5 text-ink-soft">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PrivacySection() {
  const { t } = useLocale();

  const points = [
    { title: t("home.privacyPoint1"), text: t("home.privacyPoint1Text") },
    { title: t("home.privacyPoint2"), text: t("home.privacyPoint2Text") },
    { title: t("home.privacyPoint3"), text: t("home.privacyPoint3Text") },
  ];

  return (
    <section aria-labelledby="privacy-heading" className="container-page pt-16 sm:pt-20">
      <div className="rounded-3xl bg-ink px-6 py-10 text-white sm:px-12 sm:py-14">
        <h2
          id="privacy-heading"
          className="max-w-xl text-[24px] font-bold tracking-[-0.01em] sm:text-[30px]"
        >
          {t("home.privacyTitle")}
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#d4d4d8]">
          {t("home.privacyText")}
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {points.map((point) => (
            <div key={point.title} className="rounded-[14px] bg-white/[0.07] p-4">
              <h3 className="flex items-center gap-2 text-[14.5px] font-semibold text-white">
                <CheckGlyph />
                {point.title}
              </h3>
              <p className="mt-1.5 text-[13px] leading-5 text-[#a1a1aa]">{point.text}</p>
            </div>
          ))}
        </div>

        <Link
          href="/privacy"
          className="mt-7 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#c4b5fd] underline-offset-4 hover:underline"
        >
          {t("footer.privacy")}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}

function LockGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#a78bfa"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}
