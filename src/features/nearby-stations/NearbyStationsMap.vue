<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useSlots, watch } from "vue";
import { BusFront, Check, ChevronRight, Ear, EllipsisVertical, ExternalLink, Footprints, Gauge, Layers, LoaderCircle, Map as MapIcon, MapPin, Maximize2, Minimize2, Minus, Navigation, Plus, Radar, Route, Satellite, Store, TrainFront, TramFront, Wind, ZoomIn, ZoomOut, X } from "lucide-vue-next";
import LineIconBadge from "../../components/LineIconBadge.vue";
import NearbyPlaceCanvas from "./NearbyPlaceCanvas.vue";
import MapItemTransitionGroup from "../../components/MapItemTransitionGroup";
import NearbyStationsBasemap from "./NearbyStationsBasemap.vue";
import { fetchGtfsLineFrequency } from "../../services/lineFrequency";
import type { GtfsLineFrequencyResponse } from "../../types/lineFrequency";
import LineMapDisplayControls from "../line-map/LineMapDisplayControls.vue";
import { useI18n } from "../../i18n";
import { createLinePresentation, transitFamilyToMode } from "../../services/linePresentation";
import type { TransitFamily } from "../../types/transit";
import { GLOBAL_MAP_MODE_ORDER, type GlobalMapBounds, type GlobalMapLine, type GlobalMapMode, type GlobalMapStation } from "../transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../transport-map/contracts/network";
import {
  clampCameraToBounds,
  createCamera,
  fitCameraToBounds,
  panCameraByScreen,
  resizeCamera,
  transformCameraForPinch,
  updateCamera,
  zoomCameraAroundScreenPoint,
  type CameraState,
} from "../transport-map/geo/camera";
import { boundsIntersect, expandBounds, lonLatToWorld, metersToWorldUnits, screenToWorld, worldScaleAtZoom, worldToLonLat, worldToScreen, worldUnitsToMeters, type ScreenPoint } from "../transport-map/geo/coordinateKernel";
import type {
  TransportMapBasemapLayer,
  TransportMapBasemapStyle,
} from "../transport-map/basemap/tileMath";
import GhostLineFlowOverlay from "../transport-map/overlays/GhostLineFlowOverlay.vue";
import type { GhostLineFlowModel } from "../transport-map/overlays/ghostLineFlow";
import { formatTransitDistanceMeters, getCoordinatesDistanceMeters } from "../../services/distance";
import {
  NEARBY_CLUSTER_GROUPING_DEFAULT_METERS,
  NEARBY_CLUSTER_GROUPING_MAX_METERS,
  NEARBY_CLUSTER_GROUPING_MIN_METERS,
  NEARBY_CLUSTER_GROUPING_STEP_METERS,
  NEARBY_MAP_MARGIN_METERS,
  type NearbyStationEntry,
} from "./nearbyStations";
import type { NearbyStationScheduleState } from "./nearbyStationSchedules";
import type { NearbyPlace } from "./nearbyPlaces";
import {
  NEARBY_DIRECTORY_MAX_RADIUS_METERS,
  isNearbyPlaceActivity,
  isNearbyPlaceGreenSpace,
  nearbyOptionalPlace,
  nearbyPlaceWheelchairAccess,
  type NearbyCityActivity,
  type NearbyOptionalPlace,
  isNearbyPlaceVisibleOnMap,
} from "./nearbyPlacePresentation";
import { NEARBY_ISOCHRONE_MINUTES, type NearbyWalkingMinutes } from "./nearbyWalkingMinutes";
import type { NearbyIsochroneGeometry } from "./nearbyIsochrones";
import { parseNearbyAirQualityLevel, type NearbyAirQualityLevel, type NearbyNoiseGridCell, type NearbyNoiseLevel } from "./nearbyNoiseZones";
import { NearbyIsochronesError } from "../../services/nearbyIsochrones";
import type { NearbyJourneyPoint } from "./nearbyHeavyTransports";
import type { NearbyWalkingRoute } from "./nearbyWalkingRoutes";
import IrisNeighborhoodOverlay from "../transport-map/overlays/IrisNeighborhoodOverlay.vue";
import { fetchIrisDataset, type IrisAirNoiseStatistics, type IrisDataset, type IrisNeighborhood } from "../transport-map/iris/irisApi";
import { fetchNeighborhoodVerdict } from "./neighborhoodVerdictApi";
import { measureDevPerformance } from "../../services/devPerformance";
import {
  boundsForIrisNeighborhoods,
  boundsForIrisGeometry,
  countIrisTransportInNeighborhoods,
  filterIrisTransportStationsInNeighborhoods,
  pointInIrisGeometry,
  scoreIrisNeighborhoodsFromGrid,
  selectIrisNeighborhoodsForPoint,
  transportStationsFromNetwork,
  type IrisTransportStation,
} from "../transport-map/iris/irisGeometry";
import { buildIrisNeighborhoodRevealOrder } from "../transport-map/iris/irisNeighborhoodTransition";
import TransportIsochronePanel, {
  type TransportIsochronePanelCopy,
} from "../transport-map/isochrones/TransportIsochronePanel.vue";
import {
  GLOBAL_ISOCHRONE_ATTRIBUTION,
  globalIsochronePresetMinutes,
  type GlobalIsochroneStatus,
} from "../transport-map/isochrones/contracts";
import TransportIsochroneTooltip, {
  type TransportIsochroneTooltipItem,
} from "../transport-map/isochrones/TransportIsochroneTooltip.vue";
import { useTransportIsochroneSettings } from "../transport-map/isochrones/useTransportIsochroneSettings";
import { useNearbyIsochrones } from "./useNearbyIsochrones";
import {
  useNearbyStationIsochrones,
  type NearbyStationIsochroneOrigin,
} from "./useNearbyStationIsochrones";
import { mergeNearbyIsochroneGeometries } from "./nearbyIsochroneUnion";
import { useNearbyNoiseZones } from "./useNearbyNoiseZones";
import NearbyLineHoverCard from "./NearbyLineHoverCard.vue";
import NearbySummary from "./NearbySummary.vue";
import NearbyCityInfoCard, {
  type NearbyCityInfoCardItem,
  type NearbyCityInfoCardTransportMode,
} from "./NearbyCityInfoCard.vue";
import NearbyCityComparisonOverlay from "./NearbyCityComparisonOverlay.vue";
import NearbyCityComparisonModal from "./NearbyCityComparisonModal.vue";
import {
  buildNearbyCityOptions,
  nearbyCityComparisonLineDetail,
  nearbyCityComparisonLineLabel,
  type NearbyCityComparisonCity,
  type NearbyCityComparisonCityOption,
  type NearbyCityComparisonDetail,
  type NearbyCityComparisonDetailZone,
  type NearbyCityComparisonMetric,
  type NearbyCityComparisonMetricIcon,
  type NearbyCityComparisonNetworkLines,
  type NearbyCityComparisonNetworkRow,
  perThousandInhabitants,
  type NearbyCityComparisonPlaceCounts,
} from "./nearbyCityComparison";
import {
  getNearbyHeavyAccessPresentation,
  NEARBY_HEAVY_TRANSPORT_MODES,
  selectNearbyHeavyCandidateLines,
  type NearbyHeavyTransportCandidate,
} from "./nearbyHeavyTransports";
import {
  projectNearbyHeavyStationToViewport,
  type NearbyHeavyProjectionCorner,
  type NearbyHeavyProjectionEdge,
  type NearbyHeavyProjectionBounds,
  type NearbyHeavyViewportProjection,
} from "./nearbyHeavyProjection";
import {
  GLOBAL_MAP_NEARBY_HEAVY_LINE_QUERY_KEY,
  GLOBAL_MAP_NEARBY_HEAVY_STATION_QUERY_KEY,
} from "../line-map/globalMapTemporaryMarker";

interface NearbyWalkingMapSegment {
  id: string;
  from: NearbyJourneyPoint;
  to: NearbyJourneyPoint;
  coordinates?: readonly NearbyJourneyPoint[];
}

interface NearbyProjectedEnvironmentCell extends NearbyNoiseGridCell {
  airQualityLevel: NearbyAirQualityLevel;
  x: number;
  y: number;
  width: number;
  height: number;
}

type NearbyEnvironmentLayer = "noise" | "air-quality";

type NearbyIsochroneHover = TransportIsochroneTooltipItem & {
  position: ScreenPoint;
  mode?: GlobalMapMode;
};

type NearbyEnvironmentHover =
  | {
    layer: "noise";
    cellKey: string;
    level: NearbyNoiseLevel;
    position: ScreenPoint;
  }
  | {
    layer: "air-quality";
    cellKey: string;
    level: NearbyAirQualityLevel;
    position: ScreenPoint;
  };

type NearbySidebarTab = "summary" | "schedule";

type SummaryFrequencyState =
  | { status: "loading" }
  | { status: "ready"; profile: GtfsLineFrequencyResponse }
  | { status: "unavailable" };

const props = withDefaults(defineProps<{
  variant?: "transit" | "places-preview";
  allowZoom?: boolean;
  suspendResizeWork?: boolean;
  reduceMotion?: boolean;
  selectedPlaceId?: string;
  origin: { lon: number; lat: number };
  originLabel?: string;
  radius: number;
  stations: NearbyStationEntry[];
  cityViewStations?: readonly NearbyStationEntry[];
  cityViewNetwork?: TransportMapNetwork;
  supplementalStations?: NearbyHeavyTransportCandidate[];
  selectedLineIds: (stationId: string) => string[];
  basemapStyle?: TransportMapBasemapStyle;
  activeModes: GlobalMapMode[];
  availableModes?: GlobalMapMode[];
  loading?: boolean;
  lineFlowModel?: GhostLineFlowModel;
  lineFlowModels?: readonly GhostLineFlowModel[];
  activeLineId?: string;
  hoveredLineId?: string;
  traceActionLabel?: string;
  clusterGroupingDistanceMeters?: number;
  scheduleState?: (stationId: string) => NearbyStationScheduleState | undefined;
  stationHasUpcomingDeparture?: (stationId: string) => boolean | undefined;
  hideStationsWithoutDepartures?: boolean;
  hideLongWaitTransports?: boolean;
  showNearbyPlaces?: boolean;
  showNearbyBenches?: boolean;
  showNearbyParkings?: boolean;
  showNearbyPlaceNames?: boolean;
  showIsochroneControl?: boolean;
  showCityViewControl?: boolean;
  showNoiseControl?: boolean;
  showAirQualityControl?: boolean;
  showDirectoryControl?: boolean;
  showNeighborhoodScoreControl?: boolean;
  showBasemapControl?: boolean;
  showDisplayControl?: boolean;
  showFullscreenControl?: boolean;
  places?: readonly NearbyPlace[];
  /** Full selected-commune places used by the city view. */
  cityViewPlaces?: readonly NearbyPlace[];
  cityViewCommerceCounts?: Readonly<Record<string, number>>;
  cityViewCommerceTotal?: number;
  /** Optional lazy loader for target commune counts from the compiled places asset. */
  loadCityViewPlaceCounts?: (city: { code: string; name: string; lat: number; lon: number }) => Promise<NearbyCityComparisonPlaceCounts | undefined>;
  /** Backward-compatible commerce-only loader for lightweight map consumers. */
  loadCityViewCommerce?: (city: { code: string; name: string; lat: number; lon: number }) => Promise<number | undefined>;
  walkingRoutes?: Readonly<Record<string, NearbyWalkingRoute | undefined>>;
  travelPanelOpen?: boolean;
  travelWalkingSegments?: readonly NearbyWalkingMapSegment[];
  walkingRoute?: NearbyWalkingRoute;
}>(), {
  showNearbyBenches: false,
  showNearbyParkings: false,
  showNearbyPlaces: true,
  showIsochroneControl: true,
  showCityViewControl: true,
  showNoiseControl: true,
  showAirQualityControl: true,
  showDirectoryControl: true,
  showNeighborhoodScoreControl: false,
  showBasemapControl: true,
  showDisplayControl: true,
  showFullscreenControl: true,
});

const emit = defineEmits<{
  toggleStation: [stationId: string];
  toggleStationSchedule: [stationId: string];
  toggleLine: [stationId: string, lineId: string];
  details: [stationId: string, lineId: string];
  cameraChange: [camera: CameraState];
  hoverLine: [lineId: string];
  leaveLine: [lineId: string];
  activateLine: [lineId: string, focusedStationId?: string, ghostLineIds?: string | readonly string[]];
  clearLineFocus: [];
  updateActiveModes: [modes: GlobalMapMode[]];
  stationContextMenu: [stationId: string, anchor: HTMLElement];
  placeContextMenu: [placeId: string, anchor: HTMLElement];
  sidebarActions: [anchor: HTMLElement];
  stationFocus: [stationId?: string];
  viewTrace: [lineId: string, directionId: string, stationId?: string];
  updateClusterGroupingDistance: [value: number];
  updateHideStationsWithoutDepartures: [value: boolean];
  "update:hideLongWaitTransports": [value: boolean];
  "update:showNearbyPlaces": [value: boolean];
  "update:showNearbyBenches": [value: boolean];
  "update:showNearbyParkings": [value: boolean];
  "update:showNearbyPlaceNames": [value: boolean];
  toggleTravelPanel: [];
  "fullscreen-change": [fullscreen: boolean];
  openPlacesDirectory: [];
  openNeighborhoodScore: [];
  openPlacesRanking: [populationByCity?: Readonly<Record<string, number>>];
  toggleCityCommerce: [visible: boolean];
  selectPlace: [placeId?: string];
}>();

const { n, t } = useI18n();
const slots = useSlots();
const isPlacesPreview = computed(() => props.variant === "places-preview");
const canInteractWithMap = computed(() => !isPlacesPreview.value || props.allowZoom === true);
const NEARBY_ZOOM_OUT_RATIO = 1.2;
// Let the nearby map zoom in to twice its reference scale while keeping the
// zoom range bounded for touch and mouse interactions.
const NEARBY_ZOOM_IN_RATIO = 10;
const NEARBY_ZOOM_OUT_DELTA = Math.log2(NEARBY_ZOOM_OUT_RATIO);
const NEARBY_ZOOM_IN_DELTA = Math.log2(NEARBY_ZOOM_IN_RATIO);
const NEARBY_ZOOM_BUTTON_STEP = 0.16;
const NEARBY_MAP_CONTENT_INSET = 26;
const NEARBY_MAP_TOP_CONTROL_RESERVE = 74;
const NEARBY_MAP_MOBILE_TOP_CONTROL_RESERVE = 112;
const NEARBY_MAP_HORIZONTAL_MARKER_CLEARANCE = 20;
const NEARBY_MAP_FULLSCREEN_BOTTOM_CONTROL_RESERVE = 148;
const NEARBY_MAP_SCALE_MAX_WIDTH_PX = 190;
const NEARBY_MAP_SCALE_HORIZONTAL_RESERVE_PX = 88;
const NEARBY_MAP_SCALE_FACTORS = [1, 2, 5] as const;

function nearbyMapScaleCandidates(targetMeters: number): number[] {
  const exponent = Math.floor(Math.log10(targetMeters));
  return Array.from({ length: 7 }, (_, offset) => exponent + offset - 3)
    .flatMap((candidateExponent) => NEARBY_MAP_SCALE_FACTORS.map((factor) => factor * 10 ** candidateExponent))
    .filter((candidate) => Number.isFinite(candidate) && candidate > 0);
}

function chooseNearbyMapScaleDistance(
  targetMeters: number,
  metersPerPixel: number,
  maxWidthPx: number,
): number {
  if (!Number.isFinite(targetMeters) || targetMeters <= 0 || !Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
    return 100;
  }

  const candidates = nearbyMapScaleCandidates(targetMeters);
  const fittingCandidates = candidates.filter((candidate) => candidate / metersPerPixel <= maxWidthPx);
  const eligibleCandidates = fittingCandidates.length > 0 ? fittingCandidates : candidates;
  return eligibleCandidates.reduce((best, candidate) => {
    const bestDistance = Math.abs(Math.log(best / targetMeters));
    const candidateDistance = Math.abs(Math.log(candidate / targetMeters));
    return candidateDistance < bestDistance ? candidate : best;
  });
}

function formatNearbyMapScaleDistance(distanceMeters: number): string {
  return distanceMeters < 1_000
    ? `${Math.round(distanceMeters)} m`
    : `${n(distanceMeters / 1_000, { maximumFractionDigits: 1 })} km`;
}

const LINE_MODE_ORDER: GlobalMapMode[] = ["METRO", "RER", "TRAIN", "TRANSILIEN", "TRAM", "CABLE", "BUS", "NOCTILIEN"];
// Dense surface networks are aggregated as a line count in the comparison: one
// badge per bus line would destroy the readability of the network table.
const COMPARISON_AGGREGATED_MODES = new Set<string>(["BUS", "NOCTILIEN"]);
const CITY_VIEW_STATION_MODES: readonly GlobalMapMode[] = GLOBAL_MAP_MODE_ORDER.filter(
  (mode) => mode !== "BUS" && mode !== "NOCTILIEN",
);
const CITY_VIEW_MARKER_VIEWPORT_PADDING = 24;
const CITY_VIEW_CAMERA_TRANSITION_DURATION_MS = 980;
// Keep enough context around the selected commune for adjacent commune labels
// to remain visible and clickable after the city fit.
const CITY_VIEW_NEIGHBOR_CONTEXT_RATIO = 0.6;
const HEAVY_TRANSPORT_MODES: GlobalMapMode[] = ["METRO", "RER", "TRAIN", "TRANSILIEN", "TRAM"];
const KNOWN_HEAVY_LINE_LABELS_BY_CODE: Readonly<Record<string, string>> = {
  C01728: "D",
  C01729: "E",
  C01730: "P",
  C01731: "R",
  C01736: "N",
  C01737: "H",
  C01738: "K",
  C01739: "J",
  C01740: "L",
  C01741: "U",
  C01742: "A",
  C01743: "B",
  C02711: "V",
};
const SIDEBAR_MIN_WIDTH = 260;
const SIDEBAR_DEFAULT_WIDTH = 310;
const SIDEBAR_MAX_WIDTH = 520;
const root = ref<HTMLElement>();
const shell = ref<HTMLElement>();
const gestureCameraLayer = ref<HTMLElement>();
const gestureMarkerLayer = ref<HTMLElement>();
const sidebarSplitter = ref<HTMLElement>();
const sidebarActionButton = ref<HTMLButtonElement>();
const camera = shallowRef<CameraState>(createCamera({ zoom: 14, viewportWidthCssPx: 720, viewportHeightCssPx: 380 }));
const nearbyBasemapReferenceCamera = shallowRef<CameraState>({ ...camera.value });
let nearbyBasemapReferenceBoundsKey = "";
let nearbyBasemapReferenceInitialized = false;
// A slow mouse wheel commonly emits one sample every ~200-220 ms. Keep those
// samples in one compositor-only interaction so they do not commit and reload
// an intermediate raster definition on every notch.
const basemapInteractionSettleMs = ref(240);
let successfulBasemapAudits = 0;
const zoomRange = ref({
  min: camera.value.zoom - NEARBY_ZOOM_OUT_DELTA,
  max: camera.value.zoom + NEARBY_ZOOM_IN_DELTA,
});
const zoomReference = ref(camera.value.zoom);
const hoveredStationId = ref<string>();
const placeLayer = ref<InstanceType<typeof NearbyPlaceCanvas>>();
const placesVisible = ref(false);
const pinnedStationId = ref<string>();
const stationHoveredLineId = ref<string>();
const stationPinnedLineId = ref<string>();
const stationTooltipsSuppressed = ref(false);
const summaryHoveredLineId = ref<string>();
const summaryPinnedLineId = ref<string>();
const summaryFrequencyStates = ref(new Map<string, SummaryFrequencyState>());
const summaryFrequencyControllers = new Map<string, AbortController>();
const activeSidebarTab = ref<NearbySidebarTab>("summary");
const isFullscreen = ref(false);
const displayControlsOpen = ref(false);
const displayPanel = ref<HTMLElement>();
const displayToggleButton = ref<HTMLButtonElement>();
const basemapLayer = ref<TransportMapBasemapLayer>("plan");
const nearbyIsochroneSettings = useTransportIsochroneSettings();
const isochroneEnabled = nearbyIsochroneSettings.enabled;
const isochronePanelOpen = nearbyIsochroneSettings.panelOpen;
const isochroneSettings = nearbyIsochroneSettings.settings;
const isochroneConfigurationModalOpen = nearbyIsochroneSettings.modalOpen;
const noiseZonesEnabled = ref(false);
const airQualityZonesEnabled = ref(false);
const hoveredIsochrone = ref<NearbyIsochroneHover>();
const hoveredEnvironment = ref<NearbyEnvironmentHover>();
const showMapStations = ref(true);
const showProjectedStations = ref(true);
const cityViewEnabled = ref(false);
const cityViewSelectedTransportMode = ref<GlobalMapMode>();
const cityViewHoveredLineId = ref<string>();
const cityViewLoading = ref(false);
const cityViewError = ref("");
const cityViewSelectionExact = ref(true);
const irisDataset = shallowRef<IrisDataset>();
const cityViewSecurityScore = ref<number>();
const cityViewActivity = ref<NearbyCityActivity | null>(null);
// The comparator is fully symmetric: each side owns a commune code, and every
// async value is cached per code so swapping the two cities is instant.
const cityViewComparisonCurrentCode = ref<string>();
const cityViewComparisonTargetCode = ref<string>();
const cityViewComparisonDataCache = ref<Readonly<Record<string, {
  loading?: boolean;
  security?: number;
  placeCounts?: NearbyCityComparisonPlaceCounts;
}>>>({});
const cityViewComparisonLoadingCodes = ref<readonly string[]>([]);
let cityViewComparisonRequestToken = 0;
const cityViewCommerceVisible = computed({
  get: () => cityViewActivity.value === "commerce",
  set: (visible: boolean) => { cityViewActivity.value = visible ? "commerce" : null; },
});
const optionalPlaces = ref<Record<NearbyOptionalPlace, boolean>>({ companies: false, worship: false, artworks: false });
const showAccessibilityPlaces = ref(false);
const optionalPlaceKinds: NearbyOptionalPlace[] = ["companies", "worship", "artworks"];
const extraCityActivities = ["economic", "leisure"] as const;
function toggleCityActivity(activity: NearbyCityActivity): void {
  cityViewActivity.value = cityViewActivity.value === activity ? null : activity;
  emit("toggleCityCommerce", cityViewActivity.value !== null);
}
type CityViewTransition = "to-city" | "to-neighborhood";
const cityViewTransition = ref<CityViewTransition>();
const cityViewRadiusTransition = ref<CityViewTransition>();
const irisRevealOrder = ref<readonly string[]>([]);
const irisRevealProgress = ref(1);
let cityViewRequestToken = 0;
let cityViewSecurityRequestToken = 0;
let cityViewTransitionToken = 0;
let cityViewTransitionTarget: CameraState | undefined;
let cityViewSnapshot: {
  camera: CameraState;
  zoomRange: { min: number; max: number };
  zoomReference: number;
  isochroneEnabled: boolean;
  noiseZonesEnabled: boolean;
  airQualityZonesEnabled: boolean;
  isochronePanelOpen: boolean;
  isochroneConfigurationModalOpen: boolean;
  showMapStations: boolean;
  showProjectedStations: boolean;
  displayControlsOpen: boolean;
  hoveredStationId?: string;
  pinnedStationId?: string;
} | undefined;
const animating = ref(false);
const isMapInteracting = ref(false);
const coarsePointer = ref(false);
const isMobileDisplaySheet = computed(() => coarsePointer.value || camera.value.viewportWidthCssPx <= 680);
const mapDragging = ref(false);
const systemReducedMotion = ref(false);
const dataSaverMode = ref(false);
const reducedMotion = computed(() => systemReducedMotion.value || props.reduceMotion === true || dataSaverMode.value);
const dynamicIconMotionEnabled = computed(() => !reducedMotion.value);
const sidebarWidth = ref(SIDEBAR_DEFAULT_WIDTH);
const sidebarResizeActive = ref(false);
const feederPulseActive = ref(false);
let resizeObserver: ResizeObserver | undefined;
let animationFrame: number | undefined;
let gestureFrame: number | undefined;
let pendingGestureCamera: CameraState | undefined;
let gestureBounds: DOMRect | undefined;
let tooltipLayoutQueued = false;
let irisRevealAnimationFrame: number | undefined;
let irisPrefetchTimer: number | undefined;
let previewResizeFrame: number | undefined;
let interactionTimer: number | undefined;
let feederPulseTimer: number | undefined;
let feederPulseToken = 0;
let sidebarResizePointerId: number | undefined;
let stationTooltipSuppressionTimer: number | undefined;
let sidebarSwipe: {
  pointerId: number;
  startX: number;
  startY: number;
} | undefined;
let panPointerId: number | undefined;
let panLastPoint: ScreenPoint | undefined;
let panMoved = false;
let suppressNextMapClick = false;
let suppressClickTimer: number | undefined;
const activePointers = new Map<number, ScreenPoint>();
let pinchGesture: {
  initialCamera: CameraState;
  initialDistance: number;
  anchorWorld: { x: number; y: number };
} | undefined;
let markerProjectionCamera: CameraState | undefined;
const markerProjectionCache = new Map<string, ScreenPoint>();

function shouldDisplayStationForSchedule(stationId: string): boolean {
  if (!props.hideStationsWithoutDepartures) return true;
  return props.stationHasUpcomingDeparture?.(stationId) !== false;
}

const cityViewVisibleModes = computed<readonly GlobalMapMode[]>(() => (
  cityViewSelectedTransportMode.value
    ? [cityViewSelectedTransportMode.value]
    : CITY_VIEW_STATION_MODES
));
const cityViewFocusedLineIds = computed<ReadonlySet<string>>(() => new Set(
  [cityViewHoveredLineId.value, props.hoveredLineId, props.activeLineId]
    .filter((lineId): lineId is string => Boolean(lineId)),
));
const cityViewIsochroneFocusedLineIds = computed<ReadonlySet<string>>(() => new Set(
  [
    ...cityViewFocusedLineIds.value,
    stationHoveredLineId.value,
    stationPinnedLineId.value,
    summaryHoveredLineId.value,
    summaryPinnedLineId.value,
  ].filter((lineId): lineId is string => Boolean(lineId)),
));
const cityViewPreferredLineId = computed(() =>
  cityViewHoveredLineId.value ?? props.hoveredLineId ?? props.activeLineId,
);

const cityViewStationEntries = computed<NearbyStationEntry[]>(() => {
  if (props.cityViewNetwork) {
    return props.cityViewNetwork.stations.flatMap((station) => {
      const lines = station.lineIds
        .map((lineId) => props.cityViewNetwork!.linesById.get(lineId))
        .filter((line): line is GlobalMapLine => Boolean(line))
        .sort((left, right) => {
          const modeDifference = GLOBAL_MAP_MODE_ORDER.indexOf(left.mode) - GLOBAL_MAP_MODE_ORDER.indexOf(right.mode);
          return modeDifference || left.code.localeCompare(right.code, "fr-FR", { numeric: true });
        });
      if (lines.length === 0) return [];

      const distanceMeters = getCoordinatesDistanceMeters(props.origin.lat, props.origin.lon, station.lat, station.lon);
      return [{
        id: station.id,
        station: { ...station, memberStationIds: [station.id] },
        memberStations: [station],
        lines,
        distanceMeters,
        lineDistanceMeters: Object.fromEntries(lines.map((line) => [line.id, distanceMeters])),
        lineInsideRadius: Object.fromEntries(lines.map((line) => [line.id, true])),
        insideRadius: true,
      } satisfies NearbyStationEntry];
    });
  }

  return (props.cityViewStations ?? props.stations).flatMap((entry) => {
    const lines = entry.lines;
    if (lines.length === 0) return [];
    return entry.memberStations.map((station) => {
      const distanceMeters = getCoordinatesDistanceMeters(props.origin.lat, props.origin.lon, station.lat, station.lon);
      return {
        ...entry,
        id: station.id,
        station: { ...station, memberStationIds: [station.id] },
        memberStations: [station],
        lines,
        distanceMeters,
        lineDistanceMeters: Object.fromEntries(lines.map((line) => [line.id, distanceMeters])),
        lineInsideRadius: Object.fromEntries(lines.map((line) => [line.id, true])),
        insideRadius: true,
      } satisfies NearbyStationEntry;
    });
  });
});

const nearbySummaryLines = computed<GlobalMapLine[]>(() => {
  const linesById = new Map<string, GlobalMapLine>();
  const localLines = [
    ...props.stations.flatMap((entry) => entry.lines),
    ...(props.supplementalStations ?? [])
      .filter((candidate) => !candidate.projected)
      .flatMap((candidate) => candidate.lines),
  ];
  for (const line of localLines) {
    const canonicalLine = props.cityViewNetwork?.linesById.get(line.id) ?? line;
    if (!props.activeModes.includes(canonicalLine.mode) || linesById.has(canonicalLine.id)) continue;
    linesById.set(canonicalLine.id, canonicalLine);
  }
  return [...linesById.values()].sort((left, right) => {
    const modeDifference = LINE_MODE_ORDER.indexOf(left.mode) - LINE_MODE_ORDER.indexOf(right.mode);
    return modeDifference
      || lineDisplayLabel(left).localeCompare(lineDisplayLabel(right), "fr-FR", { numeric: true, sensitivity: "base" })
      || left.id.localeCompare(right.id);
  });
});

const nearbySummaryHeavyLines = computed<GlobalMapLine[]>(() => {
  const localLineIds = new Set(nearbySummaryLines.value.map((line) => line.id));
  const linesById = new Map<string, GlobalMapLine>();
  for (const candidate of props.supplementalStations ?? []) {
    if (!candidate.projected) continue;
    for (const line of candidate.lines) {
      if (!NEARBY_HEAVY_TRANSPORT_MODES.includes(line.mode)) continue;
      const canonicalLine = props.cityViewNetwork?.linesById.get(line.id) ?? line;
      if (!props.activeModes.includes(canonicalLine.mode) || localLineIds.has(canonicalLine.id) || linesById.has(canonicalLine.id)) continue;
      linesById.set(canonicalLine.id, canonicalLine);
    }
  }
  return [...linesById.values()].sort((left, right) => {
    const modeDifference = LINE_MODE_ORDER.indexOf(left.mode) - LINE_MODE_ORDER.indexOf(right.mode);
    return modeDifference
      || lineDisplayLabel(left).localeCompare(lineDisplayLabel(right), "fr-FR", { numeric: true, sensitivity: "base" })
      || left.id.localeCompare(right.id);
  });
});

function lineForHoverCard(lineId: string | undefined): GlobalMapLine | undefined {
  if (!lineId) return undefined;
  return props.cityViewNetwork?.linesById.get(lineId)
    ?? nearbySummaryLines.value.find((line) => line.id === lineId)
    ?? nearbySummaryHeavyLines.value.find((line) => line.id === lineId)
    ?? props.stations.flatMap((entry) => entry.lines).find((line) => line.id === lineId)
    ?? (props.supplementalStations ?? []).flatMap((candidate) => candidate.lines).find((line) => line.id === lineId);
}

const summaryActiveLineId = computed(() => summaryHoveredLineId.value ?? summaryPinnedLineId.value);
const lineHoverCardLineId = computed(() =>
  summaryActiveLineId.value ?? stationHoveredLineId.value ?? stationPinnedLineId.value,
);

const summaryHoveredLine = computed(() => {
  const lineId = summaryActiveLineId.value;
  if (!lineId) return undefined;
  return lineForHoverCard(lineId);
});

const lineHoverCardLine = computed(() => lineForHoverCard(lineHoverCardLineId.value));

function summaryFrequencyState(lineId: string | undefined): SummaryFrequencyState | undefined {
  return lineId ? summaryFrequencyStates.value.get(lineId) : undefined;
}

const summaryLineFrequencyProfile = computed(() => {
  const state = summaryFrequencyState(lineHoverCardLineId.value);
  return state?.status === "ready" ? state.profile : undefined;
});

const summaryLineFrequencyLoading = computed(() => {
  const lineId = lineHoverCardLineId.value;
  if (!lineId) return false;
  const state = summaryFrequencyState(lineId);
  return !state || state.status === "loading";
});

const summaryLineFrequencyUnavailable = computed(() => {
  const state = summaryFrequencyState(lineHoverCardLineId.value);
  return state?.status === "unavailable" || state?.status === "ready" && state.profile.status !== "ready";
});

interface NearbySummaryLineStation {
  key: string;
  station: GlobalMapStation;
  x: number;
  y: number;
}

function stationsForSummaryLine(lineId: string): GlobalMapStation[] {
  const line = props.cityViewNetwork?.linesById.get(lineId)
    ?? nearbySummaryLines.value.find((candidate) => candidate.id === lineId)
    ?? nearbySummaryHeavyLines.value.find((candidate) => candidate.id === lineId);
  if (!line) return [];

  const network = props.cityViewNetwork;
  if (network) {
    const orderedStations = line.stationIds
      .map((stationId) => network.stationsById.get(stationId))
      .filter((station): station is GlobalMapStation => Boolean(station));
    if (orderedStations.length > 0) return orderedStations;
    return network.stations.filter((station) => station.lineIds.includes(line.id));
  }

  const fallbackStations = [
    ...props.stations.flatMap((entry) => entry.memberStations),
    ...(props.supplementalStations ?? []).flatMap((candidate) => candidate.entry.memberStations),
  ];
  const seen = new Set<string>();
  return fallbackStations.filter((station) => {
    if (!station.lineIds.includes(line.id) || seen.has(station.id)) return false;
    seen.add(station.id);
    return true;
  });
}

function walkingStationsForSummaryLine(lineId: string): GlobalMapStation[] {
  const nearbyStations = [
    ...props.stations
      .filter((entry) => entry.insideRadius && entry.lines.some((line) => line.id === lineId))
      .flatMap((entry) => entry.memberStations),
    ...(props.supplementalStations ?? [])
      .filter((candidate) => candidate.lines.some((line) => line.id === lineId))
      .flatMap((candidate) => candidate.entry.memberStations),
  ];
  const seen = new Set<string>();
  const uniqueNearbyStations = nearbyStations.filter((station) => {
    if (seen.has(station.id)) return false;
    seen.add(station.id);
    return true;
  });
  return uniqueNearbyStations.length > 0 ? uniqueNearbyStations : stationsForSummaryLine(lineId);
}

const summaryHoveredLineStations = computed<NearbySummaryLineStation[]>(() => {
  const line = summaryHoveredLine.value;
  if (!line) return [];

  const fallbackStations = stationsForSummaryLine(line.id);
  const flowModel = renderedLineFlowModels.value.find((model) => model.lineId === line.id);
  if (flowModel?.stationAnchors?.length) {
    const fallbackById = new Map(fallbackStations.map((station) => [station.id, station]));
    return flowModel.stationAnchors.flatMap((anchor) => {
      const station = props.cityViewNetwork?.stationsById.get(anchor.stationId)
        ?? fallbackById.get(anchor.stationId);
      if (!station) return [];
      return [{
        key: anchor.key,
        station,
        x: anchor.x,
        y: anchor.y,
      }];
    });
  }

  return fallbackStations.map((station) => {
    const screen = worldToScreen({ x: station.worldX, y: station.worldY }, camera.value);
    return {
      key: `canonical:${station.id}`,
      station,
      x: screen.x,
      y: screen.y,
    };
  });
});

const summaryLineHoverActive = computed(() => Boolean(summaryActiveLineId.value));

const displayedStations = computed(() => {
  if (isPlacesPreview.value) return [];
  if (summaryLineHoverActive.value) return [];
  if (cityViewEnabled.value) {
    const visibleModes = cityViewVisibleModes.value;
    return cityViewStationEntries.value.filter((entry) =>
      shouldDisplayCityViewStation(entry, visibleModes) &&
      isCityViewStationInViewport(entry),
    );
  }
  if (!showMapStations.value) return [];
  return props.stations.filter((entry) =>
    entry.lines.some((line) => props.activeModes.includes(line.mode)) &&
    shouldDisplayStationForSchedule(entry.id),
  );
});
const cityIsochroneOrigins = computed<NearbyStationIsochroneOrigin[]>(() => {
  if (!cityViewEnabled.value || cityViewRadiusTransition.value || !isochroneEnabled.value || isPlacesPreview.value) return [];
  if (summaryLineHoverActive.value) return [];
  return displayedStations.value
    .filter(isCityViewIsochroneStation)
    .map((entry) => ({
      id: entry.station.id,
      lon: entry.station.lon,
      lat: entry.station.lat,
    }));
});
const displayedSupplementalStations = computed(() => isPlacesPreview.value || cityViewEnabled.value || summaryLineHoverActive.value ? [] : (props.supplementalStations ?? []).filter((candidate) =>
  (candidate.projected ? showProjectedStations.value : showMapStations.value) &&
  candidate.lines.some((line) => props.activeModes.includes(line.mode)) &&
  shouldDisplayStationForSchedule(candidate.id),
));
const heavyCandidateLinesById = computed(() => new Map(
  (props.supplementalStations ?? []).map((candidate) => [
    candidate.id,
    selectNearbyHeavyCandidateLines(candidate),
  ] as const),
));
const availableModes = computed(() => props.availableModes?.length ? props.availableModes : LINE_MODE_ORDER);
const nearbyIsochroneModes = computed<GlobalMapMode[]>(() => {
  const visibleModes = cityViewEnabled.value ? cityViewVisibleModes.value : props.activeModes;
  const cityModes = cityViewEnabled.value
    ? new Set(displayedStations.value.flatMap((entry) => entry.lines.map((line) => line.mode)))
    : undefined;
  return [...new Set(visibleModes)].filter((mode) =>
    availableModes.value.includes(mode) && (cityModes === undefined || cityModes.has(mode)),
  );
});
const nearbyIsochroneActiveModes = computed(() => nearbyIsochroneModes.value.filter((mode) =>
  isochroneSettings.value[mode].enabled,
));
const nearbyIsochroneNeighborhoodPreset = computed(() => {
  const preferredMode = nearbyIsochroneActiveModes.value.find((mode) => mode !== "BUS" && mode !== "NOCTILIEN")
    ?? nearbyIsochroneActiveModes.value[0];
  return preferredMode ? isochroneSettings.value[preferredMode].preset : "standard";
});
const nearbyNeighborhoodIsochroneMinutes = computed<NearbyWalkingMinutes[]>(() => [
  ...globalIsochronePresetMinutes(nearbyIsochroneNeighborhoodPreset.value),
]);
const nearbyIsochroneMinutes = computed<NearbyWalkingMinutes[]>(() => {
  const minutes = new Set<NearbyWalkingMinutes>();
  for (const mode of nearbyIsochroneActiveModes.value) {
    for (const minutesValue of globalIsochronePresetMinutes(isochroneSettings.value[mode].preset)) minutes.add(minutesValue);
  }
  return [...NEARBY_ISOCHRONE_MINUTES].filter((minutesValue) => minutes.has(minutesValue));
});
function nearbyIsochroneTransportLabel(mode: GlobalMapMode): string {
  const entries = displayedStations.value;
  const names = [...new Set(entries
    .flatMap((entry) => entry.lines)
    .filter((line) => line.mode === mode)
    .map((line) => lineDisplayLabel(line)))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "fr-FR", { numeric: true, sensitivity: "base" }));
  const visibleNames = names.slice(0, 4).join(" / ");
  const suffix = visibleNames ? `${visibleNames}${names.length > 4 ? " / …" : ""}` : "";
  return suffix ? `${modeLabel(mode)} ${suffix}` : modeLabel(mode);
}
const nearbyNeighborhoodIsochroneTransportLabel = computed(() => nearbyIsochroneActiveModes.value
  .map((mode) => nearbyIsochroneTransportLabel(mode))
  .join(" / "));
