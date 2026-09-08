"use client";

import { useId } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { LocalizedText } from "@/lib/i18n/dictionaries";
import { cx } from "./ui";

export type OptionValue = string | number | boolean;
export type OptionValues = Record<string, OptionValue>;

type Base = {
  id: string;
  label: LocalizedText;
  hint?: LocalizedText;
  /** Hide an option that makes no sense given the current selection. */
  visibleWhen?: (values: OptionValues) => boolean;
};

export type OptionDescriptor =
  | (Base & {
      type: "select";
      default: string;
      choices: { value: string; label: LocalizedText; hint?: LocalizedText }[];
    })
  | (Base & {
      type: "cards";
      default: string;
      choices: { value: string; label: LocalizedText; hint?: LocalizedText }[];
    })
  | (Base & {
      type: "number";
      default: number;
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
    })
  | (Base & {
      type: "range";
      default: number;
      min: number;
      max: number;
      step: number;
      unit?: string;
    })
  | (Base & { type: "toggle"; default: boolean })
  | (Base & { type: "text"; default: string; placeholder?: LocalizedText })
  | (Base & { type: "color"; default: string });

export function defaultsFor(descriptors: OptionDescriptor[]): OptionValues {
  const values: OptionValues = {};
  for (const descriptor of descriptors) values[descriptor.id] = descriptor.default;
  return values;
}

export function ToolOptions({
  descriptors,
  values,
  onChange,
}: {
  descriptors: OptionDescriptor[];
  values: OptionValues;
  onChange: (id: string, value: OptionValue) => void;
}) {
  const { t } = useLocale();
  const visible = descriptors.filter((d) => !d.visibleWhen || d.visibleWhen(values));
  if (visible.length === 0) return null;

  return (
    <fieldset className="rounded-2xl border border-line bg-white p-4 sm:p-5">
      <legend className="px-1 text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
        {t("common.settings")}
      </legend>
      <div className="mt-2 space-y-5">
        {visible.map((descriptor) => (
          <Field
            key={descriptor.id}
            descriptor={descriptor}
            value={values[descriptor.id]}
            onChange={(value) => onChange(descriptor.id, value)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function Field({
  descriptor,
  value,
  onChange,
}: {
  descriptor: OptionDescriptor;
  value: OptionValue;
  onChange: (value: OptionValue) => void;
}) {
  const { tx } = useLocale();
  const id = useId();
  const label = tx(descriptor.label);
  const hint = descriptor.hint ? tx(descriptor.hint) : null;

  if (descriptor.type === "toggle") {
    return (
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-line accent-[#6D28D9]"
        />
        <div>
          <label htmlFor={id} className="cursor-pointer text-[14.5px] font-medium text-ink">
            {label}
          </label>
          {hint ? <p className="mt-0.5 text-[12.5px] text-ink-soft">{hint}</p> : null}
        </div>
      </div>
    );
  }

  if (descriptor.type === "cards") {
    return (
      <div role="radiogroup" aria-label={label}>
        <p className="mb-2 text-[14.5px] font-medium text-ink">{label}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {descriptor.choices.map((choice) => {
            const selected = value === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(choice.value)}
                className={cx(
                  "rounded-xl border p-3 text-left transition-colors",
                  selected
                    ? "border-violet-mid bg-violet-light ring-1 ring-violet-mid"
                    : "border-line bg-white hover:border-violet-border hover:bg-violet-light/40",
                )}
              >
                <span
                  className={cx(
                    "block text-[14px] font-semibold",
                    selected ? "text-violet-deep" : "text-ink",
                  )}
                >
                  {tx(choice.label)}
                </span>
                {choice.hint ? (
                  <span className="mt-0.5 block text-[12px] leading-4 text-ink-soft">
                    {tx(choice.hint)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {hint ? <p className="mt-2 text-[12.5px] text-ink-soft">{hint}</p> : null}
      </div>
    );
  }

  if (descriptor.type === "select") {
    return (
      <div>
        <label htmlFor={id} className="mb-1.5 block text-[14.5px] font-medium text-ink">
          {label}
        </label>
        <select
          id={id}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-[15px] text-ink focus:border-violet-mid focus:outline-none focus:ring-4 focus:ring-violet-light"
        >
          {descriptor.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {tx(choice.label)}
            </option>
          ))}
        </select>
        {hint ? <p className="mt-1.5 text-[12.5px] text-ink-soft">{hint}</p> : null}
      </div>
    );
  }

  if (descriptor.type === "range") {
    return (
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="text-[14.5px] font-medium text-ink">
            {label}
          </label>
          <span className="text-[14px] font-semibold tabular-nums text-violet-deep">
            {value}
            {descriptor.unit ?? ""}
          </span>
        </div>
        <input
          id={id}
          type="range"
          min={descriptor.min}
          max={descriptor.max}
          step={descriptor.step}
          value={Number(value)}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-6 w-full cursor-pointer accent-[#6D28D9]"
        />
        {hint ? <p className="mt-1 text-[12.5px] text-ink-soft">{hint}</p> : null}
      </div>
    );
  }

  if (descriptor.type === "number") {
    return (
      <div>
        <label htmlFor={id} className="mb-1.5 block text-[14.5px] font-medium text-ink">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={descriptor.min}
            max={descriptor.max}
            step={descriptor.step}
            value={String(value)}
            onChange={(event) => {
              const next = event.target.value === "" ? "" : Number(event.target.value);
              onChange(next === "" ? "" : (next as number));
            }}
            className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-[15px] text-ink focus:border-violet-mid focus:outline-none focus:ring-4 focus:ring-violet-light"
          />
          {descriptor.unit ? (
            <span className="shrink-0 text-[14px] text-ink-soft">{descriptor.unit}</span>
          ) : null}
        </div>
        {hint ? <p className="mt-1.5 text-[12.5px] text-ink-soft">{hint}</p> : null}
      </div>
    );
  }

  if (descriptor.type === "color") {
    return (
      <div>
        <label htmlFor={id} className="mb-1.5 block text-[14.5px] font-medium text-ink">
          {label}
        </label>
        <div className="flex items-center gap-3">
          <input
            id={id}
            type="color"
            value={String(value)}
            onChange={(event) => onChange(event.target.value)}
            className="h-11 w-16 cursor-pointer rounded-lg border border-line bg-white p-1"
          />
          <span className="font-mono text-[13px] uppercase text-ink-soft">{String(value)}</span>
        </div>
        {hint ? <p className="mt-1.5 text-[12.5px] text-ink-soft">{hint}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[14.5px] font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={String(value)}
        placeholder={descriptor.placeholder ? tx(descriptor.placeholder) : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-[15px] text-ink placeholder:text-ink-soft focus:border-violet-mid focus:outline-none focus:ring-4 focus:ring-violet-light"
      />
      {hint ? <p className="mt-1.5 text-[12.5px] text-ink-soft">{hint}</p> : null}
    </div>
  );
}
