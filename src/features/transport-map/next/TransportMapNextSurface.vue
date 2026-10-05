<template>
  <div
    class="transport-map-next-surface"
    data-transport-map-next-surface
    :data-maplibre-status="status"
  >
    <div ref="mapElement" class="transport-map-next-surface__map" aria-hidden="true" />
    <div v-if="status === 'unsupported'" class="transport-map-next-surface__notice" role="alert">
      <p>{{ t("globalMap.page.next.webglUnsupported") }}</p>
      <NuxtLink to="/map/legacy">{{ t("globalMap.page.next.useClassic") }}</NuxtLink>
    </div>
    <div v-else-if="basemapUnavailable" class="transport-map-next-surface__notice transport-map-next-surface__notice--warning" role="status">
      {{ t("globalMap.page.next.basemapUnavailable") }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import type { NearbyPlace } from "../../nearby-stations/nearbyPlaces";
import { createDeckNearbyPlacesLayer, prepareDeckNearbyPlaces, NEARBY_PLACES_LAYER_ID, type DeckNearbyPlace } from "./deckNearbyPlaces";
import {
  DVF_MAP_PURCHASE_POINTS_MIN_ZOOM,
  loadDvfMapPurchasePointCityCodes,
  loadDvfMapPurchasePoints,
  type DvfMapGridCell,
} from "../../../services/real-estate/realEstateMapLayer";
import type { DvfPurchasePoint, DvfRentalEstimate } from "../../../services/real-estate/compiledRealEstate";
import type { DvfMapMetricCell, DvfMapMetricMode, DvfMapMetricRange } from "./deckRealEstateLayer";
import {
  createDvfMapMetricCells,
  createDeckRealEstateMetricLayer,
  createDeckRealEstateMetricPurchasePointsLayer,
  createDeckRealEstateMetricPurchasePointHoverLayers,
  getDvfMapMetricValue,
  interpolateDvfMapMetricValue,
  normalizeDvfMapMetricValue,
  REAL_ESTATE_PRICE_LAYER_ID,
  REAL_ESTATE_PURCHASE_POINTS_LAYER_ID,
  type DvfMapPurchasePointMark,
} from "./deckRealEstateLayer";
import {
  findRealEstateCellsWithinRadius,
  findNearestRealEstateCell,
  selectRealEstateViewportCells,
} from "../real-estate/realEstateViewportSelection";
import {
  DVF_METRIC_INTERPOLATION_RADIUS_METERS,
  getDvfMetricInterpolationRadiusCssPixels,
} from "../real-estate/realEstateGridGeometry";
import { Map as MapLibreMap, setWorkerUrl, type IControl } from "maplibre-gl";
import mapLibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { useRuntimeConfig } from "nuxt/app";
import type { CameraState } from "../geo/camera";
import type { TransportMapDeckMetrics, TransportMapRenderer } from "../contracts/renderer";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../config/globalTransportPlanConfig";
import { useI18n } from "../../../i18n";
import {
  applyMapLibreLabelLocale,
  diagnoseVectorStyle,
  normalizeMapLibreReferenceFilters,
  type MapLibreLabelStyleAdapter,
  resolveNextMapStyle,
  type NextMapStyle,
} from "./nextMapConfig";
import { firstSymbolLayerId, MapLibreDeckOverlayPresenter } from "./deckMapPresenter";
import { cameraStateToMapLibreView } from "./nextMapCamera";
import { screenToLonLat, visibleWorldBounds, worldToLonLat } from "../geo/coordinateKernel";
import {
  TransportMapMapLibreTraceProbe,
  type TransportMapMapLibreTraceMap,
} from "../performance/transportMapMapLibreTrace";
import type { TransportMapPerformanceTrace } from "../performance/transportMapPerformanceTrace";
import "maplibre-gl/dist/maplibre-gl.css";

type SurfaceStatus = "initializing" | "ready" | "unsupported";
const EMPTY_REAL_ESTATE_CELLS: readonly DvfMapGridCell[] = [];

const props = defineProps<{
  renderer: TransportMapRenderer;
  camera: CameraState;
  nearbyPlaces?: readonly NearbyPlace[];
  realEstateCells?: readonly DvfMapGridCell[];
  realEstateMetricRange?: DvfMapMetricRange;
  realEstateMetricMode?: DvfMapMetricMode;
  realEstateRentalEstimatesByCityCode?: Readonly<Record<string, DvfRentalEstimate>>;
  realEstateColorTransitions?: boolean;
  reduceMotion?: boolean;
  styleUrl?: NextMapStyle;
  interleaved?: boolean;
  antialias?: boolean;
  performanceTrace?: TransportMapPerformanceTrace;
}>();
const emit = defineEmits<{ ready: [] }>();

const { locale, t } = useI18n();
const runtimeConfig = useRuntimeConfig();
const mapElement = ref<HTMLElement>();
const status = ref<SurfaceStatus>("initializing");
const basemapUnavailable = ref(false);
const systemReducedMotion = ref(false);
const realEstateInterpolationRadiusPixels = ref(getCurrentInterpolationRadiusPixels());
const realEstateViewportCells = shallowRef<readonly DvfMapGridCell[]>(
  props.realEstateCells?.length
    ? selectRealEstateViewportCells(
      props.realEstateCells,
      props.camera,
      realEstateInterpolationRadiusPixels.value,
    )
    : EMPTY_REAL_ESTATE_CELLS,
);
const realEstatePurchasePointZoomEnabled = ref(props.camera.zoom >= DVF_MAP_PURCHASE_POINTS_MIN_ZOOM);
const realEstateBeforeId = ref<string>();
const realEstatePurchasePoints = shallowRef<readonly DvfMapPurchasePointMark[]>([]);
const hoveredRealEstatePurchasePoint = shallowRef<DvfMapPurchasePointMark>();
const realEstateTransitionDurationMs = computed(() =>
  props.reduceMotion || systemReducedMotion.value || props.realEstateColorTransitions === false
    ? 0
    : 800,
);
const realEstateMetricCells = computed<readonly DvfMapMetricCell[]>(() => {
  const range = props.realEstateMetricRange;
  if (!range) return [];
  const mode = props.realEstateMetricMode ?? "price";
  const estimates = props.realEstateRentalEstimatesByCityCode ?? {};
  return createDvfMapMetricCells(realEstateViewportCells.value, mode, range, estimates);
});
const realEstateTransitionFromCells = shallowRef<readonly DvfMapMetricCell[]>(realEstateMetricCells.value);
const realEstateTransitionToCells = shallowRef<readonly DvfMapMetricCell[]>(realEstateMetricCells.value);
const realEstateTransitionFromRange = shallowRef<DvfMapMetricRange | undefined>(props.realEstateMetricRange);
const realEstateTransitionToRange = shallowRef<DvfMapMetricRange | undefined>(props.realEstateMetricRange);
const realEstateTransitionProgress = ref(1);
const realEstateActiveMetricCells = shallowRef<readonly DvfMapMetricCell[]>(realEstateMetricCells.value);
const realEstateActiveMetricRange = shallowRef<DvfMapMetricRange | undefined>(props.realEstateMetricRange);
const realEstateMetricValuesByCoordinate = computed(() => new Map(
  realEstateMetricCells.value.map((cell) => [`${cell.lon},${cell.lat}`, cell.metricValue] as const),
));
const realEstatePurchasePointsForMetric = computed<readonly DvfMapPurchasePointMark[]>(() => {
  const mode = props.realEstateMetricMode ?? "price";
  const range = props.realEstateMetricRange;
  const estimates = props.realEstateRentalEstimatesByCityCode ?? {};
  return realEstatePurchasePoints.value.map((point) => {
    const context = point.context;
    const value = context && range
      ? mode === "liquidity"
        ? realEstateMetricValuesByCoordinate.value.get(`${context.lon},${context.lat}`)
          ?? getDvfMapMetricValue(context, mode, estimates)
        : getDvfMapMetricValue(context, mode, estimates)
      : undefined;
    return {
      ...point,
      ...(mode === "liquidity" && context && value !== undefined
        ? { context: { ...context, transactionCount: value } }
        : {}),
      ...(value !== undefined && range
        ? { normalizedMetric: normalizeDvfMapMetricValue(value, range) }
        : { normalizedMetric: undefined }),
    };
  });
});
const hoveredRealEstatePurchasePointForMetric = computed(() => {
  const hoveredId = hoveredRealEstatePurchasePoint.value?.id;
  return hoveredId
    ? realEstatePurchasePointsForMetric.value.find((point) => point.id === hoveredId)
    : undefined;
});
const realEstatePurchasePointsByCity = new Map<string, readonly DvfPurchasePoint[]>();
let realEstatePurchasePointsTimer: ReturnType<typeof setTimeout> | undefined;
let realEstatePurchasePointsRevision = 0;
let map: MapLibreMap | undefined;
let overlay: MapboxOverlay | undefined;
let presenter: MapLibreDeckOverlayPresenter | undefined;
let overlayAdded = false;
let fallbackStyleAttempted = false;
let mapResizeObserver: ResizeObserver | undefined;
let mapLibreTraceProbe: TransportMapMapLibreTraceProbe | undefined;
let detachMapLibreTraceProbe: (() => void) | undefined;
let reducedMotionMediaQuery: MediaQueryList | undefined;
let realEstateMetricTransitionFrame: number | undefined;
let lastRealEstateMetricMode = props.realEstateMetricMode ?? "price";
let applyingMapLocale = false;

function onReducedMotionChange(event: MediaQueryListEvent): void {
  systemReducedMotion.value = event.matches;
}

function cancelRealEstateMetricTransition(): void {
  if (realEstateMetricTransitionFrame !== undefined) {
    cancelAnimationFrame(realEstateMetricTransitionFrame);
    realEstateMetricTransitionFrame = undefined;
  }
}

function setRealEstateMetricTransitionTarget(
  cells: readonly DvfMapMetricCell[],
  range: DvfMapMetricRange | undefined,
): void {
  cancelRealEstateMetricTransition();
  realEstateActiveMetricCells.value = cells;
  realEstateActiveMetricRange.value = range;
  realEstateTransitionFromCells.value = cells;
  realEstateTransitionToCells.value = cells;
  realEstateTransitionFromRange.value = range;
  realEstateTransitionToRange.value = range;
  realEstateTransitionProgress.value = 1;
}

function animateRealEstateMetricTransition(
  fromCells: readonly DvfMapMetricCell[],
  fromRange: DvfMapMetricRange | undefined,
  toCells: readonly DvfMapMetricCell[],
  toRange: DvfMapMetricRange | undefined,
): void {
  const duration = realEstateTransitionDurationMs.value;
  if (duration <= 0 || !fromCells.length || !toCells.length) {
    setRealEstateMetricTransitionTarget(toCells, toRange);
    return;
  }

  cancelRealEstateMetricTransition();
  realEstateActiveMetricCells.value = toCells;
  realEstateActiveMetricRange.value = toRange;
  realEstateTransitionFromCells.value = fromCells;
  realEstateTransitionToCells.value = toCells;
  realEstateTransitionFromRange.value = fromRange;
  realEstateTransitionToRange.value = toRange;
  realEstateTransitionProgress.value = 0;

  const startedAt = performance.now();
  const tick = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    realEstateTransitionProgress.value = progress;
    if (progress >= 1) {
      realEstateTransitionFromCells.value = toCells;
      realEstateTransitionFromRange.value = toRange;
      realEstateMetricTransitionFrame = undefined;
      return;
    }
    realEstateMetricTransitionFrame = requestAnimationFrame(tick);
  };
  realEstateMetricTransitionFrame = requestAnimationFrame(tick);
}

