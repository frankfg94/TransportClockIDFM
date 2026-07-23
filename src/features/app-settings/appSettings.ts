import { computed, onMounted, watch, type ComputedRef, type Ref } from "vue";
import { useState } from "#imports";
import type { WeatherLocationPreset } from "../weather/weatherLocations";
import type { WeatherSettingsLocation } from "../weather/types";
import {
  isTransferResolverMode,
  transferResolverModeOptions,
  type TransferResolverMode,
} from "../service-pattern/transferResolverMode";
import { isLanguagePreference, type LanguagePreference } from "../../i18n/types";
import { transportClockPlugins } from "#transport-clock/plugins";
import type { TrafficCalendarImpactScope } from "../traffic/types";

export { transferResolverModeOptions };
export type { TrafficCalendarImpactScope, TransferResolverMode };

export type ClosedDirectionSummaryMode = "last" | "next";
export type MaxDeparturesPerDirectionSetting = "default" | 1 | 2 | 3 | 4 | 6 | 8 | 10;
export type WakeLockDuration = "none" | "1m" | "30m" | "1h" | "3h" | "24h" | "unlimited";
export type NavigationAutoHide = "none" | "1m";
export type BoardTogglesPlacement = "inline" | "context-menu";
export type PlacePresetNavigationMode = "dropdown-swipe" | "dropdown" | "swipe";
export type CompactLinePlanMode = "auto" | "comfort" | "compact" | "realistic";
export type TrafficInfoDesign = "ratp" | "cards";
export type TrafficInfoDefaultScope = "optimized" | "all";
export type FullscreenStationPanelDesign = "all-directions" | "double-stop" | "home-card";
export type TransferBundleRetentionDays = 1 | 3 | 7 | 15 | 30 | 60;
export type TransferBundleRequestConcurrency = 1 | 2 | 3 | 4;
export type TransferBundleRequestSpacingMs = 0 | 250 | 500 | 1000 | 1500 | 2000;
export type TrafficWarningLookaheadDays = number;
export type WeatherMode = "animated" | "static" | "alerts_only" | "disabled";
export type WeatherLookaheadMinutes = 60 | 120 | 240 | 480 | 720 | 1440;
export type WeatherTestMode = "off" | "rain" | "storm" | "snow" | "heat";
export type AppLanguageSetting = LanguagePreference;
export type PluginViewerMode = "grid" | "list";

export const PATTERN_COMPACT_BRANCH_GAP_DEFAULT = 258;
export const PATTERN_COMPACT_BRANCH_GAP_MIN = 180;
export const PATTERN_COMPACT_BRANCH_GAP_MAX = 360;
export const PATTERN_COMPACT_FORK_GAP_DEFAULT = 158;
export const PATTERN_COMPACT_FORK_GAP_MIN = 110;
export const PATTERN_COMPACT_FORK_GAP_MAX = 260;
export const PATTERN_REALISTIC_MIN_GAP_COEFFICIENT_DEFAULT = 0.5;
export const PATTERN_REALISTIC_MIN_GAP_COEFFICIENT_MIN = 0.25;
export const PATTERN_REALISTIC_MIN_GAP_COEFFICIENT_MAX = 1.25;
export const PATTERN_REALISTIC_MAX_GAP_COEFFICIENT_DEFAULT = 5;
export const PATTERN_REALISTIC_MAX_GAP_COEFFICIENT_MIN = 1.25;
export const PATTERN_REALISTIC_MAX_GAP_COEFFICIENT_MAX = 8;
export const TRAFFIC_WARNING_LOOKAHEAD_DAYS_DEFAULT = 10;
export const TRAFFIC_WARNING_LOOKAHEAD_DAYS_MIN = 0;
export const TRAFFIC_WARNING_LOOKAHEAD_DAYS_MAX = 30;

