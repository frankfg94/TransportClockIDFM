<script setup lang="ts">
import { navigateTo } from "#imports";
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { CircleCheck, Eye, Minus, Plus, Settings, X } from "lucide-vue-next";
import DistanceToggle from "../../components/DistanceToggle.vue";
import AppRightPanel from "../../components/AppRightPanel.vue";
import MobileActionsMenu from "../../components/MobileActionsMenu.vue";
import StationBoardModal from "../../components/StationBoardModal.vue";
import {
  createGeographicMapFocusPlan,
  createMapTiles,
  getMaximumMapZoom,
  loadDetailedLineMap,
  loadStationTransfers,
  loadTransferLineDirections,
  loadTransferLineFrequency,
  type NormalizedMapTileWindow,
} from "./lineMapData";
import DetailedLineMapPickerSideBar from "./DetailedLineMapPickerSideBar.vue";
import LineMapDisplayControls from "./LineMapDisplayControls.vue";
import {
  filterNetworkGhostTransfersByModes,
  getNetworkGhostModeKey,
  isSameNetworkGhostStationName,
  TransitNetworkGhostLayer,
  useNetworkGhost,
  type GhostNetworkModeVisibility,
  type GhostNetworkScope,
  type NetworkGhostAnchor,
  type NetworkGhostCanvasRect,
  type NetworkGhostLineView,
} from "../network-ghost";
import { transitBoards } from "../../config/transitBoards";
import { createBoardFromDraft } from "../../services/boardBuilder";
import { preloadGtfsLineArtifacts } from "../../services/lineGeometry";
import { fetchDirectionGroupsForStation } from "../../services/idfm";
import {
  addBoardToTransitPreferences,
  cloneTransitBoardPreferences,
  DEFAULT_TRANSIT_PLACE_ID,
  getTransitPlaceById,
  loadTransitPresetState,
  resolveTransitPlaceId,
  saveTransitPresetState,
  updateTransitPlacePreferences,
  WORK_TRANSIT_PLACE_ID,
  type TransitPlacePreset,
} from "../../storage/transitPreferences";
import { formatTransitDistance } from "../../services/distance";
import { getTransferLineId } from "../../services/transferLineOptions";
import type {
  LineFrequencyProfile,
  LineSearchOption,
  StationSearchOption,
  TransitBoardConfig,
  TransitBoardPreferences,
  TransitFamily,
  TransferLineOption,
} from "../../types/transit";
import type { TrafficCalendarImpactScope, TrafficLineReport } from "../traffic/types";
import {
  getPatternTrafficEdgeKey,
  type PatternTrafficImpact,
} from "../service-pattern/trafficImpactAnalysis";
import PatternTrafficCalendarSurface from "../service-pattern/PatternTrafficCalendarSurface.vue";
import PatternTrafficCalendarToggle from "../service-pattern/PatternTrafficCalendarToggle.vue";
import { useDeparturePatternTraffic } from "../service-pattern/useDeparturePatternTraffic";
import { usePatternTrafficCalendar } from "../service-pattern/usePatternTrafficCalendar";
import type { PatternTrafficCalendarDay } from "../service-pattern/trafficCalendar";
import type { PatternTrafficSummaryEntry } from "../service-pattern/trafficCalendarSummary";
import { useI18n } from "../../i18n";
import { buildRoundedPolylinePath, createScreenSpaceRoundedPolylineOptions } from "./lineGeometry";
import {
  createLineMapFrameProbe,
  getLineMapRuntimeMetrics,
} from "./lineMapPerformance";
import {
  TRAFFIC_DISTURBANCE_COLOR,
  TRAFFIC_INTERRUPTION_COLOR,
} from "../service-pattern/trafficImpactStyles";
import type {
  LineMapEntranceView,
  LineMapSegmentView,
  LineMapStopView,
  LineMapViewModel,
  MapTile,
} from "./types";
import "./line-map.css";

interface TransferState {
  loading: boolean;
  lines: TransferLineOption[];
  error?: string;
}

interface GhostDirectionState {
  loading: boolean;
  directions: string[];
  error?: boolean;
}

interface GhostFrequencyState {
  loading: boolean;
  profile?: LineFrequencyProfile;
  error?: boolean;
}

interface MapDragState {
  active: boolean;
  dragging: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  velocityX: number;
  velocityY: number;
}

interface MapPinchState {
  active: boolean;
  centerX: number;
  centerY: number;
  distance: number;
}

