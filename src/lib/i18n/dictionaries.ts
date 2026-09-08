import fr from "@/locales/fr.json";
import en from "@/locales/en.json";

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** French is the default language of Tools.cm. English is the secondary. */
export const DEFAULT_LOCALE: Locale = "fr";

export const dictionaries = { fr, en } as const;

/** Shape of the dictionary, derived from the French file (the source of truth). */
export type Dictionary = typeof fr;

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "fr" || value === "en";
}

/**
 * Text that exists in both languages, stored alongside the data it describes
 * (tool names, FAQ entries, SEO copy). Keeping it next to the definition
 * prevents key drift between the two JSON files.
 */
export type LocalizedText = Record<Locale, string>;

export function pick(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text[DEFAULT_LOCALE];
}

type Vars = Record<string, string | number>;

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/**
 * Resolve a dotted key such as "upload.chooseFile" against a dictionary.
 * Falls back to French, then to the key itself, so a missing translation
 * degrades to readable text instead of blank UI.
 */
export function translate(
  locale: Locale,
  key: string,
  vars?: Vars,
): string {
  const resolved = lookup(dictionaries[locale], key) ?? lookup(dictionaries[DEFAULT_LOCALE], key);
  if (typeof resolved !== "string") return key;
  return interpolate(resolved, vars);
}

function lookup(dict: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
}
