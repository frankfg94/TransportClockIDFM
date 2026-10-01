<script setup lang="ts">
import Fuse from "fuse.js";
import { computed, onBeforeUnmount, onMounted, ref, type Component, watch } from "vue";
import {
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Database,
  Layers,
  Palette,
  Pencil,
  Plus,
  Route,
  Search,
  Trash2,
  Wifi,
  X,
} from "lucide-vue-next";
import AppModal from "../../components/AppModal.vue";
import AppNotification, { type AppNotificationTone } from "../../components/AppNotification.vue";
import type { MaterialComboboxOption } from "../../components/MaterialCombobox.vue";
import PlaceNameModal from "../../components/PlaceNameModal.vue";
import AdressBook from "../address-book/AdressBook.vue";
import type { AddressBookEntry } from "../address-book/addressBook";
import { useRouter } from "nuxt/app";
import PluginViewer from "./PluginViewer.vue";
import GtfsSettingsPanel from "./GtfsSettingsPanel.vue";
import SettingsLanguageCategory from "./SettingsLanguageCategory.vue";
import SettingsMenuCategory from "./SettingsMenuCategory.vue";
import SettingsTransportNewsCategory from "./SettingsTransportNewsCategory.vue";
import { NEWS_MODES, NEWS_TOPICS } from "../transport-news/types";
import { NEWS_SOURCES } from "../transport-news/sources";
import SettingsPlacesCategory from "./SettingsPlacesCategory.vue";
import SettingsAddressBookCategory from "./SettingsAddressBookCategory.vue";
import SettingsDisplayCategory from "./SettingsDisplayCategory.vue";
import SettingsDeviceCategory from "./SettingsDeviceCategory.vue";
import SettingsGlobalMapDataCategory from "./SettingsGlobalMapDataCategory.vue";
import SettingsTrafficCategory from "./SettingsTrafficCategory.vue";
import SettingsWeatherCategory from "./SettingsWeatherCategory.vue";
import SettingsMapCategory from "./SettingsMapCategory.vue";
import { transitBoards } from "../../config/transitBoards";
import { MobileReleaseCard } from "../mobile-release";
import {
  boardTogglesPlacementOptions,
  closedDirectionSummaryOptions,
  compactLinePlanOptions,
  fullscreenStationPanelDesignOptions,
  maxDeparturesPerDirectionOptions,
  navigationAutoHideOptions,
  placePresetNavigationModeOptions,
  parseGlobalMapBasemapContrast,
  parseGlobalMapBasemapStyle,
  parseMaxDeparturesPerDirection,
  parseNetworkConcurrencyMode,
  parsePatternCompactBranchGap,
  parsePatternCompactForkGap,
  parsePatternRealisticMaxGapCoefficient,
  parsePatternRealisticMinGapCoefficient,
  parseTravelAlarmSafetyMinutes,
  parseTrafficWarningLookaheadDays,
  parseTransferBundleRetentionDays,
  parseTransferBundleRequestConcurrency,
  parseTransferBundleRequestSpacingMs,
  parseWeatherLookaheadMinutes,
  PATTERN_COMPACT_BRANCH_GAP_MAX,
  PATTERN_COMPACT_BRANCH_GAP_MIN,
  PATTERN_COMPACT_FORK_GAP_MAX,
  PATTERN_COMPACT_FORK_GAP_MIN,
  PATTERN_REALISTIC_MAX_GAP_COEFFICIENT_MAX,
  PATTERN_REALISTIC_MAX_GAP_COEFFICIENT_MIN,
  PATTERN_REALISTIC_MIN_GAP_COEFFICIENT_MAX,
  PATTERN_REALISTIC_MIN_GAP_COEFFICIENT_MIN,
  TRAVEL_ALARM_SAFETY_MINUTES_MAX,
  TRAFFIC_WARNING_LOOKAHEAD_DAYS_MAX,
  TRAFFIC_WARNING_LOOKAHEAD_DAYS_MIN,
  transferBundleRequestConcurrencyOptions,
  transferBundleRequestSpacingOptions,
  transferBundleRetentionOptions,
  trafficInfoDefaultScopeOptions,
  trafficCalendarImpactScopeOptions,
  trafficInfoDesignOptions,
  transferResolverModeOptions,
  useAppSettings,
  wakeLockDurationOptions,
  weatherLookaheadOptions,
  weatherModeOptions,
  weatherTestModeOptions,
  type BoardTogglesPlacement,
  type ClosedDirectionSummaryMode,
  type CompactLinePlanMode,
  type FullscreenStationPanelDesign,
  type NavigationAutoHide,
  type PlacePresetNavigationMode,
  type TrafficInfoDefaultScope,
  type TrafficCalendarImpactScope,
  type TrafficInfoDesign,
  type TransferBundleRequestConcurrency,
  type TransferBundleRequestSpacingMs,
  type TransferResolverMode,
  type WakeLockDuration,
  type WeatherMode,
  type WeatherTestMode,
} from "./appSettings";
import {
  clearTransferBundles,
  deleteTransferBundle,
  listTransferBundles,
  type TransferBundleSummary,
} from "../service-pattern/transferBundles";
import { clearPatternTransferRuntimeCaches } from "../service-pattern/patternTransfers";
import { weatherLocationOptions, type WeatherLocationPreset } from "../weather/weatherLocations";
import {
  DEFAULT_TRANSIT_PLACE_ID,
  WORK_TRANSIT_PLACE_ID,
  createDefaultTransitPresetState,
  createTransitPlace,
  deleteTransitPlace,
  getTransitPlaceById,
  isTransitBuiltinPlace,
  loadTransitPresetState,
  renameTransitPlace,
  resolveTransitPlaceId,
  saveTransitPresetState,
  setDefaultTransitPlace,
  updateTransitPlacePreferences,
  type TransitPlacePreset,
  type TransitPresetState,
} from "../../storage/transitPreferences";
import { useI18n, type LanguagePreference } from "../../i18n";
import type { TransitBoardPreferences } from "../../types/transit";
import {
  calculateTrafficImpactSeverity,
  calculateTrafficImpactTemporalMultiplier,
  TRAFFIC_IMPACT_SEVERITY_MODEL,
} from "../traffic/trafficImpactSeverity";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../transport-map/config/globalTransportPlanConfig";
import type { GlobalMapManifest } from "../transport-map/contracts/manifest";
import { fetchAnnualRidershipStatus } from "../../services/ridership";
import { toServerApiUrl } from "../../services/serverApi";
import type { TrafficCacheMetadata } from "../traffic/types";
import type { AnnualRidershipStatusResponse } from "../../types/ridership";
import { clearNearbyWalkingRouteCache } from "../../services/nearbyWalkingRoutes";
import NotSettingsFound from "./NotSettingsFound.vue";

const { settings, updateSettings, resetSettings } = useAppSettings();
const { d, locale, n, t } = useI18n();
const router = useRouter();
const presetState = ref<TransitPresetState>(createDefaultTransitPresetState(transitBoards));
const bundlesModalOpen = ref(false);
const presetsModalOpen = ref(false);
const placeNameModalOpen = ref(false);
const placeNameMode = ref<"create" | "rename">("create");
const placeNameInitialValue = ref("");
const placeNameTargetId = ref("");
const placeNameError = ref("");
const addressBookModalOpen = ref(false);
const selectedDisplayPlaceId = ref(DEFAULT_TRANSIT_PLACE_ID);
const bundleSummaries = ref<TransferBundleSummary[]>([]);
const localBundleSummaries = ref<TransferBundleSummary[]>([]);
const settingsNotification = ref<{
  message: string;
  tone: AppNotificationTone;
}>({ message: "", tone: "info" });
const openPanelIds = ref(new Set<string>());
const globalMapManifest = ref<GlobalMapManifest>();
const globalMapManifestLoading = ref(false);
const globalMapManifestError = ref("");
interface TrafficCacheStatusResponse {
  configured: boolean;
  generatedAt: string;
  source: string;
  cache: TrafficCacheMetadata;
}
const trafficCacheStatus = ref<TrafficCacheStatusResponse>();
const trafficCacheNow = ref(Date.now());
const trafficCacheLoading = ref(false);
const trafficCacheError = ref("");
const annualRidershipStatus = ref<AnnualRidershipStatusResponse>();
const annualRidershipStatusLoading = ref(false);
const annualRidershipStatusError = ref("");
const settingsSearchQuery = ref("");
const debouncedSettingsSearchQuery = ref("");
const settingsSearchCollapsedPanelIds = ref(new Set<string>());
const SETTINGS_SEARCH_DEBOUNCE_MS = 200;
let settingsSearchTimer: ReturnType<typeof setTimeout> | undefined;
let trafficCacheStatusTimer: ReturnType<typeof setInterval> | undefined;
let trafficCacheClockTimer: ReturnType<typeof setInterval> | undefined;

type GlobalMapQualityLevel = "good" | "attention" | "limited" | "online";

interface GlobalMapQualityCard {
  id: string;
  icon: Component;
  level: GlobalMapQualityLevel;
  levelLabel: string;
  title: string;
  description: string;
  detail: string;
}

const globalMapConfigJson = computed(() => JSON.stringify(GLOBAL_TRANSPORT_PLAN_CONFIG, null, 2));
const globalMapPackSummaryJson = computed(() => {
  const manifest = globalMapManifest.value;
  if (!manifest) return "";

  return JSON.stringify(
    {
      schemaVersion: manifest.schemaVersion,
      minReaderVersion: manifest.minReaderVersion,
      dataVersion: manifest.dataVersion,
      generatedAt: manifest.generatedAt,
      sourceVersions: manifest.sourceVersions,
      projection: manifest.projection,
      bounds: manifest.bounds,
      lod: manifest.lod,
      modes: manifest.modes,
      counts: manifest.counts,
      compilation: manifest.compilation,
    },
    null,
    2,
  );
});
const globalMapPackFilesJson = computed(() => {
  const manifest = globalMapManifest.value;
  return manifest?.files ? JSON.stringify(manifest.files, null, 2) : "";
});
const globalMapPackWarningsJson = computed(() => {
  const manifest = globalMapManifest.value;
  if (!manifest?.warnings) return "";

  return JSON.stringify(
    {
      palette: manifest.palette ?? null,
      warnings: manifest.warnings,
    },
    null,
    2,
  );
});
const globalMapManifestJson = computed(() =>
  globalMapManifest.value ? JSON.stringify(globalMapManifest.value, null, 2) : "",
);
const globalMapTotalPackBytes = computed(() => {
  const manifest = globalMapManifest.value;
  if (!manifest?.files) return 0;

  const namedFiles = [
    manifest.files.bootstrap,
    manifest.files.catalog,
    manifest.files.regional,
    manifest.files.regionalBus,
    manifest.files.linePalette,
  ];

  return (
    namedFiles.reduce((total, file) => total + (file?.bytes ?? 0), 0) +
    manifest.files.chunks.reduce((total, chunk) => total + (chunk.bytes ?? 0), 0)
  );
});
const globalMapQualityCards = computed<GlobalMapQualityCard[]>(() => {
  const manifest = globalMapManifest.value;
  if (!manifest?.counts || !manifest.files || !manifest.warnings) return [];

  const warningCount = (code: string): number =>
    manifest.warnings.find((warning) => warning.code === code)?.count ?? 0;
  const topologyWarningCount = warningCount("gtfs-topology-edge-missing");
  const coordinateCorrectionCount = warningCount("gtfs-station-coordinate-corrected");
  const fallbackGeometryCount = warningCount("fallback-geometry");
  const paletteMissingCount =
    manifest.palette?.missingCount ?? warningCount("line-color-palette-missing");
  const hasPackTiles = manifest.files.chunks.length > 0 && globalMapTotalPackBytes.value > 0;

  return [
    {
      id: "network",
      icon: Database,
      level: topologyWarningCount > 0 ? "attention" : "good",
      levelLabel: t(
        topologyWarningCount > 0
          ? "settings.globalMapData.qualityLevels.attention"
          : "settings.globalMapData.qualityLevels.good",
      ),
      title: t("settings.globalMapData.quality.network.title"),
      description: t("settings.globalMapData.quality.network.description"),
      detail: t("settings.globalMapData.quality.network.detail", {
        lines: n(manifest.counts.lines),
        stations: n(manifest.counts.stations),
        alerts: n(topologyWarningCount + coordinateCorrectionCount),
      }),
    },
    {
      id: "geometry",
      icon: Route,
      level: fallbackGeometryCount > 0 ? "attention" : "good",
      levelLabel: t(
        fallbackGeometryCount > 0
          ? "settings.globalMapData.qualityLevels.attention"
          : "settings.globalMapData.qualityLevels.good",
      ),
      title: t("settings.globalMapData.quality.geometry.title"),
      description: t("settings.globalMapData.quality.geometry.description"),
      detail: t("settings.globalMapData.quality.geometry.detail", {
        fallback: n(fallbackGeometryCount),
        paths: n(manifest.counts.paths),
      }),
    },
    {
      id: "palette",
      icon: Palette,
      level: paletteMissingCount > 0 ? "limited" : "good",
      levelLabel: t(
        paletteMissingCount > 0
          ? "settings.globalMapData.qualityLevels.limited"
          : "settings.globalMapData.qualityLevels.good",
      ),
      title: t("settings.globalMapData.quality.palette.title"),
      description: t("settings.globalMapData.quality.palette.description"),
      detail: t("settings.globalMapData.quality.palette.detail", {
        missing: n(paletteMissingCount),
      }),
    },
    {
      id: "tiles",
      icon: Layers,
      level: hasPackTiles ? "good" : "limited",
      levelLabel: t(
        hasPackTiles
          ? "settings.globalMapData.qualityLevels.good"
          : "settings.globalMapData.qualityLevels.limited",
      ),
      title: t("settings.globalMapData.quality.tiles.title"),
      description: t("settings.globalMapData.quality.tiles.description"),
      detail: t("settings.globalMapData.quality.tiles.detail", {
        chunks: n(manifest.files.chunks.length),
        size: formatGlobalMapBytes(globalMapTotalPackBytes.value),
      }),
    },
    {
      id: "basemap",
      icon: Wifi,
      level: "online",
      levelLabel: t("settings.globalMapData.qualityLevels.online"),
      title: t("settings.globalMapData.quality.basemap.title"),
      description: t("settings.globalMapData.quality.basemap.description"),
      detail: t("settings.globalMapData.quality.basemap.detail", {
        standard: n(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.maxTiles),
        highZoom: n(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.highZoomMaxTiles),
      }),
    },
  ];
});
type AnnualRidershipSourceKind = NonNullable<AnnualRidershipStatusResponse["source"]>["kind"];