interface SegmentDistanceLabel {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

type LineMapRightPanelContent = "station" | "traffic";

interface TouchStopClickGuard {
  stopId: string;
  handledAt: number;
}

interface PendingStopTap {
  pointerId: number;
  stop: LineMapStopView;
}

interface PendingGhostTap {
  pointerId: number;
  lineId: string;
}

interface GhostTapRequest {
  id: number;
  lineId: string;
  mode?: "select" | "toggle";
}

interface GhostGestureClickGuard {
  handledAt: number;
}

interface FavoriteUndoSnapshot {
  placeId: string;
  preferences: TransitBoardPreferences;
}

interface CloseSidebarOptions {
  preserveSelection?: boolean;
}

const props = withDefaults(
  defineProps<{
    line?: LineSearchOption;
    selectedStationId?: string;
    mode?: "picker" | "explorer";
    selectable?: boolean;
    ghostNetworkEnabled?: boolean;
    ghostNetworkScope?: GhostNetworkScope;
    gtfsLineGeometryEnabled?: boolean;
    reduceMotion?: boolean;
    smartTrafficDetection?: boolean;
    trafficReport?: TrafficLineReport;
    trafficCalendarImpactScope?: TrafficCalendarImpactScope;
  }>(),
  {
    mode: "picker",
    selectable: true,
    ghostNetworkEnabled: false,
    ghostNetworkScope: "all",
    gtfsLineGeometryEnabled: true,
    reduceMotion: false,
    smartTrafficDetection: false,
    trafficCalendarImpactScope: "all-impacts",
  },
);

const emit = defineEmits<{
  select: [station: StationSearchOption];
}>();
const { t } = useI18n();

const VIEWBOX_WIDTH = 1080;
const VIEWBOX_HEIGHT = 620;
const SVG_PADDING_X = 78;
const SVG_PADDING_Y = 68;
const MIN_ZOOM = 0.9;
const ZOOM_FACTOR = 1.24;
const GHOST_TOOLTIP_TARGET = "#line-map-network-ghost-tooltip-layer";
const TRAFFIC_FOCUS_CAMERA_DURATION_MS = 620;
const TRAFFIC_FOCUS_PULSE_DELAY_MS = 500;
const TRAFFIC_FOCUS_PULSE_DURATION_MS = 900;
const TRAFFIC_FOCUS_PULSE_REPEAT_DELAY_MS = 1_500;
const MAP_TILE_LOAD_DEBOUNCE_MS = 80;
const MAP_TILE_LOAD_TIMEOUT_MS = 8_000;
const INITIAL_MAP_TILE_BUDGET = 64;
const MAXIMUM_MAP_TILE_BUDGET = 96;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const WHEEL_ZOOM_EASING = 0.24;
const WHEEL_ZOOM_EPSILON = 0.005;
const PAN_INERTIA_FRICTION = 0.0055;
const PAN_INERTIA_MIN_VELOCITY = 0.02;
const PAN_INERTIA_MAX_VELOCITY = 2.4;
const ENTRANCES_OVERVIEW_RADIUS_METERS = 1_000;
const ENTRANCE_FOCUS_RADIUS_METERS = 250;

const lineMap = ref<LineMapViewModel>();
const loadingMap = ref(false);
const errorMessage = ref("");
const hoveredStop = ref<LineMapStopView>();
const activeStop = ref<LineMapStopView>();
const activeRightPanel = ref<LineMapRightPanelContent>();
const zoom = ref(1.12);
const maximumZoom = computed(() => getMaximumMapZoom(lineMap.value?.viewport));
const mapCanvas = ref<HTMLDivElement>();
const mapWorld = ref<HTMLDivElement>();
const mapScene = ref<HTMLDivElement>();
const mapTileWindow = ref<NormalizedMapTileWindow>({ minX: 0, maxX: 1, minY: 0, maxY: 1 });
const ghostViewportRect = ref<NetworkGhostCanvasRect>({
  x: 0,
  y: 0,
  width: VIEWBOX_WIDTH,
  height: VIEWBOX_HEIGHT,
});
const renderedMapTiles = ref<MapTile[]>([]);
const focusedEntranceId = ref<string>();
const mapMotionActive = ref(false);
const suppressNextCanvasClick = ref(false);
const ghostResetKey = ref(0);
const ghostDisplayExpanded = ref(true);
const ghostDisplayEnabled = ref(true);
const activeGhostLine = ref<NetworkGhostLineView>();
const favoriteLoading = ref(false);
const favoriteError = ref("");
const favoriteConfirmationOpen = ref(false);
const favoriteDashboardSelectorOpen = ref(false);
const favoriteDashboardId = ref(DEFAULT_TRANSIT_PLACE_ID);
const favoriteDashboardAlertOpen = ref(false);
const favoriteDashboardAlertLabel = ref("");
const favoriteAlertProgressKey = ref(0);
const favoriteUndoSnapshot = ref<FavoriteUndoSnapshot>();
const ghostLineStationModalOpen = ref(false);
const ghostLineStationLine = ref<LineSearchOption>();
const ghostLineStationFamily = ref<TransitFamily>();
const ghostLineStationStation = ref<StationSearchOption>();
const showDistances = ref(false);
const mobileDisplayOpen = ref(false);
const selectedTrafficDisruptionIds = ref<string[]>([]);
const selectedTrafficTimestamp = ref<number>();
const trafficPulseStopIds = ref(new Set<string>());
const touchStopClickGuard = ref<TouchStopClickGuard>();
const pendingStopTap = ref<PendingStopTap>();
const pendingGhostTap = ref<PendingGhostTap>();
const ghostTapRequest = ref<GhostTapRequest>();
const pendingGhostLineSelection = ref<TransferLineOption>();
const ghostGestureClickGuard = ref<GhostGestureClickGuard>();
let ghostTapRequestId = 0;
let trafficFocusRequest = 0;
let trafficPulseClearTimer: number | undefined;
const trafficFocusWaitTimers = new Map<number, () => void>();

const mapDrag = reactive<MapDragState>({
  active: false,
  dragging: false,
  pointerId: -1,
  scrollLeft: 0,
  scrollTop: 0,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  lastTime: 0,
  velocityX: 0,
  velocityY: 0,
});
const mapPinch = reactive<MapPinchState>({
  active: false,
  centerX: 0,
  centerY: 0,
  distance: 0,
});
const transferStates = reactive<Record<string, TransferState>>({});
const ghostDirectionStates = reactive<Record<string, GhostDirectionState>>({});
const ghostFrequencyStates = reactive<Record<string, GhostFrequencyState>>({});
const ghostModeVisibility = reactive<GhostNetworkModeVisibility>({
  bus: props.ghostNetworkScope !== "structural",
  metro: true,
  tram: true,
  noctilien: props.ghostNetworkScope !== "structural",
  rer: true,
  transilien: true,
});
let latestMapRequest = 0;
let favoriteAlertTimeout: number | undefined;
let pendingZoomScrollLeft: number | undefined;
let pendingZoomScrollTop: number | undefined;
let zoomScrollUpdateId = 0;
let zoomScrollUpdateScheduled = false;
let mapTileWindowAnimationFrame: number | undefined;
let mapTileLoadDebounceTimer: number | undefined;
let mapTileLoadRequest = 0;
let nextMapTileReplacementImmediate = false;
let wheelZoomAnimationFrame: number | undefined;
let wheelZoomTarget: number | undefined;
let wheelZoomClientX = 0;
let wheelZoomClientY = 0;
let liveZoom = zoom.value;
let liveZoomActive = false;
let panInertiaAnimationFrame: number | undefined;
let panInertiaLastTime = 0;
let mapPerformanceScrollTimer: number | undefined;

const stopById = computed(() => {
  const stops = new Map<string, LineMapStopView>();

  lineMap.value?.stops.forEach((stop) => stops.set(stop.id, stop));

  return stops;
});

const selectedStop = computed(() =>
  lineMap.value?.stops.find((stop) => stop.id === props.selectedStationId),
);

const activeTransferState = computed(() =>
  activeStop.value ? transferStates[activeStop.value.id] : undefined,
);
const ghostAnchor = computed<NetworkGhostAnchor | undefined>(() => {
  const stop = activeStop.value;

  if (!stop) {
    return undefined;
  }

  return {
    id: stop.id,
    label: stop.label,
    lon: stop.lon ?? stop.station.lon,
    lat: stop.lat ?? stop.station.lat,
    projectedX: stop.projectedX,
    projectedY: stop.projectedY,
    mapX: stop.x,
    mapY: stop.y,
    quays: stop.quays,
  };
});
const ghostTransfers = computed(() => activeTransferState.value?.lines ?? []);
const visibleGhostTransfers = computed(() =>
  ghostDisplayEnabled.value
    ? filterNetworkGhostTransfersByModes(ghostTransfers.value, ghostModeVisibility)
    : [],
);
const activeGhostDirectionState = computed(() =>
  activeGhostLine.value ? ghostDirectionStates[activeGhostLine.value.id] : undefined,
);
const activeGhostFrequencyState = computed(() => {
  const line = activeGhostLine.value;
  const stop = activeStop.value;

  return line && stop ? ghostFrequencyStates[createGhostFrequencyKey(line.id, stop)] : undefined;
});
const stationBoardDashboardOptions = computed(() =>
  typeof window === "undefined"
    ? []
    : loadTransitPresetState(transitBoards).places.map(localizeTransitPlace),
);
const favoriteDashboardAlertMessage = computed(() =>
  favoriteDashboardAlertLabel.value
    ? t("lineMap.picker.favoriteAddedToDashboard", {
        dashboard: favoriteDashboardAlertLabel.value,
      })
    : t("lineMap.picker.favoriteAdded"),
);
const isExplorerMode = computed(() => props.mode === "explorer");
const canSelectStops = computed(() => props.selectable);

function localizeTransitPlace(place: TransitPlacePreset): TransitPlacePreset {
  if (place.id === DEFAULT_TRANSIT_PLACE_ID) {
    return { ...place, label: t("places.home") };
  }

  if (place.id === WORK_TRANSIT_PLACE_ID) {
    return { ...place, label: t("places.work") };
  }

  return place;
}
const isMapDragging = computed(() => mapDrag.dragging);
const isMapZooming = computed(
  () => mapPinch.active || (mapMotionActive.value && wheelZoomTarget !== undefined),
);
const isMapMoving = computed(
  () => mapDrag.dragging || mapPinch.active || mapMotionActive.value,
);
const {
  lines: ghostLines,
  progress: ghostProgress,
  quays: ghostQuays,
} = useNetworkGhost({
  anchor: ghostAnchor,
  enabled: computed(
    () => props.ghostNetworkEnabled && isExplorerMode.value && ghostDisplayEnabled.value,
  ),
  scope: computed(() => props.ghostNetworkScope),
  transfers: visibleGhostTransfers,
  useGtfs: computed(() => props.gtfsLineGeometryEnabled),
  viewport: computed(() => lineMap.value?.viewport),
});
const mapPerformanceProbe =
  import.meta.dev &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("mapPerf") === "1"
    ? createLineMapFrameProbe(
        (callback) => window.requestAnimationFrame(callback),
        (handle) => window.cancelAnimationFrame(handle),
      )
    : undefined;
const mapPerformanceSummary = ref("");

watch(isMapMoving, (moving) => {
  if (!mapPerformanceProbe) return;
  if (moving) {
    mapPerformanceProbe.start();
    return;
  }

  recordMapPerformance();
});

function recordMapPerformance(): void {
  const frames = mapPerformanceProbe?.stop();
  if (!frames) return;
  const report = {
    ...frames,
    ...getLineMapRuntimeMetrics(),
    ghostLines: ghostLines.value.length,
    ghostSegments: ghostLines.value.reduce((count, line) => count + line.segments.length, 0),
    ghostTiles: mapCanvas.value?.querySelectorAll(".network-ghost-canvas-tile").length ?? 0,
  };
  mapPerformanceSummary.value = JSON.stringify(report);
  console.info("[line-map:perf]", report);
}
const visibleEntrances = computed<LineMapEntranceView[]>(() => {
  const stop = activeStop.value;
  if (!stop) return [];

  const mainEntrances = (lineMap.value?.entrances ?? []).filter((entrance) =>
    isSameStopReference(entrance.parentStopId, stop.id),
  );
  const transferEntrances = ghostLines.value.flatMap((line) => {
    const anchorStation = line.stations.find((station) => station.id === line.anchorStationId);
    if (!anchorStation || !isSameNetworkGhostStationName(anchorStation.label, stop.label)) {
      return [];
    }

    return (line.entrances ?? [])
      .filter((entrance) => isSameStopReference(entrance.parentStationId, line.anchorStationId))
      .map((entrance) => ({ ...entrance, parentStopId: stop.id }));
  });

  return [
    ...new Map(
      [...mainEntrances, ...transferEntrances].map((entrance) => [entrance.id, entrance]),
    ).values(),
  ];
});
const { analyzeCurrentTrafficImpacts, resolvedTrafficReport, trafficTimingNow } =
  useDeparturePatternTraffic({
    open: computed(() => Boolean(props.line)),
    line: computed(() => props.line),
    smartTrafficDetection: computed(() => props.smartTrafficDetection),
    trafficReport: computed(() => props.trafficReport),
    selectedTrafficDisruptionIds: computed(() => selectedTrafficDisruptionIds.value),
    trafficEvaluationTimestamp: computed(() => selectedTrafficTimestamp.value),
  });

const lineTrafficAnalysis = computed(() => {
  const map = lineMap.value;

  return analyzeCurrentTrafficImpacts(
    map?.stops.map((stop) => ({ key: stop.id, label: stop.label })) ?? [],
    map?.segments.map((segment) => ({
      id: segment.id,
      source: segment.fromStopId,
      target: segment.toStopId,
    })) ?? [],
  );
});

const trafficCalendarStations = computed(() =>
  (lineMap.value?.stops ?? []).map((stop) => ({
    key: stop.id,
    label: stop.label,
    transfers: transferStates[stop.id]?.lines ?? [],
  })),
);
const trafficCalendarEdges = computed(() =>
  (lineMap.value?.segments ?? []).map((segment) => ({
    id: segment.id,
    source: segment.fromStopId,
    target: segment.toStopId,
  })),
);
const {
  calendar: trafficCalendar,
  close: closePatternTrafficCalendar,
  closeExpanded: closeExpandedTrafficCalendar,
  eventCount: trafficCalendarEventCount,
  events: trafficCalendarEvents,
  expand: expandTrafficCalendar,
  expanded: trafficCalendarExpanded,
  hasNext: hasNextTrafficCalendarMonth,
  hasPrevious: hasPreviousTrafficCalendarMonth,
  loadingDateKey: trafficCalendarLoadingDateKey,
  loadingDirection: trafficCalendarLoadingDirection,
  nextDelayLabel: trafficCalendarNextDelayLabel,
  nextMonth: selectNextTrafficCalendarMonth,
  open: trafficCalendarOpen,
  previousMonth: selectPreviousTrafficCalendarMonth,
  resetSelection: resetTrafficCalendarSelection,
  resetToday: resetPatternTrafficCalendarToday,
  selectDay: selectPatternTrafficCalendarDay,
  selectedDateKey: selectedTrafficCalendarDateKey,
  selectedDay: selectedTrafficCalendarDay,
  selectedDisruptions: selectedTrafficCalendarDisruptions,
  toggle: togglePatternTrafficCalendar,
} = usePatternTrafficCalendar({
  report: computed(() => (props.smartTrafficDetection ? resolvedTrafficReport.value : undefined)),
  stations: trafficCalendarStations,
  edges: trafficCalendarEdges,
  impactScope: computed(() => props.trafficCalendarImpactScope),
  now: trafficTimingNow,
  reduceMotion: computed(() => props.reduceMotion),
  selectedDisruptionIds: selectedTrafficDisruptionIds,
  selectedTimestamp: selectedTrafficTimestamp,
});
const stationDetailsPanelOpen = computed(() => activeRightPanel.value === "station");
const trafficCalendarPanelOpen = computed(
  () => activeRightPanel.value === "traffic" && trafficCalendarOpen.value,
);

const mapStats = computed(() => {
  const stopCount = lineMap.value?.stops.length ?? 0;

  return stopCount === 1
    ? t("lineMap.picker.stationCountOne", { count: stopCount })
    : t("lineMap.picker.stationCountOther", { count: stopCount });
});

const segmentDistanceLabels = computed<SegmentDistanceLabel[]>(() => {
  const map = lineMap.value;

  if (!map || !showDistances.value) {
    return [];
  }

  return map.segments.flatMap((segment) => {
    if (segment.distanceKm === undefined) {
      return [];
    }

    const label = formatTransitDistance(segment.distanceKm);
    const height = 22 / zoom.value;
    const width = Math.max(42, label.length * 6.6 + 14) / zoom.value;

    return [
      {
        id: segment.id,
        label,
        x: (getSegmentX(segment, "from") + getSegmentX(segment, "to")) / 2,
        y: (getSegmentY(segment, "from") + getSegmentY(segment, "to")) / 2,
        width,
        height,
      },
    ];
  });
});

const renderedStops = computed(() => {
  const activeStopId = activeStop.value?.id;
  const stops = (lineMap.value?.stops ?? []).map((stop, index) => ({
    index,
    stop,
  }));

  if (!activeStopId) {
    return stops;
  }

  return [
    ...stops.filter(({ stop }) => stop.id !== activeStopId),
    ...stops.filter(({ stop }) => stop.id === activeStopId),
  ];
});

const svgStyle = computed(() => ({
  height: `${VIEWBOX_HEIGHT * zoom.value}px`,
  width: `${VIEWBOX_WIDTH * zoom.value}px`,
}));

watch(zoom, (nextZoom) => {
  if (liveZoomActive) return;
  liveZoom = nextZoom;
  void nextTick(() => resetLiveZoomComposite(nextZoom));
});

const requestedMapTiles = computed(() => {
  const map = lineMap.value;
  if (!map) return [];

  return map.viewport
    ? createMapTiles(map.viewport, {
        mapScale: zoom.value,
        pixelRatio: mapPixelRatio.value,
        visibleWindow: mapTileWindow.value,
        maxTiles: zoom.value <= 1.25 ? INITIAL_MAP_TILE_BUDGET : MAXIMUM_MAP_TILE_BUDGET,
      })
    : map.tiles;
});
const mapPixelRatio = computed(() =>
  typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1),
);

watch(
  requestedMapTiles,
  (tiles) => {
    const immediate = nextMapTileReplacementImmediate;
    nextMapTileReplacementImmediate = false;
    scheduleMapTileReplacement(tiles, immediate);
  },
  { flush: "post" },
);

const stopRadius = computed(() => 7 / zoom.value);
const stopHaloRadius = computed(() => 16 / zoom.value);
const stopStrokeWidth = computed(() => 2 / zoom.value);
const stopTrafficCrossRadius = computed(() => 5.2 / zoom.value);
const stopTrafficCrossStrokeWidth = computed(() => 2.4 / zoom.value);

const visibleLabelIds = computed(() => {
  const map = lineMap.value;

  if (!map) {
    return new Set<string>();
  }

  if (zoom.value >= 2.15) {
    return new Set(map.stops.map((stop) => stop.id));
  }

  const requiredIds = new Set<string>(
    [
      ...getTerminalStopIds(map),
      props.selectedStationId ?? "",
      hoveredStop.value?.id ?? "",
      activeStop.value?.id ?? "",
    ].filter(Boolean),
  );
  const placedLabels: Array<{ x: number; y: number }> = [];
  const labelIds = new Set<string>();
  const minimumDistance = zoom.value >= 1.55 ? 62 : zoom.value >= 1.25 ? 78 : 96;
  const sortedStops = [...map.stops].sort(
    (left, right) => getLabelPriority(right, requiredIds) - getLabelPriority(left, requiredIds),
  );

  sortedStops.forEach((stop) => {
    const x = toScreenX(stop.x);
    const y = toScreenY(stop.y);
    const required = requiredIds.has(stop.id);
    const collides = placedLabels.some(
      (label) => Math.hypot(label.x - x, label.y - y) < minimumDistance,
    );

    if (!required && collides) {
      return;
    }

    labelIds.add(stop.id);
    placedLabels.push({ x, y });
  });

  return labelIds;
});

watch(
  () => [props.line?.id, props.gtfsLineGeometryEnabled] as const,
  () => {
    closeSidebar();
    closePatternTrafficCalendar();
    resetTrafficCalendarSelection();
    clearTransferStates();
    showDistances.value = false;

    if (props.line) {
      void loadMap();
      return;
    }

    lineMap.value = undefined;
  },
  { immediate: true },
);

watch(
  () => props.ghostNetworkScope,
  (scope) => {
    if (scope === "structural") {
      ghostModeVisibility.bus = false;
      ghostModeVisibility.noctilien = false;
    }
  },
);

watch(ghostDisplayEnabled, (enabled) => {
  if (!enabled) {
    activeGhostLine.value = undefined;
    ghostResetKey.value += 1;
  }
});

watch(
  () => ghostLines.value.map((line) => line.id).join("|"),
  () => {
    applyPendingGhostLineSelection();
  },
);

