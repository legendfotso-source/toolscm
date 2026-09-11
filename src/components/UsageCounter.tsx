"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import { cx } from "./ui";

/**
 * "2 free operations left today".
 *
 * Renders nothing when no limit applies — which is the case today, and also
 * for every Pro subscriber. An empty space is better than a counter that
 * counts nothing.
 */
export function UsageCounter({
  remaining,
  isPro,
}: {
  remaining: number;
  isPro: boolean;
}) {
  const { t } = useLocale();

  if (isPro || remaining < 0) return null;

  const last = remaining === 1;
  const none = remaining === 0;

  return (
    <p
      className={cx(
        "text-center text-[12.5px]",
        none || last ? "font-medium text-[#854d0e]" : "text-ink-soft",
      )}
      aria-live="polite"
    >
      {last ? t("usage.remainingOne") : t("usage.remaining", { count: remaining })}
      {none ? ` ${t("usage.resetNote")}` : ""}
    </p>
  );
}
