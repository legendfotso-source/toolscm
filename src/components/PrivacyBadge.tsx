"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { ProcessingMode } from "@/types/tool";
import { cx } from "./ui";

/**
 * This badge is a promise, so it is driven by the tool's declared processing
 * mode rather than hard-coded. If a tool ever needs a server, the badge says so
 * instead of quietly lying.
 */
export function PrivacyBadge({
  mode,
  size = "md",
  className,
}: {
  mode: ProcessingMode;
  size?: "sm" | "md";
  className?: string;
}) {
  const { t } = useLocale();

  if (mode === "server") {
    return (
      <span
        className={cx(
          "inline-flex items-center gap-2 rounded-full border border-[#fde68a] bg-warn-light px-3 py-1.5 font-medium text-[#854d0e]",
          size === "sm" ? "text-[12px]" : "text-[13px]",
          className,
        )}
      >
        <CloudGlyph />
        {t("privacy.serverProcessing")}
      </span>
    );
  }

  const label = mode === "none" ? t("privacy.noFile") : t("privacy.onDevice");

  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full border border-[#bbf7d0] bg-success-light px-3 py-1.5 font-medium text-[#166534]",
        size === "sm" ? "text-[12px]" : "text-[13px]",
        className,
      )}
    >
      <LockGlyph />
      {label}
    </span>
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

function CloudGlyph() {
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
      <path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 10.5 3.75 3.75 0 0 0 7 18Z" />
    </svg>
  );
}