watch(() => ({
  mode: props.realEstateMetricMode ?? "price",
  cells: realEstateMetricCells.value,
  range: props.realEstateMetricRange,
}), ({ mode, cells, range }) => {
  if (mode !== lastRealEstateMetricMode) {
    lastRealEstateMetricMode = mode;
    animateRealEstateMetricTransition(
      realEstateActiveMetricCells.value,
      realEstateActiveMetricRange.value,
      cells,
      range,
    );
    return;
  }
  setRealEstateMetricTransitionTarget(cells, range);
}, { flush: "post" });

watch(realEstateTransitionDurationMs, (duration) => {
  if (duration === 0) {
    setRealEstateMetricTransitionTarget(
      realEstateActiveMetricCells.value,
      realEstateActiveMetricRange.value,
    );
  }
});

// This computed never reads camera: panning neither prepares POIs nor updates
// Deck data/accessors. The presenter retains the same layer and GPU buffers.
const nearbyPlaceLayers = computed(() => {
  const data = prepareDeckNearbyPlaces(props.nearbyPlaces ?? []);
  return data.length ? [createDeckNearbyPlacesLayer(data)] : [];
});
watch(nearbyPlaceLayers, layers => presenter?.setNearbyPlaceLayers(layers));

const realEstateLayers = computed(() => {
  const cells = realEstateViewportCells.value;
  if (!cells?.length) return [];
  const mode = props.realEstateMetricMode ?? "price";
  const progress = realEstateTransitionProgress.value;
  const transitioning = progress < 1;
  const fromLayer = transitioning && realEstateTransitionFromRange.value
    ? createDeckRealEstateMetricLayer(
      realEstateTransitionFromCells.value,
      realEstateTransitionFromRange.value,
      realEstateInterpolationRadiusPixels.value,
      0.78 * (1 - progress),
      `${REAL_ESTATE_PRICE_LAYER_ID}-transition-from`,
      realEstateBeforeId.value,
      props.antialias ?? true,
    )
    : undefined;
  const toLayer = realEstateTransitionToRange.value
    ? createDeckRealEstateMetricLayer(
      realEstateTransitionToCells.value,
      realEstateTransitionToRange.value,
      realEstateInterpolationRadiusPixels.value,
      0.78 * (transitioning ? progress : 1),
      REAL_ESTATE_PRICE_LAYER_ID,
      realEstateBeforeId.value,
      props.antialias ?? true,
    )
    : undefined;
  const metricLayers = [
    ...(fromLayer ? [fromLayer] : []),
    ...(toLayer ? [toLayer] : []),
  ];
  if (!realEstatePurchasePointZoomEnabled.value || !realEstatePurchasePoints.value.length) return metricLayers;

  return [
    ...metricLayers,
    createDeckRealEstateMetricPurchasePointsLayer(
      realEstatePurchasePointsForMetric.value,
      mode,
      realEstateTransitionDurationMs.value,
      realEstateBeforeId.value,
    ),
    ...createDeckRealEstateMetricPurchasePointHoverLayers(
      hoveredRealEstatePurchasePointForMetric.value,
      mode,
      realEstateTransitionDurationMs.value,
      realEstateBeforeId.value,
    ),
  ];
});
watch(realEstateLayers, layers => presenter?.setRealEstateLayers(layers));
watch(() => props.camera, updateRealEstateViewportCells, { immediate: true, flush: "post" });
watch(() => props.realEstateCells, updateRealEstateViewportCells, { immediate: true, flush: "post" });
watch(() => props.camera.zoom >= DVF_MAP_PURCHASE_POINTS_MIN_ZOOM, (enabled) => {
  realEstatePurchasePointZoomEnabled.value = enabled;
});