async function loadMap(): Promise<void> {
  if (!props.line) {
    return;
  }

  const requestId = ++latestMapRequest;
  loadingMap.value = true;
  errorMessage.value = "";
  cancelPendingMapTileReplacement();
  cancelMapMotion();
  focusedEntranceId.value = undefined;
  renderedMapTiles.value = [];
  hoveredStop.value = undefined;
  activeStop.value = undefined;
  activeRightPanel.value = undefined;

  try {
    const map = await loadDetailedLineMap(props.line, props.gtfsLineGeometryEnabled);

    if (requestId === latestMapRequest) {
      lineMap.value = map;
      renderedMapTiles.value = map.tiles;
      zoom.value = getDefaultZoom(map);
      mapTileWindow.value = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
      ghostViewportRect.value = {
        x: 0,
        y: 0,
        width: VIEWBOX_WIDTH,
        height: VIEWBOX_HEIGHT,
      };
      void nextTick(updateVisibleMapTileWindow);
    }
  } catch (error) {
    if (requestId === latestMapRequest) {
      lineMap.value = undefined;
      errorMessage.value = error instanceof Error ? error.message : "Plan indisponible";
    }
  } finally {
    if (requestId === latestMapRequest) {
      loadingMap.value = false;
    }
  }
}

function selectStop(stop: LineMapStopView): void {
  if (isExplorerMode.value) {
    toggleStopDetails(stop);
  }

  if (canSelectStops.value) {
    emit("select", stop.station);
  }
}

function beginStopTap(stop: LineMapStopView, event: PointerEvent): void {
  if (event.button !== 0 || mapPinch.active) {
    return;
  }

  pendingStopTap.value = {
    pointerId: event.pointerId,
    stop,
  };
}

function selectStopFromClick(stop: LineMapStopView, event: MouseEvent): void {
  const guard = touchStopClickGuard.value;

  if (guard?.stopId === stop.id && Date.now() - guard.handledAt < 900) {
    event.preventDefault();
    touchStopClickGuard.value = undefined;
    return;
  }

  touchStopClickGuard.value = undefined;
  selectStop(stop);
}

function showStopHover(stop: LineMapStopView): void {
  hoveredStop.value = stop;
}

function hideStopHover(stop?: LineMapStopView): void {
  if (!stop || hoveredStop.value?.id === stop.id) {
    hoveredStop.value = undefined;
  }
}

function toggleStopDetails(stop: LineMapStopView): void {
  favoriteError.value = "";

  if (activeStop.value?.id === stop.id) {
    if (!stationDetailsPanelOpen.value) {
      activeRightPanel.value = "station";
      return;
    }

    closeSidebar();
    return;
  }

  focusedEntranceId.value = undefined;
  ghostResetKey.value += 1;
  activeGhostLine.value = undefined;
  favoriteDashboardSelectorOpen.value = false;
  activeStop.value = stop;
  activeRightPanel.value = "station";
  void loadTransfers(stop);
}

function closeSidebar(options: CloseSidebarOptions = {}): void {
  activeRightPanel.value = undefined;
  focusedEntranceId.value = undefined;

  if (!options.preserveSelection) {
    activeStop.value = undefined;
    activeGhostLine.value = undefined;
    ghostResetKey.value += 1;
  }

  favoriteError.value = "";
  favoriteLoading.value = false;
  favoriteDashboardSelectorOpen.value = false;
  closeGhostLineStationModal();
}

async function toggleTrafficCalendarPanel(): Promise<void> {
  if (activeRightPanel.value === "traffic") {
    activeRightPanel.value = undefined;
    closePatternTrafficCalendar();
    return;
  }

  if (!trafficCalendarOpen.value) {
    togglePatternTrafficCalendar();
  }
  activeRightPanel.value = "traffic";
  await nextTick();
  void hydrateTrafficCalendarTransfers();
}

function closeTrafficCalendarPanel(): void {
  if (activeRightPanel.value === "traffic") {
    activeRightPanel.value = undefined;
  }
  cancelTrafficFocus();
  closePatternTrafficCalendar();
}

async function selectTrafficCalendarDay(day: PatternTrafficCalendarDay): Promise<void> {
  await selectPatternTrafficCalendarDay(day);
}

async function resetTrafficCalendarToday(): Promise<void> {
  await resetPatternTrafficCalendarToday();
}
async function focusTrafficDisruption(entry: PatternTrafficSummaryEntry): Promise<void> {
  const disruptionIds = new Set(entry.disruptionIds);
  const segments = lineTrafficAnalysis.value.segments.filter((segment) =>
    disruptionIds.has(segment.disruption.id),
  );
  const stopIds = getTrafficFocusStopIds(segments);

  if (stopIds.length === 0 || !focusMapOnStops(stopIds)) return;

  const request = ++trafficFocusRequest;
  resetTrafficFocusTimers();
  const cameraDuration = props.reduceMotion ? 0 : TRAFFIC_FOCUS_CAMERA_DURATION_MS;

  await waitForTrafficFocus(cameraDuration + TRAFFIC_FOCUS_PULSE_DELAY_MS);
  if (request !== trafficFocusRequest) return;

  pulseTrafficStops(stopIds, request);
  await waitForTrafficFocus(TRAFFIC_FOCUS_PULSE_REPEAT_DELAY_MS);
  if (request !== trafficFocusRequest) return;

  pulseTrafficStops(stopIds, request);
}

function getTrafficFocusStopIds(segments: typeof lineTrafficAnalysis.value.segments): string[] {
  const ids = new Set<string>();

  segments.forEach((segment) => {
    segment.stationKeys.forEach((stationKey) => ids.add(stationKey));
    segment.edgeKeys.forEach((edgeKey) => {
      const [source, target] = edgeKey.split("--");
      if (source) ids.add(source);
      if (target) ids.add(target);
    });
  });

  return [...ids].filter((id) => stopById.value.has(id));
}

function focusMapOnStops(stopIds: string[]): boolean {
  const canvas = mapCanvas.value;
  const stops = stopIds.flatMap((id) => {
    const stop = stopById.value.get(id);
    return stop ? [stop] : [];
  });
  if (!canvas || stops.length === 0) return false;

  const xValues = stops.map((stop) => toSvgX(stop.x));
  const yValues = stops.map((stop) => toSvgY(stop.y));
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const width = Math.max(96, maxX - minX + 96);
  const height = Math.max(96, maxY - minY + 96);
  const targetZoom = clampZoom(
    Math.min(4, (canvas.clientWidth || 720) / width, (canvas.clientHeight || 520) / height),
  );

  cancelMapMotion();
  requestImmediateMapTileReplacement();
  zoom.value = targetZoom;
  const centerX = ((minX + maxX) / 2) * targetZoom;
  const centerY = ((minY + maxY) / 2) * targetZoom;
  scheduleCanvasScroll(
    canvas,
    centerX - (canvas.clientWidth || 720) / 2,
    centerY - (canvas.clientHeight || 520) / 2,
  );
  return true;
}

function focusEntrances(): void {
  const stop = activeStop.value;
  const center = stop ? getStopGeographicCoordinate(stop) : undefined;
  if (!center) return;

  focusedEntranceId.value = undefined;
  focusGeographicArea(
    center,
    visibleEntrances.value,
    ENTRANCES_OVERVIEW_RADIUS_METERS,
    ENTRANCES_OVERVIEW_RADIUS_METERS,
  );
}

function focusEntrance(entrance: LineMapEntranceView): void {
  if (
    !Number.isFinite(entrance.lon) ||
    !Number.isFinite(entrance.lat) ||
    !focusGeographicArea(entrance, [], ENTRANCE_FOCUS_RADIUS_METERS)
  ) {
    return;
  }

  focusedEntranceId.value = entrance.id;
}

function focusGeographicArea(
  center: { lon: number; lat: number },
  coordinates: Array<{ lon: number; lat: number }>,
  radiusMeters: number,
  maximumCoordinateDistanceMeters?: number,
): boolean {
  const canvas = mapCanvas.value;
  const viewport = lineMap.value?.viewport;
  if (!canvas || !viewport) return false;

  const rect = canvas.getBoundingClientRect();
  const canvasWidth = canvas.clientWidth || rect.width;
  const canvasHeight = canvas.clientHeight || rect.height;
  const plan = createGeographicMapFocusPlan(viewport, {
    center,
    coordinates,
    radiusMeters,
    maximumCoordinateDistanceMeters,
    canvasWidth,
    canvasHeight,
    maximumZoom: maximumZoom.value,
  });
  if (!plan) return false;

  cancelMapMotion();
  requestImmediateMapTileReplacement();
  const nextZoom = clampZoom(plan.zoom);
  zoom.value = nextZoom;
  scheduleCanvasScroll(
    canvas,
    clampCanvasScroll(
      plan.centerX * nextZoom - canvasWidth / 2,
      VIEWBOX_WIDTH * nextZoom,
      canvasWidth,
    ),
    clampCanvasScroll(
      plan.centerY * nextZoom - canvasHeight / 2,
      VIEWBOX_HEIGHT * nextZoom,
      canvasHeight,
    ),
  );
  return true;
}

function getStopGeographicCoordinate(
  stop: LineMapStopView,
): { lon: number; lat: number } | undefined {
  const lon = stop.lon ?? stop.station.lon;
  const lat = stop.lat ?? stop.station.lat;

  return typeof lon === "number" &&
    Number.isFinite(lon) &&
    typeof lat === "number" &&
    Number.isFinite(lat)
    ? { lon, lat }
    : undefined;
}
function pulseTrafficStops(stopIds: string[], request: number): void {
  if (trafficPulseClearTimer !== undefined) {
    window.clearTimeout(trafficPulseClearTimer);
  }
  trafficPulseStopIds.value = new Set(stopIds);
  trafficPulseClearTimer = window.setTimeout(() => {
    if (request === trafficFocusRequest) trafficPulseStopIds.value = new Set();
    trafficPulseClearTimer = undefined;
  }, TRAFFIC_FOCUS_PULSE_DURATION_MS);
}

function waitForTrafficFocus(delay: number): Promise<void> {
  if (delay <= 0 || typeof window === "undefined") return Promise.resolve();

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      trafficFocusWaitTimers.delete(timer);
      resolve();
    }, delay);
    trafficFocusWaitTimers.set(timer, resolve);
  });
}

function resetTrafficFocusTimers(): void {
  trafficFocusWaitTimers.forEach((resolve, timer) => {
    window.clearTimeout(timer);
    resolve();
  });
  trafficFocusWaitTimers.clear();

  if (trafficPulseClearTimer !== undefined) {
    window.clearTimeout(trafficPulseClearTimer);
    trafficPulseClearTimer = undefined;
  }
  trafficPulseStopIds.value = new Set();
}

function cancelTrafficFocus(): void {
  trafficFocusRequest += 1;
  resetTrafficFocusTimers();
}

async function hydrateTrafficCalendarTransfers(): Promise<void> {
  const map = lineMap.value;
  if (!map) return;

  const affectedKeys = new Set(
    trafficCalendarEvents.value.flatMap((event) => [
      ...event.interruptedStationKeys,
      ...event.disturbedStationKeys,
      ...event.fallbackStationKeys,
    ]),
  );
  const queue = map.stops.filter((stop) => affectedKeys.has(stop.id) && !transferStates[stop.id]);
  const workerCount = Math.min(4, queue.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const stop = queue.shift();
        if (stop) await loadTransfers(stop);
      }
    }),
  );
}

function setGhostModeVisibility(visibility: GhostNetworkModeVisibility): void {
  Object.assign(ghostModeVisibility, visibility);
}

function openMobileDisplayModal(): void {
  mobileDisplayOpen.value = true;
}

function closeMobileDisplayModal(): void {
  mobileDisplayOpen.value = false;
}

function handleGhostActiveLineChange(line: NetworkGhostLineView | undefined): void {
  activeGhostLine.value = line;

  if (line) {
    void loadGhostDirections(line);

    if (activeStop.value) {
      void loadGhostFrequency(line, activeStop.value);
    }
  }
}

function selectTransferLineOnMap(transfer: TransferLineOption): void {
  ghostDisplayEnabled.value = true;

  const mode = getNetworkGhostModeKey(transfer);

  if (mode) {
    ghostModeVisibility[mode] = true;
  }

  const line = findGhostLine(transfer);

  if (line) {
    selectGhostLine(line);
    return;
  }

  pendingGhostLineSelection.value = transfer;
  applyPendingGhostLineSelection();
}

function applyPendingGhostLineSelection(): void {
  const transfer = pendingGhostLineSelection.value;
  const line = transfer ? findGhostLine(transfer) : undefined;

  if (!line) return;

  pendingGhostLineSelection.value = undefined;
  selectGhostLine(line);
}

function findGhostLine(transfer: TransferLineOption): NetworkGhostLineView | undefined {
  const lineId = getTransferLineId(transfer);
  const label = normalizeGhostLineIdentity(transfer.label);
  return ghostLines.value.find(
    (line) =>
      line.id === transfer.id ||
      Boolean(lineId && getTransferLineId(line) === lineId) ||
      (normalizeGhostLineIdentity(line.label) === label &&
        (!transfer.family || !line.family || transfer.family === line.family)),
  );
}

function selectGhostLine(line: NetworkGhostLineView): void {
  ghostTapRequest.value = {
    id: ++ghostTapRequestId,
    lineId: line.id,
    mode: "select",
  };
  handleGhostActiveLineChange(line);
}

function openGhostLineStationModal(): void {
  const line = activeGhostLine.value;

  if (!line) {
    return;
  }

  const family = inferGhostLineFamily(line);

  ghostLineStationLine.value = createLineSearchOptionFromGhostLine(line, family);
  ghostLineStationFamily.value = family;
  ghostLineStationStation.value = activeStop.value?.station;
  ghostLineStationModalOpen.value = true;
}

