<script setup lang="ts">
import {
  computed,
  type ComponentPublicInstance,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import Draggable from "vuedraggable";
import BoardVisibilityControls from "./components/BoardVisibilityControls.vue";
import ContextMenu from "./components/ContextMenu.vue";
import EmptyStationsState from "./components/EmptyStationsState.vue";
import UserFriendlyTrafficModal from "./components/UserFriendlyTrafficModal.vue";
import FullscreenStationPanel from "./components/FullscreenStationPanel.vue";
import LineIconBadge from "./components/LineIconBadge.vue";
import PlaceNameModal from "./components/PlaceNameModal.vue";
import PlaceSwitcher from "./components/PlaceSwitcher.vue";
import TransitBoard from "./components/TransitBoard.vue";
import { usePlaceSwipeNavigation } from "./composables/usePlaceSwipeNavigation";
import { transitBoards } from "./config/transitBoards";
import {
  filterTerminalOnly,
  fullscreenStationPanelDesignOptions,
  requestTemporaryAlarmWakeLock,
  useAppSettings,
  type FullscreenStationPanelDesign,
} from "./features/app-settings";
import { WeatherExperience } from "./features/weather";
import {
  getBoardTrafficAlertForReport,
  normalizeTrafficLineRef,
  type BoardTrafficAlert,
} from "./features/traffic";
import { transitModeToFamily } from "./services/linePresentation";
import {
  fetchBoardDepartures,
  fetchDirectionGroupsForStation,
} from "./services/idfm";
import { toServerApiUrl } from "./services/serverApi";
import {
  cancelDepartureAlarm,
  getDepartureAlarmCapability,
  initializeDepartureAlarmRuntime,
  isNativeDepartureAlarmPlatform,
  removeDepartureAlarmNotification,
  requestDepartureAlarmPermissions,
  scheduleDepartureAlarm,
  stopDepartureAlarmSound,
  synchronizeDepartureAlarms,
  type DepartureAlarmNotificationCopy,
} from "./services/departureAlarmRuntime";
import {
  TRANSIT_PREFERENCES_CHANGED_EVENT,
  TRANSIT_PREFERENCES_STORAGE_KEY,
  DEFAULT_TRANSIT_PLACE_ID,
  WORK_TRANSIT_PLACE_ID,
  cloneTransitBoardPreferences,
  createDefaultTransitPresetState,
  createDefaultPreferences,
  createTransitPlace,
  getTransitPlaceById,
  loadTransitPresetState,
  migrateCustomBoardDirectionGroups,
  resolveTransitPlaceId,
  saveTransitPresetState,
  updateTransitPlacePreferences,
  type TransitPlacePreset,
  type TransitPresetState,
} from "./storage/transitPreferences";
import {
  createDepartureAlarm,
  loadDepartureAlarms,
  markAlarmNotified,
  findActiveAlarmForDeparture,
  findDepartureAlarmById,
  reconcileBoardAlarms,
  removeAlarmsForBoard,
  saveDepartureAlarms,
  removeDepartureAlarmById,
} from "./storage/transitAlarms";
import type {
  AlarmDraft,
  BoardDeparturesResult,
  Departure,
  DepartureAlarm,
  DepartureCallingPattern,
  DepartureServiceType,
  DirectionDepartureGroup,
  LineSearchOption,
  LinePatternViewResponse,
  StationSearchOption,
  TransitBoardPreferences,
  TransitBoardConfig,
} from "./types/transit";
import type {
  TrafficLineReport,
  TrafficAlertModalData,
  TrafficResponse,
} from "./features/traffic/types";
import {
  BellRing,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  LayoutGrid,
  List,
  MoreVertical,
  Plus,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-vue-next";
import { useRoute, useRouter } from "nuxt/app";
import { useI18n } from "./i18n";

const DepartureAlarmModal = defineAsyncComponent(
  () => import("./components/DepartureAlarmModal.vue"),
);
const DeparturePatternModal = defineAsyncComponent(
  () => import("./features/service-pattern/DeparturePatternModal.vue"),
);
const StationBoardModal = defineAsyncComponent(
  () => import("./components/StationBoardModal.vue"),
);
const WeatherForecastModal = defineAsyncComponent(
  () => import("./features/weather/WeatherForecastModal.vue"),
);

interface FullscreenPanelDeparture {
  id: string;
  waitLabel: string;
  destination?: string;
  meta?: string;
  statusLabel?: string;
}

interface FullscreenPanelDirection {
  id: string;
  label: string;
  subtitle?: string;
  serviceEnded?: boolean;
  departures: FullscreenPanelDeparture[];
}

interface BoardState {
  departures: Departure[];
  directionGroups: DirectionDepartureGroup[];
  loading: boolean;
  error?: string;
  updatedAt?: Date;
}

interface NetexCacheStatus {
  available: boolean;
  source?: {
    kind: "remote" | "directory" | "auto";
    location: string;
  };
  generatedAt?: string;
  lineCount?: number;
  warning?: string;
  message?: string;
}

const REFRESH_INTERVAL_MS = 30_000;
const MOBILE_BREAKPOINT_QUERY = "(max-width: 760px)";
const DESKTOP_DRAG_BREAKPOINT_QUERY =
  "(min-width: 761px) and (hover: hover) and (pointer: fine)";
const NEW_BOARD_SCROLL_FALLBACK_MS = 420;
const NEW_BOARD_HIGHLIGHT_MS = 500;
const NEW_BOARD_BOTTOM_INSET_PX = 104;
const route = useRoute();
const router = useRouter();
const presetState = reactive<TransitPresetState>(
  createDefaultTransitPresetState(transitBoards),
);
const preferences = reactive(createDefaultPreferences(transitBoards));
const { settings, updateSettings } = useAppSettings();
const { d, t } = useI18n();
const states = reactive<Record<string, BoardState>>({});
const refreshing = ref(false);
const lastRefresh = ref<Date>();
const activePlaceId = ref(DEFAULT_TRANSIT_PLACE_ID);
const stationModalOpen = ref(false);
const placeNameModalOpen = ref(false);
const placeNameError = ref("");
const topbarMenuOpen = ref(false);
const topbarMenuTrigger = ref<HTMLElement>();
const weatherModalOpen = ref(false);
const boardDisplayModalOpen = ref(false);
const fullscreenPanelBoard = ref<TransitBoardConfig>();
const fullscreenPanelPanamDirectionId = ref<string>();
const fullscreenPanelRouteDesignOverride = ref<FullscreenStationPanelDesign>();
const fullscreenPanelEnteredNativeFullscreen = ref(false);
const homeTrafficModalTarget = ref<{
  board: TransitBoardConfig;
  alert: BoardTrafficAlert;
}>();
const homeTrafficModalOpen = ref(false);
const alarmTarget = ref<{
  board: TransitBoardConfig;
  directionGroup: DirectionDepartureGroup;
  departure: Departure;
  activeAlarm?: DepartureAlarm;
}>();
const alarmToast = ref<DepartureAlarm>();
const departureAlarms = ref<DepartureAlarm[]>([]);
const nativeAlarmPlatform = isNativeDepartureAlarmPlatform();
const alarmNativePermissionState = ref<"ready" | "required" | "checking">(
  nativeAlarmPlatform ? "checking" : "ready",
);
const alarmModalBusy = ref(false);
const alarmModalError = ref("");
const patternTarget = ref<{
  board: TransitBoardConfig;
  directionGroup: DirectionDepartureGroup;
  departure: Departure;
}>();
const patternData = ref<DepartureCallingPattern>();
const patternLoading = ref(false);
const patternError = ref("");
const pageVisible = ref(true);
const nowTick = ref(Date.now());
const netexCacheStatus = ref<NetexCacheStatus>();
const netexCacheStatusLoaded = ref(false);
const trafficReports = ref<TrafficLineReport[]>([]);
const mobileBoardTogglesInContextMenu = ref(false);
const desktopDragEnabled = ref(false);
const draggingBoards = ref(false);
const draggableBoards = ref<TransitBoardConfig[]>([]);
const highlightedBoardId = ref<string>();
const primApiKeyConfigured = __IDFM_API_KEY_CONFIGURED__;
let refreshTimer: number | undefined;
const boardCardElements = new Map<string, HTMLElement>();
let toastTimer: number | undefined;
let clockTimer: number | undefined;
let boardRevealTimer: number | undefined;
let boardHighlightTimer: number | undefined;
let alarmTriggerElement: HTMLElement | undefined;
let disposeAlarmRuntime: (() => Promise<void>) | undefined;
let alarmSyncRequest = 0;
let boardRevealCleanup: (() => void) | undefined;
let boardRevealRequest = 0;
let mobileBreakpointQuery: MediaQueryList | undefined;
let desktopDragBreakpointQuery: MediaQueryList | undefined;
const departureServiceTypeCache = new Map<
  string,
  Promise<DepartureServiceType | undefined>
>();
const isFullscreenPanelOpen = computed(() => Boolean(fullscreenPanelBoard.value));
const fullscreenPanelDesign = computed<FullscreenStationPanelDesign>(
  () =>
    fullscreenPanelRouteDesignOverride.value ??
    settings.value.fullscreenStationPanelDesign,
);

const placeOptions = computed(() =>
  presetState.places.map((place) => ({
    id: place.id,
    kind: place.kind,
    label: getPlaceLabel(place),
  })),
);
const activePlace = computed<TransitPlacePreset | undefined>(() =>
  getTransitPlaceById(presetState, activePlaceId.value),
);
const activePlaceLabel = computed(() => getPlaceLabel(activePlace.value));
const placeDropdownEnabled = computed(
  () => settings.value.placePresetNavigationMode !== "swipe",
);
const placeSwipeEnabled = computed(
  () => settings.value.placePresetNavigationMode !== "dropdown",
);
const placeSwipe = usePlaceSwipeNavigation({
  places: placeOptions,
  activePlaceId,
  enabled: placeSwipeEnabled,
  reduceMotion: computed(() => settings.value.reduceMotion),
  selectPlace: selectTransitPlace,
});

function getPlaceLabel(place?: TransitPlacePreset): string {
  if (place?.id === WORK_TRANSIT_PLACE_ID) {
    return t("places.work");
  }

  if (place?.id === DEFAULT_TRANSIT_PLACE_ID) {
    return t("places.home");
  }

  return place?.label ?? t("places.home");
}

const allBoards = computed<TransitBoardConfig[]>(() => [
  ...transitBoards,
  ...preferences.customBoards,
]);

const orderedBoards = computed<TransitBoardConfig[]>(() => {
  const orderById = new Map(
    preferences.boardOrderIds.map((boardId, index) => [boardId, index]),
  );

  return [...allBoards.value].sort((left, right) => {
    const leftIndex = orderById.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = orderById.get(right.id) ?? Number.MAX_SAFE_INTEGER;

    return leftIndex - rightIndex;
  });
});
const stationModalMode = computed<"dropdown" | "multistep">(() =>
  mobileBoardTogglesInContextMenu.value ? "multistep" : "dropdown",
);

function syncActivePreferencesFromState(): void {
  const resolvedPlaceId = resolveTransitPlaceId(
    presetState,
    activePlaceId.value,
  );
  const place = getTransitPlaceById(presetState, resolvedPlaceId);

  if (!place) {
    return;
  }

  activePlaceId.value = resolvedPlaceId;
  Object.assign(preferences, cloneTransitBoardPreferences(place.preferences));
  allBoards.value.forEach((board) => ensureBoardState(board.id));
}

function saveActiveTransitPreferences(): void {
  const nextState = updateTransitPlacePreferences(
    presetState,
    activePlaceId.value,
    preferences,
  );

  Object.assign(presetState, nextState);
  saveTransitPresetState(nextState);
}

function getRoutePlaceId(): string | undefined {
  return getFirstRouteQueryValue(route.query.place);
}

function getFirstRouteQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.find((item): item is string => typeof item === "string");
  }

  return typeof value === "string" ? value : undefined;
}

