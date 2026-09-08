"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import { popularTools } from "@/lib/tools/registry";
import { ToolGrid } from "./ToolGrid";
import { ToolSearch } from "./ToolSearch";
import { ButtonLink } from "./ui";

export function NotFoundContent() {
  const { locale, t } = useLocale();

  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-xl text-center">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-violet-deep">404</p>
        <h1 className="mt-2 text-[28px] font-extrabold tracking-[-0.02em] text-ink sm:text-[34px]">
          {locale === "fr" ? "Cette page n'existe pas" : "This page does not exist"}
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-ink-soft">
          {locale === "fr"
            ? "Le lien est peut-être erroné, ou l'outil a été renommé. Cherchez ce dont vous avez besoin ci-dessous."
            : "The link may be wrong, or the tool may have been renamed. Search for what you need below."}
        </p>

        <div className="mt-6">
          <ToolSearch />
        </div>

        <ButtonLink href="/" variant="secondary" size="lg" className="mt-4">
          {t("common.home")}
        </ButtonLink>
      </div>

      <div className="mx-auto mt-12 max-w-4xl">
        <h2 className="mb-4 text-center text-[16px] font-semibold text-ink">
          {t("home.popularTitle")}
        </h2>
        <ToolGrid tools={popularTools().slice(0, 6)} />
      </div>
    </div>
  );
}
