"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/dictionaries";
import { Breadcrumbs } from "./Breadcrumbs";

export type LegalSection = {
  heading: Record<Locale, string>;
  body: Record<Locale, string[]>;
};

export type LegalDocument = {
  title: Record<Locale, string>;
  intro: Record<Locale, string>;
  updated: string;
  sections: LegalSection[];
};

export function LegalContent({ document }: { document: LegalDocument }) {
  const { locale, tx } = useLocale();

  return (
    <div className="container-page py-6 sm:py-8">
      <article className="mx-auto max-w-2xl">
        <Breadcrumbs items={[{ label: tx(document.title) }]} />

        <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-ink sm:text-[34px]">
          {tx(document.title)}
        </h1>
        <p className="mt-2 text-[13px] text-ink-soft">
          {locale === "fr" ? "Dernière mise à jour : " : "Last updated: "}
          {document.updated}
        </p>
        <p className="mt-5 text-[16px] leading-7 text-ink-soft">{tx(document.intro)}</p>

        <div className="mt-10 space-y-9">
          {document.sections.map((section, index) => (
            <section key={index}>
              <h2 className="text-[19px] font-bold text-ink">{tx(section.heading)}</h2>
              <div className="mt-2.5 space-y-3">
                {section.body[locale].map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex} className="text-[15px] leading-7 text-ink-soft">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