function closeGhostLineStationModal(): void {
  ghostLineStationModalOpen.value = false;
  ghostLineStationLine.value = undefined;
  ghostLineStationFamily.value = undefined;
  ghostLineStationStation.value = undefined;
}

function addGhostLineStationBoard(board: TransitBoardConfig, dashboardId?: string): void {
  addBoardToTransitPreferences(board, transitBoards, dashboardId ?? DEFAULT_TRANSIT_PLACE_ID);
  favoriteConfirmationOpen.value = true;
  closeGhostLineStationModal();
}

function createLineSearchOptionFromGhostLine(
  line: NetworkGhostLineView,
  family: TransitFamily,
): LineSearchOption {
  return {
    family,
    id: line.id,
    label: line.label,
    ref: line.ref ?? line.id,
    navitiaId: line.id,
    color: line.color,
    textColor: line.textColor,
    displayName: line.label,
    iconUrl: line.iconUrl,
    iconUrls: line.iconUrls,
  };
}

function inferGhostLineFamily(line: NetworkGhostLineView): TransitFamily {
  if (line.family) {
    return line.family;
  }

  const identity = normalizeGhostLineIdentity(
    [line.mode, line.label, line.ref, line.id, line.iconUrl].filter(Boolean).join(" "),
  );
  const compactLabel = normalizeGhostLineIdentity(line.label).replace(/[\s_-]+/gu, "");

  if (identity.includes("noctilien") || /^n\d{1,3}[a-z]?$/u.test(compactLabel)) {
    return "NOCTILIEN";
  }

  if (identity.includes("metro")) {
    return "METRO";
  }

  if (identity.includes("tram")) {
    return "TRAM";
  }

  if (identity.includes("rer")) {
    return "RER";
  }

  if (identity.includes("train") || identity.includes("transilien")) {
    return "TRANSILIEN";
  }

  if (identity.includes("cable")) {
    return "CABLE";
  }

  return "BUS";
}

function normalizeGhostLineIdentity(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function beginGhostTap(line: NetworkGhostLineView, event: PointerEvent): void {
  if (event.button !== 0 || mapPinch.active) {
    return;
  }

  pendingGhostTap.value = {
    pointerId: event.pointerId,
    lineId: line.id,
  };
}

async function loadGhostDirections(line: NetworkGhostLineView): Promise<void> {
  if (ghostDirectionStates[line.id]) {
    return;
  }

  ghostDirectionStates[line.id] = {
    loading: true,
    directions: [],
  };

  try {
    const result = await loadTransferLineDirections(line.id);

    ghostDirectionStates[line.id] = {
      loading: false,
      directions: result.directions,
    };
  } catch {
    ghostDirectionStates[line.id] = {
      loading: false,
      directions: [],
      error: true,
    };
  }
}

async function loadGhostFrequency(
  line: NetworkGhostLineView,
  stop: LineMapStopView,
): Promise<void> {
  const key = createGhostFrequencyKey(line.id, stop);

  if (ghostFrequencyStates[key]) {
    return;
  }

  ghostFrequencyStates[key] = {
    loading: true,
  };

  try {
    ghostFrequencyStates[key] = {
      loading: false,
      profile: await loadTransferLineFrequency(line.id, stop.station),
    };
  } catch {
    ghostFrequencyStates[key] = {
      loading: false,
      error: true,
    };
  }
}

function createGhostFrequencyKey(lineId: string, stop: LineMapStopView): string {
  return `${lineId}:${stop.station.scheduleStopAreaRef ?? stop.station.id}`;
}

async function loadTransfers(stop: LineMapStopView): Promise<void> {
  if (transferStates[stop.id]) {
    return;
  }

  transferStates[stop.id] = {
    loading: true,
    lines: [],
  };

  try {
    const lines = await loadStationTransfers(stop.station, props.line?.id);

    transferStates[stop.id] = {
      loading: false,
      lines,
    };

    if (props.gtfsLineGeometryEnabled) {
      const lineIds = [
        ...new Set(lines.flatMap((line) => getTransferLineId(line) ?? [])),
      ];
      if (lineIds.length) {
        void preloadGtfsLineArtifacts(lineIds)
          .then((result) => {
            if (result.availableLineIds.length > 0) {
              console.info(
                `[line-map] GTFS station preload available=${result.availableLineIds.length} missing=${result.missingLineIds.length}`,
              );
            }
          })
          .catch(() => undefined);
      }
    }
  } catch {
    transferStates[stop.id] = {
      loading: false,
      lines: [],
      error: "Correspondances indisponibles",
    };
  }
}

function clearTransferStates(): void {
  Object.keys(transferStates).forEach((key) => {
    delete transferStates[key];
  });
}

function resolveFavoriteDashboardId(requestedId?: string): string {
  if (typeof window === "undefined") {
    return DEFAULT_TRANSIT_PLACE_ID;
  }

  return resolveTransitPlaceId(
    loadTransitPresetState(transitBoards),
    requestedId ?? favoriteDashboardId.value,
  );
}

function openActiveStopFavoriteSelector(): void {
  if (!activeStop.value || !props.line || favoriteLoading.value) {
    return;
  }

  favoriteDashboardId.value = resolveFavoriteDashboardId();
  favoriteError.value = "";
  favoriteDashboardSelectorOpen.value = true;
}

function closeActiveStopFavoriteSelector(): void {
  if (favoriteLoading.value) {
    return;
  }

  favoriteDashboardSelectorOpen.value = false;
  favoriteError.value = "";
}

function clearFavoriteAlertTimeout(): void {
  if (favoriteAlertTimeout !== undefined) {
    window.clearTimeout(favoriteAlertTimeout);
    favoriteAlertTimeout = undefined;
  }
}

function showFavoriteDashboardAlert(placeId: string): void {
  const state = loadTransitPresetState(transitBoards);
  const place = getTransitPlaceById(state, placeId);

  favoriteDashboardAlertLabel.value = place ? localizeTransitPlace(place).label : "";
  favoriteDashboardAlertOpen.value = true;
  favoriteAlertProgressKey.value += 1;
  clearFavoriteAlertTimeout();
  favoriteAlertTimeout = window.setTimeout(() => {
    hideFavoriteDashboardAlert();
  }, 5000);
}

function hideFavoriteDashboardAlert(): void {
  clearFavoriteAlertTimeout();
  favoriteDashboardAlertOpen.value = false;
  favoriteUndoSnapshot.value = undefined;
}

function undoLastFavoriteAdd(): void {
  const snapshot = favoriteUndoSnapshot.value;

  if (!snapshot) {
    hideFavoriteDashboardAlert();
    return;
  }

  const state = loadTransitPresetState(transitBoards);
  saveTransitPresetState(
    updateTransitPlacePreferences(state, snapshot.placeId, snapshot.preferences),
  );
  hideFavoriteDashboardAlert();
}

async function confirmActiveStopFavoriteDashboard(): Promise<void> {
  const line = props.line;
  const stop = activeStop.value;

  if (!line || !stop || favoriteLoading.value) {
    return;
  }

  favoriteLoading.value = true;
  favoriteError.value = "";

  try {
    const stateBeforeAdd = loadTransitPresetState(transitBoards);
    const dashboardId = resolveTransitPlaceId(stateBeforeAdd, favoriteDashboardId.value);
    const placeBeforeAdd = getTransitPlaceById(stateBeforeAdd, dashboardId);
    const directionGroups = await fetchDirectionGroupsForStation(line, stop.station);
    const board = createBoardFromDraft(
      {
        family: line.family,
        line,
        station: stop.station,
      },
      directionGroups,
    );

    if (placeBeforeAdd) {
      favoriteUndoSnapshot.value = {
        placeId: dashboardId,
        preferences: cloneTransitBoardPreferences(placeBeforeAdd.preferences),
      };
    } else {
      favoriteUndoSnapshot.value = undefined;
    }

    addBoardToTransitPreferences(board, transitBoards, dashboardId);
    favoriteDashboardId.value = dashboardId;
    favoriteDashboardSelectorOpen.value = false;
    showFavoriteDashboardAlert(dashboardId);
  } catch {
    favoriteError.value = t("lineMap.picker.addFavoriteFailed");
  } finally {
    favoriteLoading.value = false;
  }
}

onBeforeUnmount(() => {
  mapPerformanceProbe?.dispose();
  if (mapPerformanceScrollTimer !== undefined) {
    window.clearTimeout(mapPerformanceScrollTimer);
  }
  clearFavoriteAlertTimeout();
  cancelMapMotion();
  cancelPendingMapTileReplacement();
  cancelVisibleMapTileWindowUpdate();
  cancelTrafficFocus();
});

function openActiveGhostLineMap(): void {
  const line = activeGhostLine.value;
  if (!line) return;

  const lineId = getTransferLineId(line) ?? line.ref ?? line.id ?? line.label;
  const transportType = getLineTransportType(line.family);
  void navigateTo({
    path: `/line/${encodeURIComponent(transportType)}/${encodeURIComponent(lineId)}`,
    query: { view: "map" },
  });
}

function getLineTransportType(family?: TransitFamily): string {
  if (family === "METRO") return "metro";
  if (family === "RER") return "rer";
  if (family === "TRAM") return "tram";
  if (family === "NOCTILIEN") return "noctilien";
  if (family === "CABLE") return "cable";
  if (family === "TRANSILIEN") return "transilien";
  return "bus";
}

function openActiveStopInGoogleMaps(): void {
  const stop = activeStop.value;

  if (!stop) {
    return;
  }

  const lon = stop.lon ?? stop.station.lon;
  const lat = stop.lat ?? stop.station.lat;
  const query =
    typeof lon === "number" && typeof lat === "number"
      ? `${lat},${lon}`
      : [stop.label, stop.city].filter(Boolean).join(", ");
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

  window.open(url, "_blank", "noopener,noreferrer");
}

function getSegmentStop(
  segment: LineMapSegmentView,
  side: "from" | "to",
): LineMapStopView | undefined {
  return stopById.value.get(side === "from" ? segment.fromStopId : segment.toStopId);
}

function getSegmentX(segment: LineMapSegmentView, side: "from" | "to"): number {
  return toSvgX(getSegmentStop(segment, side)?.x ?? 0);
}

function getSegmentY(segment: LineMapSegmentView, side: "from" | "to"): number {
  return toSvgY(getSegmentStop(segment, side)?.y ?? 0);
}

function getSegmentPath(segment: LineMapSegmentView): string {
  const points = segment.polyline?.length
    ? segment.polyline.map((point) => ({
        x: toSvgX(point.x),
        y: toSvgY(point.y),
      }))
    : [
        { x: getSegmentX(segment, "from"), y: getSegmentY(segment, "from") },
        { x: getSegmentX(segment, "to"), y: getSegmentY(segment, "to") },
      ];
  return buildRoundedPolylinePath(points, createScreenSpaceRoundedPolylineOptions(zoom.value)).path;
}

function toSvgX(value: number): number {
  return SVG_PADDING_X + value * (VIEWBOX_WIDTH - SVG_PADDING_X * 2);
}

function toSvgY(value: number): number {
  return SVG_PADDING_Y + value * (VIEWBOX_HEIGHT - SVG_PADDING_Y * 2);
}

function scheduleMapTileReplacement(tiles: MapTile[], immediate = false): void {
  const requestedSignature = getMapTileSignature(tiles);
  if (requestedSignature === getMapTileSignature(renderedMapTiles.value)) return;

  const request = ++mapTileLoadRequest;
  if (mapTileLoadDebounceTimer !== undefined && typeof window !== "undefined") {
    window.clearTimeout(mapTileLoadDebounceTimer);
  }

  if (tiles.length === 0 || typeof window === "undefined" || typeof window.Image === "undefined") {
    renderedMapTiles.value = tiles;
    return;
  }

  mapTileLoadDebounceTimer = window.setTimeout(
    async () => {
      mapTileLoadDebounceTimer = undefined;
      const visibleTiles = tiles.filter((tile) => tile.priority !== "overscan");
      const loaded = await Promise.all(visibleTiles.map((tile) => preloadMapTile(tile.url)));

      if (request === mapTileLoadRequest && loaded.every(Boolean)) {
        renderedMapTiles.value = tiles;
      }
    },
    immediate ? 0 : MAP_TILE_LOAD_DEBOUNCE_MS,
  );
}

function preloadMapTile(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new window.Image();
    let settled = false;
    let decodeStarted = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve(loaded);
    };
    const decode = () => {
      if (decodeStarted) return;
      decodeStarted = true;

      if (typeof image.decode !== "function") {
        finish(true);
        return;
      }

      void image.decode().then(
        () => finish(true),
        () => finish(false),
      );
    };
    const timeout = window.setTimeout(() => finish(false), MAP_TILE_LOAD_TIMEOUT_MS);

    image.decoding = "async";
    image.onload = decode;
    image.onerror = () => finish(false);
    image.src = url;

    if (image.complete && image.naturalWidth > 0) decode();
  });
}