function scheduleRealEstatePurchasePointsLoad(): void {
  if (realEstatePurchasePointsTimer) clearTimeout(realEstatePurchasePointsTimer);
  const revision = ++realEstatePurchasePointsRevision;

  if (props.camera.zoom < DVF_MAP_PURCHASE_POINTS_MIN_ZOOM || !props.realEstateCells?.length) {
    realEstatePurchasePointsByCity.clear();
    realEstatePurchasePoints.value = [];
    hoveredRealEstatePurchasePoint.value = undefined;
    return;
  }

  realEstatePurchasePointsTimer = setTimeout(() => {
    updateVisibleRealEstatePurchasePoints();
    void loadVisibleRealEstatePurchasePoints(revision);
  }, 120);
}

function updateRealEstateViewportCells(): void {
  const source = props.realEstateCells;
  const nextRadius = getCurrentInterpolationRadiusPixels();
  if (Math.abs(nextRadius - realEstateInterpolationRadiusPixels.value) > 0.001) {
    realEstateInterpolationRadiusPixels.value = nextRadius;
  }
  const next = source?.length
    ? selectRealEstateViewportCells(source, props.camera, realEstateInterpolationRadiusPixels.value)
    : EMPTY_REAL_ESTATE_CELLS;
  if (realEstateViewportCells.value === next) return;
  realEstateViewportCells.value = next;
  props.performanceTrace?.instant("real_estate_cell_selection", {
    selectedCellCount: next.length,
    totalCellCount: source?.length ?? 0,
    zoom: props.camera.zoom,
  });
}

