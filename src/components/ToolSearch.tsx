"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { searchTools } from "@/lib/tools/registry";
import { ToolIcon } from "./ToolIcon";
import { Badge, cx } from "./ui";

const MAX_SUGGESTIONS = 6;

export function ToolSearch({
  variant = "hero",
  placeholderKey = "home.searchPlaceholder",
}: {
  variant?: "hero" | "header";
  placeholderKey?: string;
}) {
  const { t, tx, locale } = useLocale();
  const router = useRouter();
  const listId = useId();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(
    () => searchTools(query, locale).slice(0, MAX_SUGGESTIONS),
    [query, locale],
  );

  // Close when focus or a click leaves the combobox entirely.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    setQuery("");
    router.push(`/tool/${id}`);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[active].id);
    }
  };

  const isHero = variant === "hero";
  const showPanel = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <span
          className={cx(
            "pointer-events-none absolute inset-y-0 left-0 flex items-center text-ink-soft",
            isHero ? "pl-4" : "pl-3",
          )}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className={isHero ? "h-5 w-5" : "h-4 w-4"}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.4-3.4" />
          </svg>
        </span>

        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            // A new query means a new result list, so the highlight goes back
            // to the top here rather than in an effect that reacts to it.
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t(placeholderKey)}
          aria-label={t("search.label")}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          className={cx(
            "w-full rounded-xl border bg-white text-ink placeholder:text-ink-soft",
            "border-line focus:border-violet-mid focus:outline-none focus:ring-4 focus:ring-violet-light",
            "transition-shadow [&::-webkit-search-cancel-button]:hidden",
            isHero
              ? "min-h-14 pl-12 pr-4 text-[16px] shadow-[0_1px_2px_rgba(24,24,27,0.05)]"
              : "min-h-11 pl-9 pr-3 text-[14px]",
          )}
        />
      </div>

      {showPanel ? (
        <div
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border border-line bg-white shadow-[0_24px_48px_-12px_rgb(24_24_27/0.18)]"
          role="presentation"
        >
          {results.length === 0 ? (
            <div className="px-4 py-5 text-[14px] text-ink-soft">
              <p className="font-medium text-ink">{t("search.noResults", { query })}</p>
              <p className="mt-1">{t("search.noResultsHint")}</p>
            </div>
          ) : (
            <ul id={listId} role="listbox" className="max-h-[70vh] overflow-y-auto py-1">
              {results.map((tool, index) => (
                <li key={tool.id} role="option" aria-selected={index === active}>
                  <Link
                    href={`/tool/${tool.id}`}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                    }}
                    onMouseEnter={() => setActive(index)}
                    className={cx(
                      "flex items-center gap-3 px-3 py-2.5 transition-colors",
                      index === active ? "bg-violet-light" : "bg-white",
                    )}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-light text-violet-deep">
                      <ToolIcon name={tool.icon} className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-semibold text-ink">
                          {tx(tool.name)}
                        </span>
                        {tool.status === "COMING_SOON" ? (
                          <Badge tone="neutral">{t("status.comingSoon")}</Badge>
                        ) : null}
                      </span>
                      <span className="block truncate text-[12.5px] text-ink-soft">
                        {tx(tool.short)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
