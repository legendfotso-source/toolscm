"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { ToolFaqEntry } from "@/types/tool";

/**
 * Native <details> rather than a JS accordion: it works before hydration,
 * is keyboard accessible for free, and is what a screen reader expects.
 */
export function FAQ({ items, title }: { items: ToolFaqEntry[]; title?: string }) {
  const { t, tx } = useLocale();
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="text-[20px] font-bold text-ink sm:text-[22px]">
        {title ?? t("faq.title")}
      </h2>
      <div className="mt-4 divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-white">
        {items.map((item, index) => (
          <details key={index} className="group">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 text-[15px] font-semibold text-ink hover:bg-surface-alt [&::-webkit-details-marker]:hidden">
              <span>{tx(item.q)}</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                className="mt-1 h-4 w-4 shrink-0 text-ink-soft transition-transform group-open:rotate-180"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <div className="px-4 pb-4 text-[14.5px] leading-6 text-ink-soft">{tx(item.a)}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
