import type { WeatherSettingsLocation } from "./types";

export type WeatherLocationPreset =
  | "paris"
  | "la-defense"
  | "saint-denis"
  | "versailles"
  | "custom";

export const weatherLocationOptions = [
  { id: "paris", label: "Paris" },
  { id: "la-defense", label: "La Défense" },
  { id: "saint-denis", label: "Saint-Denis" },
  { id: "versailles", label: "Versailles" },
  { id: "custom", label: "Personnalisé" },
] as const;

export const weatherLocationPresets: Record<
  Exclude<WeatherLocationPreset, "custom">,
  WeatherSettingsLocation
> = {
  paris: {
    label: "Paris",
    latitude: 48.8566,
    longitude: 2.3522,
  },
  "la-defense": {
    label: "La Défense",
    latitude: 48.8924,
    longitude: 2.2369,
  },
  "saint-denis": {
    label: "Saint-Denis",
    latitude: 48.9362,
    longitude: 2.3574,
  },
  versailles: {
    label: "Versailles",
    latitude: 48.8014,
    longitude: 2.1301,
  },
};

export function resolveWeatherLocation(
  preset: WeatherLocationPreset,
  customLocation?: Partial<WeatherSettingsLocation>,
): WeatherSettingsLocation {
  if (preset !== "custom") {
    return weatherLocationPresets[preset];
  }

  const latitude = sanitizeCoordinate(customLocation?.latitude, 48.8566, -90, 90);
  const longitude = sanitizeCoordinate(customLocation?.longitude, 2.3522, -180, 180);
  const label =
    typeof customLocation?.label === "string" && customLocation.label.trim()
      ? customLocation.label.trim()
      : "Lieu personnalisé";

  return {
    label,
    latitude,
    longitude,
  };
}

function sanitizeCoordinate(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}