function getCurrentInterpolationRadiusPixels(): number {
  const latitude = worldToLonLat({
    x: props.camera.centerWorldX,
    y: props.camera.centerWorldY,
  }).lat;
  // Quantization avoids rebuilding the GPU texture on every pan/zoom frame.
  return getDvfMetricInterpolationRadiusCssPixels(
    Math.round(props.camera.zoom * 4) / 4,
    Math.round(latitude * 4) / 4,
  );
}

async function loadVisibleRealEstatePurchasePoints(revision: number): Promise<void> {
  const cells = props.realEstateCells;
  if (props.camera.zoom < DVF_MAP_PURCHASE_POINTS_MIN_ZOOM || !cells?.length) return;

  const bounds = getVisibleRealEstateBounds();
  if (!bounds) return;
  const cityCodes = await loadDvfMapPurchasePointCityCodes({
    minLongitude: bounds.minLongitude - 0.005,
    minLatitude: bounds.minLatitude - 0.005,
    maxLongitude: bounds.maxLongitude + 0.005,
    maxLatitude: bounds.maxLatitude + 0.005,
  });
  if (revision !== realEstatePurchasePointsRevision || props.camera.zoom < DVF_MAP_PURCHASE_POINTS_MIN_ZOOM) return;
  if (!cityCodes.length) return;

  const loaded = await Promise.allSettled(cityCodes.map(async (cityCode) => ({
    cityCode,
    points: await loadDvfMapPurchasePoints(cityCode),
  })));
  if (revision !== realEstatePurchasePointsRevision || props.camera.zoom < DVF_MAP_PURCHASE_POINTS_MIN_ZOOM) return;

  for (const result of loaded) {
    if (result.status !== "fulfilled") continue;
    realEstatePurchasePointsByCity.delete(result.value.cityCode);
    realEstatePurchasePointsByCity.set(result.value.cityCode, result.value.points);
  }
  while (realEstatePurchasePointsByCity.size > 12) {
    realEstatePurchasePointsByCity.delete(realEstatePurchasePointsByCity.keys().next().value as string);
  }
  updateVisibleRealEstatePurchasePoints();
}

