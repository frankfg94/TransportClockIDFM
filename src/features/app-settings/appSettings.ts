import { computed, onMounted, watch, type ComputedRef, type Ref } from "vue";
import { useState } from "#imports";
import type {
  WeatherLocationPreset,
} from "../weather/weatherLocations";
import type {
  WeatherSettingsLocation,
} from "../weather/types";
import {
  isTransferResolverMode,
  transferResolverModeOptions,
  type TransferResolverMode,
} from "../service-pattern/transferResolverMode";

export { transferResolverModeOptions };
export type { TransferResolverMode };

export type ClosedDirectionSummaryMode = "last" | "next";
export type MaxDeparturesPerDirectionSetting =
  | "default"
  | 1
  | 2
  | 3
  | 4
  | 6
  | 8
  | 10;
export type WakeLockDuration =
  | "none"
  | "1m"
  | "30m"
  | "1h"
  | "3h"
  | "24h"
  | "unlimited";
export type NavigationAutoHide = "none" | "1m";
export type CompactLinePlanMode = "auto" | "comfort" | "compact";
export type TrafficInfoDesign = "ratp" | "cards";
export type TrafficInfoDefaultScope = "optimized" | "all";
export type TransferBundleRetentionDays = 1 | 3 | 7 | 15 | 30 | 60;
export type TransferBundleRequestConcurrency = 1 | 2 | 3 | 4;
export type TransferBundleRequestSpacingMs = 0 | 250 | 500 | 1000 | 1500 | 2000;
export type WeatherMode = "animated" | "static" | "alerts_only" | "disabled";
export type WeatherLookaheadMinutes = 60 | 120 | 240 | 480 | 720 | 1440;
export type WeatherTestMode = "off" | "rain" | "storm" | "snow" | "heat";

export interface AppSettings {
  version: 1;
  closedDirectionSummaryMode: ClosedDirectionSummaryMode;
  maxDeparturesPerDirection: MaxDeparturesPerDirectionSetting;
  showPatternMiniMap: boolean;
  terminalDirectionsOnly: boolean;
  hiddenDirectionIdsByBoardId: Record<string, string[]>;
  wakeLockDuration: WakeLockDuration;
  wakeDeviceOnAlarm: boolean;
  // Browser-side cache layer used before the backend bundle fallback.
  transferBundleLocalCacheEnabled: boolean;
  // Nuxt-side bundle cache shared by successive transfer requests.
  transferBundleBackendCacheEnabled: boolean;
  navigationAutoHide: NavigationAutoHide;
  reduceMotion: boolean;
  compactLinePlanMode: CompactLinePlanMode;
  richTransferTooltips: boolean;
  trafficInfoDesign: TrafficInfoDesign;
  trafficInfoDefaultScope: TrafficInfoDefaultScope;
  transferResolverMode: TransferResolverMode;
  transferBundleRetentionDays: TransferBundleRetentionDays;
  transferBundleRequestConcurrency: TransferBundleRequestConcurrency;
  transferBundleRequestSpacingMs: TransferBundleRequestSpacingMs;
  weatherMode: WeatherMode;
  weatherLookaheadMinutes: WeatherLookaheadMinutes;
  weatherLocationPreset: WeatherLocationPreset;
  weatherCustomLocation: WeatherSettingsLocation;
  weatherTestMode: WeatherTestMode;
}

