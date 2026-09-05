<template>
  <div
    class="nearby-stations-basemap"
    data-nearby-stations-basemap
    :data-live-ready="liveAuditReady === undefined ? 'pending' : liveAuditReady ? 'true' : 'false'"
    :data-live-audit-count="liveAuditCount"
    :data-live-audit-misses="liveAuditMisses"
    aria-hidden="true"
  >
    <div
      class="nearby-stations-basemap__cover"
      :class="{ 'nearby-stations-basemap__cover--ready': coverReady }"
      :style="coverStyle"
      data-nearby-basemap-cover
      :data-source-zoom="props.sourceZoom"
      :data-ready="coverReady ? 'true' : 'false'"
    >
      <div class="nearby-stations-basemap__cover-transform" :style="coverTransformStyle">
        <img
          v-for="tile in coverTiles"
          :key="tile.id"
          :src="tile.url"
          alt=""
          class="nearby-stations-basemap__cover-tile"
          :style="tileStyle(tile)"
          loading="eager"
          decoding="sync"
          draggable="false"
          referrerpolicy="strict-origin-when-cross-origin"
          @load="markTileLoaded(tile.id, $event)"
          @error="markTileFailed(tile.id)"
        />
      </div>
    </div>

    <div ref="liveContainer" class="nearby-stations-basemap__live">
      <TransportMapBasemap
        :key="liveBasemapGeneration"
        :camera="props.camera"
        :layer="props.layer"
        :basemap-provider="props.basemapProvider"
        :basemap-style="props.basemapStyle"
        :contrast="props.contrast"
        :interaction-active="props.interactionActive"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import TransportMapBasemap from "../transport-map/basemap/TransportMapBasemap.vue";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../transport-map/config/globalTransportPlanConfig";
import type { GlobalMapBounds } from "../transport-map/contracts/manifest";
import type { CameraState } from "../transport-map/geo/camera";
import { worldScaleAtZoom } from "../transport-map/geo/coordinateKernel";
import {
  createTransportMapBasemapTiles,
  reprojectTransportMapBasemapTile,
  type TransportMapBasemapLayer,
  type TransportMapBasemapProvider,
  type TransportMapBasemapStyle,
  type TransportMapBasemapTile,
} from "../transport-map/basemap/tileMath";

const props = withDefaults(
  defineProps<{
    camera: CameraState;
    referenceCamera: CameraState;
    bounds: GlobalMapBounds;
    sourceZoom: number;
    layer?: TransportMapBasemapLayer;
    basemapProvider?: TransportMapBasemapProvider;
    basemapStyle?: TransportMapBasemapStyle;
    contrast?: number;
    interactionActive?: boolean;
    auditDelayMs?: number;
  }>(),
  {
    layer: "plan",
    basemapProvider: "openstreetmap",
    basemapStyle: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.style.default,
    contrast: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.contrast.default,
    interactionActive: false,
    auditDelayMs: 200,
  },
);

const emit = defineEmits<{
  coverageAudit: [result: {
    ready: boolean;
    expectedTiles: number;
    loadedTiles: number;
    missingTiles: number;
    attempt: number;
    delayMs: number;
  }];
}>();

const coverTiles = shallowRef<TransportMapBasemapTile[]>([]);
const coverReady = ref(false);
const liveContainer = ref<HTMLElement>();
const liveAuditReady = ref<boolean>();
const liveAuditCount = ref(0);
const liveAuditMisses = ref(0);
const liveBasemapGeneration = ref(0);
let loadedTileIds = new Set<string>();
let failedTileIds = new Set<string>();
let coverGeneration = 0;
let previousCameraZoom = props.camera.zoom;
let pendingDezoomAudit = false;
let remountedForCurrentDezoom = false;
let auditTimer: number | undefined;

const coverDefinitionKey = computed(() => [
  props.referenceCamera.centerWorldX,
  props.referenceCamera.centerWorldY,
  props.referenceCamera.viewportWidthCssPx,
  props.referenceCamera.viewportHeightCssPx,
  props.referenceCamera.pixelRatio,
  props.bounds.minX,
  props.bounds.minY,
  props.bounds.maxX,
  props.bounds.maxY,
  props.sourceZoom,
  props.layer,
  props.basemapProvider,
  props.basemapStyle,
].join(":"));