function updateVisibleRealEstatePurchasePoints(): void {
  if (props.camera.zoom < DVF_MAP_PURCHASE_POINTS_MIN_ZOOM) {
    realEstatePurchasePoints.value = [];
    hoveredRealEstatePurchasePoint.value = undefined;
    return;
  }
  const bounds = getVisibleRealEstateBounds();
  if (!bounds) {
    realEstatePurchasePoints.value = [];
    hoveredRealEstatePurchasePoint.value = undefined;
    return;
  }

  const cells = props.realEstateCells ?? EMPTY_REAL_ESTATE_CELLS;
  const points: DvfMapPurchasePointMark[] = [];
  for (const [cityCode, cityPoints] of realEstatePurchasePointsByCity) {
    for (let index = 0; index < cityPoints.length; index += 1) {
      const point = cityPoints[index]!;
      if (point[0] >= bounds.minLongitude && point[0] <= bounds.maxLongitude
        && point[1] >= bounds.minLatitude && point[1] <= bounds.maxLatitude) {
        const context = findNearestRealEstateCell(cells, point[0], point[1], cityCode);
        points.push({
          id: `${cityCode}:${index}`,
          cityCode,
          coordinates: point,
          ...(context ? { context } : {}),
        });
      }
    }
  }
  realEstatePurchasePoints.value = points;
  const selectedId = hoveredRealEstatePurchasePoint.value?.id;
  hoveredRealEstatePurchasePoint.value = selectedId
    ? points.find((point) => point.id === selectedId)
    : undefined;
}

function getVisibleRealEstateBounds(): {
  minLongitude: number;
  maxLongitude: number;
  minLatitude: number;
  maxLatitude: number;
} | undefined {
  const visible = visibleWorldBounds(props.camera);
  const minX = Math.max(0, visible.minX);
  const maxX = Math.min(1, visible.maxX);
  const minY = Math.max(0, visible.minY);
  const maxY = Math.min(1, visible.maxY);
  if (minX > maxX || minY > maxY) return undefined;
  const corners = [
    worldToLonLat({ x: minX, y: minY }),
    worldToLonLat({ x: maxX, y: maxY }),
  ] as const;
  if (!corners.every((point) => Number.isFinite(point.lon) && Number.isFinite(point.lat))) return undefined;
  return {
    minLongitude: Math.min(corners[0].lon, corners[1].lon),
    maxLongitude: Math.max(corners[0].lon, corners[1].lon),
    minLatitude: Math.min(corners[0].lat, corners[1].lat),
    maxLatitude: Math.max(corners[0].lat, corners[1].lat),
  };
}

watch(() => props.camera, scheduleRealEstatePurchasePointsLoad, { immediate: true, flush: "post" });
watch(() => props.realEstateCells, scheduleRealEstatePurchasePointsLoad, { flush: "post" });

function pickNearbyPlace(x: number, y: number): NearbyPlace | undefined {
  if (!overlay || !nearbyPlaceLayers.value.length) return undefined;
  const hit = overlay.pickObject({ x, y, layerIds: [NEARBY_PLACES_LAYER_ID] });
  return (hit?.object as DeckNearbyPlace | undefined)?.place;
}