export interface AppSettingsApi {
  settings: Ref<AppSettings>;
  effectiveMaxDeparturesPerDirection: ComputedRef<number | undefined>;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

export const APP_SETTINGS_STORAGE_KEY = "transport-clock.app-settings.v1";

export const closedDirectionSummaryOptions = [
  { id: "last", label: "Dernier passage" },
  { id: "next", label: "Prochain passage" },
] as const;

export const maxDeparturesPerDirectionOptions = [
  { id: "default", label: "Défaut actuel" },
  { id: "1", label: "1 passage" },
  { id: "2", label: "2 passages" },
  { id: "3", label: "3 passages" },
  { id: "4", label: "4 passages" },
  { id: "6", label: "6 passages" },
  { id: "8", label: "8 passages" },
  { id: "10", label: "10 passages" },
] as const;

export const wakeLockDurationOptions = [
  { id: "none", label: "Aucun" },
  { id: "1m", label: "1 min" },
  { id: "30m", label: "30 min" },
  { id: "1h", label: "1 h" },
  { id: "3h", label: "3 h" },
  { id: "24h", label: "24 h" },
  { id: "unlimited", label: "Illimité" },
] as const;

export const navigationAutoHideOptions = [
  { id: "none", label: "Aucun" },
  { id: "1m", label: "1 min" },
] as const;

export const compactLinePlanOptions = [
  { id: "auto", label: "Automatique" },
  { id: "comfort", label: "Vue confort" },
  { id: "compact", label: "Vue compacte" },
] as const;

export const trafficInfoDesignOptions = [
  { id: "ratp", label: "Style RATP compact" },
  { id: "cards", label: "Cartes détaillées" },
] as const;

export const trafficInfoDefaultScopeOptions = [
  { id: "optimized", label: "Optimisé" },
  { id: "all", label: "Toutes les lignes" },
] as const;

export const transferBundleRetentionOptions = [
  { id: "1", label: "1 jour" },
  { id: "3", label: "3 jours" },
  { id: "7", label: "7 jours" },
  { id: "15", label: "15 jours" },
  { id: "30", label: "30 jours" },
  { id: "60", label: "60 jours" },
] as const;

export const transferBundleRequestConcurrencyOptions = [
  { id: "1", label: "1 appel à la fois" },
  { id: "2", label: "2 appels simultanés" },
  { id: "3", label: "3 appels simultanés" },
  { id: "4", label: "4 appels simultanés" },
] as const;

export const transferBundleRequestSpacingOptions = [
  { id: "0", label: "Aucun delai" },
  { id: "250", label: "250 ms" },
  { id: "500", label: "500 ms" },
  { id: "1000", label: "1 s" },
  { id: "1500", label: "1,5 s" },
  { id: "2000", label: "2 s" },
] as const;

export const weatherModeOptions = [
  { id: "animated", label: "Alertes avec fond d'écran animé" },
  { id: "static", label: "Alertes avec fond d'écran statique" },
  { id: "alerts_only", label: "Alertes seulement" },
  { id: "disabled", label: "Désactivé" },
] as const;

export const weatherTestModeOptions = [
  { id: "off", label: "Aucun test" },
  { id: "rain", label: "Test pluie" },
  { id: "storm", label: "Test orage" },
  { id: "snow", label: "Test neige" },
  { id: "heat", label: "Test canicule" },
] as const;

export const weatherLookaheadOptions = [
  { id: "60", label: "1 h" },
  { id: "120", label: "2 h" },
  { id: "240", label: "4 h" },
  { id: "480", label: "8 h" },
  { id: "720", label: "12 h" },
  { id: "1440", label: "Toute la journée" },
] as const;

const wakeLockDurationMs: Record<WakeLockDuration, number | undefined> = {
  none: 0,
  "1m": 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "3h": 3 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  unlimited: undefined,
};

let storageLoaded = false;
let storageWatcherRegistered = false;

export function createDefaultAppSettings(): AppSettings {
  return {
    version: 1,
    closedDirectionSummaryMode: "last",
    maxDeparturesPerDirection: "default",
    showPatternMiniMap: true,
    terminalDirectionsOnly: false,
    wakeLockDuration: "none",
    wakeDeviceOnAlarm: true,
    navigationAutoHide: "none",
    hiddenDirectionIdsByBoardId: {},
    reduceMotion: false,
    compactLinePlanMode: "auto",
    richTransferTooltips: true,
    trafficInfoDesign: "ratp",
    trafficInfoDefaultScope: "optimized",
    transferResolverMode: "auto",
    // Enabled by default to use a frontend cache only if possible
    transferBundleLocalCacheEnabled: true,
    transferBundleBackendCacheEnabled: true,
    transferBundleRetentionDays: 15,
    transferBundleRequestConcurrency: 1,
    transferBundleRequestSpacingMs: 0,
    weatherMode: "animated",
    weatherLookaheadMinutes: 1440,
    weatherLocationPreset: "paris",
    weatherCustomLocation: {
      label: "Paris",
      latitude: 48.8566,
      longitude: 2.3522,
    },
    weatherTestMode: "off",
  };
}

export function normalizeAppSettings(value: unknown): AppSettings {
  const defaults = createDefaultAppSettings();

  if (!isRecord(value)) {
    return defaults;
  }

  return {
    version: 1,
    hiddenDirectionIdsByBoardId: parseHiddenDirectionIdsByBoardId(
      value.hiddenDirectionIdsByBoardId,
    ),
    closedDirectionSummaryMode: isClosedDirectionSummaryMode(
      value.closedDirectionSummaryMode,
    )
      ? value.closedDirectionSummaryMode
      : defaults.closedDirectionSummaryMode,
    maxDeparturesPerDirection: parseMaxDeparturesPerDirection(
      value.maxDeparturesPerDirection,
    ),
    showPatternMiniMap: readBoolean(
      value.showPatternMiniMap,
      defaults.showPatternMiniMap,
    ),
    terminalDirectionsOnly: readBoolean(
      value.terminalDirectionsOnly,
      defaults.terminalDirectionsOnly,
    ),
    wakeLockDuration: isWakeLockDuration(value.wakeLockDuration)
      ? value.wakeLockDuration
      : defaults.wakeLockDuration,
    wakeDeviceOnAlarm: readBoolean(
      value.wakeDeviceOnAlarm,
      defaults.wakeDeviceOnAlarm,
    ),
    navigationAutoHide: isNavigationAutoHide(value.navigationAutoHide)
      ? value.navigationAutoHide
      : defaults.navigationAutoHide,
    reduceMotion: readBoolean(value.reduceMotion, defaults.reduceMotion),
    compactLinePlanMode: isCompactLinePlanMode(value.compactLinePlanMode)
      ? value.compactLinePlanMode
      : defaults.compactLinePlanMode,
    richTransferTooltips: readBoolean(
      value.richTransferTooltips,
      defaults.richTransferTooltips,
    ),
    trafficInfoDesign: isTrafficInfoDesign(value.trafficInfoDesign)
      ? value.trafficInfoDesign
      : defaults.trafficInfoDesign,
    trafficInfoDefaultScope: isTrafficInfoDefaultScope(
      value.trafficInfoDefaultScope,
    )
      ? value.trafficInfoDefaultScope
      : defaults.trafficInfoDefaultScope,
    transferResolverMode: isTransferResolverMode(value.transferResolverMode)
      ? value.transferResolverMode
      : defaults.transferResolverMode,
    transferBundleLocalCacheEnabled: readBoolean(
      value.transferBundleLocalCacheEnabled,
      defaults.transferBundleLocalCacheEnabled,
    ),
    transferBundleBackendCacheEnabled: readBoolean(
      value.transferBundleBackendCacheEnabled,
      defaults.transferBundleBackendCacheEnabled,
    ),
    transferBundleRetentionDays: parseTransferBundleRetentionDays(
      value.transferBundleRetentionDays,
    ),
    transferBundleRequestConcurrency: parseTransferBundleRequestConcurrency(
      value.transferBundleRequestConcurrency,
    ),
    transferBundleRequestSpacingMs: parseTransferBundleRequestSpacingMs(
      value.transferBundleRequestSpacingMs,
    ),
    weatherMode: isWeatherMode(value.weatherMode)
      ? value.weatherMode
      : defaults.weatherMode,
    weatherLookaheadMinutes: parseWeatherLookaheadMinutes(
      value.weatherLookaheadMinutes,
    ),
    weatherLocationPreset: isWeatherLocationPreset(value.weatherLocationPreset)
      ? value.weatherLocationPreset
      : defaults.weatherLocationPreset,
    weatherCustomLocation: parseWeatherCustomLocation(
      value.weatherCustomLocation,
      defaults.weatherCustomLocation,
    ),
    weatherTestMode: isWeatherTestMode(value.weatherTestMode)
      ? value.weatherTestMode
      : defaults.weatherTestMode,
  };
}

export function parseMaxDeparturesPerDirection(
  value: unknown,
): MaxDeparturesPerDirectionSetting {
  if (value === "default") {
    return "default";
  }

  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return [1, 2, 3, 4, 6, 8, 10].includes(numericValue)
    ? (numericValue as MaxDeparturesPerDirectionSetting)
    : "default";
}

export function parseWeatherLookaheadMinutes(
  value: unknown,
): WeatherLookaheadMinutes {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return [60, 120, 240, 480, 720, 1440].includes(numericValue)
    ? (numericValue as WeatherLookaheadMinutes)
    : 1440;
}

export function parseTransferBundleRetentionDays(
  value: unknown,
): TransferBundleRetentionDays {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return [1, 3, 7, 15, 30, 60].includes(numericValue)
    ? (numericValue as TransferBundleRetentionDays)
    : 15;
}

export function parseTransferBundleRequestConcurrency(
  value: unknown,
): TransferBundleRequestConcurrency {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return [1, 2, 3, 4].includes(numericValue)
    ? (numericValue as TransferBundleRequestConcurrency)
    : 1;
}

function parseHiddenDirectionIdsByBoardId(
  value: unknown,
): Record<string, string[]> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([boardId, directionIds]) => {
      if (!Array.isArray(directionIds)) {
        return [];
      }

      const normalizedIds = [
        ...new Set(
          directionIds.filter(
            (directionId): directionId is string =>
              typeof directionId === "string" && directionId.length > 0,
          ),
        ),
      ];

      return normalizedIds.length > 0 ? [[boardId, normalizedIds]] : [];
    }),
  );
}

