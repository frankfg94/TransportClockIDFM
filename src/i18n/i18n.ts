import { computed } from "vue";
import { useAppSettings } from "../features/app-settings/appSettings";
import { messages, type Messages } from "./messages";
import {
  APP_LOCALES,
  isAppLocale,
  isLanguagePreference,
  type AppLocale,
  type LanguagePreference,
} from "./types";

type Primitive = string | number | boolean | null | undefined;
export type TranslationParams = Record<string, Primitive>;

type Join<Prefix extends string, Key extends string> = `${Prefix}.${Key}`;

type LeafKeys<T, Prefix extends string = ""> = {
  [Key in keyof T & string]: T[Key] extends string
    ? Prefix extends ""
      ? Key
      : Join<Prefix, Key>
    : T[Key] extends Record<string, unknown>
      ? LeafKeys<T[Key], Prefix extends "" ? Key : Join<Prefix, Key>>
      : never;
}[keyof T & string];

export type TranslationKey = LeafKeys<Messages>;

export const FALLBACK_LOCALE: AppLocale = "fr";
export const DEFAULT_FR_TIME_ZONE = "Europe/Paris";

export function resolveLocale(
  preference: LanguagePreference,
  timeZone = getBrowserTimeZone(),
): AppLocale {
  if (isAppLocale(preference)) {
    return preference;
  }

  return timeZone === DEFAULT_FR_TIME_ZONE ? "fr" : "en";
}

export function normalizeLanguagePreference(
  value: unknown,
): LanguagePreference {
  return isLanguagePreference(value) ? value : "auto";
}

export function getBrowserTimeZone(): string | undefined {
  if (typeof Intl === "undefined") {
    return undefined;
  }

  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function translate(
  locale: AppLocale,
  key: TranslationKey,
  params: TranslationParams = {},
): string {
  const template = readMessage(messages[locale], key);

  return interpolate(template, params);
}

export function useI18n() {
  const { settings, updateSettings } = useAppSettings();
  const locale = computed(() => resolveLocale(settings.value.language));
  const languagePreference = computed(() => settings.value.language);

  function t(key: TranslationKey, params?: TranslationParams): string {
    return translate(locale.value, key, params);
  }

  function setLanguage(language: LanguagePreference): void {
    updateSettings({ language });
  }

  function d(
    value: Date | string | number,
    options: Intl.DateTimeFormatOptions,
  ): string {
    const date = value instanceof Date ? value : new Date(value);

    return Number.isNaN(date.getTime())
      ? String(value)
      : new Intl.DateTimeFormat(locale.value === "fr" ? "fr-FR" : "en-US", {
          ...options,
        }).format(date);
  }

  function n(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(locale.value === "fr" ? "fr-FR" : "en-US", {
      ...options,
    }).format(value);
  }

  return {
    APP_LOCALES,
    locale,
    languagePreference,
    setLanguage,
    t,
    d,
    n,
  };
}

function readMessage(bundle: Messages, key: TranslationKey): string {
  const value = key.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, bundle);

  if (typeof value !== "string") {
    return key;
  }

  return value;
}

function interpolate(template: string, params: TranslationParams): string {
  return template.replace(/\{(\w+)\}/gu, (_match, key: string) => {
    const value = params[key];

    return value === null || typeof value === "undefined" ? "" : String(value);
  });
}
