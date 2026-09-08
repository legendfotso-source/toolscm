"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  isLocale,
  pick,
  translate,
  type Locale,
  type LocalizedText,
} from "./dictionaries";

const STORAGE_KEY = "toolscm.locale";

/* ------------------------------------------------------------------ */
/* The chosen locale as an external store                              */
/*                                                                     */
/* localStorage is genuinely external state, so useSyncExternalStore is */
/* the right tool: the server renders French, the client reads the      */
/* stored choice during hydration, and there is no set-state-in-effect  */
/* cascade in between.                                                  */
/* ------------------------------------------------------------------ */

const listeners = new Set<() => void>();

function readStored(): Locale | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    // Private browsing, or storage disabled entirely.
    return null;
  }
}

function readBrowserPreference(): Locale {
  const language = window.navigator.language?.slice(0, 2).toLowerCase();
  return language === "en" ? "en" : DEFAULT_LOCALE;
}

let cached: Locale | null = null;

function getSnapshot(): Locale {
  // The snapshot must be referentially stable between notifications, so it is
  // computed once and only recomputed when something actually changes it.
  cached ??= readStored() ?? readBrowserPreference();
  return cached;
}

function getServerSnapshot(): Locale {
  // French is the site's primary language, so the server-rendered HTML is
  // correct for the majority of visitors without any client round-trip.
  return DEFAULT_LOCALE;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cached = isLocale(event.newValue) ? event.newValue : null;
    listeners.forEach((notify) => notify());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function writeLocale(next: Locale): void {
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The choice simply does not persist; the session still switches.
  }
  listeners.forEach((notify) => notify());
}

/* ------------------------------------------------------------------ */

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  tx: (text: LocalizedText) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Keeping <html lang> in step is a genuine external-system update, which is
  // exactly what an effect is for.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => writeLocale(next), []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      tx: (text) => pick(text, locale),
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used inside <LocaleProvider>");
  }
  return ctx;
}