function getMapTileSignature(tiles: MapTile[]): string {
  return tiles
    .map(
      (tile) => `${tile.id}:${tile.url}:${tile.priority}:${tile.x.toFixed(3)}:${tile.y.toFixed(3)}`,
    )
    .join("|");
}

function cancelPendingMapTileReplacement(): void {
  mapTileLoadRequest += 1;
  nextMapTileReplacementImmediate = false;
  if (mapTileLoadDebounceTimer !== undefined && typeof window !== "undefined") {
    window.clearTimeout(mapTileLoadDebounceTimer);
  }
  mapTileLoadDebounceTimer = undefined;
}

function requestImmediateMapTileReplacement(): void {
  nextMapTileReplacementImmediate = true;
}

function scheduleVisibleMapTileWindowUpdate(): void {
  if (typeof window === "undefined" || mapTileWindowAnimationFrame !== undefined) return;

  mapTileWindowAnimationFrame = window.requestAnimationFrame(() => {
    mapTileWindowAnimationFrame = undefined;
    updateVisibleMapTileWindow();
  });
}

function handleMapCanvasScroll(): void {
  if (liveZoomActive) return;
  scheduleVisibleMapTileWindowUpdate();
  if (!mapPerformanceProbe || isMapMoving.value) return;

  mapPerformanceProbe.start();
  if (mapPerformanceScrollTimer !== undefined) {
    window.clearTimeout(mapPerformanceScrollTimer);
  }
  mapPerformanceScrollTimer = window.setTimeout(() => {
    mapPerformanceScrollTimer = undefined;
    recordMapPerformance();
  }, 120);
}

function cancelVisibleMapTileWindowUpdate(): void {
  if (mapTileWindowAnimationFrame !== undefined && typeof window !== "undefined") {
    window.cancelAnimationFrame(mapTileWindowAnimationFrame);
  }
  mapTileWindowAnimationFrame = undefined;
}
function updateVisibleMapTileWindow(): void {
  const canvas = mapCanvas.value;
  if (!canvas || zoom.value <= 0) return;

  const rect = canvas.getBoundingClientRect();
  const viewportWidth = canvas.clientWidth || rect.width;
  const viewportHeight = canvas.clientHeight || rect.height;
  if (viewportWidth <= 0 || viewportHeight <= 0) return;

  const innerWidth = VIEWBOX_WIDTH - SVG_PADDING_X * 2;
  const innerHeight = VIEWBOX_HEIGHT - SVG_PADDING_Y * 2;
  const scrollLeftCss = getCurrentCanvasScrollLeft(canvas);
  const scrollTopCss = getCurrentCanvasScrollTop(canvas);
  const scrollLeft = scrollLeftCss / zoom.value;
  const scrollTop = scrollTopCss / zoom.value;
  ghostViewportRect.value = {
    x: scrollLeftCss,
    y: scrollTopCss,
    width: viewportWidth,
    height: viewportHeight,
  };
  const round = (value: number) => Number(value.toFixed(4));
  const next = {
    minX: round((scrollLeft - SVG_PADDING_X) / innerWidth),
    maxX: round((scrollLeft + viewportWidth / zoom.value - SVG_PADDING_X) / innerWidth),
    minY: round((scrollTop - SVG_PADDING_Y) / innerHeight),
    maxY: round((scrollTop + viewportHeight / zoom.value - SVG_PADDING_Y) / innerHeight),
  };
  const current = mapTileWindow.value;

  if (
    next.minX !== current.minX ||
    next.maxX !== current.maxX ||
    next.minY !== current.minY ||
    next.maxY !== current.maxY
  ) {
    mapTileWindow.value = next;
  }
}

function toScreenX(value: number): number {
  return toSvgX(value) * zoom.value;
}

function toScreenY(value: number): number {
  return toSvgY(value) * zoom.value;
}

function shouldShowLabel(stop: LineMapStopView): boolean {
  return visibleLabelIds.value.has(stop.id);
}

function getLabelAnchor(stop: LineMapStopView): "middle" | "start" | "end" {
  const offset = getLabelOffset(stop);

  if (offset.x < 0) {
    return "end";
  }

  if (Math.abs(offset.x) < 4) {
    return "middle";
  }

  return "start";
}

function getLabelX(stop: LineMapStopView, index: number): number {
  return toSvgX(stop.x) + getLabelOffset(stop, index).x / zoom.value;
}

function getLabelY(stop: LineMapStopView, index: number): number {
  return toSvgY(stop.y) + getLabelOffset(stop, index).y / zoom.value;
}

function getLabelOffset(
  stop: LineMapStopView,
  index = lineMap.value?.stops.findIndex((item) => item.id === stop.id) ?? 0,
): { x: number; y: number } {
  if (
    props.selectedStationId === stop.id ||
    hoveredStop.value?.id === stop.id ||
    activeStop.value?.id === stop.id
  ) {
    return { x: 18, y: -18 };
  }

  const offsets = [
    { x: 18, y: -16 },
    { x: -18, y: 18 },
    { x: 18, y: 22 },
    { x: -18, y: -16 },
    { x: 0, y: -24 },
    { x: 0, y: 30 },
  ];

  return offsets[index % offsets.length];
}

function getSegmentTrafficImpact(segment: LineMapSegmentView): PatternTrafficImpact | undefined {
  return lineTrafficAnalysis.value.edgeImpacts[
    getPatternTrafficEdgeKey({
      source: segment.fromStopId,
      target: segment.toStopId,
    })
  ];
}

function getStopTrafficImpact(stop: LineMapStopView): PatternTrafficImpact | undefined {
  return lineTrafficAnalysis.value.stationImpacts[stop.id];
}

function getSegmentTrafficClass(segment: LineMapSegmentView) {
  const impact = getSegmentTrafficImpact(segment);

  return {
    "line-map-segment--traffic": Boolean(impact),
    "line-map-segment--traffic-interruption": impact?.kind === "interruption",
    "line-map-segment--traffic-disturbance": impact?.kind === "disturbance",
  };
}

function getStopTrafficClass(stop: LineMapStopView) {
  const impact = getStopTrafficImpact(stop);

  return {
    "line-map-stop--traffic-interruption": impact?.kind === "interruption",
    "line-map-stop--traffic-disturbance": impact?.kind === "disturbance",
  };
}

function getLineStyle(segment?: LineMapSegmentView) {
  const color = lineMap.value?.lineColor ?? props.line?.color ?? "#0064ff";
  const impact = segment ? getSegmentTrafficImpact(segment) : undefined;

  if (impact?.kind === "interruption") {
    return {
      stroke: TRAFFIC_INTERRUPTION_COLOR,
      strokeOpacity: 0.42,
    };
  }

  if (impact?.kind === "disturbance") {
    return {
      stroke: TRAFFIC_DISTURBANCE_COLOR,
    };
  }

  return {
    stroke: color,
  };
}

function getStopStyle(stop: LineMapStopView) {
  const color = lineMap.value?.lineColor ?? props.line?.color ?? "#0064ff";
  const isActive = stop.id === activeStop.value?.id;
  const isSelected = stop.id === props.selectedStationId || isActive;
  const impact = getStopTrafficImpact(stop);

  if (impact?.kind === "interruption") {
    return {
      fill: "rgba(255, 255, 255, 0.64)",
      stroke: TRAFFIC_INTERRUPTION_COLOR,
      strokeWidth: `${stopStrokeWidth.value}px`,
    };
  }

  if (impact?.kind === "disturbance") {
    return {
      fill: isSelected ? TRAFFIC_DISTURBANCE_COLOR : "#ffffff",
      stroke: isActive ? "#ffffff" : TRAFFIC_DISTURBANCE_COLOR,
      strokeWidth: `${stopStrokeWidth.value}px`,
    };
  }

  return {
    fill: isSelected ? color : "#ffffff",
    stroke: isActive ? "#ffffff" : color,
    strokeWidth: `${stopStrokeWidth.value}px`,
  };
}

function getLabelStyle() {
  return {
    fontSize: `${12.5 / zoom.value}px`,
    strokeWidth: `${5 / zoom.value}px`,
  };
}

function getActiveLabelBackground(stop: LineMapStopView, index: number) {
  const paddingX = 8 / zoom.value;
  const height = 24 / zoom.value;
  const width = Math.max(42, stop.label.length * 7.2) / zoom.value + paddingX * 2;
  const labelX = getLabelX(stop, index);
  const anchor = getLabelAnchor(stop);

  return {
    x:
      anchor === "end"
        ? labelX - width
        : anchor === "middle"
          ? labelX - width / 2
          : labelX - paddingX,
    y: getLabelY(stop, index) - 17 / zoom.value,
    width,
    height,
    rx: height / 2,
  };
}

function getHitTargetStyle(stop: LineMapStopView) {
  return {
    height: "var(--line-map-hit-target-size, 34px)",
    left: `${toScreenX(stop.x)}px`,
    top: `${toScreenY(stop.y)}px`,
    width: "var(--line-map-hit-target-size, 34px)",
  };
}

function getStopActionLabel(stop: LineMapStopView): string {
  return canSelectStops.value
    ? t("lineMap.picker.selectStopAria", { stop: stop.label })
    : t("lineMap.picker.showStopAria", { stop: stop.label });
}

function adjustZoom(direction: number): void {
  const factor = direction > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;

  cancelMapMotion();
  requestImmediateMapTileReplacement();
  zoomAtCanvasCenter(clampZoom(zoom.value * factor));
}

function zoomAtCanvasPointByFactor(factor: number, clientX: number, clientY: number): void {
  previewZoomAtCanvasPointToZoom(
    clampZoom(getCurrentVisualZoom() * factor),
    clientX,
    clientY,
  );
}

function zoomAtCanvasCenter(nextZoom: number): void {
  const canvas = mapCanvas.value;

  if (!canvas) {
    zoom.value = nextZoom;
    return;
  }

  const rect = canvas.getBoundingClientRect();

  zoomAtCanvasPointToZoom(nextZoom, rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function zoomAtCanvasPointToZoom(nextZoom: number, clientX: number, clientY: number): void {
  if (liveZoomActive) commitLiveZoom();
  const canvas = mapCanvas.value;

  if (!canvas) {
    zoom.value = nextZoom;
    return;
  }

  const previousZoom = zoom.value;
  if (nextZoom === previousZoom) return;

  const rect = canvas.getBoundingClientRect();
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const anchorX = localX + getCurrentCanvasScrollLeft(canvas);
  const anchorY = localY + getCurrentCanvasScrollTop(canvas);
  const ratio = nextZoom / previousZoom;

  zoom.value = nextZoom;
  scheduleCanvasScroll(
    canvas,
    clampCanvasScroll(
      anchorX * ratio - localX,
      VIEWBOX_WIDTH * nextZoom,
      canvas.clientWidth || rect.width,
    ),
    clampCanvasScroll(
      anchorY * ratio - localY,
      VIEWBOX_HEIGHT * nextZoom,
      canvas.clientHeight || rect.height,
    ),
  );
}

function previewZoomAtCanvasPointToZoom(
  nextZoom: number,
  clientX: number,
  clientY: number,
): void {
  const canvas = mapCanvas.value;
  const world = mapWorld.value;
  const scene = mapScene.value;
  if (!canvas || !world || !scene) {
    zoomAtCanvasPointToZoom(nextZoom, clientX, clientY);
    return;
  }

  const previousZoom = getCurrentVisualZoom();
  if (nextZoom === previousZoom) return;

  const rect = canvas.getBoundingClientRect();
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const anchorX = localX + getCurrentCanvasScrollLeft(canvas);
  const anchorY = localY + getCurrentCanvasScrollTop(canvas);
  const ratio = nextZoom / previousZoom;
  const nextScrollLeft = clampCanvasScroll(
    anchorX * ratio - localX,
    VIEWBOX_WIDTH * nextZoom,
    canvas.clientWidth || rect.width,
  );
  const nextScrollTop = clampCanvasScroll(
    anchorY * ratio - localY,
    VIEWBOX_HEIGHT * nextZoom,
    canvas.clientHeight || rect.height,
  );

  cancelPendingZoomScroll();
  liveZoom = nextZoom;
  liveZoomActive = true;
  world.style.width = `${VIEWBOX_WIDTH * nextZoom}px`;
  world.style.height = `${VIEWBOX_HEIGHT * nextZoom}px`;
  scene.style.transform = `translateZ(0) scale(${nextZoom / zoom.value})`;
  canvas.scrollLeft = nextScrollLeft;
  canvas.scrollTop = nextScrollTop;
}

function commitLiveZoom(): void {
  if (!liveZoomActive) return;

  const nextZoom = liveZoom;
  liveZoomActive = false;
  zoom.value = nextZoom;
  void nextTick(() => {
    resetLiveZoomComposite(nextZoom);
    scheduleVisibleMapTileWindowUpdate();
  });
}

function resetLiveZoomComposite(nextZoom = zoom.value): void {
  if (liveZoomActive) return;
  if (mapWorld.value) {
    mapWorld.value.style.width = `${VIEWBOX_WIDTH * nextZoom}px`;
    mapWorld.value.style.height = `${VIEWBOX_HEIGHT * nextZoom}px`;
  }
  if (mapScene.value) {
    mapScene.value.style.transform = "";
  }
}

function getCurrentVisualZoom(): number {
  return liveZoomActive ? liveZoom : zoom.value;
}

function panCanvasByViewportDelta(deltaX: number, deltaY: number): void {
  const canvas = mapCanvas.value;

  if (!canvas || (deltaX === 0 && deltaY === 0)) return;

  const rect = canvas.getBoundingClientRect();
  const nextScrollLeft = clampCanvasScroll(
    getCurrentCanvasScrollLeft(canvas) - deltaX,
    VIEWBOX_WIDTH * getCurrentVisualZoom(),
    canvas.clientWidth || rect.width,
  );
  const nextScrollTop = clampCanvasScroll(
    getCurrentCanvasScrollTop(canvas) - deltaY,
    VIEWBOX_HEIGHT * getCurrentVisualZoom(),
    canvas.clientHeight || rect.height,
  );

  if (liveZoomActive || mapPinch.active) {
    cancelPendingZoomScroll();
    canvas.scrollLeft = nextScrollLeft;
    canvas.scrollTop = nextScrollTop;
    return;
  }

  scheduleCanvasScroll(canvas, nextScrollLeft, nextScrollTop);
}

function getCurrentCanvasScrollLeft(canvas: HTMLDivElement): number {
  return pendingZoomScrollLeft ?? canvas.scrollLeft;
}

function getCurrentCanvasScrollTop(canvas: HTMLDivElement): number {
  return pendingZoomScrollTop ?? canvas.scrollTop;
}

function clampCanvasScroll(value: number, contentSize: number, viewportSize: number): number {
  const maxScroll = Math.max(0, contentSize - viewportSize);

  return Math.max(0, Math.min(maxScroll, value));
}

function scheduleCanvasScroll(canvas: HTMLDivElement, scrollLeft: number, scrollTop: number): void {
  pendingZoomScrollLeft = scrollLeft;
  pendingZoomScrollTop = scrollTop;

  if (zoomScrollUpdateScheduled) return;

  zoomScrollUpdateScheduled = true;
  const updateId = zoomScrollUpdateId;
  void nextTick(() => {
    if (updateId !== zoomScrollUpdateId) return;

    zoomScrollUpdateScheduled = false;
    const nextScrollLeft = pendingZoomScrollLeft;
    const nextScrollTop = pendingZoomScrollTop;

    pendingZoomScrollLeft = undefined;
    pendingZoomScrollTop = undefined;

    if (nextScrollLeft !== undefined) canvas.scrollLeft = nextScrollLeft;
    if (nextScrollTop !== undefined) canvas.scrollTop = nextScrollTop;
    scheduleVisibleMapTileWindowUpdate();
  });
}

function cancelPendingZoomScroll(): void {
  zoomScrollUpdateId += 1;
  zoomScrollUpdateScheduled = false;
  pendingZoomScrollLeft = undefined;
  pendingZoomScrollTop = undefined;
}

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(maximumZoom.value, value));
}

