"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Button, Notice, cx } from "../ui";

/* ------------------------------------------------------------------ */
/* Word counter                                                        */
/* ------------------------------------------------------------------ */

export function WordCounterTool() {
  const { locale } = useLocale();
  const [text, setText] = useState("");

  const stats = useMemo(() => {
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const charactersNoSpaces = text.replace(/\s/g, "").length;
    const sentences = trimmed ? (trimmed.match(/[.!?…]+(\s|$)/g) ?? []).length || 1 : 0;
    const paragraphs = trimmed ? trimmed.split(/\n\s*\n/).filter(Boolean).length : 0;
    // 200 words a minute is the usual figure for reading French or English prose.
    const readingMinutes = words > 0 ? Math.max(1, Math.round(words / 200)) : 0;
    return { words, characters: text.length, charactersNoSpaces, sentences, paragraphs, readingMinutes };
  }, [text]);

  const labels =
    locale === "fr"
      ? {
          words: "Mots",
          characters: "Caractères",
          charactersNoSpaces: "Sans espaces",
          sentences: "Phrases",
          paragraphs: "Paragraphes",
          reading: "Minutes de lecture",
          placeholder: "Collez ou saisissez votre texte ici...",
        }
      : {
          words: "Words",
          characters: "Characters",
          charactersNoSpaces: "Without spaces",
          sentences: "Sentences",
          paragraphs: "Paragraphs",
          reading: "Reading minutes",
          placeholder: "Paste or type your text here...",
        };

  return (
    <div className="space-y-4">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={labels.placeholder}
        rows={10}
        aria-label={labels.placeholder}
        className="w-full rounded-xl border border-line bg-white p-4 text-[15px] leading-6 text-ink placeholder:text-ink-soft focus:border-violet-mid focus:outline-none focus:ring-4 focus:ring-violet-light"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label={labels.words} value={stats.words} highlight />
        <StatTile label={labels.characters} value={stats.characters} />
        <StatTile label={labels.charactersNoSpaces} value={stats.charactersNoSpaces} />
        <StatTile label={labels.sentences} value={stats.sentences} />
        <StatTile label={labels.paragraphs} value={stats.paragraphs} />
        <StatTile label={labels.reading} value={stats.readingMinutes} />
      </div>

      <Notice tone="info">
        {locale === "fr"
          ? "Le comptage se fait dans cette page, au fur et à mesure. Votre texte n'est ni transmis ni conservé."
          : "Counting happens in this page as you type. Your text is neither transmitted nor stored."}
      </Notice>
    </div>
  );
}

function StatTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-xl border p-3 text-center",
        highlight ? "border-violet-border bg-violet-light" : "border-line bg-white",
      )}
    >
      <p
        className={cx(
          "text-[22px] font-bold tabular-nums",
          highlight ? "text-violet-deep" : "text-ink",
        )}
      >
        {value.toLocaleString("fr-FR")}
      </p>
      <p className="mt-0.5 text-[12px] text-ink-soft">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Case converter                                                      */
/* ------------------------------------------------------------------ */

type CaseMode = "upper" | "lower" | "title" | "sentence";

export function CaseConverterTool() {
  const { locale, t } = useLocale();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<CaseMode>("title");
  const [copied, setCopied] = useState(false);

  const output = useMemo(() => convertCase(text, mode), [text, mode]);

  const modes: { id: CaseMode; fr: string; en: string }[] = [
    { id: "upper", fr: "MAJUSCULES", en: "UPPER CASE" },
    { id: "lower", fr: "minuscules", en: "lower case" },
    { id: "title", fr: "Capitales Initiales", en: "Title Case" },
    { id: "sentence", fr: "Comme une phrase", en: "Sentence case" },
  ];

  return (
    <div className="space-y-4">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={locale === "fr" ? "Collez votre texte ici..." : "Paste your text here..."}
        rows={6}
        aria-label={locale === "fr" ? "Texte à convertir" : "Text to convert"}
        className="w-full rounded-xl border border-line bg-white p-4 text-[15px] leading-6 text-ink placeholder:text-ink-soft focus:border-violet-mid focus:outline-none focus:ring-4 focus:ring-violet-light"
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {modes.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setMode(entry.id)}
            aria-pressed={mode === entry.id}
            className={cx(
              "min-h-11 rounded-xl border px-3 text-[13.5px] font-medium transition-colors",
              mode === entry.id
                ? "border-violet-mid bg-violet-light text-violet-deep"
                : "border-line bg-white text-ink hover:bg-surface-alt",
            )}
          >
            {locale === "fr" ? entry.fr : entry.en}
          </button>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[14px] font-semibold text-ink">
            {locale === "fr" ? "Résultat" : "Result"}
          </p>
          <Button
            variant="ghost"
            disabled={!output}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(output);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? `✓ ${t("common.copied")}` : t("common.copy")}
          </Button>
        </div>
        <pre className="min-h-24 whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-alt p-4 text-[15px] leading-6 text-ink">
          {output}
        </pre>
      </div>
    </div>
  );
}