function getRouteQueryParam(name: string): string | undefined {
  return getFirstRouteQueryValue(route.query[name]);
}

function getRouteFullscreenStationRequest(): string | undefined {
  return getRouteQueryParam("fullscreen");
}

function getRouteFullscreenPanelDesign():
  | FullscreenStationPanelDesign
  | undefined {
  const value =
    getRouteQueryParam("fullscreenDisplay") ??
    getRouteQueryParam("fullscreenDesign") ??
    getRouteQueryParam("display");

  return isFullscreenStationPanelDesign(value) ? value : undefined;
}

function isFullscreenStationPanelDesign(
  value: unknown,
): value is FullscreenStationPanelDesign {
  return fullscreenStationPanelDesignOptions.some(
    (option) => option.id === value,
  );
}

function normalizeFullscreenStationToken(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function getFullscreenBoardMatchTokens(board: TransitBoardConfig): string[] {
  return [
    board.id,
    board.title,
    `${board.title} ${board.line.shortName}`,
    `${board.line.shortName} ${board.title}`,
    board.schedule?.stopAreaRef,
    board.schedule?.lineRef,
    ...board.monitoringPoints.map((point) => point.ref),
    ...board.monitoringPoints.map((point) => point.label),
  ]
    .map(normalizeFullscreenStationToken)
    .filter(Boolean);
}

function getFullscreenBoardCandidates(): TransitBoardConfig[] {
  const candidates = new Map<string, TransitBoardConfig>();

  for (const board of visibleBoards.value) {
    candidates.set(board.id, board);
  }

  for (const board of orderedBoards.value) {
    candidates.set(board.id, board);
  }

  return Array.from(candidates.values());
}

function resolveFullscreenPanelBoard(
  stationRequest: string | undefined,
): TransitBoardConfig | undefined {
  const requestedToken = normalizeFullscreenStationToken(stationRequest);

  if (!requestedToken) {
    return undefined;
  }

  return getFullscreenBoardCandidates().find((board) =>
    getFullscreenBoardMatchTokens(board).includes(requestedToken),
  );
}

function replaceRouteFullscreenPanel(
  board: TransitBoardConfig,
  design: FullscreenStationPanelDesign = fullscreenPanelDesign.value,
): void {
  void router.replace({
    path: route.path,
    query: {
      ...route.query,
      fullscreen: board.id,
      fullscreenDisplay: design,
    },
  });
}

function removeRouteFullscreenPanel(): void {
  const {
    fullscreen: _fullscreen,
    fullscreenDisplay: _fullscreenDisplay,
    fullscreenDesign: _fullscreenDesign,
    display: _display,
    ...query
  } = route.query;

  void router.replace({
    path: route.path,
    query,
  });
}

function syncFullscreenPanelFromRoute(options?: {
  requestNativeFullscreen?: boolean;
  refresh?: boolean;
}): void {
  const stationRequest = getRouteFullscreenStationRequest();
  const routeDesign = getRouteFullscreenPanelDesign();

  fullscreenPanelRouteDesignOverride.value = stationRequest
    ? routeDesign
    : undefined;

  if (!stationRequest) {
    if (fullscreenPanelBoard.value) {
      void closeFullscreenPanel({ syncRoute: false });
    }

    return;
  }

  const board = resolveFullscreenPanelBoard(stationRequest);

  if (!board) {
    if (fullscreenPanelBoard.value) {
      void closeFullscreenPanel({ syncRoute: false });
    }

    return;
  }

  if (fullscreenPanelBoard.value?.id === board.id) {
    if (options?.refresh) {
      void refreshBoard(board.id);
    }

    return;
  }

  void openFullscreenPanel(board, {
    refresh: options?.refresh,
    requestNativeFullscreen: options?.requestNativeFullscreen ?? false,
    syncRoute: false,
  });
}

function replaceRoutePlace(placeId: string): void {
  void router.replace({
    path: route.path,
    query: {
      ...route.query,
      place: placeId,
    },
  });
}

function syncActivePlaceFromRoute(options?: { refresh: boolean }): void {
  const requestedPlaceId = getRoutePlaceId();
  const resolvedPlaceId = resolveTransitPlaceId(presetState, requestedPlaceId);
  const placeChanged = activePlaceId.value !== resolvedPlaceId;

  if (requestedPlaceId !== resolvedPlaceId) {
    replaceRoutePlace(resolvedPlaceId);
  }

  activePlaceId.value = resolvedPlaceId;
  syncActivePreferencesFromState();
  closeTopbarMenu();

  if (placeChanged && options?.refresh !== false) {
    void refreshAll();
  }

  syncFullscreenPanelFromRoute({ refresh: false });
}

function selectTransitPlace(placeId: string): void {
  void router.push({
    path: route.path,
    query: {
      ...route.query,
      place: placeId,
    },
  });
}

function openPlaceNameModal(): void {
  placeNameError.value = "";
  placeNameModalOpen.value = true;
}

function closePlaceNameModal(): void {
  placeNameModalOpen.value = false;
  placeNameError.value = "";
}

function createPlaceFromName(label: string): void {
  try {
    const result = createTransitPlace(presetState, label, transitBoards);

    Object.assign(presetState, result.state);
    saveTransitPresetState(result.state);
    closePlaceNameModal();
    selectTransitPlace(result.place.id);
  } catch (error) {
    placeNameError.value =
      error instanceof Error ? error.message : t("app.errors.addPlace");
  }
}

function updateHiddenDirectionIdsForBoard(
  boardId: string,
  directionIds: string[],
): void {
  const nextHiddenDirectionIdsByBoardId = {
    ...preferences.hiddenDirectionIdsByBoardId,
  };

  if (directionIds.length > 0) {
    nextHiddenDirectionIdsByBoardId[boardId] = directionIds;
  } else {
    delete nextHiddenDirectionIdsByBoardId[boardId];
  }

  preferences.hiddenDirectionIdsByBoardId = nextHiddenDirectionIdsByBoardId;
  saveActiveTransitPreferences();
}

const visibleBoards = computed(() =>
  orderedBoards.value.filter((board) =>
    preferences.visibleBoardIds.includes(board.id),
  ),
);

watch(
  visibleBoards,
  (boards) => {
    if (!draggingBoards.value) {
      draggableBoards.value = [...boards];
    }
  },
  { immediate: true },
);

watch(
  () => route.query.place,
  () => {
    syncActivePlaceFromRoute();
  },
);

watch(
  () => [
    getRouteFullscreenStationRequest(),
    getRouteQueryParam("fullscreenDisplay"),
    getRouteQueryParam("fullscreenDesign"),
    getRouteQueryParam("display"),
  ],
  () => {
    syncFullscreenPanelFromRoute({ refresh: true });
  },
);

const boardTogglesInContextMenu = computed(
  () =>
    mobileBoardTogglesInContextMenu.value ||
    preferences.boardTogglesPlacement === "context-menu",
);

const nextAlarm = computed(
  () =>
    departureAlarms.value
      .filter((alarm) => !alarm.notified)
      .sort(
        (left, right) =>
          new Date(left.alarmTime).getTime() -
          new Date(right.alarmTime).getTime(),
      )[0],
);

const nextAlarmRemaining = computed(() =>
  nextAlarm.value ? formatAlarmRemaining(nextAlarm.value, nowTick.value) : "",
);

const netexCacheAlert = computed(() => {
  if (!netexCacheStatusLoaded.value || netexCacheStatus.value?.available) {
    return "";
  }

  return (
    netexCacheStatus.value?.message ||
    t("app.netexMissingBody")
  );
});
const trafficReportByLineRef = computed(
  () => new Map(trafficReports.value.map((report) => [report.lineRef, report])),
);
const fullscreenPanelDirections = computed<FullscreenPanelDirection[]>(() =>
  fullscreenPanelBoard.value
    ? getFullscreenPanelDirections(fullscreenPanelBoard.value)
    : [],
);
const fullscreenPanelTrafficAlert = computed(() => {
  const board = fullscreenPanelBoard.value;

  if (!board) {
    return undefined;
  }

  return getTrafficAlertModalData(board, getBoardTrafficAlert(board));
});
const homeTrafficModalAlert = computed<TrafficAlertModalData | undefined>(() => {
  const target = homeTrafficModalTarget.value;
  return target ? getTrafficAlertModalData(target.board, target.alert) : undefined;
});
const fullscreenPanelUpdatedAtLabel = computed(() => {
  const board = fullscreenPanelBoard.value;

  if (!board || !states[board.id]?.updatedAt) {
    return "";
  }

  return t("weather.updatedAt", {
    time: formatClock(states[board.id].updatedAt),
  });
});

function getBoardAlarmDepartureIds(boardId: string): string[] {
  return departureAlarms.value
    .filter((alarm) => alarm.boardId === boardId && !alarm.notified)
    .map((alarm) => alarm.departureId);
}

function ensureBoardState(boardId: string): BoardState {
  const board = allBoards.value.find((item) => item.id === boardId);

  if (!board) {
    throw new Error(t("app.errors.unknownBoard", { boardId }));
  }

  states[board.id] ??= {
    departures: [],
    directionGroups: board.directionGroups.map((group) => ({
      id: group.id,
      label: group.label,
      subtitle: group.subtitle,
      isTerminal: group.isTerminal,
      departures: [],
      serviceEnded: false,
    })),
    loading: false,
  };

  return states[board.id];
}

async function refreshBoard(boardId: string): Promise<void> {
  if (!primApiKeyConfigured || !isPageVisible()) {
    return;
  }

  const board = allBoards.value.find((item) => item.id === boardId);

  if (!board) {
    return;
  }

  const state = ensureBoardState(board.id);

  if (state.loading) {
    return;
  }

  state.loading = true;
  state.error = undefined;

  try {
    const result = await fetchBoardDepartures(
      createBoardRequestForSettings(board),
    );
    const enrichedResult = await enrichBoardDeparturesWithServiceTypes(
      board,
      result,
    );

    state.departures = enrichedResult.departures;
    state.directionGroups = enrichedResult.directionGroups;
    state.updatedAt = new Date();
    updateAlarms(
      reconcileBoardAlarms(
        board,
        enrichedResult.departures,
        departureAlarms.value,
      ),
    );
  } catch (error) {
    state.error = error instanceof Error ? error.message : t("app.errors.fetch");
  } finally {
    state.loading = false;
  }
}

async function enrichBoardDeparturesWithServiceTypes(
  board: TransitBoardConfig,
  result: BoardDeparturesResult,
): Promise<BoardDeparturesResult> {
  if (board.line.mode === "bus") {
    return result;
  }

  const departuresById = new Map<string, Departure>();
  const entries = result.directionGroups.flatMap((group) =>
    group.departures.map((departure) => ({ departure, group })),
  );

  await Promise.all(
    entries.map(async ({ departure, group }) => {
      const serviceType = await fetchCachedDepartureServiceType(
        board,
        group,
        departure,
      );

      departuresById.set(
        departure.id,
        serviceType ? { ...departure, serviceType } : departure,
      );
    }),
  );

  return {
    departures: result.departures.map(
      (departure) => departuresById.get(departure.id) ?? departure,
    ),
    directionGroups: result.directionGroups.map((group) => ({
      ...group,
      departures: group.departures.map(
        (departure) => departuresById.get(departure.id) ?? departure,
      ),
    })),
  };
}

async function fetchCachedDepartureServiceType(
  board: TransitBoardConfig,
  directionGroup: DirectionDepartureGroup,
  departure: Departure,
): Promise<DepartureServiceType | undefined> {
  const cacheKey = createDepartureServiceTypeCacheKey(
    board,
    directionGroup,
    departure,
  );
  let request = departureServiceTypeCache.get(cacheKey);

  if (!request) {
    request = fetchLinePatternView(board, departure, directionGroup)
      .then((patternView) => patternView.pattern.serviceType)
      .catch(() => undefined);
    departureServiceTypeCache.set(cacheKey, request);
    request.then((serviceType) => {
      if (!serviceType) {
        departureServiceTypeCache.delete(cacheKey);
      }
    });
  }

  return request;
}

function createDepartureServiceTypeCacheKey(
  board: TransitBoardConfig,
  directionGroup: DirectionDepartureGroup,
  departure: Departure,
): string {
  return [
    board.line.mode,
    board.schedule?.lineRef ?? board.line.ref,
    board.title,
    directionGroup.id,
    departure.destination,
  ].join("|");
}

async function refreshAll(): Promise<void> {
  if (!primApiKeyConfigured || !isPageVisible() || isFullscreenPanelOpen.value) {
    refreshing.value = false;
    return;
  }

  if (refreshing.value) {
    return;
  }

  refreshing.value = true;

  try {
    await runWithConcurrency(visibleBoards.value, 3, (board) =>
      refreshBoard(board.id),
    );
    void refreshTrafficSummary();
    lastRefresh.value = new Date();
  } finally {
    refreshing.value = false;
  }
}

async function refreshTrafficSummary(): Promise<void> {
  if (!primApiKeyConfigured || !isPageVisible()) {
    return;
  }

  const lineRefs = Array.from(
    new Set(
      visibleBoards.value.map(resolveBoardTrafficLineRef),
    ),
  );

  if (lineRefs.length === 0) {
    trafficReports.value = [];
    return;
  }

  try {
    const params = new URLSearchParams({
      lineRefs: lineRefs.join(","),
    });
    const response = await fetch(toServerApiUrl(`/api/traffic?${params}`));

    if (!response.ok) {
      throw new Error(t("app.errors.traffic"));
    }

    const payload = (await response.json()) as TrafficResponse;
    trafficReports.value = payload.lines;
  } catch {
    trafficReports.value = [];
  }
}

function toggleTopbarMenu(): void {
  topbarMenuOpen.value = !topbarMenuOpen.value;
}

function closeTopbarMenu(): void {
  topbarMenuOpen.value = false;
}

function refreshFromTopbarMenu(): void {
  closeTopbarMenu();
  void refreshAll();
}

function openWeatherModal(): void {
  closeTopbarMenu();
  weatherModalOpen.value = true;
}

function openBoardDisplayModal(): void {
  closeTopbarMenu();
  boardDisplayModalOpen.value = true;
}

async function openFullscreenPanel(
  board: TransitBoardConfig,
  options: {
    refresh?: boolean;
    requestNativeFullscreen?: boolean;
    syncRoute?: boolean;
  } = {},
): Promise<void> {
  stopRefreshTimer();
  fullscreenPanelBoard.value = board;
  fullscreenPanelPanamDirectionId.value = undefined;
  startFullscreenRefreshTimer();

  if (options.syncRoute !== false) {
    replaceRouteFullscreenPanel(board);
  }

  if (options.refresh) {
    void refreshBoard(board.id);
  }

  await nextTick();

  if (options.requestNativeFullscreen !== false) {
    await requestFullscreenPanelMode();
  }
}

async function requestFullscreenPanelMode(): Promise<void> {
  if (!import.meta.client || document.fullscreenElement) {
    fullscreenPanelEnteredNativeFullscreen.value = false;
    return;
  }

  try {
    await document.documentElement.requestFullscreen();
    fullscreenPanelEnteredNativeFullscreen.value =
      document.fullscreenElement === document.documentElement;
  } catch {
    fullscreenPanelEnteredNativeFullscreen.value = false;
  }
}

async function toggleFullscreenPanelMode(): Promise<void> {
  if (!import.meta.client) {
    return;
  }

  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch {
      // Fullscreen state can change while the menu is open.
    } finally {
      fullscreenPanelEnteredNativeFullscreen.value = false;
    }
    return;
  }

  await requestFullscreenPanelMode();
}