function handleCanvasWheel(event: WheelEvent): void {
  if (!lineMap.value) return;

  event.preventDefault();
  cancelPanInertia();
  wheelZoomClientX = event.clientX;
  wheelZoomClientY = event.clientY;
  wheelZoomTarget = clampZoom(
    (wheelZoomTarget ?? getCurrentVisualZoom()) *
      Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY),
  );

  if (props.reduceMotion) {
    const target = wheelZoomTarget;
    cancelSmoothWheelZoom();
    zoomAtCanvasPointToZoom(target, event.clientX, event.clientY);
    requestImmediateMapTileReplacement();
    return;
  }

  startSmoothWheelZoom();
}

function startSmoothWheelZoom(): void {
  if (wheelZoomAnimationFrame !== undefined || typeof window === "undefined") return;

  mapMotionActive.value = true;
  const step = () => {
    wheelZoomAnimationFrame = undefined;
    const target = wheelZoomTarget;
    if (target === undefined) {
      syncMapMotionState();
      return;
    }

    const currentZoom = getCurrentVisualZoom();
    const difference = target - currentZoom;
    const finished = Math.abs(difference) <= WHEEL_ZOOM_EPSILON;
    previewZoomAtCanvasPointToZoom(
      finished ? target : clampZoom(currentZoom + difference * WHEEL_ZOOM_EASING),
      wheelZoomClientX,
      wheelZoomClientY,
    );

    if (finished) {
      requestImmediateMapTileReplacement();
      commitLiveZoom();
      wheelZoomTarget = undefined;
      syncMapMotionState();
      return;
    }

    wheelZoomAnimationFrame = window.requestAnimationFrame(step);
  };

  wheelZoomAnimationFrame = window.requestAnimationFrame(step);
}

function cancelSmoothWheelZoom(): void {
  if (wheelZoomAnimationFrame !== undefined && typeof window !== "undefined") {
    window.cancelAnimationFrame(wheelZoomAnimationFrame);
  }
  wheelZoomAnimationFrame = undefined;
  wheelZoomTarget = undefined;
  commitLiveZoom();
  syncMapMotionState();
}

function startMapDrag(event: PointerEvent): void {
  if (mapPinch.active || event.button !== 0 || !mapCanvas.value) return;

  cancelMapMotion();
  mapDrag.active = true;
  mapDrag.dragging = false;
  mapDrag.pointerId = event.pointerId;
  mapDrag.scrollLeft = mapCanvas.value.scrollLeft;
  mapDrag.scrollTop = mapCanvas.value.scrollTop;
  mapDrag.startX = event.clientX;
  mapDrag.startY = event.clientY;
  mapDrag.lastX = event.clientX;
  mapDrag.lastY = event.clientY;
  mapDrag.lastTime = getPointerTimestamp(event);
  mapDrag.velocityX = 0;
  mapDrag.velocityY = 0;
  mapCanvas.value.setPointerCapture(event.pointerId);
}

function moveMapDrag(event: PointerEvent): void {
  const canvas = mapCanvas.value;
  if (mapPinch.active || !mapDrag.active || event.pointerId !== mapDrag.pointerId || !canvas) {
    return;
  }

  const deltaX = event.clientX - mapDrag.startX;
  const deltaY = event.clientY - mapDrag.startY;
  const timestamp = getPointerTimestamp(event);
  const elapsed = Math.max(1, timestamp - mapDrag.lastTime);
  const instantaneousVelocityX = -(event.clientX - mapDrag.lastX) / elapsed;
  const instantaneousVelocityY = -(event.clientY - mapDrag.lastY) / elapsed;

  mapDrag.lastX = event.clientX;
  mapDrag.lastY = event.clientY;
  mapDrag.lastTime = timestamp;

  if (!mapDrag.dragging && Math.hypot(deltaX, deltaY) < 4) return;

  mapDrag.velocityX = mapDrag.dragging
    ? mapDrag.velocityX * 0.62 + instantaneousVelocityX * 0.38
    : instantaneousVelocityX;
  mapDrag.velocityY = mapDrag.dragging
    ? mapDrag.velocityY * 0.62 + instantaneousVelocityY * 0.38
    : instantaneousVelocityY;
  mapDrag.dragging = true;
  canvas.scrollLeft = mapDrag.scrollLeft - deltaX;
  canvas.scrollTop = mapDrag.scrollTop - deltaY;
  scheduleVisibleMapTileWindowUpdate();
}

function stopMapDrag(event?: PointerEvent): void {
  const wasDragging = mapDrag.dragging;
  const pointerId = event?.pointerId ?? mapDrag.pointerId;
  const velocityX = mapDrag.velocityX;
  const velocityY = mapDrag.velocityY;

  if (pointerId >= 0 && mapCanvas.value?.hasPointerCapture(pointerId)) {
    mapCanvas.value.releasePointerCapture(pointerId);
  }

  mapDrag.active = false;
  mapDrag.dragging = false;
  mapDrag.pointerId = -1;
  mapDrag.velocityX = 0;
  mapDrag.velocityY = 0;

  completeStopTap(event, wasDragging);
  completeGhostTap(event, wasDragging);

  if (wasDragging) {
    suppressNextCanvasClick.value = true;
    if (event?.type === "pointerup") startPanInertia(velocityX, velocityY);
  }
}

function startPanInertia(initialVelocityX: number, initialVelocityY: number): void {
  const canvas = mapCanvas.value;
  const initialSpeed = Math.hypot(initialVelocityX, initialVelocityY);
  if (props.reduceMotion || !canvas || initialSpeed < PAN_INERTIA_MIN_VELOCITY) return;

  cancelPanInertia();
  const velocityScale = Math.min(1, PAN_INERTIA_MAX_VELOCITY / initialSpeed);
  let velocityX = initialVelocityX * velocityScale;
  let velocityY = initialVelocityY * velocityScale;
  panInertiaLastTime = 0;
  mapMotionActive.value = true;

  const step = (timestamp: number) => {
    panInertiaAnimationFrame = undefined;
    const elapsed = panInertiaLastTime
      ? Math.min(32, Math.max(1, timestamp - panInertiaLastTime))
      : 16;
    panInertiaLastTime = timestamp;
    const rect = canvas.getBoundingClientRect();
    const viewportWidth = canvas.clientWidth || rect.width;
    const viewportHeight = canvas.clientHeight || rect.height;
    const requestedLeft = canvas.scrollLeft + velocityX * elapsed;
    const requestedTop = canvas.scrollTop + velocityY * elapsed;
    const nextLeft = clampCanvasScroll(requestedLeft, VIEWBOX_WIDTH * zoom.value, viewportWidth);
    const nextTop = clampCanvasScroll(requestedTop, VIEWBOX_HEIGHT * zoom.value, viewportHeight);

    canvas.scrollLeft = nextLeft;
    canvas.scrollTop = nextTop;
    if (nextLeft !== requestedLeft) velocityX = 0;
    if (nextTop !== requestedTop) velocityY = 0;

    const friction = Math.exp(-PAN_INERTIA_FRICTION * elapsed);
    velocityX *= friction;
    velocityY *= friction;
    scheduleVisibleMapTileWindowUpdate();

    if (Math.hypot(velocityX, velocityY) < PAN_INERTIA_MIN_VELOCITY) {
      panInertiaLastTime = 0;
      requestImmediateMapTileReplacement();
      syncMapMotionState();
      return;
    }

    panInertiaAnimationFrame = window.requestAnimationFrame(step);
  };

  panInertiaAnimationFrame = window.requestAnimationFrame(step);
}

function cancelPanInertia(): void {
  if (panInertiaAnimationFrame !== undefined && typeof window !== "undefined") {
    window.cancelAnimationFrame(panInertiaAnimationFrame);
  }
  panInertiaAnimationFrame = undefined;
  panInertiaLastTime = 0;
  syncMapMotionState();
}

function cancelMapMotion(): void {
  cancelSmoothWheelZoom();
  cancelPanInertia();
  cancelPendingZoomScroll();
}

function syncMapMotionState(): void {
  mapMotionActive.value =
    wheelZoomAnimationFrame !== undefined || panInertiaAnimationFrame !== undefined;
}

function getPointerTimestamp(event: PointerEvent): number {
  return event.timeStamp > 0
    ? event.timeStamp
    : typeof performance === "undefined"
      ? Date.now()
      : performance.now();
}
function completeGhostTap(event: PointerEvent | undefined, wasDragging: boolean): void {
  const pendingTap = pendingGhostTap.value;

  if (!event || !pendingTap) {
    if (event?.type === "pointercancel") {
      pendingGhostTap.value = undefined;
    }
    return;
  }

  if (pendingTap.pointerId !== event.pointerId) {
    return;
  }

  pendingGhostTap.value = undefined;

  if (event.type !== "pointerup") {
    return;
  }

  ghostGestureClickGuard.value = { handledAt: Date.now() };

  if (wasDragging || mapPinch.active) {
    return;
  }

  ghostTapRequest.value = {
    id: ++ghostTapRequestId,
    lineId: pendingTap.lineId,
    mode: "toggle",
  };
}

function completeStopTap(event: PointerEvent | undefined, wasDragging: boolean): void {
  const pendingTap = pendingStopTap.value;

  if (!event || event.type !== "pointerup" || !pendingTap) {
    if (event?.type === "pointercancel") {
      pendingStopTap.value = undefined;
    }
    return;
  }

  if (pendingTap.pointerId !== event.pointerId) {
    return;
  }

  pendingStopTap.value = undefined;

  if (wasDragging || mapPinch.active) {
    return;
  }

  touchStopClickGuard.value = {
    stopId: pendingTap.stop.id,
    handledAt: Date.now(),
  };
  selectStop(pendingTap.stop);
}

function handleCanvasTouchStart(event: TouchEvent): void {
  if (event.touches.length !== 2) {
    return;
  }

  const distance = getTouchDistance(event.touches);
  const center = getTouchCenter(event.touches);
  if (!distance || !center) {
    return;
  }

  event.preventDefault();
  cancelMapMotion();
  stopMapDrag();
  pendingStopTap.value = undefined;
  pendingGhostTap.value = undefined;
  mapPinch.active = true;
  mapPinch.centerX = center.x;
  mapPinch.centerY = center.y;
  mapPinch.distance = distance;
}

