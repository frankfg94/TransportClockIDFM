<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Pencil, Plus, Trash2 } from "lucide-vue-next";
import AppModal from "../../components/AppModal.vue";
import AppNotification, {
  type AppNotificationTone,
} from "../../components/AppNotification.vue";
import MaterialCombobox, {
  type MaterialComboboxOption,
} from "../../components/MaterialCombobox.vue";
import PlaceNameModal from "../../components/PlaceNameModal.vue";
import PluginViewer from "./PluginViewer.vue";
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
  parseMaxDeparturesPerDirection,
  parsePatternCompactBranchGap,
  parsePatternCompactForkGap,
  parsePatternRealisticMaxGapCoefficient,
  parsePatternRealisticMinGapCoefficient,
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
  TRAFFIC_WARNING_LOOKAHEAD_DAYS_MAX,
  TRAFFIC_WARNING_LOOKAHEAD_DAYS_MIN,
  transferBundleRequestConcurrencyOptions,
  transferBundleRequestSpacingOptions,
  transferBundleRetentionOptions,
  trafficInfoDefaultScopeOptions,
  trafficCalendarImpactScopeOptions,
  trafficInfoDesignOptions,
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
import {
  weatherLocationOptions,
  type WeatherLocationPreset,
} from "../weather/weatherLocations";
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

const { settings, updateSettings, resetSettings } = useAppSettings();
const { d, n, t } = useI18n();
const presetState = ref<TransitPresetState>(
  createDefaultTransitPresetState(transitBoards),
);
const bundlesModalOpen = ref(false);
const presetsModalOpen = ref(false);
const placeNameModalOpen = ref(false);
const placeNameMode = ref<"create" | "rename">("create");
const placeNameInitialValue = ref("");
const placeNameTargetId = ref("");
const placeNameError = ref("");
const selectedDisplayPlaceId = ref(DEFAULT_TRANSIT_PLACE_ID);
const bundleSummaries = ref<TransferBundleSummary[]>([]);
const localBundleSummaries = ref<TransferBundleSummary[]>([]);
const settingsNotification = ref<{
  message: string;
  tone: AppNotificationTone;
}>({ message: "", tone: "info" });
const backendBundleCount = computed(() => bundleSummaries.value.length);
const localBundleCount = computed(() => localBundleSummaries.value.length);
const bundleCount = computed(
  () => backendBundleCount.value + localBundleCount.value,
);
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
    label:
      option.id === "none" ? t("settings.options.autoHide.none") : option.label,
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
  Object.entries(TRAFFIC_IMPACT_SEVERITY_MODEL.transferWeights).map(
    ([mode, weight]) => ({
      id: mode,
      label: t(trafficTransferLabelKeys[mode as keyof typeof trafficTransferLabelKeys]),
      weight,
    }),
  ),
);
const trafficImpactTopologyRows = computed(() =>
  Object.entries(TRAFFIC_IMPACT_SEVERITY_MODEL.topologyMultipliers).map(
    ([role, multiplier]) => ({
      id: role,
      label: t(trafficTopologyLabelKeys[role as keyof typeof trafficTopologyLabelKeys]),
      multiplier,
    }),
  ),
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
  temporalMultipliersByStationKey: new Map([
    ["example", trafficImpactEveningExample.multiplier],
  ]),
}).score;

function formatTrafficMinuteOfDay(value: number): string {
  const hour = Math.floor(value / 60) % 24;
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

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
const fullscreenStationPanelDesignLocalizedOptions = computed(() =>
  fullscreenStationPanelDesignOptions.map((option) => ({
    id: option.id,
    label:
      option.id === "all-directions"
        ? t("settings.options.fullscreenPanel.allDirections")
        : option.id === "double-stop"
          ? t("settings.options.fullscreenPanel.doubleStop")
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
    label:
      option.id === "0"
        ? t("settings.options.transferBundle.noDelay")
        : option.label,
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
    label:
      option.id === "1440"
        ? t("settings.options.weatherLookahead.allDay")
        : option.label,
  })),
);
const weatherLocationLocalizedOptions = computed(() =>
  weatherLocationOptions.map((option) => ({
    id: option.id,
    label:
      option.id === "custom"
        ? t("settings.options.weatherLocation.custom")
        : option.label,
  })),
);
const selectedDisplayPlace = computed(
  () =>
    getTransitPlaceById(presetState.value, selectedDisplayPlaceId.value) ??
    presetState.value.places[0],
);
const selectedDisplayPreferences = computed(
  () => selectedDisplayPlace.value?.preferences,
);
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
    patternRealisticMinGapCoefficient:
      parsePatternRealisticMinGapCoefficient(value),
  });
}

