export type TrafficLocale = "fr" | "en";

export const DEFAULT_TRAFFIC_LOCALE: TrafficLocale = "fr";

export function isTrafficLocale(value: unknown): value is TrafficLocale {
  return value === "fr" || value === "en";
}

export function resolveTrafficLocale(value: unknown): TrafficLocale {
  const normalized = String(
    Array.isArray(value) ? value[0] ?? "" : value ?? "",
  )
    .trim()
    .toLowerCase();

  return normalized.startsWith("en") ? "en" : DEFAULT_TRAFFIC_LOCALE;
}

export function getTrafficAcceptLanguage(locale: TrafficLocale): string {
  return locale === "en"
    ? "en-US,en;q=0.9,fr;q=0.8"
    : "fr-FR,fr;q=0.9,en;q=0.8";
}
