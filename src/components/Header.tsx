"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { CATEGORY_ORDER } from "@/lib/tools/registry";
import { Logo } from "./Logo";
import { ToolSearch } from "./ToolSearch";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ButtonLink, cx } from "./ui";

export function Header() {
  const { t } = useLocale();
  const pathname = usePathname();
  // Remember which page the sheet was opened on. Navigating anywhere makes it
  // closed by derivation — no effect, and no frame where the old menu sits
  // over the new page.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const menuOpen = openedOn === pathname;
  const setMenuOpen = (open: boolean) => setOpenedOn(open ? pathname : null);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="container-page">
        <div className="flex h-16 items-center gap-3">
          <Logo />

          {/* Desktop search sits in the middle so it is reachable from any page. */}
          <div className="ml-2 hidden max-w-sm flex-1 lg:block">
            <ToolSearch variant="header" />
          </div>

          <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Principal">
            {CATEGORY_ORDER.map((category) => (
              <Link
                key={category}
                href={`/#${category}`}
                className="rounded-lg px-3 py-2 text-[14px] font-medium text-ink-soft transition-colors hover:bg-surface-alt hover:text-ink"
              >
                {t(`categories.${category}`)}
              </Link>
            ))}
            <Link
              href="/pricing"
              className={cx(
                "rounded-lg px-3 py-2 text-[14px] font-medium transition-colors hover:bg-surface-alt",
                pathname === "/pricing" ? "text-ink" : "text-ink-soft hover:text-ink",
              )}
            >
              {t("nav.pricing")}
            </Link>
            <div className="mx-1.5">
              <LanguageSwitcher />
            </div>
            <ButtonLink href="/pricing" size="md" className="!min-h-10">
              {t("nav.goPro")}
            </ButtonLink>
          </nav>

          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-lg border border-line text-ink transition-colors hover:bg-surface-alt md:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              {menuOpen ? (
                <path d="M6 6l12 12M18 6 6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>

        {/* On a phone the search field is the way in, so it stays visible on
            every page — except the homepage, whose hero already carries the
            primary one and does not need it twice above the fold. */}
        {pathname === "/" ? null : (
          <div className="pb-3 lg:hidden">
            <ToolSearch variant="header" />
          </div>
        )}
      </div>

      {menuOpen ? (
        <div
          id="mobile-menu"
          className="border-t border-line bg-white md:hidden"
        >
          <nav className="container-page flex flex-col gap-1 py-3" aria-label="Mobile">
            {CATEGORY_ORDER.map((category) => (
              <Link
                key={category}
                href={`/#${category}`}
                className="rounded-lg px-3 py-3 text-[15px] font-medium text-ink hover:bg-surface-alt"
              >
                {t(`categories.${category}`)}
              </Link>
            ))}
            <Link
              href="/pricing"
              className="rounded-lg px-3 py-3 text-[15px] font-medium text-ink hover:bg-surface-alt"
            >
              {t("nav.pricing")}
            </Link>
            <Link
              href="/contact"
              className="rounded-lg px-3 py-3 text-[15px] font-medium text-ink hover:bg-surface-alt"
            >
              {t("nav.contact")}
            </Link>

            <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-3">
              <LanguageSwitcher />
              <ButtonLink href="/pricing" className="flex-1">
                {t("nav.goPro")}
              </ButtonLink>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