export function parseTransferBundleRequestSpacingMs(
  value: unknown,
): TransferBundleRequestSpacingMs {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return [0, 250, 500, 1000, 1500, 2000].includes(numericValue)
    ? (numericValue as TransferBundleRequestSpacingMs)
    : 0;
}

export function getEffectiveMaxDeparturesPerDirection(
  settings: AppSettings,
): number | undefined {
  return settings.maxDeparturesPerDirection === "default"
    ? undefined
    : settings.maxDeparturesPerDirection;
}

export function filterTerminalOnly<T extends { isTerminal?: boolean }>(
  items: T[],
  terminalOnly: boolean,
): T[] {
  return terminalOnly ? items.filter((item) => item.isTerminal !== false) : items;
}

export function getWakeLockDurationMs(
  duration: WakeLockDuration,
): number | undefined {
  return wakeLockDurationMs[duration];
}

export function useAppSettings(): AppSettingsApi {
  const settings = useState<AppSettings>("transport-clock.app-settings", () =>
    createDefaultAppSettings(),
  );
  const effectiveMaxDeparturesPerDirection = computed(() =>
    getEffectiveMaxDeparturesPerDirection(settings.value),
  );

  if (import.meta.client) {
    onMounted(() => {
      loadSettingsFromLocalStorage(settings);
      registerSettingsStorageWatcher(settings);
    });
  }

  function updateSettings(patch: Partial<AppSettings>): void {
    settings.value = normalizeAppSettings({
      ...settings.value,
      ...patch,
      version: 1,
    });
  }

  function resetSettings(): void {
    settings.value = createDefaultAppSettings();
  }

  return {
    settings,
    effectiveMaxDeparturesPerDirection,
    updateSettings,
    resetSettings,
  };
}