const hasVisiblePrimaryControls = computed(() => !isPlacesPreview.value && (
  props.showCityViewControl
  ||
  props.showIsochroneControl
  || props.showNoiseControl
  || props.showAirQualityControl
  || props.showDirectoryControl
  || props.showNeighborhoodScoreControl
  || props.showBasemapControl
  || props.showDisplayControl
  || props.showFullscreenControl
));
const canZoomIn = computed(() => camera.value.zoom < zoomRange.value.max - 0.001);
const canZoomOut = computed(() => camera.value.zoom > zoomRange.value.min + 0.001);
const zoomLevelLabel = computed(() => `${Math.round((2 ** (camera.value.zoom - zoomReference.value)) * 100)}%`);
const basemapToggleLabel = computed(() => basemapLayer.value === "plan"
  ? t("globalMap.page.layerSatellite")
  : t("globalMap.page.layerPlan"));
const activeStation = computed(() => {
  const stationId = pinnedStationId.value ?? hoveredStationId.value;
  return displayedStations.value.find((entry) => entry.id === stationId)
    ?? displayedSupplementalStations.value.find((candidate) => candidate.id === stationId)?.entry;
});
const clusterGroupingDistance = computed(() => props.clusterGroupingDistanceMeters ?? NEARBY_CLUSTER_GROUPING_DEFAULT_METERS);
const activeSupplementalStation = computed(() => {
  const stationId = pinnedStationId.value ?? hoveredStationId.value;
  return displayedSupplementalStations.value.find((candidate) => candidate.id === stationId);
});
const activeSupplementalAccess = computed(() => {
  const candidate = activeSupplementalStation.value;
  const entry = activeStation.value;
  return candidate && entry ? heavyAccessPresentation(candidate, entry) : undefined;
});
const pinnedHeavyStation = computed(() => {
  if (!pinnedStationId.value) return undefined;
  return displayedSupplementalStations.value.find((candidate) => candidate.id === pinnedStationId.value);
});
const renderedLineFlowModels = computed<GhostLineFlowModel[]>(() => {
  if (isPlacesPreview.value) return [];
  const activeFlowLineId = cityViewEnabled.value
    ? cityViewPreferredLineId.value
    : summaryActiveLineId.value;
  if (cityViewEnabled.value && !activeFlowLineId) return [];
  const models = props.lineFlowModels?.length
    ? props.lineFlowModels
    : props.lineFlowModel
      ? [props.lineFlowModel]
      : [];
  const seen = new Set<string>();
  return models.filter((model) => {
    if (activeFlowLineId && model.lineId !== activeFlowLineId) return false;
    const key = model.lineId ?? `anonymous:${seen.size}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});
const pinnedHeavyFeederLineKeys = computed(() => {
  const candidate = pinnedHeavyStation.value;
  if (!candidate) return new Set<string>();

  const accesses = heavyAccesses(candidate);

  const keys = new Set<string>();
  for (const access of accesses) {
    if (access.kind !== "connection") continue;
    if (access.feederLineId) keys.add(`id:${access.feederLineId}`);
    if (access.feederLineCode) keys.add(`code:${normalizeLineKey(access.feederLineCode)}`);
  }
  return keys;
});
const focusedHeavyFeederLineKeys = computed(() => {
  const candidate = pinnedHeavyStation.value;
  if (!candidate?.projected) return new Set<string>();

  // A projected station can serve several heavy lines. Keep the schedule
  // focus tied to the line represented by the clicked badge, rather than
  // dimming/keeping every feeder of a shared heavy station.
  const targetLine = candidate.lines[0];
  const accesses = targetLine
    ? candidate.accessAlternativesByLine?.[targetLine.id]
      ?? candidate.accessAlternatives
      ?? [candidate.accessByLine[targetLine.id] ?? candidate.access]
    : heavyAccesses(candidate);

  const keys = new Set<string>();
  for (const access of accesses) {
    if (access.kind !== "connection") continue;
    if (access.feederLineId) keys.add(`id:${access.feederLineId}`);
    if (access.feederLineCode) keys.add(`code:${normalizeLineKey(access.feederLineCode)}`);
  }
  return keys;
});
const focusedHeavyFeederLineIds = computed(() => {
  const feederKeys = focusedHeavyFeederLineKeys.value;
  if (feederKeys.size === 0) return new Set<string>();

  return new Set(
    props.stations
      .flatMap((entry) => entry.lines)
      .filter((line) => lineMatchesFeederKeys(line, feederKeys))
      .map((line) => line.id),
  );
});
const hasFocusedHeavyFeeder = computed(() => focusedHeavyFeederLineIds.value.size > 0);
const activeStationLineGroups = computed(() => {
  if (!activeStation.value) return [];
  return LINE_MODE_ORDER.flatMap((mode) => {
    const lines = activeStation.value!.lines.filter((line) => line.mode === mode && props.activeModes.includes(line.mode));
    return lines.length > 0 ? [{ mode, lines }] : [];
  });
});
const originScreen = computed(() => worldToScreen(lonLatToWorld(props.origin), camera.value));
// Eligibility and world projection do not depend on camera position.
const eligibleMapPlaces = computed(() => {
  if (summaryLineHoverActive.value || !props.showNearbyPlaces) return [];
  if (cityViewEnabled.value) {
    const activity = cityViewActivity.value;
    if (!activity) return [];
    // Reuse exact commune membership from the activity layer, including holes
    // and disconnected polygons; provider records can straddle city limits.
    return [...cityPlacesByNeighborhood.value.values()].flat().filter((place) =>
      isNearbyPlaceVisibleOnMap(place, props.showNearbyBenches === true, props.showNearbyParkings === true)
      && isNearbyPlaceActivity(place, activity))
      .sort((a, b) => a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name, "fr-FR"));
  }
  const radiusLimit = props.radius + NEARBY_MAP_MARGIN_METERS;
  return (props.places ?? []).filter((place) => {
    if (!isPlacesPreview.value && place.distanceMeters > radiusLimit) return false;
    if (showAccessibilityPlaces.value) return nearbyPlaceWheelchairAccess(place) !== undefined;
    const option = nearbyOptionalPlace(place);
    return (isPlacesPreview.value || !option || optionalPlaces.value[option])
      && isNearbyPlaceVisibleOnMap(place, props.showNearbyBenches === true, props.showNearbyParkings === true);
  });
});
const cityViewNeighborhoods = computed(() => {
  if (!irisDataset.value) return [];
  return selectIrisNeighborhoodsForPoint(irisDataset.value, props.origin, { scope: "commune" }).neighborhoods;
});
const cityViewWorldBounds = computed(() => boundsForIrisNeighborhoods(cityViewNeighborhoods.value));
interface CityViewCommune {
  code: string;
  name: string;
  departmentCode: string;
  neighborhoods: readonly IrisNeighborhood[];
  bounds: GlobalMapBounds;
  centroid: { lat: number; lon: number };
}

function boundsForCommuneNeighborhoods(neighborhoods: readonly IrisNeighborhood[]): GlobalMapBounds | undefined {
  return neighborhoods.reduce<GlobalMapBounds | undefined>((current, neighborhood) => {
    const next = boundsForIrisGeometry(neighborhood.geometry);
    if (!current) return next;
    return {
      minX: Math.min(current.minX, next.minX),
      minY: Math.min(current.minY, next.minY),
      maxX: Math.max(current.maxX, next.maxX),
      maxY: Math.max(current.maxY, next.maxY),
    };
  }, undefined);
}

// Build commune groups once per IRIS dataset. Camera changes only update the
// SVG transform in NearbyCityComparisonOverlay; they do not regroup or
// re-test every polygon.
const cityViewCommunes = computed<CityViewCommune[]>(() => {
  const neighborhoods = irisDataset.value?.neighborhoods ?? [];
  const groups = new Map<string, IrisDataset["neighborhoods"]>();
  for (const neighborhood of neighborhoods) {
    const existing = groups.get(neighborhood.communeCode);
    if (existing) existing.push(neighborhood);
    else groups.set(neighborhood.communeCode, [neighborhood]);
  }
  return [...groups.values()].flatMap((members) => {
    const first = members[0];
    // Only world-coordinate bounds are needed for neighbor selection. Avoid
    // serializing SVG paths for every commune until the selected neighbors
    // are actually rendered by NearbyCityComparisonOverlay.
    const bounds = first ? boundsForCommuneNeighborhoods(members) : undefined;
    if (!first || !bounds) return [];
    return [{
      code: first.communeCode,
      name: first.communeName,
      departmentCode: first.departmentCode,
      neighborhoods: members,
      bounds,
      centroid: {
        lon: members.reduce((sum, member) => sum + member.centroid[0], 0) / members.length,
        lat: members.reduce((sum, member) => sum + member.centroid[1], 0) / members.length,
      },
    }];
  });
});
const cityViewAirNoiseCommunes = computed<Readonly<Record<string, IrisAirNoiseStatistics>>>(() => {
  const raw = irisDataset.value?.airNoiseCommunes ?? {};
  const result: Record<string, IrisAirNoiseStatistics> = { ...raw };
  const parisArrondissements = Object.values(raw).filter((statistics) => /^751\d{2}$/u.test(statistics.inseeCode));
  if (!result["75056"] && parisArrondissements.length > 0) {
    const population = parisArrondissements.reduce((sum, statistics) => sum + Math.max(0, statistics.population), 0);
    const weight = (statistics: IrisAirNoiseStatistics): number => population > 0
      ? Math.max(0, statistics.population) / population
      : 1 / parisArrondissements.length;
    result["75056"] = {
      inseeCode: "75056",
      name: "Paris",
      departmentCode: "75",
      population,
      score: parisArrondissements.reduce((sum, statistics) => sum + statistics.score * weight(statistics), 0),
      airScore: parisArrondissements.reduce((sum, statistics) => sum + statistics.airScore * weight(statistics), 0),
      noiseScore: parisArrondissements.reduce((sum, statistics) => sum + statistics.noiseScore * weight(statistics), 0),
      dominantClass: parisArrondissements[0]!.dominantClass,
    };
  }
  return result;
});
const cityViewNearbyCommunes = computed<CityViewCommune[]>(() => {
  const current = cityViewNeighborhoods.value[0]?.communeCode;
  const cityBounds = cityViewWorldBounds.value;
  if (!current || !cityBounds) return [];
  const contextBounds = expandBounds(cityBounds, 1.25);
  const originWorld = lonLatToWorld(props.origin);
  return cityViewCommunes.value
    .filter((commune) => commune.code !== current && boundsIntersect(commune.bounds, contextBounds))
    .sort((left, right) => {
      const leftWorld = lonLatToWorld(left.centroid);
      const rightWorld = lonLatToWorld(right.centroid);
      const leftDistance = (leftWorld.x - originWorld.x) ** 2 + (leftWorld.y - originWorld.y) ** 2;
      const rightDistance = (rightWorld.x - originWorld.x) ** 2 + (rightWorld.y - originWorld.y) ** 2;
      return leftDistance - rightDistance || left.name.localeCompare(right.name, "fr-FR");
    })
    .slice(0, 12);
});
const cityViewNearbyCommuneNeighborhoods = computed<readonly IrisNeighborhood[]>(() =>
  cityViewNearbyCommunes.value.flatMap((commune) => commune.neighborhoods),
);
// The IRIS artifact already carries official commune populations. Expose the
// compact city-code map with the ranking action so the modal can compare
// places per resident without fetching or parsing the geometry a second time.
const cityViewPopulationByCode = computed<Readonly<Record<string, number>>>(() => {
  const communes = cityViewAirNoiseCommunes.value;
  if (!communes) return {};
  const populations: Record<string, number> = {};
  let parisPopulation = 0;
  for (const [code, statistics] of Object.entries(communes)) {
    if (!Number.isFinite(statistics.population) || statistics.population <= 0) continue;
    if (/^751\d{2}$/u.test(code)) parisPopulation += statistics.population;
    else populations[code] = statistics.population;
  }
  if (parisPopulation > 0) populations["75056"] = parisPopulation;
  return populations;
});
// Both sides of the comparison can point at any Île-de-France commune, so the
// picker lists the full IRIS commune set with the official populations. The
// same catalogue backs the page-level "choose a city" picker.
const cityViewComparisonCityOptions = computed<readonly NearbyCityComparisonCityOption[]>(() => buildNearbyCityOptions({
  communes: irisDataset.value?.neighborhoods ?? [],
  statistics: cityViewAirNoiseCommunes.value,
  departmentNames: irisDataset.value?.departmentNames,
}));
// Geometry membership is independent of the selected activity. Reject by
// bounding box before the exact polygon test and reuse membership on toggles.
const cityPlacesByNeighborhood = computed(() => {
  const neighborhoods = cityViewNeighborhoods.value.map((item) => ({ item, bounds: boundsForIrisGeometry(item.geometry) }));
  const groups = new Map<string, NearbyPlace[]>();
  for (const place of props.cityViewPlaces ?? []) {
    const point = lonLatToWorld(place);
    const match = neighborhoods.find(({ item, bounds }) =>
      point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY
      && pointInIrisGeometry(place, item.geometry));
    if (!match) continue;
    const code = match.item.codeIris;
    const group = groups.get(code);
    if (group) group.push(place);
    else groups.set(code, [place]);
  }
  return groups;
});
const cityActivityCounts = computed(() => {
  const counts: Record<string, number> = {};
  const totals: Record<string, number> = {};
  const activity = cityViewActivity.value;
  if (!cityViewEnabled.value || !activity) return { counts, totals };
  for (const [code, places] of cityPlacesByNeighborhood.value) {
    totals[code] = places.length;
    counts[code] = places.filter((place) => isNearbyPlaceActivity(place, activity)).length;
  }
  return { counts, totals };
});
const cityViewTransportStations = computed<IrisTransportStation[]>(() => {
  if (props.cityViewNetwork) {
    return transportStationsFromNetwork(props.cityViewNetwork.stations, props.cityViewNetwork.linesById);
  }
  const entries = props.cityViewStations ?? props.stations;
  return entries.flatMap((entry) => entry.memberStations.map((station) => ({
    lon: station.lon,
    lat: station.lat,
    lineIds: station.lineIds,
    lines: entry.lines,
  })));
});
const cityViewTransportModes = computed<NearbyCityInfoCardTransportMode[]>(() => {
  const counts = countIrisTransportInNeighborhoods(cityViewNeighborhoods.value, cityViewTransportStations.value);
  return GLOBAL_MAP_MODE_ORDER.flatMap((mode) => {
    const count = counts.modes[mode];
    return typeof count === "number" && count > 0
      ? [{ mode, label: modeLabel(mode), count }]
      : [];
  });
});
// Resolve display labels once per network so the expandable comparison rows
// only map ids to already-computed labels.
const cityViewComparisonLineLabels = computed<ReadonlyMap<string, string>>(() => {
  const labels = new Map<string, string>();
  for (const line of props.cityViewNetwork?.linesById.values() ?? []) {
    const label = lineDisplayLabel(line);
    if (label) labels.set(line.id, label);
  }
  for (const entry of props.cityViewStations ?? props.stations) {
    for (const line of entry.lines) {
      if (labels.has(line.id)) continue;
      const label = lineDisplayLabel(line);
      if (label) labels.set(line.id, label);
    }
  }
  return labels;
});
const cityViewCommerceCount = computed<number | undefined>(() => {
  if (typeof props.cityViewCommerceTotal === "number" && Number.isFinite(props.cityViewCommerceTotal)) {
    return props.cityViewCommerceTotal;
  }
  if (!props.cityViewCommerceCounts) return undefined;
  return cityViewNeighborhoods.value.reduce((sum, neighborhood) => sum + (props.cityViewCommerceCounts?.[neighborhood.codeIris] ?? 0), 0);
});
const cityViewGreenSpaceCount = computed<number | undefined>(() => {
  if (!props.cityViewPlaces) return undefined;
  if (props.cityViewPlaces.length === 0 && cityViewCommerceCount.value === undefined) return undefined;
  return props.cityViewPlaces.filter(isNearbyPlaceGreenSpace).length;
});
const nearbyMapScale = computed(() => {
  const referenceWorld = lonLatToWorld(props.origin);
  const metersPerPixel = worldUnitsToMeters(
    1 / worldScaleAtZoom(camera.value.zoom),
    referenceWorld,
  );
  const maxWidthPx = Math.max(
    96,
    Math.min(
      NEARBY_MAP_SCALE_MAX_WIDTH_PX,
      camera.value.viewportWidthCssPx - NEARBY_MAP_SCALE_HORIZONTAL_RESERVE_PX,
    ),
  );
  const distanceMeters = chooseNearbyMapScaleDistance(
    metersPerPixel * maxWidthPx,
    metersPerPixel,
    maxWidthPx,
  );

  return {
    barWidthPx: Math.max(1, Math.round(distanceMeters / metersPerPixel)),
    distanceLabel: formatNearbyMapScaleDistance(distanceMeters),
    midpointLabel: formatNearbyMapScaleDistance(distanceMeters / 2),
  };
});
const cityViewInfoCard = computed<{ cityName: string; ariaLabel: string; eyebrow: string; items: NearbyCityInfoCardItem[] } | undefined>(() => {
  const firstNeighborhood = cityViewNeighborhoods.value[0];
  if (!firstNeighborhood) return undefined;

  const statistics = cityViewAirNoiseCommunes.value[firstNeighborhood.communeCode];
  const scoreLabel = (score: number): string => n(score, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const environmentValue = statistics && Number.isFinite(statistics.airScore) && Number.isFinite(statistics.noiseScore)
    ? t("nearbyStations.cityInfoEnvironmentValue", {
        air: scoreLabel(statistics.airScore),
        noise: scoreLabel(statistics.noiseScore),
      })
    : t("nearbyStations.cityInfoUnavailable");
  const securityValue = typeof cityViewSecurityScore.value === "number" && Number.isFinite(cityViewSecurityScore.value)
    ? `${scoreLabel(cityViewSecurityScore.value)}/10`
    : t("nearbyStations.cityInfoUnavailable");

  return {
    cityName: statistics?.name || firstNeighborhood.communeName,
    ariaLabel: t("nearbyStations.cityInfoAria", { city: statistics?.name || firstNeighborhood.communeName }),
    eyebrow: t("nearbyStations.cityInfoEyebrow"),
    items: [
      {
        label: t("nearbyStations.cityInfoPopulation"),
        value: statistics && Number.isFinite(statistics.population) ? n(Math.round(statistics.population)) : t("nearbyStations.cityInfoUnavailable"),
      },
      {
        label: t("nearbyStations.cityInfoDepartment"),
        value: firstNeighborhood.departmentCode,
      },
      ...(cityViewTransportModes.value.length > 0
        ? [{
            label: t("nearbyStations.cityInfoTransport"),
            transportModes: cityViewTransportModes.value,
          }]
        : []),
      {
        label: t("nearbyStations.cityInfoSecurity"),
        value: securityValue,
      },
      {
        label: t("nearbyStations.cityInfoCommerce"),
        value: cityViewCommerceCount.value === undefined
          ? t("nearbyStations.cityInfoUnavailable")
          : n(cityViewCommerceCount.value),
        action: "places-ranking",
        actionLabel: t("nearbyStations.placesRanking.title"),
      },
      {
        label: t("nearbyStations.cityInfoEnvironment"),
        value: environmentValue,
      },
    ],
  };
});
// The comparison can target any Île-de-France commune. When a side still shows
// the scanned city, it reuses the live city view so the numbers stay aligned
// with the map; another commune is resolved from the IRIS catalogue.
const cityViewComparisonSide = computed(() => ({
  current: cityViewComparisonEffectiveCurrentCode.value,
  target: cityViewComparisonTargetCode.value,
}));
/** Reference side: an explicit choice, otherwise the commune being scanned. */
const cityViewComparisonEffectiveCurrentCode = computed<string | undefined>(() =>
  cityViewComparisonCurrentCode.value ?? cityViewNeighborhoods.value[0]?.communeCode);
function comparisonCommuneFor(code: string | undefined) {
  if (!code) return undefined;
  return cityViewCommunes.value.find((commune) => commune.code === code);
}
function comparisonNeighborhoodsFor(code: string | undefined): readonly IrisNeighborhood[] {
  return comparisonCommuneFor(code)?.neighborhoods ?? cityViewNeighborhoods.value;
}
function comparisonCityFor(code: string | undefined): NearbyCityComparisonCity | undefined {
  if (!code) return undefined;
  const commune = comparisonCommuneFor(code);
  const statistics = cityViewAirNoiseCommunes.value[code];
  const neighborhood = comparisonNeighborhoodsFor(code)[0];
  return {
    code,
    name: statistics?.name || commune?.name || neighborhood?.communeName || code,
    departmentCode: commune?.departmentCode ?? neighborhood?.departmentCode ?? statistics?.departmentCode ?? "",
  };
}
const cityViewComparisonCurrent = computed<NearbyCityComparisonCity | undefined>(() =>
  comparisonCityFor(cityViewComparisonEffectiveCurrentCode.value));
const cityViewComparisonTarget = computed<NearbyCityComparisonCity | undefined>(() =>
  comparisonCityFor(cityViewComparisonTargetCode.value));
/** Async data of one side, always read through the per-code cache. */
function comparisonDataFor(code: string | undefined): {
  loading: boolean;
  security?: number;
  placeCounts?: NearbyCityComparisonPlaceCounts;
} {
  if (!code) return { loading: false };
  const cached = cityViewComparisonDataCache.value[code] ?? {};
  return {
    ...cached,
    loading: cityViewComparisonLoadingCodes.value.includes(code),
  };
}
function comparisonStatisticsFor(code: string | undefined) {
  return code ? cityViewAirNoiseCommunes.value[code] : undefined;
}
/**
 * Build the expandable "transport lines" detail for one commune. Rail-like
 * modes keep one badge per line, dense networks (bus, Noctilien) only expose
 * how many lines they add, and every mode stays in its own group.
 */
function comparisonTransportZone(
  neighborhoods: readonly IrisNeighborhood[],
  loading: boolean,
): NearbyCityComparisonDetailZone {
  const detail = nearbyCityComparisonLineDetail(
    filterIrisTransportStationsInNeighborhoods(neighborhoods, cityViewTransportStations.value),
  );
  return {
    loading,
    count: detail.lines.length,
    groups: detail.groups.map((group) => ({
      mode: group.mode,
      count: group.lines.length,
      labels: group.lines.map((line) =>
        cityViewComparisonLineLabels.value.get(line.id) ?? nearbyCityComparisonLineLabel(line)),
      icons: group.lines.map((line) => {
        const networkLine = props.cityViewNetwork?.linesById.get(line.id);
        return networkLine ? { ...networkLine } : { ...line };
      }),
    })),
  };
}

/**
 * Merge both compared communes into one row per transport network, in network
 * order. A network only appears when at least one of the two cities serves it.
 */
function comparisonNetworkRows(
  current: NearbyCityComparisonDetailZone,
  target: NearbyCityComparisonDetailZone,
): NearbyCityComparisonNetworkRow[] {
  const modes = [...new Set([
    ...current.groups.map((group) => group.mode),
    ...target.groups.map((group) => group.mode),
  ])].sort((left, right) =>
    LINE_MODE_ORDER.indexOf(left as GlobalMapMode) - LINE_MODE_ORDER.indexOf(right as GlobalMapMode));
  const zoneLines = (
    zone: NearbyCityComparisonDetailZone,
    mode: string,
  ): NearbyCityComparisonNetworkLines => {
    const group = zone.groups.find((candidate) => candidate.mode === mode);
    return {
      count: group?.count ?? 0,
      lines: group?.icons ?? [],
      labels: group?.labels ?? [],
    };
  };
  return modes.map((mode) => ({
    mode,
    aggregated: COMPARISON_AGGREGATED_MODES.has(mode),
    current: zoneLines(current, mode),
    target: zoneLines(target, mode),
  }));
}

// Comparison metrics are independent from the camera. Panning only changes
// the Deck/SVG transforms; it never re-counts places or recalculates rates.
const cityViewComparisonRows = computed<NearbyCityComparisonMetric[]>(() => {
  const currentCode = cityViewComparisonCurrent.value?.code;
  const targetCode = cityViewComparisonTarget.value?.code;
  if (!currentCode || !targetCode) return [];
  const currentStatistics = comparisonStatisticsFor(currentCode);
  const targetStatistics = comparisonStatisticsFor(targetCode);
  const currentData = comparisonDataFor(currentCode);
  const targetData = comparisonDataFor(targetCode);
  const currentTransport = countIrisTransportInNeighborhoods(
    comparisonNeighborhoodsFor(currentCode),
    cityViewTransportStations.value,
  );
  const targetTransport = countIrisTransportInNeighborhoods(
    comparisonNeighborhoodsFor(targetCode),
    cityViewTransportStations.value,
  );
  const formatNumber = (value: number | undefined): string => typeof value === "number" && Number.isFinite(value)
    ? n(Math.round(value))
    : t("nearbyStations.cityComparison.missingValue");
  const formatScore = (value: number | undefined): string => typeof value === "number" && Number.isFinite(value)
    ? `${n(value, { maximumFractionDigits: 1 })}/10`
    : t("nearbyStations.cityComparison.missingValue");
  // Per-capita rows only show the ratio: the "/ 1 000 habitants" unit lives in
  // the metric label, and every displayed ratio is capped at one decimal.
  const formatPerThousand = (value: number | undefined): string => typeof value === "number" && Number.isFinite(value)
    ? n(value, { maximumFractionDigits: 1 })
    : t("nearbyStations.cityComparison.missingValue");
  const metric = (
    id: NearbyCityComparisonMetricIcon,
    label: string,
    currentNumeric: number | undefined,
    targetNumeric: number | undefined,
    options: {
      format?: (value: number | undefined) => string;
      scaleMax?: number;
      currentLoading?: boolean;
      targetLoading?: boolean;
    } = {},
  ): NearbyCityComparisonMetric => ({
    id,
    label,
    icon: id,
    currentNumeric,
    targetNumeric,
    currentValue: (options.format ?? formatNumber)(currentNumeric),
    targetValue: (options.format ?? formatNumber)(targetNumeric),
    higherIsBetter: true,
    scaleMax: options.scaleMax,
    currentLoading: options.currentLoading,
    targetLoading: options.targetLoading,
  });
  const currentZone = comparisonTransportZone(comparisonNeighborhoodsFor(currentCode), false);
  const targetZone = comparisonTransportZone(comparisonNeighborhoodsFor(targetCode), Boolean(targetData.loading));
  const transportDetail: NearbyCityComparisonDetail = {
    current: currentZone,
    target: targetZone,
    networks: comparisonNetworkRows(currentZone, targetZone),
  };
  return [
    metric("population", t("nearbyStations.cityComparison.population"), currentStatistics?.population, targetStatistics?.population),
    {
      ...metric("transport-lines", t("nearbyStations.cityComparison.transportLines"), currentTransport.lineCount, targetTransport.lineCount),
      detail: transportDetail,
    },
    metric(
      "transport-stations",
      t("nearbyStations.cityComparison.transportStationsPerCapita"),
      perThousandInhabitants(currentTransport.stationCount, currentStatistics?.population),
      perThousandInhabitants(targetTransport.stationCount, targetStatistics?.population),
      { format: formatPerThousand },
    ),
    metric(
      "security",
      t("nearbyStations.cityComparison.security"),
      currentData.security,
      targetData.security,
      { format: formatScore, scaleMax: 10, currentLoading: currentData.loading, targetLoading: targetData.loading },
    ),
    metric(
      "commerce",
      t("nearbyStations.cityComparison.commercePerCapita"),
      perThousandInhabitants(currentData.placeCounts?.commerce, currentStatistics?.population),
      perThousandInhabitants(targetData.placeCounts?.commerce, targetStatistics?.population),
      { format: formatPerThousand, currentLoading: currentData.loading, targetLoading: targetData.loading },
    ),
    metric(
      "green-spaces",
      t("nearbyStations.cityComparison.greenSpacesPerCapita"),
      perThousandInhabitants(currentData.placeCounts?.greenSpaces, currentStatistics?.population),
      perThousandInhabitants(targetData.placeCounts?.greenSpaces, targetStatistics?.population),
      { format: formatPerThousand, currentLoading: currentData.loading, targetLoading: targetData.loading },
    ),
    metric("air", t("nearbyStations.cityComparison.air"), currentStatistics?.airScore, targetStatistics?.airScore, { format: formatScore, scaleMax: 10 }),
    metric("noise", t("nearbyStations.cityComparison.noise"), currentStatistics?.noiseScore, targetStatistics?.noiseScore, { format: formatScore, scaleMax: 10 }),
  ];
});
const environmentQuery = computed(() => {
  const cityBounds = cityViewEnabled.value && cityViewWorldBounds.value
    ? expandBounds(cityViewWorldBounds.value, 0.12)
    : undefined;
  if (!cityBounds) return { origin: props.origin, radius: props.radius };

  const centerWorld = {
    x: (cityBounds.minX + cityBounds.maxX) / 2,
    y: (cityBounds.minY + cityBounds.maxY) / 2,
  };

  const queryOrigin = worldToLonLat(centerWorld);
  const cornerCoordinates = [
    worldToLonLat({ x: cityBounds.minX, y: cityBounds.minY }),
    worldToLonLat({ x: cityBounds.minX, y: cityBounds.maxY }),
    worldToLonLat({ x: cityBounds.maxX, y: cityBounds.minY }),
    worldToLonLat({ x: cityBounds.maxX, y: cityBounds.maxY }),
  ];
  const radiusMeters = Math.max(
    ...cornerCoordinates.map((corner) => getCoordinatesDistanceMeters(
      queryOrigin.lat,
      queryOrigin.lon,
      corner.lat,
      corner.lon,
    )),
  );
  return {
    origin: queryOrigin,
    radius: Math.max(100, Math.ceil(radiusMeters)),
  };
});
const nearbyBasemapCoverBounds = computed<GlobalMapBounds>(() => {
  if (cityViewEnabled.value && cityViewWorldBounds.value) {
    const expanded = expandBounds(cityViewWorldBounds.value, CITY_VIEW_NEIGHBOR_CONTEXT_RATIO);
    return {
      minX: Math.max(0, expanded.minX),
      minY: Math.max(0, expanded.minY),
      maxX: Math.min(1, expanded.maxX),
      maxY: Math.min(1, expanded.maxY),
    };
  }
  const originWorld = lonLatToWorld(props.origin);
  // The pointer-anchored camera can shift slightly while zooming and the
  // minimum zoom exposes 20% more world area. Keep a 1.5x safety envelope so
  // the decoded fallback still covers every viewport edge after a long 10x
  // zoom-in followed by a complete dezoom.
  const radiusMeters = (
    Math.max(props.radius, NEARBY_DIRECTORY_MAX_RADIUS_METERS) + NEARBY_MAP_MARGIN_METERS
  ) * 1.5;
  const radiusWorld = metersToWorldUnits(radiusMeters, originWorld);
  return {
    minX: Math.max(0, originWorld.x - radiusWorld),
    minY: Math.max(0, originWorld.y - radiusWorld),
    maxX: Math.min(1, originWorld.x + radiusWorld),
    maxY: Math.min(1, originWorld.y + radiusWorld),
  };
});
const nearbyCoverSourceZoom = computed(() => Math.max(0, Math.ceil(
  nearbyBasemapReferenceCamera.value?.zoom ?? camera.value.zoom,
) - 1));
const circleDiameter = computed(() => {
  const east = lonLatToWorld({
    lon: props.origin.lon + longitudeDelta(props.origin.lat, props.radius),
    lat: props.origin.lat,
  });
  const center = lonLatToWorld(props.origin);
  return Math.abs(worldToScreen(east, camera.value).x - worldToScreen(center, camera.value).x) * 2;
});
const walkingMapPaths = computed(() => {
  if (cityViewEnabled.value || summaryLineHoverActive.value || (isPlacesPreview.value && !props.walkingRoute)) return [];
  const width = camera.value.viewportWidthCssPx;
  const height = camera.value.viewportHeightCssPx;
  const segments: NearbyWalkingMapSegment[] = [
    ...(isPlacesPreview.value ? [] : (props.travelWalkingSegments ?? [])),
    ...(props.walkingRoute
      ? [{
        id: `walking-route:${props.walkingRoute.id ?? "selected"}`,
        from: props.walkingRoute.coordinates[0]!,
        to: props.walkingRoute.coordinates.at(-1)!,
        coordinates: props.walkingRoute.coordinates,
      }]
      : []),
  ];
  return segments.flatMap((segment) => {
    const coordinates = segment.coordinates && segment.coordinates.length >= 2
      ? segment.coordinates
      : [segment.from, segment.to];
    const projected = coordinates.map((coordinate) => worldToScreen(lonLatToWorld(coordinate), camera.value));
    if (projected.length < 2 || projected.some((point) => ![point.x, point.y].every(Number.isFinite))) return [];
    const from = projected[0]!;
    const to = projected.at(-1)!;
    return [{
      ...segment,
      d: projected.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" "),
      from,
      to,
      width,
      height,
    }];
  });
});
const isochroneViewport = computed(() => ({
  // Keep the SVG coordinate system in lockstep with the camera. The map
  // element's client dimensions are not reactive, so reading them directly
  // here leaves the old viewBox behind after a fullscreen resize while the
  // camera (and every HTML marker) has already moved to the new viewport.
  width: camera.value.viewportWidthCssPx,
  height: camera.value.viewportHeightCssPx,
}));
const {
  status: isochroneStatus,
  response: isochroneResponse,
  error: isochroneError,
  retry: retryIsochrones,
} = useNearbyIsochrones(
  () => props.origin,
  () => isochroneEnabled.value && nearbyIsochroneActiveModes.value.length > 0 && !cityViewEnabled.value && !isPlacesPreview.value && props.showIsochroneControl,
  () => nearbyNeighborhoodIsochroneMinutes.value,
);
const {
  status: cityIsochroneStatus,
  responses: cityIsochroneResponses,
  error: cityIsochroneError,
  retry: retryCityIsochrones,
} = useNearbyStationIsochrones(
  cityIsochroneOrigins,
  () => isochroneEnabled.value && nearbyIsochroneActiveModes.value.length > 0 && cityViewEnabled.value && !cityViewRadiusTransition.value && !isPlacesPreview.value && props.showIsochroneControl,
  () => nearbyIsochroneMinutes.value,
);
const {
  status: noiseZonesStatus,
  response: noiseZonesResponse,
  retry: retryNoiseZones,
} = useNearbyNoiseZones(
  () => environmentQuery.value.origin,
  () => !isPlacesPreview.value && (
    (cityViewEnabled.value && cityViewNeighborhoods.value.length > 0)
    || (noiseZonesEnabled.value && props.showNoiseControl)
    || (airQualityZonesEnabled.value && props.showAirQualityControl)
  ),
  () => environmentQuery.value.radius,
);
const isochroneConfigurationError = computed(() => {
  const error = cityViewEnabled.value ? cityIsochroneError.value : isochroneError.value;
  return isNearbyIsochroneErrorCode(error, "not-configured");
});
const activeIsochroneStatus = computed(() => cityViewEnabled.value ? cityIsochroneStatus.value : isochroneStatus.value);
const isochroneQuotaExceeded = computed(() => {
  const error = cityViewEnabled.value ? cityIsochroneError.value : isochroneError.value;
  return isNearbyIsochroneErrorCode(error, "quota");
});
const nearbyIsochronePanelStatus = computed<GlobalIsochroneStatus>(() => {
  if (nearbyIsochroneActiveModes.value.length === 0) return "idle";
  const status = activeIsochroneStatus.value;
  if (status === "loading") return "loading";
  if (status === "ready") return "ready";
  if (status === "error") return "error";
  return "idle";
});
const nearbyIsochronePanelCoverage = computed(() => {
  const total = cityViewEnabled.value ? cityIsochroneOrigins.value.length : 1;
  const available = cityViewEnabled.value
    ? cityIsochroneResponses.value.length
    : isochroneResponse.value ? 1 : 0;
  return {
    total,
    available,
    missing: Math.max(0, total - available),
    missingScopes: [],
  };
});
const nearbyIsochronePanelCopy = computed<TransportIsochronePanelCopy>(() => ({
  title: t("globalMap.radar.title"),
  description: t("globalMap.radar.description"),
  modesAria: t("globalMap.radar.modesAria"),
  enableMode: t("globalMap.radar.enableMode", { mode: "{mode}" }),
  durationMode: t("globalMap.radar.durationMode", { mode: "{mode}" }),
  minutes: t("globalMap.radar.minutes", { count: "{count}" }),
  independentFilters: t("nearbyStations.walkingZonesIndependentFilters"),
  details: t("globalMap.radar.details"),
  retry: t("nearbyStations.walkingZonesRetry"),
  noticeTitle: isochroneConfigurationError.value || isochroneQuotaExceeded.value
    ? t("nearbyStations.walkingZonesConfigTitle")
    : t("nearbyStations.walkingZonesUnavailable"),
  errorBody: isochroneConfigurationError.value
    ? t("nearbyStations.walkingZonesConfigBody")
    : t(isochroneQuotaExceeded.value ? "nearbyStations.walkingZonesQuotaExceeded" : "nearbyStations.walkingZonesUnavailable"),
  noApproximation: "",
  statusLabel: nearbyIsochronePanelStatus.value === "loading"
    ? t("nearbyStations.walkingZonesLoading")
    : nearbyIsochronePanelStatus.value === "error"
      ? t(isochroneQuotaExceeded.value ? "nearbyStations.walkingZonesQuotaExceeded" : "nearbyStations.walkingZonesUnavailable")
      : undefined,
}));
const nearbyIsochroneScopeLabel = computed(() => cityViewEnabled.value
  ? t("nearbyStations.cityViewLabel")
  : t("nearbyStations.neighborhoodViewLabel"));
const isochronePaths = computed(() => {
  if (cityViewEnabled.value || !isochroneEnabled.value || isochroneStatus.value !== "ready" || !isochroneResponse.value) return [];
  const presetMinutes = nearbyNeighborhoodIsochroneMinutes.value;
  return [...isochroneResponse.value.zones]
    .sort((left, right) => right.minutes - left.minutes)
    .map((zone) => ({
      minutes: zone.minutes,
      zoneIndex: Math.max(0, presetMinutes.indexOf(zone.minutes)),
      transport: nearbyNeighborhoodIsochroneTransportLabel.value,
      d: serializeIsochroneGeometry(zone.geometry),
    }))
    .filter((zone) => zone.d.length > 0);
});
const cityIsochronePaths = computed(() => {
  if (!cityViewEnabled.value || !isochroneEnabled.value || cityIsochroneStatus.value !== "ready") return [];

  // Each visible transport keeps its own three-zone preset. A compound SVG
  // path only groups contours; it still strokes every original ring and
  // leaves seams inside overlapping stations. The union removes those
  // internal boundaries before each mode-specific contour is rendered.
  const geometriesByMode = new Map<GlobalMapMode, Map<NearbyWalkingMinutes, NearbyIsochroneGeometry[]>>();
  for (const station of cityIsochroneResponses.value) {
    const entry = cityViewStationEntries.value.find((candidate) => candidate.id === station.stationId);
    for (const mode of nearbyIsochroneActiveModes.value) {
      if (!entry?.lines.some((line) => line.mode === mode)) continue;
      for (const minutes of globalIsochronePresetMinutes(isochroneSettings.value[mode].preset)) {
        const zone = station.response.zones.find((candidate) => candidate.minutes === minutes);
        if (!zone) continue;
        const geometriesByMinutes = geometriesByMode.get(mode) ?? new Map<NearbyWalkingMinutes, NearbyIsochroneGeometry[]>();
        const geometries = geometriesByMinutes.get(minutes) ?? [];
        geometries.push(zone.geometry);
        geometriesByMinutes.set(minutes, geometries);
        geometriesByMode.set(mode, geometriesByMinutes);
      }
    }
  }

  return nearbyIsochroneActiveModes.value.flatMap((mode) => {
    const presetMinutes = globalIsochronePresetMinutes(isochroneSettings.value[mode].preset);
    return [...presetMinutes]
      .sort((left, right) => right - left)
      .flatMap((minutes) => {
        const geometry = mergeNearbyIsochroneGeometries(geometriesByMode.get(mode)?.get(minutes) ?? []);
        const d = geometry ? serializeIsochroneGeometry(geometry) : "";
        if (!d) return [];
        return [{
          mode,
          minutes,
          zoneIndex: presetMinutes.indexOf(minutes),
          transport: nearbyIsochroneTransportLabel(mode),
          d,
        }];
      });
  });
});
const isochroneTransform = computed(() => {
  const { centerWorldX, centerWorldY, zoom, viewportWidthCssPx, viewportHeightCssPx } = camera.value;
  const scale = worldScaleAtZoom(zoom);
  return `matrix(${scale} 0 0 ${scale} ${viewportWidthCssPx / 2 - centerWorldX * scale} ${viewportHeightCssPx / 2 - centerWorldY * scale})`;
});
const projectedEnvironmentCells = computed<NearbyProjectedEnvironmentCell[]>(() => {
  const response = noiseZonesResponse.value;
  if (noiseZonesStatus.value !== "ready" || !response) return [];
  return response.cells.flatMap((cell: NearbyNoiseGridCell) => {
    const airQualityLevel = parseNearbyAirQualityLevel(cell.value);
    if (airQualityLevel === undefined) return [];
    const minLon = response.bbox[0] + cell.column * response.cellSizeDegrees;
    const maxLon = minLon + response.cellSizeDegrees;
    const minLat = response.bbox[1] + cell.row * response.cellSizeDegrees;
    const maxLat = minLat + response.cellSizeDegrees;
    const topLeft = lonLatToWorld({ lon: minLon, lat: maxLat });
    const bottomRight = lonLatToWorld({ lon: maxLon, lat: minLat });
    const width = Math.max(0, bottomRight.x - topLeft.x);
    const height = Math.max(0, bottomRight.y - topLeft.y);
    return width > 0 && height > 0
      ? [{ ...cell, airQualityLevel, x: topLeft.x, y: topLeft.y, width, height }]
      : [];
  });
});
const noiseZoneCells = computed(() => {
  if (!noiseZonesEnabled.value) return [];
  return projectedEnvironmentCells.value;
});
const airQualityZoneCells = computed(() => {
  if (!airQualityZonesEnabled.value) return [];
  return projectedEnvironmentCells.value;
});
const cityViewAirNoiseNeighborhoods = computed(() => {
  if (!cityViewEnabled.value || cityViewNeighborhoods.value.length === 0) return undefined;
  if (noiseZonesStatus.value !== "ready" || !noiseZonesResponse.value) return undefined;
  return scoreIrisNeighborhoodsFromGrid(cityViewNeighborhoods.value, noiseZonesResponse.value);
});
const NOISE_LEVELS = [1, 2, 3] as const;
const AIR_QUALITY_LEVELS = [1, 2, 3] as const;
function noiseLevelLabel(level: NearbyNoiseLevel): string {
  return level === 1
    ? t("nearbyStations.noiseZonesLevel1")
    : level === 2
      ? t("nearbyStations.noiseZonesLevel2")
      : t("nearbyStations.noiseZonesLevel3");
}
function airQualityLevelLabel(level: NearbyAirQualityLevel): string {
  return level === 1
    ? t("nearbyStations.airQualityZonesLevel1")
    : level === 2
      ? t("nearbyStations.airQualityZonesLevel2")
      : t("nearbyStations.airQualityZonesLevel3");
}
const hoveredEnvironmentTooltip = computed(() => {
  const hovered = hoveredEnvironment.value;
  if (!hovered) return undefined;
  return hovered.layer === "noise"
    ? {
      layer: hovered.layer,
      level: hovered.level,
      text: t("nearbyStations.noiseZonesTooltip", { level: noiseLevelLabel(hovered.level) }),
    }
    : {
      layer: hovered.layer,
      level: hovered.level,
      text: t("nearbyStations.airQualityZonesTooltip", { level: airQualityLevelLabel(hovered.level) }),
    };
});
function overlayTooltipStyle(position: ScreenPoint | undefined): Record<string, string> {
  if (!position) return {};
  const width = camera.value.viewportWidthCssPx;
  const height = camera.value.viewportHeightCssPx;
  // Clamp the tooltip's center using its maximum width so a long translated
  // label cannot leave the map when the pointer is close to an edge.
  const tooltipMaxWidth = Math.min(250, Math.max(96, width - 24));
  const edgePadding = 12;
  const horizontalCenter = clamp(position.x, edgePadding + tooltipMaxWidth / 2, width - edgePadding - tooltipMaxWidth / 2);
  const vertical = position.y < 84 ? "translateY(12px)" : "translateY(calc(-100% - 12px))";
  return {
    left: `${horizontalCenter}px`,
    maxWidth: `${tooltipMaxWidth}px`,
    top: `${Math.max(8, Math.min(height - 8, position.y))}px`,
    transform: `translateX(-50%) ${vertical}`,
  };
}
const isochroneTooltipStyle = computed(() => overlayTooltipStyle(hoveredIsochrone.value?.position));
const environmentTooltipStyle = computed(() => overlayTooltipStyle(hoveredEnvironment.value?.position));

function isNearbyIsochroneErrorCode(error: unknown, code: string): boolean {
  return error instanceof NearbyIsochronesError
    ? error.code === code
    : Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === code);
}

watch(isochroneConfigurationError, (isMissing) => {
  if (isMissing) isochroneConfigurationModalOpen.value = true;
  else if (activeIsochroneStatus.value !== "error") isochroneConfigurationModalOpen.value = false;
});

watch(
  () => [props.origin.lon, props.origin.lat, props.radius, root.value?.clientWidth, root.value?.clientHeight],
  () => {
    if (cityViewEnabled.value && irisDataset.value) {
      cityViewSelectionExact.value = selectIrisNeighborhoodsForPoint(
        irisDataset.value,
        props.origin,
        { scope: "commune" },
      ).exact;
    }
    if (props.suspendResizeWork) return;
    void nextTick(() => {
      fitView(!isPlacesPreview.value);
      if (isPlacesPreview.value && props.selectedPlaceId) focusSelectedPlace(true);
    });
  },
);

watch(
  () => [props.origin.lon, props.origin.lat] as const,
  ([lon, lat]) => {
    if (!cityViewEnabled.value) return;
    closeCityComparison();
    cityViewSecurityScore.value = undefined;
    const token = ++cityViewSecurityRequestToken;
    void loadCityViewSecurityScore(token, { lon, lat });
  },
);

watch(
  () => props.suspendResizeWork,
  (suspended, wasSuspended) => {
    if (suspended) {
      const transition = cityViewTransition.value;
      if (transition) {
        const transitionToken = ++cityViewTransitionToken;
        const target = cityViewTransitionTarget;
        cancelCameraAnimation();
        cancelIrisRevealAnimation();
        if (transition === "to-neighborhood") {
          finishCityToNeighborhoodTransition(target ?? camera.value, cityViewSnapshot, transitionToken);
        } else {
          if (target) camera.value = target;
          irisRevealProgress.value = 1;
          cityViewTransition.value = undefined;
          cityViewRadiusTransition.value = undefined;
          cityViewTransitionTarget = undefined;
        }
      }
      if (animationFrame !== undefined) {
        cancelAnimationFrame(animationFrame);
        animationFrame = undefined;
      }
      cancelIrisRevealAnimation();
      animating.value = false;
      return;
    }
    if (previewResizeFrame !== undefined) {
      cancelAnimationFrame(previewResizeFrame);
      previewResizeFrame = undefined;
    }
    if (!wasSuspended) return;
    void nextTick(() => {
      fitView(false);
      if (isPlacesPreview.value && props.selectedPlaceId) focusSelectedPlace(false);
      void nextTick(containGhostFlowTooltips);
    });
  },
);

watch(
  () => props.selectedPlaceId,
  (placeId) => {
    if (!isPlacesPreview.value) return;
    void nextTick(() => placeId ? focusSelectedPlace(true) : fitView(true));
  },
);

watch(displayedStations, (entries) => {
  if (summaryLineHoverActive.value) return;
  const displayedIds = new Set([
    ...entries.map((entry) => entry.id),
    ...displayedSupplementalStations.value.map((candidate) => candidate.id),
  ]);
  if (pinnedStationId.value && !displayedIds.has(pinnedStationId.value)) pinnedStationId.value = undefined;
  if (hoveredStationId.value && !displayedIds.has(hoveredStationId.value)) hoveredStationId.value = undefined;
});
watch(displayedSupplementalStations, (entries) => {
  if (summaryLineHoverActive.value) return;
  const displayedIds = new Set([
    ...displayedStations.value.map((entry) => entry.id),
    ...entries.map((candidate) => candidate.id),
  ]);
  if (pinnedStationId.value && !displayedIds.has(pinnedStationId.value)) pinnedStationId.value = undefined;
  if (hoveredStationId.value && !displayedIds.has(hoveredStationId.value)) hoveredStationId.value = undefined;
});
watch(lineHoverCardLineId, (lineId) => {
  if (lineId) void loadSummaryFrequency(lineId);
  else abortOtherSummaryFrequencyRequests();
});
const hasStationScheduleSlot = computed(() => Boolean(slots["station-schedules"]));

function setSidebarTab(tab: NearbySidebarTab): void {
  if (tab === "schedule" && !hasStationScheduleSlot.value) return;
  if (activeSidebarTab.value === tab) return;
  clearSummaryLineFocus();
  activeSidebarTab.value = tab;
}

function startSidebarSwipe(event: PointerEvent): void {
  if (!hasStationScheduleSlot.value || event.pointerType === "mouse") return;
  sidebarSwipe = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
  };
  const target = event.currentTarget as HTMLElement | null;
  if (target && typeof target.setPointerCapture === "function") target.setPointerCapture(event.pointerId);
}

function moveSidebarSwipe(event: PointerEvent): void {
  const gesture = sidebarSwipe;
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const deltaX = event.clientX - gesture.startX;
  const deltaY = event.clientY - gesture.startY;
  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) event.preventDefault();
}

function finishSidebarSwipe(event: PointerEvent): void {
  const gesture = sidebarSwipe;
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  sidebarSwipe = undefined;
  const deltaX = event.clientX - gesture.startX;
  const deltaY = event.clientY - gesture.startY;
  if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
  if (deltaX < 0) setSidebarTab("schedule");
  else setSidebarTab("summary");
}

function cancelSidebarSwipe(event?: PointerEvent): void {
  if (!event || sidebarSwipe?.pointerId === event.pointerId) sidebarSwipe = undefined;
}

function closeDisplayControls(): void {
  displayControlsOpen.value = false;
  void nextTick(() => displayToggleButton.value?.focus({ preventScroll: true }));
}

watch(cityViewEnabled, (enabled) => {
  if (!enabled) {
    clearCityComparison();
    cityViewCommerceVisible.value = false;
    emit("toggleCityCommerce", false);
    cityViewSelectedTransportMode.value = undefined;
    clearCityViewLineHover();
    stationHoveredLineId.value = undefined;
    return;
  }
  cityViewSelectedTransportMode.value = undefined;
  clearCityComparison();
  cityViewCommerceVisible.value = false;
  emit("toggleCityCommerce", false);
  clearCityViewLineHover();
  stationHoveredLineId.value = undefined;
  clearSummaryLineFocus();
  activeSidebarTab.value = "summary";
});

watch(camera, (nextCamera) => {
  emit("cameraChange", nextCamera);
  scheduleGhostFlowTooltipContainment();
});
watch(dynamicIconMotionEnabled, () => {
  if (pendingGestureCamera) applyGestureCameraTransform(pendingGestureCamera);
});
// Both compared communes need their own security verdict and place counts.
// Results are cached per code, so a swap or a revisit resolves instantly.
watch(
  [cityViewComparisonEffectiveCurrentCode, cityViewComparisonTargetCode],
  ([currentCode, targetCode]) => {
    ensureCityComparisonData(currentCode);
    ensureCityComparisonData(targetCode);
  },
);
watch([animating, mapDragging], scheduleGhostFlowTooltipContainment);
watch(
  renderedLineFlowModels,
  scheduleGhostFlowTooltipContainment,
  { flush: "post" },
);

watch(isFullscreen, (fullscreen) => {
  if (!fullscreen) displayControlsOpen.value = false;
});

watch(displayControlsOpen, (open) => {
  if (!open || !isMobileDisplaySheet.value) return;
  void nextTick(() => displayPanel.value?.focus({ preventScroll: true }));
});

watch(() => props.showIsochroneControl, (visible) => {
  if (!visible) {
    isochroneEnabled.value = false;
    isochronePanelOpen.value = false;
    isochroneConfigurationModalOpen.value = false;
    clearIsochroneHover();
  }
});
watch(() => props.showNoiseControl, (visible) => {
  if (!visible) {
    noiseZonesEnabled.value = false;
    if (hoveredEnvironment.value?.layer === "noise") clearEnvironmentHover();
  }
});
watch(() => props.showAirQualityControl, (visible) => {
  if (!visible) {
    airQualityZonesEnabled.value = false;
    if (hoveredEnvironment.value?.layer === "air-quality") clearEnvironmentHover();
  }
});
watch([() => props.origin.lon, () => props.origin.lat], clearIsochroneHover);
watch([isochroneEnabled, isochroneStatus], ([enabled, status]) => {
  if (!enabled || status !== "ready") clearIsochroneHover();
});
watch([noiseZonesEnabled, airQualityZonesEnabled, noiseZonesStatus], ([noiseEnabled, airQualityEnabled, status]) => {
  if (status !== "ready" || (!noiseEnabled && !airQualityEnabled)) clearEnvironmentHover();
});
watch(() => props.showBasemapControl, (visible) => {
  if (!visible) basemapLayer.value = "plan";
});
watch(() => props.showDisplayControl, (visible) => {
  if (!visible) displayControlsOpen.value = false;
});
watch(() => props.showFullscreenControl, (visible) => {
  if (!visible && isFullscreen.value) void exitFullscreen();
});

onMounted(() => {
  systemReducedMotion.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  dataSaverMode.value = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  coarsePointer.value = window.matchMedia("(pointer: coarse)").matches
    || (navigator.maxTouchPoints > 0 && window.innerWidth <= 900);
  document.addEventListener("fullscreenchange", syncFullscreenState);
  resizeObserver = new ResizeObserver(() => {
    flushGestureCamera();
    gestureBounds = undefined;
    if (props.suspendResizeWork) {
      schedulePreviewResize();
      return;
    }
    fitView(false);
    if (isPlacesPreview.value && props.selectedPlaceId) focusSelectedPlace(false);
    void nextTick(containGhostFlowTooltips);
  });
  if (root.value) resizeObserver.observe(root.value);
  fitView(false);
  if (isPlacesPreview.value && props.selectedPlaceId) focusSelectedPlace(false);
  void nextTick(containGhostFlowTooltips);
  if (!isPlacesPreview.value) {
    // Warm the shared IRIS promise after the initial map paint so the first
    // city-view click can start its animation without waiting for the dataset.
    irisPrefetchTimer = window.setTimeout(() => {
      irisPrefetchTimer = undefined;
      void fetchIrisDataset().catch(() => undefined);
    }, 600);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", syncFullscreenState);
  stopSidebarResize();
  resizeObserver?.disconnect();
  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
  if (gestureFrame !== undefined) cancelAnimationFrame(gestureFrame);
  pendingGestureCamera = undefined;
  gestureBounds = undefined;
  if (irisRevealAnimationFrame !== undefined) cancelAnimationFrame(irisRevealAnimationFrame);
  if (irisPrefetchTimer !== undefined) window.clearTimeout(irisPrefetchTimer);
  if (previewResizeFrame !== undefined) cancelAnimationFrame(previewResizeFrame);
  if (interactionTimer !== undefined) window.clearTimeout(interactionTimer);
  if (feederPulseTimer !== undefined) window.clearTimeout(feederPulseTimer);
  if (suppressClickTimer !== undefined) window.clearTimeout(suppressClickTimer);
  if (stationTooltipSuppressionTimer !== undefined) window.clearTimeout(stationTooltipSuppressionTimer);
  for (const controller of summaryFrequencyControllers.values()) controller.abort();
  summaryFrequencyControllers.clear();
  activePointers.clear();
  pinchGesture = undefined;
  panPointerId = undefined;
  panLastPoint = undefined;
});

function clampNearbyCamera(nextCamera: CameraState): CameraState {
  // The cover bounds are deliberately wider than the fitted radius so the
  // complete viewport still has room at the minimum zoom. Do not add another
  // padding margin here: panning must remain inside this nearby map envelope.
  return clampCameraToBounds(nextCamera, nearbyBasemapCoverBounds.value, 0);
}

function resizeNearbyCamera(baseCamera: CameraState): CameraState | undefined {
  const element = root.value;
  if (!element || element.clientWidth <= 0 || element.clientHeight <= 0) return undefined;
  return resizeCamera(
    baseCamera,
    element.clientWidth,
    element.clientHeight,
    nearbyMapPixelRatio(),
  );
}

function nearbyMapPixelRatio(): number {
  const deviceRatio = Math.min(window.devicePixelRatio || 1, 2);
  return coarsePointer.value && isMapInteracting.value
    ? Math.min(deviceRatio, 1.25)
    : deviceRatio;
}

function cityViewCameraTarget(
  baseCamera: CameraState = camera.value,
  bounds: GlobalMapBounds | undefined = cityViewWorldBounds.value,
): CameraState | undefined {
  const resized = resizeNearbyCamera(baseCamera);
  if (!resized || !bounds) return undefined;
  // The larger raster cover is a reserve for panning, not the initial framing.
  const viewBounds = cityViewEnabled.value ? expandBounds(bounds, 0.12) : bounds;
  return fitCameraToBounds(resized, viewBounds, 32, 4, 18);
}

function neighborhoodViewCameraTarget(baseCamera: CameraState = camera.value): CameraState | undefined {
  const resized = resizeNearbyCamera(baseCamera);
  if (!resized) return undefined;
  const extent = props.radius + 200;
  const latDelta = extent / 111_320;
  const lonDelta = longitudeDelta(props.origin.lat, extent);
  const northWest = lonLatToWorld({ lon: props.origin.lon - lonDelta, lat: props.origin.lat + latDelta });
  const southEast = lonLatToWorld({ lon: props.origin.lon + lonDelta, lat: props.origin.lat - latDelta });
  return fitCameraToBounds(resized, {
    minX: Math.min(northWest.x, southEast.x),
    minY: Math.min(northWest.y, southEast.y),
    maxX: Math.max(northWest.x, southEast.x),
    maxY: Math.max(northWest.y, southEast.y),
  }, 32, 10, 18);
}

function updateZoomForCameraTarget(target: CameraState): void {
  zoomRange.value = {
    min: target.zoom - NEARBY_ZOOM_OUT_DELTA,
    max: target.zoom + NEARBY_ZOOM_IN_DELTA,
  };
  zoomReference.value = target.zoom;
  syncNearbyBasemapReference(target);
}

function fitCityView(animate: boolean): void {
  if (cityViewTransition.value) return;
  const target = cityViewCameraTarget();
  if (!target) return;
  updateZoomForCameraTarget(target);
  if (!animate || reducedMotion.value) {
    camera.value = target;
    return;
  }
  animateCamera(target);
}

async function loadCityViewSecurityScore(
  token: number,
  origin: { lon: number; lat: number },
): Promise<void> {
  try {
    const verdict = await fetchNeighborhoodVerdict(origin.lat, origin.lon);
    if (token !== cityViewSecurityRequestToken || !cityViewEnabled.value) return;
    const score = verdict.categories.find((category) => category.id === "security" && category.status === "available")?.score;
    cityViewSecurityScore.value = typeof score === "number" && Number.isFinite(score) ? score : undefined;
  } catch {
    if (token === cityViewSecurityRequestToken) cityViewSecurityScore.value = undefined;
  }
}

function cancelIrisRevealAnimation(): void {
  if (irisRevealAnimationFrame !== undefined) cancelAnimationFrame(irisRevealAnimationFrame);
  irisRevealAnimationFrame = undefined;
}

function finishCityToNeighborhoodTransition(
  target: CameraState,
  snapshot: typeof cityViewSnapshot,
  token: number,
): void {
  if (token !== cityViewTransitionToken) return;

  cityViewEnabled.value = false;
  cityViewError.value = "";
  cityViewRequestToken += 1;
  cityViewSecurityRequestToken += 1;
  cityViewSecurityScore.value = undefined;
  cityViewSnapshot = undefined;
  cityViewTransitionTarget = undefined;
  cityViewRadiusTransition.value = undefined;
  irisRevealOrder.value = [];
  irisRevealProgress.value = 1;

  if (snapshot) {
    zoomRange.value = { ...snapshot.zoomRange };
    zoomReference.value = snapshot.zoomReference;
    isochroneEnabled.value = snapshot.isochroneEnabled;
    noiseZonesEnabled.value = snapshot.noiseZonesEnabled;
    airQualityZonesEnabled.value = snapshot.airQualityZonesEnabled;
    isochronePanelOpen.value = snapshot.isochronePanelOpen;
    isochroneConfigurationModalOpen.value = snapshot.isochroneConfigurationModalOpen;
    showMapStations.value = snapshot.showMapStations;
    showProjectedStations.value = snapshot.showProjectedStations;
    displayControlsOpen.value = snapshot.displayControlsOpen;
    hoveredStationId.value = snapshot.hoveredStationId;
    pinnedStationId.value = snapshot.pinnedStationId;
  }

  // Keep the camera at the radius-fit target reached by the animation. The
  // previous implementation restored the old snapshot here, which made the
  // transition snap backwards as soon as the city layer disappeared.
  updateZoomForCameraTarget(target);
  camera.value = { ...target };
  syncNearbyBasemapReference(camera.value);
  cityViewTransition.value = undefined;
}

function animateIrisNeighborhoodReveal(token: number): void {
  cancelIrisRevealAnimation();
  if (token !== cityViewTransitionToken || cityViewTransition.value !== "to-city") return;
  if (irisRevealOrder.value.length === 0) {
    irisRevealProgress.value = 1;
    cityViewRadiusTransition.value = undefined;
    cityViewTransition.value = undefined;
    cityViewTransitionTarget = undefined;
    return;
  }

  const startedAt = performance.now();
  const duration = 1_450;
  const step = (now: number): void => {
    if (token !== cityViewTransitionToken || cityViewTransition.value !== "to-city") {
      irisRevealAnimationFrame = undefined;
      return;
    }
    const progress = Math.min(1, (now - startedAt) / duration);
    irisRevealProgress.value = easeInOutCubic(progress);
    if (progress < 1) {
      irisRevealAnimationFrame = requestAnimationFrame(step);
      return;
    }
    irisRevealProgress.value = 1;
    irisRevealAnimationFrame = undefined;
    cityViewTransition.value = undefined;
    cityViewTransitionTarget = undefined;
  };
  irisRevealAnimationFrame = requestAnimationFrame(step);
}

function startCityViewTransition(target: CameraState, token: number): void {
  if (token !== cityViewTransitionToken || cityViewTransition.value !== "to-city") return;
  updateZoomForCameraTarget(target);
  if (reducedMotion.value) {
    camera.value = target;
    irisRevealProgress.value = 1;
    cityViewRadiusTransition.value = undefined;
    cityViewTransition.value = undefined;
    cityViewTransitionTarget = undefined;
    return;
  }

  // First pull the camera back far enough to see the commune. Only once that
  // dezoom has settled do we start drawing the IRIS boundaries outward.
  animateCamera(target, {
    duration: CITY_VIEW_CAMERA_TRANSITION_DURATION_MS,
    easing: easeInOutCubic,
    onComplete: () => {
      cityViewRadiusTransition.value = undefined;
      animateIrisNeighborhoodReveal(token);
    },
  });
}

async function toggleCityView(): Promise<void> {
  if (cityViewTransition.value) return;

  if (cityViewEnabled.value) {
    cancelCameraAnimation();
    cancelIrisRevealAnimation();
    const snapshot = cityViewSnapshot;
    const target = neighborhoodViewCameraTarget(snapshot?.camera ?? camera.value) ?? snapshot?.camera ?? camera.value;
    const token = ++cityViewTransitionToken;
    cityViewTransitionTarget = target;
    cityViewTransition.value = "to-neighborhood";
    cityViewRadiusTransition.value = "to-neighborhood";
    cityViewEnabled.value = false;
    cityViewError.value = "";
    cityViewRequestToken += 1;
    cityViewSecurityRequestToken += 1;
    cityViewSecurityScore.value = undefined;
    if (reducedMotion.value) {
      finishCityToNeighborhoodTransition(target, snapshot, token);
      return;
    }
    animateCamera(target, {
      duration: CITY_VIEW_CAMERA_TRANSITION_DURATION_MS,
      easing: easeInOutCubic,
      onComplete: () => finishCityToNeighborhoodTransition(camera.value, snapshot, token),
    });
    return;
  }
  if (cityViewLoading.value) return;
  const token = ++cityViewRequestToken;
  cityViewLoading.value = true;
  cityViewError.value = "";
  cancelCameraAnimation();
  cancelIrisRevealAnimation();
  cityViewSnapshot = {
    camera: { ...camera.value },
    zoomRange: { ...zoomRange.value },
    zoomReference: zoomReference.value,
    isochroneEnabled: isochroneEnabled.value,
    noiseZonesEnabled: noiseZonesEnabled.value,
    airQualityZonesEnabled: airQualityZonesEnabled.value,
    isochronePanelOpen: isochronePanelOpen.value,
    isochroneConfigurationModalOpen: isochroneConfigurationModalOpen.value,
    showMapStations: showMapStations.value,
    showProjectedStations: showProjectedStations.value,
    displayControlsOpen: displayControlsOpen.value,
    hoveredStationId: hoveredStationId.value,
    pinnedStationId: pinnedStationId.value,
  };
  try {
    const dataset = irisDataset.value ?? await fetchIrisDataset();
    if (token !== cityViewRequestToken) return;
    irisDataset.value = dataset;
    const selection = selectIrisNeighborhoodsForPoint(dataset, props.origin, { scope: "commune" });
    if (!selection.neighborhoods.length || !boundsForIrisNeighborhoods(selection.neighborhoods)) {
      throw new Error("IRIS city geometry is empty");
    }
    const cityBounds = boundsForIrisNeighborhoods(selection.neighborhoods);
    cityViewSelectionExact.value = selection.exact;
    // Use the lightweight geographic order for the interactive transition.
    // Exact polygon adjacency remains available for offline analysis but can
    // block the first click on detailed commune geometries.
    irisRevealOrder.value = buildIrisNeighborhoodRevealOrder(selection.neighborhoods, props.origin, { adjacency: "fast" });
    irisRevealProgress.value = reducedMotion.value ? 1 : 0;
    const transitionToken = ++cityViewTransitionToken;
    cityViewTransition.value = "to-city";
    cityViewRadiusTransition.value = reducedMotion.value ? undefined : "to-city";
    cityViewEnabled.value = true;
    cityViewSecurityScore.value = undefined;
    isochroneEnabled.value = false;
    noiseZonesEnabled.value = false;
    airQualityZonesEnabled.value = false;
    isochronePanelOpen.value = false;
    isochroneConfigurationModalOpen.value = false;
    clearIsochroneHover();
    clearEnvironmentHover();
    showMapStations.value = false;
    showProjectedStations.value = false;
    displayControlsOpen.value = false;
    hoveredStationId.value = undefined;
    pinnedStationId.value = undefined;
    // City rendering already hides neighborhood places. Keep the user's
    // neighborhood preferences intact even if the transition is interrupted.
    await nextTick();
    if (token !== cityViewRequestToken || cityViewTransition.value !== "to-city") return;
    // The city layout removes the sidebar: measure only after Vue has applied
    // that layout, otherwise the SVG and the raster use different viewports.
    const resized = resizeNearbyCamera(camera.value);
    if (!resized) throw new Error("Nearby map viewport is unavailable");
    const scale = worldScaleAtZoom(camera.value.zoom);
    camera.value = updateCamera(resized, {
      centerWorldX: camera.value.centerWorldX + (resized.viewportWidthCssPx - camera.value.viewportWidthCssPx) / (2 * scale),
      centerWorldY: camera.value.centerWorldY + (resized.viewportHeightCssPx - camera.value.viewportHeightCssPx) / (2 * scale),
    });
    const target = cityViewCameraTarget(camera.value, cityBounds)!;
    cityViewTransitionTarget = target;
    startCityViewTransition(target, transitionToken);
    const securityToken = ++cityViewSecurityRequestToken;
    const securityOrigin = { lon: props.origin.lon, lat: props.origin.lat };
    void loadCityViewSecurityScore(securityToken, securityOrigin);
  } catch (error) {
    if (token === cityViewRequestToken) {
      cityViewSnapshot = undefined;
      cityViewError.value = error instanceof Error ? error.message : String(error);
    }
  } finally {
    if (token === cityViewRequestToken) cityViewLoading.value = false;
  }
}

function fitView(animate: boolean): void {
  if (cityViewTransition.value) return;
  if (cityViewEnabled.value) {
    fitCityView(animate);
    return;
  }
  const target = neighborhoodViewCameraTarget();
  if (!target) return;
  updateZoomForCameraTarget(target);
  if (!animate || reducedMotion.value) {
    camera.value = target;
    return;
  }
  animateCamera(target);
}

function serializeIsochroneGeometry(geometry: NearbyIsochroneGeometry): string {
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
  return polygons
    .flatMap((polygon) => polygon.map((ring) => serializeIsochroneRing(ring)))
    .filter(Boolean)
    .join(" ");
}

function serializeIsochroneRing(ring: readonly (readonly [number, number])[]): string {
  const points = ring.map(([lon, lat]) => lonLatToWorld({ lon, lat }));
  if (points.length < 4 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return "";
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(9)} ${point.y.toFixed(9)}`).join(" ")} Z`;
}

function syncNearbyBasemapReference(target: CameraState): void {
  const bounds = nearbyBasemapCoverBounds.value;
  const boundsKey = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].join(":");
  if (nearbyBasemapReferenceInitialized && boundsKey === nearbyBasemapReferenceBoundsKey) return;
  nearbyBasemapReferenceInitialized = true;
  nearbyBasemapReferenceBoundsKey = boundsKey;
  nearbyBasemapReferenceCamera.value = { ...target };
}

function handleBasemapCoverageAudit(result: { ready: boolean; attempt: number }): void {
  // Only the first 200 ms verdict for an interaction adjusts the debounce;
  // retry audits are diagnostic and must not inflate it repeatedly.
  if (result.attempt !== 1) return;
  if (!result.ready) {
    successfulBasemapAudits = 0;
    basemapInteractionSettleMs.value = Math.min(420, basemapInteractionSettleMs.value + 60);
    return;
  }
  successfulBasemapAudits += 1;
  if (successfulBasemapAudits >= 3) {
    basemapInteractionSettleMs.value = Math.max(240, basemapInteractionSettleMs.value - 20);
    successfulBasemapAudits = 0;
  }
}

function schedulePreviewResize(): void {
  if (!isPlacesPreview.value || previewResizeFrame !== undefined) return;
  previewResizeFrame = requestAnimationFrame(() => {
    previewResizeFrame = undefined;
    // The overlay has already applied its column width for this frame. Keep the
    // preview camera in sync without running tooltip containment or animations.
    fitView(false);
    if (props.selectedPlaceId) focusSelectedPlace(false);
  });
}

function focusSelectedPlace(animate: boolean): void {
  const place = (props.places ?? []).find((entry) => entry.id === props.selectedPlaceId);
  if (!place) {
    fitView(animate);
    return;
  }
  const center = lonLatToWorld(place);
  const target = updateCamera(camera.value, {
    centerWorldX: center.x,
    centerWorldY: center.y,
    zoom: clamp(zoomReference.value + 1, zoomRange.value.min, zoomRange.value.max),
  });
  if (!animate || reducedMotion.value) camera.value = target;
  else animateCamera(target, { duration: 480, easing: easeInOutCubic });
}

function animateCamera(
  target: CameraState,
  options: {
    duration?: number;
    easing?: (progress: number) => number;
    onComplete?: () => void;
  } = {},
): void {
  flushGestureCamera();
  if (interactionTimer !== undefined) window.clearTimeout(interactionTimer);
  interactionTimer = undefined;
  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
  const from = { ...camera.value };
  const startedAt = performance.now();
  animating.value = true;
  const duration = options.duration ?? 400;
  const easing = options.easing ?? easeOutCubic;
  const step = (now: number) => {
    // The sidebar changes the viewport while the camera is moving. Both the
    // raster and overlays must receive the same live dimensions on every frame.
    if (cityViewTransition.value) {
      target = (cityViewTransition.value === "to-city"
        ? cityViewCameraTarget()
        : neighborhoodViewCameraTarget()) ?? target;
      cityViewTransitionTarget = target;
    }
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = easing(progress);
    camera.value = updateCamera(from, {
      centerWorldX: mix(from.centerWorldX, target.centerWorldX, eased),
      centerWorldY: mix(from.centerWorldY, target.centerWorldY, eased),
      zoom: mix(from.zoom, target.zoom, eased),
      viewportWidthCssPx: target.viewportWidthCssPx,
      viewportHeightCssPx: target.viewportHeightCssPx,
      pixelRatio: target.pixelRatio,
    });
    if (progress < 1) animationFrame = requestAnimationFrame(step);
    else {
      camera.value = target;
      if (cityViewTransition.value) updateZoomForCameraTarget(target);
      animating.value = false;
      animationFrame = undefined;
      options.onComplete?.();
    }
  };
  animationFrame = requestAnimationFrame(step);
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function easeInOutCubic(progress: number): number {
  return progress < .5
    ? 4 * progress ** 3
    : 1 - ((-2 * progress + 2) ** 3) / 2;
}

function toggleIsochrones(): void {
  if (!isochroneEnabled.value) {
    isochroneEnabled.value = true;
    isochronePanelOpen.value = true;
    return;
  }
  if (!isochronePanelOpen.value) {
    isochronePanelOpen.value = true;
    return;
  }
  isochroneEnabled.value = false;
  isochronePanelOpen.value = false;
  if (!isochroneEnabled.value) {
    isochroneConfigurationModalOpen.value = false;
    clearIsochroneHover();
  }
}

function toggleNoiseZones(): void {
  noiseZonesEnabled.value = !noiseZonesEnabled.value;
  if (noiseZonesEnabled.value) airQualityZonesEnabled.value = false;
  clearEnvironmentHover();
}

function toggleAirQualityZones(): void {
  airQualityZonesEnabled.value = !airQualityZonesEnabled.value;
  if (airQualityZonesEnabled.value) noiseZonesEnabled.value = false;
  clearEnvironmentHover();
}

function closeIsochroneConfigurationModal(): void {
  isochroneConfigurationModalOpen.value = false;
  isochroneEnabled.value = false;
  clearIsochroneHover();
}

function retryIsochronesFromConfigurationModal(): void {
  isochroneConfigurationModalOpen.value = false;
  void (cityViewEnabled.value ? retryCityIsochrones() : retryIsochrones());
}

async function toggleFullscreen(): Promise<void> {
  const element = shell.value;
  if (!element) return;

  try {
    if (document.fullscreenElement === element) await document.exitFullscreen();
    else await element.requestFullscreen();
  } catch {
    setFullscreenState(false);
  }
}

async function exitFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // The browser may reject an exit after the containing modal was removed.
  } finally {
    setFullscreenState(false);
  }
}

function setFullscreenState(fullscreen: boolean): void {
  if (isFullscreen.value === fullscreen) return;
  isFullscreen.value = fullscreen;
  emit("fullscreen-change", fullscreen);
}

function syncFullscreenState(): void {
  setFullscreenState(document.fullscreenElement === shell.value);
  void nextTick(() => {
    fitView(false);
    containGhostFlowTooltips();
  });
}

function maxSidebarWidth(): number {
  const measuredWidth = shell.value?.getBoundingClientRect().width ?? 0;
  const availableWidth = measuredWidth > 0 ? measuredWidth : SIDEBAR_MAX_WIDTH + 360;
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, availableWidth - 360));
}

function setSidebarWidth(width: number): void {
  sidebarWidth.value = Math.round(clamp(width, SIDEBAR_MIN_WIDTH, maxSidebarWidth()));
}

function startSidebarResize(event: PointerEvent): void {
  if (event.button !== 0) return;
  event.preventDefault();
  sidebarResizePointerId = event.pointerId;
  sidebarResizeActive.value = true;
  if (sidebarSplitter.value && typeof sidebarSplitter.value.setPointerCapture === "function") {
    sidebarSplitter.value.setPointerCapture(event.pointerId);
  }
  window.addEventListener("pointermove", handleSidebarResize);
  window.addEventListener("pointerup", stopSidebarResize);
  window.addEventListener("pointercancel", stopSidebarResize);
}

function handleSidebarResize(event: PointerEvent): void {
  if (!sidebarResizeActive.value || event.pointerId !== sidebarResizePointerId || !shell.value) return;
  const bounds = shell.value.getBoundingClientRect();
  setSidebarWidth(bounds.right - event.clientX);
}

function stopSidebarResize(event?: PointerEvent): void {
  if (event && sidebarResizePointerId !== undefined && event.pointerId !== sidebarResizePointerId) return;
  if (
    sidebarResizePointerId !== undefined &&
    sidebarSplitter.value &&
    typeof sidebarSplitter.value.hasPointerCapture === "function" &&
    sidebarSplitter.value.hasPointerCapture(sidebarResizePointerId) &&
    typeof sidebarSplitter.value.releasePointerCapture === "function"
  ) {
    sidebarSplitter.value.releasePointerCapture(sidebarResizePointerId);
  }
  sidebarResizePointerId = undefined;
  sidebarResizeActive.value = false;
  window.removeEventListener("pointermove", handleSidebarResize);
  window.removeEventListener("pointerup", stopSidebarResize);
  window.removeEventListener("pointercancel", stopSidebarResize);
}

function handleSidebarResizeKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    setSidebarWidth(sidebarWidth.value + 16);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    setSidebarWidth(sidebarWidth.value - 16);
  } else if (event.key === "Home") {
    event.preventDefault();
    setSidebarWidth(SIDEBAR_MIN_WIDTH);
  } else if (event.key === "End") {
    event.preventDefault();
    setSidebarWidth(maxSidebarWidth());
  }
}

function handleWheel(event: WheelEvent): void {
  if (!canInteractWithMap.value) return;
  clearIsochroneHover();
  event.preventDefault();
  const anchor = localScreenPoint(event.clientX, event.clientY);
  if (!anchor) return;
  const deltaPixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? event.deltaY * 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? event.deltaY * root.value!.clientHeight
      : event.deltaY;
  if (!Number.isFinite(deltaPixels) || deltaPixels === 0) return;

  cancelCameraAnimation();
  const baseCamera = pendingGestureCamera ?? camera.value;
  const zoomStep = Math.max(-0.16, Math.min(0.16, -deltaPixels / 600));
  const nextZoom = clamp(
    baseCamera.zoom + zoomStep,
    zoomRange.value.min,
    zoomRange.value.max,
  );
  if (nextZoom === baseCamera.zoom) return;
  queueGestureCamera(zoomCameraAroundScreenPoint(baseCamera, nextZoom, anchor));
}

function changeZoom(direction: 1 | -1): void {
  const element = root.value;
  if (!element) return;
  flushGestureCamera();

  const nextZoom = clamp(
    camera.value.zoom + direction * NEARBY_ZOOM_BUTTON_STEP,
    zoomRange.value.min,
    zoomRange.value.max,
  );
  if (nextZoom === camera.value.zoom) return;

  cancelCameraAnimation();
  const nextCamera = zoomCameraAroundScreenPoint(
    camera.value,
    nextZoom,
    {
      x: (element.clientWidth || camera.value.viewportWidthCssPx) / 2,
      y: (element.clientHeight || camera.value.viewportHeightCssPx) / 2,
    },
  );
  camera.value = clampNearbyCamera(nextCamera);
  keepInteractionActive();
}

function handlePointerDown(event: PointerEvent): void {
  if (!canInteractWithMap.value) return;
  if (event.pointerType !== "touch" && event.button !== undefined && event.button !== 0) return;
  if (isInteractiveMapTarget(event.target) && !isMapGeometryTarget(event.target)) return;
  flushGestureCamera();
  const point = localScreenPoint(event.clientX, event.clientY);
  if (!point) return;

  if (event.pointerType === "touch") {
    activePointers.set(event.pointerId, point);
    if (activePointers.size === 1) {
      beginMapPan(event.pointerId, point);
      return;
    }
    if (activePointers.size !== 2) return;
    for (const pointerId of activePointers.keys()) captureMapPointer(pointerId);
    const [first, second] = [...activePointers.values()];
    const initialDistance = distanceBetween(first!, second!);
    if (initialDistance <= 0) return;
    const midpoint = midpointOf(first!, second!);
    pinchGesture = {
      initialCamera: { ...camera.value },
      initialDistance,
      anchorWorld: screenToWorld(midpoint, camera.value),
    };
    panPointerId = undefined;
    panLastPoint = undefined;
    panMoved = true;
    mapDragging.value = true;
    isMapInteracting.value = true;
    cancelCameraAnimation();
    keepInteractionActive();
    return;
  }

  beginMapPan(event.pointerId, point);
}

function handlePointerMove(event: PointerEvent): void {
  if (!canInteractWithMap.value) return;
  // Hovering the map is not a camera gesture and must not force a layout read.
  if (event.pointerType === "touch") {
    if (!activePointers.has(event.pointerId)) return;
  } else if (panPointerId !== event.pointerId) return;
  const point = localScreenPoint(event.clientX, event.clientY);
  if (!point) return;

  if (event.pointerType === "touch") {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.set(event.pointerId, point);
    if (pinchGesture && activePointers.size >= 2) {
      event.preventDefault();
      const [first, second] = [...activePointers.values()];
      const currentDistance = distanceBetween(first!, second!);
      if (currentDistance <= 0) return;
      const nextCamera = transformCameraForPinch(
        pinchGesture.initialCamera,
        pinchGesture.initialDistance,
        pinchGesture.anchorWorld,
        currentDistance,
        midpointOf(first!, second!),
        zoomRange.value.min,
        zoomRange.value.max,
      );
      queueGestureCamera(nextCamera);
      return;
    }
    if (activePointers.size !== 1 || panPointerId !== event.pointerId) return;
  } else if (panPointerId !== event.pointerId) {
    return;
  }

  if (!panLastPoint) {
    panLastPoint = point;
    return;
  }
  const delta = { x: point.x - panLastPoint.x, y: point.y - panLastPoint.y };
  // Keep the original click target until movement becomes a drag; accumulate
  // small pointer deltas against the initial point to detect slow drags too.
  if (!panMoved && Math.hypot(delta.x, delta.y) <= 4) return;
  if (!panMoved) captureMapPointer(event.pointerId);
  panLastPoint = point;
  if (delta.x === 0 && delta.y === 0) return;
  event.preventDefault();
  panMoved = true;
  queueGestureCamera(panCameraByScreen(pendingGestureCamera ?? camera.value, delta));
}

function handlePointerEnd(event: PointerEvent): void {
  if (!canInteractWithMap.value) return;
  const isTouch = event.pointerType === "touch";
  if (isTouch) {
    if (!activePointers.has(event.pointerId)) return;
    flushGestureCamera();
    activePointers.delete(event.pointerId);
    releaseMapPointer(event.pointerId);
    if (activePointers.size < 2) pinchGesture = undefined;
    if (activePointers.size === 1) {
      const [remainingPointerId, remainingPoint] = [...activePointers.entries()][0]!;
      panPointerId = remainingPointerId;
      panLastPoint = remainingPoint;
      mapDragging.value = true;
      return;
    }
    finishMapPan(event);
    return;
  }

  if (panPointerId !== event.pointerId) return;
  flushGestureCamera();
  releaseMapPointer(event.pointerId);
  finishMapPan(event);
}

function beginMapPan(pointerId: number, point: ScreenPoint): void {
  panPointerId = pointerId;
  panLastPoint = point;
  panMoved = false;
  mapDragging.value = true;
  isMapInteracting.value = true;
  clearIsochroneHover();
  cancelCameraAnimation();
  keepInteractionActive();
}

function finishMapPan(event: PointerEvent): void {
  if (event.type !== "pointercancel" && panMoved) {
    suppressNextMapClick = true;
    if (suppressClickTimer !== undefined) window.clearTimeout(suppressClickTimer);
    suppressClickTimer = window.setTimeout(() => {
      suppressNextMapClick = false;
      suppressClickTimer = undefined;
    }, 0);
  }
  panPointerId = undefined;
  panLastPoint = undefined;
  panMoved = false;
  mapDragging.value = false;
  gestureBounds = undefined;
  keepInteractionActive();
}

function applyGestureCameraTransform(nextCamera: CameraState): void {
  const currentCamera = camera.value;
  const referenceScale = worldScaleAtZoom(currentCamera.zoom);
  const currentScale = worldScaleAtZoom(nextCamera.zoom);
  const ratio = currentScale / referenceScale;
  const translateX =
    (currentCamera.centerWorldX - nextCamera.centerWorldX) * currentScale +
    nextCamera.viewportWidthCssPx / 2 -
    ratio * currentCamera.viewportWidthCssPx / 2;
  const translateY =
    (currentCamera.centerWorldY - nextCamera.centerWorldY) * currentScale +
    nextCamera.viewportHeightCssPx / 2 -
    ratio * currentCamera.viewportHeightCssPx / 2;
  const transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${ratio})`;
  if (gestureCameraLayer.value) gestureCameraLayer.value.style.transform = transform;
  if (gestureMarkerLayer.value) {
    gestureMarkerLayer.value.style.transform = dynamicIconMotionEnabled.value ? transform : "";
  }
}

function clearGestureCameraTransform(): void {
  if (gestureCameraLayer.value) gestureCameraLayer.value.style.transform = "";
  if (gestureMarkerLayer.value) gestureMarkerLayer.value.style.transform = "";
}

// Pointer devices may produce several events per display frame. Accumulate
// their deltas and move the already-rendered map layers in the compositor.
function queueGestureCamera(nextCamera: CameraState): void {
  pendingGestureCamera = clampNearbyCamera(nextCamera);
  isMapInteracting.value = true;
  if (gestureFrame === undefined) gestureFrame = requestAnimationFrame(flushGestureCameraFrame);
  keepInteractionActive();
}

function flushGestureCameraFrame(): void {
  gestureFrame = undefined;
  if (pendingGestureCamera) applyGestureCameraTransform(pendingGestureCamera);
}

function flushGestureCamera(): void {
  if (gestureFrame !== undefined) cancelAnimationFrame(gestureFrame);
  gestureFrame = undefined;
  const nextCamera = pendingGestureCamera;
  pendingGestureCamera = undefined;
  if (!nextCamera) {
    clearGestureCameraTransform();
    isMapInteracting.value = false;
    return;
  }
  // Commit once at the end of a gesture. The transform remains in place until
  // Vue has pushed the new camera to the child layers, avoiding a one-frame
  // snap back to the old raster/marker positions.
  applyGestureCameraTransform(nextCamera);
  const current = camera.value;
  if (nextCamera.centerWorldX !== current.centerWorldX || nextCamera.centerWorldY !== current.centerWorldY
    || nextCamera.zoom !== current.zoom || nextCamera.viewportWidthCssPx !== current.viewportWidthCssPx
    || nextCamera.viewportHeightCssPx !== current.viewportHeightCssPx || nextCamera.pixelRatio !== current.pixelRatio) {
    camera.value = nextCamera;
  }
  isMapInteracting.value = false;
  void nextTick(clearGestureCameraTransform);
}

function isInteractiveMapTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && Boolean(target.closest("button, a, input, select, textarea, [role='button'], [role='tooltip'], [data-nearby-map-tooltip]"));
}

function isMapGeometryTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && Boolean(target.closest("[data-city-code], [data-iris-neighborhood]"));
}

function captureMapPointer(pointerId: number): void {
  const element = root.value;
  if (!element || typeof element.setPointerCapture !== "function") return;
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic pointer events and browsers without capture support can still
    // be handled through the component's local gesture state.
  }
}

function releaseMapPointer(pointerId: number): void {
  const element = root.value;
  if (!element || typeof element.hasPointerCapture !== "function" || typeof element.releasePointerCapture !== "function") return;
  try {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  } catch {
    // Pointer capture may already have been released by the browser.
  }
}

function localScreenPoint(clientX: number, clientY: number): ScreenPoint | undefined {
  const element = root.value;
  if (!element) return undefined;
  const bounds = mapDragging.value
    ? (gestureBounds ??= element.getBoundingClientRect())
    : element.getBoundingClientRect();
  return { x: clientX - bounds.left, y: clientY - bounds.top };
}

function distanceBetween(first: ScreenPoint, second: ScreenPoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function midpointOf(first: ScreenPoint, second: ScreenPoint): ScreenPoint {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function cancelCameraAnimation(): void {
  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
  animationFrame = undefined;
  animating.value = mapDragging.value || gestureFrame !== undefined;
}

function keepInteractionActive(): void {
  animating.value = true;
  if (interactionTimer !== undefined) window.clearTimeout(interactionTimer);
  interactionTimer = undefined;
  // A held pointer is still a gesture even if no event arrives for 240 ms.
  // Never rebuild raster definitions in the middle of a slow drag.
  if (mapDragging.value) return;
  interactionTimer = window.setTimeout(() => {
    flushGestureCamera();
    animating.value = false;
    interactionTimer = undefined;
  }, basemapInteractionSettleMs.value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hoverStation(stationId: string): void {
  hoveredStationId.value = stationId;
  const lineId = lineForStationFocus(stationId)?.id;
  stationHoveredLineId.value = lineId;
  if (cityViewEnabled.value && lineId && cityViewHoveredLineId.value !== lineId) {
    if (cityViewHoveredLineId.value) emit("leaveLine", cityViewHoveredLineId.value);
    cityViewHoveredLineId.value = lineId;
    emit("hoverLine", lineId);
  }
}

function clearHoveredStation(stationId: string): void {
  if (hoveredStationId.value !== stationId) return;
  hoveredStationId.value = undefined;
  stationHoveredLineId.value = undefined;
  if (cityViewEnabled.value && cityViewHoveredLineId.value) {
    const lineId = cityViewHoveredLineId.value;
    cityViewHoveredLineId.value = undefined;
    emit("leaveLine", lineId);
  }
}

function lineForStationFocus(stationId: string): GlobalMapLine | undefined {
  const supplemental = displayedSupplementalStations.value.find((candidate) => candidate.id === stationId);
  const entry = (cityViewEnabled.value
    ? cityViewStationEntries.value.find((candidate) => candidate.id === stationId)
    : undefined)
    ?? props.stations.find((candidate) => candidate.id === stationId)
    ?? supplemental?.entry
    ?? cityViewStationEntries.value.find((candidate) => candidate.id === stationId);
  return supplemental?.lines[0]
    ?? (entry ? cityViewEnabled.value ? markerLine(entry) ?? lineForDetails(entry) : lineForDetails(entry) : undefined);
}

function hoverStationLine(lineId: string): void {
  stationHoveredLineId.value = lineId;
  if (cityViewEnabled.value) cityViewHoveredLineId.value = lineId;
  emit("hoverLine", lineId);
}

function leaveStationLine(lineId: string): void {
  if (stationHoveredLineId.value === lineId) stationHoveredLineId.value = undefined;
  if (cityViewHoveredLineId.value === lineId) cityViewHoveredLineId.value = undefined;
  emit("leaveLine", lineId);
}

function clearCityViewLineHover(): void {
  const lineId = cityViewHoveredLineId.value;
  cityViewHoveredLineId.value = undefined;
  if (lineId) emit("leaveLine", lineId);
}

function toggleCityViewTransportMode(mode: GlobalMapMode): void {
  if (!cityViewEnabled.value) return;

  cityViewSelectedTransportMode.value = cityViewSelectedTransportMode.value === mode
    ? undefined
    : mode;
  clearCityViewLineHover();
  stationHoveredLineId.value = undefined;
  hoveredStationId.value = undefined;
}

function toggleCityCommerce(): void {
  if (!cityViewEnabled.value) return;
  toggleCityActivity("commerce");
}

function handleCityInfoAction(action: "places-ranking"): void {
  if (action !== "places-ranking") return;
  emit("openPlacesRanking", cityViewPopulationByCode.value);
}

/**
 * Load the async part of one compared commune (security verdict and place
 * counts). Results are cached per commune code, so switching a side back to a
 * city that was already resolved, or swapping the two cities, never refetches.
 */
function ensureCityComparisonData(communeCode: string | undefined): void {
  if (!communeCode) return;
  if (cityViewComparisonDataCache.value[communeCode]) return;
  if (cityViewComparisonLoadingCodes.value.includes(communeCode)) return;
  const commune = comparisonCommuneFor(communeCode);
  if (!commune) return;
  cityViewComparisonLoadingCodes.value = [...cityViewComparisonLoadingCodes.value, communeCode];
  const point = commune.centroid;
  const securityPromise = fetchNeighborhoodVerdict(point.lat, point.lon)
    .then((verdict) => verdict.categories.find((category) => category.id === "security" && category.status === "available")?.score)
    .catch(() => undefined);
  const placeCountsPromise = props.loadCityViewPlaceCounts
    ? props.loadCityViewPlaceCounts({ code: commune.code, name: commune.name, lat: point.lat, lon: point.lon }).catch(() => undefined)
    : props.loadCityViewCommerce
      ? props.loadCityViewCommerce({ code: commune.code, name: commune.name, lat: point.lat, lon: point.lon })
        .then((commerce) => (typeof commerce === "number" && Number.isFinite(commerce) ? { commerce } : undefined))
        .catch(() => undefined)
      : Promise.resolve(undefined);
  void Promise.all([securityPromise, placeCountsPromise]).then(([security, placeCounts]) => {
    cityViewComparisonLoadingCodes.value = cityViewComparisonLoadingCodes.value.filter((code) => code !== communeCode);
    cityViewComparisonDataCache.value = {
      ...cityViewComparisonDataCache.value,
      [communeCode]: {
        security: typeof security === "number" && Number.isFinite(security) ? security : undefined,
        placeCounts,
      },
    };
  });
}

function cityViewComparisonOpen(): boolean {
  return Boolean(cityViewComparisonCurrentCode.value && cityViewComparisonTargetCode.value);
}

/** Reset every comparison state, including any pending commune request. */
function clearCityComparison(): void {
  cityViewComparisonRequestToken += 1;
  cityViewComparisonCurrentCode.value = undefined;
  cityViewComparisonTargetCode.value = undefined;
  cityViewComparisonLoadingCodes.value = [];
  cityViewComparisonDataCache.value = {};
}

function closeCityComparison(): void {
  cityViewComparisonRequestToken += 1;
  cityViewComparisonTargetCode.value = undefined;
  cityViewComparisonLoadingCodes.value = [];
}

/**
 * Point the comparison at another commune. The comparator owns both sides, so
 * the scanned origin, the map and the stations never move.
 */
function applyCityComparisonCurrent(communeCode: string): void {
  if (!comparisonCommuneFor(communeCode)) return;
  cityViewComparisonCurrentCode.value = communeCode;
  ensureCityComparisonData(communeCode);
}

async function selectCityComparison(communeCode: string): Promise<void> {
  if (!cityViewEnabled.value || communeCode === cityViewComparisonCurrent.value?.code) return;
  if (!comparisonCommuneFor(communeCode)) return;
  cityViewComparisonTargetCode.value = communeCode;
  ensureCityComparisonData(communeCode);
}

/** The reference side changed inside the modal. */
function selectCityComparisonBase(communeCode: string): void {
  if (communeCode === cityViewComparisonCurrent.value?.code) return;
  applyCityComparisonCurrent(communeCode);
}

/** The target side changed inside the modal. */
function selectCityComparisonTarget(communeCode: string): void {
  if (communeCode === cityViewComparisonTargetCode.value) return;
  if (!comparisonCommuneFor(communeCode)) return;
  cityViewComparisonTargetCode.value = communeCode;
  ensureCityComparisonData(communeCode);
}

/** Swap both sides. Cached values follow their commune, so this is instant. */
function swapCityComparison(): void {
  const currentCode = cityViewComparisonEffectiveCurrentCode.value;
  const targetCode = cityViewComparisonTargetCode.value;
  if (!currentCode || !targetCode) return;
  cityViewComparisonCurrentCode.value = targetCode;
  cityViewComparisonTargetCode.value = currentCode;
}

function suppressStationTooltips(): void {
  stationTooltipsSuppressed.value = true;
  if (stationTooltipSuppressionTimer !== undefined) window.clearTimeout(stationTooltipSuppressionTimer);
  stationTooltipSuppressionTimer = window.setTimeout(() => {
    stationTooltipsSuppressed.value = false;
    stationTooltipSuppressionTimer = undefined;
  }, 10_000);
}

function updateSummaryFrequencyState(lineId: string, state: SummaryFrequencyState): void {
  const next = new Map(summaryFrequencyStates.value);
  next.set(lineId, state);
  summaryFrequencyStates.value = next;
}

function abortOtherSummaryFrequencyRequests(lineId?: string): void {
  for (const [requestedLineId, controller] of summaryFrequencyControllers) {
    if (requestedLineId === lineId) continue;
    controller.abort();
    summaryFrequencyControllers.delete(requestedLineId);
  }
}

async function loadSummaryFrequency(lineId: string): Promise<void> {
  const existingState = summaryFrequencyState(lineId);
  if (existingState?.status === "ready") return;
  if (summaryFrequencyControllers.has(lineId)) return;

  abortOtherSummaryFrequencyRequests(lineId);
  const controller = new AbortController();
  summaryFrequencyControllers.set(lineId, controller);
  updateSummaryFrequencyState(lineId, { status: "loading" });

  try {
    const profile = await fetchGtfsLineFrequency(lineId, { signal: controller.signal });
    if (summaryFrequencyControllers.get(lineId) !== controller) return;
    updateSummaryFrequencyState(
      lineId,
      profile.status === "ready" ? { status: "ready", profile } : { status: "unavailable" },
    );
  } catch {
    if (controller.signal.aborted || summaryFrequencyControllers.get(lineId) !== controller) return;
    updateSummaryFrequencyState(lineId, { status: "unavailable" });
  } finally {
    if (summaryFrequencyControllers.get(lineId) === controller) summaryFrequencyControllers.delete(lineId);
  }
}

function syncSummaryLineFocus(previousLineId: string | undefined): void {
  const nextLineId = summaryActiveLineId.value;
  if (previousLineId === nextLineId) return;
  if (nextLineId) emit("hoverLine", nextLineId);
  else if (previousLineId) emit("leaveLine", previousLineId);
}

function hoverSummaryLine(lineId: string): void {
  if (summaryHoveredLineId.value === lineId) return;
  const previousLineId = summaryActiveLineId.value;
  summaryHoveredLineId.value = lineId;
  stationHoveredLineId.value = undefined;
  hoveredStationId.value = undefined;
  placeLayer.value?.clearHover();
  clearIsochroneHover();
  clearEnvironmentHover();
  syncSummaryLineFocus(previousLineId);
}

function clearSummaryLineHover(): void {
  const previousLineId = summaryActiveLineId.value;
  if (!summaryHoveredLineId.value) return;
  summaryHoveredLineId.value = undefined;
  syncSummaryLineFocus(previousLineId);
}

function leaveSummaryLine(lineId: string): void {
  if (summaryHoveredLineId.value !== lineId) return;
  clearSummaryLineHover();
}

function pinSummaryLine(lineId: string): void {
  const previousLineId = summaryActiveLineId.value;
  summaryPinnedLineId.value = lineId;
  summaryHoveredLineId.value = lineId;
  stationHoveredLineId.value = undefined;
  hoveredStationId.value = undefined;
  placeLayer.value?.clearHover();
  clearIsochroneHover();
  clearEnvironmentHover();
  syncSummaryLineFocus(previousLineId);
}

function clearSummaryLineFocus(): void {
  const previousLineId = summaryActiveLineId.value;
  summaryHoveredLineId.value = undefined;
  summaryPinnedLineId.value = undefined;
  if (previousLineId) emit("leaveLine", previousLineId);
}

function openSummaryLine(lineId: string): void {
  if (typeof window === "undefined") return;
  window.open(`/map?line=${encodeURIComponent(lineId)}`, "_blank", "noopener,noreferrer");
}

function openLineHoverCard(): void {
  const lineId = lineHoverCardLine.value?.id;
  if (lineId) openSummaryLine(lineId);
}

function openSummaryGlobalMap(): void {
  if (typeof window === "undefined" || nearbySummaryLines.value.length === 0) return;

  const params = new URLSearchParams({
    // The compact marker format is longitude,latitude, matching the map's
    // GeoJSON-oriented coordinate contracts.
    temporaryMarker: `${props.origin.lon},${props.origin.lat}`,
    temporaryMarkerRadius: String(Math.max(0, Math.round(props.radius))),
  });
  const label = props.originLabel?.trim();
  if (label) params.set("temporaryMarkerText", label);
  for (const line of nearbySummaryLines.value) params.append("lineToKeep", line.id);
  const heavyLineIds = new Set(nearbySummaryHeavyLines.value.map((line) => line.id));
  for (const line of nearbySummaryHeavyLines.value) {
    params.append(GLOBAL_MAP_NEARBY_HEAVY_LINE_QUERY_KEY, line.id);
  }
  for (const candidate of props.supplementalStations ?? []) {
    if (!candidate.projected) continue;
    const hasDisplayedHeavyLine = candidate.lines.some((line) => {
      const canonicalLine = props.cityViewNetwork?.linesById.get(line.id) ?? line;
      return heavyLineIds.has(canonicalLine.id);
    });
    if (hasDisplayedHeavyLine) {
      params.append(GLOBAL_MAP_NEARBY_HEAVY_STATION_QUERY_KEY, candidate.station.id);
    }
  }

  window.open(`/map?${params.toString()}`, "_blank", "noopener,noreferrer");
}

function hoverIsochrone(
  minutes: NearbyWalkingMinutes,
  zoneIndex: number,
  transport: string,
  event: MouseEvent,
  mode?: GlobalMapMode,
): void {
  const position = localScreenPoint(event.clientX, event.clientY);
  if (!position) return;
  hoveredIsochrone.value = { minutes, zoneIndex, transport, position, mode };
}

function clearIsochroneHover(): void {
  hoveredIsochrone.value = undefined;
}

function environmentCellKey(cell: NearbyProjectedEnvironmentCell): string {
  return `${cell.column}:${cell.row}`;
}

function hoverEnvironmentCell(
  layer: NearbyEnvironmentLayer,
  cell: NearbyProjectedEnvironmentCell,
  event: MouseEvent,
): void {
  const position = localScreenPoint(event.clientX, event.clientY);
  if (!position) return;
  hoveredEnvironment.value = layer === "noise"
    ? { layer, cellKey: environmentCellKey(cell), level: cell.noiseLevel, position }
    : { layer, cellKey: environmentCellKey(cell), level: cell.airQualityLevel, position };
}

function clearEnvironmentHover(): void {
  hoveredEnvironment.value = undefined;
}

function clearHoveredEnvironmentCell(
  layer: NearbyEnvironmentLayer,
  cell: NearbyProjectedEnvironmentCell,
): void {
  const hovered = hoveredEnvironment.value;
  if (hovered?.layer !== layer || hovered.cellKey !== environmentCellKey(cell)) return;
  clearEnvironmentHover();
}

function isHoveredEnvironmentCell(
  layer: NearbyEnvironmentLayer,
  cell: NearbyProjectedEnvironmentCell,
): boolean {
  const hovered = hoveredEnvironment.value;
  return hovered?.layer === layer && hovered.cellKey === environmentCellKey(cell);
}

function clearHoveredIsochrone(minutes: NearbyWalkingMinutes, zoneIndex: number, transport: string): void {
  const hovered = hoveredIsochrone.value;
  if (!hovered || hovered.minutes !== minutes || hovered.zoneIndex !== zoneIndex || hovered.transport !== transport) return;
  clearIsochroneHover();
}

function handleMarkerFocusOut(stationId: string, event: FocusEvent): void {
  const currentTarget = event.currentTarget as HTMLElement | null;
  const relatedTarget = event.relatedTarget as Node | null;
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) return;
  clearHoveredStation(stationId);
}

function markerScheduleState(entry: NearbyStationEntry): NearbyStationScheduleState | undefined {
  return props.scheduleState?.(entry.id);
}

function toggleMarkerSchedule(entry: NearbyStationEntry): void {
  if (!props.scheduleState || markerScheduleState(entry) === undefined) return;
  emit("toggleStationSchedule", entry.id);
}

function markerTooltipVisible(entry: NearbyStationEntry): boolean {
  return !summaryLineHoverActive.value &&
    !props.travelPanelOpen &&
    !stationTooltipsSuppressed.value &&
    hoveredStationId.value === entry.id &&
    (!props.scheduleState || isFullscreen.value || markerScheduleState(entry) !== undefined);
}

function openStationContextMenu(stationId: string, event: MouseEvent): void {
  const anchor = event.currentTarget;
  if (anchor instanceof HTMLElement) emit("stationContextMenu", stationId, anchor);
}

function openPlaceContextMenu(placeId: string, event: MouseEvent): void {
  const anchor = event.currentTarget;
  if (anchor instanceof HTMLElement) emit("placeContextMenu", placeId, anchor);
}

function openSidebarActions(): void {
  if (sidebarActionButton.value) emit("sidebarActions", sidebarActionButton.value);
}

function updateClusterGroupingDistance(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(value)) emit("updateClusterGroupingDistance", value);
}

function pinStation(stationId: string): void {
  const supplemental = displayedSupplementalStations.value.find((candidate) => candidate.id === stationId);
  const entry = (cityViewEnabled.value
    ? cityViewStationEntries.value.find((candidate) => candidate.id === stationId)
    : undefined)
    ?? props.stations.find((candidate) => candidate.id === stationId)
    ?? supplemental?.entry;
  const line = supplemental?.lines[0]
    ?? (entry
      ? cityViewEnabled.value ? markerLine(entry) ?? lineForDetails(entry) : lineForDetails(entry)
      : undefined);
  focusStation(stationId, line?.id);
  if (line) {
    const ghostLineIds = supplemental?.projected
      ? supplementalFeederLineIds(supplemental, line)
      : [];
    if (supplemental?.projected && ghostLineIds.length > 0) {
      emit(
        "activateLine",
        line.id,
        supplemental.station.id,
        ghostLineIds.length === 1 ? ghostLineIds[0] : ghostLineIds,
      );
    }
    else if (supplemental?.projected) emit("activateLine", line.id, supplemental.station.id);
    else emit("activateLine", line.id);
  }
  triggerFeederPulse(supplemental);
}

function focusStation(stationId: string, lineId?: string): void {
  pinnedStationId.value = stationId;
  hoveredStationId.value = undefined;
  stationHoveredLineId.value = undefined;
  stationPinnedLineId.value = lineId ?? lineForStationFocus(stationId)?.id;
  emit("stationFocus", stationId);
}

function triggerFeederPulse(candidate: NearbyHeavyTransportCandidate | undefined): void {
  feederPulseToken += 1;
  const token = feederPulseToken;
  feederPulseActive.value = false;
  if (feederPulseTimer !== undefined) {
    window.clearTimeout(feederPulseTimer);
    feederPulseTimer = undefined;
  }

  if (!candidate?.projected || !heavyAccesses(candidate).some((access) => access.kind === "connection")) return;

  void nextTick(() => {
    if (token !== feederPulseToken) return;
    feederPulseActive.value = true;
    feederPulseTimer = window.setTimeout(() => {
      if (token !== feederPulseToken) return;
      feederPulseActive.value = false;
      feederPulseTimer = undefined;
    }, 3_100);
  });
}

function clearStationFocus(): void {
  pinnedStationId.value = undefined;
  hoveredStationId.value = undefined;
  stationHoveredLineId.value = undefined;
  stationPinnedLineId.value = undefined;
  emit("stationFocus", undefined);
}

function handleMapClick(event: MouseEvent): void {
  if (suppressNextMapClick) {
    suppressNextMapClick = false;
    if (suppressClickTimer !== undefined) {
      window.clearTimeout(suppressClickTimer);
      suppressClickTimer = undefined;
    }
    event.stopImmediatePropagation();
    return;
  }
  if (isInteractiveMapTarget(event.target) && !isMapGeometryTarget(event.target)) return;
  if (event.target instanceof Element && event.target.closest("[data-nearby-place-canvas]")) return;
  if (isMapGeometryTarget(event.target)) return;
  if (isPlacesPreview.value) {
    emit("selectPlace", undefined);
    return;
  }
  clearSummaryLineFocus();
  clearStationFocus();
  emit("clearLineFocus");
}

async function openPlacesDirectory(): Promise<void> {
  if (document.fullscreenElement === shell.value) {
    try {
      await document.exitFullscreen();
    } catch {
      setFullscreenState(false);
    }
    await nextTick();
  }
  emit("openPlacesDirectory");
}

function openLineTrace(directionId: string, model?: GhostLineFlowModel): void {
  const lineId = model?.lineId ?? props.lineFlowModel?.lineId ?? props.hoveredLineId ?? props.activeLineId;
  if (!lineId) return;
  emit("viewTrace", lineId, directionId, pinnedStationId.value ?? activeStation.value?.id);
}

function scheduleGhostFlowTooltipContainment(): void {
  if (tooltipLayoutQueued || props.suspendResizeWork || animating.value || mapDragging.value) return;
  tooltipLayoutQueued = true;
  void nextTick(() => {
    tooltipLayoutQueued = false;
    containGhostFlowTooltips();
  });
}

function containGhostFlowTooltips(): void {
  // Packing uses DOM measurements; defer it until the gesture has settled.
  // The existing line overlay continues to position and animate the labels.
  if (props.suspendResizeWork || animating.value || mapDragging.value) return;
  const mapElement = root.value;
  if (!mapElement) return;
  const tooltips = [...mapElement.querySelectorAll<HTMLElement>(".transport-ghost-flow__exit, .transport-ghost-flow__terminus")];
  if (tooltips.length === 0) return;
  const mapBounds = mapElement.getBoundingClientRect();
  if (mapBounds.width <= 0 || mapBounds.height <= 0) return;

  // Keep a small sub-pixel safety margin as CSS transforms and browser zoom
  // can otherwise leave a visually clipped fraction of a border.
  const inset = 4;
  tooltips.forEach((tooltip) => {
    const isTerminus = tooltip.classList.contains("transport-ghost-flow__terminus");
    const overflowX = isTerminus ? "--ghost-flow-terminus-overflow-x" : "--ghost-flow-exit-overflow-x";
    const overflowY = isTerminus ? "--ghost-flow-terminus-overflow-y" : "--ghost-flow-exit-overflow-y";
    tooltip.style.setProperty(overflowX, "0px");
    tooltip.style.setProperty(overflowY, "0px");
  });

  tooltips.forEach((tooltip) => containGhostTooltipInBounds(tooltip, mapBounds, inset));

  const placedDirectionBounds: DOMRect[] = [...mapElement.querySelectorAll<HTMLElement>([
    ".nearby-heavy-access-guide",
    ".nearby-map__basemap-toggle",
    ".nearby-map__directory-toggle",
    ".nearby-map__neighborhood-score-toggle",
    ".nearby-map__display-toggle",
    ".nearby-map__isochrone-toggle",
    ".nearby-map__noise-toggle",
    ".nearby-map__fullscreen",
    ".nearby-map__travel-toggle",
    ".nearby-map__zoom-controls",
  ].join(", "))]
    .map((element) => element.getBoundingClientRect())
    .filter((bounds) => bounds.width > 0 && bounds.height > 0);
  const directionTooltips = tooltips.filter((tooltip) =>
    tooltip.classList.contains("line-out-of-bounds-direction-tooltip"),
  );

  for (const tooltip of directionTooltips) {
    const tooltipBounds = tooltip.getBoundingClientRect();
    if (placedDirectionBounds.some((bounds) => rectanglesOverlap(tooltipBounds, bounds, 8))) {
      const shift = findGhostTooltipPackingShift(tooltipBounds, placedDirectionBounds, mapBounds, inset, 8);
      if (shift) addGhostTooltipOffset(tooltip, shift.x, shift.y);
    }
    containGhostTooltipInBounds(tooltip, mapBounds, inset);
    placedDirectionBounds.push(tooltip.getBoundingClientRect());
  }
}

function findGhostTooltipPackingShift(
  tooltipBounds: DOMRect,
  placedBounds: readonly DOMRect[],
  mapBounds: DOMRect,
  inset: number,
  gap: number,
): { x: number; y: number } | undefined {
  const candidateLefts = new Set<number>([
    tooltipBounds.left,
    mapBounds.left + inset,
    mapBounds.right - inset - tooltipBounds.width,
  ]);
  const candidateTops = new Set<number>([
    tooltipBounds.top,
    mapBounds.top + inset,
    mapBounds.bottom - inset - tooltipBounds.height,
  ]);

  for (const placed of placedBounds) {
    candidateLefts.add(placed.left - gap - tooltipBounds.width);
    candidateLefts.add(placed.right + gap);
    candidateTops.add(placed.top - gap - tooltipBounds.height);
    candidateTops.add(placed.bottom + gap);
  }

  return [...candidateLefts]
    .flatMap((left) => [...candidateTops].map((top) => ({
      x: left - tooltipBounds.left,
      y: top - tooltipBounds.top,
    })))
    .filter(({ x, y }) => {
      const candidate = translateRect(tooltipBounds, x, y);
      return rectFitsBounds(candidate, mapBounds, inset)
        && placedBounds.every((placed) => !rectanglesOverlap(candidate, placed, gap));
    })
    .sort((left, right) => {
      const leftDistance = Math.abs(left.x) + Math.abs(left.y);
      const rightDistance = Math.abs(right.x) + Math.abs(right.y);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      if (Math.abs(left.y) !== Math.abs(right.y)) return Math.abs(left.y) - Math.abs(right.y);
      return Math.abs(left.x) - Math.abs(right.x);
    })[0];
}

function containGhostTooltipInBounds(tooltip: HTMLElement, mapBounds: DOMRect, inset: number): void {
  const isTerminus = tooltip.classList.contains("transport-ghost-flow__terminus");
  const overflowX = isTerminus ? "--ghost-flow-terminus-overflow-x" : "--ghost-flow-exit-overflow-x";
  const overflowY = isTerminus ? "--ghost-flow-terminus-overflow-y" : "--ghost-flow-exit-overflow-y";

  const tooltipBounds = tooltip.getBoundingClientRect();
  const offsetX = tooltipBounds.left < mapBounds.left + inset
    ? mapBounds.left + inset - tooltipBounds.left
    : tooltipBounds.right > mapBounds.right - inset
      ? mapBounds.right - inset - tooltipBounds.right
      : 0;
  const offsetY = tooltipBounds.top < mapBounds.top + inset
    ? mapBounds.top + inset - tooltipBounds.top
    : tooltipBounds.bottom > mapBounds.bottom - inset
      ? mapBounds.bottom - inset - tooltipBounds.bottom
      : 0;

  addGhostTooltipOffset(tooltip, offsetX, offsetY, overflowX, overflowY);
}

function addGhostTooltipOffset(
  tooltip: HTMLElement,
  offsetX: number,
  offsetY: number,
  overflowX = "--ghost-flow-exit-overflow-x",
  overflowY = "--ghost-flow-exit-overflow-y",
): void {
  const currentX = Number.parseFloat(tooltip.style.getPropertyValue(overflowX)) || 0;
  const currentY = Number.parseFloat(tooltip.style.getPropertyValue(overflowY)) || 0;
  tooltip.style.setProperty(overflowX, `${Math.round(currentX + offsetX)}px`);
  tooltip.style.setProperty(overflowY, `${Math.round(currentY + offsetY)}px`);
}

function rectanglesOverlap(left: DOMRect, right: DOMRect, gap = 0): boolean {
  return left.left < right.right + gap && left.right > right.left - gap
    && left.top < right.bottom + gap && left.bottom > right.top - gap;
}

function translateRect(rect: DOMRect, x: number, y: number): DOMRect {
  return {
    ...rect,
    x: rect.x + x,
    y: rect.y + y,
    left: rect.left + x,
    right: rect.right + x,
    top: rect.top + y,
    bottom: rect.bottom + y,
    toJSON: () => ({}),
  } as DOMRect;
}

function rectFitsBounds(rect: DOMRect, bounds: DOMRect, inset: number): boolean {
  return rect.left >= bounds.left + inset
    && rect.right <= bounds.right - inset
    && rect.top >= bounds.top + inset
    && rect.bottom <= bounds.bottom - inset;
}

function isPinned(entry: NearbyStationEntry): boolean {
  return pinnedStationId.value === entry.id;
}

function modeLabel(mode: GlobalMapMode): string {
  switch (mode) {
    case "METRO": return t("nearbyStations.modes.metro");
    case "RER": return t("nearbyStations.modes.rer");
    case "TRAIN": return t("nearbyStations.modes.train");
    case "TRANSILIEN": return t("nearbyStations.modes.transilien");
    case "TRAM": return t("nearbyStations.modes.tram");
    case "CABLE": return t("nearbyStations.modes.cable");
    case "BUS": return t("nearbyStations.modes.bus");
    case "NOCTILIEN": return t("nearbyStations.modes.noctilien");
    case "BIKE": return t("nearbyStations.modes.bike");
    default: return mode;
  }
}

function directionLabel(destination: string): string {
  return t("nearbyStations.direction", { destination });
}

function walkingMinutes(entry: NearbyStationEntry): number {
  return Math.max(1, Math.ceil(entry.distanceMeters / 80));
}

function markerAriaLabel(entry: NearbyStationEntry): string {
  const lineCount = entry.lines.length > 1
    ? `, ${t("nearbyStations.lineCount", { count: entry.lines.length })}`
    : "";
  return `${entry.station.name}, ${formatTransitDistanceMeters(entry.distanceMeters)}, ${t("nearbyStations.walkingTime", { minutes: walkingMinutes(entry) })}${lineCount}`;
}

function lineFamily(mode: GlobalMapMode): TransitFamily | undefined {
  if (mode === "METRO" || mode === "RER" || mode === "BUS" || mode === "TRAM" || mode === "NOCTILIEN" || mode === "TRANSILIEN" || mode === "CABLE") return mode;
  if (mode === "TRAIN") return "TRANSILIEN";
  return undefined;
}

function lineBadge(line: GlobalMapLine) {
  const family = lineFamily(line.mode);
  const label = lineDisplayLabel(line) || line.code;
  const presentation = createLinePresentation({
    code: line.code,
    color: line.color,
    family,
    id: line.id,
    longName: line.label,
    mode: family ? transitFamilyToMode(family) : undefined,
    ref: line.sourceLineId ?? line.id,
    shortName: label,
    textColor: line.textColor,
  });
  const iconUrls = Array.from(new Set([
    ...(line.pictogram ? [line.pictogram] : []),
    ...(presentation.iconUrls ?? []),
  ]));

  return {
    id: line.id,
    label,
    family,
    mode: family ? transitFamilyToMode(family) : undefined,
    color: presentation.color,
    textColor: presentation.textColor,
    iconUrl: line.pictogram ?? presentation.iconUrl,
    iconUrls,
    ref: line.sourceLineId ?? line.id,
  };
}

function markerLine(entry: NearbyStationEntry): GlobalMapLine | undefined {
  const preferredLineId = cityViewEnabled.value ? cityViewPreferredLineId.value : undefined;
  if (preferredLineId) {
    const preferredLine = entry.lines.find((line) => line.id === preferredLineId);
    if (preferredLine) return preferredLine;
  }

  const selectedMode = cityViewEnabled.value ? cityViewSelectedTransportMode.value : undefined;
  if (selectedMode) return entry.lines.find((line) => line.mode === selectedMode);

  const visibleModes = cityViewEnabled.value ? CITY_VIEW_STATION_MODES : props.activeModes;
  const prioritizedLine = LINE_MODE_ORDER
    .map((mode) => entry.lines.find((line) => line.mode === mode && visibleModes.includes(line.mode)))
    .find((line): line is GlobalMapLine => Boolean(line));
  return prioritizedLine ?? (cityViewEnabled.value
    ? entry.lines.find((line) => visibleModes.includes(line.mode))
    : undefined);
}

function lineDisplayLabel(line: GlobalMapLine | undefined): string {
  if (!line) return "";
  const directLabel = line.label.trim();
  if (directLabel && !isOpaqueLineCode(directLabel)) return directLabel;

  const knownLabel = [line.code, line.sourceLineId ?? "", line.id, ...line.aliases]
    .map(lineCodeFromIdentity)
    .filter((code): code is string => Boolean(code))
    .map((code) => KNOWN_HEAVY_LINE_LABELS_BY_CODE[code])
    .find((label): label is string => Boolean(label));

  return knownLabel || directLabel || line.code.trim();
}

function lineCodeFromIdentity(value: string): string | undefined {
  const match = value.match(/C\d{5}/iu);
  return match?.[0]?.toUpperCase();
}

function isOpaqueLineCode(value: string): boolean {
  return /^(?:line:)?(?:IDFM:)?C\d{5}$/iu.test(value.trim());
}

function shouldUseOfficialMarkerLogo(entry: NearbyStationEntry): boolean {
  const mode = markerLine(entry)?.mode;
  return mode === "METRO" || mode === "RER" || mode === "TRAIN" || mode === "TRANSILIEN" || mode === "TRAM";
}

function shouldUseLineBadge(entry: NearbyStationEntry): boolean {
  return Boolean(markerLine(entry)) && (cityViewEnabled.value || shouldUseOfficialMarkerLogo(entry));
}

function isHeavyTransport(entry: NearbyStationEntry): boolean {
  const mode = markerLine(entry)?.mode;
  return mode ? HEAVY_TRANSPORT_MODES.includes(mode) : false;
}

function isBusMarker(entry: NearbyStationEntry): boolean {
  const mode = markerLine(entry)?.mode;
  return mode === "BUS" || mode === "NOCTILIEN";
}

function markerScreen(entry: NearbyStationEntry): ScreenPoint {
  if (markerProjectionCamera !== camera.value) {
    markerProjectionCamera = camera.value;
    markerProjectionCache.clear();
  }
  const key = `${entry.id}:${entry.station.worldX}:${entry.station.worldY}`;
  const cached = markerProjectionCache.get(key);
  if (cached) return cached;
  const projected = measureDevPerformance(
    "nearby-station-projection",
    () => worldToScreen({ x: entry.station.worldX, y: entry.station.worldY }, camera.value),
  );
  markerProjectionCache.set(key, projected);
  return projected;
}

function isCityViewStationInViewport(entry: NearbyStationEntry): boolean {
  const point = markerScreen(entry);
  const width = camera.value.viewportWidthCssPx;
  const height = camera.value.viewportHeightCssPx;
  return point.x >= -CITY_VIEW_MARKER_VIEWPORT_PADDING &&
    point.x <= width + CITY_VIEW_MARKER_VIEWPORT_PADDING &&
    point.y >= -CITY_VIEW_MARKER_VIEWPORT_PADDING &&
    point.y <= height + CITY_VIEW_MARKER_VIEWPORT_PADDING;
}

function isCityViewStationInsideNeighborhoods(entry: NearbyStationEntry): boolean {
  const point = { lon: entry.station.lon, lat: entry.station.lat };
  return cityViewNeighborhoods.value.some((neighborhood) =>
    pointInIrisGeometry(point, neighborhood.geometry),
  );
}

function isCityViewIsochroneStation(entry: NearbyStationEntry): boolean {
  if (isCityViewStationInsideNeighborhoods(entry)) return true;

  // Outside-city stations remain visible as network context, but their
  // walking requests are opt-in: a direct station focus, a focused line, or
  // an explicit transport-mode toggle is enough to request that station.
  const directStationFocus = hoveredStationId.value === entry.id || pinnedStationId.value === entry.id;
  if (directStationFocus) return true;

  const focusedLineIds = cityViewIsochroneFocusedLineIds.value;
  if (entry.lines.some((line) => focusedLineIds.has(line.id))) return true;

  const selectedMode = cityViewSelectedTransportMode.value;
  return selectedMode !== undefined && entry.lines.some((line) => line.mode === selectedMode);
}

function isCityViewBusMode(mode: GlobalMapMode): boolean {
  return mode === "BUS" || mode === "NOCTILIEN";
}

function shouldDisplayCityViewStation(
  entry: NearbyStationEntry,
  visibleModes: readonly GlobalMapMode[],
): boolean {
  const focusedLineIds = cityViewFocusedLineIds.value;
  const visibleLines = entry.lines.filter((line) =>
    visibleModes.includes(line.mode) || focusedLineIds.has(line.id),
  );
  if (visibleLines.length === 0) return false;

  // The commune view is deliberately polygon-based. The camera is expanded
  // around the IRIS bounds for context, so viewport visibility alone would
  // bring back bus stops from neighbouring towns (notably the TVM corridor).
  if (isCityViewStationInsideNeighborhoods(entry)) return true;

  // Keep the existing contextual display for rail/tram outside the polygon,
  // while requiring an explicit line focus for every bus-family stop.
  return visibleLines.some((line) =>
    !isCityViewBusMode(line.mode) || focusedLineIds.has(line.id),
  );
}

function nearbyMapContentBounds(width: number, height: number): NearbyHeavyProjectionBounds {
  const mapWidth = Math.max(0, width);
  const mapHeight = Math.max(0, height);
  const left = 0;
  const right = mapWidth;
  const top = Math.min(nearbyMapTopControlReserve(mapWidth), mapHeight);
  const bottom = mapHeight;
  return { left, right, top, bottom };
}

function nearbyMapTopControlReserve(width: number): number {
  return width <= 520 ? NEARBY_MAP_MOBILE_TOP_CONTROL_RESERVE : NEARBY_MAP_TOP_CONTROL_RESERVE;
}

function nearbyMapLoadingTop(): number {
  const width = camera.value.viewportWidthCssPx;
  return nearbyMapTopControlReserve(width) + 8;
}

function nearbyMapProjectionBounds(width: number, height: number): NearbyHeavyProjectionBounds {
  // Keep the projection oriented with the station's actual direction. A
  // right-only projection band makes every north-facing station enter from
  // the right as soon as its ray crosses the artificial left boundary.
  return nearbyMapContentBounds(width, height);
}

function markerStyle(entry: NearbyStationEntry, index: number): Record<string, string> {
  const screen = markerScreen(entry);
  const width = camera.value.viewportWidthCssPx;
  const height = camera.value.viewportHeightCssPx;
  const bounds = nearbyMapContentBounds(width, height);
  return {
    left: `${screen.x}px`,
    // City view only renders stops that are already in the viewport. Keep
    // their real screen coordinate instead of projecting out-of-bounds stops
    // onto the top edge of the map.
    top: `${cityViewEnabled.value ? screen.y : clamp(screen.y, bounds.top, bounds.bottom)}px`,
    "--nearby-map-pop-delay": `${240 + Math.min(index * 20, 160)}ms`,
    "--nearby-marker-color": markerLine(entry)?.color ?? "#0064ff",
  };
}

function summaryLineStationStyle(station: NearbySummaryLineStation): Record<string, string> {
  return {
    left: `${station.x}px`,
    top: `${station.y}px`,
    "--nearby-summary-line-color": summaryHoveredLine.value?.color ?? "#5146ff",
  };
}

function markerTooltipPlacement(entry: NearbyStationEntry): string[] {
  const screen = markerScreen(entry);
  const width = camera.value.viewportWidthCssPx;
  const height = camera.value.viewportHeightCssPx;
  const bounds = nearbyMapContentBounds(width, height);
  const classes: string[] = [];
  if (screen.x > width - 170) classes.push("nearby-map__marker-anchor--tooltip-left");
  else if (screen.x < 170) classes.push("nearby-map__marker-anchor--tooltip-right");
  if (screen.y < bounds.top + 44) classes.push("nearby-map__marker-anchor--tooltip-below");
  else if (screen.y > bounds.bottom - 44) classes.push("nearby-map__marker-anchor--tooltip-above");
  return classes;
}

function markerStyleForSupplemental(candidate: NearbyHeavyTransportCandidate, index: number): Record<string, string> {
  const screen = markerScreen(candidate.entry);
  const width = camera.value.viewportWidthCssPx;
  const height = camera.value.viewportHeightCssPx;
  // The projection helper's inset is a fallback for standalone callers. The
  // nearby map reserves only the top control band, so its other edges remain
  // the physical map edges.
  const projectionInset = 0;
  const contentBounds = nearbyMapContentBounds(width, height);
  const projectionBounds = nearbyMapProjectionBounds(width, height);
  const bounds = candidate.projected ? projectionBounds : contentBounds;
  const center = originScreen.value;
  const projection = candidate.projected
    ? projectNearbyHeavyStationToViewport(screen, center, width, height, projectionInset, bounds)
    : undefined;
  const basePoint = candidate.projected
    ? projection!.point
    : {
      x: clamp(screen.x, bounds.left, bounds.right),
      y: clamp(screen.y, bounds.top, bounds.bottom),
    };
  const projectedPoint = candidate.projected
    ? distributeProjectedSupplementalPoint(candidate, basePoint, projection!, center, width, height, projectionInset, bounds)
    : basePoint;
  const usesFreeNorthBand = candidate.projected && projection && (
    projection.anchor === "top" || projection.anchor === "top-left"
  );
  const protectsZoomControls = candidate.projected && isFullscreen.value && projection?.anchor === "bottom-right";
  const positionedPoint = usesFreeNorthBand
    ? {
      x: projectedPoint.x,
      y: Math.max(
        NEARBY_MAP_CONTENT_INSET,
        projectedPoint.y - (nearbyMapTopControlReserve(width) - NEARBY_MAP_CONTENT_INSET),
      ),
    }
    : protectsZoomControls
      ? { x: projectedPoint.x, y: Math.min(projectedPoint.y, height - NEARBY_MAP_FULLSCREEN_BOTTOM_CONTROL_RESERVE) }
    : projectedPoint;
  const edgeSafePoint = projection
    ? keepProjectedMarkerInsideHorizontalEdges(positionedPoint, projection.anchor, width)
    : positionedPoint;
  const projectedX = edgeSafePoint.x;
  const projectedY = edgeSafePoint.y;
  const angle = Math.atan2(screen.y - projectedY, screen.x - projectedX) * 180 / Math.PI;
  return {
    left: `${projectedX}px`,
    top: `${projectedY}px`,
    "--nearby-map-pop-delay": `${300 + Math.min(index * 20, 160)}ms`,
    "--nearby-marker-color": markerLine(candidate.entry)?.color ?? "#5146ff",
    "--nearby-marker-edge-angle": `${Number.isFinite(angle) ? angle : 0}deg`,
    "--nearby-heavy-edge-label-max-width": `${Math.max(0, bounds.right - bounds.left - 4)}px`,
  };
}

function keepProjectedMarkerInsideHorizontalEdges(
  point: ScreenPoint,
  anchor: NearbyHeavyProjectionEdge | NearbyHeavyProjectionCorner,
  width: number,
): ScreenPoint {
  const clearance = Math.min(NEARBY_MAP_HORIZONTAL_MARKER_CLEARANCE, Math.max(0, width / 2));
  if (anchor === "left" || anchor.endsWith("-left")) {
    return { x: Math.max(clearance, point.x), y: point.y };
  }
  if (anchor === "right" || anchor.endsWith("-right")) {
    return { x: Math.min(Math.max(clearance, width - clearance), point.x), y: point.y };
  }
  return point;
}

function supplementalMarkerProjection(
  candidate: NearbyHeavyTransportCandidate,
  center: ScreenPoint,
  width: number,
  height: number,
  inset: number,
  bounds: NearbyHeavyProjectionBounds = nearbyMapProjectionBounds(width, height),
): NearbyHeavyViewportProjection | undefined {
  if (!candidate.projected) return undefined;
  return projectNearbyHeavyStationToViewport(
    markerScreen(candidate.entry),
    center,
    width,
    height,
    inset,
    bounds,
  );
}

function supplementalMarkerPlacement(candidate: NearbyHeavyTransportCandidate): string[] {
  const width = camera.value.viewportWidthCssPx;
  const height = camera.value.viewportHeightCssPx;
  const bounds = nearbyMapProjectionBounds(width, height);
  const projection = supplementalMarkerProjection(candidate, originScreen.value, width, height, 0, bounds);
  return projection ? [`nearby-map__marker-anchor--projection-${projection.anchor}`] : [];
}

function distributeProjectedSupplementalPoint(
  candidate: NearbyHeavyTransportCandidate,
  basePoint: ScreenPoint,
  projection: NearbyHeavyViewportProjection,
  center: ScreenPoint,
  width: number,
  height: number,
  inset: number,
  bounds: NearbyHeavyProjectionBounds,
): ScreenPoint {
  const anchor = projection.anchor;
  const edgeCandidates = displayedSupplementalStations.value.filter((other) =>
    other.projected && supplementalMarkerProjectionFor(other, center, width, height, inset, bounds)?.anchor === anchor,
  );
  if (edgeCandidates.length <= 1) return basePoint;

  const slot = Math.max(0, edgeCandidates.findIndex((other) => other.id === candidate.id));
  if (isNearbyHeavyProjectionCorner(anchor)) {
    const corner = anchor;
    const gap = Math.min(58, (bounds.right - bounds.left) / edgeCandidates.length);
    const coordinate = corner.includes("right")
      ? bounds.right - slot * gap
      : bounds.left + slot * gap;
    return {
      x: clamp(coordinate, bounds.left, bounds.right),
      y: corner.includes("bottom") ? bounds.bottom : bounds.top,
    };
  }

  const edge = anchor;
  const horizontal = edge === "top" || edge === "bottom";
  const axisStart = horizontal ? bounds.left : bounds.top;
  const axisEnd = horizontal ? bounds.right : bounds.bottom;
  const gap = Math.min(58, (axisEnd - axisStart) / edgeCandidates.length);
  const middle = (edgeCandidates.length - 1) / 2;
  const coordinate = (axisStart + axisEnd) / 2 + (slot - middle) * gap;
  const clampedCoordinate = clamp(
    coordinate,
    axisStart,
    axisEnd,
  );

  if (edge === "top") return { x: clampedCoordinate, y: basePoint.y };
  if (edge === "bottom") return { x: clampedCoordinate, y: basePoint.y };
  if (edge === "left") return { x: basePoint.x, y: clampedCoordinate };
  return { x: basePoint.x, y: clampedCoordinate };
}

function supplementalMarkerProjectionFor(
  candidate: NearbyHeavyTransportCandidate,
  center: ScreenPoint,
  width: number,
  height: number,
  inset: number,
  bounds: NearbyHeavyProjectionBounds,
): NearbyHeavyViewportProjection | undefined {
  return supplementalMarkerProjection(candidate, center, width, height, inset, bounds);
}

function isNearbyHeavyProjectionCorner(
  anchor: NearbyHeavyProjectionEdge | NearbyHeavyProjectionCorner,
): anchor is NearbyHeavyProjectionCorner {
  return anchor.includes("-");
}

function heavyAccessPresentation(candidate: NearbyHeavyTransportCandidate | undefined, entry: NearbyStationEntry) {
  const line = markerLine(entry);
  const access = line ? candidate?.accessByLine[line.id] ?? candidate?.access : candidate?.access;
  return access ? getNearbyHeavyAccessPresentation(access, candidate?.projected ?? false) : undefined;
}

function heavyAccesses(candidate: NearbyHeavyTransportCandidate): NearbyHeavyTransportCandidate["access"][] {
  const allAccesses = [
    ...Object.values(candidate.accessByLine),
    ...(candidate.accessAlternatives ?? []),
    ...Object.values(candidate.accessAlternativesByLine ?? {}).flat(),
  ];
  const seen = new Set<string>();
  const accesses = allAccesses.filter((access) => {
    const key = access.kind === "direct"
      ? "direct"
      : `connection:${(access.feederLineCode ?? access.feederLineId ?? access.feederMode ?? "unknown").trim().toLocaleLowerCase("fr-FR")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return accesses.length > 0 ? accesses : [candidate.access];
}

function supplementalFeederLineIds(
  candidate: NearbyHeavyTransportCandidate,
  targetLine: GlobalMapLine,
): string[] {
  const targetAccesses = candidate.accessAlternativesByLine?.[targetLine.id]
    ?? candidate.accessAlternatives
    ?? [candidate.accessByLine[targetLine.id] ?? candidate.access];

  const localLines = [
    ...props.stations.flatMap((entry) => entry.lines),
    ...candidate.entry.lines,
  ];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const access of targetAccesses) {
    if (access.kind !== "connection") continue;
    const feederKey = access.feederLineId?.trim() || access.feederLineCode?.trim();
    if (!feederKey) continue;
    const lineId = localLines.find((line) => lineKeyValues(line).some((value) => lineKeysMatch(value, feederKey)))?.id
      ?? feederKey;
    if (seen.has(lineId)) continue;
    seen.add(lineId);
    ids.push(lineId);
  }
  return ids;
}

function lineKeyValues(line: GlobalMapLine): string[] {
  return [line.id, line.code, line.label, line.sourceLineId ?? "", ...line.aliases]
    .filter(Boolean)
    .map(normalizeLineKey);
}

function lineKeysMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeLineKey(left);
  const normalizedRight = normalizeLineKey(right);
  return normalizedLeft === normalizedRight ||
    normalizedLeft.endsWith(`:${normalizedRight}`) ||
    normalizedRight.endsWith(`:${normalizedLeft}`);
}

function heavyModeLabel(mode: GlobalMapMode | undefined): string {
  if (!mode) return t("nearbyStations.modes.bus");
  return modeLabel(mode);
}

function heavyAccess(candidate: NearbyHeavyTransportCandidate | undefined, entry: NearbyStationEntry): string | undefined {
  const presentation = heavyAccessPresentation(candidate, entry);
  if (!presentation) return undefined;
  if (presentation.kind === "walking") {
    return t("nearbyStations.heavyDirectAccess", { minutes: presentation.minutes });
  }
  if (presentation.kind === "feeder") {
    return t("nearbyStations.heavyFeederAccess", {
      mode: heavyModeLabel(presentation.mode),
      minutes: presentation.minutes,
    });
  }
  return t("nearbyStations.heavyConnectionAccess", { minutes: presentation.minutes });
}

function heavyCandidateLines(candidate: NearbyHeavyTransportCandidate): GlobalMapLine[] {
  return heavyCandidateLinesById.value.get(candidate.id) ?? [];
}

function heavyCandidateLineLabel(candidate: NearbyHeavyTransportCandidate): string {
  return heavyCandidateLines(candidate)
    .map((line) => {
      const label = lineDisplayLabel(line);
      if (!label) return "";
      return /^(?:métro|metro|rer|train|transilien|tram|bus|noctilien|cable)\b/iu.test(label)
        ? label
        : `${modeLabel(line.mode)} ${label}`;
    })
    .filter(Boolean)
    .join(", ");
}

function heavyCandidateTooltipLabel(candidate: NearbyHeavyTransportCandidate): string {
  const lineLabel = heavyCandidateLineLabel(candidate);
  const access = heavyAccess(candidate, candidate.entry);
  return [candidate.entry.station.name, lineLabel, access].filter(Boolean).join(" · ");
}

function heavyMarkerAriaLabel(candidate: NearbyHeavyTransportCandidate): string {
  return heavyCandidateTooltipLabel(candidate);
}

function shouldShowInlineSchedules(entry: NearbyStationEntry): boolean {
  if (cityViewEnabled.value || summaryLineHoverActive.value) return false;
  const state = markerScheduleState(entry);
  if (state !== "visible" && state !== "unavailable") return false;

  // Selecting a projected heavy station turns the map into a feeder view:
  // schedule badges stay only on stops that can actually reach that station.
  // With no feeder route (for example a direct walk), preserve the normal map.
  return !hasFocusedHeavyFeeder.value || isFeederStation(entry, focusedHeavyFeederLineKeys.value);
}

function isSelected(entry: NearbyStationEntry): boolean {
  return props.selectedLineIds(entry.id).length > 0;
}

function isAttenuated(entry: NearbyStationEntry): boolean {
  if (isFeederStation(entry)) return false;
  const targetLineId = props.hoveredLineId ?? props.activeLineId;
  if (!targetLineId || activeStation.value?.id === entry.id) return false;
  if (entry.lines.some((line) => line.id === targetLineId)) return false;
  return entry.lines.some((line) => line.mode === "BUS" || line.mode === "NOCTILIEN");
}

function isFeederStation(
  entry: NearbyStationEntry,
  feederKeys: ReadonlySet<string> = pinnedHeavyFeederLineKeys.value,
): boolean {
  if (feederKeys.size === 0 || !entry.insideRadius) return false;

  return entry.lines.some((line) =>
    entry.lineInsideRadius?.[line.id] !== false && lineMatchesFeederKeys(line, feederKeys),
  );
}

function lineMatchesFeederKeys(line: GlobalMapLine, feederKeys: ReadonlySet<string>): boolean {
  return [...feederKeys].some((key) => {
    const separator = key.indexOf(":");
    const keyType = separator >= 0 ? key.slice(0, separator) : "";
    const keyValue = separator >= 0 ? key.slice(separator + 1) : key;
    if (keyType === "id") return lineKeysMatch(line.id, keyValue);
    if (keyType === "code") return lineKeyValues(line).some((value) => lineKeysMatch(value, keyValue));
    return false;
  });
}

function normalizeLineKey(value: string): string {
  return value.trim().toLocaleLowerCase("fr-FR");
}

function stationMode(entry: NearbyStationEntry): GlobalMapMode {
  return markerLine(entry)?.mode ?? entry.lines[0]?.mode ?? "BUS";
}

function modeIcon(mode: GlobalMapMode) {
  if (mode === "BUS" || mode === "NOCTILIEN") return BusFront;
  if (mode === "TRAM") return TramFront;
  return TrainFront;
}

function lineForDetails(entry: NearbyStationEntry): GlobalMapLine | undefined {
  const selected = props.selectedLineIds(entry.id);
  return entry.lines.find((line) => selected.includes(line.id))
    ?? entry.lines.find((line) => props.activeModes.includes(line.mode));
}

function longitudeDelta(lat: number, meters: number): number {
  return meters / Math.max(1, 111_320 * Math.cos((lat * Math.PI) / 180));
}

function mix(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}
</script>

<template>
  <div
    ref="shell"
    class="nearby-map-shell"
    :class="{
      'nearby-map-shell--resizing': sidebarResizeActive,
      'nearby-map-shell--places-preview': isPlacesPreview,
      'nearby-map-shell--city-view': cityViewEnabled,
      'nearby-map-shell--environment-active': cityViewEnabled && (noiseZonesEnabled || airQualityZonesEnabled),
    }"
    :style="{
      '--nearby-sidebar-width': `${sidebarWidth}px`,
      '--nearby-city-transition-duration': `${CITY_VIEW_CAMERA_TRANSITION_DURATION_MS}ms`,
    }"
  >
    <div
    ref="root"
    class="nearby-map"
    :class="{
      'nearby-map--satellite': basemapLayer === 'satellite',
      'nearby-map--isochrone': isochroneEnabled,
      'nearby-map--isochrone-panel-open': isochronePanelOpen,
      'nearby-map--interactive': canInteractWithMap,
      'nearby-map--dragging': mapDragging,
      'nearby-map--interacting': isMapInteracting,
    }"
    :aria-label="t('nearbyStations.mapAria')"
      @pointercancel="handlePointerEnd"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerEnd"
      @click.capture="handleMapClick"
      @wheel="handleWheel"
    >
      <slot
        v-if="!cityViewEnabled && !summaryLineHoverActive"
        name="heavy-access-guide"
        :candidate="pinnedHeavyStation"
      />
      <div ref="gestureCameraLayer" class="nearby-map__camera-layer">
      <NearbyStationsBasemap
        :camera="camera"
        :reference-camera="nearbyBasemapReferenceCamera"
        :bounds="nearbyBasemapCoverBounds"
        :source-zoom="nearbyCoverSourceZoom"
        :layer="basemapLayer"
        basemap-provider="openstreetmap"
        :basemap-style="props.basemapStyle"
        :interaction-active="animating"
        @coverage-audit="handleBasemapCoverageAudit"
      />
      <svg
        v-if="!summaryLineHoverActive && airQualityZoneCells.length > 0"
        class="nearby-map__air-quality-zones"
        :viewBox="`0 0 ${isochroneViewport.width} ${isochroneViewport.height}`"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g :transform="isochroneTransform">
          <rect
            v-for="cell in airQualityZoneCells"
            :key="`air-quality-zone:${cell.column}:${cell.row}`"
            class="nearby-map__air-quality-zone"
            :class="{ 'nearby-map__environment-zone--hovered': isHoveredEnvironmentCell('air-quality', cell) }"
            :data-air-quality-level="cell.airQualityLevel"
            :x="cell.x"
            :y="cell.y"
            :width="cell.width"
            :height="cell.height"
            @mouseenter="hoverEnvironmentCell('air-quality', cell, $event)"
            @mousemove="hoverEnvironmentCell('air-quality', cell, $event)"
            @mouseleave="clearHoveredEnvironmentCell('air-quality', cell)"
          />
        </g>
      </svg>
      <svg
        v-if="!summaryLineHoverActive && noiseZoneCells.length > 0"
        class="nearby-map__noise-zones"
        :viewBox="`0 0 ${isochroneViewport.width} ${isochroneViewport.height}`"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g :transform="isochroneTransform">
          <rect
            v-for="cell in noiseZoneCells"
            :key="`noise-zone:${cell.column}:${cell.row}`"
            class="nearby-map__noise-zone"
            :class="{ 'nearby-map__environment-zone--hovered': isHoveredEnvironmentCell('noise', cell) }"
            :data-noise-level="cell.noiseLevel"
            :x="cell.x"
            :y="cell.y"
            :width="cell.width"
            :height="cell.height"
            @mouseenter="hoverEnvironmentCell('noise', cell, $event)"
            @mousemove="hoverEnvironmentCell('noise', cell, $event)"
            @mouseleave="clearHoveredEnvironmentCell('noise', cell)"
          />
        </g>
      </svg>
      <svg
        v-if="!summaryLineHoverActive && isochronePaths.length > 0"
        class="nearby-map__walking-zones"
        :viewBox="`0 0 ${isochroneViewport.width} ${isochroneViewport.height}`"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g :transform="isochroneTransform">
          <path
            v-for="zone in isochronePaths"
            :key="`walking-zone:${zone.minutes}`"
            class="nearby-map__walking-zone"
            :data-walking-zone="zone.minutes"
            :data-walking-zone-index="zone.zoneIndex"
            :d="zone.d"
            fill-rule="evenodd"
            @click.stop
            @mouseenter="hoverIsochrone(zone.minutes, zone.zoneIndex, zone.transport, $event)"
            @mousemove="hoverIsochrone(zone.minutes, zone.zoneIndex, zone.transport, $event)"
            @mouseleave="clearHoveredIsochrone(zone.minutes, zone.zoneIndex, zone.transport)"
          />
        </g>
      </svg>
      <svg
        v-if="!summaryLineHoverActive && cityIsochronePaths.length > 0"
        class="nearby-map__walking-zones nearby-map__walking-zones--city"
        :viewBox="`0 0 ${isochroneViewport.width} ${isochroneViewport.height}`"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g :transform="isochroneTransform">
          <path
            v-for="zone in cityIsochronePaths"
            :key="`city-walking-zone:${zone.mode}:${zone.minutes}`"
            class="nearby-map__walking-zone"
            :data-walking-zone="zone.minutes"
            :data-walking-zone-index="zone.zoneIndex"
            :data-walking-mode="zone.mode"
            :d="zone.d"
            fill-rule="evenodd"
            stroke="none"
            @click.stop
            @mouseenter="hoverIsochrone(zone.minutes, zone.zoneIndex, zone.transport, $event, zone.mode)"
            @mousemove="hoverIsochrone(zone.minutes, zone.zoneIndex, zone.transport, $event, zone.mode)"
            @mouseleave="clearHoveredIsochrone(zone.minutes, zone.zoneIndex, zone.transport)"
          />
        </g>
      </svg>
      <GhostLineFlowOverlay
        v-for="model in renderedLineFlowModels"
        :key="`ghost-flow:${model.lineId ?? model.color}`"
        :model="model"
        :direction-label="directionLabel"
        :terminus-label="t('nearbyStations.terminus')"
        :fullscreen="isFullscreen"
        :trace-action-label="traceActionLabel"
        @view-trace="openLineTrace($event, model)"
      />
      <div
        v-if="summaryLineHoverActive"
        class="nearby-map__summary-line-stations"
        aria-hidden="true"
      >
        <span
          v-for="station in summaryHoveredLineStations"
          :key="`summary-line-station:${station.key}`"
          class="nearby-map__summary-line-station"
          :style="summaryLineStationStyle(station)"
          :title="station.station.name"
        >
          <span class="nearby-map__summary-line-station-dot" />
          <span class="nearby-map__summary-line-station-name">{{ station.station.name }}</span>
        </span>
      </div>
      <svg
        v-if="walkingMapPaths.length > 0"
        class="nearby-map__walking-flow"
        :viewBox="`0 0 ${walkingMapPaths[0]?.width ?? camera.viewportWidthCssPx} ${walkingMapPaths[0]?.height ?? camera.viewportHeightCssPx}`"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g v-for="segment in walkingMapPaths" :key="segment.id">
          <path class="nearby-map__walking-flow-halo" :d="segment.d" />
          <path class="nearby-map__walking-flow-path" :d="segment.d" />
          <circle class="nearby-map__walking-flow-node" :cx="segment.from.x" :cy="segment.from.y" r="4" />
          <circle class="nearby-map__walking-flow-node" :cx="segment.to.x" :cy="segment.to.y" r="4" />
        </g>
      </svg>
      <NearbyCityComparisonOverlay
        v-if="cityViewEnabled && irisDataset && cityViewNearbyCommunes.length > 0"
        :neighborhoods="cityViewNearbyCommuneNeighborhoods"
        :camera="camera"
        :current-commune-code="cityViewComparisonCurrent?.code"
        @select="selectCityComparison"
      />
      <IrisNeighborhoodOverlay
        v-if="(cityViewEnabled || cityViewTransition === 'to-neighborhood') && irisDataset && cityViewNeighborhoods.length > 0"
        :neighborhoods="cityViewNeighborhoods"
        :camera="camera"
        :transport-stations="cityViewTransportStations"
        :air-noise-communes="cityViewAirNoiseCommunes"
        :air-noise-neighborhoods="cityViewAirNoiseNeighborhoods"
        :air-noise-source="irisDataset.airNoiseSource"
        :commerce-counts="cityViewActivity ? cityActivityCounts.counts : props.cityViewCommerceCounts"
        :activity-totals="cityActivityCounts.totals"
        :activity-label="cityViewActivity ? t(`nearbyStations.cityActivity.${cityViewActivity}`) : undefined"
        :commerce-data-available="props.cityViewPlaces !== undefined"
        :commerce-highlight="cityViewActivity !== null"
        :show-fill="!isochroneEnabled"
        :reveal-order="cityViewTransition === 'to-city' ? irisRevealOrder : undefined"
        :reveal-progress="cityViewTransition === 'to-city' ? irisRevealProgress : 1"
        :class="{
          'iris-neighborhood-overlay--city-fade-out': cityViewTransition === 'to-neighborhood',
          'iris-neighborhood-overlay--city-fade-in': cityViewTransition === 'to-city',
        }"
        scope="city"
      />
      </div>
      <div
        class="nearby-map__scale-control"
        data-testid="nearby-map-scale"
        role="img"
        :aria-label="t('nearbyStations.mapScaleAria', { distance: nearbyMapScale.distanceLabel })"
        :style="{ '--nearby-map-scale-width': `${nearbyMapScale.barWidthPx}px` }"
      >
        <div class="nearby-map__scale-north" aria-hidden="true">
          <span>N</span>
          <Navigation :size="16" :stroke-width="1.8" />
        </div>
        <div class="nearby-map__scale-ruler" aria-hidden="true">
          <div class="nearby-map__scale-labels">
            <span>0</span>
            <span>{{ nearbyMapScale.midpointLabel }}</span>
            <span>{{ nearbyMapScale.distanceLabel }}</span>
          </div>
          <div class="nearby-map__scale-track">
            <span aria-hidden="true" />
          </div>
        </div>
      </div>
      <NearbyLineHoverCard
        v-if="!cityViewEnabled && lineHoverCardLine"
        :line="lineBadge(lineHoverCardLine)"
        :profile="summaryLineFrequencyProfile"
        :loading="summaryLineFrequencyLoading"
        :unavailable="summaryLineFrequencyUnavailable"
        @open-line="openLineHoverCard"
      />
      <NearbyCityInfoCard
        v-if="cityViewEnabled && cityViewInfoCard"
        :ariaLabel="cityViewInfoCard.ariaLabel"
        :city-name="cityViewInfoCard.cityName"
        :collapse-label="t('nearbyStations.cityInfoCollapse')"
        :expand-label="t('nearbyStations.cityInfoExpand')"
        :eyebrow="cityViewInfoCard.eyebrow"
        :items="cityViewInfoCard.items"
        :selected-transport-mode="cityViewSelectedTransportMode"
        @transport-mode-toggle="toggleCityViewTransportMode"
        @item-action="handleCityInfoAction"
      />
      <NearbyCityComparisonModal
        v-if="cityViewComparisonCurrent && cityViewComparisonTarget"
        :open="Boolean(cityViewComparisonTargetCode)"
        :current="cityViewComparisonCurrent"
        :target="cityViewComparisonTarget"
        :rows="cityViewComparisonRows"
        :target-loading="Boolean(cityViewComparisonTargetCode && cityViewComparisonLoadingCodes.includes(cityViewComparisonTargetCode))"
        :current-loading="Boolean(cityViewComparisonEffectiveCurrentCode && cityViewComparisonLoadingCodes.includes(cityViewComparisonEffectiveCurrentCode))"
        :city-options="cityViewComparisonCityOptions"
        @close="closeCityComparison"
        @select-base-city="selectCityComparisonBase"
        @select-target-city="selectCityComparisonTarget"
        @swap-cities="swapCityComparison"
      />
      <div v-if="hasVisiblePrimaryControls" class="nearby-map__primary-controls">
        <button
          v-if="props.showCityViewControl"
          class="nearby-map__city-view-toggle"
          :class="{
            'nearby-map__city-view-toggle--active': cityViewEnabled,
            'nearby-map__city-view-toggle--animating': Boolean(cityViewTransition),
          }"
          type="button"
          :aria-pressed="cityViewEnabled"
          :aria-busy="cityViewLoading || Boolean(cityViewTransition)"
          :aria-label="t('nearbyStations.cityViewSwitchAria', { mode: cityViewEnabled ? t('nearbyStations.cityViewLabel') : t('nearbyStations.neighborhoodViewLabel') })"
          :title="t('nearbyStations.cityViewSwitchAria', { mode: cityViewEnabled ? t('nearbyStations.cityViewLabel') : t('nearbyStations.neighborhoodViewLabel') })"
          data-nearby-map-city-view-toggle
          @click.stop="void toggleCityView()"
        >
          <span
            class="nearby-map__city-view-slider"
            :class="{ 'nearby-map__city-view-slider--neighborhood': !cityViewEnabled }"
            aria-hidden="true"
          />
          <span
            class="nearby-map__city-view-option"
            :class="{ 'nearby-map__city-view-option--active': cityViewEnabled }"
            data-nearby-map-view-option="city"
          >{{ t('nearbyStations.cityViewLabel') }}</span>
          <span
            class="nearby-map__city-view-option"
            :class="{ 'nearby-map__city-view-option--active': !cityViewEnabled }"
            data-nearby-map-view-option="neighborhood"
          >{{ t('nearbyStations.neighborhoodViewLabel') }}</span>
        </button>
        <button
          v-if="props.showCityViewControl && cityViewEnabled"
          class="nearby-map__commerce-toggle"
          :class="{ 'nearby-map__commerce-toggle--active': cityViewCommerceVisible }"
          type="button"
          :aria-pressed="cityViewCommerceVisible"
          :aria-label="t(cityViewCommerceVisible ? 'nearbyStations.cityViewCommerceHide' : 'nearbyStations.cityViewCommerceToggle')"
          :title="t(cityViewCommerceVisible ? 'nearbyStations.cityViewCommerceHide' : 'nearbyStations.cityViewCommerceToggle')"
          data-nearby-map-commerce-toggle
          @click.stop="toggleCityCommerce"
        >
          <Store :size="18" aria-hidden="true" />
          <span class="nearby-map__commerce-toggle-label">
            {{ t(cityViewCommerceVisible ? 'nearbyStations.cityViewCommerceHide' : 'nearbyStations.cityViewCommerceToggle') }}
          </span>
        </button>
        <button
          v-for="activity in (cityViewEnabled ? extraCityActivities : [])"
          :key="activity"
          class="nearby-map__commerce-toggle"
          :class="{ 'nearby-map__commerce-toggle--active': cityViewActivity === activity }"
          type="button"
          :aria-pressed="cityViewActivity === activity"
          @click.stop="toggleCityActivity(activity)"
        ><Store :size="18" aria-hidden="true" /><span class="nearby-map__commerce-toggle-label">{{ t(`nearbyStations.cityActivity.${activity}Toggle`) }}</span></button>
        <button
          v-if="props.showIsochroneControl"
          class="nearby-map__isochrone-toggle"
          type="button"
          :aria-pressed="isochroneEnabled"
          :aria-label="t(isochroneEnabled ? 'nearbyStations.walkingZonesHide' : 'nearbyStations.walkingZonesShow')"
          :title="t(isochroneEnabled ? 'nearbyStations.walkingZonesHide' : 'nearbyStations.walkingZonesShow')"
          @click.stop="toggleIsochrones"
        >
          <Radar :size="18" aria-hidden="true" />
        </button>
        <button
          v-if="props.showNoiseControl"
          class="nearby-map__noise-toggle"
          type="button"
          :aria-pressed="noiseZonesEnabled"
          :aria-busy="noiseZonesEnabled && noiseZonesStatus === 'loading'"
          :aria-label="t('nearbyStations.noiseZonesToggle')"
          :title="t('nearbyStations.noiseZonesToggle')"
          @click.stop="toggleNoiseZones"
        >
          <Ear :size="18" aria-hidden="true" />
        </button>
        <button
          v-if="props.showAirQualityControl"
          class="nearby-map__air-quality-toggle"
          type="button"
          :aria-pressed="airQualityZonesEnabled"
          :aria-busy="airQualityZonesEnabled && noiseZonesStatus === 'loading'"
          :aria-label="t('nearbyStations.airQualityZonesToggle')"
          :title="t('nearbyStations.airQualityZonesToggle')"
          @click.stop="toggleAirQualityZones"
        >
          <Wind :size="18" aria-hidden="true" />
        </button>
        <button
          v-if="props.showDirectoryControl && !cityViewEnabled"
          class="nearby-map__directory-toggle"
          type="button"
          :aria-label="t('nearbyStations.directory.launcher')"
          :title="t('nearbyStations.directory.launcher')"
          @click.stop="openPlacesDirectory"
        >
          <Store :size="18" aria-hidden="true" />
        </button>
        <button
          v-if="props.showNeighborhoodScoreControl && !cityViewEnabled"
          class="nearby-map__neighborhood-score-toggle"
          type="button"
          :aria-label="t('nearbyStations.neighborhoodScore.launcher')"
          :title="t('nearbyStations.neighborhoodScore.launcher')"
          @click.stop="emit('openNeighborhoodScore')"
        >
          <Gauge :size="18" aria-hidden="true" />
        </button>
        <button
          v-if="props.showBasemapControl && !cityViewEnabled"
          class="nearby-map__basemap-toggle"
          :class="{ 'nearby-map__basemap-toggle--satellite': basemapLayer === 'satellite' }"
          type="button"
          data-nearby-map-layer-toggle
          :data-basemap-layer="basemapLayer"
          :aria-pressed="basemapLayer === 'satellite'"
          :aria-label="basemapToggleLabel"
          :title="basemapToggleLabel"
          @click.stop="basemapLayer = basemapLayer === 'plan' ? 'satellite' : 'plan'"
        >
          <Satellite v-if="basemapLayer === 'plan'" :size="18" aria-hidden="true" />
          <MapIcon v-else :size="18" aria-hidden="true" />
        </button>
        <button
          v-if="props.showDisplayControl && !cityViewEnabled"
          ref="displayToggleButton"
          class="nearby-map__display-toggle"
          type="button"
          :aria-expanded="displayControlsOpen"
          :aria-controls="displayControlsOpen ? 'nearby-map-display-controls' : undefined"
          :aria-label="t('nearbyStations.filtersAria')"
          :title="t('nearbyStations.filtersAria')"
          @click.stop="displayControlsOpen = !displayControlsOpen"
        >
          <Layers :size="18" aria-hidden="true" />
        </button>
        <button
          v-if="props.showFullscreenControl"
          class="nearby-map__fullscreen"
          type="button"
          :aria-label="isFullscreen ? t('nearbyStations.exitFullscreen') : t('nearbyStations.enterFullscreen')"
          :title="isFullscreen ? t('nearbyStations.exitFullscreen') : t('nearbyStations.enterFullscreen')"
          @click.stop="toggleFullscreen"
        >
          <Minimize2 v-if="isFullscreen" :size="18" aria-hidden="true" />
          <Maximize2 v-else :size="18" aria-hidden="true" />
        </button>
      </div>
      <TransportIsochronePanel
        :open="isochronePanelOpen"
        :modal-open="isochroneConfigurationModalOpen"
        :enabled="isochroneEnabled"
        :settings="isochroneSettings"
        :modes="nearbyIsochroneModes"
        :eligible-modes="nearbyIsochroneModes"
        :status="nearbyIsochronePanelStatus"
        :coverage="nearbyIsochronePanelCoverage"
        :suspended="isPlacesPreview || Boolean(cityViewRadiusTransition)"
        :scope-label="nearbyIsochroneScopeLabel"
        :attribution="GLOBAL_ISOCHRONE_ATTRIBUTION"
        panel-id="nearby-map-isochrone-panel"
        :mode-label="modeLabel"
        :copy="nearbyIsochronePanelCopy"
        @update:open="isochronePanelOpen = $event"
        @update:enabled="isochroneEnabled = $event"
        @update:mode="nearbyIsochroneSettings.setMode"
        @open-modal="isochroneConfigurationModalOpen = true"
        @close-modal="closeIsochroneConfigurationModal"
        @retry="retryIsochronesFromConfigurationModal"
      />
      <Teleport :disabled="!isMobileDisplaySheet" to="body">
        <Transition name="nearby-map-display-sheet">
          <div
            v-if="displayControlsOpen && props.showDisplayControl && !cityViewEnabled"
            class="nearby-map__display-overlay"
            @wheel.stop
          >
          <button
            class="nearby-map__display-panel-backdrop"
            type="button"
            :aria-label="t('nearbyStations.displayFiltersClose')"
            @click.stop="closeDisplayControls"
            @pointerdown.stop
          ></button>
          <aside
            ref="displayPanel"
            id="nearby-map-display-controls"
            class="nearby-map__display-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nearby-map-display-controls-title"
            :aria-label="t('nearbyStations.displayFiltersTitle')"
            tabindex="-1"
            @click.stop
            @pointerdown.stop
            @keydown.esc.stop="closeDisplayControls"
          >
            <button
              class="nearby-map__display-sheet-handle"
              type="button"
              :aria-label="t('nearbyStations.displayFiltersClose')"
              data-nearby-map-display-sheet-handle
              @click.stop="closeDisplayControls"
              @pointerdown.stop
            >
              <span aria-hidden="true"></span>
            </button>
            <header class="nearby-map__display-panel-header">
              <span id="nearby-map-display-controls-title"><Layers :size="16" aria-hidden="true" />{{ t('lineMap.picker.display') }}</span>
              <button
                class="nearby-map__display-panel-close"
                type="button"
                :aria-label="t('nearbyStations.displayFiltersClose')"
                @click.stop="closeDisplayControls"
              >
                <X :size="18" aria-hidden="true" />
              </button>
            </header>
            <div class="nearby-map__display-panel-scroll">
              <details class="nearby-map__display-section" open data-nearby-map-filter-section="transport">
                <summary>
                  <span>{{ t('nearbyStations.displayFiltersTransport') }}</span>
                  <ChevronRight :size="17" aria-hidden="true" />
                </summary>
                <div class="nearby-map__display-section-content">
                  <LineMapDisplayControls
                    variant="global"
                    nearby-options
                    :available-modes="availableModes"
                    :selected-modes="activeModes"
                    :hide-long-wait-transports="props.hideLongWaitTransports"
                    :show-nearby-places="props.showNearbyPlaces"
                    :show-nearby-benches="props.showNearbyBenches"
                    :show-nearby-parkings="props.showNearbyParkings"
                    :show-nearby-place-names="props.showNearbyPlaceNames"
                    @update:selected-modes="emit('updateActiveModes', $event)"
                    @update:hide-long-wait-transports="emit('update:hideLongWaitTransports', $event)"
                    @update:show-nearby-places="emit('update:showNearbyPlaces', $event)"
                    @update:show-nearby-benches="emit('update:showNearbyBenches', $event)"
                    @update:show-nearby-parkings="emit('update:showNearbyParkings', $event)"
                    @update:show-nearby-place-names="emit('update:showNearbyPlaceNames', $event)"
                  >
                    <template #nearby-options>
                      <label class="nearby-map__optional-place">
                        <input
                          v-model="showAccessibilityPlaces"
                          data-show-accessibility-places
                          type="checkbox"
                          :disabled="!props.showNearbyPlaces"
                        />
                        <span>{{ t('nearbyStations.accessibilityPlaces') }}</span>
                      </label>
                      <label v-for="option in optionalPlaceKinds" :key="option" class="nearby-map__optional-place">
                        <input v-model="optionalPlaces[option]" type="checkbox" :disabled="!props.showNearbyPlaces" />
                        <span>{{ t(`nearbyStations.optionalPlaces.${option}`) }}</span>
                      </label>
                    </template>
                  </LineMapDisplayControls>
                </div>
              </details>
              <details class="nearby-map__display-section" open data-nearby-map-filter-section="stations">
                <summary>
                  <span>{{ t('nearbyStations.displayFiltersStations') }}</span>
                  <ChevronRight :size="17" aria-hidden="true" />
                </summary>
                <div class="nearby-map__display-section-content">
                  <div class="nearby-map__cluster-grouping">
                    <div class="nearby-map__cluster-grouping-label">
                      <span>{{ t('nearbyStations.clusterGrouping') }}</span>
                      <strong>{{ t('nearbyStations.clusterGroupingValue', { meters: clusterGroupingDistance }) }}</strong>
                    </div>
                    <input
                      data-nearby-map-cluster-grouping
                      :aria-label="t('nearbyStations.clusterGroupingAria')"
                      :max="NEARBY_CLUSTER_GROUPING_MAX_METERS"
                      :min="NEARBY_CLUSTER_GROUPING_MIN_METERS"
                      :step="NEARBY_CLUSTER_GROUPING_STEP_METERS"
                      :value="clusterGroupingDistance"
                      type="range"
                      @input="updateClusterGroupingDistance"
                    />
                  </div>
                  <label class="nearby-map__schedule-filter">
                    <input
                      type="checkbox"
                      :checked="hideStationsWithoutDepartures"
                      @change="emit('updateHideStationsWithoutDepartures', ($event.target as HTMLInputElement).checked)"
                    />
                    <span>{{ t('nearbyStations.hideStationsWithoutDepartures') }}</span>
                  </label>
                </div>
              </details>
              <details class="nearby-map__display-section" open data-nearby-map-filter-section="map">
                <summary>
                  <span>{{ t('nearbyStations.displayFiltersMap') }}</span>
                  <ChevronRight :size="17" aria-hidden="true" />
                </summary>
                <div class="nearby-map__display-section-content">
                  <label class="nearby-map__station-visibility" data-nearby-map-show-map-stations>
                    <input v-model="showMapStations" type="checkbox" />
                    <span>{{ t('nearbyStations.showMapStations') }}</span>
                  </label>
                  <label class="nearby-map__station-visibility" data-nearby-map-show-projected-stations>
                    <input v-model="showProjectedStations" type="checkbox" />
                    <span>{{ t('nearbyStations.showProjectedStations') }}</span>
                  </label>
                </div>
              </details>
            </div>
          </aside>
          </div>
        </Transition>
      </Teleport>
      <div
        v-if="!isPlacesPreview || props.allowZoom === true"
        class="nearby-map__zoom-controls"
        role="group"
        :aria-label="t('nearbyStations.zoomControls')"
        @click.stop
        @pointerdown.stop
      >
        <button
          class="nearby-map__zoom-button"
          type="button"
          :disabled="!canZoomIn"
          :aria-label="t('nearbyStations.zoomIn')"
          :title="t('nearbyStations.zoomIn')"
          @click.stop="changeZoom(1)"
        >
          <ZoomIn :size="18" aria-hidden="true" />
        </button>
        <output
          class="nearby-map__zoom-level"
          :aria-label="t('nearbyStations.zoomLevel', { level: zoomLevelLabel })"
        >{{ zoomLevelLabel }}</output>
        <button
          class="nearby-map__zoom-button"
          type="button"
          :disabled="!canZoomOut"
          :aria-label="t('nearbyStations.zoomOut')"
          :title="t('nearbyStations.zoomOut')"
          @click.stop="changeZoom(-1)"
        >
          <ZoomOut :size="18" aria-hidden="true" />
        </button>
      </div>
      <div
        class="nearby-map__top-control-zone"
        data-nearby-map-control-zone="top"
        aria-hidden="true"
      />
      <span
        v-if="basemapLayer === 'satellite'"
        class="nearby-map__basemap-attribution"
      >{{ t('globalMap.page.satelliteAttribution') }}</span>
      <span
        v-else-if="basemapLayer === 'plan'"
        class="nearby-map__basemap-attribution"
      >{{ t('nearbyStations.mapAttribution') }}</span>
      <div
        v-if="cityViewLoading || cityViewError || (cityViewEnabled && !cityViewSelectionExact)"
        class="nearby-map__city-view-status"
        :class="{ 'nearby-map__city-view-status--error': Boolean(cityViewError) }"
        :role="cityViewError ? 'alert' : 'status'"
        aria-live="polite"
      >
        <LoaderCircle
          v-if="cityViewLoading"
          class="nearby-map__city-view-spinner"
          :class="{ 'nearby-map__city-view-spinner--static': reducedMotion }"
          :size="16"
          aria-hidden="true"
        />
        <span v-if="cityViewLoading">{{ t('globalMap.iris.loading') }}</span>
        <span v-else-if="cityViewError">{{ t('globalMap.iris.unavailable') }}</span>
        <span v-else>{{ t('globalMap.iris.partialCity') }}</span>
      </div>
      <span
        v-if="!summaryLineHoverActive && placesVisible"
        class="nearby-map__places-attribution"
      >{{ t('nearbyStations.placesAttribution') }}</span>
      <div
        v-if="!summaryLineHoverActive && isochroneEnabled && activeIsochroneStatus === 'loading'"
        class="nearby-map__isochrone-status nearby-map__isochrone-status--loading"
        role="status"
        aria-live="polite"
      >
        <span class="nearby-map__isochrone-progress" aria-hidden="true"><span /></span>
        <span>{{ t('nearbyStations.walkingZonesLoading') }}</span>
      </div>
      <div
        v-else-if="!summaryLineHoverActive && isochroneEnabled && activeIsochroneStatus === 'error' && !isochroneConfigurationModalOpen"
        class="nearby-map__isochrone-status nearby-map__isochrone-status--error"
        role="alert"
      >
        <span>{{ t(isochroneQuotaExceeded ? 'nearbyStations.walkingZonesQuotaExceeded' : 'nearbyStations.walkingZonesUnavailable') }}</span>
        <button type="button" @click.stop="retryIsochronesFromConfigurationModal">{{ t('nearbyStations.walkingZonesRetry') }}</button>
      </div>
      <div
        v-if="!summaryLineHoverActive && noiseZonesEnabled && noiseZonesStatus === 'loading'"
        class="nearby-map__noise-status nearby-map__noise-status--loading"
        role="status"
        aria-live="polite"
      >
        <span class="nearby-map__noise-progress" aria-hidden="true"><span /></span>
        <span>{{ t('nearbyStations.noiseZonesLoading') }}</span>
      </div>
      <div
        v-else-if="!summaryLineHoverActive && noiseZonesEnabled && noiseZonesStatus === 'error'"
        class="nearby-map__noise-status nearby-map__noise-status--error"
        role="alert"
      >
        <span>{{ t('nearbyStations.noiseZonesUnavailable') }}</span>
        <button type="button" @click.stop="retryNoiseZones">{{ t('nearbyStations.noiseZonesRetry') }}</button>
      </div>
      <div
        v-if="!summaryLineHoverActive && airQualityZonesEnabled && noiseZonesStatus === 'loading'"
        class="nearby-map__noise-status nearby-map__air-quality-status nearby-map__noise-status--loading"
        role="status"
        aria-live="polite"
      >
        <span class="nearby-map__noise-progress nearby-map__air-quality-progress" aria-hidden="true"><span /></span>
        <span>{{ t('nearbyStations.airQualityZonesLoading') }}</span>
      </div>
      <div
        v-else-if="!summaryLineHoverActive && airQualityZonesEnabled && noiseZonesStatus === 'error'"
        class="nearby-map__noise-status nearby-map__air-quality-status nearby-map__noise-status--error"
        role="alert"
      >
        <span>{{ t('nearbyStations.airQualityZonesUnavailable') }}</span>
        <button type="button" @click.stop="retryNoiseZones">{{ t('nearbyStations.airQualityZonesRetry') }}</button>
      </div>
      <div
        v-if="!summaryLineHoverActive && noiseZonesEnabled && noiseZonesResponse && noiseZoneCells.length > 0"
        class="nearby-map__noise-legend"
        role="note"
        :title="noiseZonesResponse.source.title"
      >
        <strong>{{ t('nearbyStations.noiseZonesLegend') }}</strong>
        <span v-for="level in NOISE_LEVELS" :key="level">
          <i :data-noise-level="level" aria-hidden="true" />
          {{ noiseLevelLabel(level) }}
        </span>
        <small>
          <a :href="noiseZonesResponse.source.pageUrl" target="_blank" rel="noopener noreferrer">
            {{ t('nearbyStations.noiseZonesSource', { producer: noiseZonesResponse.source.producer, period: noiseZonesResponse.source.referencePeriod ?? '—' }) }}
          </a>
        </small>
      </div>
      <div
        v-if="!summaryLineHoverActive && airQualityZonesEnabled && noiseZonesResponse && airQualityZoneCells.length > 0"
        class="nearby-map__noise-legend nearby-map__air-quality-legend"
        role="note"
        :title="noiseZonesResponse.source.title"
      >
        <strong>{{ t('nearbyStations.airQualityZonesLegend') }}</strong>
        <span v-for="level in AIR_QUALITY_LEVELS" :key="level">
          <i :data-air-quality-level="level" aria-hidden="true" />
          {{ airQualityLevelLabel(level) }}
        </span>
        <small>
          <a :href="noiseZonesResponse.source.pageUrl" target="_blank" rel="noopener noreferrer">
            {{ t('nearbyStations.airQualityZonesSource', { producer: noiseZonesResponse.source.producer, period: noiseZonesResponse.source.referencePeriod ?? '—' }) }}
          </a>
        </small>
      </div>
      <TransportIsochroneTooltip
        v-if="!summaryLineHoverActive && hoveredIsochrone"
        class="nearby-map__isochrone-tooltip"
        :items="[hoveredIsochrone]"
        :style="isochroneTooltipStyle"
      />
      <div
        v-if="!summaryLineHoverActive && hoveredEnvironmentTooltip && hoveredEnvironment?.position"
        class="nearby-map__environment-tooltip"
        :class="`nearby-map__environment-tooltip--${hoveredEnvironmentTooltip.layer}`"
        :style="environmentTooltipStyle"
        role="tooltip"
      >
        <i
          :data-noise-level="hoveredEnvironmentTooltip.layer === 'noise' ? hoveredEnvironmentTooltip.level : undefined"
          :data-air-quality-level="hoveredEnvironmentTooltip.layer === 'air-quality' ? hoveredEnvironmentTooltip.level : undefined"
          aria-hidden="true"
        />
        <span>{{ hoveredEnvironmentTooltip.text }}</span>
      </div>
      <div ref="gestureMarkerLayer" class="nearby-map__marker-layer">
      <div
        v-if="!cityViewEnabled || cityViewRadiusTransition === 'to-city'"
        class="nearby-map__radius"
        :class="{
          'nearby-map__radius--fade-in': cityViewRadiusTransition === 'to-neighborhood',
          'nearby-map__radius--fade-out': cityViewRadiusTransition === 'to-city',
        }"
        :style="{
          left: `${originScreen.x}px`, top: `${originScreen.y}px`,
          width: `${circleDiameter}px`, height: `${circleDiameter}px`,
        }"
        aria-hidden="true"
      />
      <div
        class="nearby-map__origin"
        :style="{ left: `${originScreen.x}px`, top: `${originScreen.y}px` }"
        :title="t('nearbyStations.origin')"
        aria-hidden="true"
      >
        <MapPin :size="25" />
      </div>

      <NearbyPlaceCanvas
        ref="placeLayer"
        :places="eligibleMapPlaces"
        :camera="camera"
        :radius="props.radius"
        :city="cityViewEnabled"
        :preview="isPlacesPreview"
        :show-names="props.showNearbyPlaceNames === true"
        :show-accessibility="showAccessibilityPlaces"
        :reduced-motion="reducedMotion"
        :interaction-active="isMapInteracting"
        :canvas-hit-testing="coarsePointer"
        :pixel-ratio-override="coarsePointer && isMapInteracting ? 1.25 : undefined"
        :selected-place-id="selectedPlaceId"
        :walking-routes="props.walkingRoutes"
        @visibility-change="placesVisible = $event"
        @select-place="emit('selectPlace', $event)"
        @place-context-menu="openPlaceContextMenu"
      />

      <MapItemTransitionGroup
        class="nearby-map__markers"
        appear
        enter-active-class="nearby-map-item-enter-active"
        appear-active-class="nearby-map-item-enter-active"
        leave-active-class="nearby-map-item-leave-active"
      >
        <div
          v-for="(entry, index) in displayedStations"
          :key="cityViewEnabled ? `city:${cityViewSelectedTransportMode ?? 'default'}:${entry.id}` : entry.id"
          class="nearby-map__marker-anchor"
          :class="[
            {
              'nearby-map__marker-anchor--heavy': isHeavyTransport(entry),
              'nearby-map__marker-anchor--feeder-pulse': feederPulseActive && isFeederStation(entry),
              'nearby-map__marker-anchor--active': hoveredStationId === entry.id,
            },
            markerTooltipPlacement(entry),
          ]"
          :style="markerStyle(entry, index)"
          @mouseenter="hoverStation(entry.id)"
          @mouseleave="clearHoveredStation(entry.id)"
          @focusin="hoverStation(entry.id)"
          @focusout="handleMarkerFocusOut(entry.id, $event)"
          @contextmenu.stop.prevent="openStationContextMenu(entry.id, $event)"
        >
          <div class="nearby-map__marker-body">
            <button
              class="nearby-map__marker"
              :class="{
                'nearby-map__marker--selected': isSelected(entry),
                'nearby-map__marker--pinned': isPinned(entry),
                'nearby-map__marker--official': shouldUseOfficialMarkerLogo(entry),
                'nearby-map__marker--heavy': isHeavyTransport(entry),
                'nearby-map__marker--bus': isBusMarker(entry),
                'nearby-map__marker--outside': !entry.insideRadius,
                'nearby-map__marker--attenuated': isAttenuated(entry),
                'nearby-map__marker--feeder-pulse': feederPulseActive && isFeederStation(entry),
              }"
              type="button"
              :aria-label="markerAriaLabel(entry)"
              :aria-pressed="isSelected(entry)"
              @mouseenter="hoverStation(entry.id)"
              @click.stop="pinStation(entry.id)"
            >
              <span
                v-if="isPinned(entry)"
                class="nearby-map__marker-ripple nearby-map__marker-ripple--delayed"
                aria-hidden="true"
              />
              <span v-if="isPinned(entry)" class="nearby-map__marker-ripple" aria-hidden="true" />

              <span class="nearby-map__marker-content">
                <LineIconBadge v-if="shouldUseLineBadge(entry) && markerLine(entry)" class="nearby-map__marker-line-icon" :line="lineBadge(markerLine(entry)!)" compact />
                <component v-else :is="modeIcon(stationMode(entry))" :size="17" aria-hidden="true" />
              </span>
              <span v-if="isSelected(entry)" class="nearby-map__marker-check"><Check :size="12" /></span>
              <span v-if="entry.lines.length > 1" class="nearby-map__line-count" aria-hidden="true">{{ entry.lines.length }}</span>
            </button>
            <slot
              v-if="shouldShowInlineSchedules(entry)"
              name="station-schedules-inline"
              :station-id="entry.id"
              :emphasized-line-ids="focusedHeavyFeederLineIds"
              :hide-long-wait-transports="props.hideLongWaitTransports === true"
            />
          </div>
          <div
            v-if="markerTooltipVisible(entry)"
            class="nearby-map__marker-station-name"
            data-nearby-map-tooltip
            @click.stop
            @pointerdown.stop
          >
            <button
              class="nearby-map__marker-tooltip-close"
              data-testid="nearby-map-tooltip-close"
              type="button"
              :aria-label="t('nearbyStations.hideTooltips')"
              :title="t('nearbyStations.hideTooltips')"
              @click.stop="suppressStationTooltips"
              @pointerdown.stop
            >
              <X :size="11" aria-hidden="true" />
            </button>
            <span class="nearby-map__marker-station-title">{{ entry.station.name }}</span>
            <span class="nearby-map__marker-station-meta">
              <span>{{ formatTransitDistanceMeters(entry.distanceMeters) }}</span>
              <span class="nearby-map__marker-meta-separator" aria-hidden="true">•</span>
              <span class="nearby-map__marker-walking-time">
                <Footprints :size="14" aria-hidden="true" />
                {{ t('nearbyStations.walkingTime', { minutes: walkingMinutes(entry) }) }}
              </span>
            </span>
            <button
              v-if="markerScheduleState(entry) === 'visible' || markerScheduleState(entry) === 'hidden'"
              class="nearby-map__schedule-toggle"
              type="button"
              :aria-label="markerScheduleState(entry) === 'hidden' ? t('nearbyStations.showSchedule') : t('nearbyStations.hideSchedule')"
              @click.stop="toggleMarkerSchedule(entry)"
              @pointerdown.stop
            >
              {{ markerScheduleState(entry) === 'hidden' ? t('nearbyStations.showSchedule') : t('nearbyStations.hideSchedule') }}
            </button>
            <span v-if="markerScheduleState(entry) === 'loading'" class="nearby-map__schedule-status">
              {{ t('nearbyStations.scheduleLoading') }}
            </span>
            <span v-else-if="markerScheduleState(entry) === 'unavailable'" class="nearby-map__schedule-status">
              {{ t('nearbyStations.scheduleUnavailable') }}
            </span>
          </div>
        </div>

        <div
          v-for="(candidate, index) in displayedSupplementalStations"
          :key="`supplemental:${candidate.id}`"
          class="nearby-map__marker-anchor nearby-map__marker-anchor--heavy nearby-map__marker-anchor--supplemental"
          :class="[
            markerTooltipPlacement(candidate.entry),
            supplementalMarkerPlacement(candidate),
            { 'nearby-map__marker-anchor--active': hoveredStationId === candidate.id },
          ]"
          :style="markerStyleForSupplemental(candidate, index)"
          @mouseenter="hoverStation(candidate.id)"
          @mouseleave="clearHoveredStation(candidate.id)"
          @focusin="hoverStation(candidate.id)"
          @focusout="handleMarkerFocusOut(candidate.id, $event)"
            @contextmenu.stop.prevent="openStationContextMenu(candidate.id, $event)"
        >
          <div class="nearby-map__marker-body">
            <button
              class="nearby-map__marker nearby-map__marker--heavy nearby-map__marker--supplemental"
              :class="{ 'nearby-map__marker--pinned': isPinned(candidate.entry) }"
              type="button"
              :aria-label="heavyMarkerAriaLabel(candidate)"
              @mouseenter="hoverStation(candidate.id)"
              @click.stop="pinStation(candidate.id)"
            >
              <span v-if="isPinned(candidate.entry)" class="nearby-map__marker-ripple" aria-hidden="true" />

              <span class="nearby-map__marker-content">
                <LineIconBadge v-if="markerLine(candidate.entry)" class="nearby-map__marker-line-icon" :line="lineBadge(markerLine(candidate.entry)!)" compact />
                <component v-else :is="modeIcon(stationMode(candidate.entry))" :size="17" aria-hidden="true" />
              </span>
              <span v-if="heavyCandidateLines(candidate).length > 1" class="nearby-map__line-count" aria-hidden="true">{{ heavyCandidateLines(candidate).length }}</span>
            </button>
            <slot
              v-if="!candidate.projected && shouldShowInlineSchedules(candidate.entry)"
              name="station-schedules-inline"
              :station-id="candidate.id"
              :emphasized-line-ids="focusedHeavyFeederLineIds"
              :hide-long-wait-transports="props.hideLongWaitTransports === true"
            />
          </div>
          <span
            v-if="heavyCandidateLines(candidate).length > 0"
            class="nearby-map__heavy-edge-label"
            :title="heavyCandidateTooltipLabel(candidate)"
            :aria-label="heavyCandidateTooltipLabel(candidate)"
            role="button"
            tabindex="0"
            @click.stop="pinStation(candidate.id)"
            @keydown.enter.stop.prevent="pinStation(candidate.id)"
            @keydown.space.stop.prevent="pinStation(candidate.id)"
          >
            <span class="nearby-map__heavy-edge-lines" aria-hidden="true">
              <LineIconBadge
                v-for="line in heavyCandidateLines(candidate)"
                :key="line.id"
                class="nearby-map__heavy-edge-line-icon"
                data-testid="nearby-heavy-edge-line-icon"
                :line="lineBadge(line)"
                compact
              />
            </span>
            <span v-if="heavyAccess(candidate, candidate.entry)" class="nearby-map__heavy-edge-access">
              {{ heavyAccess(candidate, candidate.entry) }}
            </span>
          </span>
          <div
            v-if="markerTooltipVisible(candidate.entry) && !candidate.projected"
            class="nearby-map__marker-station-name nearby-map__marker-station-name--heavy"
            data-nearby-map-tooltip
            @click.stop
            @pointerdown.stop
          >
            <button
              class="nearby-map__marker-tooltip-close"
              data-testid="nearby-map-tooltip-close"
              type="button"
              :aria-label="t('nearbyStations.hideTooltips')"
              :title="t('nearbyStations.hideTooltips')"
              @click.stop="suppressStationTooltips"
              @pointerdown.stop
            >
              <X :size="11" aria-hidden="true" />
            </button>
            <span class="nearby-map__marker-station-title">{{ candidate.entry.station.name }}</span>
            <span
              v-if="heavyCandidateLines(candidate).length > 0"
              class="nearby-map__heavy-tooltip-lines"
              :aria-label="heavyCandidateLineLabel(candidate)"
            >
              <LineIconBadge
                v-for="line in heavyCandidateLines(candidate)"
                :key="line.id"
                class="nearby-map__heavy-tooltip-line-icon"
                :line="lineBadge(line)"
                compact
              />
            </span>
            <span class="nearby-map__marker-station-meta">
              <span>{{ formatTransitDistanceMeters(candidate.distanceMeters) }}</span>
              <template v-if="heavyAccess(candidate, candidate.entry)">
                <span class="nearby-map__marker-meta-separator" aria-hidden="true">•</span>
                <span class="nearby-map__marker-walking-time">{{ heavyAccess(candidate, candidate.entry) }}</span>
              </template>
            </span>
            <span v-if="heavyAccess(candidate, candidate.entry)" class="nearby-map__schedule-status">
              {{ heavyAccess(candidate, candidate.entry) }}
            </span>
          </div>
        </div>
      </MapItemTransitionGroup>
      </div>

      <div
        v-if="loading && !isPlacesPreview && !cityViewEnabled"
        class="nearby-map__loading"
        :style="{ top: `${nearbyMapLoadingTop()}px` }"
        role="status"
      >{{ t('nearbyStations.scanning') }}</div>
      <button
        v-if="!isPlacesPreview && !cityViewEnabled && $slots['travel-sidebar']"
        class="nearby-map__travel-toggle"
        :class="{ 'nearby-map__travel-toggle--active': travelPanelOpen }"
        type="button"
        :aria-pressed="travelPanelOpen"
        :aria-label="t('nearbyStations.travel.open')"
        :title="t('nearbyStations.travel.open')"
        @click.stop="emit('toggleTravelPanel')"
      >
        <Route :size="20" aria-hidden="true" />
      </button>
    </div>

    <aside
      v-if="!isPlacesPreview && !cityViewEnabled && travelPanelOpen && $slots['travel-sidebar']"
      class="nearby-map__travel-sidebar"
      @click.stop
      @pointerdown.stop
    >
      <slot name="travel-sidebar" />
    </aside>

    <div
      v-if="!isPlacesPreview && !cityViewEnabled"
      ref="sidebarSplitter"
      class="nearby-map__splitter"
      :class="{ 'nearby-map__splitter--active': sidebarResizeActive }"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      :aria-label="t('nearbyStations.resizeSidebar')"
      :aria-valuemin="SIDEBAR_MIN_WIDTH"
      :aria-valuemax="maxSidebarWidth()"
      :aria-valuenow="sidebarWidth"
      @pointerdown="startSidebarResize"
      @keydown="handleSidebarResizeKeydown"
    >
      <span aria-hidden="true" />
    </div>

    <aside v-if="!isPlacesPreview && !cityViewEnabled" class="nearby-map__sidebar" :aria-label="t('nearbyStations.stationDetailsAria')">
      <div v-if="$slots['sidebar-actions']" class="nearby-map__sidebar-toolbar">
        <button
          ref="sidebarActionButton"
          class="nearby-map__sidebar-options"
          type="button"
          :aria-label="t('nearbyStations.sidebarOptions')"
          :title="t('nearbyStations.sidebarOptions')"
          @click.stop="openSidebarActions"
        >
          <EllipsisVertical :size="18" aria-hidden="true" />
        </button>
      </div>
      <article
        v-if="activeStation"
        class="nearby-map__details"
        @contextmenu.stop.prevent="openStationContextMenu(activeStation.id, $event)"
      >
        <header>
          <div>
            <strong>{{ activeStation.station.name }}</strong>
            <div class="nearby-map__station-meta">
              <span>{{ formatTransitDistanceMeters(activeStation.distanceMeters) }}</span>
              <span
                v-if="!activeSupplementalStation || activeSupplementalAccess"
                class="nearby-map__walking-time"
              >
                <BusFront v-if="activeSupplementalAccess?.kind === 'feeder'" :size="15" aria-hidden="true" />
                <Footprints v-else :size="15" aria-hidden="true" />
                {{ activeSupplementalStation
                  ? heavyAccess(activeSupplementalStation, activeStation)
                  : t('nearbyStations.walkingTime', { minutes: walkingMinutes(activeStation) }) }}
              </span>
            </div>
          </div>
          <div class="nearby-map__header-actions">
            <button class="nearby-map__close" type="button" :aria-label="t('common.actions.close')" @click="clearStationFocus">×</button>
          </div>
        </header>
        <div class="nearby-map__line-groups" :aria-label="t('nearbyStations.linesAria')">
          <section v-for="group in activeStationLineGroups" :key="group.mode" class="nearby-map__line-group">
            <h4>{{ modeLabel(group.mode) }}</h4>
            <div class="nearby-map__lines">
              <button
                v-for="line in group.lines"
                :key="line.id"
                class="nearby-map__line"
                :class="{
                  'nearby-map__line--selected': selectedLineIds(activeStation.id).includes(line.id),
                  'nearby-map__line--active': activeLineId === line.id,
                  'nearby-map__line--hovered': hoveredLineId === line.id,
                }"
                type="button"
                :aria-pressed="selectedLineIds(activeStation.id).includes(line.id)"
                @mouseenter="hoverStationLine(line.id)"
                @mouseleave="leaveStationLine(line.id)"
                @focus="hoverStationLine(line.id)"
                @blur="leaveStationLine(line.id)"
                @click.stop="focusStation(activeStation.id, line.id); emit('activateLine', line.id); emit('toggleLine', activeStation.id, line.id)"
              >
                <LineIconBadge :line="lineBadge(line)" compact />
                <Check v-if="selectedLineIds(activeStation.id).includes(line.id)" :size="14" />
              </button>
            </div>
          </section>
        </div>
        <p v-if="activeSupplementalStation && heavyAccess(activeSupplementalStation, activeStation!)" class="nearby-map__heavy-access">
          <Footprints :size="15" aria-hidden="true" />
          {{ heavyAccess(activeSupplementalStation, activeStation!) }}
        </p>
        <footer v-if="!activeSupplementalStation">
          <button
            class="nearby-map__select"
            type="button"
            @click="emit('toggleStation', activeStation.id)"
          >
            <Minus v-if="isSelected(activeStation)" :size="17" />
            <Plus v-else :size="17" />
            {{ isSelected(activeStation) ? t('nearbyStations.remove') : t('common.actions.add') }}
          </button>
          <button
            v-if="lineForDetails(activeStation)"
            class="nearby-map__details-action"
            type="button"
            @click="emit('details', activeStation.id, lineForDetails(activeStation)!.id)"
          >
            {{ t('nearbyStations.viewDetails') }} <ExternalLink :size="15" />
          </button>
        </footer>
      </article>
      <slot
        v-if="$slots['sidebar-actions']"
        name="sidebar-actions"
        :anchor="sidebarActionButton"
      />
      <nav
        v-if="hasStationScheduleSlot"
        class="nearby-map__sidebar-tabs"
        role="tablist"
        :aria-label="t('nearbyStations.sidebarTabsAria')"
      >
        <button
          id="nearby-map-summary-tab"
          class="nearby-map__sidebar-tab"
          :class="{ 'nearby-map__sidebar-tab--active': activeSidebarTab === 'summary' }"
          type="button"
          role="tab"
          :aria-selected="activeSidebarTab === 'summary'"
          aria-controls="nearby-map-summary-panel"
          @click.stop="setSidebarTab('summary')"
        >{{ t('nearbyStations.summaryTab') }}</button>
        <button
          id="nearby-map-schedule-tab"
          class="nearby-map__sidebar-tab"
          :class="{ 'nearby-map__sidebar-tab--active': activeSidebarTab === 'schedule' }"
          type="button"
          role="tab"
          :aria-selected="activeSidebarTab === 'schedule'"
          aria-controls="nearby-map-schedule-panel"
          @click.stop="setSidebarTab('schedule')"
        >{{ t('nearbyStations.scheduleTitle') }}</button>
      </nav>
      <div
        class="nearby-map__sidebar-tab-viewport"
        :class="{ 'nearby-map__sidebar-tab-viewport--with-schedule': hasStationScheduleSlot }"
        @pointerdown.stop="startSidebarSwipe"
        @pointermove.stop="moveSidebarSwipe"
        @pointerup.stop="finishSidebarSwipe"
        @pointercancel.stop="cancelSidebarSwipe"
      >
        <div
          class="nearby-map__sidebar-tab-track"
          :class="{
            'nearby-map__sidebar-tab-track--with-schedule': hasStationScheduleSlot,
            'nearby-map__sidebar-tab-track--schedule': activeSidebarTab === 'schedule' && hasStationScheduleSlot,
          }"
        >
          <section
            id="nearby-map-summary-panel"
            class="nearby-map__sidebar-tab-panel"
            role="tabpanel"
            aria-labelledby="nearby-map-summary-tab"
          >
            <NearbySummary
              :lines="nearbySummaryLines"
              :heavy-lines="nearbySummaryHeavyLines"
              :line-badge="lineBadge"
              :origin="props.origin"
              :stations-for-line="stationsForSummaryLine"
              :walking-stations-for-line="walkingStationsForSummaryLine"
              :active-line-id="activeLineId"
              :hovered-line-id="hoveredLineId"
              @hover-line="hoverSummaryLine"
              @leave-line="leaveSummaryLine"
              @pin-line="pinSummaryLine"
              @open-global-map="openSummaryGlobalMap"
            />
          </section>
          <section
            v-if="hasStationScheduleSlot"
            id="nearby-map-schedule-panel"
            class="nearby-map__sidebar-tab-panel"
            role="tabpanel"
            aria-labelledby="nearby-map-schedule-tab"
          >
            <slot name="station-schedules" :active-station-id="activeStation?.id" :fullscreen="isFullscreen" />
          </section>
        </div>
      </div>
      <slot name="city-pattern" />
    </aside>
    <slot v-if="!isPlacesPreview && !cityViewEnabled" name="line-trace-modal" />
    <slot v-if="!isPlacesPreview && !cityViewEnabled" name="traffic-modal" />
  </div>
</template>

<style scoped>
.nearby-map-shell { --nearby-map-height: clamp(520px, calc(100dvh - 80px), 820px); --nearby-sidebar-width: 310px; align-items: stretch; display: grid; gap: 0; grid-template-columns: minmax(0, 1fr) 12px minmax(260px, var(--nearby-sidebar-width)); position: relative; }
.nearby-map-shell--places-preview { --nearby-map-height: 100%; display: block; height: 100%; }
.nearby-map-shell--city-view { grid-template-columns: minmax(0, 1fr) 0px 0px; }
.nearby-map-shell--city-view .nearby-map__marker-anchor { z-index: 8; }
.nearby-map-shell--places-preview .nearby-map { cursor: default; height: 100%; touch-action: auto; }
.nearby-map-shell--places-preview .nearby-map--interactive { cursor: grab; touch-action: none; }
.nearby-map-shell--places-preview .nearby-map--interactive.nearby-map--dragging { cursor: grabbing; }
.nearby-map-shell--resizing, .nearby-map-shell--resizing * { cursor: col-resize !important; user-select: none !important; }
.nearby-map__splitter { align-items: center; background: transparent; border: 0; cursor: col-resize; display: flex; justify-content: center; min-width: 0; padding: 0; position: relative; }
.nearby-map__splitter::before { background: rgba(81,70,255,.12); border-radius: 999px; content: ""; height: 44px; transition: background-color 140ms ease, height 140ms ease, width 140ms ease; width: 3px; }
.nearby-map__splitter:hover::before, .nearby-map__splitter:focus-visible::before, .nearby-map__splitter--active::before { background: #5146ff; height: 68px; outline: 0; width: 4px; }
.nearby-map__splitter:focus-visible { outline: 0; }
.nearby-map__splitter span { background: #5146ff; border-radius: 999px; height: 18px; opacity: .65; pointer-events: none; position: absolute; width: 3px; }
.nearby-map { background: #edf2f4; border: 1px solid var(--border); border-radius: 14px; cursor: grab; height: var(--nearby-map-height); isolation: isolate; min-width: 0; overflow: hidden; position: relative; touch-action: none; }
.nearby-map--dragging { cursor: grabbing; user-select: none; }
.nearby-map__camera-layer { inset: 0; pointer-events: none; position: absolute; transform-origin: 0 0; will-change: transform; z-index: 0; }
.nearby-map__marker-layer { inset: 0; pointer-events: none; position: absolute; transform-origin: 0 0; z-index: 5; }
.nearby-map--interacting .nearby-map__marker-layer { will-change: transform; }
.nearby-map__marker-layer .nearby-map__marker-anchor { pointer-events: auto; }
.nearby-map__camera-layer :deep([data-city-code]), .nearby-map__camera-layer :deep([data-iris-neighborhood]), .nearby-map__camera-layer :deep(.nearby-map__overlay-pill) { pointer-events: auto; }
.nearby-map--interacting .nearby-map__marker { box-shadow: none; transition: none; }
.nearby-map--interacting .nearby-map__marker-ripple, .nearby-map--interacting .nearby-map__marker--feeder-pulse::before { animation: none; opacity: 0; }
.nearby-map--interacting .nearby-map__marker-station-name, .nearby-map--interacting .nearby-map__heavy-edge-label, .nearby-map--interacting .nearby-map__summary-line-station-name { visibility: hidden; }
.nearby-map--interacting .nearby-map__walking-flow { opacity: .35; }
.nearby-map :deep(.transport-ghost-flow__path) { filter: brightness(1.32) saturate(1.15) drop-shadow(0 0 1px rgba(255,255,255,.82)); opacity: .58; }
.nearby-map :deep(.transport-ghost-flow__wave) { filter: brightness(1.32) saturate(1.15) drop-shadow(0 0 1px rgba(255,255,255,.82)); opacity: .78; }
.nearby-map :deep(.transport-ghost-flow__chevron) { filter: brightness(1.32) saturate(1.15) drop-shadow(0 0 1px rgba(255,255,255,.82)); opacity: .92; }
.nearby-map--satellite :deep(.transport-ghost-flow__path) { filter: drop-shadow(0 0 1px rgba(255,255,255,.88)); opacity: .92; }
.nearby-map--satellite :deep(.transport-ghost-flow__wave) { filter: drop-shadow(0 0 1px rgba(255,255,255,.88)); opacity: .98; }
.nearby-map--satellite :deep(.transport-ghost-flow__chevron) { filter: drop-shadow(0 0 1px rgba(255,255,255,.88)); opacity: 1; }
.nearby-map--isochrone .nearby-map__radius { background: transparent; border-color: rgba(72, 70, 255, .38); border-style: dashed; }
.nearby-map__air-quality-zones, .nearby-map__noise-zones { height: 100%; inset: 0; overflow: visible; pointer-events: none; position: absolute; width: 100%; z-index: 1; }
.nearby-map-shell--city-view.nearby-map-shell--environment-active :deep(.iris-neighborhood-overlay__shape) { pointer-events: none; }
.nearby-map__air-quality-zone, .nearby-map__noise-zone { pointer-events: visiblePainted; shape-rendering: crispEdges; stroke-width: .5; transition: fill-opacity 140ms ease; vector-effect: non-scaling-stroke; }
.nearby-map__air-quality-zone[data-air-quality-level="1"] { fill: rgb(34 197 94); fill-opacity: .23; stroke: rgba(22, 130, 70, .3); }
.nearby-map__air-quality-zone[data-air-quality-level="2"] { fill: rgb(250 204 21); fill-opacity: .24; stroke: rgba(180, 137, 0, .3); }
.nearby-map__air-quality-zone[data-air-quality-level="3"] { fill: rgb(239 68 68); fill-opacity: .25; stroke: rgba(185, 28, 28, .32); }
.nearby-map__noise-zone[data-noise-level="1"] { fill: rgb(34 197 94); fill-opacity: .23; stroke: rgba(22, 130, 70, .3); }
.nearby-map__noise-zone[data-noise-level="2"] { fill: rgb(250 204 21); fill-opacity: .24; stroke: rgba(180, 137, 0, .3); }
.nearby-map__noise-zone[data-noise-level="3"] { fill: rgb(239 68 68); fill-opacity: .25; stroke: rgba(185, 28, 28, .32); }
.nearby-map__air-quality-zone:hover, .nearby-map__noise-zone:hover, .nearby-map__environment-zone--hovered { fill-opacity: .3; }
.nearby-map__walking-zones { height: 100%; inset: 0; overflow: visible; pointer-events: none; position: absolute; width: 100%; z-index: 2; }
.nearby-map__walking-zones--city { filter: brightness(1.06) saturate(1.08); }
.nearby-map__walking-zone { pointer-events: visiblePainted; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.nearby-map__walking-zone[data-walking-zone="5"] { fill: rgba(34, 197, 94, .29); stroke: rgba(22, 130, 70, .7); }
.nearby-map__walking-zone[data-walking-zone="10"] { fill: rgba(134, 239, 172, .27); stroke: rgba(62, 160, 93, .62); }
.nearby-map__walking-zone[data-walking-zone="15"] { fill: rgba(250, 204, 21, .24); stroke: rgba(180, 137, 0, .62); }
.nearby-map__walking-zone[data-walking-zone="20"] { fill: rgba(251, 146, 60, .22); stroke: rgba(194, 95, 20, .58); }
.nearby-map__walking-zone[data-walking-zone="25"] { fill: rgba(248, 113, 113, .21); stroke: rgba(190, 55, 55, .56); }
.nearby-map__walking-zone[data-walking-zone="30"] { fill: rgba(239, 68, 68, .2); stroke: rgba(185, 28, 28, .54); }
.nearby-map__walking-zone[data-walking-zone-index="0"] { fill: rgba(34, 197, 94, .29); stroke: rgba(22, 130, 70, .7); }
.nearby-map__walking-zone[data-walking-zone-index="1"] { fill: rgba(134, 239, 172, .27); stroke: rgba(62, 160, 93, .62); }
.nearby-map__walking-zone[data-walking-zone-index="2"] { fill: rgba(250, 204, 21, .24); stroke: rgba(180, 137, 0, .62); }
.nearby-map__walking-zones--city .nearby-map__walking-zone { stroke: none; stroke-width: 0; }
.nearby-map__walking-flow { height: 100%; inset: 0; overflow: visible; pointer-events: none; position: absolute; width: 100%; z-index: 3; }
.nearby-map__walking-flow-halo { display: none; fill: none; stroke: rgba(255,255,255,.98); stroke-dasharray: 2 8; stroke-linecap: round; stroke-linejoin: round; stroke-width: 10; filter: drop-shadow(0 0 4px rgba(255,255,255,.95)) drop-shadow(0 0 7px rgba(81,70,255,.75)); }
.nearby-map__walking-flow-path { fill: none; stroke: #5146ff; stroke-dasharray: 2 8; stroke-linecap: round; stroke-width: 3; }
.nearby-map__walking-flow-node { fill: #fff; stroke: #5146ff; stroke-width: 2; }
.nearby-map--satellite .nearby-map__walking-flow-halo { display: block; }
.nearby-map--satellite .nearby-map__walking-flow-path { filter: drop-shadow(0 0 2px rgba(255,255,255,.98)); stroke: #5146ff; stroke-width: 4; }
.nearby-map--satellite .nearby-map__walking-flow-node { filter: drop-shadow(0 0 3px rgba(255,255,255,.98)); stroke: #5146ff; stroke-width: 3; }
.nearby-map__summary-line-stations { inset: 0; pointer-events: none; position: absolute; z-index: 6; }
/*
 * The IRIS neighbourhood tooltip is rendered as a sibling of its overlay, so
 * the map owns its level. It must stay fully readable above the comparison
 * overlay (40), the station markers (5 to 11, 90 when active) and the place
 * icons, while the map chrome (status bars 12, controls 13, panels 14 and the
 * travel sidebar 17) keeps painting on top of it.
 */
.nearby-map :deep(.nearby-map__iris-tooltip-layer) {
  z-index: 80;
}
/*
 * Off-map direction pills are interactive surfaces. They must paint above the
 * neighbourhood tooltip (80), the markers (5 to 11, 90 when active) and the
 * place icons, and stay below the map chrome (status bars 12, controls 13,
 * panels 14 and the travel sidebar 17).
 */
.nearby-map :deep(.nearby-map__overlay-pill) {
  pointer-events: auto;
  z-index: 82;
}
.nearby-map__summary-line-station { color: #18233f; height: 0; position: absolute; width: 0; }
.nearby-map__summary-line-station-dot { background: #fff; border: 3px solid var(--nearby-summary-line-color, #5146ff); border-radius: 50%; box-shadow: 0 2px 6px rgba(16,35,63,.28); box-sizing: border-box; display: block; height: 10px; left: 0; position: absolute; top: 0; transform: translate(-50%, -50%); width: 10px; }
.nearby-map__summary-line-station-name { background: rgba(255,255,255,.9); border-radius: 5px; box-shadow: 0 2px 6px rgba(16,35,63,.15); font-size: .62rem; font-weight: 800; left: 15px; max-width: 150px; overflow: hidden; padding: 2px 4px; position: absolute; text-overflow: ellipsis; top: 0; transform: translateY(-50%); white-space: nowrap; }
.nearby-map__markers { display: contents; }
.nearby-map__top-control-zone { height: 74px; inset: 0 0 auto; pointer-events: none; position: absolute; z-index: 12; }
.nearby-map__primary-controls { display: flex; gap: 8px; position: absolute; right: 12px; top: 12px; z-index: 13; }
.nearby-map__fullscreen, .nearby-map__display-toggle, .nearby-map__basemap-toggle, .nearby-map__directory-toggle, .nearby-map__neighborhood-score-toggle, .nearby-map__city-view-toggle, .nearby-map__commerce-toggle, .nearby-map__isochrone-toggle, .nearby-map__noise-toggle, .nearby-map__air-quality-toggle { align-items: center; backdrop-filter: blur(5px); background: rgba(255,255,255,.92); border: 1px solid rgba(81,70,255,.18); border-radius: 10px; color: #4034df; display: flex; height: 38px; justify-content: center; padding: 0; position: absolute; top: 12px; width: 38px; z-index: 13; }
.nearby-map__primary-controls > .nearby-map__fullscreen, .nearby-map__primary-controls > .nearby-map__display-toggle, .nearby-map__primary-controls > .nearby-map__basemap-toggle, .nearby-map__primary-controls > .nearby-map__directory-toggle, .nearby-map__primary-controls > .nearby-map__neighborhood-score-toggle, .nearby-map__primary-controls > .nearby-map__city-view-toggle, .nearby-map__primary-controls > .nearby-map__commerce-toggle, .nearby-map__primary-controls > .nearby-map__isochrone-toggle, .nearby-map__primary-controls > .nearby-map__noise-toggle, .nearby-map__primary-controls > .nearby-map__air-quality-toggle { position: static; }
.nearby-map__commerce-toggle { gap: 6px; min-width: 38px; padding-inline: 9px; width: auto; }
.nearby-map__commerce-toggle-label { font-size: .66rem; font-weight: 850; line-height: 1; white-space: nowrap; }
.nearby-map__commerce-toggle--active { background: #166534 !important; border-color: #166534 !important; color: #fff !important; }
.nearby-map__fullscreen { right: 12px; }
.nearby-map__display-toggle { right: 58px; }
.nearby-map__basemap-toggle { right: 104px; }
.nearby-map__fullscreen:hover:not(:disabled), .nearby-map__fullscreen:focus-visible, .nearby-map__display-toggle:hover:not(:disabled), .nearby-map__display-toggle:focus-visible, .nearby-map__basemap-toggle:hover:not(:disabled), .nearby-map__basemap-toggle:focus-visible, .nearby-map__directory-toggle:hover:not(:disabled), .nearby-map__directory-toggle:focus-visible, .nearby-map__neighborhood-score-toggle:hover:not(:disabled), .nearby-map__neighborhood-score-toggle:focus-visible, .nearby-map__city-view-toggle:hover:not(:disabled), .nearby-map__city-view-toggle:focus-visible, .nearby-map__commerce-toggle:hover:not(:disabled), .nearby-map__commerce-toggle:focus-visible, .nearby-map__isochrone-toggle:hover:not(:disabled), .nearby-map__isochrone-toggle:focus-visible, .nearby-map__noise-toggle:hover:not(:disabled), .nearby-map__noise-toggle:focus-visible, .nearby-map__air-quality-toggle:hover:not(:disabled), .nearby-map__air-quality-toggle:focus-visible { background: #fff; color: #4034df; transform: none; }
.nearby-map__city-view-toggle { align-items: stretch; appearance: none; background: rgba(242, 240, 255, .96); border-color: rgba(109, 40, 217, .28); border-radius: 999px; box-shadow: 0 4px 12px rgba(76, 29, 149, .12); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); isolation: isolate; overflow: hidden; padding: 3px; position: relative; width: 136px; }
.nearby-map__city-view-toggle:hover:not(:disabled), .nearby-map__city-view-toggle:focus-visible { background: #ebe9ff; border-color: rgba(109, 40, 217, .42); }
.nearby-map__city-view-slider { background: #fff; border: 1px solid rgba(109, 40, 217, .2); border-radius: 999px; bottom: 3px; box-shadow: 0 2px 6px rgba(76, 29, 149, .16); left: 3px; pointer-events: none; position: absolute; top: 3px; transition: transform 220ms cubic-bezier(.2, .8, .2, 1); width: calc(50% - 3px); z-index: 0; }
.nearby-map__city-view-slider--neighborhood { transform: translateX(100%); }
.nearby-map__city-view-option { align-items: center; color: #64748b; display: flex; font-size: .72rem; font-weight: 850; grid-row: 1; justify-content: center; line-height: 1; min-width: 0; overflow: hidden; padding-inline: 4px; pointer-events: none; position: relative; text-overflow: clip; white-space: nowrap; z-index: 1; }
.nearby-map__city-view-option[data-nearby-map-view-option="city"] { grid-column: 1; }
.nearby-map__city-view-option[data-nearby-map-view-option="neighborhood"] { grid-column: 2; }
.nearby-map__city-view-option--active { color: #4c1d95; }
.nearby-map__display-toggle[aria-expanded="true"] { background: #4034df; color: #fff; }
.nearby-map__basemap-toggle[aria-pressed="true"] { background: #4034df; color: #fff; }
.nearby-map__isochrone-toggle[aria-pressed="true"] { background: #17864c; border-color: rgba(23, 134, 76, .32); color: #fff; }
.nearby-map__noise-toggle[aria-pressed="true"] { background: #b74b24; border-color: rgba(183, 75, 36, .32); color: #fff; }
.nearby-map__air-quality-toggle[aria-pressed="true"] { background: #1976a8; border-color: rgba(25, 118, 168, .32); color: #fff; }
.nearby-map__scale-control { align-items: flex-end; backdrop-filter: blur(4px); background: rgba(225, 244, 194, .88); border: 1px solid rgba(69, 93, 48, .2); border-radius: 6px; bottom: 16px; box-shadow: 0 3px 10px rgba(39, 61, 35, .16); box-sizing: border-box; color: #1f2937; display: flex; gap: 7px; left: 50%; max-width: calc(100% - 24px); padding: 4px 7px 5px; pointer-events: none; position: absolute; transform: translateX(-50%); z-index: 12; }
.nearby-map__scale-north { align-items: center; color: #243b89; display: flex; flex: 0 0 16px; flex-direction: column; font-size: .55rem; font-weight: 950; gap: 1px; justify-content: flex-end; line-height: 1; }
.nearby-map__scale-north svg { fill: currentColor; height: 15px; stroke-width: 1.8; width: 15px; }
.nearby-map__scale-ruler { display: grid; gap: 1px; min-width: 0; width: var(--nearby-map-scale-width, 150px); }
.nearby-map__scale-labels { display: grid; font-size: .58rem; font-variant-numeric: tabular-nums; font-weight: 850; grid-template-columns: repeat(3, minmax(0, 1fr)); line-height: 1; }
.nearby-map__scale-labels span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nearby-map__scale-labels span:nth-child(2) { text-align: center; }
.nearby-map__scale-labels span:last-child { text-align: right; }
.nearby-map__scale-track { border-bottom: 2px solid currentColor; box-sizing: border-box; height: 8px; position: relative; }
.nearby-map__scale-track::before, .nearby-map__scale-track::after, .nearby-map__scale-track > span { background: currentColor; bottom: -2px; content: ""; height: 7px; position: absolute; width: 2px; }
.nearby-map__scale-track::before { left: 0; }
.nearby-map__scale-track::after { right: 0; }
.nearby-map__scale-track > span { left: 50%; transform: translateX(-50%); }
.nearby-map-shell--places-preview .nearby-map__scale-control { bottom: 34px; }
.nearby-map__basemap-attribution { backdrop-filter: blur(4px); background: rgba(255,255,255,.84); border: 1px solid rgba(100,116,139,.18); border-radius: 6px; bottom: 8px; color: #475569; font-size: .62rem; left: 8px; padding: 3px 6px; pointer-events: none; position: absolute; z-index: 12; }
.nearby-map__places-attribution { backdrop-filter: blur(4px); background: rgba(255,255,255,.84); border: 1px solid rgba(100,116,139,.18); border-radius: 6px; bottom: 8px; color: #475569; font-size: .58rem; left: 50%; padding: 3px 6px; pointer-events: none; position: absolute; transform: translateX(-50%); z-index: 12; }
.nearby-map__city-view-status { align-items: center; backdrop-filter: blur(5px); background: rgba(255,255,255,.94); border: 1px solid rgba(109,40,217,.24); border-radius: 10px; box-shadow: 0 5px 16px rgba(16,35,63,.14); color: #4c1d95; display: flex; font-size: .72rem; font-weight: 820; gap: 8px; left: 50%; max-width: calc(100% - 24px); padding: 8px 10px; position: absolute; top: 82px; transform: translateX(-50%); z-index: 12; }
.nearby-map__city-view-spinner { animation: nearby-map-city-view-spin 900ms linear infinite; flex: 0 0 auto; }
.nearby-map__city-view-spinner--static { animation: none; }
.nearby-map__city-view-status--error { border-color: rgba(217,45,32,.24); color: #9b271e; }
.nearby-map__display-overlay { inset: 0; pointer-events: none; position: absolute; z-index: 9001; }
.nearby-map__display-panel-backdrop { display: none; }
.nearby-map__display-panel { background: #fff; border: 1px solid rgba(100, 116, 139, .24); border-radius: 14px; box-shadow: 0 8px 24px rgba(15, 23, 42, .18); overflow: hidden; pointer-events: auto; position: absolute; right: 12px; top: 58px; width: min(270px, calc(100% - 24px)); z-index: 9002; }
.nearby-map__display-panel-header { align-items: center; border-bottom: 1px solid rgba(100, 116, 139, .16); color: #18233f; display: flex; font-size: .76rem; font-weight: 850; justify-content: space-between; min-height: 38px; padding: 8px 11px; }
.nearby-map__display-panel-header span { align-items: center; display: inline-flex; gap: 7px; }
.nearby-map__display-panel-close, .nearby-map__display-sheet-handle { display: none; }
.nearby-map__display-panel-scroll { min-width: 0; }
.nearby-map__display-section > summary { display: none; }
.nearby-map__display-section-content { min-width: 0; }
.nearby-map__optional-place { display: flex; align-items: center; gap: 7px; color: #334155; font-size: .75rem; font-weight: 750; }
.nearby-map__optional-place input { accent-color: #18233f; }
.nearby-map__display-panel :deep(.line-map-display-panel__content--global) { padding: 10px; }
.nearby-map__cluster-grouping { border-top: 1px solid rgba(100, 116, 139, .16); display: grid; gap: 7px; padding: 10px; }
.nearby-map__cluster-grouping-label { align-items: center; color: #334155; display: flex; font-size: .72rem; font-weight: 750; gap: 8px; justify-content: space-between; }
.nearby-map__cluster-grouping-label strong { color: #18233f; font-variant-numeric: tabular-nums; white-space: nowrap; }
.nearby-map__cluster-grouping input { accent-color: #5146ff; width: 100%; }
.nearby-map__schedule-filter { align-items: flex-start; border-top: 1px solid rgba(100, 116, 139, .14); color: #334155; display: flex; font-size: .72rem; font-weight: 750; gap: 7px; line-height: 1.25; padding: 10px; }
.nearby-map__schedule-filter input { accent-color: #5146ff; flex: 0 0 auto; margin: 1px 0 0; }
.nearby-map__station-visibility { align-items: flex-start; border-top: 1px solid rgba(100, 116, 139, .14); color: #334155; display: flex; font-size: .72rem; font-weight: 750; gap: 7px; line-height: 1.25; padding: 10px; }
.nearby-map__station-visibility input { accent-color: #5146ff; flex: 0 0 auto; margin: 1px 0 0; }
.nearby-map__isochrone-status { align-items: center; backdrop-filter: blur(5px); background: rgba(255,255,255,.94); border: 1px solid rgba(81,70,255,.18); border-radius: 10px; box-shadow: 0 5px 16px rgba(16,35,63,.14); color: #334155; display: flex; font-size: .72rem; font-weight: 820; gap: 8px; left: 50%; max-width: calc(100% - 24px); padding: 8px 10px; position: absolute; top: 82px; transform: translateX(-50%); z-index: 12; }
.nearby-map--isochrone-panel-open .nearby-map__isochrone-status { display: none; }
.nearby-map__isochrone-status--error { border-color: rgba(217,45,32,.24); color: #9b271e; }
.nearby-map__isochrone-status button { background: #ebe9ff; border: 1px solid rgba(81,70,255,.2); border-radius: 7px; color: #4034df; font: inherit; min-height: 26px; padding: 3px 7px; }
.nearby-map__isochrone-status button:hover, .nearby-map__isochrone-status button:focus-visible { background: #4034df; color: #fff; outline: 0; }
.nearby-map__noise-status { align-items: center; backdrop-filter: blur(5px); background: rgba(255,255,255,.94); border: 1px solid rgba(183,75,36,.22); border-radius: 10px; box-shadow: 0 5px 16px rgba(16,35,63,.14); color: #334155; display: flex; font-size: .72rem; font-weight: 820; gap: 8px; left: 50%; max-width: calc(100% - 24px); padding: 8px 10px; position: absolute; top: 122px; transform: translateX(-50%); z-index: 12; }
.nearby-map__noise-status--error { border-color: rgba(217,45,32,.24); color: #9b271e; }
.nearby-map__noise-status button { background: #fff0e9; border: 1px solid rgba(183,75,36,.2); border-radius: 7px; color: #9a3e1e; font: inherit; min-height: 26px; padding: 3px 7px; }
.nearby-map__noise-status button:hover, .nearby-map__noise-status button:focus-visible { background: #b74b24; color: #fff; outline: 0; }
.nearby-map__noise-progress { background: #f1ddd4; border-radius: 999px; display: block; height: 5px; overflow: hidden; width: 60px; }
.nearby-map__noise-progress span { animation: nearby-map-isochrone-progress 1.2s ease-in-out infinite; background: #b74b24; border-radius: inherit; display: block; height: 100%; width: 45%; }
.nearby-map__noise-legend { align-items: center; backdrop-filter: blur(5px); background: rgba(255,255,255,.94); border: 1px solid rgba(183,75,36,.2); border-radius: 10px; bottom: 34px; color: #334155; display: flex; flex-wrap: wrap; font-size: .62rem; font-weight: 760; gap: 4px 8px; left: 8px; max-width: calc(100% - 16px); padding: 6px 8px; position: absolute; z-index: 12; }
.nearby-map__noise-legend strong { color: #18233f; font-weight: 850; }
.nearby-map__noise-legend span { align-items: center; display: inline-flex; gap: 4px; }
.nearby-map__noise-legend i { border: 1px solid rgba(51,65,85,.22); border-radius: 3px; display: block; height: 10px; width: 10px; }
.nearby-map__noise-legend i[data-noise-level="1"] { background: rgba(34,197,94,.48); }
.nearby-map__noise-legend i[data-noise-level="2"] { background: rgba(250,204,21,.55); }
.nearby-map__noise-legend i[data-noise-level="3"] { background: rgba(239,68,68,.55); }
.nearby-map__air-quality-legend i[data-air-quality-level="1"] { background: rgba(34,197,94,.48); }
.nearby-map__air-quality-legend i[data-air-quality-level="2"] { background: rgba(250,204,21,.55); }
.nearby-map__air-quality-legend i[data-air-quality-level="3"] { background: rgba(239,68,68,.55); }
.nearby-map__noise-legend small { flex-basis: 100%; font-size: .58rem; font-weight: 650; }
.nearby-map__noise-legend a { color: #7f3b22; text-decoration: underline; text-underline-offset: 2px; }
.nearby-map__isochrone-progress { background: #dbe4f2; border-radius: 999px; display: block; height: 5px; overflow: hidden; width: 60px; }
.nearby-map__isochrone-progress span { animation: nearby-map-isochrone-progress 1.2s ease-in-out infinite; background: #17864c; border-radius: inherit; display: block; height: 100%; width: 45%; }
.nearby-map__isochrone-tooltip { align-items: center; backdrop-filter: blur(6px); background: rgba(255,255,255,.96); border: 1px solid rgba(51,65,85,.2); border-radius: 9px; box-shadow: 0 7px 18px rgba(16,35,63,.2); box-sizing: border-box; color: #343a40; display: inline-flex; font-size: .7rem; font-weight: 820; gap: 7px; line-height: 1.3; max-width: min(250px, calc(100% - 24px)); padding: 8px 10px; pointer-events: none; position: absolute; white-space: normal; z-index: 16; }
.nearby-map__isochrone-tooltip span { min-width: 0; }
.nearby-map__isochrone-tooltip i { border: 1px solid rgba(51,65,85,.24); border-radius: 4px; display: block; flex: 0 0 auto; height: 12px; width: 12px; }
.nearby-map__isochrone-tooltip i[data-walking-zone="5"] { background: rgba(34,197,94,.55); }
.nearby-map__isochrone-tooltip i[data-walking-zone="10"] { background: rgba(134,239,172,.62); }
.nearby-map__isochrone-tooltip i[data-walking-zone="15"] { background: rgba(250,204,21,.62); }
.nearby-map__isochrone-tooltip i[data-walking-zone="20"] { background: rgba(251,146,60,.58); }
.nearby-map__isochrone-tooltip i[data-walking-zone="25"] { background: rgba(248,113,113,.56); }
.nearby-map__isochrone-tooltip i[data-walking-zone="30"] { background: rgba(239,68,68,.54); }
.nearby-map__environment-tooltip { align-items: center; backdrop-filter: blur(6px); background: rgba(255,255,255,.96); border: 1px solid rgba(51,65,85,.2); border-radius: 9px; box-shadow: 0 7px 18px rgba(16,35,63,.2); box-sizing: border-box; color: #343a40; display: inline-flex; font-size: .7rem; font-weight: 820; gap: 7px; line-height: 1.3; max-width: min(250px, calc(100% - 24px)); padding: 8px 10px; pointer-events: none; position: absolute; white-space: normal; z-index: 16; }
.nearby-map__environment-tooltip span { min-width: 0; }
.nearby-map__environment-tooltip i { border: 1px solid rgba(51,65,85,.24); border-radius: 4px; display: block; flex: 0 0 auto; height: 12px; width: 12px; }
.nearby-map__environment-tooltip i[data-noise-level="1"], .nearby-map__environment-tooltip i[data-air-quality-level="1"] { background: rgba(34,197,94,.55); }
.nearby-map__environment-tooltip i[data-noise-level="2"], .nearby-map__environment-tooltip i[data-air-quality-level="2"] { background: rgba(250,204,21,.62); }
.nearby-map__environment-tooltip i[data-noise-level="3"], .nearby-map__environment-tooltip i[data-air-quality-level="3"] { background: rgba(239,68,68,.62); }
.nearby-map__zoom-controls { align-items: center; background: #fff; border: 1px solid rgba(81, 70, 255, .18); border-radius: 14px; bottom: 16px; box-shadow: 0 8px 22px rgba(16, 35, 63, .2); display: flex; flex-direction: column; gap: 3px; padding: 4px; position: absolute; right: 16px; z-index: 13; }
.nearby-map__zoom-button { align-items: center; background: transparent; border: 0; border-radius: 9px; color: #4034df; display: flex; height: 36px; justify-content: center; padding: 0; width: 36px; }
.nearby-map__zoom-button:hover:not(:disabled), .nearby-map__zoom-button:focus-visible { background: #ebe9ff; color: #3026c8; outline: 0; }
.nearby-map__zoom-button:disabled { color: #a7abc5; cursor: not-allowed; opacity: .65; }
.nearby-map__zoom-level { align-items: center; border-bottom: 1px solid rgba(81, 70, 255, .12); border-top: 1px solid rgba(81, 70, 255, .12); color: #18233f; display: flex; font-size: .68rem; font-variant-numeric: tabular-nums; font-weight: 850; justify-content: center; min-height: 28px; min-width: 36px; padding: 0 3px; }
.nearby-map__travel-toggle { align-items: center; background: #fff; border: 1px solid rgba(81,70,255,.22); border-radius: 12px; bottom: 16px; box-shadow: 0 7px 20px rgba(15,23,42,.2); color: #4034df; display: flex; height: 44px; justify-content: center; left: 16px; padding: 0; position: absolute; width: 44px; z-index: 14; }
.nearby-map__travel-toggle:hover, .nearby-map__travel-toggle:focus-visible, .nearby-map__travel-toggle--active { background: #5146ff; color: #fff; outline: 0; }
.nearby-map__travel-sidebar { height: max(0px, calc(var(--nearby-map-height) - 28px)); left: 28px; max-height: none; max-width: calc(100% - 56px); min-height: 0; overflow: hidden; position: absolute; top: 14px; width: min(410px, calc(100% - 56px)); z-index: 17; }
.nearby-map__radius { background: rgba(72, 70, 255, .09); border: 2px solid rgba(72, 70, 255, .58); border-radius: 50%; pointer-events: none; position: absolute; transform: translate(-50%, -50%); will-change: opacity; z-index: 2; }
.nearby-map__radius--fade-in { animation: nearby-map-radius-fade-in var(--nearby-city-transition-duration, 980ms) cubic-bezier(.65, 0, .35, 1) both; }
.nearby-map__radius--fade-out { animation: nearby-map-radius-fade-out var(--nearby-city-transition-duration, 980ms) cubic-bezier(.65, 0, .35, 1) both; }
.nearby-map__origin { align-items: center; background: #d92d20; border: 3px solid #fff; border-radius: 50% 50% 50% 0; box-shadow: 0 6px 16px rgba(146, 34, 26, .34); color: #fff; display: flex; height: 38px; justify-content: center; position: absolute; transform: translate(-50%, -70%) rotate(-45deg); width: 38px; z-index: 4; }
.nearby-map-shell--city-view .nearby-map__origin { z-index: 9; }
.nearby-map__origin svg { transform: rotate(45deg); }
.nearby-map__marker-body { display: inline-block; height: max-content; position: relative; width: max-content; }
.nearby-map__marker-anchor { position: absolute; transform: translate(-50%, -50%); z-index: 5; }
.nearby-map__marker-anchor--active { z-index: 90 !important; }
.nearby-map__marker-anchor--heavy { z-index: 8; }
.nearby-map__marker-anchor--feeder-pulse { z-index: 11; }
.nearby-map__marker-anchor--supplemental { --nearby-marker-edge-angle: 0deg; }
.nearby-map__marker-anchor .nearby-map__marker { position: relative; transform: none; }
.nearby-map__marker-anchor .nearby-map__marker:hover:not(:disabled), .nearby-map__marker-anchor .nearby-map__marker:focus-visible { transform: scale(1.1); }
.nearby-map__marker { align-items: center; aspect-ratio: 1; background: #5146ff; border: 3px solid #fff; border-radius: 50%; box-shadow: 0 5px 13px rgba(21, 28, 77, .28); box-sizing: border-box; color: #fff; display: flex; height: 36px; justify-content: center; min-height: 36px; min-width: 36px; overflow: visible; padding: 0; position: absolute; transform: translate(-50%, -50%); transition: background-color 150ms ease, box-shadow 150ms ease, transform 150ms ease; width: 36px; z-index: 5; }
.nearby-map__marker--bus { height: 32px; min-height: 32px; min-width: 32px; width: 32px; }
.nearby-map__marker:hover:not(:disabled), .nearby-map__marker:focus-visible { background: #665cff; box-shadow: 0 0 0 4px rgba(81, 70, 255, .22), 0 7px 16px rgba(21, 28, 77, .32); color: #fff; transform: translate(-50%, -50%) scale(1.1); }
.nearby-map__marker-anchor .nearby-map__marker--bus { transform: translate(-50%, -50%) scale(.85); }
.nearby-map__marker-anchor--active .nearby-map__marker--bus,
.nearby-map__marker-anchor .nearby-map__marker--bus:hover:not(:disabled),
.nearby-map__marker-anchor .nearby-map__marker--bus:focus-visible { transform: translate(-50%, -50%) scale(1.1); }
.nearby-map__marker--heavy { z-index: 8; }
.nearby-map__marker--heavy:hover:not(:disabled), .nearby-map__marker--heavy:focus-visible { z-index: 9; }
.nearby-map__marker:hover:not(:disabled) :deep(svg), .nearby-map__marker:focus-visible :deep(svg) { filter: drop-shadow(0 0 4px rgba(255, 255, 255, .9)); transform: scale(1.16); }
.nearby-map__marker--selected { background: #17864c; box-shadow: 0 0 0 3px rgba(23, 134, 76, .23), 0 5px 13px rgba(21, 28, 77, .28); }
.nearby-map__marker--selected:hover:not(:disabled), .nearby-map__marker--selected:focus-visible { background: #229b5a; box-shadow: 0 0 0 4px rgba(23, 134, 76, .25), 0 7px 16px rgba(21, 28, 77, .32); color: #fff; }
.nearby-map__marker--pinned { box-shadow: 0 0 0 4px rgba(81, 70, 255, .3), 0 5px 13px rgba(21, 28, 77, .28); }
.nearby-map__marker--official, .nearby-map__marker--official:hover:not(:disabled), .nearby-map__marker--official:focus-visible, .nearby-map__marker--official.nearby-map__marker--selected, .nearby-map__marker--official.nearby-map__marker--selected:hover:not(:disabled), .nearby-map__marker--official.nearby-map__marker--selected:focus-visible { background: transparent; border-color: transparent; box-shadow: none; }
.nearby-map__marker--bus:has(.nearby-map__marker-line-icon img), .nearby-map__marker--bus:has(.nearby-map__marker-line-icon img):hover:not(:disabled), .nearby-map__marker--bus:has(.nearby-map__marker-line-icon img):focus-visible, .nearby-map__marker--bus:has(.nearby-map__marker-line-icon img).nearby-map__marker--selected, .nearby-map__marker--bus:has(.nearby-map__marker-line-icon img).nearby-map__marker--selected:hover:not(:disabled), .nearby-map__marker--bus:has(.nearby-map__marker-line-icon img).nearby-map__marker--selected:focus-visible { background: transparent; border-color: transparent; box-shadow: none; }
.nearby-map__marker--official:hover:not(:disabled) .nearby-map__marker-line-icon :deep(img), .nearby-map__marker--official:focus-visible .nearby-map__marker-line-icon :deep(img) { filter: drop-shadow(0 0 4px rgba(255, 255, 255, .9)); transform: scale(1.1); }
.nearby-map__marker :deep(svg) { transition: filter 150ms ease, transform 150ms ease; }
.nearby-map__marker-content { align-items: center; display: inline-flex; justify-content: center; position: relative; transform-origin: center; z-index: 1; }
.nearby-map__marker-ripple { animation: nearby-map-current-marker-ripple 2.6s cubic-bezier(.16,1,.3,1) infinite; background: color-mix(in srgb, var(--nearby-marker-color, #0064ff), transparent 64%); border-radius: 50%; inset: 0; opacity: 0; pointer-events: none; position: absolute; transform: scale(.55); transform-box: fill-box; transform-origin: center; z-index: 0; }
.nearby-map__marker-ripple--delayed { animation-delay: 1.25s; }
.nearby-map__marker--pinned .nearby-map__marker-content { animation: nearby-map-current-marker-breathe 2.2s ease-in-out infinite; filter: drop-shadow(0 2px 4px rgba(16, 35, 63, .22)) drop-shadow(0 0 8px color-mix(in srgb, var(--nearby-marker-color, #0064ff), transparent 38%)); }
.nearby-map__marker-station-name { background: rgba(255, 255, 255, .96); border: 1px solid rgba(16, 35, 63, .14); border-radius: 7px; bottom: calc(100% + 7px); box-shadow: 0 4px 12px rgba(16, 35, 63, .2); box-sizing: border-box; color: var(--ink); display: grid; font-size: .74rem; font-weight: 850; gap: 5px; left: 50%; max-width: min(260px, calc(100vw - 32px)); min-width: 132px; overflow: hidden; padding: 11px 34px 8px 9px; pointer-events: auto; position: absolute; text-align: center; transform: translateX(-50%); width: max-content; white-space: nowrap; z-index: 30; }
.nearby-map__marker-anchor--tooltip-left .nearby-map__marker-station-name { left: auto; right: 0; transform: none; }
.nearby-map__marker-anchor--tooltip-right .nearby-map__marker-station-name { left: 0; transform: none; }
.nearby-map__marker-anchor--tooltip-below .nearby-map__marker-station-name { bottom: auto; top: calc(100% + 7px); }
.nearby-map__marker-anchor--tooltip-above .nearby-map__marker-station-name { bottom: calc(100% + 7px); top: auto; }
.nearby-map__marker-station-title { overflow: hidden; text-overflow: ellipsis; }
.nearby-map__marker-tooltip-close { align-items: center; aspect-ratio: 1; background: rgba(245, 247, 251, .94); border: 1px solid rgba(16, 35, 63, .12); border-radius: 50%; color: var(--muted); display: inline-flex; height: 20px; justify-content: center; padding: 0; position: absolute; right: 5px; top: 5px; width: 20px; z-index: 2; }
.nearby-map__marker-tooltip-close:hover, .nearby-map__marker-tooltip-close:focus-visible { background: #ebe9ff; color: #4034df; outline: 0; }
.nearby-map__marker-station-meta { align-items: center; color: var(--muted); display: flex; font-size: .67rem; font-weight: 850; gap: 6px; justify-content: center; line-height: 1.1; }
.nearby-map__marker-meta-separator { color: var(--muted); }
.nearby-map__marker-walking-time { align-items: center; color: #5146ff; display: inline-flex; gap: 3px; }
.nearby-map__schedule-toggle { background: #ebe9ff; border: 1px solid rgba(81,70,255,.18); border-radius: 5px; color: #4034df; cursor: pointer; font: inherit; font-size: .62rem; justify-self: center; line-height: 1.2; min-height: 24px; padding: 3px 6px; }
.nearby-map__schedule-toggle:hover, .nearby-map__schedule-toggle:focus-visible { background: #4034df; color: #fff; outline: 0; }
.nearby-map__schedule-status { color: var(--muted); font-size: .64rem; }
.nearby-map__marker-line-icon { align-items: center; display: inline-flex; flex: 0 0 25px; height: 25px; justify-content: center; min-width: 25px; width: 25px; }
.nearby-map__marker-line-icon :deep(img) { display: block; height: 25px; max-height: 25px; max-width: 25px; object-fit: contain; width: 25px; }
.nearby-map__marker-line-icon :deep(.line-icon-badge__fallback) { align-items: center; background: transparent; border: 0; border-radius: 50%; color: #fff; display: inline-flex; height: 25px; justify-content: center; min-width: 25px; width: 25px; }
.nearby-map__marker-line-icon :deep(.line-icon-badge__label) { background: transparent; color: #fff; font-size: .78rem; min-width: 25px; padding: 0; }
.nearby-map__heavy-tooltip-lines { align-items: center; display: inline-flex; gap: 4px; justify-content: center; }
.nearby-map__heavy-tooltip-line-icon { align-items: center; display: inline-flex; flex: 0 0 25px; height: 25px; justify-content: center; min-width: 25px; width: 25px; }
.nearby-map__heavy-tooltip-line-icon :deep(img) { display: block; height: 25px; max-height: 25px; max-width: 40px; object-fit: contain; width: auto; }
.nearby-map__heavy-tooltip-line-icon :deep(.line-icon-badge__fallback) { align-items: center; background: transparent; border: 0; border-radius: 50%; color: #fff; display: inline-flex; height: 25px; justify-content: center; min-width: 25px; width: 25px; }
.nearby-map__heavy-tooltip-line-icon :deep(.line-icon-badge__label) { background: transparent; color: #fff; font-size: .78rem; min-width: 25px; padding: 0; }
.nearby-map__marker--outside { filter: grayscale(.6); opacity: .4; }
.nearby-map__marker--attenuated { filter: saturate(.45); opacity: .34; }
.nearby-map__marker--attenuated:hover:not(:disabled), .nearby-map__marker--attenuated:focus-visible { filter: saturate(.8); opacity: .78; }
.nearby-map__marker--feeder-pulse { z-index: 10; }
.nearby-map__marker--feeder-pulse::before { animation: nearby-map-feeder-pulse-ring 1s ease-out 3 both; border: 2px solid color-mix(in srgb, var(--nearby-marker-color, #5146ff) 72%, white); border-radius: 50%; content: ""; inset: -8px; opacity: .8; pointer-events: none; position: absolute; }
.nearby-map__marker--supplemental, .nearby-map__marker--supplemental:hover:not(:disabled), .nearby-map__marker--supplemental:focus-visible { background: transparent; border-color: transparent; box-shadow: none; color: var(--nearby-marker-color, #5146ff); }
.nearby-map__marker--supplemental::after { display: none; }
.nearby-map__marker--supplemental .nearby-map__marker-content { filter: drop-shadow(0 2px 3px rgba(16,35,63,.3)); }
.nearby-map__heavy-edge-label { align-items: center; background: rgba(255,255,255,.96); border: 1px solid rgba(81,70,255,.22); border-radius: 8px; bottom: calc(100% + 7px); box-sizing: border-box; box-shadow: 0 4px 12px rgba(16,35,63,.18); color: #18233f; cursor: pointer; display: inline-flex; font-size: .58rem; font-weight: 900; gap: 5px; left: 50%; max-width: min(205px, var(--nearby-heavy-edge-label-max-width, 205px)); min-height: 29px; overflow: hidden; padding: 2px 5px; pointer-events: auto; position: absolute; transform: translateX(-50%); white-space: nowrap; z-index: 30; }
.nearby-map__heavy-edge-label:focus-visible { outline: 2px solid #5146ff; outline-offset: 2px; }
.nearby-map__heavy-edge-lines { align-items: center; display: inline-flex; flex: 0 0 auto; gap: 2px; }
.nearby-map__heavy-edge-line-icon { align-items: center; display: inline-flex; flex: 0 0 25px; height: 25px; justify-content: center; min-width: 25px; width: 25px; }
.nearby-map__heavy-edge-line-icon :deep(img) { display: block; height: 25px; max-height: 25px; max-width: 40px; object-fit: contain; width: auto; }
.nearby-map__heavy-edge-line-icon :deep(.line-icon-badge__fallback) { align-items: center; background: transparent; border: 0; border-radius: 50%; color: #18233f; display: inline-flex; height: 25px; justify-content: center; min-width: 25px; width: 25px; }
.nearby-map__heavy-edge-line-icon :deep(.line-icon-badge__label) { background: transparent; color: #18233f; font-size: .68rem; min-width: 25px; padding: 0; }
.nearby-map__heavy-edge-access { max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
.nearby-map__marker-anchor--projection-top .nearby-map__heavy-edge-label { bottom: auto; top: calc(100% + 7px); }
.nearby-map__marker-anchor--projection-top-right .nearby-map__heavy-edge-label,
.nearby-map__marker-anchor--projection-top-left .nearby-map__heavy-edge-label { bottom: auto; top: calc(100% + 7px); }
.nearby-map__marker-anchor--projection-right .nearby-map__heavy-edge-label { bottom: 50%; left: auto; right: calc(100% + 7px); transform: translateY(50%); }
.nearby-map__marker-anchor--projection-left .nearby-map__heavy-edge-label { bottom: 50%; left: calc(100% + 7px); transform: translateY(50%); }
.nearby-map__marker-anchor--projection-bottom-right .nearby-map__heavy-edge-label,
.nearby-map__marker-anchor--projection-bottom-left .nearby-map__heavy-edge-label { bottom: calc(100% + 7px); top: auto; }
.nearby-map__marker-anchor--projection-top-right .nearby-map__heavy-edge-label,
.nearby-map__marker-anchor--projection-bottom-right .nearby-map__heavy-edge-label { left: auto; right: 0; transform: none; }
.nearby-map__marker-anchor--projection-top-left .nearby-map__heavy-edge-label,
.nearby-map__marker-anchor--projection-bottom-left .nearby-map__heavy-edge-label { left: 0; transform: none; }
.nearby-map__marker-anchor :deep(.nearby-map__inline-schedules) { left: 24px; position: absolute; top: 20px; z-index: 24; }
.nearby-map-item-enter-active { animation: nearby-map-pop 420ms cubic-bezier(.18,.8,.28,1.3) both; animation-delay: var(--nearby-map-pop-delay); }
.nearby-map-item-leave-active { animation: nearby-map-pop-out 420ms cubic-bezier(.18,.8,.28,1.3) both; pointer-events: none; }
.nearby-map-item-no-move { transition: none !important; }
.nearby-map__marker-body > .nearby-map__marker { position: relative; transform: none; }
.nearby-map__marker-body > .nearby-map__marker--bus { transform: scale(.85); }
.nearby-map__marker-body > .nearby-map__marker:hover:not(:disabled),
.nearby-map__marker-body > .nearby-map__marker:focus-visible { transform: scale(1.1); }
.nearby-map__marker-check { align-items: center; background: #fff; border: 2px solid #17864c; border-radius: 50%; bottom: -7px; color: #17864c; display: flex; height: 18px; justify-content: center; position: absolute; right: -7px; top: auto; width: 18px; z-index: 2; }
.nearby-map__line-count { align-items: center; background: #fff; border: 2px solid var(--nearby-marker-color, #5146ff); border-radius: 50%; bottom: -7px; box-shadow: 0 2px 6px rgba(16, 35, 63, .24); color: var(--nearby-marker-color, #5146ff); display: flex; font-size: .64rem; font-weight: 900; height: 18px; justify-content: center; line-height: 1; min-width: 18px; padding: 0; position: absolute; right: -7px; width: 18px; z-index: 3; }
.nearby-map__sidebar { align-self: stretch; background: #fff; border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 8px 22px rgba(16,35,63,.07); box-sizing: border-box; display: flex; flex-direction: column; height: var(--nearby-map-height); min-height: 0; min-width: 0; overflow: hidden; padding: 16px; }
.nearby-map__sidebar-tabs { background: #f5f7fb; border: 1px solid rgba(100,116,139,.14); border-radius: 10px; display: grid; flex: 0 0 auto; gap: 3px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 2px 0 12px; padding: 3px; }
.nearby-map__sidebar-tab { background: transparent; border: 0; border-radius: 7px; color: var(--muted); font-size: .72rem; font-weight: 820; min-height: 34px; min-width: 0; padding: 5px 7px; }
.nearby-map__sidebar-tab:hover, .nearby-map__sidebar-tab:focus-visible { color: #4034df; outline: 0; }
.nearby-map__sidebar-tab--active { background: #fff; box-shadow: 0 2px 7px rgba(16,35,63,.1); color: #4034df; }
.nearby-map__sidebar-tab-viewport { flex: 1 1 0; min-height: 0; min-width: 0; overflow: hidden; touch-action: pan-y; }
.nearby-map__sidebar-tab-track { display: grid; grid-template-columns: minmax(0, 100%); height: 100%; transform: translateX(0); transition: transform 220ms ease; width: 100%; }
.nearby-map__sidebar-tab-track--with-schedule { grid-template-columns: repeat(2, minmax(0, 100%)); width: 200%; }
.nearby-map__sidebar-tab-track--schedule { transform: translateX(-50%); }
.nearby-map__sidebar-tab-panel { min-height: 0; min-width: 0; overflow: auto; padding: 1px 2px 1px 0; }
.nearby-map__sidebar-tab-panel > :deep(.nearby-schedule-panel) { flex: 1 1 0; grid-template-rows: auto minmax(0, 1fr); height: 100%; min-height: 0; overflow: hidden; }
.nearby-map__sidebar :deep(.nearby-schedule-panel__cards) { max-height: none; min-height: 0; }
.nearby-map__sidebar-toolbar { display: flex; height: 0; justify-content: flex-end; position: relative; z-index: 2; }
.nearby-map__sidebar-options { align-items: center; background: rgba(255,255,255,.96); border: 1px solid rgba(81,70,255,.18); border-radius: 8px; color: #5146ff; display: inline-flex; height: 30px; justify-content: center; opacity: 0; padding: 0; transform: translateY(-5px); transition: opacity 140ms ease, transform 140ms ease; width: 30px; }
.nearby-map__sidebar:hover .nearby-map__sidebar-options, .nearby-map__sidebar:focus-within .nearby-map__sidebar-options, .nearby-map__sidebar-options:focus-visible { opacity: 1; transform: translateY(-5px); }
.nearby-map__sidebar-options:hover, .nearby-map__sidebar-options:focus-visible { background: #ebe9ff; outline: 0; }
.nearby-map__details { display: grid; gap: 12px; }
.nearby-map__details header, .nearby-map__details footer { align-items: center; display: flex; gap: 10px; justify-content: space-between; }
.nearby-map__details header > div { display: grid; gap: 3px; min-width: 0; }
.nearby-map__details header strong { font-size: 1.02rem; overflow-wrap: anywhere; }
.nearby-map__details header span { color: var(--muted); font-size: .88rem; font-weight: 800; }
.nearby-map__station-meta { align-items: center; display: flex; flex-wrap: nowrap; gap: 8px; white-space: nowrap; }
.nearby-map__walking-time { align-items: center; color: #5146ff !important; display: inline-flex; gap: 4px; }
.nearby-map__heavy-access { align-items: center; color: #4034df; display: inline-flex; font-size: .76rem; font-weight: 850; gap: 5px; margin: 0; }
.nearby-map__close { background: transparent; color: var(--muted); font-size: 1.3rem; min-height: 30px; padding: 0 7px; }
.nearby-map__line-groups { display: grid; gap: 10px; }
.nearby-map__line-group { display: grid; gap: 5px; }
.nearby-map__line-group h4 { color: var(--muted); font-size: .74rem; letter-spacing: .04em; margin: 0; text-transform: uppercase; }
.nearby-map__lines { display: flex; flex-wrap: wrap; gap: 7px; }
.nearby-map__line { background: #f5f7fb; border: 1px solid transparent; min-height: 36px; padding: 2px 6px; }
.nearby-map__line--selected { border-color: #17864c; color: #17864c; }
.nearby-map__line--active { border-color: color-mix(in srgb, #5146ff 65%, white); box-shadow: 0 0 0 2px rgba(81, 70, 255, .12); }
.nearby-map__line--hovered { background: #ebe9ff; color: #4034df; }
.nearby-map__line :deep(.line-icon-badge) { height: 26px; min-width: 30px; }
.nearby-map__line :deep(.line-icon-badge img) { max-height: 25px; max-width: 46px; }
.nearby-map__select, .nearby-map__details-action { font-size: .88rem; min-height: 40px; padding: 9px 11px; }
.nearby-map__details-action { background: transparent; color: #4638ed; font-size: .88rem; min-height: 40px; padding: 9px 6px; }
.nearby-map__sidebar-empty { align-items: center; color: var(--muted); display: flex; flex-direction: column; gap: 9px; justify-content: center; min-height: 326px; padding: 12px; text-align: center; }
.nearby-map__sidebar-empty svg { color: #5146ff; }
.nearby-map__sidebar-empty strong { color: var(--ink); font-size: .98rem; }
.nearby-map__sidebar-empty span { font-size: .86rem; line-height: 1.4; }
.nearby-map__loading { backdrop-filter: blur(2px); background: rgba(255,255,255,.76); border-radius: 999px; color: var(--muted); font-weight: 850; left: 50%; padding: 9px 14px; position: absolute; top: 82px; transform: translateX(-50%); z-index: 12; }
@keyframes nearby-map-isochrone-progress { 0% { margin-left: -45%; } 100% { margin-left: 110%; } }
@keyframes nearby-map-current-marker-ripple { 0% { opacity: 0; transform: scale(.55); } 10% { opacity: .65; } 42% { opacity: .2; } 100% { opacity: 0; transform: scale(2.65); } }
@keyframes nearby-map-current-marker-breathe { 0%, 100% { filter: brightness(1) drop-shadow(0 2px 4px rgba(16, 35, 63, .22)) drop-shadow(0 0 8px color-mix(in srgb, var(--nearby-marker-color, #0064ff), transparent 38%)); transform: scale(1.45); } 50% { filter: brightness(1.06) drop-shadow(0 3px 5px rgba(16, 35, 63, .2)) drop-shadow(0 0 12px color-mix(in srgb, var(--nearby-marker-color, #0064ff), transparent 28%)); transform: scale(1.49); } }
@keyframes nearby-map-radius-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes nearby-map-radius-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes nearby-map-city-view-spin { to { transform: rotate(360deg); } }
@keyframes nearby-map-feeder-pulse-ring { 0% { opacity: .78; transform: scale(.72); } 68% { opacity: .08; transform: scale(1.55); } 100% { opacity: 0; transform: scale(1.7); } }

@keyframes nearby-map-pop { 0% { opacity: 0; transform: translate(-50%, calc(-50% + 10px)) scale(.85); } 70% { opacity: 1; transform: translate(-50%, -50%) scale(1.06); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
@keyframes nearby-map-pop-out { 0% { transform: translate(-50%, -50%) scale(1); } 30% { transform: translate(-50%, -50%) scale(1.06); } 100% { opacity: 0; transform: translate(-50%, calc(-50% + 10px)) scale(.85); } }
.nearby-map-display-sheet-enter-active, .nearby-map-display-sheet-leave-active { transition: opacity 180ms ease; }
.nearby-map-display-sheet-enter-from, .nearby-map-display-sheet-leave-to { opacity: 0; }
@media (max-width: 820px) {
  .nearby-map-shell { grid-template-columns: 1fr; }
  .nearby-map__splitter { display: none; }
  .nearby-map__sidebar { min-height: 0; }
  .nearby-map__sidebar-empty { min-height: 150px; }
}
@media (max-width: 680px) {
  .nearby-map-shell { --nearby-map-height: clamp(540px, calc(100dvh - 64px), 960px); }
  .nearby-map__sidebar { padding: 14px; }
  .nearby-map__travel-sidebar { left: 14px; max-width: calc(100% - 28px); width: min(460px, calc(100% - 28px)); }
  .nearby-map__top-control-zone { height: 112px; }
  .nearby-map__primary-controls { flex-wrap: wrap; gap: 6px; justify-content: flex-end; left: 12px; right: 12px; }
  .nearby-map__city-view-toggle { width: 128px; }
  .nearby-map__display-overlay { background: rgba(15, 23, 42, .22); inset: 0; pointer-events: auto; position: fixed; }
  .nearby-map-display-sheet-enter-active .nearby-map__display-panel, .nearby-map-display-sheet-leave-active .nearby-map__display-panel { transition: transform 220ms cubic-bezier(.16, 1, .3, 1); }
  .nearby-map-display-sheet-enter-active .nearby-map__display-panel-backdrop, .nearby-map-display-sheet-leave-active .nearby-map__display-panel-backdrop { transition: opacity 180ms ease; }
  .nearby-map-display-sheet-enter-from .nearby-map__display-panel, .nearby-map-display-sheet-leave-to .nearby-map__display-panel { transform: translateY(100%); }
  .nearby-map-display-sheet-enter-from .nearby-map__display-panel-backdrop, .nearby-map-display-sheet-leave-to .nearby-map__display-panel-backdrop { opacity: 0; }
  .nearby-map__display-panel-backdrop { background: transparent; border: 0; display: block; inset: 0; padding: 0; position: absolute; width: 100%; z-index: 0; }
  .nearby-map__display-panel { border: 0; border-radius: 22px 22px 0 0; bottom: 0; box-shadow: 0 -20px 48px rgba(15, 23, 42, .25); display: grid; grid-template-rows: auto auto minmax(0, 1fr); left: 0; max-height: min(82dvh, 620px); right: 0; top: auto; width: 100%; }
  .nearby-map__display-sheet-handle { align-items: center; appearance: none; background: #fff; border: 0; display: flex; flex: 0 0 27px; justify-content: center; padding: 0; touch-action: none; width: 100%; }
  .nearby-map__display-sheet-handle span { background: rgba(100, 116, 139, .42); border-radius: 999px; display: block; height: 5px; width: 46px; }
  .nearby-map__display-sheet-handle:focus-visible { outline: 2px solid #5146ff; outline-offset: -3px; }
  .nearby-map__display-panel-header { min-height: 50px; padding: 7px 14px 9px 18px; }
  .nearby-map__display-panel-header > span { font-size: .84rem; }
  .nearby-map__display-panel-close { align-items: center; background: #f5f7fb; border: 1px solid rgba(100, 116, 139, .2); border-radius: 50%; color: #334155; display: inline-flex; flex: 0 0 34px; height: 34px; justify-content: center; padding: 0; width: 34px; }
  .nearby-map__display-panel-close:hover, .nearby-map__display-panel-close:focus-visible { background: #ebe9ff; color: #4034df; outline: 0; }
  .nearby-map__display-panel-scroll { min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; padding-bottom: max(12px, env(safe-area-inset-bottom)); -webkit-overflow-scrolling: touch; touch-action: pan-y; }
  .nearby-map__display-section { border-top: 1px solid rgba(100, 116, 139, .16); }
  .nearby-map__display-section > summary { align-items: center; color: #18233f; cursor: pointer; display: flex; font-size: .78rem; font-weight: 850; justify-content: space-between; list-style: none; min-height: 50px; padding: 9px 14px 9px 18px; }
  .nearby-map__display-section > summary::-webkit-details-marker { display: none; }
  .nearby-map__display-section > summary:focus-visible { background: #f5f7fb; outline: 0; }
  .nearby-map__display-section > summary svg { color: #5146ff; transition: transform 160ms ease; }
  .nearby-map__display-section[open] > summary svg { transform: rotate(90deg); }
  .nearby-map__display-section-content { padding: 0 14px 14px; }
  .nearby-map__display-panel :deep(.line-map-display-panel__content--global) { padding: 0; }
  .nearby-map__display-panel .nearby-map__cluster-grouping { border-top: 0; padding: 0 0 12px; }
  .nearby-map__display-panel .nearby-map__schedule-filter, .nearby-map__display-panel .nearby-map__station-visibility { padding-inline: 0; }
  .nearby-map__display-panel .nearby-map__station-visibility:first-of-type { border-top: 0; }
  .nearby-map-shell:not(.nearby-map-shell--city-view) .nearby-map__isochrone-status { top: 120px; }
  .nearby-map-shell:not(.nearby-map-shell--city-view) .nearby-map__noise-status { top: 160px; }
  .nearby-map__scale-control { bottom: 14px; gap: 6px; padding: 4px 6px 5px; }
  .nearby-map__scale-labels { font-size: .54rem; }
}
 .nearby-map-shell:fullscreen { --nearby-map-height: calc(100dvh - 32px); background: #f7f8fc; box-sizing: border-box; grid-template-columns: minmax(0, 1fr) 16px minmax(260px, var(--nearby-sidebar-width)); height: 100dvh; overflow: auto; padding: 16px; width: 100vw; }
 .nearby-map-shell:fullscreen .nearby-map { height: calc(100dvh - 32px); }
 .nearby-map-shell:fullscreen .nearby-map__travel-sidebar { height: max(0px, calc(var(--nearby-map-height) - 28px)); top: 14px; }
 .nearby-map-shell:fullscreen .nearby-map__sidebar { max-height: calc(100dvh - 32px); }
 .nearby-map-shell:fullscreen::backdrop { background: rgba(16, 25, 58, .72); }
 @media (max-width: 820px) {
  .nearby-map-shell:fullscreen { grid-template-columns: 1fr; }
  .nearby-map-shell:fullscreen .nearby-map__splitter { display: none; }
  .nearby-map-shell:fullscreen { --nearby-map-height: calc(100dvh - 32px); }
  .nearby-map-shell:fullscreen .nearby-map { height: var(--nearby-map-height); }
  .nearby-map-shell:fullscreen .nearby-map__travel-sidebar { left: 28px; max-width: calc(100% - 28px); width: min(460px, calc(100% - 28px)); }
  .nearby-map-shell:fullscreen .nearby-map__sidebar { max-height: none; }
 }
@media (prefers-reduced-motion: reduce) {
  .nearby-map__city-view-spinner { animation: none; }
  .nearby-map-display-sheet-enter-active, .nearby-map-display-sheet-leave-active { transition: none; }
  .nearby-map__sidebar-tab-track { transition: none; }
  .nearby-map__city-view-slider { transition: none; }
  .nearby-map__radius--fade-in, .nearby-map__radius--fade-out { animation: none; }
  .nearby-map__marker--pinned .nearby-map__marker-ripple { animation: none; opacity: .42; transform: scale(1.8); }
  .nearby-map__marker--pinned .nearby-map__marker-content { animation: none; filter: none; transform: scale(1.45); }
  .nearby-map-item-enter-active { animation: none; }
  .nearby-map-item-leave-active { animation: none; opacity: 0; }
  .nearby-map__marker--feeder-pulse::before { animation: none; opacity: .72; transform: scale(1.1); }
}
/* Keep matching grid tracks in both modes so the map gains/loses space
   continuously. Camera samples follow these dimensions during the flight. */
@media (min-width: 821px) {
  .nearby-map-shell:not(.nearby-map-shell--places-preview) {
    transition: grid-template-columns 420ms cubic-bezier(.22, 1, .36, 1);
    grid-template-columns: minmax(0, 1fr) 12px minmax(0, var(--nearby-sidebar-width));
  }
  .nearby-map-shell.nearby-map-shell--city-view,
  .nearby-map-shell.nearby-map-shell--city-view:fullscreen {
    grid-template-columns: minmax(0, 1fr) 0px minmax(0, 0px);
  }
  .nearby-map__sidebar { grid-column: 3; }
}
.nearby-map__sidebar { animation: nearby-sidebar-reveal 420ms ease both; }
@keyframes nearby-sidebar-reveal {
  from { opacity: 0; transform: translateX(18px); }
  to { opacity: 1; transform: translateX(0); }
}
@media (prefers-reduced-motion: reduce) {
  .nearby-map-shell:not(.nearby-map-shell--places-preview) { transition: none; }
  .nearby-map__sidebar { animation: none; }
}
</style>