function handleCanvasTouchMove(event: TouchEvent): void {
  if (!mapPinch.active || event.touches.length !== 2) {
    return;
  }

  const distance = getTouchDistance(event.touches);
  const center = getTouchCenter(event.touches);

  if (!distance || !center || mapPinch.distance <= 0) {
    return;
  }

  event.preventDefault();
  panCanvasByViewportDelta(center.x - mapPinch.centerX, center.y - mapPinch.centerY);
  zoomAtCanvasPointByFactor(distance / mapPinch.distance, center.x, center.y);
  mapPinch.centerX = center.x;
  mapPinch.centerY = center.y;
  mapPinch.distance = distance;
}

function handleCanvasTouchEnd(event: TouchEvent): void {
  if (event.touches.length < 2) {
    requestImmediateMapTileReplacement();
    commitLiveZoom();
    mapPinch.active = false;
    mapPinch.centerX = 0;
    mapPinch.centerY = 0;
    mapPinch.distance = 0;
  }
}

function getTouchDistance(touches: TouchList): number | undefined {
  const firstTouch = touches[0];
  const secondTouch = touches[1];

  if (!firstTouch || !secondTouch) {
    return undefined;
  }

  return Math.hypot(
    secondTouch.clientX - firstTouch.clientX,
    secondTouch.clientY - firstTouch.clientY,
  );
}

function getTouchCenter(touches: TouchList): { x: number; y: number } | undefined {
  const firstTouch = touches[0];
  const secondTouch = touches[1];

  if (!firstTouch || !secondTouch) {
    return undefined;
  }

  return {
    x: (firstTouch.clientX + secondTouch.clientX) / 2,
    y: (firstTouch.clientY + secondTouch.clientY) / 2,
  };
}

function handleCanvasMouseLeave(): void {
  hideStopHover();
  stopMapDrag();
}

function handleCanvasClick(event: MouseEvent): void {
  const ghostGesture = ghostGestureClickGuard.value;

  if (ghostGesture) {
    ghostGestureClickGuard.value = undefined;

    if (Date.now() - ghostGesture.handledAt < 500) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  }

  if (event.target instanceof Element && event.target.closest(".network-ghost-line__hit-target")) {
    return;
  }

  if (!suppressNextCanvasClick.value) {
    ghostResetKey.value += 1;
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  suppressNextCanvasClick.value = false;
  ghostResetKey.value += 1;
}

function resetZoom(): void {
  cancelMapMotion();
  requestImmediateMapTileReplacement();
  if (!lineMap.value) {
    zoomAtCanvasCenter(1.12);
    return;
  }

  zoomAtCanvasCenter(getDefaultZoom(lineMap.value));
}

function getDefaultZoom(map: LineMapViewModel): number {
  if (isExplorerMode.value) {
    return map.stops.length > 55 ? 1.02 : 1;
  }

  return map.stops.length > 45 ? 1.22 : 1.12;
}

function getTerminalStopIds(map: LineMapViewModel): string[] {
  const degrees = new Map<string, number>();

  map.segments.forEach((segment) => {
    degrees.set(segment.fromStopId, (degrees.get(segment.fromStopId) ?? 0) + 1);
    degrees.set(segment.toStopId, (degrees.get(segment.toStopId) ?? 0) + 1);
  });

  return map.stops.filter((stop) => (degrees.get(stop.id) ?? 0) <= 1).map((stop) => stop.id);
}

function getLabelPriority(stop: LineMapStopView, requiredIds: Set<string>): number {
  if (requiredIds.has(stop.id)) {
    return 100;
  }

  return stop.routeIds.length;
}

function isSameStopReference(left: string, right: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/^(?:stop_area|stop_point):/u, "")
      .replace(/[^a-z0-9]/gu, "");
  return normalize(left) === normalize(right);
}
</script>