export interface AppSettings {
  version: 2;
  language: AppLanguageSetting;
  closedDirectionSummaryMode: ClosedDirectionSummaryMode;
  maxDeparturesPerDirection: MaxDeparturesPerDirectionSetting;
  showPatternMiniMap: boolean;
  showPatternCityZones: boolean;
  terminalDirectionsOnly: boolean;
  hiddenDirectionIdsByBoardId: Record<string, string[]>;
  wakeLockDuration: WakeLockDuration;
  wakeDeviceOnAlarm: boolean;
  boardTogglesPlacement: BoardTogglesPlacement;
  placePresetNavigationMode: PlacePresetNavigationMode;
  // Browser-side cache layer used before the backend bundle fallback.
  transferBundleLocalCacheEnabled: boolean;
  // Nuxt-side bundle cache shared by successive transfer requests.
  transferBundleBackendCacheEnabled: boolean;
  navigationAutoHide: NavigationAutoHide;
  reduceMotion: boolean;
  pluginViewerMode: PluginViewerMode;
  plugins: Record<string, AppPluginSettingsEntry>;
  legacyPluginData: Record<string, unknown>;
  compactLinePlanMode: CompactLinePlanMode;
  patternRoundedCurves: boolean;
  showInterruptionWalkingTimes: boolean;
  patternCompactBranchGap: number;
  patternCompactForkGap: number;
  patternRealisticMinGapCoefficient: number;
  patternRealisticMaxGapCoefficient: number;
  richTransferTooltips: boolean;
  ghostNetworkStructuralOnly: boolean;
  gtfsLineGeometryEnabled: boolean;
  trafficCalendarImpactScope: TrafficCalendarImpactScope;
  trafficInfoDesign: TrafficInfoDesign;
  trafficInfoDefaultScope: TrafficInfoDefaultScope;
  trafficWarningLookaheadDays: TrafficWarningLookaheadDays;
  fullscreenStationPanelDesign: FullscreenStationPanelDesign;
  fullscreenStationPanelDarkTheme: boolean;
  smartTrafficDetection: boolean;
  smartTrafficModalFormatting: boolean;
  transferResolverMode: TransferResolverMode;
  transferBundleRetentionDays: TransferBundleRetentionDays;
  transferBundleRequestConcurrency: TransferBundleRequestConcurrency;
  transferBundleRequestSpacingMs: TransferBundleRequestSpacingMs;
  weatherMode: WeatherMode;
  weatherLookaheadMinutes: WeatherLookaheadMinutes;
  weatherShowApparentTemperature: boolean;
  weatherLocationPreset: WeatherLocationPreset;
  weatherCustomLocation: WeatherSettingsLocation;
  weatherTestMode: WeatherTestMode;
}

export interface AppPluginSettingsEntry {
  enabled: boolean;
  value: unknown;
  version: number;
}

