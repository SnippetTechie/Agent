import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { TRANSLATIONS, interpolate, type LanguageCode, type Translations } from "./translations.js";
import { loadState, saveState } from "../storage.js";

const LANG_STORAGE_KEY = "varma.language.v1";

type DotPath<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends object
      ? DotPath<T[K], `${Prefix}${K}.`>
      : never;
}[keyof T & string];

export type TranslationKey = DotPath<Translations>;

interface I18nContextValue {
  lang: LanguageCode;
  setLang: (l: LanguageCode) => void;
  t: (path: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getByPath(obj: unknown, path: string): string {
  const value = path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
  return typeof value === "string" ? value : path;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>("en");

  useEffect(() => {
    let cancelled = false;
    loadState<LanguageCode>(LANG_STORAGE_KEY).then((saved) => {
      if (!cancelled && saved && saved in TRANSLATIONS) setLangState(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLang = useCallback((l: LanguageCode) => {
    setLangState(l);
    void saveState(LANG_STORAGE_KEY, l);
  }, []);

  const t = useCallback(
    (path: TranslationKey, params?: Record<string, string | number>) => {
      const dict = TRANSLATIONS[lang] ?? TRANSLATIONS.en;
      return interpolate(getByPath(dict, path), params);
    },
    [lang]
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
