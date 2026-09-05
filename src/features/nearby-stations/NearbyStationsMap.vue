<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useSlots, watch } from "vue";
import { BusFront, Check, Ear, EllipsisVertical, Eye, EyeOff, ExternalLink, Footprints, Gauge, KeyRound, Layers, Map as MapIcon, MapPin, Maximize2, Minimize2, Minus, Plus, Radar, Route, Satellite, Store, TrainFront, TramFront, Wind, ZoomIn, ZoomOut, X } from "lucide-vue-next";
import LineIconBadge from "../../components/LineIconBadge.vue";
import PlaceTooltip from "../../components/PlaceTooltip.vue";
import LineMapDisplayControls from "../line-map/LineMapDisplayControls.vue";
import { useI18n } from "../../i18n";
import { createLinePresentation, transitFamilyToMode } from "../../services/linePresentation";
import type { TransitFamily } from "../../types/transit";
import type { GlobalMapBounds, GlobalMapLine, GlobalMapMode } from "../transport-map/contracts/manifest";
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
import { lonLatToWorld, metersToWorldUnits, screenToWorld, worldScaleAtZoom, worldToScreen, type ScreenPoint } from "../transport-map/geo/coordinateKernel";
import NearbyStationsBasemap from "./NearbyStationsBasemap.vue";
import type {
  TransportMapBasemapLayer,
  TransportMapBasemapStyle,
} from "../transport-map/basemap/tileMath";
import GhostLineFlowOverlay from "../transport-map/overlays/GhostLineFlowOverlay.vue";
import type { GhostLineFlowModel } from "../transport-map/overlays/ghostLineFlow";
import { formatTransitDistanceMeters } from "../../services/distance";
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
  nearbyPlaceWalkingDistanceMeters,
  nearbyPlaceWalkingMinutes,
} from "./nearbyPlacePresentation";
import { useNearbyPlacePresenter } from "./useNearbyPlacePresenter";
import type { NearbyWalkingMinutes } from "./nearbyWalkingMinutes";
import type { NearbyIsochroneGeometry } from "./nearbyIsochrones";
import { parseNearbyAirQualityLevel, type NearbyAirQualityLevel, type NearbyNoiseGridCell, type NearbyNoiseLevel } from "./nearbyNoiseZones";
import { NearbyIsochronesError } from "../../services/nearbyIsochrones";
import type { NearbyJourneyPoint } from "./nearbyHeavyTransports";
import type { NearbyWalkingRoute } from "./nearbyWalkingRoutes";
import { useNearbyIsochrones } from "./useNearbyIsochrones";
import { useNearbyNoiseZones } from "./useNearbyNoiseZones";
import {
  getNearbyHeavyAccessPresentation,
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

const props = withDefaults(defineProps<{
  variant?: "transit" | "places-preview";
  allowZoom?: boolean;
  suspendResizeWork?: boolean;
  selectedPlaceId?: string;
  origin: { lon: number; lat: number };
  radius: number;
  stations: NearbyStationEntry[];
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
  showNearbyPlaceNames?: boolean;
  showIsochroneControl?: boolean;
  showNoiseControl?: boolean;
  showAirQualityControl?: boolean;
  showDirectoryControl?: boolean;
  showNeighborhoodScoreControl?: boolean;
  showBasemapControl?: boolean;
  showDisplayControl?: boolean;
  showFullscreenControl?: boolean;
  places?: readonly NearbyPlace[];
  walkingRoutes?: Readonly<Record<string, NearbyWalkingRoute | undefined>>;
  travelPanelOpen?: boolean;
  travelWalkingSegments?: readonly NearbyWalkingMapSegment[];
  walkingRoute?: NearbyWalkingRoute;
}>(), {
  showIsochroneControl: true,
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
  toggleLine: [stationId: string, lineId: string];
  details: [stationId: string, lineId: string];
  cameraChange: [camera: CameraState];
  hoverLine: [lineId: string];
  leaveLine: [lineId: string];
  activateLine: [lineId: string, focusedStationId?: string, ghostLineIds?: string | readonly string[]];
  clearLineFocus: [];
  updateActiveModes: [modes: GlobalMapMode[]];
  toggleStationSchedule: [stationId: string];
  stationContextMenu: [stationId: string, anchor: HTMLElement];
  placeContextMenu: [placeId: string, anchor: HTMLElement];
  sidebarActions: [anchor: HTMLElement];
  stationFocus: [stationId?: string];
  viewTrace: [lineId: string, directionId: string, stationId?: string];
  updateClusterGroupingDistance: [value: number];
  updateHideStationsWithoutDepartures: [value: boolean];
  "update:hideLongWaitTransports": [value: boolean];
  "update:showNearbyPlaces": [value: boolean];
  "update:showNearbyPlaceNames": [value: boolean];
  toggleTravelPanel: [];
  "fullscreen-change": [fullscreen: boolean];
  openPlacesDirectory: [];
  openNeighborhoodScore: [];
  selectPlace: [placeId?: string];
}>();

const { t } = useI18n();
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
const NEARBY_MAP_HORIZONTAL_MARKER_CLEARANCE = 20;
// The control reserve only protects the menu on the right. North-facing
// projected badges can use the free strip above it everywhere else.
const NEARBY_MAP_NORTH_PROJECTION_SHIFT = NEARBY_MAP_TOP_CONTROL_RESERVE - NEARBY_MAP_CONTENT_INSET;
const NEARBY_MAP_FULLSCREEN_BOTTOM_CONTROL_RESERVE = 148;
const LINE_MODE_ORDER: GlobalMapMode[] = ["METRO", "RER", "TRAIN", "TRANSILIEN", "TRAM", "CABLE", "BUS", "NOCTILIEN"];
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
const sidebarSplitter = ref<HTMLElement>();
const sidebarActionButton = ref<HTMLButtonElement>();
const camera = ref<CameraState>(createCamera({ zoom: 14, viewportWidthCssPx: 720, viewportHeightCssPx: 380 }));
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
const hoveredPlaceId = ref<string>();
const pinnedStationId = ref<string>();
const isFullscreen = ref(false);
const displayControlsOpen = ref(false);
const basemapLayer = ref<TransportMapBasemapLayer>("plan");
const isochroneEnabled = ref(false);
const noiseZonesEnabled = ref(false);
const airQualityZonesEnabled = ref(false);
const isochroneConfigurationModalOpen = ref(false);
const hoveredIsochroneMinutes = ref<NearbyWalkingMinutes>();
const hoveredIsochronePosition = ref<ScreenPoint>();
const hoveredEnvironment = ref<NearbyEnvironmentHover>();
const showMapStations = ref(true);
const showProjectedStations = ref(true);
const animating = ref(false);
const mapDragging = ref(false);
const reducedMotion = ref(false);
const sidebarWidth = ref(SIDEBAR_DEFAULT_WIDTH);
const sidebarResizeActive = ref(false);
const feederPulseActive = ref(false);
let resizeObserver: ResizeObserver | undefined;
let animationFrame: number | undefined;
let previewResizeFrame: number | undefined;
let interactionTimer: number | undefined;
let feederPulseTimer: number | undefined;
let feederPulseToken = 0;
let sidebarResizePointerId: number | undefined;
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

function shouldDisplayStationForSchedule(stationId: string): boolean {
  if (!props.hideStationsWithoutDepartures) return true;
  return props.stationHasUpcomingDeparture?.(stationId) !== false;
}

const displayedStations = computed(() => isPlacesPreview.value || !showMapStations.value ? [] : props.stations.filter((entry) =>
  entry.lines.some((line) => props.activeModes.includes(line.mode)) &&
  shouldDisplayStationForSchedule(entry.id),
));
const displayedSupplementalStations = computed(() => isPlacesPreview.value ? [] : (props.supplementalStations ?? []).filter((candidate) =>
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
const hasVisiblePrimaryControls = computed(() => !isPlacesPreview.value && (
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
  const models = props.lineFlowModels?.length
    ? props.lineFlowModels
    : props.lineFlowModel
      ? [props.lineFlowModel]
      : [];
  const seen = new Set<string>();
  return models.filter((model) => {
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
const displayedNearbyPlaces = computed(() => {
  if (!props.showNearbyPlaces) return [];
  const width = root.value?.clientWidth ?? camera.value.viewportWidthCssPx;
  const height = root.value?.clientHeight ?? camera.value.viewportHeightCssPx;
  const visible = (props.places ?? []).filter((place) => {
    const point = worldToScreen(lonLatToWorld(place), camera.value);
    return point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;
  });
  return isPlacesPreview.value ? visible : visible.slice(0, 120);
});
const nearbyBasemapCoverBounds = computed<GlobalMapBounds>(() => {
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
  if (isPlacesPreview.value && !props.walkingRoute) return [];
  const width = root.value?.clientWidth ?? camera.value.viewportWidthCssPx;
  const height = root.value?.clientHeight ?? camera.value.viewportHeightCssPx;
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
  () => isochroneEnabled.value && !isPlacesPreview.value && props.showIsochroneControl,
);
const {
  status: noiseZonesStatus,
  response: noiseZonesResponse,
  retry: retryNoiseZones,
} = useNearbyNoiseZones(
  () => props.origin,
  () => !isPlacesPreview.value && (
    (noiseZonesEnabled.value && props.showNoiseControl)
    || (airQualityZonesEnabled.value && props.showAirQualityControl)
  ),
  () => props.radius,
);
const isochroneConfigurationError = computed(() => {
  const error = isochroneError.value;
  return error instanceof NearbyIsochronesError && error.code === "not-configured";
});
const isochronePaths = computed(() => {
  if (!isochroneEnabled.value || isochroneStatus.value !== "ready" || !isochroneResponse.value) return [];
  return [...isochroneResponse.value.zones]
    .sort((left, right) => right.minutes - left.minutes)
    .map((zone) => ({
      minutes: zone.minutes,
      d: serializeIsochroneGeometry(zone.geometry),
    }))
    .filter((zone) => zone.d.length > 0);
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
const isochroneTooltipStyle = computed(() => overlayTooltipStyle(hoveredIsochronePosition.value));
const environmentTooltipStyle = computed(() => overlayTooltipStyle(hoveredEnvironment.value?.position));

watch(isochroneConfigurationError, (isMissing) => {
  if (isMissing) isochroneConfigurationModalOpen.value = true;
  else if (isochroneStatus.value !== "error") isochroneConfigurationModalOpen.value = false;
});

watch(
  () => [props.origin.lon, props.origin.lat, props.radius, root.value?.clientWidth, root.value?.clientHeight],
  () => {
    if (props.suspendResizeWork) return;
    void nextTick(() => {
      fitView(!isPlacesPreview.value);
      if (isPlacesPreview.value && props.selectedPlaceId) focusSelectedPlace(true);
    });
  },
);

watch(
  () => props.suspendResizeWork,
  (suspended, wasSuspended) => {
    if (suspended) {
      if (animationFrame !== undefined) {
        cancelAnimationFrame(animationFrame);
        animationFrame = undefined;
      }
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
  const displayedIds = new Set([
    ...entries.map((entry) => entry.id),
    ...displayedSupplementalStations.value.map((candidate) => candidate.id),
  ]);
  if (pinnedStationId.value && !displayedIds.has(pinnedStationId.value)) pinnedStationId.value = undefined;
  if (hoveredStationId.value && !displayedIds.has(hoveredStationId.value)) hoveredStationId.value = undefined;
});
watch(displayedSupplementalStations, (entries) => {
  const displayedIds = new Set([
    ...displayedStations.value.map((entry) => entry.id),
    ...entries.map((candidate) => candidate.id),
  ]);
  if (pinnedStationId.value && !displayedIds.has(pinnedStationId.value)) pinnedStationId.value = undefined;
  if (hoveredStationId.value && !displayedIds.has(hoveredStationId.value)) hoveredStationId.value = undefined;
});
watch(displayedNearbyPlaces, (entries) => {
  if (hoveredPlaceId.value && !entries.some((place) => place.id === hoveredPlaceId.value)) {
    hoveredPlaceId.value = undefined;
  }
});
const hasStationScheduleSlot = computed(() => Boolean(slots["station-schedules"]));

watch(camera, (nextCamera) => {
  emit("cameraChange", nextCamera);
  if (!props.suspendResizeWork) void nextTick(containGhostFlowTooltips);
}, { deep: true });

watch(
  () => props.lineFlowModel,
  () => void nextTick(containGhostFlowTooltips),
  { flush: "post" },
);
watch(
  renderedLineFlowModels,
  () => void nextTick(containGhostFlowTooltips),
  { flush: "post" },
);

watch(isFullscreen, (fullscreen) => {
  if (!fullscreen) displayControlsOpen.value = false;
});

watch(() => props.showIsochroneControl, (visible) => {
  if (!visible) {
    isochroneEnabled.value = false;
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
  reducedMotion.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.addEventListener("fullscreenchange", syncFullscreenState);
  resizeObserver = new ResizeObserver(() => {
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
});

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", syncFullscreenState);
  stopSidebarResize();
  resizeObserver?.disconnect();
  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
  if (previewResizeFrame !== undefined) cancelAnimationFrame(previewResizeFrame);
  if (interactionTimer !== undefined) window.clearTimeout(interactionTimer);
  if (feederPulseTimer !== undefined) window.clearTimeout(feederPulseTimer);
  if (suppressClickTimer !== undefined) window.clearTimeout(suppressClickTimer);
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

function fitView(animate: boolean): void {
  const element = root.value;
  if (!element || element.clientWidth <= 0 || element.clientHeight <= 0) return;
  const resized = resizeCamera(
    camera.value,
    element.clientWidth,
    element.clientHeight,
    Math.min(window.devicePixelRatio || 1, 2),
  );
  const extent = props.radius + 200;
  const latDelta = extent / 111_320;
  const lonDelta = longitudeDelta(props.origin.lat, extent);
  const northWest = lonLatToWorld({ lon: props.origin.lon - lonDelta, lat: props.origin.lat + latDelta });
  const southEast = lonLatToWorld({ lon: props.origin.lon + lonDelta, lat: props.origin.lat - latDelta });
  const target = fitCameraToBounds(resized, {
    minX: Math.min(northWest.x, southEast.x),
    minY: Math.min(northWest.y, southEast.y),
    maxX: Math.max(northWest.x, southEast.x),
    maxY: Math.max(northWest.y, southEast.y),
  }, 32, 10, 18);
  zoomRange.value = {
    min: target.zoom - NEARBY_ZOOM_OUT_DELTA,
    max: target.zoom + NEARBY_ZOOM_IN_DELTA,
  };
  zoomReference.value = target.zoom;
  syncNearbyBasemapReference(target);
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
  options: { duration?: number; easing?: (progress: number) => number } = {},
): void {
  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
  const from = { ...camera.value };
  const startedAt = performance.now();
  animating.value = true;
  const duration = options.duration ?? 400;
  const easing = options.easing ?? easeOutCubic;
  const step = (now: number) => {
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
      animating.value = false;
      animationFrame = undefined;
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
  isochroneEnabled.value = !isochroneEnabled.value;
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
  void retryIsochrones();
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
  const zoomStep = Math.max(-0.16, Math.min(0.16, -deltaPixels / 600));
  const nextZoom = clamp(
    camera.value.zoom + zoomStep,
    zoomRange.value.min,
    zoomRange.value.max,
  );
  if (nextZoom === camera.value.zoom) return;
  const nextCamera = zoomCameraAroundScreenPoint(camera.value, nextZoom, anchor);
  camera.value = clampNearbyCamera(nextCamera);
  keepInteractionActive();
}

function changeZoom(direction: 1 | -1): void {
  const element = root.value;
  if (!element) return;

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
  if (isInteractiveMapTarget(event.target)) return;
  const point = localScreenPoint(event.clientX, event.clientY);
  if (!point) return;

  if (event.pointerType === "touch") {
    activePointers.set(event.pointerId, point);
    captureMapPointer(event.pointerId);
    if (activePointers.size === 1) {
      beginMapPan(event.pointerId, point);
      return;
    }
    if (activePointers.size !== 2) return;
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
    cancelCameraAnimation();
    keepInteractionActive();
    return;
  }

  captureMapPointer(event.pointerId);
  beginMapPan(event.pointerId, point);
}

function handlePointerMove(event: PointerEvent): void {
  if (!canInteractWithMap.value) return;
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
      camera.value = clampNearbyCamera(nextCamera);
      keepInteractionActive();
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
  panLastPoint = point;
  if (delta.x === 0 && delta.y === 0) return;
  event.preventDefault();
  panMoved = panMoved || Math.hypot(delta.x, delta.y) > 2;
  camera.value = clampNearbyCamera(panCameraByScreen(camera.value, delta));
  keepInteractionActive();
}

function handlePointerEnd(event: PointerEvent): void {
  if (!canInteractWithMap.value) return;
  const isTouch = event.pointerType === "touch";
  if (isTouch) {
    if (!activePointers.has(event.pointerId)) return;
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
  releaseMapPointer(event.pointerId);
  finishMapPan(event);
}

function beginMapPan(pointerId: number, point: ScreenPoint): void {
  panPointerId = pointerId;
  panLastPoint = point;
  panMoved = false;
  mapDragging.value = true;
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
  keepInteractionActive();
}

function isInteractiveMapTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && Boolean(target.closest("button, a, input, select, textarea, [role='button']"));
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
  const bounds = element.getBoundingClientRect();
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
  animating.value = false;
}

function keepInteractionActive(): void {
  animating.value = true;
  if (interactionTimer !== undefined) window.clearTimeout(interactionTimer);
  interactionTimer = window.setTimeout(() => {
    animating.value = false;
    interactionTimer = undefined;
  }, basemapInteractionSettleMs.value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hoverStation(stationId: string): void {
  hoveredStationId.value = stationId;
}

function clearHoveredStation(stationId: string): void {
  if (hoveredStationId.value === stationId) hoveredStationId.value = undefined;
}

function hoverIsochrone(minutes: NearbyWalkingMinutes, event: MouseEvent): void {
  hoveredIsochroneMinutes.value = minutes;
  hoveredIsochronePosition.value = localScreenPoint(event.clientX, event.clientY);
}

function clearIsochroneHover(): void {
  hoveredIsochroneMinutes.value = undefined;
  hoveredIsochronePosition.value = undefined;
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

function clearHoveredIsochrone(minutes: NearbyWalkingMinutes): void {
  if (hoveredIsochroneMinutes.value !== minutes) return;
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

function markerTooltipVisible(entry: NearbyStationEntry): boolean {
  return !props.travelPanelOpen &&
    hoveredStationId.value === entry.id &&
    (!props.scheduleState || isFullscreen.value || markerScheduleState(entry) !== undefined);
}

function canToggleStationSchedule(entry: NearbyStationEntry): boolean {
  const state = markerScheduleState(entry);
  return state === "visible" || state === "hidden";
}

function scheduleToggleLabel(entry: NearbyStationEntry): string {
  return markerScheduleState(entry) === "hidden"
    ? t("nearbyStations.showSchedule")
    : t("nearbyStations.hideSchedule");
}

function toggleStationSchedule(entry: NearbyStationEntry): void {
  if (!canToggleStationSchedule(entry)) return;
  emit("toggleStationSchedule", entry.id);
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
  const entry = props.stations.find((candidate) => candidate.id === stationId)
    ?? supplemental?.entry;
  focusStation(stationId);
  const line = supplemental?.lines[0] ?? (entry ? lineForDetails(entry) : undefined);
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

function focusStation(stationId: string): void {
  pinnedStationId.value = stationId;
  hoveredStationId.value = undefined;
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
  if (event.target !== root.value) return;
  if (isPlacesPreview.value) {
    emit("selectPlace", undefined);
    return;
  }
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

function containGhostFlowTooltips(): void {
  const mapElement = root.value;
  if (!mapElement) return;

  const mapBounds = mapElement.getBoundingClientRect();
  if (mapBounds.width <= 0 || mapBounds.height <= 0) return;

  // Keep a small sub-pixel safety margin as CSS transforms and browser zoom
  // can otherwise leave a visually clipped fraction of a border.
  const inset = 4;
  const tooltips = [...mapElement.querySelectorAll<HTMLElement>(".transport-ghost-flow__exit, .transport-ghost-flow__terminus")];

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
  return LINE_MODE_ORDER
    .map((mode) => entry.lines.find((line) => line.mode === mode && props.activeModes.includes(line.mode)))
    .find((line): line is GlobalMapLine => Boolean(line));
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

function isHeavyTransport(entry: NearbyStationEntry): boolean {
  const mode = markerLine(entry)?.mode;
  return mode ? HEAVY_TRANSPORT_MODES.includes(mode) : false;
}

function isBusMarker(entry: NearbyStationEntry): boolean {
  const mode = markerLine(entry)?.mode;
  return mode === "BUS" || mode === "NOCTILIEN";
}

function markerScreen(entry: NearbyStationEntry): ScreenPoint {
  return worldToScreen({ x: entry.station.worldX, y: entry.station.worldY }, camera.value);
}

const { presentPlace } = useNearbyPlacePresenter();

function nearbyPlaceStyle(place: NearbyPlace): Record<string, string> {
  const point = worldToScreen(lonLatToWorld(place), camera.value);
  return { left: `${point.x}px`, top: `${point.y}px` };
}

function nearbyPlaceIcon(place: NearbyPlace) {
  return presentPlace(place).icon;
}

function nearbyPlaceTypeLabel(place: NearbyPlace): string {
  return presentPlace(place).typeLabel;
}

function nearbyPlaceRoute(place: NearbyPlace): NearbyWalkingRoute | undefined {
  return props.walkingRoutes?.[place.id];
}

function nearbyPlaceAriaLabel(place: NearbyPlace): string {
  const route = nearbyPlaceRoute(place);
  return t("nearbyStations.placeAria", {
    name: place.name,
    type: nearbyPlaceTypeLabel(place),
    meters: nearbyPlaceWalkingDistanceMeters(place, route),
    walking: t("nearbyStations.walkingTime", { minutes: nearbyPlaceWalkingMinutes(place, route) }),
  });
}

type NearbyPlaceTooltipPlacement = "above" | "below" | "left" | "right";

function nearbyPlaceTooltipPlacement(place: NearbyPlace): NearbyPlaceTooltipPlacement {
  const point = worldToScreen(lonLatToWorld(place), camera.value);
  const width = root.value?.clientWidth ?? camera.value.viewportWidthCssPx;
  if (point.y < 92) return "below";
  if (point.x < 145) return "right";
  if (point.x > width - 145) return "left";
  return "above";
}

function hoverPlace(placeId: string): void {
  hoveredPlaceId.value = placeId;
}

function clearHoveredPlace(placeId: string): void {
  if (hoveredPlaceId.value === placeId) hoveredPlaceId.value = undefined;
}

function nearbyMapContentBounds(width: number, height: number): NearbyHeavyProjectionBounds {
  const mapWidth = Math.max(0, width);
  const mapHeight = Math.max(0, height);
  const left = 0;
  const right = mapWidth;
  const top = Math.min(NEARBY_MAP_TOP_CONTROL_RESERVE, mapHeight);
  const bottom = mapHeight;
  return { left, right, top, bottom };
}

function nearbyMapProjectionBounds(width: number, height: number): NearbyHeavyProjectionBounds {
  // Keep the projection oriented with the station's actual direction. A
  // right-only projection band makes every north-facing station enter from
  // the right as soon as its ray crosses the artificial left boundary.
  return nearbyMapContentBounds(width, height);
}

function markerStyle(entry: NearbyStationEntry, index: number): Record<string, string> {
  const screen = markerScreen(entry);
  const width = root.value?.clientWidth ?? camera.value.viewportWidthCssPx;
  const height = root.value?.clientHeight ?? camera.value.viewportHeightCssPx;
  const bounds = nearbyMapContentBounds(width, height);
  return {
    left: `${screen.x}px`,
    top: `${clamp(screen.y, bounds.top, bounds.bottom)}px`,
    "--station-pop-delay": `${240 + Math.min(index * 20, 160)}ms`,
    "--nearby-marker-color": markerLine(entry)?.color ?? "#0064ff",
  };
}

function markerTooltipPlacement(entry: NearbyStationEntry): string[] {
  const screen = markerScreen(entry);
  const width = root.value?.clientWidth ?? camera.value.viewportWidthCssPx;
  const height = root.value?.clientHeight ?? camera.value.viewportHeightCssPx;
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
  const width = root.value?.clientWidth ?? camera.value.viewportWidthCssPx;
  const height = root.value?.clientHeight ?? camera.value.viewportHeightCssPx;
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
    ? { x: projectedPoint.x, y: Math.max(NEARBY_MAP_CONTENT_INSET, projectedPoint.y - NEARBY_MAP_NORTH_PROJECTION_SHIFT) }
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
    "--station-pop-delay": `${300 + Math.min(index * 20, 160)}ms`,
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
  const width = root.value?.clientWidth ?? camera.value.viewportWidthCssPx;
  const height = root.value?.clientHeight ?? camera.value.viewportHeightCssPx;
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
  return entry.lines.find((line) => props.activeModes.includes(line.mode))?.mode ?? entry.lines[0]?.mode ?? "BUS";
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
    }"
    :style="{ '--nearby-sidebar-width': `${sidebarWidth}px` }"
  >
    <div
    ref="root"
    class="nearby-map"
    :class="{
      'nearby-map--satellite': basemapLayer === 'satellite',
      'nearby-map--isochrone': isochroneEnabled,
      'nearby-map--interactive': canInteractWithMap,
      'nearby-map--dragging': mapDragging,
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
        name="heavy-access-guide"
        :candidate="pinnedHeavyStation"
      />
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
        v-if="airQualityZoneCells.length > 0"
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
        v-if="noiseZoneCells.length > 0"
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
        v-if="isochronePaths.length > 0"
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
            :d="zone.d"
            fill-rule="evenodd"
            @click.stop
            @mouseenter="hoverIsochrone(zone.minutes, $event)"
            @mousemove="hoverIsochrone(zone.minutes, $event)"
            @mouseleave="clearHoveredIsochrone(zone.minutes)"
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
      <svg
        v-if="walkingMapPaths.length > 0"
        class="nearby-map__walking-flow"
        :viewBox="`0 0 ${walkingMapPaths[0]?.width ?? camera.viewportWidthCssPx} ${walkingMapPaths[0]?.height ?? camera.viewportHeightCssPx}`"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g v-for="segment in walkingMapPaths" :key="segment.id">
          <path class="nearby-map__walking-flow-path" :d="segment.d" />
          <circle class="nearby-map__walking-flow-node" :cx="segment.from.x" :cy="segment.from.y" r="4" />
          <circle class="nearby-map__walking-flow-node" :cx="segment.to.x" :cy="segment.to.y" r="4" />
        </g>
      </svg>
      <div v-if="hasVisiblePrimaryControls" class="nearby-map__primary-controls">
        <button
          v-if="props.showIsochroneControl"
          class="nearby-map__isochrone-toggle"
          type="button"
          :aria-pressed="isochroneEnabled"
          :aria-label="t('nearbyStations.walkingZonesToggle')"
          :title="t('nearbyStations.walkingZonesToggle')"
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
          v-if="props.showDirectoryControl"
          class="nearby-map__directory-toggle"
          type="button"
          :aria-label="t('nearbyStations.directory.launcher')"
          :title="t('nearbyStations.directory.launcher')"
          @click.stop="openPlacesDirectory"
        >
          <Store :size="18" aria-hidden="true" />
        </button>
        <button
          v-if="props.showNeighborhoodScoreControl"
          class="nearby-map__neighborhood-score-toggle"
          type="button"
          :aria-label="t('nearbyStations.neighborhoodScore.launcher')"
          :title="t('nearbyStations.neighborhoodScore.launcher')"
          @click.stop="emit('openNeighborhoodScore')"
        >
          <Gauge :size="18" aria-hidden="true" />
        </button>
        <button
          v-if="props.showBasemapControl"
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
          v-if="props.showDisplayControl"
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
      <aside
        v-if="displayControlsOpen && props.showDisplayControl"
        id="nearby-map-display-controls"
        class="nearby-map__display-panel"
        :aria-label="t('nearbyStations.filtersAria')"
        @click.stop
        @pointerdown.stop
      >
        <header class="nearby-map__display-panel-header">
          <span><Layers :size="16" aria-hidden="true" />{{ t('lineMap.picker.display') }}</span>
        </header>
        <LineMapDisplayControls
          variant="global"
          nearby-options
          :available-modes="availableModes"
          :selected-modes="activeModes"
          :hide-long-wait-transports="props.hideLongWaitTransports"
          :show-nearby-places="props.showNearbyPlaces"
          :show-nearby-place-names="props.showNearbyPlaceNames"
          @update:selected-modes="emit('updateActiveModes', $event)"
          @update:hide-long-wait-transports="emit('update:hideLongWaitTransports', $event)"
          @update:show-nearby-places="emit('update:showNearbyPlaces', $event)"
          @update:show-nearby-place-names="emit('update:showNearbyPlaceNames', $event)"
        />
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
        <label class="nearby-map__station-visibility" data-nearby-map-show-map-stations>
          <input v-model="showMapStations" type="checkbox" />
          <span>{{ t('nearbyStations.showMapStations') }}</span>
        </label>
        <label class="nearby-map__station-visibility" data-nearby-map-show-projected-stations>
          <input v-model="showProjectedStations" type="checkbox" />
          <span>{{ t('nearbyStations.showProjectedStations') }}</span>
        </label>
      </aside>
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
      <span
        v-if="showNearbyPlaces && displayedNearbyPlaces.length > 0"
        class="nearby-map__places-attribution"
      >{{ t('nearbyStations.placesAttribution') }}</span>
      <div
        v-if="isochroneEnabled && isochroneStatus === 'loading'"
        class="nearby-map__isochrone-status nearby-map__isochrone-status--loading"
        role="status"
        aria-live="polite"
      >
        <span class="nearby-map__isochrone-progress" aria-hidden="true"><span /></span>
        <span>{{ t('nearbyStations.walkingZonesLoading') }}</span>
      </div>
      <div
        v-else-if="isochroneEnabled && isochroneStatus === 'error' && !isochroneConfigurationModalOpen"
        class="nearby-map__isochrone-status nearby-map__isochrone-status--error"
        role="alert"
      >
        <span>{{ t('nearbyStations.walkingZonesUnavailable') }}</span>
        <button type="button" @click.stop="retryIsochrones">{{ t('nearbyStations.walkingZonesRetry') }}</button>
      </div>
      <div
        v-if="noiseZonesEnabled && noiseZonesStatus === 'loading'"
        class="nearby-map__noise-status nearby-map__noise-status--loading"
        role="status"
        aria-live="polite"
      >
        <span class="nearby-map__noise-progress" aria-hidden="true"><span /></span>
        <span>{{ t('nearbyStations.noiseZonesLoading') }}</span>
      </div>
      <div
        v-else-if="noiseZonesEnabled && noiseZonesStatus === 'error'"
        class="nearby-map__noise-status nearby-map__noise-status--error"
        role="alert"
      >
        <span>{{ t('nearbyStations.noiseZonesUnavailable') }}</span>
        <button type="button" @click.stop="retryNoiseZones">{{ t('nearbyStations.noiseZonesRetry') }}</button>
      </div>
      <div
        v-if="airQualityZonesEnabled && noiseZonesStatus === 'loading'"
        class="nearby-map__noise-status nearby-map__air-quality-status nearby-map__noise-status--loading"
        role="status"
        aria-live="polite"
      >
        <span class="nearby-map__noise-progress nearby-map__air-quality-progress" aria-hidden="true"><span /></span>
        <span>{{ t('nearbyStations.airQualityZonesLoading') }}</span>
      </div>
      <div
        v-else-if="airQualityZonesEnabled && noiseZonesStatus === 'error'"
        class="nearby-map__noise-status nearby-map__air-quality-status nearby-map__noise-status--error"
        role="alert"
      >
        <span>{{ t('nearbyStations.airQualityZonesUnavailable') }}</span>
        <button type="button" @click.stop="retryNoiseZones">{{ t('nearbyStations.airQualityZonesRetry') }}</button>
      </div>
      <div
        v-if="noiseZonesEnabled && noiseZonesResponse && noiseZoneCells.length > 0"
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
        v-if="airQualityZonesEnabled && noiseZonesResponse && airQualityZoneCells.length > 0"
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
      <div
        v-if="isochroneConfigurationModalOpen && isochroneConfigurationError"
        class="nearby-map__isochrone-config-backdrop"
        role="presentation"
        @click.stop="closeIsochroneConfigurationModal"
      >
        <section
          class="nearby-map__isochrone-config-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nearby-map-isochrone-config-title"
          aria-describedby="nearby-map-isochrone-config-body"
          @click.stop
          @keydown.esc.stop.prevent="closeIsochroneConfigurationModal"
        >
          <header class="nearby-map__isochrone-config-header">
            <div class="nearby-map__isochrone-config-heading">
              <KeyRound :size="18" aria-hidden="true" />
              <h2 id="nearby-map-isochrone-config-title">{{ t('nearbyStations.walkingZonesConfigTitle') }}</h2>
            </div>
            <button
              class="nearby-map__isochrone-config-close"
              type="button"
              :aria-label="t('nearbyStations.walkingZonesConfigClose')"
              @click.stop="closeIsochroneConfigurationModal"
            >
              <X :size="17" aria-hidden="true" />
            </button>
          </header>
          <p id="nearby-map-isochrone-config-body">{{ t('nearbyStations.walkingZonesConfigBody') }}</p>
          <div class="nearby-map__isochrone-config-actions">
            <button
              class="nearby-map__isochrone-config-secondary"
              type="button"
              @click.stop="closeIsochroneConfigurationModal"
            >{{ t('nearbyStations.walkingZonesConfigClose') }}</button>
            <button
              class="nearby-map__isochrone-config-primary"
              type="button"
              @click.stop="retryIsochronesFromConfigurationModal"
            >{{ t('nearbyStations.walkingZonesRetry') }}</button>
          </div>
        </section>
      </div>
      <div
        v-if="hoveredIsochroneMinutes !== undefined && hoveredIsochronePosition"
        class="nearby-map__isochrone-tooltip"
        :class="`nearby-map__isochrone-tooltip--${hoveredIsochroneMinutes}`"
        :style="isochroneTooltipStyle"
        role="tooltip"
      >
        <i :data-walking-zone="hoveredIsochroneMinutes" aria-hidden="true" />
        <span>{{ t('nearbyStations.walkingZonesTooltip', { minutes: hoveredIsochroneMinutes }) }}</span>
      </div>
      <div
        v-if="hoveredEnvironmentTooltip && hoveredEnvironment?.position"
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
      <div
        class="nearby-map__radius"
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

      <div class="nearby-map__places" aria-live="polite">
        <button
          v-for="place in displayedNearbyPlaces"
          :key="place.id"
          class="nearby-map__place"
          :class="[
            `nearby-map__place--${place.category}`,
            `nearby-map__place--tooltip-${nearbyPlaceTooltipPlacement(place)}`,
            { 'nearby-map__place--active': hoveredPlaceId === place.id || selectedPlaceId === place.id },
          ]"
          :style="nearbyPlaceStyle(place)"
          :aria-label="nearbyPlaceAriaLabel(place)"
          type="button"
          @mouseenter="hoverPlace(place.id)"
          @mouseleave="clearHoveredPlace(place.id)"
          @focusin="hoverPlace(place.id)"
          @focusout="clearHoveredPlace(place.id)"
          @click.stop="emit('selectPlace', selectedPlaceId === place.id ? undefined : place.id)"
          @pointerdown.stop
          @contextmenu.stop.prevent="openPlaceContextMenu(place.id, $event)"
        >
          <span class="nearby-map__place-icon"><component :is="nearbyPlaceIcon(place)" :size="13" aria-hidden="true" /></span>
          <span v-if="props.showNearbyPlaceNames" class="nearby-map__place-name">{{ place.name }}</span>
          <PlaceTooltip
            v-if="hoveredPlaceId === place.id"
            :place="place"
            :placement="nearbyPlaceTooltipPlacement(place)"
            :type-label="nearbyPlaceTypeLabel(place)"
            :walking-minutes="nearbyPlaceWalkingMinutes(place, nearbyPlaceRoute(place))"
          />
        </button>
      </div>

      <TransitionGroup
        tag="div"
        class="nearby-map__markers"
        appear
        enter-active-class="nearby-map-marker-enter-active"
        appear-active-class="nearby-map-marker-enter-active"
        leave-active-class="nearby-map-marker-leave-active"
        move-class="nearby-map-marker-no-move"
      >
        <div
          v-for="(entry, index) in displayedStations"
          :key="entry.id"
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
                <LineIconBadge
                  v-if="shouldUseOfficialMarkerLogo(entry) && markerLine(entry)"
                  class="nearby-map__marker-line-icon"
                  :line="lineBadge(markerLine(entry)!)"
                  compact
                />
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
          >
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
              v-if="canToggleStationSchedule(entry)"
              class="nearby-map__schedule-toggle"
              type="button"
              :aria-pressed="markerScheduleState(entry) === 'visible'"
              :aria-label="scheduleToggleLabel(entry)"
              @click.stop="toggleStationSchedule(entry)"
            >
              <EyeOff v-if="markerScheduleState(entry) === 'visible'" :size="13" aria-hidden="true" />
              <Eye v-else :size="13" aria-hidden="true" />
              {{ scheduleToggleLabel(entry) }}
            </button>
            <span v-else-if="markerScheduleState(entry) === 'loading'" class="nearby-map__schedule-status">
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
                <LineIconBadge
                  v-if="markerLine(candidate.entry)"
                  class="nearby-map__marker-line-icon"
                  :line="lineBadge(markerLine(candidate.entry)!)"
                  compact
                />
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
          >
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
            <button
              v-if="canToggleStationSchedule(candidate.entry)"
              class="nearby-map__schedule-toggle"
              type="button"
              :aria-pressed="markerScheduleState(candidate.entry) === 'visible'"
              :aria-label="scheduleToggleLabel(candidate.entry)"
              @click.stop="toggleStationSchedule(candidate.entry)"
            >
              <EyeOff v-if="markerScheduleState(candidate.entry) === 'visible'" :size="13" aria-hidden="true" />
              <Eye v-else :size="13" aria-hidden="true" />
              {{ scheduleToggleLabel(candidate.entry) }}
            </button>
          </div>
        </div>
      </TransitionGroup>

      <div
        v-if="loading && !isPlacesPreview"
        class="nearby-map__loading"
        :style="{ top: `${NEARBY_MAP_TOP_CONTROL_RESERVE + 8}px` }"
        role="status"
      >{{ t('nearbyStations.scanning') }}</div>
      <button
        v-if="!isPlacesPreview && $slots['travel-sidebar']"
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
      v-if="!isPlacesPreview && travelPanelOpen && $slots['travel-sidebar']"
      class="nearby-map__travel-sidebar"
      @click.stop
      @pointerdown.stop
    >
      <slot name="travel-sidebar" />
    </aside>

    <div
      v-if="!isPlacesPreview"
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

    <aside v-if="!isPlacesPreview" class="nearby-map__sidebar" :aria-label="t('nearbyStations.stationDetailsAria')">
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
                @mouseenter="emit('hoverLine', line.id)"
                @mouseleave="emit('leaveLine', line.id)"
                @focus="emit('hoverLine', line.id)"
                @blur="emit('leaveLine', line.id)"
                @click.stop="focusStation(activeStation.id); emit('activateLine', line.id); emit('toggleLine', activeStation.id, line.id)"
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
        <button
          v-if="canToggleStationSchedule(activeStation)"
          class="nearby-map__schedule-sidebar-toggle"
          type="button"
          :aria-pressed="markerScheduleState(activeStation) === 'visible'"
          :aria-label="scheduleToggleLabel(activeStation)"
          @click.stop="toggleStationSchedule(activeStation)"
        >
          <EyeOff v-if="markerScheduleState(activeStation) === 'visible'" :size="15" aria-hidden="true" />
          <Eye v-else :size="15" aria-hidden="true" />
          {{ scheduleToggleLabel(activeStation) }}
        </button>
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
      <div v-else-if="!hasStationScheduleSlot" class="nearby-map__sidebar-empty">
        <MapPin :size="26" aria-hidden="true" />
        <strong>{{ t('nearbyStations.stationDetailsAria') }}</strong>
        <span>{{ t('nearbyStations.stationDetailsEmpty') }}</span>
      </div>
      <slot name="station-schedules" :active-station-id="activeStation?.id" :fullscreen="isFullscreen" />
      <slot name="city-pattern" />
    </aside>
    <slot v-if="!isPlacesPreview" name="line-trace-modal" />
    <slot v-if="!isPlacesPreview" name="traffic-modal" />
  </div>
</template>

<style scoped>
.nearby-map-shell { --nearby-map-height: clamp(520px, calc(100dvh - 80px), 820px); --nearby-sidebar-width: 310px; align-items: stretch; display: grid; gap: 0; grid-template-columns: minmax(0, 1fr) 12px minmax(260px, var(--nearby-sidebar-width)); position: relative; }
.nearby-map-shell--places-preview { --nearby-map-height: 100%; display: block; height: 100%; }
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
.nearby-map--satellite :deep(.transport-ghost-flow__path) { filter: drop-shadow(0 0 1px rgba(255,255,255,.88)); opacity: .92; }
.nearby-map--satellite :deep(.transport-ghost-flow__wave) { filter: drop-shadow(0 0 1px rgba(255,255,255,.88)); opacity: .98; }
.nearby-map--satellite :deep(.transport-ghost-flow__chevron) { filter: drop-shadow(0 0 1px rgba(255,255,255,.88)); opacity: 1; }
.nearby-map--isochrone .nearby-map__radius { background: transparent; border-color: rgba(72, 70, 255, .38); border-style: dashed; }
.nearby-map__air-quality-zones, .nearby-map__noise-zones { height: 100%; inset: 0; overflow: visible; pointer-events: none; position: absolute; width: 100%; z-index: 1; }
.nearby-map__air-quality-zone, .nearby-map__noise-zone { pointer-events: visiblePainted; shape-rendering: crispEdges; stroke-width: .5; transition: fill-opacity 140ms ease; vector-effect: non-scaling-stroke; }
.nearby-map__air-quality-zone[data-air-quality-level="1"] { fill: rgb(34 197 94); fill-opacity: .23; stroke: rgba(22, 130, 70, .3); }
.nearby-map__air-quality-zone[data-air-quality-level="2"] { fill: rgb(250 204 21); fill-opacity: .24; stroke: rgba(180, 137, 0, .3); }
.nearby-map__air-quality-zone[data-air-quality-level="3"] { fill: rgb(239 68 68); fill-opacity: .25; stroke: rgba(185, 28, 28, .32); }
.nearby-map__noise-zone[data-noise-level="1"] { fill: rgb(34 197 94); fill-opacity: .23; stroke: rgba(22, 130, 70, .3); }
.nearby-map__noise-zone[data-noise-level="2"] { fill: rgb(250 204 21); fill-opacity: .24; stroke: rgba(180, 137, 0, .3); }
.nearby-map__noise-zone[data-noise-level="3"] { fill: rgb(239 68 68); fill-opacity: .25; stroke: rgba(185, 28, 28, .32); }
.nearby-map__air-quality-zone:hover, .nearby-map__noise-zone:hover, .nearby-map__environment-zone--hovered { fill-opacity: .3; }
.nearby-map__walking-zones { height: 100%; inset: 0; overflow: visible; pointer-events: none; position: absolute; width: 100%; z-index: 2; }
.nearby-map__walking-zone { pointer-events: visiblePainted; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.nearby-map__walking-zone[data-walking-zone="5"] { fill: rgba(34, 197, 94, .29); stroke: rgba(22, 130, 70, .7); }
.nearby-map__walking-zone[data-walking-zone="10"] { fill: rgba(134, 239, 172, .27); stroke: rgba(62, 160, 93, .62); }
.nearby-map__walking-zone[data-walking-zone="15"] { fill: rgba(250, 204, 21, .24); stroke: rgba(180, 137, 0, .62); }
.nearby-map__walking-flow { height: 100%; inset: 0; overflow: visible; pointer-events: none; position: absolute; width: 100%; z-index: 3; }
.nearby-map__walking-flow-path { fill: none; stroke: #5146ff; stroke-dasharray: 2 8; stroke-linecap: round; stroke-width: 3; }
.nearby-map__walking-flow-node { fill: #fff; stroke: #5146ff; stroke-width: 2; }
.nearby-map__markers { display: contents; }
.nearby-map__top-control-zone { height: 74px; inset: 0 0 auto; pointer-events: none; position: absolute; z-index: 12; }
.nearby-map__primary-controls { display: flex; gap: 8px; position: absolute; right: 12px; top: 12px; z-index: 13; }
.nearby-map__fullscreen, .nearby-map__display-toggle, .nearby-map__basemap-toggle, .nearby-map__directory-toggle, .nearby-map__neighborhood-score-toggle, .nearby-map__isochrone-toggle, .nearby-map__noise-toggle, .nearby-map__air-quality-toggle { align-items: center; backdrop-filter: blur(5px); background: rgba(255,255,255,.92); border: 1px solid rgba(81,70,255,.18); border-radius: 10px; color: #4034df; display: flex; height: 38px; justify-content: center; padding: 0; position: absolute; top: 12px; width: 38px; z-index: 13; }
.nearby-map__primary-controls > .nearby-map__fullscreen, .nearby-map__primary-controls > .nearby-map__display-toggle, .nearby-map__primary-controls > .nearby-map__basemap-toggle, .nearby-map__primary-controls > .nearby-map__directory-toggle, .nearby-map__primary-controls > .nearby-map__neighborhood-score-toggle, .nearby-map__primary-controls > .nearby-map__isochrone-toggle, .nearby-map__primary-controls > .nearby-map__noise-toggle, .nearby-map__primary-controls > .nearby-map__air-quality-toggle { position: static; }
.nearby-map__fullscreen { right: 12px; }
.nearby-map__display-toggle { right: 58px; }
.nearby-map__basemap-toggle { right: 104px; }
.nearby-map__fullscreen:hover:not(:disabled), .nearby-map__fullscreen:focus-visible, .nearby-map__display-toggle:hover:not(:disabled), .nearby-map__display-toggle:focus-visible, .nearby-map__basemap-toggle:hover:not(:disabled), .nearby-map__basemap-toggle:focus-visible, .nearby-map__directory-toggle:hover:not(:disabled), .nearby-map__directory-toggle:focus-visible, .nearby-map__neighborhood-score-toggle:hover:not(:disabled), .nearby-map__neighborhood-score-toggle:focus-visible, .nearby-map__isochrone-toggle:hover:not(:disabled), .nearby-map__isochrone-toggle:focus-visible, .nearby-map__noise-toggle:hover:not(:disabled), .nearby-map__noise-toggle:focus-visible, .nearby-map__air-quality-toggle:hover:not(:disabled), .nearby-map__air-quality-toggle:focus-visible { background: #fff; color: #4034df; transform: none; }
.nearby-map__display-toggle[aria-expanded="true"] { background: #4034df; color: #fff; }
.nearby-map__basemap-toggle[aria-pressed="true"] { background: #4034df; color: #fff; }
.nearby-map__isochrone-toggle[aria-pressed="true"] { background: #17864c; border-color: rgba(23, 134, 76, .32); color: #fff; }
.nearby-map__noise-toggle[aria-pressed="true"] { background: #b74b24; border-color: rgba(183, 75, 36, .32); color: #fff; }
.nearby-map__air-quality-toggle[aria-pressed="true"] { background: #1976a8; border-color: rgba(25, 118, 168, .32); color: #fff; }
.nearby-map__basemap-attribution { backdrop-filter: blur(4px); background: rgba(255,255,255,.84); border: 1px solid rgba(100,116,139,.18); border-radius: 6px; bottom: 8px; color: #475569; font-size: .62rem; left: 8px; padding: 3px 6px; pointer-events: none; position: absolute; z-index: 12; }
.nearby-map__places-attribution { backdrop-filter: blur(4px); background: rgba(255,255,255,.84); border: 1px solid rgba(100,116,139,.18); border-radius: 6px; bottom: 8px; color: #475569; font-size: .58rem; left: 50%; padding: 3px 6px; pointer-events: none; position: absolute; transform: translateX(-50%); z-index: 12; }
.nearby-map__display-panel { background: #fff; border: 1px solid rgba(100, 116, 139, .24); border-radius: 14px; box-shadow: 0 8px 24px rgba(15, 23, 42, .18); overflow: hidden; position: absolute; right: 12px; top: 58px; width: min(270px, calc(100% - 24px)); z-index: 14; }
.nearby-map__display-panel-header { align-items: center; border-bottom: 1px solid rgba(100, 116, 139, .16); color: #18233f; display: flex; font-size: .76rem; font-weight: 850; justify-content: space-between; min-height: 38px; padding: 8px 11px; }
.nearby-map__display-panel-header span { align-items: center; display: inline-flex; gap: 7px; }
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
.nearby-map__isochrone-config-backdrop { align-items: center; background: rgba(15,23,42,.16); display: flex; inset: 0; justify-content: center; padding: 20px; position: absolute; z-index: 100; }
.nearby-map__isochrone-config-modal { background: rgba(255,255,255,.98); border: 1px solid rgba(81,70,255,.18); border-radius: 16px; box-shadow: 0 16px 42px rgba(15,23,42,.24); box-sizing: border-box; color: #334155; max-width: 370px; padding: 16px; width: 100%; }
.nearby-map__isochrone-config-header { align-items: flex-start; display: flex; gap: 12px; justify-content: space-between; }
.nearby-map__isochrone-config-heading { align-items: center; color: #17864c; display: flex; gap: 8px; }
.nearby-map__isochrone-config-heading h2 { color: #18233f; font-size: .92rem; line-height: 1.25; margin: 0; }
.nearby-map__isochrone-config-close { align-items: center; background: transparent; border: 0; border-radius: 7px; color: #64748b; display: flex; flex: 0 0 auto; height: 30px; justify-content: center; margin: -3px -3px 0 0; padding: 0; width: 30px; }
.nearby-map__isochrone-config-close:hover, .nearby-map__isochrone-config-close:focus-visible { background: #ebe9ff; color: #4034df; outline: 0; }
.nearby-map__isochrone-config-modal p { font-size: .76rem; line-height: 1.45; margin: 12px 0 16px; }
.nearby-map__isochrone-config-actions { display: flex; gap: 8px; justify-content: flex-end; }
.nearby-map__isochrone-config-actions button { border: 1px solid transparent; border-radius: 8px; font: inherit; font-size: .72rem; font-weight: 820; min-height: 32px; padding: 5px 10px; }
.nearby-map__isochrone-config-secondary { background: #f8fafc; border-color: rgba(100,116,139,.22) !important; color: #475569; }
.nearby-map__isochrone-config-primary { background: #4034df; color: #fff; }
.nearby-map__isochrone-config-secondary:hover, .nearby-map__isochrone-config-secondary:focus-visible { background: #eef2ff; color: #4034df; outline: 0; }
.nearby-map__isochrone-config-primary:hover, .nearby-map__isochrone-config-primary:focus-visible { background: #3026c8; outline: 0; }
.nearby-map__isochrone-tooltip { align-items: center; backdrop-filter: blur(6px); background: rgba(255,255,255,.96); border: 1px solid rgba(51,65,85,.2); border-radius: 9px; box-shadow: 0 7px 18px rgba(16,35,63,.2); box-sizing: border-box; color: #343a40; display: inline-flex; font-size: .7rem; font-weight: 820; gap: 7px; line-height: 1.3; max-width: min(250px, calc(100% - 24px)); padding: 8px 10px; pointer-events: none; position: absolute; white-space: normal; z-index: 16; }
.nearby-map__isochrone-tooltip span { min-width: 0; }
.nearby-map__isochrone-tooltip i { border: 1px solid rgba(51,65,85,.24); border-radius: 4px; display: block; flex: 0 0 auto; height: 12px; width: 12px; }
.nearby-map__isochrone-tooltip i[data-walking-zone="5"] { background: rgba(34,197,94,.55); }
.nearby-map__isochrone-tooltip i[data-walking-zone="10"] { background: rgba(134,239,172,.62); }
.nearby-map__isochrone-tooltip i[data-walking-zone="15"] { background: rgba(250,204,21,.62); }
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
.nearby-map__radius { background: rgba(72, 70, 255, .09); border: 2px solid rgba(72, 70, 255, .58); border-radius: 50%; pointer-events: none; position: absolute; transform: translate(-50%, -50%); z-index: 2; }
.nearby-map__origin { align-items: center; background: #d92d20; border: 3px solid #fff; border-radius: 50% 50% 50% 0; box-shadow: 0 6px 16px rgba(146, 34, 26, .34); color: #fff; display: flex; height: 38px; justify-content: center; position: absolute; transform: translate(-50%, -70%) rotate(-45deg); width: 38px; z-index: 4; }
.nearby-map__origin svg { transform: rotate(45deg); }
.nearby-map__places { display: contents; }
.nearby-map__place { align-items: center; background: transparent; border: 0; color: #334155; display: flex; flex-direction: column; gap: 2px; max-width: 110px; padding: 0; position: absolute; transform: translate(-50%, -50%); z-index: 3; }
.nearby-map__place:hover, .nearby-map__place:focus-visible, .nearby-map__place--active { color: #18233f; outline: 0; transform: translate(-50%, -50%) scale(1.06); z-index: 60; }
.nearby-map-shell--places-preview .nearby-map__place--active .nearby-map__place-icon { background: #5146ff; border-color: #fff; box-shadow: 0 0 0 4px rgba(81,70,255,.2),0 6px 16px rgba(16,35,63,.2); color: #fff; transform: scale(1.2); }
.nearby-map__place-icon { align-items: center; background: #fff; border: 1px solid rgba(51,65,85,.2); border-radius: 50%; box-shadow: 0 2px 6px rgba(15,23,42,.18); color: #475569; display: flex; height: 24px; justify-content: center; width: 24px; }
.nearby-map__place--shop .nearby-map__place-icon { color: #2563eb; }
.nearby-map__place--food .nearby-map__place-icon { color: #d97706; }
.nearby-map__place--culture .nearby-map__place-icon, .nearby-map__place--attraction .nearby-map__place-icon { color: #7c3aed; }
.nearby-map__place-name { background: rgba(255,255,255,.88); border-radius: 4px; box-shadow: 0 1px 3px rgba(15,23,42,.12); font-size: .58rem; font-weight: 760; line-height: 1.1; max-width: 110px; overflow: hidden; padding: 2px 4px; text-overflow: ellipsis; white-space: nowrap; }
.nearby-map__marker-body { display: inline-block; height: max-content; position: relative; width: max-content; }
.nearby-map__marker-anchor { position: absolute; transform: translate(-50%, -50%); z-index: 5; }
.nearby-map__marker-anchor--active { z-index: 60 !important; }
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
.nearby-map__marker--official:hover:not(:disabled) .nearby-map__marker-line-icon :deep(img), .nearby-map__marker--official:focus-visible .nearby-map__marker-line-icon :deep(img) { filter: drop-shadow(0 0 4px rgba(255, 255, 255, .9)); transform: scale(1.1); }
.nearby-map__marker :deep(svg) { transition: filter 150ms ease, transform 150ms ease; }
.nearby-map__marker-content { align-items: center; display: inline-flex; justify-content: center; position: relative; transform-origin: center; z-index: 1; }
.nearby-map__marker-ripple { animation: nearby-map-current-marker-ripple 2.6s cubic-bezier(.16,1,.3,1) infinite; background: color-mix(in srgb, var(--nearby-marker-color, #0064ff), transparent 64%); border-radius: 50%; inset: 0; opacity: 0; pointer-events: none; position: absolute; transform: scale(.55); transform-box: fill-box; transform-origin: center; z-index: 0; }
.nearby-map__marker-ripple--delayed { animation-delay: 1.25s; }
.nearby-map__marker--pinned .nearby-map__marker-content { animation: nearby-map-current-marker-breathe 2.2s ease-in-out infinite; filter: drop-shadow(0 2px 4px rgba(16, 35, 63, .22)) drop-shadow(0 0 8px color-mix(in srgb, var(--nearby-marker-color, #0064ff), transparent 38%)); }
.nearby-map__marker-station-name { background: rgba(255, 255, 255, .96); border: 1px solid rgba(16, 35, 63, .14); border-radius: 7px; bottom: calc(100% + 7px); box-shadow: 0 4px 12px rgba(16, 35, 63, .2); box-sizing: border-box; color: var(--ink); display: grid; font-size: .74rem; font-weight: 850; gap: 5px; left: 50%; max-width: min(260px, calc(100vw - 32px)); min-width: 132px; overflow: hidden; padding: 7px 9px 8px; pointer-events: auto; position: absolute; text-align: center; transform: translateX(-50%); width: max-content; white-space: nowrap; z-index: 20; }
.nearby-map__marker-anchor--tooltip-left .nearby-map__marker-station-name { left: auto; right: 0; transform: none; }
.nearby-map__marker-anchor--tooltip-right .nearby-map__marker-station-name { left: 0; transform: none; }
.nearby-map__marker-anchor--tooltip-below .nearby-map__marker-station-name { bottom: auto; top: calc(100% + 7px); }
.nearby-map__marker-anchor--tooltip-above .nearby-map__marker-station-name { bottom: calc(100% + 7px); top: auto; }
.nearby-map__marker-station-title { overflow: hidden; text-overflow: ellipsis; }
.nearby-map__marker-station-meta { align-items: center; color: var(--muted); display: flex; font-size: .67rem; font-weight: 850; gap: 6px; justify-content: center; line-height: 1.1; }
.nearby-map__marker-meta-separator { color: var(--muted); }
.nearby-map__marker-walking-time { align-items: center; color: #5146ff; display: inline-flex; gap: 3px; }
.nearby-map__schedule-toggle, .nearby-map__schedule-sidebar-toggle { align-items: center; background: #ebe9ff; border: 1px solid rgba(81,70,255,.2); border-radius: 7px; color: #4034df; display: inline-flex; font-size: .65rem; gap: 4px; justify-content: center; min-height: 28px; padding: 5px 7px; }
.nearby-map__schedule-toggle:hover, .nearby-map__schedule-toggle:focus-visible, .nearby-map__schedule-sidebar-toggle:hover, .nearby-map__schedule-sidebar-toggle:focus-visible { background: #4034df; color: #fff; outline: 0; }
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
.nearby-map-marker-enter-active { animation: nearby-station-pop 420ms cubic-bezier(.18,.8,.28,1.3) both; animation-delay: var(--station-pop-delay); }
.nearby-map-marker-leave-active { animation: nearby-station-pop-out 420ms cubic-bezier(.18,.8,.28,1.3) both; pointer-events: none; }
.nearby-map-marker-no-move { transition: none !important; }
.nearby-map__marker-body > .nearby-map__marker { position: relative; transform: none; }
.nearby-map__marker-body > .nearby-map__marker--bus { transform: scale(.85); }
.nearby-map__marker-body > .nearby-map__marker:hover:not(:disabled),
.nearby-map__marker-body > .nearby-map__marker:focus-visible { transform: scale(1.1); }
.nearby-map__marker-check { align-items: center; background: #fff; border: 2px solid #17864c; border-radius: 50%; bottom: -7px; color: #17864c; display: flex; height: 18px; justify-content: center; position: absolute; right: -7px; top: auto; width: 18px; z-index: 2; }
.nearby-map__line-count { align-items: center; background: #fff; border: 2px solid var(--nearby-marker-color, #5146ff); border-radius: 50%; bottom: -7px; box-shadow: 0 2px 6px rgba(16, 35, 63, .24); color: var(--nearby-marker-color, #5146ff); display: flex; font-size: .64rem; font-weight: 900; height: 18px; justify-content: center; line-height: 1; min-width: 18px; padding: 0; position: absolute; right: -7px; width: 18px; z-index: 3; }
.nearby-map__sidebar { align-self: stretch; background: #fff; border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 8px 22px rgba(16,35,63,.07); box-sizing: border-box; display: flex; flex-direction: column; height: var(--nearby-map-height); min-height: 0; min-width: 0; overflow: auto; padding: 16px; }
.nearby-map__sidebar > :deep(.nearby-schedule-panel) { flex: 1 1 0; grid-template-rows: auto minmax(0, 1fr); height: auto; min-height: 0; overflow: hidden; }
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
.nearby-map__schedule-sidebar-toggle { width: 100%; }
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
@keyframes nearby-map-feeder-pulse-ring { 0% { opacity: .78; transform: scale(.72); } 68% { opacity: .08; transform: scale(1.55); } 100% { opacity: 0; transform: scale(1.7); } }
@keyframes nearby-station-pop { 0% { opacity: 0; transform: translate(-50%, calc(-50% + 10px)) scale(.85); } 70% { opacity: 1; transform: translate(-50%, -50%) scale(1.06); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
@keyframes nearby-station-pop-out { 0% { transform: translate(-50%, -50%) scale(1); } 30% { transform: translate(-50%, -50%) scale(1.06); } 100% { opacity: 0; transform: translate(-50%, calc(-50% + 10px)) scale(.85); } }
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
  .nearby-map__marker--pinned .nearby-map__marker-ripple { animation: none; opacity: .42; transform: scale(1.8); }
  .nearby-map__marker--pinned .nearby-map__marker-content { animation: none; filter: none; transform: scale(1.45); }
  .nearby-map-marker-enter-active { animation: none; }
  .nearby-map-marker-leave-active { animation: none; opacity: 0; }
  .nearby-map__marker--feeder-pulse::before { animation: none; opacity: .72; transform: scale(1.1); }
}
</style>