<template>
  <div
    class="line-map-panel"
    :class="{
      'line-map-panel--explorer': isExplorerMode,
      'line-map-panel--reduce-motion': reduceMotion,
    }"
    @touchstart.stop
    @touchmove.stop
    @touchend.stop
    @touchcancel.stop
    :style="{
      '--line-color': lineMap?.lineColor ?? props.line?.color ?? '#0064ff',
    }"
  >
    <div class="line-map-panel__bar">
      <slot name="bar-before-chip"></slot>
      <span
        class="line-map-chip"
        :style="{
          background: props.line?.color ?? '#0064ff',
          color: props.line?.textColor ?? '#ffffff',
        }"
      >
        {{ props.line?.label }}
      </span>
      <span v-if="selectedStop" class="line-map-selected-pill">
        {{ selectedStop.label }}
      </span>
      <div v-if="lineMap" class="line-map-panel__tools line-map-panel__tools--desktop">
        <slot name="bar-before-stats"></slot>
        <PatternTrafficCalendarToggle
          v-if="trafficCalendarEventCount > 0"
          :active="trafficCalendarPanelOpen"
          :count="trafficCalendarEventCount"
          :next-delay-label="trafficCalendarNextDelayLabel"
          :reduce-motion="reduceMotion"
          @toggle="toggleTrafficCalendarPanel"
        />
        <DistanceToggle
          v-model="showDistances"
          class="pattern-flow-action-button line-map-distance-toggle"
          :reduce-motion="reduceMotion"
        />
        <span class="line-map-stats">{{ mapStats }}</span>
        <span
          v-if="ghostNetworkEnabled && ghostProgress.total > 0"
          class="line-map-network-progress"
          role="status"
        >
          {{
            t("lineMap.picker.networkProgress", {
              completed: ghostProgress.completed,
              total: ghostProgress.total,
            })
          }}
        </span>
        <div class="line-map-zoom" :aria-label="t('lineMap.picker.zoomAria')">
          <button
            class="icon-button line-map-zoom__button"
            type="button"
            :aria-label="t('lineMap.picker.zoomOutAria')"
            :disabled="zoom <= MIN_ZOOM"
            @click="adjustZoom(-1)"
          >
            −
          </button>
          <button class="button-secondary line-map-zoom__reset" type="button" @click="resetZoom">
            {{ Math.round(zoom * 100) }}%
          </button>
          <button
            class="icon-button line-map-zoom__button"
            type="button"
            :aria-label="t('lineMap.picker.zoomInAria')"
            :disabled="zoom >= maximumZoom"
            @click="adjustZoom(1)"
          >
            +
          </button>
        </div>
      </div>
      <MobileActionsMenu
        v-if="lineMap"
        class="line-map-mobile-actions"
        :aria-label="t('lineMap.picker.mapOptionsAria')"
      >
        <template #default="{ close }">
          <slot name="bar-before-stats"></slot>
          <PatternTrafficCalendarToggle
            v-if="trafficCalendarEventCount > 0"
            :active="trafficCalendarPanelOpen"
            :count="trafficCalendarEventCount"
            :next-delay-label="trafficCalendarNextDelayLabel"
            :reduce-motion="reduceMotion"
            @toggle="
              toggleTrafficCalendarPanel();
              close();
            "
          />
          <DistanceToggle
            v-model="showDistances"
            class="pattern-flow-action-button line-map-distance-toggle"
            :reduce-motion="reduceMotion"
            @click="close"
          />
          <button
            v-if="ghostNetworkEnabled && isExplorerMode"
            class="pattern-flow-action-button"
            type="button"
            data-testid="line-map-mobile-display-button"
            @click.stop="
              openMobileDisplayModal();
              close();
            "
          >
            <Settings aria-hidden="true" />
            <span>{{ t("lineMap.picker.display") }}</span>
          </button>
          <span class="line-map-mobile-action-summary">{{ mapStats }}</span>
          <span
            v-if="ghostNetworkEnabled && ghostProgress.total > 0"
            class="line-map-network-progress line-map-network-progress--mobile"
            role="status"
          >
            {{
              t("lineMap.picker.networkProgress", {
                completed: ghostProgress.completed,
                total: ghostProgress.total,
              })
            }}
          </span>
          <div
            class="line-map-zoom line-map-zoom--mobile"
            :aria-label="t('lineMap.picker.zoomAria')"
          >
            <button
              class="icon-button line-map-zoom__button"
              type="button"
              :aria-label="t('lineMap.picker.zoomOutAria')"
              :disabled="zoom <= MIN_ZOOM"
              @click="adjustZoom(-1)"
            >
              −
            </button>
            <button class="button-secondary line-map-zoom__reset" type="button" @click="resetZoom">
              {{ Math.round(zoom * 100) }}%
            </button>
            <button
              class="icon-button line-map-zoom__button"
              type="button"
              :aria-label="t('lineMap.picker.zoomInAria')"
              :disabled="zoom >= maximumZoom"
              @click="adjustZoom(1)"
            >
              +
            </button>
          </div>
        </template>
      </MobileActionsMenu>
      <span v-if="loadingMap" class="field-loader">
        <span aria-hidden="true" class="loader-dot"></span>
        {{ t("lineMap.picker.loadingMap") }}
      </span>
    </div>

    <div v-if="loadingMap" class="line-map-state">
      <span aria-hidden="true" class="loader-dot line-map-state__loader"></span>
      <strong>{{ t("lineMap.picker.loadingMapTitle") }}</strong>
    </div>

    <div v-else-if="errorMessage" class="line-map-state line-map-state--error">
      <strong>{{ errorMessage }}</strong>
      <button class="button-secondary" type="button" @click="loadMap">
        {{ t("common.actions.retry") }}
      </button>
    </div>

    <div v-else-if="lineMap" class="line-map-panel__main">
      <Transition name="line-map-info-alert">
        <div
          v-if="favoriteDashboardAlertOpen"
          class="line-map-info-alert"
          role="status"
          aria-live="polite"
          data-testid="line-map-favorite-alert"
        >
          <CircleCheck aria-hidden="true" />
          <span>{{ favoriteDashboardAlertMessage }}</span>
          <button class="line-map-info-alert__undo" type="button" @click="undoLastFavoriteAdd">
            {{ t("common.actions.cancel") }}
          </button>
          <span
            :key="favoriteAlertProgressKey"
            class="line-map-info-alert__progress"
            aria-hidden="true"
          ></span>
        </div>
      </Transition>
      <div
        ref="mapCanvas"
        class="line-map-canvas"
        :class="{
          'line-map-canvas--dragging': isMapDragging,
          'line-map-canvas--moving': isMapMoving,
        }"
        @pointerdown="startMapDrag"
        @pointermove="moveMapDrag"
        @pointerup="stopMapDrag"
        @pointercancel="stopMapDrag"
        @mouseleave="handleCanvasMouseLeave"
        @wheel="handleCanvasWheel"
        @touchstart="handleCanvasTouchStart"
        @touchmove="handleCanvasTouchMove"
        @touchend="handleCanvasTouchEnd"
        @touchcancel="handleCanvasTouchEnd"
        @click.capture="handleCanvasClick"
        @scroll.passive="handleMapCanvasScroll"
      >
        <output
          v-if="mapPerformanceProbe"
          hidden
          data-testid="line-map-performance-probe"
        >
          {{ mapPerformanceSummary }}
        </output>
        <div
          ref="mapWorld"
          class="line-map-world"
          :style="svgStyle"
        >
          <div
            ref="mapScene"
            class="line-map-scene"
            :style="svgStyle"
          >
            <svg
              class="line-map-svg"
              role="img"
              :style="svgStyle"
              :viewBox="`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`"
              data-testid="line-map"
            >
          <g class="line-map-tiles" aria-hidden="true">
            <image
              v-for="tile in renderedMapTiles"
              :key="tile.id"
              class="line-map-tile"
              :href="tile.url"
              :x="tile.x"
              :y="tile.y"
              :width="tile.width"
              :height="tile.height"
              preserveAspectRatio="none"
            />
          </g>

          <g class="line-map-map-mask" aria-hidden="true">
            <rect x="0" y="0" :width="VIEWBOX_WIDTH" :height="VIEWBOX_HEIGHT" />
          </g>

          <foreignObject
            v-if="
              ghostNetworkEnabled &&
              ghostDisplayEnabled &&
              isExplorerMode &&
              activeStop &&
              lineMap.viewport
            "
            class="line-map-network-ghost-foreign-object"
            x="0"
            y="0"
            :width="VIEWBOX_WIDTH"
            :height="VIEWBOX_HEIGHT"
          >
            <TransitNetworkGhostLayer
              :lines="ghostLines"
              :quays="ghostQuays"
              :anchor-x="activeStop.x"
              :anchor-y="activeStop.y"
              :view-box-width="VIEWBOX_WIDTH"
              :view-box-height="VIEWBOX_HEIGHT"
              :padding-x="SVG_PADDING_X"
              :padding-y="SVG_PADDING_Y"
              :zoom="zoom"
              :viewport-rect="ghostViewportRect"
              :pixel-ratio="mapPixelRatio"
              :moving="isMapMoving"
              :zooming="isMapZooming"
              :tooltip-target="GHOST_TOOLTIP_TARGET"
              :reduce-motion="reduceMotion"
              :reset-key="ghostResetKey"
              :tap-request="ghostTapRequest"
              @active-line-change="handleGhostActiveLineChange"
              @line-pointer-down="beginGhostTap"
            />
          </foreignObject>

          <g class="line-map-segments">
            <path
              v-for="segment in lineMap.segments"
              :key="segment.id"
              class="line-map-segment"
              :class="getSegmentTrafficClass(segment)"
              :d="getSegmentPath(segment)"
              :style="getLineStyle(segment)"
            />
          </g>

          <g v-if="visibleEntrances.length" class="line-map-entrances" aria-hidden="true">
            <g
              v-for="entrance in visibleEntrances"
              :key="entrance.id"
              class="line-map-entrance"
              :class="{ 'line-map-entrance--focused': entrance.id === focusedEntranceId }"
              :transform="`translate(${toSvgX(entrance.x)} ${toSvgY(entrance.y)})`"
            >
              <circle
                v-if="entrance.id === focusedEntranceId"
                class="line-map-entrance__pulse line-map-entrance__pulse--delayed"
                :r="8 / zoom"
              />
              <circle
                v-if="entrance.id === focusedEntranceId"
                class="line-map-entrance__pulse"
                :r="8 / zoom"
              />
              <circle class="line-map-entrance__dot" :r="5 / zoom" />
              <line
                :x1="5 / zoom"
                :x2="12 / zoom"
                y1="0"
                y2="0"
                :style="{ strokeWidth: `${1.5 / zoom}px` }"
              />
              <text :x="15 / zoom" :y="-2 / zoom" :style="{ fontSize: `${10.5 / zoom}px` }">
                {{ [entrance.code, entrance.name].filter(Boolean).join(" - ") }}
              </text>
              <title>{{ entrance.name }}</title>
            </g>
          </g>
          <TransitionGroup tag="g" name="line-map-distance-pop" class="line-map-segment-distances">
            <g
              v-for="distance in segmentDistanceLabels"
              :key="`${distance.id}:distance`"
              class="line-map-segment-distance"
              :transform="`translate(${distance.x} ${distance.y})`"
            >
              <g class="line-map-segment-distance__bubble">
                <rect
                  :x="-distance.width / 2"
                  :y="-distance.height / 2"
                  :width="distance.width"
                  :height="distance.height"
                  :rx="distance.height / 2"
                />
                <text
                  text-anchor="middle"
                  dominant-baseline="central"
                  :style="{ fontSize: `${11.5 / zoom}px` }"
                >
                  {{ distance.label }}
                </text>
              </g>
            </g>
          </TransitionGroup>

          <g
            v-for="{ stop, index } in renderedStops"
            :key="stop.id"
            class="line-map-stop"
            :class="{
              'line-map-stop--selected':
                stop.id === selectedStationId || stop.id === activeStop?.id,
              'line-map-stop--active': stop.id === activeStop?.id,
              'line-map-stop--hovered': stop.id === hoveredStop?.id,
              'line-map-stop--traffic-focus': trafficPulseStopIds.has(stop.id),
              ...getStopTrafficClass(stop),
            }"
            :style="{ '--line-map-stop-color': lineMap.lineColor }"
          >
            <circle
              class="line-map-stop__ripple line-map-stop__ripple--delayed"
              :cx="toSvgX(stop.x)"
              :cy="toSvgY(stop.y)"
              :r="stopHaloRadius"
            />
            <circle
              class="line-map-stop__ripple"
              :cx="toSvgX(stop.x)"
              :cy="toSvgY(stop.y)"
              :r="stopHaloRadius"
            />
            <circle
              class="line-map-stop__halo"
              :cx="toSvgX(stop.x)"
              :cy="toSvgY(stop.y)"
              :r="stopHaloRadius"
            />
            <circle
              class="line-map-stop__dot"
              :cx="toSvgX(stop.x)"
              :cy="toSvgY(stop.y)"
              :r="stopRadius"
              :style="getStopStyle(stop)"
            />
            <g
              v-if="getStopTrafficImpact(stop)?.kind === 'interruption'"
              class="line-map-stop__traffic-cross"
              aria-hidden="true"
            >
              <line
                :x1="toSvgX(stop.x) - stopTrafficCrossRadius"
                :y1="toSvgY(stop.y) - stopTrafficCrossRadius"
                :x2="toSvgX(stop.x) + stopTrafficCrossRadius"
                :y2="toSvgY(stop.y) + stopTrafficCrossRadius"
                :style="{ strokeWidth: `${stopTrafficCrossStrokeWidth}px` }"
              />
              <line
                :x1="toSvgX(stop.x) - stopTrafficCrossRadius"
                :y1="toSvgY(stop.y) + stopTrafficCrossRadius"
                :x2="toSvgX(stop.x) + stopTrafficCrossRadius"
                :y2="toSvgY(stop.y) - stopTrafficCrossRadius"
                :style="{ strokeWidth: `${stopTrafficCrossStrokeWidth}px` }"
              />
            </g>
            <rect
              v-if="shouldShowLabel(stop) && stop.id === activeStop?.id"
              class="line-map-stop__label-background"
              v-bind="getActiveLabelBackground(stop, index)"
            />
            <text
              v-if="shouldShowLabel(stop)"
              class="line-map-stop__label"
              :class="{
                'line-map-stop__label--active': stop.id === activeStop?.id,
              }"
              :x="getLabelX(stop, index)"
              :y="getLabelY(stop, index)"
              :style="getLabelStyle()"
              :text-anchor="getLabelAnchor(stop)"
            >
              {{ stop.label }}
            </text>
          </g>

          <g
            id="line-map-network-ghost-tooltip-layer"
            class="line-map-network-ghost-tooltip-layer"
            aria-hidden="true"
          ></g>
            </svg>

            <button
              v-for="stop in lineMap.stops"
              :key="`${stop.id}:hit-target`"
              class="line-map-hit-target"
              type="button"
              :aria-label="getStopActionLabel(stop)"
              :aria-pressed="stop.id === activeStop?.id"
              :style="getHitTargetStyle(stop)"
              @pointerdown="beginStopTap(stop, $event)"
              @click="selectStopFromClick(stop, $event)"
              @focus="showStopHover(stop)"
              @blur="hideStopHover(stop)"
              @mouseenter="showStopHover(stop)"
              @mouseleave="hideStopHover(stop)"
            ></button>
          </div>
        </div>
      </div>

      <aside
        v-if="ghostNetworkEnabled && isExplorerMode"
        class="line-map-display-panel"
        :class="{
          'line-map-display-panel--collapsed': !ghostDisplayExpanded,
        }"
        data-testid="line-map-display-panel"
        @pointerdown.stop
        @click.stop
      >
        <button
          class="line-map-display-panel__header"
          type="button"
          :aria-expanded="ghostDisplayExpanded"
          @click="ghostDisplayExpanded = !ghostDisplayExpanded"
        >
          <Eye aria-hidden="true" />
          <strong>{{ t("lineMap.picker.display") }}</strong>
          <Minus v-if="ghostDisplayExpanded" aria-hidden="true" />
          <Plus v-else aria-hidden="true" />
        </button>

        <LineMapDisplayControls
          v-if="ghostDisplayExpanded"
          :model-value="ghostDisplayEnabled"
          :visibility="ghostModeVisibility"
          :ghost-network-scope="ghostNetworkScope"
          @update:model-value="ghostDisplayEnabled = $event"
          @update:visibility="setGhostModeVisibility"
        />
      </aside>
    </div>

    <AppRightPanel
      v-if="isExplorerMode && lineMap && activeStop && stationDetailsPanelOpen"
      :open="stationDetailsPanelOpen"
      :title="t('lineMap.sidebar.stationDetails')"
      @close="closeSidebar"
    >
      <DetailedLineMapPickerSideBar
        :stop="activeStop"
        :transfers="activeTransferState?.lines ?? []"
        :transfers-loading="activeTransferState?.loading ?? true"
        :transfers-error="activeTransferState?.error"
        :line-color="lineMap.lineColor"
        :entrances="visibleEntrances"
        :focused-entrance-id="focusedEntranceId"
        :show-actions="isExplorerMode"
        :favorite-loading="favoriteLoading"
        :favorite-error="favoriteError"
        :favorite-dashboard-selector-open="favoriteDashboardSelectorOpen"
        :favorite-dashboard-id="favoriteDashboardId"
        :favorite-dashboard-options="stationBoardDashboardOptions"
        :active-ghost-line="activeGhostLine"
        :ghost-directions="activeGhostDirectionState?.directions ?? []"
        :ghost-directions-loading="activeGhostDirectionState?.loading ?? false"
        :ghost-directions-error="activeGhostDirectionState?.error"
        :ghost-frequency="activeGhostFrequencyState?.profile"
        :ghost-frequency-loading="activeGhostFrequencyState?.loading ?? false"
        :ghost-frequency-error="activeGhostFrequencyState?.error"
        @add-favorite="openActiveStopFavoriteSelector"
        @update:favorite-dashboard-id="favoriteDashboardId = $event"
        @confirm-favorite-dashboard="confirmActiveStopFavoriteDashboard"
        @cancel-favorite-dashboard="closeActiveStopFavoriteSelector"
        @add-ghost-line-station="openGhostLineStationModal"
        @view-ghost-line-map="openActiveGhostLineMap"
        @open-google-maps="openActiveStopInGoogleMaps"
        @select-transfer="selectTransferLineOnMap"
        @focus-entrances="focusEntrances"
        @focus-entrance="focusEntrance"
      />
    </AppRightPanel>

    <PatternTrafficCalendarSurface
      v-if="trafficCalendarEventCount > 0"
      id-prefix="line-map-traffic-calendar"
      :open="trafficCalendarPanelOpen"
      :expanded="trafficCalendarExpanded"
      :has-next="hasNextTrafficCalendarMonth"
      :has-previous="hasPreviousTrafficCalendarMonth"
      :calendar="trafficCalendar"
      :selected-date-key="selectedTrafficCalendarDateKey"
      :selected-day="selectedTrafficCalendarDay"
      :selected-disruptions="selectedTrafficCalendarDisruptions"
      :loading-date-key="trafficCalendarLoadingDateKey"
      :loading-direction="trafficCalendarLoadingDirection"
      @close="closeTrafficCalendarPanel"
      @close-expanded="closeExpandedTrafficCalendar"
      @next="selectNextTrafficCalendarMonth"
      @previous="selectPreviousTrafficCalendarMonth"
      @reset-today="resetTrafficCalendarToday"
      @select="selectTrafficCalendarDay"
      @expand="expandTrafficCalendar"
      @focus-disruption="focusTrafficDisruption"
    />
  </div>

  <Teleport to="body">
    <Transition name="line-map-display-modal-fade">
      <div
        v-if="ghostNetworkEnabled && isExplorerMode && mobileDisplayOpen"
        class="line-map-display-modal-backdrop"
        role="presentation"
        @click.self="closeMobileDisplayModal"
      >
        <section
          class="line-map-display-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="line-map-display-modal-title"
          data-testid="line-map-display-modal"
          tabindex="-1"
          @keydown.esc="closeMobileDisplayModal"
        >
          <header class="line-map-display-modal__header">
            <Eye aria-hidden="true" />
            <strong id="line-map-display-modal-title">
              {{ t("lineMap.picker.display") }}
            </strong>
            <button
              class="icon-button line-map-display-modal__close"
              type="button"
              :aria-label="t('lineMap.picker.closeDisplayOptionsAria')"
              @click="closeMobileDisplayModal"
            >
              <X aria-hidden="true" />
            </button>
          </header>

          <LineMapDisplayControls
            :model-value="ghostDisplayEnabled"
            :visibility="ghostModeVisibility"
            :ghost-network-scope="ghostNetworkScope"
            @update:model-value="ghostDisplayEnabled = $event"
            @update:visibility="setGhostModeVisibility"
          />
        </section>
      </div>
    </Transition>
  </Teleport>

  <StationBoardModal
    v-if="ghostLineStationModalOpen && ghostLineStationLine && ghostLineStationFamily"
    :open="ghostLineStationModalOpen"
    :initial-line="ghostLineStationLine"
    :initial-family="ghostLineStationFamily"
    :initial-station="ghostLineStationStation"
    :show-dashboard-selector="true"
    :dashboard-options="stationBoardDashboardOptions"
    :default-dashboard-id="DEFAULT_TRANSIT_PLACE_ID"
    @add="addGhostLineStationBoard"
    @close="closeGhostLineStationModal"
  />

  <Teleport to="body">
    <Transition name="modal-scale">
      <div
        v-if="favoriteConfirmationOpen"
        class="line-map-confirmation-backdrop"
        role="presentation"
      >
        <section
          class="line-map-confirmation"
          role="dialog"
          aria-modal="true"
          aria-labelledby="line-map-confirmation-title"
        >
          <strong id="line-map-confirmation-title">
            {{ t("lineMap.picker.favoriteConfirmationTitle") }}
          </strong>
          <button type="button" @click="favoriteConfirmationOpen = false">OK</button>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