function syncFullscreenPanelNativeState(): void {
  fullscreenPanelEnteredNativeFullscreen.value =
    isFullscreenPanelOpen.value &&
    document.fullscreenElement === document.documentElement;
}

async function closeFullscreenPanel(
  options: { syncRoute?: boolean; resumeRefresh?: boolean } = {},
): Promise<void> {
  const shouldExitFullscreen =
    fullscreenPanelEnteredNativeFullscreen.value &&
    Boolean(document.fullscreenElement);

  if (options.syncRoute !== false) {
    removeRouteFullscreenPanel();
  }

  stopRefreshTimer();
  fullscreenPanelBoard.value = undefined;
  fullscreenPanelPanamDirectionId.value = undefined;
  fullscreenPanelRouteDesignOverride.value = undefined;
  fullscreenPanelEnteredNativeFullscreen.value = false;

  if (shouldExitFullscreen) {
    try {
      await document.exitFullscreen();
    } catch {
      // Browser fullscreen can already be gone after ESC or platform gestures.
    }
  }

  if (options.resumeRefresh !== false) {
    resumeHomeRefreshAfterFullscreenPanel();
  }
}

function resumeHomeRefreshAfterFullscreenPanel(): void {
  if (!primApiKeyConfigured || !isPageVisible()) {
    return;
  }

  pageVisible.value = true;
  startRefreshTimer();
  void refreshAll();
}

function updateFullscreenPanelDesign(payload: {
  design: FullscreenStationPanelDesign;
  panamDirectionId?: string;
}): void {
  updateSettings({ fullscreenStationPanelDesign: payload.design });
  fullscreenPanelRouteDesignOverride.value = getRouteFullscreenStationRequest()
    ? payload.design
    : undefined;
  fullscreenPanelPanamDirectionId.value = payload.panamDirectionId;

  if (fullscreenPanelBoard.value && getRouteFullscreenStationRequest()) {
    replaceRouteFullscreenPanel(fullscreenPanelBoard.value, payload.design);
  }
}

function updateFullscreenPanelTheme(darkTheme: boolean): void {
  updateSettings({ fullscreenStationPanelDarkTheme: darkTheme });
}

function refreshFullscreenPanel(): void {
  if (!fullscreenPanelBoard.value) {
    return;
  }

  void refreshBoard(fullscreenPanelBoard.value.id);
}

function handleMobileBreakpointChange(event: MediaQueryListEvent): void {
  mobileBoardTogglesInContextMenu.value = event.matches;
}

function handleDesktopDragBreakpointChange(event: MediaQueryListEvent): void {
  desktopDragEnabled.value = event.matches;
}

function startBoardDrag(): void {
  draggingBoards.value = true;
}

function saveBoardOrderAfterDrag(): void {
  preferences.boardOrderIds = mergeDraggedVisibleBoardOrder();
  draggingBoards.value = false;
  saveActiveTransitPreferences();
}

function mergeDraggedVisibleBoardOrder(): string[] {
  const visibleBoardIds = new Set(visibleBoards.value.map((board) => board.id));
  const draggedBoardIds = draggableBoards.value.map((board) => board.id);
  let draggedBoardIndex = 0;

  return orderedBoards.value.map((board) =>
    visibleBoardIds.has(board.id)
      ? (draggedBoardIds[draggedBoardIndex++] ?? board.id)
      : board.id,
  );
}