function estimateRealEstateMetricAt(x: number, y: number): number | undefined {
  const cells = props.realEstateCells;
  if (!cells?.length || !props.realEstateMetricRange) return undefined;
  const point = screenToLonLat({ x, y }, props.camera);
  const candidates = findRealEstateCellsWithinRadius(
    cells,
    point.lon,
    point.lat,
    DVF_METRIC_INTERPOLATION_RADIUS_METERS,
  );
  return interpolateDvfMapMetricValue(
    candidates,
    props.realEstateMetricMode ?? "price",
    props.realEstateRentalEstimatesByCityCode ?? {},
  );
}

function pickRealEstatePurchasePoint(x: number, y: number): DvfMapPurchasePointMark | undefined {
  if (!overlay || !realEstatePurchasePointZoomEnabled.value || !realEstatePurchasePoints.value.length) {
    hoveredRealEstatePurchasePoint.value = undefined;
    return undefined;
  }
  const hit = overlay.pickObject({ x, y, layerIds: [REAL_ESTATE_PURCHASE_POINTS_LAYER_ID] });
  const mark = hit?.object as DvfMapPurchasePointMark | undefined;
  if (hoveredRealEstatePurchasePoint.value?.id !== mark?.id) {
    hoveredRealEstatePurchasePoint.value = mark;
  }
  return mark;
}

function clearRealEstatePurchasePointHover(): void {
  hoveredRealEstatePurchasePoint.value = undefined;
}

defineExpose({
  pickNearbyPlace,
  pickRealEstatePurchasePoint,
  estimateRealEstateMetricAt,
  clearRealEstatePurchasePointHover,
});

type MapLibreDeckCompatibility = MapLibreMap & {
  painter?: { transform?: unknown };
  transform?: unknown;
};

const FALLBACK_VECTOR_SURFACE_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: "transport-map-next-background", type: "background", paint: { "background-color": "#eef2f4" } }],
};

function onMapError(): void {
  // Tile/style failures should not tear down the business overlays. Keep the
  // MapLibre canvas mounted so a later retry/cache hit can recover in place.
  basemapUnavailable.value = true;
  // A style fetch can fail before MapLibre emits `load`, which would
  // otherwise prevent the Deck overlay from ever becoming a transport render
  // target. Install one local background-only style and let the normal load
  // path attach Deck; this is not a raster fallback.
  if (!fallbackStyleAttempted && map && !overlay && !map.isStyleLoaded()) {
    fallbackStyleAttempted = true;
    map.setStyle(FALLBACK_VECTOR_SURFACE_STYLE as never);
  }
}

function onContextLost(): void {
  basemapUnavailable.value = true;
}

function onContextRestored(): void {
  basemapUnavailable.value = false;
  presenter?.refresh();
  map?.triggerRepaint();
}

function applyMapLocale(): void {
  const activeMap = map;
  if (!activeMap || !activeMap.isStyleLoaded() || applyingMapLocale) return;

  applyingMapLocale = true;
  let changed = 0;
  try {
    changed = applyMapLibreLabelLocale(
      activeMap as unknown as MapLibreLabelStyleAdapter,
      locale.value,
    );
  } finally {
    applyingMapLocale = false;
  }

  if (changed > 0) activeMap.triggerRepaint();
}

function syncRealEstateLayerOrder(): void {
  if (!map?.isStyleLoaded()) return;
  const firstSymbolId = firstSymbolLayerId(map);
  if (realEstateBeforeId.value !== firstSymbolId) realEstateBeforeId.value = firstSymbolId;
}

function onStyleData(): void {
  syncRealEstateLayerOrder();
  presenter?.refresh();
  applyMapLocale();
}

/**
 * @deck.gl/mapbox reads the Mapbox-compatible `map.transform` field from its
 * interleaved custom-layer callback. MapLibre 6 keeps the same transform on
 * its painter instead. Expose a getter only on the local MapLibre instance so
 * Deck can keep the shared WebGL2 context without changing MapLibre's normal
 * camera, tile-cache, or rendering defaults.
 */
function installDeckMapLibreCompatibility(activeMap: MapLibreMap): void {
  const compatibleMap = activeMap as MapLibreDeckCompatibility;
  if (compatibleMap.transform || !compatibleMap.painter?.transform) return;
  Object.defineProperty(compatibleMap, "transform", {
    configurable: true,
    enumerable: false,
    get: () => compatibleMap.painter?.transform,
  });
}

