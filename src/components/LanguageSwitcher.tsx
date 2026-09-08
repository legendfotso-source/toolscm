"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import { LOCALES } from "@/lib/i18n/dictionaries";
import { cx } from "./ui";

const LABELS: Record<string, string> = { fr: "FR", en: "EN" };
const FULL: Record<string, string> = { fr: "Français", en: "English" };

export function LanguageSwitcher({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const { locale, setLocale, t } = useLocale();

  if (variant === "full") {
    return (
      <ul className="space-y-2">
        {LOCALES.map((code) => (
          <li key={code}>
            <button
              type="button"
              onClick={() => setLocale(code)}
              aria-current={locale === code ? "true" : undefined}
              className={cx(
                "text-[14px] transition-colors",
                locale === code
                  ? "font-semibold text-violet-deep"
                  : "text-ink-soft hover:text-ink",
              )}
            >
              {FULL[code]}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div
      role="group"
      aria-label={t("nav.language")}
      className="inline-flex items-center rounded-lg border border-line bg-white p-0.5"
    >
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          title={FULL[code]}
          className={cx(
            "min-h-11 min-w-11 rounded-[7px] px-2.5 text-[13px] font-semibold transition-colors",
            locale === code
              ? "bg-violet-light text-violet-deep"
              : "text-ink-soft hover:text-ink",
          )}
        >
          {LABELS[code]}
        </button>
      ))}
    </div>
  );
}
