"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import { CATEGORY_ORDER, toolsInCategory } from "@/lib/tools/registry";
import type { ToolCategory } from "@/types/tool";
import { ToolGrid } from "@/components/ToolGrid";
import { ToolSearch } from "@/components/ToolSearch";
import { SectionHeading } from "@/components/ui";
import { HowItWorks, PrivacySection, ValueProps } from "@/components/home/Sections";
import { NextStep, PageHead } from "./PageHead";

export function AllToolsPage() {
  const { t } = useLocale();
  return (
    <>
      <PageHead eyebrow={t("world.toolsPageEyebrow")} title={t("world.toolsPageTitle")} text={t("world.toolsPageText")} />
      <div className="container-page -mt-7 max-w-xl">
        <ToolSearch />
      </div>
      {CATEGORY_ORDER.map((category) => (
        <section key={category} aria-labelledby={`${category}-heading`} className="container-page pt-14 sm:pt-16">
          <SectionHeading
            id={`${category}-heading`}
            title={t(`categories.${category}`)}
            description={t(`categories.${category}Description`)}
          />
          <ToolGrid tools={toolsInCategory(category)} />
        </section>
      ))}
      <NextStep title={t("world.endTitle")} href="/comment-ca-marche" label={t("world.navHow")} />
    </>
  );
}

export function CategoryPage({ category }: { category: ToolCategory }) {
  const { t } = useLocale();
  const n = String(CATEGORY_ORDER.indexOf(category) + 1).padStart(2, "0");
  return (
    <>
      <PageHead eyebrow={t("world.categoryEyebrow")} title={t(`categories.${category}`)} text={t(`categories.${category}Description`)} number={n} />
      <section className="container-page pt-12">
        <ToolGrid tools={toolsInCategory(category)} />
      </section>
      <NextStep title={t("world.nextTitle")} href="/outils" label={t("world.navAll")} />
    </>
  );
}

export function HowPage() {
  const { t } = useLocale();
  return (
    <>
      <PageHead eyebrow={t("world.howEyebrow")} title={t("world.howPageTitle")} text={t("world.howPageText")} />
      <HowItWorks />
      <ValueProps />
      <PrivacySection />
      <NextStep title={t("world.nextTitle")} href="/outils" label={t("world.nextCta")} />
    </>
  );
}
