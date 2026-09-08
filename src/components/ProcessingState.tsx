"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { ProgressReport } from "@/types/tool";
import { Button } from "./ui";

/**
 * Two progress presentations, and which one we show is decided by whether the
 * work actually reports progress. A percentage is only ever drawn from a real
 * count of finished pages or files — never invented to look busy.
 */
export function ProcessingState({
  progress,
  onCancel,
  local = true,
}: {
  progress: ProgressReport;
  onCancel?: () => void;
  local?: boolean;
}) {
  const { t, tx } = useLocale();

  const label = progress.label ? tx(progress.label) : t("processing.preparing");
  const determinate = progress.phase === "determinate";
  const percent = determinate
    ? Math.min(100, Math.round((progress.done / Math.max(1, progress.total)) * 100))
    : null;

  return (
    <div className="rounded-2xl border border-line bg-white p-6 text-center sm:p-8">
      <div
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-light"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none" className="tcm-spin h-6 w-6 text-violet-deep">
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeOpacity="0.2"
          />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <h2 className="mt-4 text-[17px] font-semibold text-ink">{t("processing.title")}</h2>
      <p className="mt-1 text-[14px] text-ink-soft">
        {local ? t("processing.local") : label}
      </p>

      <div
        className="relative mx-auto mt-5 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-surface-alt"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-label={label}
      >
        {determinate ? (
          <div
            className="h-full rounded-full bg-violet-deep transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="tcm-indeterminate absolute inset-0" />
        )}
      </div>

      <p className="mt-2 min-h-5 text-[12.5px] text-ink-soft">
        {determinate ? `${label} — ${percent}%` : label}
      </p>

      {onCancel ? (
        <Button variant="ghost" onClick={onCancel} className="mt-4">
          {t("processing.cancel")}
        </Button>
      ) : null}
    </div>
  );
}