function createBoardRequestForSettings(
  board: TransitBoardConfig,
): TransitBoardConfig {
  const maxDeparturesPerDirection = preferences.maxDeparturesPerDirection;

  return typeof maxDeparturesPerDirection === "number"
    ? {
        ...board,
        maxDeparturesPerDirection,
      }
    : board;
}

function getVisibleDirectionGroupsForBoard(
  boardId: string,
): DirectionDepartureGroup[] {
  return filterTerminalOnly(
    states[boardId]?.directionGroups ?? [],
    preferences.terminalDirectionsOnly,
  );
}

function getFullscreenPanelDirections(
  board: TransitBoardConfig,
): FullscreenPanelDirection[] {
  const hiddenDirectionIds = new Set(
    preferences.hiddenDirectionIdsByBoardId[board.id] ?? [],
  );

  return getVisibleDirectionGroupsForBoard(board.id)
    .filter((direction) => !hiddenDirectionIds.has(direction.id))
    .map((direction) => ({
      id: direction.id,
      label: direction.label,
      subtitle: direction.subtitle,
      serviceEnded: direction.serviceEnded,
      departures: direction.departures.slice(0, 2).map((departure) => ({
        id: departure.id,
        waitLabel: formatPanelWait(departure),
        destination: departure.destination,
        meta: formatPanelDepartureMeta(departure),
        statusLabel: statusLabel(departure.status),
      })),
    }));
}

function formatPanelWait(departure?: Departure): string {
  if (!departure) {
    return "--";
  }

  if (departure.vehicleAtStop) {
    return "A quai";
  }

  const time = getDepartureTime(departure);

  if (!time) {
    return "--";
  }

  const minutes = Math.max(
    0,
    Math.round((new Date(time).getTime() - Date.now()) / 60000),
  );

  return minutes === 0 ? "0" : String(minutes);
}

function getDepartureTime(departure: Departure): string | undefined {
  return (
    departure.expectedDepartureTime ??
    departure.aimedDepartureTime ??
    departure.expectedArrivalTime
  );
}

function formatPanelDepartureMeta(departure: Departure): string {
  const parts = [
    getDepartureMonitoringLabel(departure),
    formatDepartureServiceType(departure.serviceType),
    formatRemainingStopCount(departure),
  ].filter(Boolean);

  return parts.join(" - ");
}

function getDepartureMonitoringLabel(departure: Departure): string {
  const normalizedLabel = normalizeText(departure.monitoringLabel);
  const normalizedDestination = normalizeText(departure.destination);

  if (
    !departure.monitoringLabel ||
    normalizedLabel === "tous quais" ||
    normalizedLabel === "tous quais." ||
    normalizedLabel === "horaire idfm" ||
    normalizedLabel === normalizedDestination
  ) {
    return "";
  }

  return departure.monitoringLabel;
}

function formatDepartureServiceType(
  serviceType?: DepartureServiceType,
): string {
  if (serviceType === "direct") {
    return t("board.serviceType.direct");
  }

  if (serviceType === "semi-direct") {
    return t("board.serviceType.semiDirect");
  }

  if (serviceType === "omnibus") {
    return t("board.serviceType.omnibus");
  }

  return "";
}

function formatRemainingStopCount(departure: Departure): string {
  if (typeof departure.remainingStopCount !== "number") {
    return "";
  }

  return departure.remainingStopCount > 1
    ? t("board.remainingStopsOther", { count: departure.remainingStopCount })
    : t("board.remainingStopsOne", { count: departure.remainingStopCount });
}

function statusLabel(status?: string): string {
  const labels: Record<string, string> = {
    noReport: t("board.status.onTime"),
    onTime: t("board.status.onTime"),
    delayed: t("board.status.delayed"),
    early: t("board.status.early"),
    missed: t("board.status.missed"),
    cancelled: t("board.status.cancelled"),
  };

  return status ? (labels[status] ?? status) : "";
}

function normalizeText(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function getTransportTypeLabel(board: TransitBoardConfig): string {
  if (board.line.mode === "metro") {
    return "metro";
  }

  if (board.line.mode === "rer") {
    return "RER";
  }

  if (board.line.mode === "train") {
    return "train";
  }

  return board.line.mode;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from(
    { length: Math.min(limit, queue.length) },
    async () => {
      while (queue.length > 0) {
        const item = queue.shift();

        if (item) {
          await worker(item);
        }
      }
    },
  );

  await Promise.all(workers);
}

async function loadNetexCacheStatus(): Promise<void> {
  try {
    const response = await fetch(toServerApiUrl("/api/netex/status"));

    if (!response.ok) {
      throw new Error(t("app.errors.netex"));
    }

    netexCacheStatus.value = (await response.json()) as NetexCacheStatus;
  } catch (error) {
    netexCacheStatus.value = {
      available: false,
      message:
        error instanceof Error ? error.message : t("app.netexMissingBody"),
    };
  } finally {
    netexCacheStatusLoaded.value = true;
  }
}

function toggleBoardVisibility(boardId: string): void {
  const visibleIds = new Set(preferences.visibleBoardIds);

  if (visibleIds.has(boardId)) {
    visibleIds.delete(boardId);
  } else {
    visibleIds.add(boardId);
  }

  preferences.visibleBoardIds = orderedBoards.value
    .map((board) => board.id)
    .filter((id) => visibleIds.has(id));
  saveActiveTransitPreferences();

  if (visibleIds.has(boardId)) {
    void refreshBoard(boardId);
  }
}

function addCustomBoard(board: TransitBoardConfig): void {
  upsertCustomBoard(board);
  ensureBoardVisible(board.id);
  ensureBoardState(board.id);
  saveActiveTransitPreferences();
  const refreshPromise = refreshBoard(board.id);
  void revealBoardAfterRender(board.id, refreshPromise);
}

function upsertCustomBoard(board: TransitBoardConfig): void {
  const existingBoardIndex = preferences.customBoards.findIndex(
    (item) => item.id === board.id,
  );

  preferences.customBoards =
    existingBoardIndex >= 0
      ? preferences.customBoards.map((item, index) =>
          index === existingBoardIndex ? board : item,
        )
      : [...preferences.customBoards, board];
}

function ensureBoardVisible(boardId: string): void {
  preferences.visibleBoardIds = addBoardId(preferences.visibleBoardIds, boardId);
  preferences.boardOrderIds = addBoardId(preferences.boardOrderIds, boardId);
}

function changeBoardStation(
  previousBoard: TransitBoardConfig,
  nextBoard: TransitBoardConfig,
): void {
  preferences.customBoards = preferences.customBoards.filter(
    (board) => board.id !== previousBoard.id && board.id !== nextBoard.id,
  );
  preferences.customBoards.push(nextBoard);
  preferences.visibleBoardIds = addBoardId(
    replaceBoardId(preferences.visibleBoardIds, previousBoard.id, nextBoard.id),
    nextBoard.id,
  );
  preferences.boardOrderIds = addBoardId(
    replaceBoardId(preferences.boardOrderIds, previousBoard.id, nextBoard.id),
    nextBoard.id,
  );

  preferences.collapsedDirectionIds = preferences.collapsedDirectionIds.filter(
    (id) => !id.startsWith(`${previousBoard.id}:`),
  );
  delete states[previousBoard.id];
  ensureBoardState(nextBoard.id);
  saveActiveTransitPreferences();
  updateAlarms(removeAlarmsForBoard(previousBoard.id, departureAlarms.value));
  void refreshBoard(nextBoard.id);
}

function addBoardId(boardIds: string[], boardId: string): string[] {
  return boardIds.includes(boardId) ? boardIds : [...boardIds, boardId];
}

function replaceBoardId(
  boardIds: string[],
  previousBoardId: string,
  nextBoardId: string,
): string[] {
  return dedupeBoardIds(
    boardIds.map((boardId) =>
      boardId === previousBoardId ? nextBoardId : boardId,
    ),
  );
}

function dedupeBoardIds(boardIds: string[]): string[] {
  return [...new Set(boardIds)];
}

function setBoardCardElement(
  boardId: string,
  value: Element | ComponentPublicInstance | null,
): void {
  if (typeof HTMLElement !== "undefined" && value instanceof HTMLElement) {
    boardCardElements.set(boardId, value);
    return;
  }

  boardCardElements.delete(boardId);
}

async function revealBoardAfterRender(
  boardId: string,
  settlePromise?: Promise<void>,
): Promise<void> {
  const requestId = ++boardRevealRequest;
  clearBoardRevealTimers();
  highlightedBoardId.value = undefined;

  // New cards are produced by Draggable after Vue updates the list, so wait
  // for both the reactive flush and a frame before reading the DOM ref.
  await nextTick();
  await waitForNextFrame();

  if (requestId !== boardRevealRequest) {
    return;
  }

  let element = boardCardElements.get(boardId);

  if (!element) {
    return;
  }

  scrollBoardIntoView(element);

  if (settlePromise) {
    await settlePromise.catch(() => undefined);
    await nextTick();
    await waitForNextFrame();

    if (requestId !== boardRevealRequest) {
      return;
    }

    element = boardCardElements.get(boardId);

    if (!element) {
      return;
    }

    scrollBoardIntoView(element);
  }

  await waitForBoardScroll();

  if (requestId !== boardRevealRequest) {
    return;
  }

  highlightBoard(boardId);
}

function scrollBoardIntoView(element: HTMLElement): void {
  const behavior = settings.value.reduceMotion ? "auto" : "smooth";

  if (typeof window.scrollTo === "function") {
    window.scrollTo({
      behavior,
      top: getBoardBottomScrollTop(element),
    });
    return;
  }

  element.scrollIntoView?.({ behavior, block: "end", inline: "nearest" });
}

function getBoardBottomScrollTop(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const currentScrollTop =
    window.scrollY ??
    window.pageYOffset ??
    document.documentElement.scrollTop ??
    0;
  const targetScrollTop =
    currentScrollTop +
    rect.bottom -
    window.innerHeight +
    NEW_BOARD_BOTTOM_INSET_PX;

  return Math.min(
    getMaxWindowScrollTop(),
    Math.max(0, Math.ceil(targetScrollTop)),
  );
}

function getMaxWindowScrollTop(): number {
  return Math.max(
    0,
    Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) -
      window.innerHeight,
  );
}

