import type { WeatherAlert } from "./types";

// Advance the normalized durations from receipt, keeping future events above zero
// until their actual start. The source owns precipitation intensity thresholds.
export function advanceWeatherAlert(
  alert: WeatherAlert | undefined,
  elapsedMs: number,
  generatedAt?: string,
): WeatherAlert | undefined {
  if (!alert) return undefined;
  const elapsedMinutes = Math.max(0, elapsedMs) / 60_000;
  const endsInMinutes = typeof alert.endsInMinutes === "number"
    ? Math.max(0, Math.ceil(alert.endsInMinutes - elapsedMinutes))
    : undefined;
  if (endsInMinutes === 0) return undefined;
  const sourceStartMinutes = generatedAt
    ? (Date.parse(alert.startsAt) - Date.parse(generatedAt)) / 60_000
    : alert.startsInMinutes;
  const startMinutes = Number.isFinite(sourceStartMinutes)
    ? Math.min(alert.startsInMinutes, Math.max(0, sourceStartMinutes))
    : alert.startsInMinutes;
  return {
    ...alert,
    startsInMinutes: Math.max(0, Math.ceil(startMinutes - elapsedMinutes)),
    endsInMinutes,
  };
}