function formatAnnualRidershipSource(kind: AnnualRidershipSourceKind | undefined): string {
  switch (kind) {
    case "directory":
      return t("settings.annualRidership.quality.sources.local");
    case "r2":
      return t("settings.annualRidership.quality.sources.r2");
    case "remote":
      return t("settings.annualRidership.quality.sources.remote");
    case "auto":
      return t("settings.annualRidership.quality.sources.auto");
    default:
      return t("settings.annualRidership.quality.sources.unknown");
  }
}

const annualRidershipQualityCard = computed<GlobalMapQualityCard>(() => {
  const status = annualRidershipStatus.value;

  if (annualRidershipStatusLoading.value || !status) {
    return {
      id: "ridership",
      icon: BarChart3,
      level: "attention",
      levelLabel: t("settings.annualRidership.qualityLevels.checking"),
      title: t("settings.annualRidership.quality.title"),
      description: t("settings.annualRidership.quality.description"),
      detail: annualRidershipStatusError.value
        ? `${t("settings.annualRidership.quality.loadFailed")}: ${annualRidershipStatusError.value}`
        : t("settings.annualRidership.quality.checkingDetail"),
    };
  }

  if (!status.available) {
    return {
      id: "ridership",
      icon: BarChart3,
      level: "limited",
      levelLabel: t("settings.annualRidership.qualityLevels.unavailable"),
      title: t("settings.annualRidership.quality.title"),
      description: t("settings.annualRidership.quality.description"),
      detail: t("settings.annualRidership.quality.unavailableDetail", {
        source: formatAnnualRidershipSource(status.source?.kind),
        message: status.message ?? t("settings.annualRidership.quality.noManifest"),
      }),
    };
  }

  const counts = status.counts;
  return {
    id: "ridership",
    icon: BarChart3,
    level: "good",
    levelLabel: t("settings.annualRidership.qualityLevels.available"),
    title: t("settings.annualRidership.quality.title"),
    description: t("settings.annualRidership.quality.description"),
    detail: t("settings.annualRidership.quality.availableDetail", {
      source: formatAnnualRidershipSource(status.source?.kind),
      version: status.version ?? "—",
      years: status.actualYears?.join(", ") ?? "—",
      lines: counts ? n(counts.availableLines) : "—",
      stations: counts ? n(counts.availableStations) : "—",
    }),
  };
});
const dataQualityCards = computed<GlobalMapQualityCard[]>(() => [
  ...globalMapQualityCards.value,
  annualRidershipQualityCard.value,
]);
const globalMapQualityStatusIcons: Record<GlobalMapQualityLevel, Component> = {
  good: CheckCircle2,
  attention: CircleAlert,
  limited: CircleAlert,
  online: Wifi,
};
const backendBundleCount = computed(() => bundleSummaries.value.length);
const localBundleCount = computed(() => localBundleSummaries.value.length);
const bundleCount = computed(() => backendBundleCount.value + localBundleCount.value);
function isPanelOpen(panelId: string): boolean {
  if (hasSettingsSearchQuery.value) {
    return isPanelVisible(panelId) && !settingsSearchCollapsedPanelIds.value.has(panelId);
  }

  return openPanelIds.value.has(panelId);
}

function togglePanel(panelId: string): void {
  if (hasSettingsSearchQuery.value) {
    const nextCollapsedPanelIds = new Set(settingsSearchCollapsedPanelIds.value);

    if (nextCollapsedPanelIds.has(panelId)) {
      nextCollapsedPanelIds.delete(panelId);
    } else {
      nextCollapsedPanelIds.add(panelId);
    }

    settingsSearchCollapsedPanelIds.value = nextCollapsedPanelIds;
    return;
  }

  const nextOpenPanelIds = new Set(openPanelIds.value);

  if (nextOpenPanelIds.has(panelId)) {
    nextOpenPanelIds.delete(panelId);
  } else {
    nextOpenPanelIds.add(panelId);
  }

  openPanelIds.value = nextOpenPanelIds;
}

function formatGlobalMapBytes(bytes: number): string {
  if (bytes < 1024) return `${n(bytes)} ${t("globalMap.page.units.bytes")}`;
  if (bytes < 1024 * 1024) {
    return `${n(bytes / 1024, { maximumFractionDigits: 0 })} ${t("globalMap.page.units.kilobytes")}`;
  }

  return `${n(bytes / (1024 * 1024), { maximumFractionDigits: 1 })} ${t("globalMap.page.units.megabytes")}`;
}

function formatGlobalMapDate(value: string | undefined): string {
  return value ? d(value, { dateStyle: "medium", timeStyle: "short" }) : "—";
}

const globalMapGeneratedAtLabel = computed(() =>
  formatGlobalMapDate(globalMapManifest.value?.generatedAt),
);
const globalMapPackBytesLabel = computed(() =>
  formatGlobalMapBytes(globalMapTotalPackBytes.value),
);