function onMapLoad(): void {
  const activeMap = map;
  if (!activeMap) return;
  syncRealEstateLayerOrder();
  installDeckMapLibreCompatibility(activeMap);
  const webgl2 = activeMap.getCanvas().getContext("webgl2");
  if (!webgl2) {
    status.value = "unsupported";
    return;
  }
  const diagnostic = diagnoseVectorStyle(activeMap.getStyle());
  if (!diagnostic.valid) basemapUnavailable.value = true;
  applyMapLocale();

  overlay = new MapboxOverlay({
    interleaved: props.interleaved ?? GLOBAL_TRANSPORT_PLAN_CONFIG.nextMap.deckInterleaved,
    layers: [],
    onError: (error, layer) => {
      props.performanceTrace?.instant("deck_error", {
        layerId: layer?.id,
        message: error.message,
      });
      console.error(error);
    },
    _onMetrics: (metrics) => {
      const sampledAtMs = typeof performance === "undefined" ? Date.now() : performance.now();
      presenter?.recordDeckMetrics({
        fps: metrics.fps,
        setPropsTime: metrics.setPropsTime,
        layersCount: metrics.layersCount,
        drawLayersCount: metrics.drawLayersCount,
        updateLayersCount: metrics.updateLayersCount,
        updateAttributesTime: metrics.updateAttributesTime,
        updateAttributesCount: metrics.updateAttributesCount,
        framesRedrawn: metrics.framesRedrawn,
        gpuTime: metrics.gpuTime,
        gpuTimePerFrame: metrics.gpuTimePerFrame,
        cpuTime: metrics.cpuTime,
        cpuTimePerFrame: metrics.cpuTimePerFrame,
        bufferMemory: metrics.bufferMemory,
        textureMemory: metrics.textureMemory,
        renderbufferMemory: metrics.renderbufferMemory,
        gpuMemory: metrics.gpuMemory,
        sampledAtMs,
        windowFrames: metrics.framesRedrawn,
      } satisfies Omit<TransportMapDeckMetrics, "sampleAgeMs">);
    },
  });
  activeMap.addControl(overlay as unknown as IControl);
  overlayAdded = true;
  presenter = new MapLibreDeckOverlayPresenter(activeMap, overlay);
  presenter.setNearbyPlaceLayers(nearbyPlaceLayers.value);
  presenter.setRealEstateLayers(realEstateLayers.value);
  presenter.setPerformanceTrace(props.performanceTrace);
  presenter.setStationLabelFadeEnabled(!props.reduceMotion && !systemReducedMotion.value);
  if (props.performanceTrace) {
    mapLibreTraceProbe = new TransportMapMapLibreTraceProbe(
      activeMap as unknown as TransportMapMapLibreTraceMap,
      props.performanceTrace,
    );
    detachMapLibreTraceProbe = props.performanceTrace.attachProbe(mapLibreTraceProbe);
  }
  props.renderer.attachHost?.(presenter);
  // The surface is mounted asynchronously inside a flex stage. Resize once
  // after the load event and keep it synchronized with the actual container;
  // otherwise MapLibre can retain the pre-layout canvas height, which makes
  // the interleaved Deck viewport clip or flicker at the lower edge.
  void nextTick(() => {
    activeMap.resize();
    activeMap.triggerRepaint();
  });
  status.value = "ready";
  emit("ready");
}

