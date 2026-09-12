"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { CATEGORY_ORDER, toolsInCategory } from "@/lib/tools/registry";
import { LogoMark } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";

const COLUMN_LIMIT = 5;

export function Footer() {
  const { t, tx } = useLocale();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 border-t border-line bg-surface-alt">
      <div className="container-page py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 lg:col-span-2">
            <div className="flex items-center gap-2">
              <LogoMark className="h-7 w-7" />
              <span className="text-[17px] font-extrabold tracking-[-0.02em] text-ink">
                Tools<span className="text-violet-deep">.cm</span>
              </span>
            </div>
            <p className="mt-3 max-w-xs text-[13.5px] leading-6 text-ink-soft">
              {t("footer.pitch")}
            </p>
            <p className="mt-3 text-[12.5px] text-ink-soft">{t("footer.madeIn")}</p>
          </div>

          {CATEGORY_ORDER.map((category) => (
            <div key={category}>
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink">
                {t(`categories.${category}`)}
              </h2>
              <ul className="mt-3 space-y-2">
                {toolsInCategory(category)
                  .filter((tool) => tool.status !== "COMING_SOON")
                  .slice(0, COLUMN_LIMIT)
                  .map((tool) => (
                    <li key={tool.id}>
                      <Link
                        href={`/tool/${tool.id}`}
                        className="text-[13.5px] text-ink-soft transition-colors hover:text-violet-deep"
                      >
                        {tx(tool.name)}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}

          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink">
              {t("footer.companyTitle")}
            </h2>
            <ul className="mt-3 space-y-2">
              <li>
                <FooterLink href="/blog">{t("nav.blog")}</FooterLink>
              </li>
              <li>
                <FooterLink href="/pricing">{t("nav.pricing")}</FooterLink>
              </li>
              <li>
                <FooterLink href="/contact">{t("nav.contact")}</FooterLink>
              </li>
            </ul>

            <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-wide text-ink">
              {t("footer.legalTitle")}
            </h2>
            <ul className="mt-3 space-y-2">
              <li>
                <FooterLink href="/privacy">{t("footer.privacy")}</FooterLink>
              </li>
              <li>
                <FooterLink href="/terms">{t("footer.terms")}</FooterLink>
              </li>
              <li>
                <FooterLink href="/cookies">{t("footer.cookies")}</FooterLink>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12.5px] text-ink-soft">{t("footer.rights", { year })}</p>
          <div className="flex items-center gap-3">
            <span className="text-[12.5px] text-ink-soft">{t("footer.languageTitle")}</span>
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-[13.5px] text-ink-soft transition-colors hover:text-violet-deep"
    >
      {children}
    </Link>
  );
}
