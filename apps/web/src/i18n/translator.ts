import type { DropdownOption } from "../app/types.ts";
import { EN_CATAN_MESSAGES } from "./locales/en/catan.ts";
import { EN_COMMON_MESSAGES } from "./locales/en/common.ts";
import { EN_OTHER_GAMES_MESSAGES } from "./locales/en/other-games.ts";
import { ZH_TW_CATAN_MESSAGES } from "./locales/zh-TW/catan.ts";
import { ZH_TW_COMMON_MESSAGES } from "./locales/zh-TW/common.ts";
import { ZH_TW_OTHER_GAMES_MESSAGES } from "./locales/zh-TW/other-games.ts";
import type { LocaleMeta, SupportedLocale, TranslationParams } from "./types.ts";

export const DEFAULT_LOCALE: SupportedLocale = "en";

export const SUPPORTED_LOCALES: readonly LocaleMeta[] = [
  {
    code: "en",
    shortLabel: "EN",
    nativeName: "English",
    htmlLang: "en",
  },
  {
    code: "zh-TW",
    shortLabel: "繁中",
    nativeName: "繁體中文",
    htmlLang: "zh-TW",
  },
];

export const EN_MESSAGES = {
  ...EN_COMMON_MESSAGES,
  ...EN_CATAN_MESSAGES,
  ...EN_OTHER_GAMES_MESSAGES,
} as const;

export type TranslationKey = keyof typeof EN_MESSAGES;

export const ZH_TW_MESSAGES: Readonly<Record<TranslationKey, string>> = {
  ...ZH_TW_COMMON_MESSAGES,
  ...ZH_TW_CATAN_MESSAGES,
  ...ZH_TW_OTHER_GAMES_MESSAGES,
};

const MESSAGES_BY_LOCALE: Readonly<
  Record<SupportedLocale, Readonly<Record<TranslationKey, string>>>
> = {
  en: EN_MESSAGES,
  "zh-TW": ZH_TW_MESSAGES,
};

export function normalizeLocale(
  raw: string | null | undefined
): SupportedLocale | null {
  if (!raw || typeof raw !== "string") return null;
  const clean = raw.trim().toLowerCase().replace(/_/g, "-");
  if (!clean) return null;
  if (clean === "en" || clean.startsWith("en-")) {
    return "en";
  }
  if (
    clean === "zh-tw" ||
    clean === "zh-hk" ||
    clean === "zh-mo" ||
    clean === "zh-hant" ||
    clean.startsWith("zh-hant-")
  ) {
    return "zh-TW";
  }
  return null;
}

export function detectBrowserLocale(
  languages?: readonly string[] | null,
  fallbackLanguage?: string | null
): SupportedLocale {
  const candidates: string[] = [];
  if (Array.isArray(languages)) {
    for (const lang of languages) {
      if (typeof lang === "string") candidates.push(lang);
    }
  }
  if (typeof fallbackLanguage === "string" && fallbackLanguage) {
    candidates.push(fallbackLanguage);
  }
  for (const candidate of candidates) {
    const matched = normalizeLocale(candidate);
    if (matched) return matched;
  }
  return DEFAULT_LOCALE;
}

export function getLocaleMeta(locale: SupportedLocale): LocaleMeta {
  return (
    SUPPORTED_LOCALES.find((l) => l.code === locale) ?? SUPPORTED_LOCALES[0]!
  );
}

export function getLocaleDropdownOptions(): DropdownOption[] {
  return SUPPORTED_LOCALES.map((meta) => ({
    value: meta.code,
    label: meta.nativeName,
    meta: meta.shortLabel,
  }));
}

export function t(
  locale: SupportedLocale,
  key: TranslationKey,
  params?: TranslationParams
): string {
  const catalog = MESSAGES_BY_LOCALE[locale] ?? EN_MESSAGES;
  const template = catalog[key] ?? EN_MESSAGES[key] ?? key;
  if (!params) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (full, name: string) => {
    const val = params[name];
    return val === undefined ? full : String(val);
  });
}