function waitForBoardScroll(): Promise<void> {
  if (settings.value.reduceMotion) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let resolved = false;
    const complete = (): void => {
      if (resolved) {
        return;
      }

      resolved = true;
      clearBoardRevealTimer();
      boardRevealCleanup?.();
      boardRevealCleanup = undefined;
      resolve();
    };

    if ("onscrollend" in window) {
      window.addEventListener("scrollend", complete, { once: true });
      boardRevealCleanup = () =>
        window.removeEventListener("scrollend", complete);
    }

    boardRevealTimer = window.setTimeout(
      complete,
      NEW_BOARD_SCROLL_FALLBACK_MS,
    );
  });
}

function highlightBoard(boardId: string): void {
  if (settings.value.reduceMotion) {
    return;
  }

  highlightedBoardId.value = boardId;
  boardHighlightTimer = window.setTimeout(() => {
    if (highlightedBoardId.value === boardId) {
      highlightedBoardId.value = undefined;
    }

    boardHighlightTimer = undefined;
  }, NEW_BOARD_HIGHLIGHT_MS);
}

function clearBoardRevealTimers(): void {
  clearBoardRevealTimer();

  if (boardHighlightTimer !== undefined) {
    window.clearTimeout(boardHighlightTimer);
    boardHighlightTimer = undefined;
  }

  boardRevealCleanup?.();
  boardRevealCleanup = undefined;
}

function clearBoardRevealTimer(): void {
  if (boardRevealTimer !== undefined) {
    window.clearTimeout(boardRevealTimer);
    boardRevealTimer = undefined;
  }
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      resolve();
      return;
    }

    window.requestAnimationFrame(() => resolve());
  });
}

function removeCustomBoard(boardId: string): void {
  preferences.customBoards = preferences.customBoards.filter(
    (board) => board.id !== boardId,
  );
  preferences.visibleBoardIds = preferences.visibleBoardIds.filter(
    (id) => id !== boardId,
  );
  preferences.boardOrderIds = preferences.boardOrderIds.filter(
    (id) => id !== boardId,
  );
  preferences.collapsedDirectionIds = preferences.collapsedDirectionIds.filter(
    (id) => !id.startsWith(`${boardId}:`),
  );
  delete states[boardId];
  saveActiveTransitPreferences();
  updateAlarms(removeAlarmsForBoard(boardId, departureAlarms.value));
}

function isCustomBoard(boardId: string): boolean {
  return preferences.customBoards.some((board) => board.id === boardId);
}

function setBoardDisplayMode(
  displayMode: TransitBoardPreferences["boardDisplayMode"],
): void {
  if (preferences.boardDisplayMode === displayMode) {
    closeTopbarMenu();
    return;
  }

  preferences.boardDisplayMode = displayMode;
  saveActiveTransitPreferences();
  closeTopbarMenu();
}

function openLinePage(board: TransitBoardConfig): void {
  const transportType =
    board.line.mode === "train" ? "transilien" : board.line.mode;
  const lineId = board.line.shortName || board.line.ref;
  const startStation = board.title || board.schedule?.stopAreaRef;
  const params = new URLSearchParams();

  if (startStation) {
    params.set("startStation", startStation);
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  window.open(
    `/line/${encodeURIComponent(transportType)}/${encodeURIComponent(lineId)}${suffix}`,
    "_blank",
    "noopener,noreferrer",
  );
}

function getTrafficAlertModalData(
  board: TransitBoardConfig,
  alert?: BoardTrafficAlert,
): TrafficAlertModalData | undefined {
  if (!alert) {
    return undefined;
  }

  const report = trafficReportByLineRef.value.get(
    resolveBoardTrafficLineRef(board),
  );
  const targets = alert.targets?.length ? alert.targets : [alert.target];
  const disruptionsById = new Map(
    report?.disruptions.map((disruption) => [disruption.id, disruption]) ?? [],
  );
  const disruptions = targets.flatMap((target) => {
    const disruption = disruptionsById.get(target.alertId);
    return disruption ? [disruption] : [];
  });

  return {
    ...alert,
    disruption: disruptions[0],
    disruptions,
  };
}

function openHomeTrafficModal(
  board: TransitBoardConfig,
  alert: BoardTrafficAlert,
): void {
  homeTrafficModalTarget.value = { board, alert };
  homeTrafficModalOpen.value = true;
}

function closeHomeTrafficModal(): void {
  homeTrafficModalOpen.value = false;
  homeTrafficModalTarget.value = undefined;
}

function goToTrafficPageFromHome(): void {
  const target = homeTrafficModalTarget.value;

  if (!target) {
    return;
  }

  closeHomeTrafficModal();
  openTrafficPage(target.board, target.alert);
}

function openTrafficPage(
  board: TransitBoardConfig,
  alert?: BoardTrafficAlert,
): void {
  router.push({
    path: "/traffic",
    query: createTrafficPageQuery(board, alert),
  });
}

function createTrafficPageQuery(
  board: TransitBoardConfig,
  alert?: BoardTrafficAlert,
): Record<string, string> {
  const query: Record<string, string> = {
    place: activePlaceId.value,
  };

  if (!alert?.target) {
    return query;
  }

  query.lineRef = alert.target.lineRef;
  query.alertId = alert.target.alertId;
  query.trafficTab = alert.target.trafficTab;
  query.lineShortName = board.line.shortName;
  query.lineName = board.line.longName;
  query.lineMode = board.line.mode;
  query.lineColor = board.line.color;
  query.lineTextColor = board.line.textColor;
  query.boardTitle = board.title;

  return query;
}

function getBoardTrafficAlert(
  board: TransitBoardConfig,
): BoardTrafficAlert | undefined {
  const report = trafficReportByLineRef.value.get(
    resolveBoardTrafficLineRef(board),
  );

  if (!report) {
    return undefined;
  }

  return getBoardTrafficAlertForReport(report, {
    lookaheadDays: settings.value.trafficWarningLookaheadDays,
    messages: {
      disruption: t("board.traffic.disruption"),
      disruptionAndInterruptionAt: (time) =>
        t("board.traffic.disruptionAndInterruptionAt", { time }),
      interruption: t("board.traffic.interruption"),
      multipleInterruptions: t("board.traffic.multipleInterruptions"),
      interruptionAt: (time) =>
        t("board.traffic.interruptionAt", { time }),
      interruptionInDay: (count) =>
        t("board.traffic.interruptionInDay", { count }),
      interruptionInDays: (count) =>
        t("board.traffic.interruptionInDays", { count }),
      interruptionToday: t("board.traffic.interruptionToday"),
    },
  });
}

function resolveBoardTrafficLineRef(board: TransitBoardConfig): string {
  return normalizeTrafficLineRef(board.schedule?.lineRef ?? board.line.ref);
}

function toggleDirection(boardId: string, directionId: string): void {
  const scopedId = getScopedDirectionId(boardId, directionId);
  const collapsedIds = new Set(preferences.collapsedDirectionIds);

  if (collapsedIds.has(scopedId)) {
    collapsedIds.delete(scopedId);
  } else {
    collapsedIds.add(scopedId);
  }

  preferences.collapsedDirectionIds = Array.from(collapsedIds);
  saveActiveTransitPreferences();
}

function getBoardCollapsedDirectionIds(boardId: string): string[] {
  const prefix = `${boardId}:`;

  return preferences.collapsedDirectionIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => id.slice(prefix.length));
}

function getScopedDirectionId(boardId: string, directionId: string): string {
  return `${boardId}:${directionId}`;
}

function openAlarmModal(payload: {
  board: TransitBoardConfig;
  directionGroup: DirectionDepartureGroup;
  departure: Departure;
}): void {
  alarmTriggerElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined;
  alarmModalError.value = "";
  alarmModalBusy.value = false;
  alarmTarget.value = {
    ...payload,
    activeAlarm: findActiveAlarmForDeparture(
      payload.board.id,
      payload.departure,
      departureAlarms.value,
    ),
  };

  if (nativeAlarmPlatform && !alarmTarget.value.activeAlarm) {
    void refreshNativeAlarmPermissionState();
  }
}

function openFullscreenAlarmModal(payload: {
  directionId: string;
  departureId: string;
}): void {
  const board = fullscreenPanelBoard.value;
  if (!board) {
    return;
  }

  const directionGroup = states[board.id]?.directionGroups.find(
    (direction) => direction.id === payload.directionId,
  );
  const departure = directionGroup?.departures.find(
    (item) => item.id === payload.departureId,
  );

  if (!directionGroup || !departure) {
    return;
  }

  openAlarmModal({
    board,
    directionGroup,
    departure,
  });
}

async function refreshNativeAlarmPermissionState(): Promise<void> {
  if (!nativeAlarmPlatform) {
    alarmNativePermissionState.value = "ready";
    return;
  }

  alarmNativePermissionState.value = "checking";

  try {
    const capability = await getDepartureAlarmCapability();
    alarmNativePermissionState.value = capability.ready ? "ready" : "required";
  } catch {
    alarmNativePermissionState.value = "required";
    alarmModalError.value = t("alarm.errors.permissionCheck");
  }
}

async function requestAlarmNativePermissions(): Promise<void> {
  alarmModalBusy.value = true;
  alarmModalError.value = "";
  alarmNativePermissionState.value = "checking";

  try {
    const capability = await requestDepartureAlarmPermissions();
    alarmNativePermissionState.value = capability.ready ? "ready" : "required";

    if (!capability.ready) {
      alarmModalError.value = t("alarm.errors.permissionRequired");
    }
  } catch {
    alarmNativePermissionState.value = "required";
    alarmModalError.value = t("alarm.errors.permissionRequest");
  } finally {
    alarmModalBusy.value = false;
  }
}

async function openPatternModal(payload: {
  board: TransitBoardConfig;
  directionGroup: DirectionDepartureGroup;
  departure: Departure;
}): Promise<void> {
  if (
    patternLoading.value &&
    patternTarget.value?.departure.id === payload.departure.id
  ) {
    return;
  }

  patternTarget.value = payload;
  patternData.value = undefined;
  patternError.value = "";
  patternLoading.value = true;

  try {
    const patternView = await fetchLinePatternView(
      payload.board,
      payload.departure,
      payload.directionGroup,
    );

    patternData.value = patternView.pattern;
  } catch (error) {
    patternError.value =
      error instanceof Error
        ? error.message
        : t("app.errors.pattern");
  } finally {
    patternLoading.value = false;
  }
}

