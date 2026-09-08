"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { ToolDefinition } from "@/types/tool";
import { ToolIcon } from "./ToolIcon";
import { Badge, cx } from "./ui";

export function ToolCard({ tool }: { tool: ToolDefinition }) {
  const { t, tx } = useLocale();
  const comingSoon = tool.status === "COMING_SOON";

  return (
    <Link
      href={`/tool/${tool.id}`}
      className={cx(
        "group relative flex min-h-[104px] flex-col rounded-[14px] border bg-white p-4 transition-all duration-150",
        comingSoon
          ? "border-line opacity-70 hover:opacity-100"
          : "border-line hover:border-violet-border hover:shadow-[0_4px_16px_-4px_rgb(109_40_217/0.12)]",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cx(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] transition-colors",
            comingSoon
              ? "bg-surface-alt text-ink-soft"
              : "bg-violet-light text-violet-deep group-hover:bg-violet-deep group-hover:text-white",
          )}
        >
          <ToolIcon name={tool.icon} className="h-[22px] w-[22px]" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[15px] font-semibold leading-6 text-ink">{tx(tool.name)}</h3>
            {tool.status === "BETA" ? <Badge tone="violet">{t("status.beta")}</Badge> : null}
            {comingSoon ? <Badge tone="neutral">{t("status.comingSoon")}</Badge> : null}
          </div>
          <p className="mt-1 text-[13.5px] leading-5 text-ink-soft">{tx(tool.short)}</p>
        </div>

        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={cx(
            "mt-2.5 h-4 w-4 shrink-0 transition-transform duration-150",
            comingSoon
              ? "text-[#d4d4d8]"
              : "text-[#a1a1aa] group-hover:translate-x-0.5 group-hover:text-violet-deep",
          )}
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </div>

      {tool.processingMode === "client" && !comingSoon ? (
        <p className="mt-3 flex items-center gap-1.5 text-[11.5px] font-medium text-ink-soft">
          <LockGlyph />
          {t("privacy.onDevice")}
        </p>
      ) : null}
    </Link>
  );
}

function LockGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3 text-success"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