async function loadGlobalMapSettingsData(): Promise<void> {
  if (globalMapManifest.value || globalMapManifestLoading.value || typeof fetch === "undefined")
    return;
  globalMapManifestLoading.value = true;
  globalMapManifestError.value = "";
  try {
    const response = await fetch("/data/global-map/v1/manifest.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    globalMapManifest.value = (await response.json()) as GlobalMapManifest;
  } catch (error) {
    globalMapManifestError.value =
      error instanceof Error ? error.message : t("settings.globalMapData.loadFailed");
  } finally {
    globalMapManifestLoading.value = false;
  }
}

async function loadTrafficCacheStatus(): Promise<void> {
  if (typeof fetch === "undefined") return;

  try {
    const params = new URLSearchParams({ locale: locale.value });
    const response = await fetch(toServerApiUrl(`/api/traffic/status?${params}`), {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    trafficCacheStatus.value = (await response.json()) as TrafficCacheStatusResponse;
    trafficCacheError.value = "";
  } catch (error) {
    trafficCacheError.value =
      error instanceof Error ? error.message : t("settings.trafficCache.loadFailed");
  }
}

async function loadAnnualRidershipStatus(): Promise<void> {
  if (typeof fetch === "undefined" || annualRidershipStatusLoading.value) return;

  annualRidershipStatusLoading.value = true;
  annualRidershipStatusError.value = "";
  try {
    annualRidershipStatus.value = await fetchAnnualRidershipStatus();
  } catch (error) {
    annualRidershipStatus.value = undefined;
    annualRidershipStatusError.value =
      error instanceof Error ? error.message : t("settings.annualRidership.quality.noManifest");
  } finally {
    annualRidershipStatusLoading.value = false;
  }
}

async function forceTrafficCacheRefresh(): Promise<void> {
  if (trafficCacheLoading.value) return;
  trafficCacheLoading.value = true;
  trafficCacheError.value = "";

  try {
    const params = new URLSearchParams({ locale: locale.value });
    const response = await fetch(toServerApiUrl(`/api/traffic/refresh?${params}`), {
      method: "POST",
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { cache?: TrafficCacheMetadata };
    await loadTrafficCacheStatus();
    const state = payload.cache?.state ?? trafficCache.value?.state;
    showSettingsNotification(
      state === "rate-limited"
        ? t("settings.trafficCache.refreshTooRecent")
        : t("settings.trafficCache.refreshStarted"),
      state === "rate-limited" ? "info" : "success",
    );
  } catch (error) {
    trafficCacheError.value =
      error instanceof Error ? error.message : t("settings.trafficCache.refreshFailed");
    showSettingsNotification(t("settings.trafficCache.refreshFailed"), "error");
  } finally {
    trafficCacheLoading.value = false;
  }
}

function formatTrafficCacheDuration(milliseconds: number): string {
  const totalSeconds = Math.ceil(milliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes > 0
    ? t("settings.trafficCache.durationMinutesSeconds", { minutes, seconds })
    : t("settings.trafficCache.durationSeconds", { seconds });
}

watch(locale, () => {
  if (typeof window !== "undefined") {
    void loadTrafficCacheStatus();
  }
});

watch(debouncedSettingsSearchQuery, () => {
  settingsSearchCollapsedPanelIds.value = new Set();
});

const placeOptions = computed(() =>
  presetState.value.places.map((place) => ({
    id: place.id,
    label: getPlaceLabel(place),
  })),
);
const languageOptions = computed<MaterialComboboxOption[]>(() => [
  { id: "auto", label: t("settings.options.language.auto") },
  { id: "fr", label: t("settings.options.language.fr") },
  { id: "en", label: t("settings.options.language.en") },
]);
const globalMapBasemapStyleLocalizedOptions = computed<MaterialComboboxOption[]>(() =>
  GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.style.options.map((style) => ({
    id: style,
    label:
      style === "voyager"
        ? t("settings.options.mapBasemapStyle.voyager")
        : t("settings.options.mapBasemapStyle.light"),
  })),
);
const closedDirectionSummaryLocalizedOptions = computed(() =>
  closedDirectionSummaryOptions.map((option) => ({
    id: option.id,
    label:
      option.id === "last"
        ? t("settings.options.closedSummary.last")
        : t("settings.options.closedSummary.next"),
  })),
);
const maxDeparturesLocalizedOptions = computed(() =>
  maxDeparturesPerDirectionOptions.map((option) => {
    if (option.id === "default") {
      return {
        id: option.id,
        label: t("settings.options.maxDepartures.default"),
      };
    }

    return {
      id: option.id,
      label:
        option.id === "1"
          ? t("settings.options.maxDepartures.one")
          : t("settings.options.maxDepartures.other", { count: option.id }),
    };
  }),
);
const networkConcurrencyOptions = computed(() =>
  (["auto", "limited", "unlimited"] as const).map((id) => ({
    id,
    label: t(`settings.network.${id}`),
  })),
);

const wakeLockLocalizedOptions = computed(() =>
  wakeLockDurationOptions.map((option) => ({
    id: option.id,
    label:
      option.id === "none"
        ? t("settings.options.wakeLock.none")
        : option.id === "unlimited"
          ? t("settings.options.wakeLock.unlimited")
          : option.label,
  })),
);
const navigationAutoHideLocalizedOptions = computed(() =>
  navigationAutoHideOptions.map((option) => ({
    id: option.id,
    label: option.id === "none" ? t("settings.options.autoHide.none") : option.label,
  })),
);
const boardTogglesPlacementLocalizedOptions = computed(() =>
  boardTogglesPlacementOptions.map((option) => ({
    id: option.id,
    label:
      option.id === "inline"
        ? t("settings.options.boardToggles.inline")
        : t("settings.options.boardToggles.contextMenu"),
  })),
);
const placePresetNavigationModeLocalizedOptions = computed(() =>
  placePresetNavigationModeOptions.map((option) => ({
    id: option.id,
    label:
      option.id === "dropdown-swipe"
        ? t("settings.options.placeNavigation.dropdownSwipe")
        : option.id === "dropdown"
          ? t("settings.options.placeNavigation.dropdown")
          : t("settings.options.placeNavigation.swipe"),
  })),
);
const compactLinePlanLocalizedOptions = computed(() =>
  compactLinePlanOptions.map((option) => ({
    id: option.id,
    label:
      option.id === "auto"
        ? t("settings.options.compactLinePlan.auto")
        : option.id === "comfort"
          ? t("settings.options.compactLinePlan.comfort")
          : option.id === "compact"
            ? t("settings.options.compactLinePlan.compact")
            : t("settings.options.compactLinePlan.realistic"),
  })),
);
const trafficCalendarImpactScopeLocalizedOptions = computed(() =>
  trafficCalendarImpactScopeOptions.map((option) => ({
    id: option.id,
    label:
      option.id === "interruptions-only"
        ? t("settings.options.trafficCalendarScope.interruptionsOnly")
        : t("settings.options.trafficCalendarScope.allImpacts"),
  })),
);
const trafficTransferLabelKeys = {
  RER: "settings.trafficCalendarEquation.transferModes.RER",
  TRANSILIEN: "settings.trafficCalendarEquation.transferModes.TRANSILIEN",
  METRO: "settings.trafficCalendarEquation.transferModes.METRO",
  TRAM: "settings.trafficCalendarEquation.transferModes.TRAM",
  CABLE: "settings.trafficCalendarEquation.transferModes.CABLE",
  BUS: "settings.trafficCalendarEquation.transferModes.BUS",
  NOCTILIEN: "settings.trafficCalendarEquation.transferModes.NOCTILIEN",
} as const;
const trafficTopologyLabelKeys = {
  "small-branch": "settings.trafficCalendarEquation.topologyRoles.small-branch",
  "major-branch": "settings.trafficCalendarEquation.topologyRoles.major-branch",
  "trunk-end": "settings.trafficCalendarEquation.topologyRoles.trunk-end",
  "trunk-core": "settings.trafficCalendarEquation.topologyRoles.trunk-core",
} as const;
const trafficImpactTransferRows = computed(() =>
  Object.entries(TRAFFIC_IMPACT_SEVERITY_MODEL.transferWeights).map(([mode, weight]) => ({
    id: mode,
    label: t(trafficTransferLabelKeys[mode as keyof typeof trafficTransferLabelKeys]),
    weight,
  })),
);
const trafficImpactTopologyRows = computed(() =>
  Object.entries(TRAFFIC_IMPACT_SEVERITY_MODEL.topologyMultipliers).map(([role, multiplier]) => ({
    id: role,
    label: t(trafficTopologyLabelKeys[role as keyof typeof trafficTopologyLabelKeys]),
    multiplier,
  })),
);
const trafficImpactEveningExampleWindow = {
  startMinute: 22 * 60 + 45,
  endMinute: 3 * 60,
};
const trafficImpactEveningExample = calculateTrafficImpactTemporalMultiplier([
  trafficImpactEveningExampleWindow,
]);
const trafficImpactExampleScore = calculateTrafficImpactSeverity({
  affectedStationKeys: ["example"],
  stations: [
    {
      key: "example",
      label: "Example",
      transfers: [{ id: "rer-example", label: "RER", family: "RER" }],
    },
  ],
  edges: [],
  temporalMultipliersByStationKey: new Map([["example", trafficImpactEveningExample.multiplier]]),
}).score;

function formatTrafficMinuteOfDay(value: number): string {
  const hour = Math.floor(value / 60) % 24;
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const trafficImpactEveningExampleStartLabel = formatTrafficMinuteOfDay(
  trafficImpactEveningExampleWindow.startMinute,
);
const trafficImpactEveningExampleEndLabel = formatTrafficMinuteOfDay(
  trafficImpactEveningExampleWindow.endMinute,
);
const trafficOffPeakStartLabel = formatTrafficMinuteOfDay(
  TRAFFIC_IMPACT_SEVERITY_MODEL.temporal.offPeakStartMinute,
);
const trafficOffPeakEndLabel = formatTrafficMinuteOfDay(
  TRAFFIC_IMPACT_SEVERITY_MODEL.temporal.offPeakEndMinute,
);

const trafficInfoDesignLocalizedOptions = computed(() =>
  trafficInfoDesignOptions.map((option) => ({
    id: option.id,
    label:
      option.id === "ratp"
        ? t("settings.options.trafficDesign.ratp")
        : t("settings.options.trafficDesign.cards"),
  })),
);
const trafficInfoDefaultScopeLocalizedOptions = computed(() =>
  trafficInfoDefaultScopeOptions.map((option) => ({
    id: option.id,
    label:
      option.id === "optimized"
        ? t("settings.options.trafficScope.optimized")
        : t("settings.options.trafficScope.all"),
  })),
);
const trafficCache = computed(() => trafficCacheStatus.value?.cache);
const trafficCacheRefreshIntervalLabel = computed(() =>
  formatTrafficCacheDuration(trafficCache.value?.refreshIntervalMs ?? 150_000),
);
const trafficCacheLastUpdateLabel = computed(() =>
  formatGlobalMapDate(trafficCache.value?.refreshedAt),
);
const trafficWarningLookaheadLabel = computed(() =>
  formatDays(settings.value.trafficWarningLookaheadDays),
);
const trafficCacheCountdown = computed(() => {
  const nextRefreshAt = trafficCache.value?.nextRefreshAt;
  if (!nextRefreshAt) return t("settings.trafficCache.noRefreshScheduled");

  const remainingMs = Math.max(0, Date.parse(nextRefreshAt) - trafficCacheNow.value);
  if (remainingMs === 0) return t("settings.trafficCache.refreshDue");

  return t("settings.trafficCache.countdown", {
    duration: formatTrafficCacheDuration(remainingMs),
  });
});
const trafficCacheStateLabel = computed(() =>
  t(`settings.trafficCache.states.${trafficCache.value?.state ?? "miss"}`),
);
const fullscreenStationPanelDesignLocalizedOptions = computed(() =>
  fullscreenStationPanelDesignOptions.map((option) => ({
    id: option.id,
    label:
      option.id === "all-directions"
        ? t("settings.options.fullscreenPanel.allDirections")
        : option.id === "double-stop"
          ? t("settings.options.fullscreenPanel.doubleStop")
          : option.id === "dense-list"
            ? t("settings.options.fullscreenPanel.denseList")
            : t("settings.options.fullscreenPanel.homeCard"),
  })),
);
const transferBundleRetentionLocalizedOptions = computed(() =>
  transferBundleRetentionOptions.map((option) => ({
    id: option.id,
    label:
      option.id === "1"
        ? t("settings.options.transferBundle.oneDay")
        : t("settings.options.transferBundle.days", { count: option.id }),
  })),
);
const transferBundleRequestConcurrencyLocalizedOptions = computed(() =>
  transferBundleRequestConcurrencyOptions.map((option) => ({
    id: option.id,
    label:
      option.id === "1"
        ? t("settings.options.transferBundle.oneCall")
        : t("settings.options.transferBundle.calls", { count: option.id }),
  })),
);
const transferBundleRequestSpacingLocalizedOptions = computed(() =>
  transferBundleRequestSpacingOptions.map((option) => ({
    id: option.id,
    label: option.id === "0" ? t("settings.options.transferBundle.noDelay") : option.label,
  })),
);
const transferResolverModeLocalizedOptions = computed(() =>
  transferResolverModeOptions.map((option) => ({
    id: option.id,
    label: t(`settings.options.transferResolver.${option.id}`),
  })),
);
const weatherModeLocalizedOptions = computed(() =>
  weatherModeOptions.map((option) => ({
    id: option.id,
    label:
      option.id === "animated"
        ? t("settings.options.weatherMode.animated")
        : option.id === "static"
          ? t("settings.options.weatherMode.static")
          : option.id === "alerts_only"
            ? t("settings.options.weatherMode.alertsOnly")
            : t("settings.options.weatherMode.disabled"),
  })),
);
const weatherTestModeLocalizedOptions = computed(() =>
  weatherTestModeOptions.map((option) => ({
    id: option.id,
    label:
      option.id === "off"
        ? t("settings.options.weatherTest.off")
        : option.id === "rain"
          ? t("settings.options.weatherTest.rain")
          : option.id === "storm"
            ? t("settings.options.weatherTest.storm")
            : option.id === "snow"
              ? t("settings.options.weatherTest.snow")
              : t("settings.options.weatherTest.heat"),
  })),
);
const weatherLookaheadLocalizedOptions = computed(() =>
  weatherLookaheadOptions.map((option) => ({
    id: option.id,
    label: option.id === "1440" ? t("settings.options.weatherLookahead.allDay") : option.label,
  })),
);
const weatherLocationLocalizedOptions = computed(() =>
  weatherLocationOptions.map((option) => ({
    id: option.id,
    label: option.id === "custom" ? t("settings.options.weatherLocation.custom") : option.label,
  })),
);

interface SettingsSearchEntry {
  id: string;
  panelId: string;
  searchText: string;
}

function normalizeSettingsSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function createSettingsSearchEntry(
  id: string,
  panelId: string,
  label: string,
  description = "",
  keywords = "",
): SettingsSearchEntry {
  return {
    id,
    panelId,
    searchText: normalizeSettingsSearchText(`${label} ${description} ${keywords}`),
  };
}

function getSettingsOptionLabels(options: MaterialComboboxOption[]): string {
  return options.map((option) => option.label).join(" ");
}

const settingsSearchEntries = computed<SettingsSearchEntry[]>(() => [
  createSettingsSearchEntry("panel:feed", "feed", t("news.title"), t("news.settingsDescription"), "RSS actualités transports projets"),
  createSettingsSearchEntry("feed.modes", "feed", t("news.mode"), NEWS_MODES.map(mode => t(`news.modes.${mode}`)).join(" ")),
  createSettingsSearchEntry("feed.topics", "feed", t("news.topic"), NEWS_TOPICS.map(topic => t(`news.topics.${topic}`)).join(" ")),
  createSettingsSearchEntry("feed.sources", "feed", t("news.source"), NEWS_SOURCES.map(source => source.name).join(" ")),
  createSettingsSearchEntry(
    "panel:language",
    "language",
    t("settings.language.title"),
    t("settings.language.description"),
    t("settings.language.eyebrow"),
  ),
  createSettingsSearchEntry(
    "language",
    "language",
    t("settings.language.label"),
    t("settings.language.description"),
    getSettingsOptionLabels(languageOptions.value),
  ),
  createSettingsSearchEntry(
    "panel:menu",
    "menu",
    t("settings.menu.title"),
    t("settings.menu.showPlanDescription"),
    t("settings.menu.eyebrow"),
  ),
  createSettingsSearchEntry(
    "menu.show-plan",
    "menu",
    t("settings.menu.showPlan"),
    t("settings.menu.showPlanDescription"),
  ),
  createSettingsSearchEntry(
    "panel:global-map-data",
    "global-map-data",
    t("settings.globalMapData.title"),
    t("settings.globalMapData.description"),
    "reseau donnees qualite pack hors connexion tuiles tracés couleurs",
  ),
  createSettingsSearchEntry(
    "panel:places",
    "places",
    t("settings.places.title"),
    t("settings.places.navigationDescription"),
    t("settings.places.eyebrow"),
  ),
  createSettingsSearchEntry(
    "places.default",
    "places",
    t("settings.places.defaultLabel"),
    t("settings.places.defaultDescription"),
    getSettingsOptionLabels(placeOptions.value),
  ),
  createSettingsSearchEntry(
    "places.navigation",
    "places",
    t("settings.places.navigationLabel"),
    t("settings.places.navigationDescription"),
    getSettingsOptionLabels(placePresetNavigationModeLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "panel:address-book",
    "address-book",
    t("addressBook.title"),
    t("addressBook.description"),
    t("addressBook.eyebrow"),
  ),
  createSettingsSearchEntry(
    "address-book.entry",
    "address-book",
    t("addressBook.title"),
    t("addressBook.description"),
  ),
  createSettingsSearchEntry(
    "panel:display",
    "display",
    t("settings.display.title"),
    "tableaux prochains passages affichage stations écran",
  ),
  createSettingsSearchEntry(
    "display.place",
    "display",
    t("settings.places.displayPlaceLabel"),
    t("settings.places.displayPlaceDescription"),
    getSettingsOptionLabels(placeOptions.value),
  ),
  createSettingsSearchEntry(
    "display.station-buttons",
    "display",
    t("settings.display.stationButtons"),
    t("settings.display.stationButtonsDescription"),
    getSettingsOptionLabels(boardTogglesPlacementLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "display.panel-design",
    "display",
    t("settings.display.panelDesign"),
    t("settings.display.panelDesignDescription"),
    getSettingsOptionLabels(fullscreenStationPanelDesignLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "display.panel-dark-theme",
    "display",
    t("settings.display.panelDarkTheme"),
    t("settings.display.panelDarkThemeDescription"),
  ),
  createSettingsSearchEntry(
    "display.closed-accordion",
    "display",
    t("settings.display.closedAccordion"),
    t("settings.display.closedAccordionDescription"),
    getSettingsOptionLabels(closedDirectionSummaryLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "display.max-departures",
    "display",
    t("settings.display.maxDepartures"),
    t("settings.display.maxDeparturesDescription"),
    getSettingsOptionLabels(maxDeparturesLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "display.terminal-only",
    "display",
    t("settings.display.terminalOnly"),
    t("settings.display.terminalOnlyDescription"),
  ),
  createSettingsSearchEntry(
    "display.ghost-lines",
    "display",
    t("settings.display.structuralGhostLines"),
    t("settings.display.structuralGhostLinesDescription"),
  ),
  createSettingsSearchEntry(
    "display.traffic-design",
    "display",
    t("settings.display.trafficDesign"),
    t("settings.display.trafficDesignDescription"),
    getSettingsOptionLabels(trafficInfoDesignLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "panel:traffic",
    "traffic",
    t("settings.display.trafficScope"),
    t("settings.display.trafficScopeDescription"),
    "trafic perturbations interruptions cache correspondances",
  ),
  createSettingsSearchEntry(
    "traffic.scope",
    "traffic",
    t("settings.display.trafficScope"),
    t("settings.display.trafficScopeDescription"),
    getSettingsOptionLabels(trafficInfoDefaultScopeLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "traffic.cache",
    "traffic",
    t("settings.trafficCache.title"),
    t("settings.trafficCache.description"),
    t("settings.trafficCache.forceRefresh"),
  ),
  createSettingsSearchEntry(
    "traffic.calendar-scope",
    "traffic",
    t("settings.display.trafficCalendarScope"),
    t("settings.display.trafficCalendarScopeDescription"),
    getSettingsOptionLabels(trafficCalendarImpactScopeLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "traffic.equation",
    "traffic",
    t("settings.trafficCalendarEquation.title"),
    t("settings.trafficCalendarEquation.description"),
    t("settings.trafficCalendarEquation.formula"),
  ),
  createSettingsSearchEntry(
    "traffic.modal-formatting",
    "traffic",
    t("settings.display.trafficModalSmartFormatting"),
    t("settings.display.trafficModalSmartFormattingDescription"),
  ),
  createSettingsSearchEntry(
    "traffic.smart-detection",
    "traffic",
    t("settings.display.smartTraffic"),
    t("settings.display.smartTrafficDescription"),
  ),
  createSettingsSearchEntry(
    "traffic.replacement-buses",
    "traffic",
    t("settings.display.unifyReplacementBusMarkers"),
    t("settings.display.unifyReplacementBusMarkersDescription"),
  ),
  createSettingsSearchEntry(
    "traffic.warning-lookahead",
    "traffic",
    t("settings.display.trafficWarningLookahead"),
    t("settings.display.trafficWarningLookaheadDescription"),
  ),
  createSettingsSearchEntry(
    "traffic.user-location",
    "traffic",
    t("settings.display.showUserLocation"),
    t("settings.display.showUserLocationDescription"),
  ),
  createSettingsSearchEntry(
    "traffic.local-cache",
    "traffic",
    t("settings.bundles.enableLocalCache"),
    t("settings.display.transferLocalCacheDescription"),
  ),
  createSettingsSearchEntry(
    "traffic.backend-cache",
    "traffic",
    t("settings.bundles.enableBackendCache"),
    t("settings.display.transferBackendCacheDescription"),
  ),
  createSettingsSearchEntry(
    "traffic.expiration",
    "traffic",
    t("settings.bundles.expiration"),
    t("settings.display.transferExpirationDescription"),
    getSettingsOptionLabels(transferBundleRetentionLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "traffic.loading",
    "traffic",
    t("settings.bundles.loading"),
    t("settings.display.transferLoadingDescription"),
  ),
  createSettingsSearchEntry(
    "traffic.resolver",
    "traffic",
    t("settings.bundles.resolver"),
    t("settings.display.transferResolverDescription"),
    getSettingsOptionLabels(transferResolverModeLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "traffic.concurrency",
    "traffic",
    t("settings.bundles.concurrency"),
    t("settings.display.transferConcurrencyDescription"),
    getSettingsOptionLabels(transferBundleRequestConcurrencyLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "traffic.spacing",
    "traffic",
    t("settings.bundles.spacing"),
    t("settings.display.transferSpacingDescription"),
    getSettingsOptionLabels(transferBundleRequestSpacingLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "traffic.bundles",
    "traffic",
    t("settings.bundles.title"),
    t("settings.display.transferCacheDescription"),
  ),
  createSettingsSearchEntry(
    "traffic.walking-cache",
    "traffic",
    t("settings.walkingCache.title"),
    t("settings.walkingCache.description"),
  ),
  createSettingsSearchEntry(
    "panel:weather",
    "weather",
    t("settings.display.weather"),
    t("settings.display.weatherDescription"),
    t("weather.title"),
  ),
  createSettingsSearchEntry(
    "weather.mode",
    "weather",
    t("settings.display.weather"),
    t("settings.display.weatherDescription"),
    getSettingsOptionLabels(weatherModeLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "weather.test-mode",
    "weather",
    t("settings.display.weatherTestMode"),
    t("settings.display.weatherTestDescription"),
    getSettingsOptionLabels(weatherTestModeLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "weather.lookahead",
    "weather",
    t("settings.display.weatherLookahead"),
    t("settings.display.weatherLookaheadDescription"),
    getSettingsOptionLabels(weatherLookaheadLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "weather.apparent-temperature",
    "weather",
    t("settings.display.weatherApparent"),
    t("settings.display.weatherApparentDescription"),
  ),
  createSettingsSearchEntry(
    "weather.location",
    "weather",
    t("settings.display.weatherLocation"),
    t("settings.display.weatherLocationDescription"),
    getSettingsOptionLabels(weatherLocationLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "weather.custom-location",
    "weather",
    `${t("settings.display.weatherCustomName")} ${t("settings.display.weatherCustomLatitude")} ${t("settings.display.weatherCustomLongitude")}`,
    t("settings.display.weatherLocationDescription"),
  ),
  createSettingsSearchEntry(
    "panel:gtfs",
    "gtfs",
    t("settings.gtfs.title"),
    t("settings.gtfs.description"),
    t("settings.gtfs.toggle"),
  ),
  createSettingsSearchEntry(
    "panel:map",
    "map",
    t("settings.display.mapTitle"),
    "carte fond cartographique plan global stations proximité",
  ),
  createSettingsSearchEntry(
    "map.contrast",
    "map",
    t("settings.display.mapContrast"),
    t("settings.display.mapContrastDescription"),
  ),
  createSettingsSearchEntry(
    "map.basemap-style",
    "map",
    t("settings.display.mapBasemapStyle"),
    t("settings.display.mapBasemapStyleDescription"),
    getSettingsOptionLabels(globalMapBasemapStyleLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "map.continuous-rendering",
    "map",
    t("settings.display.globalMapContinuousRendering"),
    t("settings.display.globalMapContinuousRenderingDescription"),
    "dézoom zoom lignes progressif mouvement caméra performances",
  ),
  createSettingsSearchEntry(
    "map.progressive-bus-rendering",
    "map",
    t("settings.display.globalMapProgressiveBusRendering"),
    t("settings.display.globalMapProgressiveBusRenderingDescription"),
    "dézoom bus autobus noctilien charge cpu mémoire progressif",
  ),
  createSettingsSearchEntry(
    "map.antialiasing",
    "map",
    t("settings.display.deckAntialiasing"),
    t("settings.display.deckAntialiasingDescription"),
  ),
  createSettingsSearchEntry(
    "map.real-estate-color-transitions",
    "map",
    t("settings.display.realEstateColorTransitions"),
    t("settings.display.realEstateColorTransitionsDescription"),
    "immobilier couleurs transition animation",
  ),
  createSettingsSearchEntry(
    "map.nearby-controls",
    "map",
    t("settings.display.nearbyMapControlsTitle"),
    t("settings.display.nearbyMapControlsDescription"),
  ),
  createSettingsSearchEntry(
    "map.nearby-isochrone",
    "map",
    t("settings.display.nearbyMapShowIsochroneControl"),
    t("settings.display.nearbyMapShowIsochroneControlDescription"),
  ),
  createSettingsSearchEntry(
    "map.nearby-directory",
    "map",
    t("settings.display.nearbyMapShowDirectoryControl"),
    t("settings.display.nearbyMapShowDirectoryControlDescription"),
  ),
  createSettingsSearchEntry(
    "map.nearby-basemap",
    "map",
    t("settings.display.nearbyMapShowBasemapControl"),
    t("settings.display.nearbyMapShowBasemapControlDescription"),
  ),
  createSettingsSearchEntry(
    "map.nearby-display",
    "map",
    t("settings.display.nearbyMapShowDisplayControl"),
    t("settings.display.nearbyMapShowDisplayControlDescription"),
  ),
  createSettingsSearchEntry(
    "map.nearby-fullscreen",
    "map",
    t("settings.display.nearbyMapShowFullscreenControl"),
    t("settings.display.nearbyMapShowFullscreenControlDescription"),
  ),
  createSettingsSearchEntry(
    "map.minimap",
    "map",
    t("settings.display.showMiniMap"),
    t("settings.display.showMiniMapDescription"),
  ),
  createSettingsSearchEntry(
    "map.line-icons",
    "map",
    t("settings.display.showTravelRouteLineIcons"),
    t("settings.display.showTravelRouteLineIconsDescription"),
  ),
  createSettingsSearchEntry(
    "map.city-zones",
    "map",
    t("settings.display.showCityZones"),
    t("settings.display.showCityZonesDescription"),
  ),
  createSettingsSearchEntry(
    "map.compact-mode",
    "map",
    t("settings.display.compactMode"),
    t("settings.display.compactModeDescription"),
    getSettingsOptionLabels(compactLinePlanLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "map.compact-vertical-spacing",
    "map",
    t("settings.display.compactVerticalSpacing"),
    t("settings.display.compactVerticalSpacingDescription"),
  ),
  createSettingsSearchEntry(
    "map.rounded-curves",
    "map",
    t("settings.display.roundedCurves"),
    t("settings.display.roundedCurvesDescription"),
  ),
  createSettingsSearchEntry(
    "map.interruption-walking-times",
    "map",
    t("settings.display.interruptionWalkingTimes"),
    t("settings.display.interruptionWalkingTimesDescription"),
  ),
  createSettingsSearchEntry(
    "map.compact-fork-gap",
    "map",
    t("settings.display.compactForkGap"),
    t("settings.display.compactForkGapDescription"),
  ),
  createSettingsSearchEntry(
    "map.realistic-spacing",
    "map",
    t("settings.display.realisticSpacing"),
    t("settings.display.realisticSpacingDescription"),
    `${t("settings.display.minCoefficient")} ${t("settings.display.maxCoefficient")}`,
  ),
  createSettingsSearchEntry(
    "map.rich-transfer-tooltips",
    "map",
    t("settings.display.richTransferTooltips"),
    t("settings.display.richTransferTooltipsDescription"),
  ),
  createSettingsSearchEntry(
    "map.reduce-motion",
    "map",
    t("settings.display.reduceMotion"),
    t("settings.display.reduceMotionDescription"),
    "animations mouvements accessibilité",
  ),
  createSettingsSearchEntry(
    "panel:plugins",
    "plugins",
    t("settings.plugins.title"),
    t("settings.plugins.description"),
    t("settings.plugins.eyebrow"),
  ),
  createSettingsSearchEntry(
    "panel:mobile-release",
    "mobile-release",
    t("mobileRelease.title"),
    t("mobileRelease.body"),
    "android apk application mobile",
  ),
  createSettingsSearchEntry(
    "panel:device",
    "device",
    t("settings.device.title"),
    "écran tablette navigation appareil",
    t("settings.device.eyebrow"),
  ),
  createSettingsSearchEntry(
    "device.network",
    "device",
    t("settings.network.title"),
    t("settings.network.description"),
    getSettingsOptionLabels(networkConcurrencyOptions.value),
  ),
  createSettingsSearchEntry(
    "device.wake-lock",
    "device",
    t("settings.device.wakeLock"),
    t("settings.device.wakeLockDescription"),
    getSettingsOptionLabels(wakeLockLocalizedOptions.value),
  ),
  createSettingsSearchEntry(
    "device.wake-alarm",
    "device",
    t("settings.device.wakeDeviceOnAlarm"),
    t("settings.device.wakeDeviceOnAlarmDescription"),
  ),
  createSettingsSearchEntry(
    "device.travel-margin",
    "device",
    t("settings.device.travelAlarmSafetyMinutes"),
    t("settings.device.travelAlarmSafetyMinutesDescription"),
  ),
  createSettingsSearchEntry(
    "device.auto-hide",
    "device",
    t("settings.device.navigationAutoHide"),
    t("settings.device.navigationAutoHideDescription"),
    getSettingsOptionLabels(navigationAutoHideLocalizedOptions.value),
  ),
]);

const settingsSearchFuse = computed(
  () =>
    new Fuse(settingsSearchEntries.value, {
      ignoreLocation: true,
      keys: ["searchText"],
      minMatchCharLength: 1,
      threshold: 0.42,
    }),
);
const settingsSearchResults = computed(() => {
  const query = normalizeSettingsSearchText(debouncedSettingsSearchQuery.value);
  return query ? settingsSearchFuse.value.search(query) : [];
});
const matchedSettingsIds = computed(
  () => new Set(settingsSearchResults.value.map((result) => result.item.id)),
);
const hasSettingsSearchQuery = computed(() => Boolean(debouncedSettingsSearchQuery.value));
const settingsSearchPending = computed(
  () => settingsSearchQuery.value.trim() !== debouncedSettingsSearchQuery.value,
);

function updateSettingsSearchQuery(value: string): void {
  settingsSearchQuery.value = value;

  if (settingsSearchTimer) {
    clearTimeout(settingsSearchTimer);
  }

  settingsSearchTimer = setTimeout(() => {
    debouncedSettingsSearchQuery.value = value.trim();
    settingsSearchTimer = undefined;
  }, SETTINGS_SEARCH_DEBOUNCE_MS);
}

function clearSettingsSearchQuery(): void {
  updateSettingsSearchQuery("");
}

function isPanelVisible(panelId: string): boolean {
  if (!hasSettingsSearchQuery.value) return true;
  return settingsSearchResults.value.some((result) => result.item.panelId === panelId);
}

function isSettingVisible(settingId: string, panelId: string, parentSettingId?: string): boolean {
  if (!hasSettingsSearchQuery.value) return true;

  return (
    matchedSettingsIds.value.has(settingId) ||
    matchedSettingsIds.value.has(`panel:${panelId}`) ||
    (parentSettingId ? matchedSettingsIds.value.has(parentSettingId) : false)
  );
}

const selectedDisplayPlace = computed(
  () =>
    getTransitPlaceById(presetState.value, selectedDisplayPlaceId.value) ??
    presetState.value.places[0],
);
const selectedDisplayPreferences = computed(() => selectedDisplayPlace.value?.preferences);
let settingsNotificationTimer: ReturnType<typeof setTimeout> | undefined;

function updateClosedSummaryMode(value: string): void {
  updateSelectedDisplayPreferences({
    closedDirectionSummaryMode: value as ClosedDirectionSummaryMode,
  });
}

function updateMaxDepartures(value: string): void {
  updateSelectedDisplayPreferences({
    maxDeparturesPerDirection: parseMaxDeparturesPerDirection(value),
  });
}

function updateLanguage(value: string): void {
  updateSettings({ language: value as LanguagePreference });
}

function updateWakeLock(value: string): void {
  updateSettings({ wakeLockDuration: value as WakeLockDuration });
}

function updateNetworkConcurrencyMode(value: string): void {
  updateSettings({ networkConcurrencyMode: parseNetworkConcurrencyMode(value) });
}

function updateTravelAlarmSafetyMinutes(value: string): void {
  updateSettings({ travelAlarmSafetyMinutes: parseTravelAlarmSafetyMinutes(value) });
}

function updateAutoHide(value: string): void {
  updateSettings({ navigationAutoHide: value as NavigationAutoHide });
}

function updateBoardTogglesPlacement(value: string): void {
  updateSelectedDisplayPreferences({
    boardTogglesPlacement: value as BoardTogglesPlacement,
  });
}

function updatePlacePresetNavigationMode(value: string): void {
  updateSettings({
    placePresetNavigationMode: value as PlacePresetNavigationMode,
  });
}

function updateCompactMode(value: string): void {
  updateSettings({ compactLinePlanMode: value as CompactLinePlanMode });
}

function updateGlobalMapBasemapContrast(value: string): void {
  updateSettings({ globalMapBasemapContrast: parseGlobalMapBasemapContrast(value) });
}

function updateGlobalMapBasemapStyle(value: string): void {
  updateSettings({ globalMapBasemapStyle: parseGlobalMapBasemapStyle(value) });
}

function updatePatternCompactBranchGap(value: string): void {
  updateSettings({
    patternCompactBranchGap: parsePatternCompactBranchGap(value),
  });
}

function updatePatternCompactForkGap(value: string): void {
  updateSettings({
    patternCompactForkGap: parsePatternCompactForkGap(value),
  });
}

function updatePatternRealisticMinGapCoefficient(value: string): void {
  updateSettings({
    patternRealisticMinGapCoefficient: parsePatternRealisticMinGapCoefficient(value),
  });
}

function updatePatternRealisticMaxGapCoefficient(value: string): void {
  updateSettings({
    patternRealisticMaxGapCoefficient: parsePatternRealisticMaxGapCoefficient(
      value,
      settings.value.patternRealisticMinGapCoefficient,
    ),
  });
}

function updateFullscreenStationPanelDesign(value: string): void {
  updateSettings({
    fullscreenStationPanelDesign: value as FullscreenStationPanelDesign,
  });
}

function updateSelectedDisplayPlace(value: string): void {
  selectedDisplayPlaceId.value = resolveTransitPlaceId(presetState.value, value);
}

function updateDefaultPlace(value: string): void {
  try {
    presetState.value = setDefaultTransitPlace(presetState.value, value);
    persistPresetState();
  } catch (error) {
    showSettingsNotification(
      error instanceof Error ? error.message : t("settings.notifications.notFoundPlace"),
    );
  }
}

function updateSelectedDisplayPreferences(patch: Partial<TransitBoardPreferences>): void {
  const place = selectedDisplayPlace.value;

  if (!place) {
    return;
  }

  presetState.value = updateTransitPlacePreferences(presetState.value, place.id, {
    ...place.preferences,
    ...patch,
  });
  persistPresetState();
}

function openPresetsModal(): void {
  presetsModalOpen.value = true;
}

function openAddressBook(): void {
  addressBookModalOpen.value = true;
}

function closeAddressBook(): void {
  addressBookModalOpen.value = false;
}

function viewAddressBookLocation(entry: AddressBookEntry): void {
  addressBookModalOpen.value = false;
  void router.push({
    path: "/map",
    query: {
      focusLat: String(entry.lat),
      focusLon: String(entry.lon),
      ...(entry.name ? { focusLabel: entry.name } : {}),
    },
  });
}

function viewAddressBookNeighborhood(entry: AddressBookEntry): void {
  addressBookModalOpen.value = false;
  if (typeof window === "undefined") return;
  const params = new URLSearchParams({
    address: entry.address || entry.name,
    lat: String(entry.lat),
    lon: String(entry.lon),
    ...(entry.city ? { city: entry.city } : {}),
  });
  window.open(`/nearby-stations?${params.toString()}`, "_blank", "noopener,noreferrer");
}

function openCreatePlaceModal(): void {
  placeNameMode.value = "create";
  placeNameTargetId.value = "";
  placeNameInitialValue.value = "";
  placeNameError.value = "";
  placeNameModalOpen.value = true;
}

function openRenamePlaceModal(place: TransitPlacePreset): void {
  placeNameMode.value = "rename";
  placeNameTargetId.value = place.id;
  placeNameInitialValue.value = place.label;
  placeNameError.value = "";
  placeNameModalOpen.value = true;
}

function closePlaceNameModal(): void {
  placeNameModalOpen.value = false;
  placeNameError.value = "";
}

function submitPlaceName(name: string): void {
  try {
    if (placeNameMode.value === "create") {
      const result = createTransitPlace(presetState.value, name, transitBoards);

      presetState.value = result.state;
      selectedDisplayPlaceId.value = result.place.id;
    } else {
      const previousTargetId = placeNameTargetId.value;
      const nextState = renameTransitPlace(presetState.value, previousTargetId, name);
      const renamedPlace =
        getTransitPlaceById(nextState, previousTargetId) ??
        nextState.places.find((place) => place.label === name);

      presetState.value = nextState;
      selectedDisplayPlaceId.value = resolveTransitPlaceId(
        nextState,
        renamedPlace?.id ?? previousTargetId,
      );
    }

    persistPresetState();
    closePlaceNameModal();
  } catch (error) {
    placeNameError.value =
      error instanceof Error ? error.message : t("settings.notifications.saveFailed");
  }
}

function removePlace(place: TransitPlacePreset): void {
  try {
    presetState.value = deleteTransitPlace(presetState.value, place.id);
    selectedDisplayPlaceId.value = resolveTransitPlaceId(
      presetState.value,
      selectedDisplayPlaceId.value,
    );
    persistPresetState();
  } catch (error) {
    showSettingsNotification(
      error instanceof Error ? error.message : t("settings.notifications.deleteFailed"),
    );
  }
}

function persistPresetState(): void {
  saveTransitPresetState(presetState.value);
}

function getPlaceLabel(place: TransitPlacePreset): string {
  if (place.id === DEFAULT_TRANSIT_PLACE_ID) {
    return t("places.home");
  }

  if (place.id === WORK_TRANSIT_PLACE_ID) {
    return t("places.work");
  }

  return place.label;
}

function getPlaceStationNames(place: TransitPlacePreset): string[] {
  const boards = [...transitBoards, ...place.preferences.customBoards];
  const visibleIds = new Set(place.preferences.visibleBoardIds);

  return place.preferences.boardOrderIds.flatMap((boardId) => {
    const board = boards.find((candidate) => candidate.id === boardId);

    return board && visibleIds.has(board.id) ? [board.title] : [];
  });
}

function getPlaceStationSummary(place: TransitPlacePreset): string {
  const count = getPlaceStationNames(place).length;

  return count === 1
    ? t("settings.places.stationSummaryOne", { count })
    : t("settings.places.stationSummaryOther", { count });
}

function updateTrafficCalendarImpactScope(value: string): void {
  updateSettings({
    trafficCalendarImpactScope: value as TrafficCalendarImpactScope,
  });
}

function updateTrafficInfoDesign(value: string): void {
  updateSettings({ trafficInfoDesign: value as TrafficInfoDesign });
}

function updateTrafficInfoDefaultScope(value: string): void {
  updateSettings({ trafficInfoDefaultScope: value as TrafficInfoDefaultScope });
}

function updateTrafficWarningLookaheadDays(value: string): void {
  updateSettings({
    trafficWarningLookaheadDays: parseTrafficWarningLookaheadDays(value),
  });
}

function updateTransferBundleRetention(value: string): void {
  updateSettings({
    transferBundleRetentionDays: parseTransferBundleRetentionDays(value),
  });
}

function updateTransferBundleRequestConcurrency(value: string): void {
  updateSettings({
    transferBundleRequestConcurrency: parseTransferBundleRequestConcurrency(
      value,
    ) as TransferBundleRequestConcurrency,
  });
}

function updateTransferBundleRequestSpacing(value: string): void {
  updateSettings({
    transferBundleRequestSpacingMs: parseTransferBundleRequestSpacingMs(
      value,
    ) as TransferBundleRequestSpacingMs,
  });
}

function updateTransferResolverMode(value: string): void {
  updateSettings({ transferResolverMode: value as TransferResolverMode });
}

async function openBundlesModal(): Promise<void> {
  await refreshBundleSummaries();
  bundlesModalOpen.value = true;
}

async function refreshBundleSummaries(): Promise<void> {
  // Backend bundles can disappear on Cloudflare Pages, while local bundles are
  // tied to the current browser. Showing both makes cache debugging clearer.
  const backendSummaries = await listTransferBundles();

  bundleSummaries.value = backendSummaries;
  localBundleSummaries.value =
    typeof window === "undefined" ? [] : listTransferBundles(window.localStorage);
}

async function clearBundles(): Promise<void> {
  // Clear both cache layers. The backend request is allowed to fail because the
  // local cache cleanup should still happen in offline/serverless edge cases.
  const backendClear = clearTransferBundles().catch(() => undefined);

  if (typeof window !== "undefined") {
    clearTransferBundles(window.localStorage);
  }

  clearPatternTransferRuntimeCaches();
  showSettingsNotification(t("settings.bundles.cleared"));
  await backendClear;
  await refreshBundleSummaries();
}

function clearWalkingRoutesCache(): void {
  clearNearbyWalkingRouteCache();
  showSettingsNotification(t("settings.walkingCache.cleared"));
}

async function deleteBundle(id: string): Promise<void> {
  const backendDelete = deleteTransferBundle(id).catch(() => undefined);

  if (typeof window !== "undefined") {
    deleteTransferBundle(id, window.localStorage);
  }

  clearPatternTransferRuntimeCaches();
  await backendDelete;
  await refreshBundleSummaries();
}

function formatBundleDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : d(date, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function formatTransferResolverMode(_value: TransferBundleSummary["transferResolverMode"]): string {
  return t("settings.options.transferResolver.nearby");
}

function formatTransferBundleDistance(
  value: TransferBundleSummary["nearbyDistanceMeters"],
): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value} m`
    : t("settings.bundles.autoDistance");
}

function formatDays(value: number): string {
  return value === 1
    ? t("settings.options.trafficWarning.oneDay")
    : t("settings.options.trafficWarning.days", { count: value });
}

function updateWeatherMode(value: string): void {
  updateSettings({ weatherMode: value as WeatherMode });
}

function updateWeatherTestMode(value: string): void {
  updateSettings({ weatherTestMode: value as WeatherTestMode });
}

function updateWeatherLookahead(value: string): void {
  updateSettings({
    weatherLookaheadMinutes: parseWeatherLookaheadMinutes(value),
  });
}

function updateWeatherLocationPreset(value: string): void {
  updateSettings({ weatherLocationPreset: value as WeatherLocationPreset });
}

function updateWeatherCustomLocation(
  field: "label" | "latitude" | "longitude",
  value: string,
): void {
  updateSettings({
    weatherCustomLocation: {
      ...settings.value.weatherCustomLocation,
      [field]: field === "label" ? value : Number.parseFloat(value),
    },
  });
}

function resetSettingsWithNotification(): void {
  resetSettings();
  clearNearbyWalkingRouteCache();
  showSettingsNotification(t("settings.notifications.reset"));
}

function showSettingsNotification(message: string, tone: AppNotificationTone = "info"): void {
  settingsNotification.value = { message, tone };

  if (settingsNotificationTimer) {
    clearTimeout(settingsNotificationTimer);
  }

  settingsNotificationTimer = setTimeout(() => {
    settingsNotification.value = { message: "", tone: "info" };
    settingsNotificationTimer = undefined;
  }, 5_000);
}

onMounted(() => {
  presetState.value = loadTransitPresetState(transitBoards);
  selectedDisplayPlaceId.value = resolveTransitPlaceId(
    presetState.value,
    selectedDisplayPlaceId.value,
  );
  void loadGlobalMapSettingsData();
  void loadTrafficCacheStatus();
  void loadAnnualRidershipStatus();
  trafficCacheStatusTimer = setInterval(() => {
    void loadTrafficCacheStatus();
  }, 15_000);
  trafficCacheClockTimer = setInterval(() => {
    trafficCacheNow.value = Date.now();
  }, 1_000);
});

onBeforeUnmount(() => {
  if (settingsSearchTimer) {
    clearTimeout(settingsSearchTimer);
  }
  if (settingsNotificationTimer) {
    clearTimeout(settingsNotificationTimer);
  }
  if (trafficCacheStatusTimer) clearInterval(trafficCacheStatusTimer);
  if (trafficCacheClockTimer) clearInterval(trafficCacheClockTimer);
});
</script>

<template>
  <main class="settings-page">
    <header class="settings-page__hero">
      <p class="eyebrow">{{ t("settings.hero.eyebrow") }}</p>
      <h1>{{ t("settings.hero.title") }}</h1>
      <p>{{ t("settings.hero.body") }}</p>
    </header>

    <div class="settings-search" data-settings-search role="search">
      <label class="settings-search__field">
        <Search :size="20" aria-hidden="true" />
        <span class="sr-only">{{ t("settings.search.label") }}</span>
        <input
          :value="settingsSearchQuery"
          :aria-busy="settingsSearchPending"
          :aria-label="t('settings.search.label')"
          :placeholder="t('settings.search.placeholder')"
          type="search"
          @input="updateSettingsSearchQuery(($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="settingsSearchQuery"
          class="settings-search__clear icon-button"
          type="button"
          :aria-label="t('settings.search.clear')"
          @click="clearSettingsSearchQuery"
        >
          <X :size="18" aria-hidden="true" />
        </button>
      </label>
    </div>

    <NotSettingsFound
      v-if="hasSettingsSearchQuery && settingsSearchResults.length === 0"
      :description="t('settings.search.noResultsDescription')"
      :title="t('settings.search.noResults')"
    />

    <SettingsLanguageCategory
      v-if="isPanelVisible('language')"
      :settings="settings"
      :panel-open="isPanelOpen('language')"
      :is-setting-visible="isSettingVisible"
      :language-options="languageOptions"
      @toggle="togglePanel('language')"
      @update-settings="updateSettings"
    />

    <SettingsTransportNewsCategory
      v-if="isPanelVisible('feed')"
      :settings="settings"
      :panel-open="isPanelOpen('feed')"
      :is-setting-visible="isSettingVisible"
      @toggle="togglePanel('feed')"
      @update-settings="updateSettings"
    />

    <SettingsMenuCategory
      v-if="isPanelVisible('menu')"
      :settings="settings"
      :panel-open="isPanelOpen('menu')"
      :is-setting-visible="isSettingVisible"
      @toggle="togglePanel('menu')"
      @update-settings="updateSettings"
    />

    <SettingsGlobalMapDataCategory
      v-if="isPanelVisible('global-map-data')"
      :data-quality-cards="dataQualityCards"
      :global-map-config-json="globalMapConfigJson"
      :global-map-generated-at-label="globalMapGeneratedAtLabel"
      :global-map-manifest="globalMapManifest"
      :global-map-manifest-error="globalMapManifestError"
      :global-map-manifest-json="globalMapManifestJson"
      :global-map-manifest-loading="globalMapManifestLoading"
      :global-map-pack-files-json="globalMapPackFilesJson"
      :global-map-pack-summary-json="globalMapPackSummaryJson"
      :global-map-pack-warnings-json="globalMapPackWarningsJson"
      :global-map-quality-status-icons="globalMapQualityStatusIcons"
      :global-map-pack-bytes-label="globalMapPackBytesLabel"
      :is-setting-visible="isSettingVisible"
      :panel-open="isPanelOpen('global-map-data')"
      @toggle="togglePanel('global-map-data')"
    />

    <SettingsPlacesCategory
      v-if="isPanelVisible('places')"
      :default-place-id="presetState.defaultPlaceId"
      :is-setting-visible="isSettingVisible"
      :panel-open="isPanelOpen('places')"
      :place-options="placeOptions"
      :place-preset-navigation-mode-localized-options="placePresetNavigationModeLocalizedOptions"
      :settings="settings"
      @manage-places="openPresetsModal"
      @toggle="togglePanel('places')"
      @update-default-place="updateDefaultPlace"
      @update-place-navigation="updatePlacePresetNavigationMode"
    />

    <SettingsAddressBookCategory
      v-if="isPanelVisible('address-book')"
      :is-setting-visible="isSettingVisible"
      :panel-open="isPanelOpen('address-book')"
      @open-address-book="openAddressBook"
      @toggle="togglePanel('address-book')"
    />

    <SettingsDisplayCategory
      v-if="isPanelVisible('display')"
      :board-toggles-placement-localized-options="boardTogglesPlacementLocalizedOptions"
      :closed-direction-summary-localized-options="closedDirectionSummaryLocalizedOptions"
      :fullscreen-station-panel-design-localized-options="fullscreenStationPanelDesignLocalizedOptions"
      :is-setting-visible="isSettingVisible"
      :max-departures-localized-options="maxDeparturesLocalizedOptions"
      :panel-open="isPanelOpen('display')"
      :place-options="placeOptions"
      :selected-display-place-id="selectedDisplayPlaceId"
      :selected-display-preferences="selectedDisplayPreferences"
      :settings="settings"
      :traffic-info-design-localized-options="trafficInfoDesignLocalizedOptions"
      @toggle="togglePanel('display')"
      @update-board-toggles-placement="updateBoardTogglesPlacement"
      @update-closed-summary-mode="updateClosedSummaryMode"
      @update-display-place="updateSelectedDisplayPlace"
      @update-display-preferences="updateSelectedDisplayPreferences"
      @update-max-departures="updateMaxDepartures"
      @update-panel-design="updateFullscreenStationPanelDesign"
      @update-traffic-info-design="updateTrafficInfoDesign"
      @update-settings="updateSettings"
    />

    <SettingsTrafficCategory
      v-if="isPanelVisible('traffic')"
      :is-setting-visible="isSettingVisible"
      :panel-open="isPanelOpen('traffic')"
      :settings="settings"
      :traffic-cache="trafficCache"
      :traffic-cache-countdown="trafficCacheCountdown"
      :traffic-cache-error="trafficCacheError"
      :traffic-cache-loading="trafficCacheLoading"
      :traffic-cache-refresh-interval-label="trafficCacheRefreshIntervalLabel"
      :traffic-cache-last-update-label="trafficCacheLastUpdateLabel"
      :traffic-cache-state-label="trafficCacheStateLabel"
      :traffic-calendar-impact-scope-localized-options="trafficCalendarImpactScopeLocalizedOptions"
      :traffic-impact-evening-example="trafficImpactEveningExample"
      :traffic-impact-example-score="trafficImpactExampleScore"
      :traffic-impact-evening-example-start-label="trafficImpactEveningExampleStartLabel"
      :traffic-impact-evening-example-end-label="trafficImpactEveningExampleEndLabel"
      :traffic-off-peak-start-label="trafficOffPeakStartLabel"
      :traffic-off-peak-end-label="trafficOffPeakEndLabel"
      :traffic-impact-topology-rows="trafficImpactTopologyRows"
      :traffic-impact-transfer-rows="trafficImpactTransferRows"
      :traffic-warning-lookahead-label="trafficWarningLookaheadLabel"
      :traffic-info-default-scope-localized-options="trafficInfoDefaultScopeLocalizedOptions"
      :transfer-bundle-request-concurrency-localized-options="transferBundleRequestConcurrencyLocalizedOptions"
      :transfer-bundle-request-spacing-localized-options="transferBundleRequestSpacingLocalizedOptions"
      :transfer-bundle-retention-localized-options="transferBundleRetentionLocalizedOptions"
      :transfer-resolver-mode-localized-options="transferResolverModeLocalizedOptions"
      @clear-bundles="clearBundles"
      @clear-walking-cache="clearWalkingRoutesCache"
      @open-bundles="openBundlesModal"
      @refresh-traffic-cache="forceTrafficCacheRefresh"
      @toggle="togglePanel('traffic')"
      @update-calendar-impact-scope="updateTrafficCalendarImpactScope"
      @update-default-scope="updateTrafficInfoDefaultScope"
      @update-settings="updateSettings"
      @update-transfer-concurrency="updateTransferBundleRequestConcurrency"
      @update-transfer-resolver-mode="updateTransferResolverMode"
      @update-transfer-retention="updateTransferBundleRetention"
      @update-transfer-spacing="updateTransferBundleRequestSpacing"
      @update-warning-lookahead-days="updateTrafficWarningLookaheadDays"
    />

    <SettingsWeatherCategory
      v-if="isPanelVisible('weather')"
      :is-setting-visible="isSettingVisible"
      :panel-open="isPanelOpen('weather')"
      :settings="settings"
      :weather-location-localized-options="weatherLocationLocalizedOptions"
      :weather-lookahead-localized-options="weatherLookaheadLocalizedOptions"
      :weather-mode-localized-options="weatherModeLocalizedOptions"
      :weather-test-mode-localized-options="weatherTestModeLocalizedOptions"
      @toggle="togglePanel('weather')"
      @update-settings="updateSettings"
      @update-weather-custom-location="updateWeatherCustomLocation"
      @update-weather-location-preset="updateWeatherLocationPreset"
      @update-weather-lookahead="updateWeatherLookahead"
      @update-weather-mode="updateWeatherMode"
      @update-weather-test-mode="updateWeatherTestMode"
    />

    <GtfsSettingsPanel
      v-if="isPanelVisible('gtfs')"
      :model-value="settings.gtfsLineGeometryEnabled"
      @update:model-value="updateSettings({ gtfsLineGeometryEnabled: $event })"
    />

    <SettingsMapCategory
      v-if="isPanelVisible('map')"
      :compact-line-plan-localized-options="compactLinePlanLocalizedOptions"
      :global-map-basemap-style-localized-options="globalMapBasemapStyleLocalizedOptions"
      :is-setting-visible="isSettingVisible"
      :panel-open="isPanelOpen('map')"
      :settings="settings"
      @toggle="togglePanel('map')"
      @update-basemap-contrast="updateGlobalMapBasemapContrast"
      @update-basemap-style="updateGlobalMapBasemapStyle"
      @update-compact-branch-gap="updatePatternCompactBranchGap"
      @update-compact-fork-gap="updatePatternCompactForkGap"
      @update-compact-mode="updateCompactMode"
      @update-realistic-max-gap="updatePatternRealisticMaxGapCoefficient"
      @update-realistic-min-gap="updatePatternRealisticMinGapCoefficient"
      @update-settings="updateSettings"
    />

    <PluginViewer
      v-if="isPanelVisible('plugins')"
      @notify="showSettingsNotification($event.message, $event.tone)"
    />

    <MobileReleaseCard v-if="isPanelVisible('mobile-release')" />

    <SettingsDeviceCategory
      v-if="isPanelVisible('device')"
      :is-setting-visible="isSettingVisible"
      :navigation-auto-hide-localized-options="navigationAutoHideLocalizedOptions"
      :network-concurrency-options="networkConcurrencyOptions"
      :panel-open="isPanelOpen('device')"
      :settings="settings"
      :wake-lock-localized-options="wakeLockLocalizedOptions"
      @toggle="togglePanel('device')"
      @update-auto-hide="updateAutoHide"
      @update-network-concurrency-mode="updateNetworkConcurrencyMode"
      @update-travel-alarm-safety-minutes="updateTravelAlarmSafetyMinutes"
      @update-wake-lock="updateWakeLock"
      @update-settings="updateSettings"
    />

    <footer class="settings-page__footer">
      <button class="button-secondary" type="button" @click="resetSettingsWithNotification">
        {{ t("common.actions.reset") }}
      </button>
    </footer>

    <AppModal
      :open="presetsModalOpen"
      :eyebrow="t('placeName.eyebrowRename')"
      :title="t('settings.places.title')"
      panel-class="settings-presets-modal"
      @close="presetsModalOpen = false"
    >
      <div class="settings-presets-list">
        <article v-for="place in presetState.places" :key="place.id" class="settings-preset-item">
          <div class="settings-preset-item__content">
            <strong>{{ getPlaceLabel(place) }}</strong>
            <span>{{ getPlaceStationSummary(place) }}</span>
            <ul v-if="getPlaceStationNames(place).length">
              <li
                v-for="stationName in getPlaceStationNames(place)"
                :key="`${place.id}-${stationName}`"
              >
                {{ stationName }}
              </li>
            </ul>
            <small v-else>{{ t("settings.places.noStations") }}</small>
          </div>
          <div class="settings-preset-item__actions">
            <button
              class="icon-button"
              type="button"
              :aria-label="t('settings.places.renameAria', { place: getPlaceLabel(place) })"
              :title="t('common.actions.rename')"
              @click="openRenamePlaceModal(place)"
            >
              <Pencil :size="18" aria-hidden="true" />
            </button>
            <button
              v-if="!isTransitBuiltinPlace(place)"
              class="icon-button settings-preset-item__delete"
              type="button"
              :aria-label="t('settings.places.deleteAria', { place: getPlaceLabel(place) })"
              :title="t('common.actions.delete')"
              @click="removePlace(place)"
            >
              <Trash2 :size="18" aria-hidden="true" />
            </button>
          </div>
        </article>
      </div>

      <template #footer>
        <button class="button-secondary" type="button" @click="openCreatePlaceModal">
          <Plus :size="18" aria-hidden="true" />
          {{ t("settings.places.addPlace") }}
        </button>
        <button class="button-secondary" type="button" @click="presetsModalOpen = false">
          {{ t("common.actions.close") }}
        </button>
      </template>
    </AppModal>

    <PlaceNameModal
      :error="placeNameError"
      :initial-name="placeNameInitialValue"
      :mode="placeNameMode"
      :open="placeNameModalOpen"
      @close="closePlaceNameModal"
      @submit="submitPlaceName"
    />

    <AdressBook
      :open="addressBookModalOpen"
      @close="closeAddressBook"
      @view-location="viewAddressBookLocation"
      @view-neighborhood="viewAddressBookNeighborhood"
    />

    <AppNotification :message="settingsNotification.message" :tone="settingsNotification.tone" />

    <Teleport to="body">
      <div
        v-if="bundlesModalOpen"
        class="settings-bundle-modal-backdrop"
        role="presentation"
        @click.self="bundlesModalOpen = false"
      >
        <section
          class="settings-bundle-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-bundles-title"
        >
          <header>
            <div>
              <p class="eyebrow">{{ t("settings.bundles.modalEyebrow") }}</p>
              <h2 id="settings-bundles-title">{{ t("settings.bundles.modalTitle") }}</h2>
            </div>
            <button
              class="button-secondary"
              type="button"
              :aria-label="t('common.actions.close')"
              @click="bundlesModalOpen = false"
            >
              x
            </button>
          </header>

          <p class="settings-bundle-modal__summary">
            {{
              t("settings.bundles.summary", {
                total: bundleCount,
                plural: bundleCount > 1 ? "s" : "",
                backend: backendBundleCount,
                local: localBundleCount,
              })
            }}
          </p>

          <section v-if="bundleSummaries.length" class="settings-bundle-section">
            <h3>{{ t("settings.bundles.backend") }}</h3>
            <div class="settings-bundle-list">
              <article
                v-for="bundle in bundleSummaries"
                :key="bundle.id"
                class="settings-bundle-item"
              >
                <div>
                  <strong>{{ bundle.lineLabel }}</strong>
                  <span>
                    {{
                      t("settings.bundles.stations", {
                        count: bundle.stopAreaCount,
                      })
                    }}
                    -
                    {{
                      t("settings.bundles.transfers", {
                        count: bundle.transferCount,
                      })
                    }}
                    -
                    {{ formatTransferResolverMode(bundle.transferResolverMode) }}
                    -
                    {{ formatTransferBundleDistance(bundle.nearbyDistanceMeters) }}
                  </span>
                  <small>
                    {{
                      t("settings.bundles.expiresAt", {
                        date: formatBundleDate(bundle.expiresAt),
                      })
                    }}
                  </small>
                </div>
                <button class="button-secondary" type="button" @click="deleteBundle(bundle.id)">
                  {{ t("common.actions.delete") }}
                </button>
              </article>
            </div>
          </section>

          <section v-if="localBundleSummaries.length" class="settings-bundle-section">
            <h3>{{ t("settings.bundles.browser") }}</h3>
            <div class="settings-bundle-list">
              <article
                v-for="bundle in localBundleSummaries"
                :key="`local-${bundle.id}`"
                class="settings-bundle-item"
              >
                <div>
                  <strong>{{ bundle.lineLabel }}</strong>
                  <span>
                    {{
                      t("settings.bundles.stations", {
                        count: bundle.stopAreaCount,
                      })
                    }}
                    -
                    {{
                      t("settings.bundles.transfers", {
                        count: bundle.transferCount,
                      })
                    }}
                    -
                    {{ formatTransferResolverMode(bundle.transferResolverMode) }}
                    -
                    {{ formatTransferBundleDistance(bundle.nearbyDistanceMeters) }}
                  </span>
                  <small>
                    {{
                      t("settings.bundles.expiresAt", {
                        date: formatBundleDate(bundle.expiresAt),
                      })
                    }}
                  </small>
                </div>
                <button class="button-secondary" type="button" @click="deleteBundle(bundle.id)">
                  {{ t("common.actions.delete") }}
                </button>
              </article>
            </div>
          </section>

          <p v-if="!bundleCount" class="settings-bundle-modal__empty">
            {{ t("settings.bundles.empty") }}
          </p>
        </section>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>.settings-page {
  color: var(--ink);
  margin: 0 auto;
  max-width: 1120px;
  min-height: 100vh;
  padding: 42px 22px 110px;
}

.settings-page__hero {
  margin-bottom: 24px;
}

.settings-page__hero h1 {
  font-size: clamp(2rem, 4vw, 3.8rem);
  letter-spacing: 0;
  line-height: 0.98;
  margin: 0;
}

.settings-page__hero p:last-child {
  color: var(--muted);
  font-size: 1.05rem;
  font-weight: 720;
  line-height: 1.5;
  max-width: 760px;
}

.settings-search {
  margin-bottom: 8px;
}

.settings-search__field {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 8px 24px rgba(16, 35, 63, 0.06);
  color: var(--muted);
  display: flex;
  gap: 10px;
  padding: 10px 12px;
}

.settings-search__field:focus-within {
  border-color: var(--idfm-blue);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--idfm-blue), transparent 78%);
}

.settings-search__field input {
  background: transparent;
  border: 0;
  color: var(--ink);
  flex: 1;
  font: inherit;
  font-weight: 720;
  min-width: 0;
  outline: 0;
  padding: 3px 0;
}

.settings-search__field input::placeholder {
  color: var(--muted);
  opacity: 0.9;
}

.settings-search__clear {
  color: var(--muted);
  flex: 0 0 auto;
}

.settings-search__clear:hover:not(:disabled) {
  color: var(--ink);
  transform: none;
}

:deep(.settings-panel) {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-radius: 8px;
  box-shadow: 0 16px 40px rgba(16, 35, 63, 0.08);
  display: grid;
  gap: 18px;
  margin-top: 18px;
  padding: 22px;
}

:deep(.settings-panel__heading) {
  align-items: center;
  border-bottom: 1px solid rgba(16, 35, 63, 0.1);
  display: flex;
  justify-content: space-between;
  padding-bottom: 16px;
}

:deep(.settings-panel:not(.settings-panel--open) > :not(.settings-panel__heading)) {
  display: none;
}

:deep(.settings-panel__trigger) {
  align-items: center;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: flex;
  flex: 1;
  gap: 16px;
  justify-content: space-between;
  min-width: 0;
  padding: 0;
  text-align: left;
}

:deep(.settings-panel__trigger > div) {
  min-width: 0;
}

:deep(.settings-panel__trigger:hover:not(:disabled)) {
  background: rgba(16, 35, 63, 0.035);
  color: inherit;
  transform: none;
}
:deep(.settings-panel__trigger svg) {
  flex: 0 0 auto;
  transition: transform 180ms ease;
}

:deep(.settings-panel--open .settings-panel__trigger svg) {
  transform: rotate(180deg);
}

:deep(.settings-panel__trigger:focus-visible) {
  border-radius: 6px;
  outline: 3px solid color-mix(in srgb, var(--idfm-blue), transparent 35%);
  outline-offset: 4px;
}

:deep(.settings-panel h2) {
  font-size: 1.55rem;
  line-height: 1.1;
  margin: 0;
}

:deep(.settings-panel__description) {
  color: var(--muted);
  font-weight: 720;
  line-height: 1.45;
  margin: 0;
}

:deep(.settings-panel__error) {
  align-items: center;
  color: #b42318;
  display: flex;
  gap: 8px;
  font-weight: 800;
}

:deep(.settings-data-overview) {
  background: linear-gradient(145deg, #f4f7ff 0%, #ffffff 72%);
  border: 1px solid rgba(45, 92, 171, 0.16);
  border-radius: 14px;
  display: grid;
  gap: 20px;
  padding: 20px;
}

:deep(.settings-data-overview__header) {
  align-items: flex-start;
  display: flex;
  gap: 18px;
  justify-content: space-between;
}

:deep(.settings-data-overview h3),
:deep(.settings-data-quality h3) {
  font-size: 1.15rem;
  line-height: 1.2;
  margin: 0;
}

:deep(.settings-data-overview p:not(.eyebrow)),
:deep(.settings-data-quality p:not(.eyebrow)) {
  color: var(--muted);
  font-weight: 720;
  line-height: 1.45;
  margin: 8px 0 0;
}

:deep(.settings-data-overview__badge) {
  background: #e8efff;
  border: 1px solid rgba(45, 92, 171, 0.18);
  border-radius: 999px;
  color: #234d99;
  flex: 0 0 auto;
  font-size: 0.76rem;
  font-weight: 950;
  line-height: 1.2;
  max-width: 240px;
  padding: 8px 11px;
  text-align: center;
}

:deep(.settings-data-facts) {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
}

:deep(.settings-data-facts > div),
:deep(.settings-data-quality__level) {
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(16, 35, 63, 0.08);
  border-radius: 10px;
  padding: 12px;
}

:deep(.settings-data-facts dt) {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 950;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

:deep(.settings-data-facts dd) {
  font-size: 1.2rem;
  font-weight: 950;
  margin: 4px 0 0;
}

:deep(.settings-data-overview__meta) {
  align-items: center;
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  font-size: 0.78rem;
  font-weight: 800;
  gap: 8px 18px;
  line-height: 1.4;
}

:deep(.settings-data-overview__meta span + span) {
  border-left: 1px solid rgba(16, 35, 63, 0.14);
  padding-left: 18px;
}

:deep(.settings-data-quality) {
  border-top: 1px solid rgba(16, 35, 63, 0.1);
  display: grid;
  gap: 14px;
  padding-top: 18px;
}

:deep(.settings-data-quality__levels) {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

:deep(.settings-data-quality__level) {
  display: grid;
  gap: 5px;
}

:deep(.settings-data-quality__level--detailed) {
  border-color: rgba(191, 48, 153, 0.28);
  box-shadow: inset 3px 0 #bf3099;
}

:deep(.settings-data-quality__level strong) {
  font-size: 0.95rem;
  font-weight: 950;
}

:deep(.settings-data-quality__level span),
:deep(.settings-data-quality__note) {
  color: var(--muted);
  font-size: 0.87rem;
  font-weight: 720;
  line-height: 1.4;
}

:deep(.settings-data-quality__note) {
  margin: 0 !important;
}

:deep(.settings-data-quality-cards) {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}

:deep(.settings-data-quality-card) {
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-left: 3px solid #2d5cab;
  border-radius: 10px;
  display: grid;
  gap: 11px;
  grid-template-columns: auto minmax(0, 1fr);
  padding: 13px;
}

:deep(.settings-data-quality-card--attention) {
  border-left-color: #d97706;
}

:deep(.settings-data-quality-card--limited) {
  border-left-color: #b42318;
}

:deep(.settings-data-quality-card--online) {
  border-left-color: #168a63;
}

:deep(.settings-data-quality-card__icon) {
  align-items: center;
  background: #e8efff;
  border-radius: 9px;
  color: #234d99;
  display: flex;
  height: 34px;
  justify-content: center;
  width: 34px;
}

:deep(.settings-data-quality-card__status) {
  align-items: center;
  color: #234d99;
  display: flex;
  font-size: 0.72rem;
  font-weight: 950;
  gap: 5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

:deep(.settings-data-quality-card--attention .settings-data-quality-card__status) {
  color: #a45300;
}

:deep(.settings-data-quality-card--limited .settings-data-quality-card__status) {
  color: #b42318;
}

:deep(.settings-data-quality-card--online .settings-data-quality-card__status) {
  color: #16734f;
}

:deep(.settings-data-quality-card h4) {
  font-size: 0.98rem;
  line-height: 1.2;
  margin: 5px 0 0;
}

:deep(.settings-data-quality-card p),
:deep(.settings-data-quality-card small) {
  color: var(--muted);
  display: block;
  font-weight: 720;
  line-height: 1.4;
  margin: 5px 0 0;
}

:deep(.settings-data-quality-card small) {
  font-size: 0.78rem;
  font-weight: 850;
}

:deep(.settings-data-accordion) {
  background: #f7f9fe;
  border: 1px solid rgba(16, 35, 63, 0.08);
  border-radius: 8px;
  overflow: hidden;
}

:deep(.settings-data-accordion summary) {
  cursor: pointer;
  font-weight: 900;
  padding: 14px 16px;
}

:deep(.settings-data-accordion pre) {
  border-top: 1px solid rgba(16, 35, 63, 0.08);
  margin: 0;
  max-height: 460px;
  overflow: auto;
  padding: 16px;
  white-space: pre-wrap;
  word-break: break-word;
}

:deep(.settings-row) {
  align-items: center;
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
}

:deep(.settings-subheading) {
  border-top: 1px solid rgba(16, 35, 63, 0.1);
  display: grid;
  gap: 4px;
  padding-top: 18px;
}

:deep(.settings-subheading strong) {
  color: var(--ink);
  font-size: 1.02rem;
  font-weight: 950;
}

:deep(.settings-subheading span) {
  color: var(--muted);
  font-weight: 720;
  line-height: 1.45;
}

:deep(.settings-row strong),
:deep(.settings-toggle strong) {
  display: block;
  font-size: 1.02rem;
  font-weight: 950;
}

:deep(.settings-row span),
:deep(.settings-toggle small) {
  color: var(--muted);
  display: block;
  font-weight: 720;
  line-height: 1.45;
  margin-top: 4px;
}

:deep(.settings-number-control) {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-self: end;
  min-width: 0;
}

:deep(.settings-number-control .settings-input) {
  width: 92px;
}

:deep(.settings-number-control > span) {
  margin-top: 0;
  white-space: nowrap;
}

:deep(.settings-row--range) {
  align-items: start;
}

:deep(.settings-range),
:deep(.settings-range-pair) {
  background: #f7f9fe;
  border: 1px solid rgba(16, 35, 63, 0.08);
  border-radius: 8px;
  display: grid;
  gap: 10px;
  padding: 14px;
}

:deep(.settings-range) {
  min-width: 0;
}

:deep(.settings-range span) {
  color: var(--ink);
  display: block;
  font-size: 1rem;
  font-weight: 950;
  line-height: 1.1;
  margin: 0;
}

:deep(.settings-range small) {
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 950;
  line-height: 1.2;
  text-transform: uppercase;
}

:deep(.settings-range input[type="range"]) {
  accent-color: var(--idfm-blue);
  width: 100%;
}

:deep(.settings-range-pair) {
  align-items: start;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 440px);
}

:deep(.settings-range-pair > div:first-child strong) {
  display: block;
  font-size: 1.02rem;
  font-weight: 950;
}

:deep(.settings-range-pair > div:first-child span) {
  color: var(--muted);
  display: block;
  font-weight: 720;
  line-height: 1.45;
  margin-top: 4px;
}

:deep(.settings-range-pair__controls) {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

:deep(.settings-toggle .settings-inline-warning) {
  background: #fff7ed;
  border: 1px solid rgba(234, 88, 12, 0.2);
  border-radius: 8px;
  color: #9a3412;
  display: inline-block;
  font-size: 0.82rem;
  font-weight: 850;
  line-height: 1.35;
  margin-top: 10px;
  padding: 8px 10px;
}

:deep(.settings-bundle-actions) {
  align-items: center;
  background: #f7f9fe;
  border: 1px solid rgba(16, 35, 63, 0.08);
  border-radius: 8px;
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 16px;
}

:deep(.settings-bundle-actions strong) {
  display: block;
  font-size: 1.02rem;
  font-weight: 950;
}

:deep(.settings-bundle-actions span) {
  color: var(--muted);
  display: block;
  font-weight: 720;
  line-height: 1.45;
  margin-top: 4px;
}

:deep(.settings-bundle-actions__buttons) {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.settings-presets-modal {
  max-width: 720px;
  width: min(100%, 720px);
}

.settings-presets-list {
  display: grid;
  gap: 10px;
}

.settings-preset-item {
  align-items: start;
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-radius: 8px;
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 14px;
}

.settings-preset-item__content {
  display: grid;
  gap: 5px;
}

.settings-preset-item__content strong {
  color: var(--ink);
  font-size: 1.05rem;
  font-weight: 950;
}

.settings-preset-item__content span,
.settings-preset-item__content small {
  color: var(--muted);
  font-weight: 800;
}

.settings-preset-item__content ul {
  color: var(--ink);
  display: grid;
  gap: 4px;
  font-weight: 760;
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
}

.settings-preset-item__actions {
  display: flex;
  gap: 8px;
}

.settings-preset-item__delete {
  color: var(--danger);
}

.settings-bundle-modal-backdrop {
  align-items: center;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 22px;
  position: fixed;
  z-index: 10000;
}

.settings-bundle-modal {
  background: #ffffff;
  border: 1px solid rgba(16, 35, 63, 0.12);
  border-radius: 10px;
  box-shadow: 0 24px 70px rgba(16, 35, 63, 0.22);
  color: var(--ink);
  display: grid;
  gap: 16px;
  max-height: min(720px, calc(100vh - 44px));
  overflow: auto;
  padding: 22px;
  width: min(720px, 100%);
}

.settings-bundle-modal header {
  align-items: center;
  border-bottom: 1px solid rgba(16, 35, 63, 0.1);
  display: flex;
  justify-content: space-between;
  padding-bottom: 14px;
}

.settings-bundle-modal h2 {
  margin: 0;
}

.settings-bundle-modal__summary,
.settings-bundle-modal__empty {
  color: var(--muted);
  font-weight: 850;
  margin: 0;
}

.settings-bundle-section {
  display: grid;
  gap: 10px;
}

.settings-bundle-section h3 {
  font-size: 0.95rem;
  font-weight: 950;
  margin: 0;
  text-transform: uppercase;
}

.settings-bundle-list {
  display: grid;
  gap: 10px;
}

.settings-bundle-item {
  align-items: center;
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-radius: 8px;
  display: flex;
  gap: 14px;
  justify-content: space-between;
  padding: 14px;
}

.settings-bundle-item strong,
.settings-bundle-item span,
.settings-bundle-item small {
  display: block;
}

.settings-bundle-item strong {
  font-weight: 950;
}

.settings-bundle-item span,
.settings-bundle-item small {
  color: var(--muted);
  font-weight: 780;
  margin-top: 3px;
}

:deep(.settings-custom-location) {
  display: grid;
  gap: 14px;
  grid-template-columns: 1.4fr 1fr 1fr;
}

:deep(.settings-custom-location label) {
  display: grid;
  gap: 7px;
}

:deep(.settings-custom-location label > span) {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 950;
  text-transform: uppercase;
}

:deep(.settings-input) {
  background: #ffffff;
  border: 1px solid rgba(16, 35, 63, 0.16);
  border-radius: 8px;
  color: var(--ink);
  font: inherit;
  font-weight: 850;
  min-height: 44px;
  padding: 8px 12px;
  width: 100%;
}

:deep(.settings-input:focus) {
  border-color: var(--idfm-blue);
  box-shadow: 0 0 0 3px rgba(0, 100, 255, 0.12);
  outline: none;
}

:deep(.settings-toggle) {
  align-items: center;
  background: #f7f9fe;
  border: 1px solid rgba(16, 35, 63, 0.08);
  border-radius: 8px;
  cursor: pointer;
  display: grid;
  gap: 16px;
  grid-template-columns: auto minmax(0, 1fr);
  min-height: 78px;
  padding: 16px;
}

:deep(.settings-toggle input) {
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}

:deep(.settings-toggle > span) {
  background: #dbe4f2;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(16, 35, 63, 0.08);
  display: block;
  height: 34px;
  position: relative;
  transition: background 160ms ease;
  width: 58px;
}

:deep(.settings-toggle > span::after) {
  background: #ffffff;
  border-radius: 999px;
  box-shadow: 0 3px 9px rgba(16, 35, 63, 0.18);
  content: "";
  height: 26px;
  left: 4px;
  position: absolute;
  top: 4px;
  transition: transform 160ms ease;
  width: 26px;
}

:deep(.settings-toggle input:checked + span) {
  background: var(--idfm-blue);
}

:deep(.settings-toggle input:checked + span::after) {
  transform: translateX(24px);
}

.settings-page__footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 22px;
}

.eyebrow,
:deep(.eyebrow) {
  color: #5136ff;
  font-size: 0.8rem;
  font-weight: 950;
  letter-spacing: 0.04em;
  margin: 0 0 7px;
  text-transform: uppercase;
}

:deep(.traffic-cache-settings) {
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-radius: 14px;
  display: grid;
  gap: 14px;
  margin: 18px 0;
  padding: 16px;
}

:deep(.traffic-cache-settings__header) {
  align-items: flex-start;
  display: flex;
  gap: 14px;
  justify-content: space-between;
}

:deep(.traffic-cache-settings__header h3),
:deep(.traffic-cache-settings__header p) {
  margin: 0;
}

:deep(.traffic-cache-settings__header h3) {
  font-size: 1rem;
  margin-top: 3px;
}

:deep(.traffic-cache-settings__header p:last-child) {
  color: var(--settings-muted, #64748b);
  font-size: 0.82rem;
  margin-top: 5px;
}

:deep(.traffic-cache-settings__state) {
  border: 1px solid rgba(16, 35, 63, 0.14);
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 5px 9px;
  white-space: nowrap;
}

:deep(.traffic-cache-settings__state[data-state="hit"]) {
  background: rgba(34, 197, 94, 0.12);
  color: #166534;
}

:deep(.traffic-cache-settings__state[data-state="stale"]),
:deep(.traffic-cache-settings__state[data-state="rate-limited"]),
:deep(.traffic-cache-settings__state[data-state="error"]) {
  background: rgba(245, 158, 11, 0.14);
  color: #92400e;
}

:deep(.traffic-cache-settings__facts) {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
}

:deep(.traffic-cache-settings__facts div) {
  background: rgba(248, 250, 252, 0.9);
  border-radius: 9px;
  padding: 9px 10px;
}

:deep(.traffic-cache-settings__facts dt) {
  color: var(--settings-muted, #64748b);
  font-size: 0.72rem;
}

:deep(.traffic-cache-settings__facts dd) {
  font-size: 0.83rem;
  font-weight: 800;
  margin: 3px 0 0;
}

:deep(.traffic-impact-equation) {
  background: linear-gradient(135deg, rgba(245, 243, 255, 0.92), rgba(255, 247, 251, 0.92));
  border: 1px solid rgba(109, 40, 217, 0.14);
  border-radius: 16px;
  display: grid;
  gap: 14px;
  padding: 18px;
}

:deep(.traffic-impact-equation header) {
  display: grid;
  gap: 5px;
}

:deep(.traffic-impact-equation h3),
:deep(.traffic-impact-equation h4),
:deep(.traffic-impact-equation p) {
  margin: 0;
}

:deep(.traffic-impact-equation h3) {
  font-size: 1.02rem;
}

:deep(.traffic-impact-equation header > p:last-child),
:deep(.traffic-impact-equation__topology-note),
:deep(.traffic-impact-equation__note) {
  color: #69657d;
  font-size: 0.78rem;
  line-height: 1.45;
}

:deep(.traffic-impact-equation > code) {
  background: #17132e;
  border-radius: 10px;
  color: #ffffff;
  display: block;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.78rem;
  overflow-x: auto;
  padding: 11px 13px;
  white-space: nowrap;
}

:deep(.traffic-impact-equation__tables) {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}

:deep(.traffic-impact-equation__tables section) {
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(16, 35, 63, 0.08);
  border-radius: 11px;
  min-width: 0;
  padding: 11px;
}

:deep(.traffic-impact-equation h4) {
  font-size: 0.77rem;
  margin-bottom: 7px;
}

:deep(.traffic-impact-equation table) {
  border-collapse: collapse;
  font-size: 0.72rem;
  width: 100%;
}

:deep(.traffic-impact-equation th),
:deep(.traffic-impact-equation td) {
  border-top: 1px solid rgba(16, 35, 63, 0.07);
  padding: 5px 0;
  text-align: left;
}

:deep(.traffic-impact-equation th) {
  font-weight: 700;
}

:deep(.traffic-impact-equation td) {
  font-variant-numeric: tabular-nums;
  font-weight: 900;
  text-align: right;
  white-space: nowrap;
}

:deep(.traffic-impact-equation__example) {
  background: #ffffff;
  border-left: 3px solid #7c3aed;
  border-radius: 5px 10px 10px 5px;
  font-size: 0.78rem;
  font-weight: 750;
  line-height: 1.45;
  padding: 10px 12px;
}

@media (max-width: 760px) {
  :deep(.settings-data-overview__header) {
    flex-direction: column;
  }

  :deep(.settings-data-overview__badge) {
    max-width: none;
  }

  :deep(.settings-data-facts) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  :deep(.settings-data-quality__levels) {
    grid-template-columns: 1fr;
  }

  :deep(.traffic-cache-settings__facts) {
    grid-template-columns: 1fr;
  }

  :deep(.settings-row),
  :deep(.settings-range-pair),
  :deep(.settings-custom-location) {
    grid-template-columns: 1fr;
  }

  :deep(.settings-number-control) {
    justify-self: start;
  }

  :deep(.settings-range-pair__controls) {
    grid-template-columns: 1fr;
  }
  :deep(.traffic-impact-equation__tables) {
    grid-template-columns: 1fr;
  }
}
</style>
