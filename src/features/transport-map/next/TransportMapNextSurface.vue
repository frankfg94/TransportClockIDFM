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
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
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
  type MapLibreLabelStyleAdapter,
  resolveNextMapStyle,
  type NextMapStyle,
} from "./nextMapConfig";
import { MapLibreDeckOverlayPresenter } from "./deckMapPresenter";
import { cameraStateToMapLibreView } from "./nextMapCamera";
import {
  TransportMapMapLibreTraceProbe,
  type TransportMapMapLibreTraceMap,
} from "../performance/transportMapMapLibreTrace";
import type { TransportMapPerformanceTrace } from "../performance/transportMapPerformanceTrace";
import "maplibre-gl/dist/maplibre-gl.css";

type SurfaceStatus = "initializing" | "ready" | "unsupported";

const props = defineProps<{
  renderer: TransportMapRenderer;
  camera: CameraState;
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
let map: MapLibreMap | undefined;
let overlay: MapboxOverlay | undefined;
let presenter: MapLibreDeckOverlayPresenter | undefined;
let overlayAdded = false;
let fallbackStyleAttempted = false;
let mapResizeObserver: ResizeObserver | undefined;
let mapLibreTraceProbe: TransportMapMapLibreTraceProbe | undefined;
let detachMapLibreTraceProbe: (() => void) | undefined;
let applyingMapLocale = false;

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

function onStyleData(): void {
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
  presenter.setPerformanceTrace(props.performanceTrace);
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
      style: resolveNextMapStyle(props.styleUrl ?? configuredStyle) as never,
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

onBeforeUnmount(() => {
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