/**
 * French rules matter here: toLocaleUpperCase turns "é" into "É" and "à" into
 * "À", which plenty of naive converters get wrong.
 */
function convertCase(text: string, mode: CaseMode): string {
  if (!text) return "";
  switch (mode) {
    case "upper":
      return text.toLocaleUpperCase("fr-FR");
    case "lower":
      return text.toLocaleLowerCase("fr-FR");
    case "title":
      return text
        .toLocaleLowerCase("fr-FR")
        .replace(/(^|[\s'’"(\-–—/])(\p{L})/gu, (_match, prefix: string, letter: string) =>
          prefix + letter.toLocaleUpperCase("fr-FR"),
        );
    case "sentence":
      return text
        .toLocaleLowerCase("fr-FR")
        .replace(/(^\s*|[.!?…]\s+)(\p{L})/gu, (_match, prefix: string, letter: string) =>
          prefix + letter.toLocaleUpperCase("fr-FR"),
        );
  }
}

/* ------------------------------------------------------------------ */
/* Age calculator                                                      */
/* ------------------------------------------------------------------ */

export function AgeCalculatorTool() {
  const { locale } = useLocale();
  const today = new Date().toISOString().slice(0, 10);
  const [birth, setBirth] = useState("");
  const [reference, setReference] = useState(today);

  const result = useMemo(() => {
    if (!birth || !reference) return null;
    const from = new Date(`${birth}T00:00:00`);
    const to = new Date(`${reference}T00:00:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    if (to < from) return "invalid" as const;
    return diffDate(from, to);
  }, [birth, reference]);

  const labels =
    locale === "fr"
      ? {
          birth: "Date de naissance",
          reference: "Âge à la date du",
          referenceHint:
            "Beaucoup de concours fixent la limite d'âge à une date précise, pas au jour où vous postulez.",
          years: "ans",
          months: "mois",
          days: "jours",
          totalDays: "jours au total",
          invalid: "La date de référence est antérieure à la date de naissance.",
        }
      : {
          birth: "Date of birth",
          reference: "Age as of",
          referenceHint:
            "Many exams set the age limit at a precise date, not the day you apply.",
          years: "years",
          months: "months",
          days: "days",
          totalDays: "days in total",
          invalid: "The reference date is before the date of birth.",
        };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="birth" className="mb-1.5 block text-[14.5px] font-medium text-ink">
            {labels.birth}
          </label>
          <input
            id="birth"
            type="date"
            value={birth}
            max={today}
            onChange={(event) => setBirth(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-line bg-white px-3 text-[15px] text-ink focus:border-violet-mid focus:outline-none focus:ring-4 focus:ring-violet-light"
          />
        </div>
        <div>
          <label htmlFor="reference" className="mb-1.5 block text-[14.5px] font-medium text-ink">
            {labels.reference}
          </label>
          <input
            id="reference"
            type="date"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-line bg-white px-3 text-[15px] text-ink focus:border-violet-mid focus:outline-none focus:ring-4 focus:ring-violet-light"
          />
          <p className="mt-1.5 text-[12.5px] text-ink-soft">{labels.referenceHint}</p>
        </div>
      </div>

      {result === "invalid" ? (
        <Notice tone="danger">{labels.invalid}</Notice>
      ) : result ? (
        <div className="rounded-2xl border border-violet-border bg-violet-light p-6 text-center">
          <p className="text-[34px] font-extrabold leading-none text-violet-deep sm:text-[40px]">
            {result.years}{" "}
            <span className="text-[20px] font-bold sm:text-[24px]">{labels.years}</span>
          </p>
          <p className="mt-2 text-[15px] text-[#4c1d95]">
            {result.years} {labels.years} · {result.months} {labels.months} · {result.days}{" "}
            {labels.days}
          </p>
          <p className="mt-1 text-[13px] text-[#6d28d9]">
            {result.totalDays.toLocaleString("fr-FR")} {labels.totalDays}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function diffDate(from: Date, to: Date) {
  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();

  if (days < 0) {
    months -= 1;
    // Days in the month preceding the reference date.
    const previousMonth = new Date(to.getFullYear(), to.getMonth(), 0).getDate();
    days += previousMonth;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalDays = Math.floor((to.getTime() - from.getTime()) / 86_400_000);
  return { years, months, days, totalDays };
}