onMounted(() => {
  if (typeof window.matchMedia === "function") {
    reducedMotionMediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    systemReducedMotion.value = reducedMotionMediaQuery.matches;
    reducedMotionMediaQuery.addEventListener("change", onReducedMotionChange);
  }
  if (!mapElement.value) return;
  // MapLibre 6 resolves its worker relative to import.meta.url by default.
  // Vite moves the main module: explicitly bundle the worker and its imports
  // so both dev and production use a real, same-origin worker entry point.
  setWorkerUrl(mapLibreWorkerUrl);
  const initialView = cameraStateToMapLibreView(props.camera);
  try {
    const runtimeStyle = runtimeConfig.public.nextMap?.vectorStyleUrl;
    const configuredStyle = typeof runtimeStyle === "string" && runtimeStyle.length > 0
      ? runtimeStyle
      : GLOBAL_TRANSPORT_PLAN_CONFIG.nextMap.vectorStyleUrl;
    map = new MapLibreMap({
      container: mapElement.value,
      ...initialView,
      // The shared interaction canvas owns pointer/wheel gestures. MapLibre
      // remains a passive vector renderer and keeps its default tile/cache
      // behaviour without competing for camera updates.
      interactive: false,
      // Keep in-flight parent tiles while the shared camera eases through a
      // wheel gesture. The MapLibre default cancels pending lower-zoom tiles
      // as soon as the camera changes again, which makes a route preview
      // visibly stall on the next frame while those tiles are requested again.
      cancelPendingTileRequestsWhileZooming: false,
      // Retain a slightly wider zoom window so the route's detailed view and
      // its immediate dezoom parents can be reused during the same session.
      maxTileCacheZoomLevels: 7,
      // Deck is interleaved with MapLibre and shares its WebGL2 context.
      // Request MSAA at context creation time; GlobalTransportPlan remounts
      // this surface when the preference changes because context attributes
      // cannot be changed after creation.
      canvasContextAttributes: {
        contextType: "webgl2",
        antialias: props.antialias ?? true,
      },
    });
    map.on("error", onMapError);
    map.on("webglcontextlost", onContextLost);
    map.on("webglcontextrestored", onContextRestored);
    map.on("styledata", onStyleData);
    map.once("load", onMapLoad);
    map.setStyle(resolveNextMapStyle(props.styleUrl ?? configuredStyle) as never, {
      transformStyle: (_previous, next) => normalizeMapLibreReferenceFilters(next),
    });
    if (typeof ResizeObserver !== "undefined") {
      mapResizeObserver = new ResizeObserver(() => map?.resize());
      mapResizeObserver.observe(mapElement.value);
    }
  } catch {
    status.value = "unsupported";
  }
});

watch(locale, () => {
  applyMapLocale();
});

watch(
  [() => props.reduceMotion, () => systemReducedMotion.value],
  ([reduceMotion, systemReduced]) => {
    presenter?.setStationLabelFadeEnabled(!reduceMotion && !systemReduced);
  },
);

onBeforeUnmount(() => {
  cancelRealEstateMetricTransition();
  reducedMotionMediaQuery?.removeEventListener("change", onReducedMotionChange);
  reducedMotionMediaQuery = undefined;
  if (realEstatePurchasePointsTimer) clearTimeout(realEstatePurchasePointsTimer);
  realEstatePurchasePointsRevision += 1;
  realEstatePurchasePointsByCity.clear();
  realEstatePurchasePoints.value = [];
  hoveredRealEstatePurchasePoint.value = undefined;
  const renderer = props.renderer as TransportMapRenderer & {
    detachHost?: (host?: MapLibreDeckOverlayPresenter) => void;
  };
  if (presenter) renderer.detachHost?.(presenter);
  mapResizeObserver?.disconnect();
  mapResizeObserver = undefined;
  detachMapLibreTraceProbe?.();
  detachMapLibreTraceProbe = undefined;
  mapLibreTraceProbe?.dispose();
  mapLibreTraceProbe = undefined;
  presenter?.dispose();
  if (map && overlay && overlayAdded) map.removeControl(overlay as unknown as IControl);
  overlay?.finalize();
  if (map) {
    map.off("error", onMapError);
    map.off("webglcontextlost", onContextLost);
    map.off("webglcontextrestored", onContextRestored);
    map.off("styledata", onStyleData);
    map.remove();
  }
  map = undefined;
  overlay = undefined;
  presenter = undefined;
  overlayAdded = false;
  fallbackStyleAttempted = false;
});
</script>

<style scoped>
.transport-map-next-surface {
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  background: #eef2f4;
}

.transport-map-next-surface__map {
  position: absolute;
  inset: 0;
}

.transport-map-next-surface__map :deep(.maplibregl-canvas) {
  display: block;
}

.transport-map-next-surface__notice {
  position: absolute;
  z-index: 2;
  top: 16px;
  right: 16px;
  max-width: 360px;
  padding: 12px 14px;
  border: 1px solid rgba(185, 28, 28, 0.28);
  border-radius: 10px;
  background: rgba(255, 247, 237, 0.96);
  color: #7f1d1d;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
  font-size: 0.82rem;
}

.transport-map-next-surface__notice p {
  margin: 0 0 6px;
}

.transport-map-next-surface__notice a {
  color: #1d4ed8;
  font-weight: 700;
}

.transport-map-next-surface__notice--warning {
  border-color: rgba(180, 83, 9, 0.3);
  color: #78350f;
}
</style>
