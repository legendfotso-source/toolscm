"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Badge, ButtonLink, cx } from "./ui";

export function PricingCard({
  name,
  price,
  secondaryPrice,
  period,
  features,
  ctaLabel,
  ctaHref,
  featured = false,
  note,
  ctaDisabled = false,
}: {
  name: string;
  price: string;
  secondaryPrice?: string;
  period: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  featured?: boolean;
  note?: string;
  ctaDisabled?: boolean;
}) {
  const { t } = useLocale();

  return (
    <div
      className={cx(
        "relative flex flex-col rounded-2xl border p-6 sm:p-7",
        featured
          ? "border-violet-mid bg-white shadow-[0_4px_24px_-6px_rgb(109_40_217/0.18)] ring-1 ring-violet-mid"
          : "border-line bg-white",
      )}
    >
      {featured ? (
        <div className="absolute -top-3 left-6">
          <Badge tone="violet" className="bg-violet-deep text-white">
            {t("pricing.proBadge")}
          </Badge>
        </div>
      ) : null}

      <h2 className={cx("text-[17px] font-bold", featured ? "text-violet-deep" : "text-ink")}>
        {name}
      </h2>

      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-[32px] font-extrabold tracking-[-0.02em] text-ink">{price}</span>
        <span className="text-[14px] text-ink-soft">/ {period}</span>
      </p>
      {secondaryPrice ? (
        <p className="mt-0.5 text-[13px] text-ink-soft">{secondaryPrice}</p>
      ) : null}

      <ul className="mt-6 flex-1 space-y-2.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-[14.5px] leading-6 text-ink">
            <CheckGlyph featured={featured} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {note ? <p className="mt-5 text-[12.5px] leading-5 text-ink-soft">{note}</p> : null}

      <ButtonLink
        href={ctaHref}
        variant={featured ? "primary" : "secondary"}
        size="lg"
        className={cx("mt-6 w-full", ctaDisabled && "pointer-events-none opacity-50")}
        aria-disabled={ctaDisabled || undefined}
      >
        {ctaLabel}
      </ButtonLink>
    </div>
  );
}

function CheckGlyph({ featured }: { featured: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("mt-1 h-4 w-4 shrink-0", featured ? "text-violet-deep" : "text-success")}
      aria-hidden="true"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}
