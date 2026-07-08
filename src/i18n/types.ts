export type AppLocale = "fr" | "en";
export type LanguagePreference = "auto" | AppLocale;

export const APP_LOCALES: AppLocale[] = ["fr", "en"];
export const LANGUAGE_PREFERENCES: LanguagePreference[] = ["auto", ...APP_LOCALES];

export function isAppLocale(value: unknown): value is AppLocale {
  return value === "fr" || value === "en";
}

export function isLanguagePreference(
  value: unknown,
): value is LanguagePreference {
  return value === "auto" || isAppLocale(value);
}