export interface AppSettingsApi {
  settings: Ref<AppSettings>;
  effectiveMaxDeparturesPerDirection: ComputedRef<number | undefined>;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

export const APP_SETTINGS_STORAGE_KEY = "transport-clock.app-settings.v1";

export const closedDirectionSummaryOptions = [
  { id: "last", label: "Last departure" },
  { id: "next", label: "Next departure" },
] as const;

export const maxDeparturesPerDirectionOptions = [
  { id: "default", label: "Current default" },
  { id: "1", label: "1 departure" },
  { id: "2", label: "2 departures" },
  { id: "3", label: "3 departures" },
  { id: "4", label: "4 departures" },
  { id: "6", label: "6 departures" },
  { id: "8", label: "8 departures" },
  { id: "10", label: "10 departures" },
] as const;

export const wakeLockDurationOptions = [
  { id: "none", label: "None" },
  { id: "1m", label: "1 min" },
  { id: "30m", label: "30 min" },
  { id: "1h", label: "1 h" },
  { id: "3h", label: "3 h" },
  { id: "24h", label: "24 h" },
  { id: "unlimited", label: "Unlimited" },
] as const;

export const navigationAutoHideOptions = [
  { id: "none", label: "None" },
  { id: "1m", label: "1 min" },
] as const;

export const boardTogglesPlacementOptions = [
  { id: "inline", label: "Visible directly (except mobile)" },
  { id: "context-menu", label: "In the context menu" },
] as const;

export const placePresetNavigationModeOptions = [
  { id: "dropdown-swipe", label: "Dropdown + swipe" },
  { id: "dropdown", label: "Dropdown only" },
  { id: "swipe", label: "Swipe only" },
] as const;

export const compactLinePlanOptions = [
  { id: "auto", label: "Automatic" },
  { id: "comfort", label: "Comfort view" },
  { id: "compact", label: "Compact view" },
  { id: "realistic", label: "Realistic view" },
] as const;
export const trafficCalendarImpactScopeOptions = [
  { id: "interruptions-only", label: "Interruptions only" },
  { id: "all-impacts", label: "Interruptions and disruptions" },
] as const;

export const trafficInfoDesignOptions = [
  { id: "ratp", label: "Compact RATP style" },
  { id: "cards", label: "Detailed cards" },
] as const;

export const trafficInfoDefaultScopeOptions = [
  { id: "optimized", label: "Optimized" },
  { id: "all", label: "All lines" },
] as const;

export const fullscreenStationPanelDesignOptions = [
  { id: "all-directions", label: "All directions" },
  { id: "double-stop", label: "Double stop" },
  { id: "home-card", label: "Station card" },
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
  { id: "1", label: "1 call at a time" },
  { id: "2", label: "2 simultaneous calls" },
  { id: "3", label: "3 simultaneous calls" },
  { id: "4", label: "4 simultaneous calls" },
] as const;

export const transferBundleRequestSpacingOptions = [
  { id: "0", label: "No delay" },
  { id: "250", label: "250 ms" },
  { id: "500", label: "500 ms" },
  { id: "1000", label: "1 s" },
  { id: "1500", label: "1,5 s" },
  { id: "2000", label: "2 s" },
] as const;

export const weatherModeOptions = [
  { id: "animated", label: "Alerts with animated background" },
  { id: "static", label: "Alerts with static background" },
  { id: "alerts_only", label: "Alerts only" },
  { id: "disabled", label: "Disabled" },
] as const;

export const weatherTestModeOptions = [
  { id: "off", label: "No test" },
  { id: "rain", label: "Rain test" },
  { id: "storm", label: "Storm test" },
  { id: "snow", label: "Snow test" },
  { id: "heat", label: "Heatwave test" },
] as const;

export const weatherLookaheadOptions = [
  { id: "60", label: "1 h" },
  { id: "120", label: "2 h" },
  { id: "240", label: "4 h" },
  { id: "480", label: "8 h" },
  { id: "720", label: "12 h" },
  { id: "1440", label: "All day" },
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
    version: 2,
    language: "auto",
    closedDirectionSummaryMode: "next",
    maxDeparturesPerDirection: "default",
    showPatternMiniMap: true,
    showPatternCityZones: true,
    terminalDirectionsOnly: false,
    wakeLockDuration: "none",
    wakeDeviceOnAlarm: true,
    boardTogglesPlacement: "inline",
    placePresetNavigationMode: "dropdown-swipe",
    navigationAutoHide: "none",
    hiddenDirectionIdsByBoardId: {},
    reduceMotion: false,
    pluginViewerMode: "grid",
    plugins: createDefaultPluginSettings(),
    legacyPluginData: {},
    compactLinePlanMode: "compact",
    patternRoundedCurves: true,
    showInterruptionWalkingTimes: true,
    patternCompactBranchGap: PATTERN_COMPACT_BRANCH_GAP_DEFAULT,
    patternCompactForkGap: PATTERN_COMPACT_FORK_GAP_DEFAULT,
    patternRealisticMinGapCoefficient: PATTERN_REALISTIC_MIN_GAP_COEFFICIENT_DEFAULT,
    patternRealisticMaxGapCoefficient: PATTERN_REALISTIC_MAX_GAP_COEFFICIENT_DEFAULT,
    richTransferTooltips: true,
    ghostNetworkStructuralOnly: false,
    gtfsLineGeometryEnabled: true,
    trafficCalendarImpactScope: "all-impacts",
    trafficInfoDesign: "ratp",
    trafficInfoDefaultScope: "optimized",
    trafficWarningLookaheadDays: TRAFFIC_WARNING_LOOKAHEAD_DAYS_DEFAULT,
    fullscreenStationPanelDesign: "all-directions",
    fullscreenStationPanelDarkTheme: false,
    smartTrafficDetection: true,
    smartTrafficModalFormatting: true,
    transferResolverMode: "auto",
    // Enabled by default to use a frontend cache only if possible
    transferBundleLocalCacheEnabled: true,
    transferBundleBackendCacheEnabled: true,
    transferBundleRetentionDays: 15,
    transferBundleRequestConcurrency: 1,
    transferBundleRequestSpacingMs: 0,
    weatherMode: "animated",
    weatherLookaheadMinutes: 1440,
    weatherShowApparentTemperature: true,
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

  const patternRealisticMinGapCoefficient = parsePatternRealisticMinGapCoefficient(
    value.patternRealisticMinGapCoefficient,
  );
  const pluginState = normalizePluginSettings(value, defaults);

  return {
    version: 2,
    language: isLanguagePreference(value.language) ? value.language : defaults.language,
    hiddenDirectionIdsByBoardId: parseHiddenDirectionIdsByBoardId(
      value.hiddenDirectionIdsByBoardId,
    ),
    closedDirectionSummaryMode: isClosedDirectionSummaryMode(value.closedDirectionSummaryMode)
      ? value.closedDirectionSummaryMode
      : defaults.closedDirectionSummaryMode,
    maxDeparturesPerDirection: parseMaxDeparturesPerDirection(value.maxDeparturesPerDirection),
    showPatternMiniMap: readBoolean(value.showPatternMiniMap, defaults.showPatternMiniMap),
    showPatternCityZones: readBoolean(value.showPatternCityZones, defaults.showPatternCityZones),
    terminalDirectionsOnly: readBoolean(
      value.terminalDirectionsOnly,
      defaults.terminalDirectionsOnly,
    ),
    wakeLockDuration: isWakeLockDuration(value.wakeLockDuration)
      ? value.wakeLockDuration
      : defaults.wakeLockDuration,
    wakeDeviceOnAlarm: readBoolean(value.wakeDeviceOnAlarm, defaults.wakeDeviceOnAlarm),
    boardTogglesPlacement: isBoardTogglesPlacement(value.boardTogglesPlacement)
      ? value.boardTogglesPlacement
      : defaults.boardTogglesPlacement,
    placePresetNavigationMode: parsePlacePresetNavigationMode(
      value.placePresetNavigationMode,
      value.placeSwipeNavigationEnabled,
    ),
    navigationAutoHide: isNavigationAutoHide(value.navigationAutoHide)
      ? value.navigationAutoHide
      : defaults.navigationAutoHide,
    reduceMotion: readBoolean(value.reduceMotion, defaults.reduceMotion),
    pluginViewerMode: isPluginViewerMode(value.pluginViewerMode)
      ? value.pluginViewerMode
      : defaults.pluginViewerMode,
    plugins: pluginState.plugins,
    legacyPluginData: pluginState.legacyPluginData,
    compactLinePlanMode: isCompactLinePlanMode(value.compactLinePlanMode)
      ? value.compactLinePlanMode
      : defaults.compactLinePlanMode,
    patternRoundedCurves: readBoolean(value.patternRoundedCurves, defaults.patternRoundedCurves),
    showInterruptionWalkingTimes: readBoolean(
      value.showInterruptionWalkingTimes,
      defaults.showInterruptionWalkingTimes,
    ),
    patternCompactBranchGap: parsePatternCompactBranchGap(value.patternCompactBranchGap),
    patternCompactForkGap: parsePatternCompactForkGap(value.patternCompactForkGap),
    patternRealisticMinGapCoefficient,
    patternRealisticMaxGapCoefficient: parsePatternRealisticMaxGapCoefficient(
      value.patternRealisticMaxGapCoefficient,
      patternRealisticMinGapCoefficient,
    ),
    trafficCalendarImpactScope: isTrafficCalendarImpactScope(value.trafficCalendarImpactScope)
      ? value.trafficCalendarImpactScope
      : defaults.trafficCalendarImpactScope,
    richTransferTooltips: readBoolean(value.richTransferTooltips, defaults.richTransferTooltips),
    ghostNetworkStructuralOnly: readBoolean(
      value.ghostNetworkStructuralOnly,
      defaults.ghostNetworkStructuralOnly,
    ),
    gtfsLineGeometryEnabled: readBoolean(
      value.gtfsLineGeometryEnabled,
      defaults.gtfsLineGeometryEnabled,
    ),
    trafficInfoDesign: isTrafficInfoDesign(value.trafficInfoDesign)
      ? value.trafficInfoDesign
      : defaults.trafficInfoDesign,
    trafficInfoDefaultScope: isTrafficInfoDefaultScope(value.trafficInfoDefaultScope)
      ? value.trafficInfoDefaultScope
      : defaults.trafficInfoDefaultScope,
    trafficWarningLookaheadDays: parseTrafficWarningLookaheadDays(
      value.trafficWarningLookaheadDays,
    ),
    fullscreenStationPanelDesign: isFullscreenStationPanelDesign(value.fullscreenStationPanelDesign)
      ? value.fullscreenStationPanelDesign
      : defaults.fullscreenStationPanelDesign,
    fullscreenStationPanelDarkTheme: readBoolean(
      value.fullscreenStationPanelDarkTheme,
      defaults.fullscreenStationPanelDarkTheme,
    ),
    smartTrafficDetection: readBoolean(value.smartTrafficDetection, defaults.smartTrafficDetection),
    smartTrafficModalFormatting: readBoolean(
      value.smartTrafficModalFormatting,
      defaults.smartTrafficModalFormatting,
    ),
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
    weatherMode: isWeatherMode(value.weatherMode) ? value.weatherMode : defaults.weatherMode,
    weatherLookaheadMinutes: parseWeatherLookaheadMinutes(value.weatherLookaheadMinutes),
    weatherShowApparentTemperature: readBoolean(
      value.weatherShowApparentTemperature,
      defaults.weatherShowApparentTemperature,
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

export function parseMaxDeparturesPerDirection(value: unknown): MaxDeparturesPerDirectionSetting {
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

export function parseWeatherLookaheadMinutes(value: unknown): WeatherLookaheadMinutes {
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

export function parseTransferBundleRetentionDays(value: unknown): TransferBundleRetentionDays {
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

function parseHiddenDirectionIdsByBoardId(value: unknown): Record<string, string[]> {
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

export function parseTrafficWarningLookaheadDays(value: unknown): TrafficWarningLookaheadDays {
  return parseBoundedNumber(
    value,
    TRAFFIC_WARNING_LOOKAHEAD_DAYS_DEFAULT,
    TRAFFIC_WARNING_LOOKAHEAD_DAYS_MIN,
    TRAFFIC_WARNING_LOOKAHEAD_DAYS_MAX,
    0,
  );
}

export function parsePatternCompactBranchGap(value: unknown): number {
  return parseBoundedNumber(
    value,
    PATTERN_COMPACT_BRANCH_GAP_DEFAULT,
    PATTERN_COMPACT_BRANCH_GAP_MIN,
    PATTERN_COMPACT_BRANCH_GAP_MAX,
    0,
  );
}

export function parsePatternCompactForkGap(value: unknown): number {
  return parseBoundedNumber(
    value,
    PATTERN_COMPACT_FORK_GAP_DEFAULT,
    PATTERN_COMPACT_FORK_GAP_MIN,
    PATTERN_COMPACT_FORK_GAP_MAX,
    0,
  );
}

export function parsePatternRealisticMinGapCoefficient(value: unknown): number {
  return parseBoundedNumber(
    value,
    PATTERN_REALISTIC_MIN_GAP_COEFFICIENT_DEFAULT,
    PATTERN_REALISTIC_MIN_GAP_COEFFICIENT_MIN,
    PATTERN_REALISTIC_MIN_GAP_COEFFICIENT_MAX,
    2,
  );
}

export function parsePatternRealisticMaxGapCoefficient(
  value: unknown,
  minCoefficient = PATTERN_REALISTIC_MIN_GAP_COEFFICIENT_DEFAULT,
): number {
  return parseBoundedNumber(
    value,
    PATTERN_REALISTIC_MAX_GAP_COEFFICIENT_DEFAULT,
    Math.max(PATTERN_REALISTIC_MAX_GAP_COEFFICIENT_MIN, minCoefficient),
    PATTERN_REALISTIC_MAX_GAP_COEFFICIENT_MAX,
    2,
  );
}

export function getEffectiveMaxDeparturesPerDirection(settings: AppSettings): number | undefined {
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

export function getWakeLockDurationMs(duration: WakeLockDuration): number | undefined {
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
      version: 2,
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

function createDefaultPluginSettings(): Record<string, AppPluginSettingsEntry> {
  return Object.fromEntries(
    transportClockPlugins.map((plugin) => [
      plugin.id,
      {
        enabled: plugin.defaultEnabled,
        value: plugin.settings?.normalize(plugin.settings.defaultValue) ?? null,
        version: plugin.settings?.version ?? 1,
      },
    ]),
  );
}

function normalizePluginSettings(
  rawSettings: Record<string, unknown>,
  defaults: AppSettings,
): Pick<AppSettings, "plugins" | "legacyPluginData"> {
  const storedPlugins = isRecord(rawSettings.plugins) ? rawSettings.plugins : {};
  const preservedLegacy = isRecord(rawSettings.legacyPluginData)
    ? rawSettings.legacyPluginData
    : {};
  const knownKeys = new Set(Object.keys(defaults));
  const legacyPluginData: Record<string, unknown> = {
    ...preservedLegacy,
    ...Object.fromEntries(Object.entries(rawSettings).filter(([key]) => !knownKeys.has(key))),
  };
  const migrationSource = { ...legacyPluginData, ...rawSettings };
  const claimedKeys = new Set<string>();
  const installedPluginIds = new Set(transportClockPlugins.map((plugin) => plugin.id));
  const unavailablePlugins = Object.fromEntries(
    Object.entries(storedPlugins).flatMap(([id, value]) => {
      if (installedPluginIds.has(id) || !isRecord(value)) {
        return [];
      }

      return [
        [
          id,
          {
            enabled: readBoolean(value.enabled, false),
            value: "value" in value ? value.value : null,
            version:
              typeof value.version === "number" &&
              Number.isInteger(value.version) &&
              value.version > 0
                ? value.version
                : 1,
          } satisfies AppPluginSettingsEntry,
        ],
      ];
    }),
  );
  const plugins = {
    ...unavailablePlugins,
    ...Object.fromEntries(
      transportClockPlugins.map((plugin) => {
        const storedValue = storedPlugins[plugin.id];
        const stored: Record<string, unknown> = isRecord(storedValue) ? storedValue : {};
        const migration = plugin.settings?.migrateLegacy?.(migrationSource);
        migration?.claimedKeys?.forEach((key) => claimedKeys.add(key));
        const defaultEntry = defaults.plugins[plugin.id];
        const rawValue =
          "value" in stored
            ? stored.value
            : migration && "value" in migration
              ? migration.value
              : defaultEntry.value;

        return [
          plugin.id,
          {
            enabled: readBoolean(stored.enabled, migration?.enabled ?? defaultEntry.enabled),
            value: plugin.settings?.normalize(rawValue) ?? null,
            version: plugin.settings?.version ?? defaultEntry.version,
          },
        ];
      }),
    ),
  };

  claimedKeys.forEach((key) => delete legacyPluginData[key]);
  return { plugins, legacyPluginData };
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function parseBoundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  precision: number,
): number {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  const clampedValue = Math.min(max, Math.max(min, numericValue));

  return Number(clampedValue.toFixed(precision));
}

function isClosedDirectionSummaryMode(value: unknown): value is ClosedDirectionSummaryMode {
  return value === "last" || value === "next";
}

function isWakeLockDuration(value: unknown): value is WakeLockDuration {
  return ["none", "1m", "30m", "1h", "3h", "24h", "unlimited"].includes(value as WakeLockDuration);
}

function isNavigationAutoHide(value: unknown): value is NavigationAutoHide {
  return value === "none" || value === "1m";
}

function isPluginViewerMode(value: unknown): value is PluginViewerMode {
  return value === "grid" || value === "list";
}

function isBoardTogglesPlacement(value: unknown): value is BoardTogglesPlacement {
  return value === "inline" || value === "context-menu";
}

function parsePlacePresetNavigationMode(
  value: unknown,
  legacySwipeEnabled: unknown,
): PlacePresetNavigationMode {
  if (isPlacePresetNavigationMode(value)) {
    return value;
  }

  return legacySwipeEnabled === false ? "dropdown" : "dropdown-swipe";
}

function isPlacePresetNavigationMode(value: unknown): value is PlacePresetNavigationMode {
  return value === "dropdown-swipe" || value === "dropdown" || value === "swipe";
}

function isCompactLinePlanMode(value: unknown): value is CompactLinePlanMode {
  return value === "auto" || value === "comfort" || value === "compact" || value === "realistic";
}

function isTrafficCalendarImpactScope(value: unknown): value is TrafficCalendarImpactScope {
  return value === "interruptions-only" || value === "all-impacts";
}

function isTrafficInfoDesign(value: unknown): value is TrafficInfoDesign {
  return value === "ratp" || value === "cards";
}

function isTrafficInfoDefaultScope(value: unknown): value is TrafficInfoDefaultScope {
  return value === "optimized" || value === "all";
}

function isFullscreenStationPanelDesign(value: unknown): value is FullscreenStationPanelDesign {
  return value === "all-directions" || value === "double-stop" || value === "home-card";
}

function isWeatherMode(value: unknown): value is WeatherMode {
  return (
    value === "animated" || value === "static" || value === "alerts_only" || value === "disabled"
  );
}

function isWeatherTestMode(value: unknown): value is WeatherTestMode {
  return (
    value === "off" || value === "rain" || value === "storm" || value === "snow" || value === "heat"
  );
}

function isWeatherLocationPreset(value: unknown): value is WeatherLocationPreset {
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
      typeof value.label === "string" && value.label.trim() ? value.label.trim() : fallback.label,
    latitude: parseCoordinate(value.latitude, fallback.latitude, -90, 90),
    longitude: parseCoordinate(value.longitude, fallback.longitude, -180, 180),
  };
}

function parseCoordinate(value: unknown, fallback: number, min: number, max: number): number {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  return Number.isFinite(numericValue) ? Math.min(max, Math.max(min, numericValue)) : fallback;
}