watch(coverDefinitionKey, rebuildCover, { immediate: true });

watch(() => props.camera.zoom, (nextZoom) => {
  const dezoomed = nextZoom < previousCameraZoom - 0.0001;
  previousCameraZoom = nextZoom;
  if (!dezoomed) return;
  pendingDezoomAudit = true;
  remountedForCurrentDezoom = false;
  liveAuditReady.value = undefined;
  if (!props.interactionActive) beginDeferredAudit();
});

watch(() => props.interactionActive, (active) => {
  if (!active && pendingDezoomAudit) beginDeferredAudit();
});

onBeforeUnmount(() => {
  if (auditTimer !== undefined) window.clearTimeout(auditTimer);
});

const coverTransformStyle = computed<Record<string, string>>(() => {
  const reference = props.referenceCamera;
  const current = props.camera;
  const referenceScale = worldScaleAtZoom(reference.zoom);
  const currentScale = worldScaleAtZoom(current.zoom);
  const ratio = currentScale / referenceScale;
  const translateX =
    (reference.centerWorldX - current.centerWorldX) * currentScale +
    current.viewportWidthCssPx / 2 -
    ratio * reference.viewportWidthCssPx / 2;
  const translateY =
    (reference.centerWorldY - current.centerWorldY) * currentScale +
    current.viewportHeightCssPx / 2 -
    ratio * reference.viewportHeightCssPx / 2;
  return {
    width: `${reference.viewportWidthCssPx}px`,
    height: `${reference.viewportHeightCssPx}px`,
    transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${ratio})`,
  };
});

const coverStyle = computed<Record<string, string>>(() => ({
  "--nearby-basemap-cover-background": props.layer === "satellite"
    ? "#1b2430"
    : GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.background,
  "--nearby-basemap-cover-opacity": props.layer === "satellite"
    ? "0.92"
    : props.basemapStyle === "voyager"
      ? "1"
      : "0.94",
}));

function rebuildCover(): void {
  coverGeneration += 1;
  loadedTileIds = new Set();
  failedTileIds = new Set();
  coverReady.value = false;

  const sourceZoom = Math.max(
    0,
    Math.min(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.maxZoom, Math.floor(props.sourceZoom)),
  );
  const sourceCamera: CameraState = {
    ...props.referenceCamera,
    zoom: sourceZoom,
  };
  coverTiles.value = createTransportMapBasemapTiles(sourceCamera, {
    layer: props.layer,
    provider: props.basemapProvider,
    style: props.basemapStyle,
    maxTiles: Number.MAX_SAFE_INTEGER,
    highZoomMaxTiles: Number.MAX_SAFE_INTEGER,
    overscanTiles: 0,
    minZoom: sourceZoom,
    maxZoom: sourceZoom,
    retinaPixelRatio: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.retinaPixelRatio,
    showCityAndStreetLabels: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.showCityAndStreetLabels,
    worldBounds: props.bounds,
  }).map((tile) => reprojectTransportMapBasemapTile(tile, props.referenceCamera));
  if (coverTiles.value.length === 0) coverReady.value = true;
}

function beginDeferredAudit(): void {
  pendingDezoomAudit = false;
  scheduleLiveAudit(1);
}

function scheduleLiveAudit(attempt: number): void {
  if (auditTimer !== undefined) window.clearTimeout(auditTimer);
  auditTimer = window.setTimeout(() => {
    auditTimer = undefined;
    auditLiveTiles(attempt);
  }, props.auditDelayMs);
}

function auditLiveTiles(attempt: number): void {
  if (props.interactionActive) {
    pendingDezoomAudit = true;
    return;
  }

  const expectedTiles = createTransportMapBasemapTiles(props.camera, {
    layer: props.layer,
    provider: props.basemapProvider,
    style: props.basemapStyle,
    maxTiles: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.maxTiles,
    highZoomMin: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.highZoomMin,
    highZoomMaxTiles: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.highZoomMaxTiles,
    overscanTiles: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.overscanTiles,
    maxZoom: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.maxZoom,
    retinaPixelRatio: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.retinaPixelRatio,
    showCityAndStreetLabels: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.showCityAndStreetLabels,
  });
  const images = [...(liveContainer.value?.querySelectorAll<HTMLImageElement>(
    ".transport-map-basemap__tile",
  ) ?? [])];
  const presentUrls = new Set(images.map((image) => image.src));
  const loadedUrls = new Set(images
    .filter((image) => image.classList.contains("transport-map-basemap__tile--loaded"))
    .map((image) => image.src));
  const expectedUrls = expectedTiles.map((tile) => new URL(tile.url, document.baseURI).href);
  const loadedTiles = expectedUrls.reduce(
    (count, url) => count + (loadedUrls.has(url) ? 1 : 0),
    0,
  );
  const absentTiles = expectedUrls.reduce(
    (count, url) => count + (presentUrls.has(url) ? 0 : 1),
    0,
  );
  const ready = expectedUrls.length > 0 && loadedTiles === expectedUrls.length;

  liveAuditReady.value = ready;
  liveAuditCount.value += 1;
  if (!ready) liveAuditMisses.value += 1;
  emit("coverageAudit", {
    ready,
    expectedTiles: expectedUrls.length,
    loadedTiles,
    missingTiles: expectedUrls.length - loadedTiles,
    attempt,
    delayMs: props.auditDelayMs,
  });
  if (ready) return;

  // A requested image that disappeared from the DOM has failed in the shared
  // basemap. Retry that nearby-only live layer once; the decoded cover remains
  // visible underneath throughout the remount.
  if (absentTiles > 0 && !remountedForCurrentDezoom) {
    remountedForCurrentDezoom = true;
    liveBasemapGeneration.value += 1;
  }
  if (attempt < 5) scheduleLiveAudit(attempt + 1);
}

function markTileLoaded(tileId: string, event: Event): void {
  const generation = coverGeneration;
  const image = event.currentTarget as HTMLImageElement | null;
  const decode = image?.decode?.();
  if (!decode) {
    settleTile(tileId, generation, true);
    return;
  }
  void decode
    .catch(() => undefined)
    .then(() => settleTile(tileId, generation, true));
}

function markTileFailed(tileId: string): void {
  settleTile(tileId, coverGeneration, false);
}

function settleTile(tileId: string, generation: number, loaded: boolean): void {
  if (generation !== coverGeneration || loadedTileIds.has(tileId) || failedTileIds.has(tileId)) return;
  if (loaded) loadedTileIds.add(tileId);
  else failedTileIds.add(tileId);
  // Keep counters non-reactive: hundreds of image events must produce only one
  // Vue update, when the complete fallback mosaic can be shown atomically.
  if (failedTileIds.size === 0 && loadedTileIds.size === coverTiles.value.length) {
    coverReady.value = true;
  }
}

function tileStyle(tile: TransportMapBasemapTile): Record<string, string> {
  return {
    left: `${tile.leftCssPx}px`,
    top: `${tile.topCssPx}px`,
    width: `${tile.widthCssPx}px`,
    height: `${tile.heightCssPx}px`,
    filter: props.layer === "satellite"
      ? `saturate(0.82) contrast(${props.contrast}) brightness(0.82)`
      : props.basemapStyle === "voyager"
        ? `saturate(1.32) contrast(${props.contrast}) brightness(0.96)`
        : `saturate(1.08) contrast(${props.contrast}) brightness(0.98)`,
  };
}
</script>

<style scoped>
.nearby-stations-basemap,
.nearby-stations-basemap__cover,
.nearby-stations-basemap__live {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.nearby-stations-basemap {
  z-index: 0;
  overflow: hidden;
  contain: paint;
}

.nearby-stations-basemap__cover {
  z-index: 0;
  overflow: hidden;
  opacity: 0;
  background: var(--nearby-basemap-cover-background);
}

.nearby-stations-basemap__cover--ready {
  opacity: var(--nearby-basemap-cover-opacity, 0.94);
}

.nearby-stations-basemap__cover-transform {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.nearby-stations-basemap__cover-tile {
  position: absolute;
  display: block;
  max-width: none;
  user-select: none;
}

.nearby-stations-basemap__live {
  z-index: 1;
}

/* The nearby-only fallback owns the background. Making the regular basemap
   transparent lets its already-decoded cover show through between live tile
   definitions without changing the shared GlobalTransportPlan component. */
.nearby-stations-basemap__live:deep(.transport-map-basemap) {
  background: transparent;
}
</style>
