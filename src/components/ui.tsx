import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold " +
  "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 " +
  "select-none";

// 44px minimum height everywhere: these are tapped with thumbs far more
// often than clicked with a mouse.
const BUTTON_SIZES: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 text-[15px]",
  lg: "min-h-13 px-6 text-base",
};

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-violet-deep text-white hover:bg-[#5b21b6] active:bg-[#4c1d95] shadow-[0_1px_2px_rgba(24,24,27,0.08)]",
  secondary:
    "bg-white text-ink border border-line hover:bg-surface-alt hover:border-[#d4d4d8] active:bg-[#f4f4f5]",
  ghost: "bg-transparent text-violet-deep hover:bg-violet-light",
  danger: "bg-white text-danger border border-[#fecaca] hover:bg-danger-light",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra?: string,
): string {
  return cx(BUTTON_BASE, BUTTON_SIZES[size], BUTTON_VARIANTS[variant], extra);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-[14px] border border-line bg-white shadow-[0_1px_2px_0_rgb(24_24_27/0.04)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "violet" | "success" | "warn" | "danger";
  children: ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-surface-alt text-ink-soft border-line",
    violet: "bg-violet-light text-violet-deep border-violet-border",
    success: "bg-success-light text-success border-[#bbf7d0]",
    warn: "bg-warn-light text-[#a16207] border-[#fde68a]",
    danger: "bg-danger-light text-danger border-[#fecaca]",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Section heading                                                     */
/* ------------------------------------------------------------------ */

export function SectionHeading({
  title,
  description,
  id,
  align = "left",
}: {
  title: string;
  description?: string;
  id?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cx("mb-6", align === "center" && "text-center")}>
      <h2
        id={id}
        className="text-[22px] font-bold tracking-[-0.01em] text-ink sm:text-[26px]"
      >
        {title}
      </h2>
      {description ? (
        <p
          className={cx(
            "mt-2 max-w-2xl text-[15px] leading-6 text-ink-soft",
            align === "center" && "mx-auto",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Notice — used for honest, non-blocking messages                     */
/* ------------------------------------------------------------------ */

export function Notice({
  tone = "info",
  children,
  className,
  ...rest
}: {
  tone?: "info" | "warn" | "danger" | "success";
  children: ReactNode;
  className?: string;
} & Omit<ComponentProps<"div">, "children" | "className">) {
  const tones: Record<string, string> = {
    info: "border-violet-border bg-violet-light text-[#4c1d95]",
    warn: "border-[#fde68a] bg-warn-light text-[#854d0e]",
    danger: "border-[#fecaca] bg-danger-light text-[#991b1b]",
    success: "border-[#bbf7d0] bg-success-light text-[#166534]",
  };
  return (
    <div
      className={cx(
        "rounded-xl border px-4 py-3 text-[14px] leading-6",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