async function fetchLinePatternView(
  board: TransitBoardConfig,
  departure: Departure,
  directionGroup: DirectionDepartureGroup,
): Promise<LinePatternViewResponse> {
  const transportType =
    board.line.mode === "train" ? "transilien" : board.line.mode;
  const lineId = board.line.shortName || board.line.ref;
  const direction =
    departure.destination || directionGroup.id || directionGroup.label;
  const startStation =
    departure.stopName ||
    board.title ||
    board.schedule?.stopAreaRef ||
    departure.monitoringRef;
  const params = new URLSearchParams();

  if (direction) {
    params.set("direction", direction);
  }

  if (startStation) {
    params.set("startStation", startStation);
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(
    toServerApiUrl(
      `/api/lines/${encodeURIComponent(transportType)}/${encodeURIComponent(
        lineId,
      )}/pattern${suffix}`,
    ),
  );

  if (!response.ok) {
    throw new Error(t("app.errors.pattern"));
  }

  return response.json() as Promise<LinePatternViewResponse>;
}

function closePatternModal(): void {
  patternTarget.value = undefined;
  patternData.value = undefined;
  patternError.value = "";
  patternLoading.value = false;
}

async function confirmAlarm(draft: AlarmDraft): Promise<void> {
  const target = alarmTarget.value;
  if (!target || target.activeAlarm || alarmModalBusy.value) {
    return;
  }

  alarmModalBusy.value = true;
  alarmModalError.value = "";

  try {
    const capability = await getDepartureAlarmCapability();
    if (nativeAlarmPlatform) {
      alarmNativePermissionState.value = capability.ready ? "ready" : "required";

      if (!capability.ready) {
        alarmModalError.value = t("alarm.errors.permissionRequired");
        return;
      }
    } else {
      await requestDepartureAlarmPermissions();
    }

    const alarm = createDepartureAlarm(
      target.board,
      target.departure,
      {
        ...draft,
        soundEnabled: nativeAlarmPlatform ? true : draft.soundEnabled,
      },
      departureAlarms.value,
    );

    await scheduleDepartureAlarm(alarm, getAlarmNotificationCopy(alarm));

    const nextAlarms = departureAlarms.value.filter(
      (item) =>
        !(
          item.boardId === alarm.boardId &&
          item.departureId === alarm.departureId &&
          !item.notified
        ),
    );
    updateAlarms([...nextAlarms, alarm]);
    closeAlarmModal();
  } catch (error) {
    alarmModalError.value =
      error instanceof Error && error.message === "departure-alarm-time-passed"
        ? t("alarm.errors.timePassed")
        : t("alarm.errors.schedule");
  } finally {
    alarmModalBusy.value = false;
  }
}

function cancelAlarmModal(): void {
  if (!alarmModalBusy.value) {
    closeAlarmModal();
  }
}

async function removeAlarm(): Promise<void> {
  const alarm = alarmTarget.value?.activeAlarm;
  if (!alarm || alarmModalBusy.value) {
    return;
  }

  alarmModalBusy.value = true;
  alarmModalError.value = "";

  try {
    await cancelDepartureAlarm(alarm);

    updateAlarms(
      removeDepartureAlarmById(alarm.id, departureAlarms.value),
    );
    closeAlarmModal();
  } catch {
    alarmModalError.value = t("alarm.errors.cancel");
  } finally {
    alarmModalBusy.value = false;
  }
}

function closeAlarmModal(): void {
  alarmTarget.value = undefined;
  alarmModalError.value = "";
  void nextTick(() => {
    if (alarmTriggerElement?.isConnected) {
      alarmTriggerElement.focus();
    }

    alarmTriggerElement = undefined;
  });
}

function getAlarmNotificationCopy(alarm: DepartureAlarm): DepartureAlarmNotificationCopy {
  const details = [
    t("app.alarmNotificationLine", {
      line: alarm.lineLabel,
      destination: alarm.destination,
    }),
    alarm.platform
      ? t("alarm.notificationDetailsWithPlatform", {
          monitoring: alarm.monitoringLabel,
          platform: alarm.platform,
        })
      : alarm.monitoringLabel,
  ];

  return {
    title: t("app.alarmNotificationTitle", { station: alarm.boardTitle }),
    body: details.filter(Boolean).join("\n"),
  };
}

function updateAlarms(alarms: DepartureAlarm[]): void {
  departureAlarms.value = alarms;
  saveDepartureAlarms(departureAlarms.value);

  void synchronizeAlarmState();
}


async function synchronizeAlarmState(): Promise<void> {
  const request = ++alarmSyncRequest;

  try {
    const capability = await getDepartureAlarmCapability();
    alarmNativePermissionState.value = capability.ready ? "ready" : "required";

    if (nativeAlarmPlatform && !capability.ready) {
      return;
    }

    const result = await synchronizeDepartureAlarms(
      departureAlarms.value,
      getAlarmNotificationCopy,
    );

    if (request !== alarmSyncRequest) {
      return;
    }

    const notifiedIds = new Set([
      ...result.expiredAlarmIds,
      ...result.deliveredAlarmIds,
    ]);
    if (notifiedIds.size > 0) {
      departureAlarms.value = departureAlarms.value.map((alarm) =>
        notifiedIds.has(alarm.id) ? { ...alarm, notified: true } : alarm,
      );
      saveDepartureAlarms(departureAlarms.value);
    }

    for (const alarmId of result.deliveredAlarmIds) {
      const alarm = findDepartureAlarmById(alarmId, departureAlarms.value);
      if (alarm) {
        showAlarmToast(alarm);
        await removeDepartureAlarmNotification(alarm);
      }
    }
  } catch (error) {
    console.error("Unable to synchronize departure alarms", error);
  }
}

async function handleAlarmDelivered(alarmId: string): Promise<boolean> {
  const alarm = findDepartureAlarmById(alarmId, departureAlarms.value);
  if (!alarm || alarm.notified) {
    return false;
  }

  updateAlarms(markAlarmNotified(alarm.id, departureAlarms.value));
  showAlarmToast(alarm);

  if (settings.value.wakeDeviceOnAlarm) {
    void requestTemporaryAlarmWakeLock("1m");
  }

  return true;
}

async function handleAlarmAction(alarmId: string): Promise<void> {
  const alarm = findDepartureAlarmById(alarmId, departureAlarms.value);
  if (!alarm) {
    return;
  }

  await removeDepartureAlarmNotification(alarm);
  await handleAlarmDelivered(alarmId);
}

function showAlarmToast(alarm: DepartureAlarm): void {
  alarmToast.value = alarm;

  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }

  toastTimer = window.setTimeout(() => {
    void dismissAlarmToast();
  }, 60_000);
}

async function dismissAlarmToast(): Promise<void> {
  const alarm = alarmToast.value;

  try {
    if (alarm) {
      await removeDepartureAlarmNotification(alarm);
    }
  } finally {
    alarmToast.value = undefined;
    stopDepartureAlarmSound();

    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = undefined;
    }
  }
}

transitBoards.forEach((board) => ensureBoardState(board.id));

function isPageVisible(): boolean {
  return (
    typeof document === "undefined" || document.visibilityState === "visible"
  );
}

function startRefreshTimer(): void {
  stopRefreshTimer();

  if (isFullscreenPanelOpen.value) {
    return;
  }

  refreshTimer = window.setInterval(() => {
    void refreshAll();
  }, REFRESH_INTERVAL_MS);
}

function startFullscreenRefreshTimer(): void {
  stopRefreshTimer();

  if (!fullscreenPanelBoard.value) {
    return;
  }

  refreshTimer = window.setInterval(() => {
    refreshFullscreenPanel();
  }, REFRESH_INTERVAL_MS);
}

function stopRefreshTimer(): void {
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
}

function refreshOnReturn(): void {
  if (!primApiKeyConfigured || !isPageVisible()) {
    return;
  }

  pageVisible.value = true;
  void synchronizeAlarmState();

  if (isFullscreenPanelOpen.value) {
    startFullscreenRefreshTimer();
    refreshFullscreenPanel();
    return;
  }

  startRefreshTimer();
  void refreshAll();
}

function handleVisibilityChange(): void {
  pageVisible.value = isPageVisible();

  if (pageVisible.value) {
    refreshOnReturn();
  } else {
    stopRefreshTimer();
  }
}

