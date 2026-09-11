"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Button, ButtonLink, Notice } from "./ui";

/**
 * Shown when the free allowance for the day is used up.
 *
 * Deliberately not a trap: Escape closes it, the backdrop closes it, and
 * "continue free tomorrow" is a real, prominent option. Someone who cannot
 * afford 2,000 FCFA this month should leave with their dignity intact and come
 * back tomorrow, not feel cornered.
 */
export function PaywallModal({
  open,
  onClose,
  paymentsEnabled = false,
}: {
  open: boolean;
  onClose: () => void;
  paymentsEnabled?: boolean;
}) {
  const { t } = useLocale();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const benefits = [
    t("paywall.benefit1"),
    t("paywall.benefit2"),
    t("paywall.benefit3"),
    t("paywall.benefit4"),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-[0_24px_48px_-12px_rgb(24_24_27/0.35)] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id="paywall-title" className="text-[19px] font-bold leading-tight text-ink">
            {t("paywall.title")}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("paywall.close")}
            className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-alt hover:text-ink"
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
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <p className="mt-1.5 text-[15px] text-ink-soft">{t("paywall.subtitle")}</p>

        <ul className="mt-5 space-y-2.5">
          {benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2.5 text-[14.5px] leading-6 text-ink">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-1 h-4 w-4 shrink-0 text-violet-deep"
                aria-hidden="true"
              >
                <path d="m5 13 4 4L19 7" />
              </svg>
              {benefit}
            </li>
          ))}
        </ul>

        <p className="mt-5 flex items-baseline gap-1.5">
          <span className="text-[28px] font-extrabold tracking-[-0.02em] text-ink">
            {t("pricing.proPrice")}
          </span>
          <span className="text-[14px] text-ink-soft">/ {t("pricing.proPeriod")}</span>
        </p>

        <div className="mt-5 space-y-2.5">
          {paymentsEnabled ? (
            <>
              <ButtonLink href="/pricing?method=momo" size="lg" className="w-full">
                {t("paywall.payMomo")}
              </ButtonLink>
              <ButtonLink
                href="/pricing?method=card"
                variant="secondary"
                size="lg"
                className="w-full"
              >
                {t("paywall.payCard")}
              </ButtonLink>
            </>
          ) : (
            // Payments are not live. Saying so is better than a button that
            // leads nowhere.
            <Notice tone="warn">{t("paywall.unavailable")}</Notice>
          )}

          <Button variant="ghost" size="lg" className="w-full" onClick={onClose}>
            {t("paywall.later")}
          </Button>
        </div>

        <p className="mt-4 text-center text-[12.5px] text-ink-soft">
          {t("usage.resetNote")}{" "}
          <Link href="/pricing" className="underline underline-offset-2 hover:text-violet-deep">
            {t("nav.pricing")}
          </Link>
        </p>
      </div>
    </div>
  );
}
