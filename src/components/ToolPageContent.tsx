"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { ToolDefinition } from "@/types/tool";
import { toolsInCategory } from "@/lib/tools/registry";
import { Breadcrumbs } from "./Breadcrumbs";
import { PrivacyBadge } from "./PrivacyBadge";
import { ToolRunner } from "./ToolRunner";
import { FAQ } from "./FAQ";
import { ToolCard } from "./ToolCard";
import { AdSlot } from "./AdSlot";
import { Badge, SectionHeading } from "./ui";

const RELATED_COUNT = 3;

export function ToolPageContent({ tool }: { tool: ToolDefinition }) {
  const { t, tx } = useLocale();
  const primaryCategory = tool.categories[0];

  const related = toolsInCategory(primaryCategory)
    .filter((entry) => entry.id !== tool.id && entry.status !== "COMING_SOON")
    .slice(0, RELATED_COUNT);

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={[
            { label: t(`categories.${primaryCategory}`), href: `/#${primaryCategory}` },
            { label: tx(tool.name) },
          ]}
        />

        <header>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-ink sm:text-[32px]">
              {tx(tool.h1)}
            </h1>
            {tool.status === "BETA" ? <Badge tone="violet">{t("status.beta")}</Badge> : null}
            {tool.status === "COMING_SOON" ? (
              <Badge tone="neutral">{t("status.comingSoon")}</Badge>
            ) : null}
          </div>

          <p className="mt-2 text-[16px] leading-7 text-ink-soft">{tx(tool.subtitle)}</p>

          <div className="mt-4">
            <PrivacyBadge mode={tool.processingMode} />
          </div>
        </header>

        <AdSlot placement="tool-top" />

        <div className="mt-6">
          <ToolRunner tool={tool} />
        </div>

        {tool.about.length > 0 ? (
          <section className="mt-12 border-t border-line pt-8">
            <h2 className="text-[20px] font-bold text-ink sm:text-[22px]">
              {tx({ fr: "À propos de cet outil", en: "About this tool" })}
            </h2>
            <div className="mt-3 space-y-3">
              {tool.about.map((paragraph, index) => (
                <p key={index} className="text-[15px] leading-7 text-ink-soft">
                  {tx(paragraph)}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        {tool.faq.length > 0 ? (
          <div className="mt-10">
            <FAQ items={tool.faq} />
          </div>
        ) : null}

        <AdSlot placement="tool-bottom" />

        {related.length > 0 ? (
          <section className="mt-12 border-t border-line pt-8">
            <SectionHeading
              title={tx({ fr: "Outils similaires", en: "Related tools" })}
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((entry) => (
                <ToolCard key={entry.id} tool={entry} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
