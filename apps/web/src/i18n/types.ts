export type SupportedLocale = "en" | "zh-TW";

export interface LocaleMeta {
  readonly code: SupportedLocale;
  readonly shortLabel: string;
  readonly nativeName: string;
  readonly htmlLang: string;
}

export type TranslationParams = Readonly<Record<string, string | number>>;