function updatePatternRealisticMaxGapCoefficient(value: string): void {
  updateSettings({
    patternRealisticMaxGapCoefficient:
      parsePatternRealisticMaxGapCoefficient(
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
  selectedDisplayPlaceId.value = resolveTransitPlaceId(
    presetState.value,
    value,
  );
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

function updateSelectedDisplayPreferences(
  patch: Partial<TransitBoardPreferences>,
): void {
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
      const nextState = renameTransitPlace(
        presetState.value,
        previousTargetId,
        name,
      );
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
    typeof window === "undefined"
      ? []
      : listTransferBundles(window.localStorage);
}

async function clearBundles(): Promise<void> {
  // Clear both cache layers. The backend request is allowed to fail because the
  // local cache cleanup should still happen in offline/serverless edge cases.
  const backendClear = clearTransferBundles().catch(() => undefined);

  if (typeof window !== "undefined") {
    clearTransferBundles(window.localStorage);
  }

  clearPatternTransferRuntimeCaches();
  showSettingsNotification(
    t("settings.bundles.cleared"),
  );
  await backendClear;
  await refreshBundleSummaries();
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

function formatTransferResolverMode(
  _value: TransferBundleSummary["transferResolverMode"],
): string {
  return "Nearby";
}

function formatTransferBundleDistance(
  value: TransferBundleSummary["nearbyDistanceMeters"],
): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value} m`
    : t("settings.bundles.autoDistance");
}

function formatPixels(value: number): string {
  return `${Math.round(value)} px`;
}

function formatCoefficient(value: number): string {
  return `${n(value, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })}x`;
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
  showSettingsNotification(t("settings.notifications.reset"));
}

function showSettingsNotification(
  message: string,
  tone: AppNotificationTone = "info",
): void {
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
});

onBeforeUnmount(() => {
  if (settingsNotificationTimer) {
    clearTimeout(settingsNotificationTimer);
  }
});
</script>

<template>
  <main class="settings-page">
    <header class="settings-page__hero">
      <p class="eyebrow">{{ t("settings.hero.eyebrow") }}</p>
      <h1>{{ t("settings.hero.title") }}</h1>
      <p>{{ t("settings.hero.body") }}</p>
    </header>

    <section class="settings-panel" aria-labelledby="settings-language-title">
      <div class="settings-panel__heading">
        <div>
          <p class="eyebrow">{{ t("settings.language.eyebrow") }}</p>
          <h2 id="settings-language-title">{{ t("settings.language.title") }}</h2>
        </div>
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.language.label") }}</strong>
          <span>{{ t("settings.language.description") }}</span>
        </div>
        <MaterialCombobox
          :model-value="settings.language"
          :options="languageOptions"
          :aria-label="t('settings.language.aria')"
          @update:model-value="updateLanguage"
        />
      </div>
    </section>

    <section class="settings-panel" aria-labelledby="settings-places-title">
      <div class="settings-panel__heading">
        <div>
          <p class="eyebrow">{{ t("settings.places.eyebrow") }}</p>
          <h2 id="settings-places-title">{{ t("settings.places.title") }}</h2>
        </div>
        <button class="button-secondary" type="button" @click="openPresetsModal">
          {{ t("settings.places.manage") }}
        </button>
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.places.defaultLabel") }}</strong>
          <span>
            {{ t("settings.places.defaultDescription") }}
          </span>
        </div>
        <MaterialCombobox
          :model-value="presetState.defaultPlaceId"
          :options="placeOptions"
          :aria-label="t('settings.places.defaultAria')"
          @update:model-value="updateDefaultPlace"
        />
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.places.navigationLabel") }}</strong>
          <span>{{ t("settings.places.navigationDescription") }}</span>
        </div>
        <MaterialCombobox
          :model-value="settings.placePresetNavigationMode"
          :options="placePresetNavigationModeLocalizedOptions"
          :aria-label="t('settings.places.navigationAria')"
          @update:model-value="updatePlacePresetNavigationMode"
        />
      </div>
    </section>

    <section class="settings-panel" aria-labelledby="settings-display-title">
      <div class="settings-panel__heading">
        <div>
          <p class="eyebrow">{{ t("settings.display.eyebrow") }}</p>
          <h2 id="settings-display-title">{{ t("settings.display.title") }}</h2>
        </div>
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.places.displayPlaceLabel") }}</strong>
          <span>{{ t("settings.places.displayPlaceDescription") }}</span>
        </div>
        <MaterialCombobox
          :model-value="selectedDisplayPlaceId"
          :options="placeOptions"
          :aria-label="t('settings.places.displayPlaceAria')"
          @update:model-value="updateSelectedDisplayPlace"
        />
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.display.stationButtons") }}</strong>
          <span>{{ t("settings.display.stationButtonsDescription") }}</span>
        </div>
        <MaterialCombobox
          :model-value="
            selectedDisplayPreferences?.boardTogglesPlacement ?? 'inline'
          "
          :options="boardTogglesPlacementLocalizedOptions"
          :aria-label="t('settings.display.stationButtonsAria')"
          @update:model-value="updateBoardTogglesPlacement"
        />
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.display.panelDesign") }}</strong>
          <span>{{ t("settings.display.panelDesignDescription") }}</span>
        </div>
        <MaterialCombobox
          :model-value="settings.fullscreenStationPanelDesign"
          :options="fullscreenStationPanelDesignLocalizedOptions"
          :aria-label="t('settings.display.panelDesignAria')"
          @update:model-value="updateFullscreenStationPanelDesign"
        />
      </div>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.fullscreenStationPanelDarkTheme"
          @change="
            updateSettings({
              fullscreenStationPanelDarkTheme: (
                $event.target as HTMLInputElement
              ).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>{{ t("settings.display.panelDarkTheme") }}</strong>
          <small>{{ t("settings.display.panelDarkThemeDescription") }}</small>
        </div>
      </label>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.display.closedAccordion") }}</strong>
          <span>{{ t("settings.display.closedAccordionDescription") }}</span>
        </div>
        <MaterialCombobox
          :model-value="
            selectedDisplayPreferences?.closedDirectionSummaryMode ?? 'next'
          "
          :options="closedDirectionSummaryLocalizedOptions"
          :aria-label="t('settings.display.closedAccordionAria')"
          @update:model-value="updateClosedSummaryMode"
        />
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.display.maxDepartures") }}</strong>
          <span>{{ t("settings.display.maxDeparturesDescription") }}</span>
        </div>
        <MaterialCombobox
          :model-value="
            String(
              selectedDisplayPreferences?.maxDeparturesPerDirection ??
                'default',
            )
          "
          :options="maxDeparturesLocalizedOptions"
          :aria-label="t('settings.display.maxDeparturesAria')"
          @update:model-value="updateMaxDepartures"
        />
      </div>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="selectedDisplayPreferences?.terminalDirectionsOnly ?? false"
          @change="
            updateSelectedDisplayPreferences({
              terminalDirectionsOnly: ($event.target as HTMLInputElement)
                .checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>{{ t("settings.display.terminalOnly") }}</strong>
          <small>
            {{ t("settings.display.terminalOnlyDescription") }}
          </small>
        </div>
      </label>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.ghostNetworkStructuralOnly"
          @change="
            updateSettings({
              ghostNetworkStructuralOnly: (
                $event.target as HTMLInputElement
              ).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>{{ t("settings.display.structuralGhostLines") }}</strong>
          <small>
            {{ t("settings.display.structuralGhostLinesDescription") }}
          </small>
        </div>
      </label>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.display.trafficDesign") }}</strong>
          <span>{{ t("settings.display.trafficDesignDescription") }}</span>
        </div>
        <MaterialCombobox
          :model-value="settings.trafficInfoDesign"
          :options="trafficInfoDesignLocalizedOptions"
          :aria-label="t('settings.display.trafficDesignAria')"
          @update:model-value="updateTrafficInfoDesign"
        />
      </div>
    </section>

    <section class="settings-panel" aria-labelledby="settings-traffic-title">
      <div class="settings-panel__heading">
        <div>
          <p class="eyebrow">{{ t("common.labels.traffic") }}</p>
          <h2 id="settings-traffic-title">{{ t("settings.display.trafficScope") }}</h2>
        </div>
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.display.trafficScope") }}</strong>
          <span>{{ t("settings.display.trafficScopeDescription") }}</span>
        </div>
        <MaterialCombobox
          :model-value="settings.trafficInfoDefaultScope"
          :options="trafficInfoDefaultScopeLocalizedOptions"
          :aria-label="t('settings.display.trafficScopeAria')"
          @update:model-value="updateTrafficInfoDefaultScope"
        />
      </div>
      <div class="settings-row">
        <div>
          <strong>{{ t("settings.display.trafficCalendarScope") }}</strong>
          <span>{{ t("settings.display.trafficCalendarScopeDescription") }}</span>
        </div>
        <MaterialCombobox
          :model-value="settings.trafficCalendarImpactScope"
          :options="trafficCalendarImpactScopeLocalizedOptions"
          :aria-label="t('settings.display.trafficCalendarScopeAria')"
          @update:model-value="updateTrafficCalendarImpactScope"
        />
      </div>

      <article
        class="traffic-impact-equation"
        aria-labelledby="traffic-impact-equation-title"
        data-testid="traffic-impact-equation"
      >
        <header>
          <p class="eyebrow">{{ t("settings.trafficCalendarEquation.eyebrow") }}</p>
          <h3 id="traffic-impact-equation-title">
            {{ t("settings.trafficCalendarEquation.title") }}
          </h3>
          <p>{{ t("settings.trafficCalendarEquation.description") }}</p>
        </header>

        <code>{{ t("settings.trafficCalendarEquation.formula") }}</code>

        <div class="traffic-impact-equation__tables">
          <section>
            <h4>{{ t("settings.trafficCalendarEquation.transferWeights") }}</h4>
            <table>
              <tbody>
                <tr v-for="row in trafficImpactTransferRows" :key="row.id">
                  <th scope="row">{{ row.label }}</th>
                  <td>+{{ n(row.weight) }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h4>{{ t("settings.trafficCalendarEquation.topology") }}</h4>
            <table>
              <tbody>
                <tr v-for="row in trafficImpactTopologyRows" :key="row.id">
                  <th scope="row">{{ row.label }}</th>
                  <td>? {{ n(row.multiplier) }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h4>{{ t("settings.trafficCalendarEquation.temporal") }}</h4>
            <table>
              <tbody>
                <tr>
                  <th scope="row">
                    {{ t("settings.trafficCalendarEquation.temporalCoverage") }}
                  </th>
                  <td>
                    {{ t("settings.trafficCalendarEquation.temporalCoverageValue", {
                      minutes: n(
                        TRAFFIC_IMPACT_SEVERITY_MODEL.temporal.minutesPerDay,
                      ),
                    }) }}
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    {{ t("settings.trafficCalendarEquation.offPeak") }}
                  </th>
                  <td>
                    {{
                      t("settings.trafficCalendarEquation.offPeakValue", {
                        start: formatTrafficMinuteOfDay(
                          TRAFFIC_IMPACT_SEVERITY_MODEL.temporal
                            .offPeakStartMinute,
                        ),
                        end: formatTrafficMinuteOfDay(
                          TRAFFIC_IMPACT_SEVERITY_MODEL.temporal
                            .offPeakEndMinute,
                        ),
                        coefficient: n(
                          TRAFFIC_IMPACT_SEVERITY_MODEL.temporal
                            .offPeakMultiplier,
                        ),
                      })
                    }}
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    {{ t("settings.trafficCalendarEquation.unspecifiedTime") }}
                  </th>
                  <td>
                    &times;
                    {{
                      n(
                        TRAFFIC_IMPACT_SEVERITY_MODEL.temporal
                          .unspecifiedMultiplier,
                      )
                    }}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h4>{{ t("settings.trafficCalendarEquation.thresholds") }}</h4>
            <table>
              <tbody>
                <tr>
                  <th scope="row">{{ t("pattern.trafficCalendarSeverity.low") }}</th>
                  <td>
                    &lt; {{ n(TRAFFIC_IMPACT_SEVERITY_MODEL.thresholds.medium) }}
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    {{ t("pattern.trafficCalendarSeverity.medium") }}
                  </th>
                  <td>
                    {{ n(TRAFFIC_IMPACT_SEVERITY_MODEL.thresholds.medium) }}
                    ? score &lt;
                    {{ n(TRAFFIC_IMPACT_SEVERITY_MODEL.thresholds.high) }}
                  </td>
                </tr>
                <tr>
                  <th scope="row">{{ t("pattern.trafficCalendarSeverity.high") }}</th>
                  <td>
                    ? {{ n(TRAFFIC_IMPACT_SEVERITY_MODEL.thresholds.high) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>

        <p class="traffic-impact-equation__topology-note">
          {{
            t("settings.trafficCalendarEquation.topologyDeduction", {
              ratio: n(
                TRAFFIC_IMPACT_SEVERITY_MODEL.smallBranchRatio * 100,
              ),
            })
          }}
        </p>
        <p class="traffic-impact-equation__example">
          {{
            t("settings.trafficCalendarEquation.example", {
              base: n(TRAFFIC_IMPACT_SEVERITY_MODEL.baseStationScore),
              transfer: n(
                TRAFFIC_IMPACT_SEVERITY_MODEL.transferWeights.RER,
              ),
              coefficient: n(
                TRAFFIC_IMPACT_SEVERITY_MODEL.topologyMultipliers[
                  "trunk-core"
                ],
              ),
              temporal: n(trafficImpactEveningExample.multiplier),
              start: formatTrafficMinuteOfDay(
                trafficImpactEveningExampleWindow.startMinute,
              ),
              end: formatTrafficMinuteOfDay(
                trafficImpactEveningExampleWindow.endMinute,
              ),
              score: n(trafficImpactExampleScore),
            })
          }}
        </p>
        <p class="traffic-impact-equation__note">
          {{ t("settings.trafficCalendarEquation.exclusions") }}
        </p>
      </article>


      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.smartTrafficDetection"
          @change="
            updateSettings({
              smartTrafficDetection: ($event.target as HTMLInputElement)
                .checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>{{ t("settings.display.smartTraffic") }}</strong>
          <small>{{ t("settings.display.smartTrafficDescription") }}</small>
        </div>
      </label>

      <div class="settings-row settings-row--range">
        <div>
          <strong>{{ t("settings.display.trafficWarningLookahead") }}</strong>
          <span>{{ t("settings.display.trafficWarningLookaheadDescription") }}</span>
        </div>
        <label class="settings-range">
          <span>{{ formatDays(settings.trafficWarningLookaheadDays) }}</span>
          <input
            :max="TRAFFIC_WARNING_LOOKAHEAD_DAYS_MAX"
            :min="TRAFFIC_WARNING_LOOKAHEAD_DAYS_MIN"
            :value="settings.trafficWarningLookaheadDays"
            :aria-label="t('settings.display.trafficWarningLookaheadAria')"
            step="1"
            type="range"
            @input="
              updateTrafficWarningLookaheadDays(
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </label>
      </div>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.transferBundleLocalCacheEnabled"
          @change="
            updateSettings({
              transferBundleLocalCacheEnabled: (
                $event.target as HTMLInputElement
              ).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>{{ t("settings.bundles.enableLocalCache") }}</strong>
          <small>{{ t("settings.display.transferLocalCacheDescription") }}</small>
        </div>
      </label>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.transferBundleBackendCacheEnabled"
          @change="
            updateSettings({
              transferBundleBackendCacheEnabled: (
                $event.target as HTMLInputElement
              ).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>{{ t("settings.bundles.enableBackendCache") }}</strong>
          <small>{{ t("settings.display.transferBackendCacheDescription") }}</small>
          <small
            v-if="!settings.transferBundleBackendCacheEnabled"
            class="settings-inline-warning"
            role="alert"
          >
            {{ t("settings.bundles.slowWarning") }}
          </small>
        </div>
      </label>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.bundles.expiration") }}</strong>
          <span>{{ t("settings.display.transferExpirationDescription") }}</span>
        </div>
        <MaterialCombobox
          :model-value="String(settings.transferBundleRetentionDays)"
          :options="transferBundleRetentionLocalizedOptions"
          :aria-label="t('settings.display.transferExpirationAria')"
          @update:model-value="updateTransferBundleRetention"
        />
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.bundles.loading") }}</strong>
          <span>{{ t("settings.display.transferLoadingDescription") }}</span>
        </div>
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.bundles.concurrency") }}</strong>
          <span>{{ t("settings.display.transferConcurrencyDescription") }}</span>
          <small
            v-if="settings.transferBundleRequestConcurrency > 1"
            class="settings-inline-warning"
          >
            {{ t("settings.display.transferConcurrencyWarning") }}
          </small>
        </div>
        <MaterialCombobox
          :model-value="String(settings.transferBundleRequestConcurrency)"
          :options="transferBundleRequestConcurrencyLocalizedOptions"
          :aria-label="t('settings.display.transferConcurrencyAria')"
          @update:model-value="updateTransferBundleRequestConcurrency"
        />
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.bundles.spacing") }}</strong>
          <span>{{ t("settings.display.transferSpacingDescription") }}</span>
          <small
            v-if="settings.transferBundleRequestSpacingMs > 0"
            class="settings-inline-warning"
          >
            {{ t("settings.display.transferSpacingWarning") }}
          </small>
        </div>
        <MaterialCombobox
          :model-value="String(settings.transferBundleRequestSpacingMs)"
          :options="transferBundleRequestSpacingLocalizedOptions"
          :aria-label="t('settings.display.transferSpacingAria')"
          @update:model-value="updateTransferBundleRequestSpacing"
        />
      </div>

      <div class="settings-bundle-actions">
        <div>
          <strong>{{ t("settings.bundles.title") }}</strong>
          <span>{{ t("settings.display.transferCacheDescription") }}</span>
        </div>
        <div class="settings-bundle-actions__buttons">
          <button
            class="button-secondary"
            type="button"
            @click="openBundlesModal"
          >
            {{ t("settings.bundles.view") }}
          </button>
          <button class="button-secondary" type="button" @click="clearBundles">
            {{ t("settings.bundles.clear") }}
          </button>
        </div>
      </div>
    </section>

    <section class="settings-panel" aria-labelledby="settings-weather-title">
      <div class="settings-panel__heading">
        <div>
          <p class="eyebrow">{{ t("weather.title") }}</p>
          <h2 id="settings-weather-title">{{ t("settings.display.weather") }}</h2>
        </div>
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.display.weather") }}</strong>
          <span>{{ t("settings.display.weatherDescription") }}</span>
        </div>
        <MaterialCombobox
          :model-value="settings.weatherMode"
          :options="weatherModeLocalizedOptions"
          :aria-label="t('settings.display.weatherModeAria')"
          @update:model-value="updateWeatherMode"
        />
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.display.weatherTestMode") }}</strong>
          <span>{{ t("settings.display.weatherTestDescription") }}</span>
        </div>
        <MaterialCombobox
          :model-value="settings.weatherTestMode"
          :options="weatherTestModeLocalizedOptions"
          :aria-label="t('settings.display.weatherTestAria')"
          @update:model-value="updateWeatherTestMode"
        />
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.display.weatherLookahead") }}</strong>
          <span>{{ t("settings.display.weatherLookaheadDescription") }}</span>
        </div>
        <MaterialCombobox
          :model-value="String(settings.weatherLookaheadMinutes)"
          :options="weatherLookaheadLocalizedOptions"
          :aria-label="t('settings.display.weatherLookaheadAria')"
          @update:model-value="updateWeatherLookahead"
        />
      </div>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.weatherShowApparentTemperature"
          @change="
            updateSettings({
              weatherShowApparentTemperature: (
                $event.target as HTMLInputElement
              ).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>{{ t("settings.display.weatherApparent") }}</strong>
          <small>{{ t("settings.display.weatherApparentDescription") }}</small>
        </div>
      </label>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.display.weatherLocation") }}</strong>
          <span>{{ t("settings.display.weatherLocationDescription") }}</span>
        </div>
        <MaterialCombobox
          :model-value="settings.weatherLocationPreset"
          :options="weatherLocationLocalizedOptions"
          :aria-label="t('settings.display.weatherLocationAria')"
          @update:model-value="updateWeatherLocationPreset"
        />
      </div>

      <div
        v-if="settings.weatherLocationPreset === 'custom'"
        class="settings-custom-location"
      >
        <label>
          <span>{{ t("settings.display.weatherCustomName") }}</span>
          <input
            class="settings-input"
            :value="settings.weatherCustomLocation.label"
            type="text"
            @input="
              updateWeatherCustomLocation(
                'label',
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </label>
        <label>
          <span>{{ t("settings.display.weatherCustomLatitude") }}</span>
          <input
            class="settings-input"
            :value="settings.weatherCustomLocation.latitude"
            inputmode="decimal"
            type="number"
            step="0.0001"
            @input="
              updateWeatherCustomLocation(
                'latitude',
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </label>
        <label>
          <span>{{ t("settings.display.weatherCustomLongitude") }}</span>
          <input
            class="settings-input"
            :value="settings.weatherCustomLocation.longitude"
            inputmode="decimal"
            type="number"
            step="0.0001"
            @input="
              updateWeatherCustomLocation(
                'longitude',
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </label>
      </div>
    </section>

    <section class="settings-panel" aria-labelledby="settings-map-title">
      <div class="settings-panel__heading">
        <div>
          <p class="eyebrow">{{ t("settings.display.mapEyebrow") }}</p>
          <h2 id="settings-map-title">{{ t("settings.display.mapTitle") }}</h2>
        </div>
      </div>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.showPatternMiniMap"
          @change="
            updateSettings({
              showPatternMiniMap: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>{{ t("settings.display.showMiniMap") }}</strong>
          <small>{{ t("settings.display.showMiniMapDescription") }}</small>
        </div>
      </label>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.showPatternCityZones"
          @change="
            updateSettings({
              showPatternCityZones: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>{{ t("settings.display.showCityZones") }}</strong>
          <small>{{ t("settings.display.showCityZonesDescription") }}</small>
        </div>
      </label>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.display.compactMode") }}</strong>
          <span>{{ t("settings.display.compactModeDescription") }}</span>
        </div>
        <MaterialCombobox
          :model-value="settings.compactLinePlanMode"
          :options="compactLinePlanLocalizedOptions"
          :aria-label="t('settings.display.compactModeAria')"
          @update:model-value="updateCompactMode"
        />
      </div>

      <div class="settings-row settings-row--range">
        <div>
          <strong>{{ t("settings.display.compactVerticalSpacing") }}</strong>
          <span>{{ t("settings.display.compactVerticalSpacingDescription") }}</span>
        </div>
        <label class="settings-range">
          <span>{{ formatPixels(settings.patternCompactBranchGap) }}</span>
          <input
            :max="PATTERN_COMPACT_BRANCH_GAP_MAX"
            :min="PATTERN_COMPACT_BRANCH_GAP_MIN"
            :value="settings.patternCompactBranchGap"
            :aria-label="t('settings.display.compactVerticalSpacingAria')"
            step="4"
            type="range"
            @input="
              updatePatternCompactBranchGap(
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </label>
      </div>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.patternRoundedCurves"
          @change="
            updateSettings({
              patternRoundedCurves: ($event.target as HTMLInputElement)
                .checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>{{ t("settings.display.roundedCurves") }}</strong>
          <small>{{ t("settings.display.roundedCurvesDescription") }}</small>
        </div>
      </label>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.showInterruptionWalkingTimes"
          @change="
            updateSettings({
              showInterruptionWalkingTimes: ($event.target as HTMLInputElement)
                .checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>{{ t("settings.display.interruptionWalkingTimes") }}</strong>
          <small>{{ t("settings.display.interruptionWalkingTimesDescription") }}</small>
        </div>
      </label>

      <div class="settings-row settings-row--range">
        <div>
          <strong>{{ t("settings.display.compactForkGap") }}</strong>
          <span>{{ t("settings.display.compactForkGapDescription") }}</span>
        </div>
        <label class="settings-range">
          <span>{{ formatPixels(settings.patternCompactForkGap) }}</span>
          <input
            :max="PATTERN_COMPACT_FORK_GAP_MAX"
            :min="PATTERN_COMPACT_FORK_GAP_MIN"
            :value="settings.patternCompactForkGap"
            :aria-label="t('settings.display.compactForkGapAria')"
            step="2"
            type="range"
            @input="
              updatePatternCompactForkGap(
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </label>
      </div>

      <div class="settings-range-pair">
        <div>
          <strong>{{ t("settings.display.realisticSpacing") }}</strong>
          <span>{{ t("settings.display.realisticSpacingDescription") }}</span>
        </div>
        <div class="settings-range-pair__controls">
          <label class="settings-range">
            <small>{{ t("settings.display.minCoefficient") }}</small>
            <span>
              {{
                formatCoefficient(settings.patternRealisticMinGapCoefficient)
              }}
            </span>
            <input
              :max="PATTERN_REALISTIC_MIN_GAP_COEFFICIENT_MAX"
              :min="PATTERN_REALISTIC_MIN_GAP_COEFFICIENT_MIN"
              :value="settings.patternRealisticMinGapCoefficient"
              :aria-label="t('settings.display.minCoefficientAria')"
              step="0.05"
              type="range"
              @input="
                updatePatternRealisticMinGapCoefficient(
                  ($event.target as HTMLInputElement).value,
                )
              "
            />
          </label>
          <label class="settings-range">
            <small>{{ t("settings.display.maxCoefficient") }}</small>
            <span>
              {{
                formatCoefficient(settings.patternRealisticMaxGapCoefficient)
              }}
            </span>
            <input
              :max="PATTERN_REALISTIC_MAX_GAP_COEFFICIENT_MAX"
              :min="PATTERN_REALISTIC_MAX_GAP_COEFFICIENT_MIN"
              :value="settings.patternRealisticMaxGapCoefficient"
              :aria-label="t('settings.display.maxCoefficientAria')"
              step="0.25"
              type="range"
              @input="
                updatePatternRealisticMaxGapCoefficient(
                  ($event.target as HTMLInputElement).value,
                )
              "
            />
          </label>
        </div>
      </div>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.richTransferTooltips"
          @change="
            updateSettings({
              richTransferTooltips: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>{{ t("settings.display.richTransferTooltips") }}</strong>
          <small>{{ t("settings.display.richTransferTooltipsDescription") }}</small>
        </div>
      </label>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.reduceMotion"
          @change="
            updateSettings({
              reduceMotion: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>{{ t("settings.display.reduceMotion") }}</strong>
          <small>{{ t("settings.display.reduceMotionDescription") }}</small>
        </div>
      </label>

    </section>

    <PluginViewer
      @notify="showSettingsNotification($event.message, $event.tone)"
    />

    <MobileReleaseCard />

    <section class="settings-panel" aria-labelledby="settings-device-title">
      <div class="settings-panel__heading">
        <div>
          <p class="eyebrow">{{ t("settings.device.eyebrow") }}</p>
          <h2 id="settings-device-title">{{ t("settings.device.title") }}</h2>
        </div>
      </div>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.device.wakeLock") }}</strong>
          <span>{{ t("settings.device.wakeLockDescription") }}</span>
        </div>
        <MaterialCombobox
          :model-value="settings.wakeLockDuration"
          :options="wakeLockLocalizedOptions"
          :aria-label="t('settings.device.wakeLockAria')"
          @update:model-value="updateWakeLock"
        />
      </div>

      <label class="settings-toggle">
        <input
          type="checkbox"
          :checked="settings.wakeDeviceOnAlarm"
          @change="
            updateSettings({
              wakeDeviceOnAlarm: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span></span>
        <div>
          <strong>{{ t("settings.device.wakeDeviceOnAlarm") }}</strong>
          <small>{{ t("settings.device.wakeDeviceOnAlarmDescription") }}</small>
        </div>
      </label>

      <div class="settings-row">
        <div>
          <strong>{{ t("settings.device.navigationAutoHide") }}</strong>
          <span>{{ t("settings.device.navigationAutoHideDescription") }}</span>
        </div>
        <MaterialCombobox
          :model-value="settings.navigationAutoHide"
          :options="navigationAutoHideLocalizedOptions"
          :aria-label="t('settings.device.navigationAutoHideAria')"
          @update:model-value="updateAutoHide"
        />
      </div>
    </section>

    <footer class="settings-page__footer">
      <button
        class="button-secondary"
        type="button"
        @click="resetSettingsWithNotification"
      >
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
        <article
          v-for="place in presetState.places"
          :key="place.id"
          class="settings-preset-item"
        >
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
        <button
          class="button-secondary"
          type="button"
          @click="openCreatePlaceModal"
        >
          <Plus :size="18" aria-hidden="true" />
          {{ t("settings.places.addPlace") }}
        </button>
        <button
          class="button-secondary"
          type="button"
          @click="presetsModalOpen = false"
        >
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

    <AppNotification
      :message="settingsNotification.message"
      :tone="settingsNotification.tone"
    />

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

          <section
            v-if="bundleSummaries.length"
            class="settings-bundle-section"
          >
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
                    {{
                      formatTransferResolverMode(bundle.transferResolverMode)
                    }}
                    -
                    {{
                      formatTransferBundleDistance(bundle.nearbyDistanceMeters)
                    }}
                  </span>
                  <small>
                    {{
                      t("settings.bundles.expiresAt", {
                        date: formatBundleDate(bundle.expiresAt),
                      })
                    }}
                  </small>
                </div>
                <button
                  class="button-secondary"
                  type="button"
                  @click="deleteBundle(bundle.id)"
                >
                  {{ t("common.actions.delete") }}
                </button>
              </article>
            </div>
          </section>

          <section
            v-if="localBundleSummaries.length"
            class="settings-bundle-section"
          >
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
                    {{
                      formatTransferResolverMode(bundle.transferResolverMode)
                    }}
                    -
                    {{
                      formatTransferBundleDistance(bundle.nearbyDistanceMeters)
                    }}
                  </span>
                  <small>
                    {{
                      t("settings.bundles.expiresAt", {
                        date: formatBundleDate(bundle.expiresAt),
                      })
                    }}
                  </small>
                </div>
                <button
                  class="button-secondary"
                  type="button"
                  @click="deleteBundle(bundle.id)"
                >
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

<style scoped>
.settings-page {
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

.settings-panel {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(16, 35, 63, 0.1);
  border-radius: 8px;
  box-shadow: 0 16px 40px rgba(16, 35, 63, 0.08);
  display: grid;
  gap: 18px;
  margin-top: 18px;
  padding: 22px;
}

.settings-panel__heading {
  align-items: center;
  border-bottom: 1px solid rgba(16, 35, 63, 0.1);
  display: flex;
  justify-content: space-between;
  padding-bottom: 16px;
}

.settings-panel h2 {
  font-size: 1.55rem;
  line-height: 1.1;
  margin: 0;
}

.settings-row {
  align-items: center;
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
}

.settings-row strong,
.settings-toggle strong {
  display: block;
  font-size: 1.02rem;
  font-weight: 950;
}

.settings-row span,
.settings-toggle small {
  color: var(--muted);
  display: block;
  font-weight: 720;
  line-height: 1.45;
  margin-top: 4px;
}

.settings-row--range {
  align-items: start;
}

.settings-range,
.settings-range-pair {
  background: #f7f9fe;
  border: 1px solid rgba(16, 35, 63, 0.08);
  border-radius: 8px;
  display: grid;
  gap: 10px;
  padding: 14px;
}

.settings-range {
  min-width: 0;
}

.settings-range span {
  color: var(--ink);
  display: block;
  font-size: 1rem;
  font-weight: 950;
  line-height: 1.1;
  margin: 0;
}

.settings-range small {
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 950;
  line-height: 1.2;
  text-transform: uppercase;
}

.settings-range input[type="range"] {
  accent-color: var(--idfm-blue);
  width: 100%;
}

.settings-range-pair {
  align-items: start;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 440px);
}

.settings-range-pair > div:first-child strong {
  display: block;
  font-size: 1.02rem;
  font-weight: 950;
}

.settings-range-pair > div:first-child span {
  color: var(--muted);
  display: block;
  font-weight: 720;
  line-height: 1.45;
  margin-top: 4px;
}

.settings-range-pair__controls {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.settings-toggle .settings-inline-warning {
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

.settings-bundle-actions {
  align-items: center;
  background: #f7f9fe;
  border: 1px solid rgba(16, 35, 63, 0.08);
  border-radius: 8px;
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 16px;
}

.settings-bundle-actions strong {
  display: block;
  font-size: 1.02rem;
  font-weight: 950;
}

.settings-bundle-actions span {
  color: var(--muted);
  display: block;
  font-weight: 720;
  line-height: 1.45;
  margin-top: 4px;
}

.settings-bundle-actions__buttons {
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

.settings-custom-location {
  display: grid;
  gap: 14px;
  grid-template-columns: 1.4fr 1fr 1fr;
}

.settings-custom-location label {
  display: grid;
  gap: 7px;
}

.settings-custom-location label > span {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 950;
  text-transform: uppercase;
}

.settings-input {
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

.settings-input:focus {
  border-color: var(--idfm-blue);
  box-shadow: 0 0 0 3px rgba(0, 100, 255, 0.12);
  outline: none;
}

.settings-toggle {
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

.settings-toggle input {
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}

.settings-toggle > span {
  background: #dbe4f2;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(16, 35, 63, 0.08);
  display: block;
  height: 34px;
  position: relative;
  transition: background 160ms ease;
  width: 58px;
}

.settings-toggle > span::after {
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

.settings-toggle input:checked + span {
  background: var(--idfm-blue);
}

.settings-toggle input:checked + span::after {
  transform: translateX(24px);
}

.settings-page__footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 22px;
}

.eyebrow {
  color: #5136ff;
  font-size: 0.8rem;
  font-weight: 950;
  letter-spacing: 0.04em;
  margin: 0 0 7px;
  text-transform: uppercase;
}

.traffic-impact-equation {
  background:
    linear-gradient(135deg, rgba(245, 243, 255, 0.92), rgba(255, 247, 251, 0.92));
  border: 1px solid rgba(109, 40, 217, 0.14);
  border-radius: 16px;
  display: grid;
  gap: 14px;
  padding: 18px;
}

.traffic-impact-equation header {
  display: grid;
  gap: 5px;
}

.traffic-impact-equation h3,
.traffic-impact-equation h4,
.traffic-impact-equation p {
  margin: 0;
}

.traffic-impact-equation h3 {
  font-size: 1.02rem;
}

.traffic-impact-equation header > p:last-child,
.traffic-impact-equation__topology-note,
.traffic-impact-equation__note {
  color: #69657d;
  font-size: 0.78rem;
  line-height: 1.45;
}

.traffic-impact-equation > code {
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

.traffic-impact-equation__tables {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}

.traffic-impact-equation__tables section {
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(16, 35, 63, 0.08);
  border-radius: 11px;
  min-width: 0;
  padding: 11px;
}

.traffic-impact-equation h4 {
  font-size: 0.77rem;
  margin-bottom: 7px;
}

.traffic-impact-equation table {
  border-collapse: collapse;
  font-size: 0.72rem;
  width: 100%;
}

.traffic-impact-equation th,
.traffic-impact-equation td {
  border-top: 1px solid rgba(16, 35, 63, 0.07);
  padding: 5px 0;
  text-align: left;
}

.traffic-impact-equation th {
  font-weight: 700;
}

.traffic-impact-equation td {
  font-variant-numeric: tabular-nums;
  font-weight: 900;
  text-align: right;
  white-space: nowrap;
}

.traffic-impact-equation__example {
  background: #ffffff;
  border-left: 3px solid #7c3aed;
  border-radius: 5px 10px 10px 5px;
  font-size: 0.78rem;
  font-weight: 750;
  line-height: 1.45;
  padding: 10px 12px;
}

@media (max-width: 760px) {
  .settings-row,
  .settings-range-pair,
  .settings-custom-location {
    grid-template-columns: 1fr;
  }

  .settings-range-pair__controls {
    grid-template-columns: 1fr;
  }
  .traffic-impact-equation__tables {
    grid-template-columns: 1fr;
  }
}
</style>