function formatClock(date?: Date): string {
  if (!date) {
    return "--:--";
  }

  return d(date, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

function formatAlarmRemaining(alarm: DepartureAlarm, now: number): string {
  const remainingMs = new Date(alarm.alarmTime).getTime() - now;

  if (remainingMs <= 0) {
    return "maintenant";
  }

  const minutes = Math.ceil(remainingMs / 60_000);

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  return restMinutes ? `${hours} h ${restMinutes}` : `${hours} h`;
}

async function migrateStoredCustomBoardDirections(): Promise<void> {
  const migration = await migrateCustomBoardDirectionGroups(
    preferences,
    async (board) => {
      const input = createDirectionDiscoveryInput(board);

      if (!input) {
        return undefined;
      }

      const directionGroups = await fetchDirectionGroupsForStation(
        input.line,
        input.station,
      );

      return directionGroups.some((group) => group.id === "all-directions")
        ? undefined
        : directionGroups;
    },
  );

  migration.updatedBoardIds.forEach((boardId) => {
    delete states[boardId];
    ensureBoardState(boardId);
  });

  if (migration.completed || migration.updatedBoardIds.length > 0) {
    saveActiveTransitPreferences();
  }
}

function createDirectionDiscoveryInput(
  board: TransitBoardConfig,
): { line: LineSearchOption; station: StationSearchOption } | undefined {
  const lineRef = board.schedule?.lineRef;
  const stopAreaRef = board.schedule?.stopAreaRef;
  const family = transitModeToFamily(board.line.mode);

  if (!lineRef || !stopAreaRef || !family) {
    return undefined;
  }

  return {
    line: {
      family,
      id: lineRef,
      label: board.line.shortName,
      ref: board.line.ref,
      navitiaId: lineRef,
      color: board.line.color,
      textColor: board.line.textColor,
    },
    station: {
      id: stopAreaRef,
      label: board.title,
      city: board.city,
      monitoringRef: board.monitoringPoints[0]?.ref ?? stopAreaRef,
      scheduleStopAreaRef: stopAreaRef,
    },
  };
}

function syncTransitPreferences(event?: Event): void {
  if (
    event instanceof StorageEvent &&
    event.key !== null &&
    event.key !== TRANSIT_PREFERENCES_STORAGE_KEY
  ) {
    return;
  }

  const previousVisibleIds = new Set(preferences.visibleBoardIds);
  Object.assign(presetState, loadTransitPresetState(transitBoards));
  syncActivePlaceFromRoute({ refresh: false });

  visibleBoards.value.forEach((board) => {
    ensureBoardState(board.id);

    if (!previousVisibleIds.has(board.id)) {
      void refreshBoard(board.id);
    }
  });
}

onMounted(() => {
  Object.assign(presetState, loadTransitPresetState(transitBoards));
  syncActivePlaceFromRoute({ refresh: false });
  syncFullscreenPanelFromRoute({ refresh: false });
  departureAlarms.value = loadDepartureAlarms();
  void initializeDepartureAlarmRuntime({
    onAlarmDelivered: handleAlarmDelivered,
    onAlarmAction: handleAlarmAction,
    onResume: async () => {
      await refreshNativeAlarmPermissionState();
      await synchronizeAlarmState();
    },
  }).then((dispose) => {
    disposeAlarmRuntime = dispose;
    void synchronizeAlarmState();
  });
  allBoards.value.forEach((board) => ensureBoardState(board.id));
  pageVisible.value = isPageVisible();
  syncFullscreenPanelFromRoute({ requestNativeFullscreen: true, refresh: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.addEventListener("fullscreenchange", syncFullscreenPanelNativeState);
  window.addEventListener("focus", refreshOnReturn);
  window.addEventListener("storage", syncTransitPreferences);
  window.addEventListener(
    TRANSIT_PREFERENCES_CHANGED_EVENT,
    syncTransitPreferences,
  );
  mobileBreakpointQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
  mobileBoardTogglesInContextMenu.value = mobileBreakpointQuery.matches;
  mobileBreakpointQuery.addEventListener(
    "change",
    handleMobileBreakpointChange,
  );
  desktopDragBreakpointQuery = window.matchMedia(DESKTOP_DRAG_BREAKPOINT_QUERY);
  desktopDragEnabled.value = desktopDragBreakpointQuery.matches;
  desktopDragBreakpointQuery.addEventListener(
    "change",
    handleDesktopDragBreakpointChange,
  );
  clockTimer = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
  void synchronizeAlarmState();
  void loadNetexCacheStatus();

  if (primApiKeyConfigured && pageVisible.value) {
    startRefreshTimer();
    void migrateStoredCustomBoardDirections().finally(() => {
      void refreshAll();
    });
  }
});

onBeforeUnmount(() => {
  stopRefreshTimer();
  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }
  if (clockTimer) {
    window.clearInterval(clockTimer);
  }
  if (disposeAlarmRuntime) {
    void disposeAlarmRuntime();
    disposeAlarmRuntime = undefined;
  }
  clearBoardRevealTimers();
  stopDepartureAlarmSound();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  document.removeEventListener(
    "fullscreenchange",
    syncFullscreenPanelNativeState,
  );
  window.removeEventListener("focus", refreshOnReturn);
  window.removeEventListener("storage", syncTransitPreferences);
  window.removeEventListener(
    TRANSIT_PREFERENCES_CHANGED_EVENT,
    syncTransitPreferences,
  );
  mobileBreakpointQuery?.removeEventListener(
    "change",
    handleMobileBreakpointChange,
  );
  mobileBreakpointQuery = undefined;
  desktopDragBreakpointQuery?.removeEventListener(
    "change",
    handleDesktopDragBreakpointChange,
  );
  desktopDragBreakpointQuery = undefined;
});
</script>

<template>
  <main class="app-shell">
    <div
      class="app-content"
      :class="{ 'app-content--locked': !primApiKeyConfigured }"
      :aria-hidden="!primApiKeyConfigured"
    >
      <section class="topbar" :aria-label="t('app.title')">
        <div>
          <p class="eyebrow">Île-de-France Mobilités</p>
          <h1>{{ t("app.title") }}</h1>
        </div>

        <div class="topbar__meta">
          <div v-if="nextAlarmRemaining" class="topbar__alarm">
            <div class="topbar__alarm_without_icon">
              <BellRing />
              <div>
                <span>{{ nextAlarmRemaining }}</span>
                <small>{{ t("app.alarmRemainingLabel") }}</small>
              </div>
            </div>
          </div>

          <PlaceSwitcher
            v-if="placeDropdownEnabled"
            :active-place-id="activePlaceId"
            :places="placeOptions"
            @add="openPlaceNameModal"
            @select="selectTransitPlace"
          />

          <div>
            <span>{{ formatClock(lastRefresh) }}</span>
            <small>{{ t("app.lastUpdated") }}</small>
          </div>
          <div class="topbar-inline-buttons">
            <button
              class="button-secondary"
              type="button"
              @click="stationModalOpen = true"
            >
              <Plus />
              {{ t("app.addBoard") }}
            </button>
            <div class="topbar-actions" @keydown.esc="closeTopbarMenu">
              <button
                ref="topbarMenuTrigger"
                class="topbar-actions__trigger icon-button"
                type="button"
                :aria-label="t('navigation.moreAria')"
                :aria-expanded="topbarMenuOpen"
                aria-haspopup="menu"
                @click="toggleTopbarMenu"
              >
                <MoreVertical aria-hidden="true" />
              </button>
              <ContextMenu
                v-model:open="topbarMenuOpen"
                :aria-label="t('navigation.secondaryAria')"
                :anchor="topbarMenuTrigger"
                class="topbar-actions__menu"
                close-on-outside-click
              >
                <button
                  type="button"
                  role="menuitem"
                  :disabled="refreshing"
                  @click="refreshFromTopbarMenu"
                >
                  <RefreshCw
                    aria-hidden="true"
                    :class="{ 'topbar-actions__spin': refreshing }"
                  />
                  {{ refreshing ? t("app.refreshing") : t("app.refresh") }}
                </button>
                <button type="button" role="menuitem" @click="openWeatherModal">
                  <CloudSun aria-hidden="true" />
                  {{ t("app.weather") }}
                </button>
                <div
                  class="topbar-actions__display"
                  :aria-label="t('settings.display.stationButtons')"
                  role="group"
                >
                  <button
                    class="topbar-actions__display-button"
                    :aria-pressed="preferences.boardDisplayMode === 'grid'"
                    :aria-label="t('app.tileViewAria')"
                    :title="t('app.tileViewAria')"
                    type="button"
                    @click="setBoardDisplayMode('grid')"
                  >
                    <LayoutGrid aria-hidden="true" />
                  </button>
                  <button
                    class="topbar-actions__display-button"
                    :aria-pressed="preferences.boardDisplayMode === 'list'"
                    :aria-label="t('app.compactListAria')"
                    :title="t('app.compactListAria')"
                    type="button"
                    @click="setBoardDisplayMode('list')"
                  >
                    <List aria-hidden="true" />
                  </button>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  @click="openBoardDisplayModal"
                >
                  <SlidersHorizontal aria-hidden="true" />
                  {{ t("settings.display.eyebrow") }}
                </button>
              </ContextMenu>
            </div>
          </div>
        </div>

        <div
          class="topbar__controls"
          :class="{
            'topbar__controls--menu-toggles': boardTogglesInContextMenu,
          }"
        >
          <BoardVisibilityControls
            v-if="!boardTogglesInContextMenu && visibleBoards.length > 0"
            :boards="allBoards"
            :visible-board-ids="preferences.visibleBoardIds"
            @toggle="toggleBoardVisibility"
          />
        </div>
      </section>

      <WeatherExperience />
      <WeatherForecastModal
        v-if="weatherModalOpen"
        :open="weatherModalOpen"
        @close="weatherModalOpen = false"
      />

      <Transition name="modal-scale">
        <div
          v-if="boardDisplayModalOpen"
          class="modal-backdrop"
          role="presentation"
          @click.self="boardDisplayModalOpen = false"
        >
          <section
            class="modal-panel board-display-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="board-display-title"
          >
            <header class="modal-panel__header">
              <div>
                <p class="eyebrow">{{ t("app.displayEyebrow") }}</p>
                <h2 id="board-display-title">{{ t("app.visibleStations") }}</h2>
              </div>
              <button
                class="icon-button"
                type="button"
                :aria-label="t('app.closeDisplayAria')"
                @click="boardDisplayModalOpen = false"
              >
                ×
              </button>
            </header>
            <div class="board-display-modal__body">
              <BoardVisibilityControls
                :boards="allBoards"
                :visible-board-ids="preferences.visibleBoardIds"
                @toggle="toggleBoardVisibility"
              />
            </div>
            <footer class="modal-panel__footer">
              <span class="board-display-modal__summary">
                {{
                  visibleBoards.length === 1
                    ? t("app.displaySummaryOne", { count: visibleBoards.length })
                    : t("app.displaySummaryOther", { count: visibleBoards.length })
                }}
              </span>
              <button
                class="button-secondary"
                type="button"
                @click="boardDisplayModalOpen = false"
              >
                {{ t("common.actions.close") }}
              </button>
            </footer>
          </section>
        </div>
      </Transition>

      <section
        class="place-swipe-shell"
        :class="{
          'place-swipe-shell--enabled': placeSwipe.canNavigate.value,
          'place-swipe-shell--dragging': placeSwipe.isDragging.value,
        }"
        aria-live="polite"
        @pointerdown="placeSwipe.onPointerDown"
        @pointermove="placeSwipe.onPointerMove"
        @pointerup="placeSwipe.onPointerUp"
        @pointercancel="placeSwipe.onPointerCancel"
        @lostpointercapture="placeSwipe.onPointerCancel"
      >
        <button
          v-if="placeSwipe.canGoPrevious.value"
          class="place-swipe-arrow place-swipe-arrow--previous"
          type="button"
          :aria-label="t('app.previousPlaceAria', { place: activePlaceLabel })"
          @click="placeSwipe.goToPreviousPlace"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button
          v-if="placeSwipe.canGoNext.value"
          class="place-swipe-arrow place-swipe-arrow--next"
          type="button"
          :aria-label="t('app.nextPlaceAria', { place: activePlaceLabel })"
          @click="placeSwipe.goToNextPlace"
        >
          <ChevronRight aria-hidden="true" />
        </button>

        <Transition :name="placeSwipe.transitionName.value">
          <div
            :key="activePlaceId"
            class="place-swipe-page"
            :style="placeSwipe.pageStyle.value"
          >
            <section
              v-if="netexCacheAlert"
              class="netex-cache-alert"
              role="status"
            >
              <strong>{{ t("app.netexMissingTitle") }}</strong>
              <span>
                {{ netexCacheAlert }}
                {{ t("app.netexMissingInstruction") }}
              </span>
            </section>

            <EmptyStationsState
              v-if="visibleBoards.length === 0"
              :place-label="activePlaceLabel"
              @add-station="stationModalOpen = true"
            />

            <Draggable
              v-else
              v-model="draggableBoards"
              tag="section"
              class="boards-grid"
              :class="{
                'boards-grid--list': preferences.boardDisplayMode === 'list',
                'boards-grid--draggable': desktopDragEnabled,
              }"
              :aria-label="t('app.schedulesAria')"
              item-key="id"
              :animation="220"
              :disabled="!desktopDragEnabled"
              :filter="'.board button, .board input, .board select, .board textarea, .board a'"
              :prevent-on-filter="false"
              chosen-class="board--drag-chosen"
              drag-class="board--dragging"
              ghost-class="board--drag-ghost"
              @start="startBoardDrag"
              @end="saveBoardOrderAfterDrag"
            >
              <template #item="{ element: board }">
                <div
                  :ref="(element) => setBoardCardElement(board.id, element)"
                  class="board-drag-item"
                  :class="{
                    'board-drag-item--new': highlightedBoardId === board.id,
                  }"
                  :data-board-id="board.id"
                >
                  <TransitBoard
                    :board="board"
                    :departures="states[board.id].departures"
                    :direction-groups="
                      getVisibleDirectionGroupsForBoard(board.id)
                    "
                    :collapsed-direction-ids="
                      getBoardCollapsedDirectionIds(board.id)
                    "
                    :hidden-direction-ids="
                      preferences.hiddenDirectionIdsByBoardId[board.id] ?? []
                    "
                    :loading="states[board.id].loading"
                    :error="states[board.id].error"
                    :updated-at="states[board.id].updatedAt"
                    :removable="isCustomBoard(board.id)"
                    :alarm-departure-ids="getBoardAlarmDepartureIds(board.id)"
                    :closed-summary-mode="preferences.closedDirectionSummaryMode"
                    :traffic-alert="getBoardTrafficAlert(board)"
                    :display-mode="preferences.boardDisplayMode"
                    @update:hidden-direction-ids="
                      updateHiddenDirectionIdsForBoard(board.id, $event)
                    "
                    @change-station="changeBoardStation(board, $event)"
                    @open-traffic="(alert) => openHomeTrafficModal(board, alert)"
                    @remove="removeCustomBoard(board.id)"
                    @open-line-page="openLinePage"
                    @open-fullscreen-panel="openFullscreenPanel"
                    @schedule-alarm="openAlarmModal"
                    @show-pattern="openPatternModal"
                    @toggle-direction="toggleDirection(board.id, $event)"
                  />
                </div>
              </template>
            </Draggable>
          </div>
        </Transition>
      </section>

      <Teleport to="body">
        <FullscreenStationPanel
          v-if="fullscreenPanelBoard"
          :station-name="fullscreenPanelBoard.title"
          :city="fullscreenPanelBoard.city"
          :line-name="fullscreenPanelBoard.line.longName"
          :line-short-name="fullscreenPanelBoard.line.shortName"
          :line-color="fullscreenPanelBoard.line.color"
          :line-text-color="fullscreenPanelBoard.line.textColor"
          :transport-type-label="getTransportTypeLabel(fullscreenPanelBoard)"
          :directions="fullscreenPanelDirections"
          :design="fullscreenPanelDesign"
          :dark-theme="settings.fullscreenStationPanelDarkTheme"
          :panam-direction-id="fullscreenPanelPanamDirectionId"
          :traffic-alert="fullscreenPanelTrafficAlert"
          :smart-traffic-modal-formatting="
            settings.smartTrafficModalFormatting
          "
          :loading="states[fullscreenPanelBoard.id]?.loading ?? false"
          :error="states[fullscreenPanelBoard.id]?.error"
          :updated-at-label="fullscreenPanelUpdatedAtLabel"
          :browser-fullscreen-active="fullscreenPanelEnteredNativeFullscreen"
          :alarm-departure-ids="
            getBoardAlarmDepartureIds(fullscreenPanelBoard.id)
          "
          :inert="Boolean(alarmTarget)"
          @change-design="updateFullscreenPanelDesign"
          @change-theme="updateFullscreenPanelTheme"
          @refresh="refreshFullscreenPanel"
          @toggle-fullscreen="toggleFullscreenPanelMode"
          @close="closeFullscreenPanel"
          @schedule-alarm="openFullscreenAlarmModal"
        >
          <template #line-logo>
            <LineIconBadge
              class="fullscreen-panel-line-icon"
              :line="fullscreenPanelBoard.line"
            />
          </template>
        </FullscreenStationPanel>
      </Teleport>
      <UserFriendlyTrafficModal
        :open="homeTrafficModalOpen"
        :alert="homeTrafficModalAlert"
        :smart-formatting-enabled="settings.smartTrafficModalFormatting"
        :show-go-to-trafic-page="true"
        @close="closeHomeTrafficModal"
        @go-to-traffic-page="goToTrafficPageFromHome"
      />

      <PlaceNameModal
        :error="placeNameError"
        :open="placeNameModalOpen"
        @close="closePlaceNameModal"
        @submit="createPlaceFromName"
      />

      <StationBoardModal
        v-if="stationModalOpen"
        :open="stationModalOpen"
        :mode="stationModalMode"
        @add="addCustomBoard"
        @close="stationModalOpen = false"
      />

      <DepartureAlarmModal
        v-if="alarmTarget"
        :board="alarmTarget?.board"
        :departure="alarmTarget?.departure"
        :open="Boolean(alarmTarget)"
        :active-alarm="alarmTarget?.activeAlarm"
        :native-sound-required="nativeAlarmPlatform"
        :native-permission-state="alarmNativePermissionState"
        :busy="alarmModalBusy"
        :error="alarmModalError"
        :above-fullscreen="Boolean(fullscreenPanelBoard)"
        @cancel="cancelAlarmModal"
        @confirm="confirmAlarm"
        @remove="removeAlarm"
        @request-native-permissions="requestAlarmNativePermissions"
      />

      <DeparturePatternModal
        v-if="patternTarget"
        :board="patternTarget?.board"
        :departure="patternTarget?.departure"
        :error="patternError"
        :loading="patternLoading"
        :open="Boolean(patternTarget)"
        :pattern="patternData"
        :line-id="
          patternTarget?.board.line.shortName || patternTarget?.board.line.ref
        "
        :transport-type="
          patternTarget?.board.line.mode === 'train'
            ? 'transilien'
            : patternTarget?.board.line.mode
        "
        :reduce-motion="settings.reduceMotion"
        :show-mini-map="settings.showPatternMiniMap"
        :show-city-zones="settings.showPatternCityZones"
        :compact-mode="settings.compactLinePlanMode"
        :pattern-rounded-curves="settings.patternRoundedCurves"
        :show-interruption-walking-times="
          settings.showInterruptionWalkingTimes
        "
        :pattern-compact-branch-gap="settings.patternCompactBranchGap"
        :pattern-compact-fork-gap="settings.patternCompactForkGap"
        :pattern-realistic-min-gap-coefficient="
          settings.patternRealisticMinGapCoefficient
        "
        :pattern-realistic-max-gap-coefficient="
          settings.patternRealisticMaxGapCoefficient
        "
        :rich-transfer-tooltips="settings.richTransferTooltips"
        :smart-traffic-detection="settings.smartTrafficDetection"
        :traffic-calendar-impact-scope="settings.trafficCalendarImpactScope"
        :traffic-warning-lookahead-days="
          settings.trafficWarningLookaheadDays
        "
        :traffic-report="
          patternTarget?.board
            ? trafficReportByLineRef.get(
                resolveBoardTrafficLineRef(patternTarget.board),
              )
            : undefined
        "
        :transfer-bundle-retention-days="settings.transferBundleRetentionDays"
        :transfer-bundle-request-concurrency="
          settings.transferBundleRequestConcurrency
        "
        :transfer-bundle-request-spacing-ms="
          settings.transferBundleRequestSpacingMs
        "
        :transfer-bundle-local-cache-enabled="
          settings.transferBundleLocalCacheEnabled
        "
        :transfer-bundle-backend-cache-enabled="
          settings.transferBundleBackendCacheEnabled
        "
        :transfer-resolver-mode="settings.transferResolverMode"
        @close="closePatternModal"
      />

      <div v-if="alarmToast" class="alarm-alert-backdrop" role="presentation">
        <section
          class="alarm-toast"
          role="dialog"
          aria-live="assertive"
          aria-modal="true"
        >
          <div
            class="alarm-toast__line"
            :style="{ backgroundColor: alarmToast.lineColor }"
          >
            {{ alarmToast.lineLabel }}
          </div>
          <div>
            <p class="eyebrow">{{ t("app.alarmToastEyebrow") }}</p>
            <strong>{{ alarmToast.destination }}</strong>
            <span>
              {{ alarmToast.boardTitle }} · {{ alarmToast.monitoringLabel }}
              <template v-if="alarmToast.platform">
                · {{ t("app.platform", { platform: alarmToast.platform }) }}</template
              >
            </span>
          </div>
          <button
            class="icon-button"
            type="button"
            :aria-label="t('app.closeAlertAria')"
            @click="dismissAlarmToast"
          >
            ×
          </button>
        </section>
      </div>
    </div>

    <Transition name="modal-scale">
      <section
        v-if="!primApiKeyConfigured"
        class="api-key-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-key-title"
      >
        <p class="eyebrow">{{ t("app.apiKeyEyebrow") }}</p>
        <h2 id="api-key-title">{{ t("app.apiKeyTitle") }}</h2>
        <p>
          {{ t("app.apiKeyBody") }}
        </p>
        <ol>
          <li>
            <a
              href="https://prim.iledefrance-mobilites.fr/"
              target="_blank"
              rel="noreferrer"
            >
              {{ t("app.createApiKey") }}
            </a>
          </li>
          <li>{{ t("app.assignApiKey") }}</li>
          <li>{{ t("app.restartServer") }}</li>
          <li>{{ t("app.enjoy") }}</li>
        </ol>
      </section>
    </Transition>
  </main>
</template>