function loadSettingsFromLocalStorage(settings: Ref<AppSettings>): void {
  if (storageLoaded) {
    return;
  }

  storageLoaded = true;

  try {
    const rawValue = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);

    if (rawValue) {
      settings.value = normalizeAppSettings(JSON.parse(rawValue));
    }
  } catch (error) {
    console.warn("[app-settings] Unable to read saved settings", error);
    settings.value = createDefaultAppSettings();
  }
}

function registerSettingsStorageWatcher(settings: Ref<AppSettings>): void {
  if (storageWatcherRegistered) {
    return;
  }

  storageWatcherRegistered = true;

  watch(
    settings,
    (nextSettings) => {
      try {
        window.localStorage.setItem(
          APP_SETTINGS_STORAGE_KEY,
          JSON.stringify(normalizeAppSettings(nextSettings)),
        );
      } catch (error) {
        console.warn("[app-settings] Unable to persist settings", error);
      }
    },
    { deep: true },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isClosedDirectionSummaryMode(
  value: unknown,
): value is ClosedDirectionSummaryMode {
  return value === "last" || value === "next";
}

function isWakeLockDuration(value: unknown): value is WakeLockDuration {
  return [
    "none",
    "1m",
    "30m",
    "1h",
    "3h",
    "24h",
    "unlimited",
  ].includes(value as WakeLockDuration);
}

function isNavigationAutoHide(value: unknown): value is NavigationAutoHide {
  return value === "none" || value === "1m";
}

function isCompactLinePlanMode(value: unknown): value is CompactLinePlanMode {
  return value === "auto" || value === "comfort" || value === "compact";
}

function isTrafficInfoDesign(value: unknown): value is TrafficInfoDesign {
  return value === "ratp" || value === "cards";
}

function isTrafficInfoDefaultScope(
  value: unknown,
): value is TrafficInfoDefaultScope {
  return value === "optimized" || value === "all";
}

function isWeatherMode(value: unknown): value is WeatherMode {
  return (
    value === "animated" ||
    value === "static" ||
    value === "alerts_only" ||
    value === "disabled"
  );
}

function isWeatherTestMode(value: unknown): value is WeatherTestMode {
  return (
    value === "off" ||
    value === "rain" ||
    value === "storm" ||
    value === "snow" ||
    value === "heat"
  );
}

function isWeatherLocationPreset(
  value: unknown,
): value is WeatherLocationPreset {
  return (
    value === "paris" ||
    value === "la-defense" ||
    value === "saint-denis" ||
    value === "versailles" ||
    value === "custom"
  );
}

function parseWeatherCustomLocation(
  value: unknown,
  fallback: WeatherSettingsLocation,
): WeatherSettingsLocation {
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    label:
      typeof value.label === "string" && value.label.trim()
        ? value.label.trim()
        : fallback.label,
    latitude: parseCoordinate(value.latitude, fallback.latitude, -90, 90),
    longitude: parseCoordinate(value.longitude, fallback.longitude, -180, 180),
  };
}

function parseCoordinate(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  return Number.isFinite(numericValue)
    ? Math.min(max, Math.max(min, numericValue))
    : fallback;
}
