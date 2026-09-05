<template>
  <div
    class="transport-map-basemap"
    data-transport-map-basemap
    :data-basemap-layer="props.layer"
    :data-basemap-provider="props.basemapProvider"
    :data-basemap-style="props.basemapStyle"
    :data-basemap-online="isOnline ? 'true' : 'false'"
    :style="basemapStyle"
    aria-hidden="true"
  >
    <div
      v-if="fallbackDefinition"
      class="transport-map-basemap__definition transport-map-basemap__definition--fallback"
      data-definition-role="fallback"
      :data-definition-signature="fallbackDefinition.signature"
      :data-definition-source-zoom="definitionSourceZoom(fallbackDefinition)"
      :data-definition-token="fallbackDefinition.token"
      :style="fallbackDefinitionStyle"
    >
      <img
        v-for="entry in fallbackDecodedEntries"
        :key="entry.key"
        :src="entry.tile.url"
        alt=""
        class="transport-map-basemap__tile transport-map-basemap__tile--loaded"
        :style="tileStyle(entry.tile)"
        :data-tile-id="entry.tile.id"
        :data-tile-priority="entry.tile.priority"
        data-tile-state="decoded"
        decoding="async"
        draggable="false"
        referrerpolicy="strict-origin-when-cross-origin"
      />
    </div>
    <div
      v-if="committedDefinition"
      class="transport-map-basemap__definition transport-map-basemap__definition--committed"
      data-definition-role="committed"
      :data-definition-signature="committedDefinition.signature"
      :data-definition-source-zoom="definitionSourceZoom(committedDefinition)"
      :data-definition-token="committedDefinition.token"
      :style="committedDefinitionStyle"
    >
      <img
        v-for="entry in committedDefinition.entries"
        :key="entry.key"
        :src="entry.tile.url"
        alt=""
        class="transport-map-basemap__tile"
        :class="{
          'transport-map-basemap__tile--loaded': entry.state === 'decoded',
          'transport-map-basemap__tile--error': entry.state === 'error',
        }"
        :style="tileStyle(entry.tile)"
        :data-tile-id="entry.tile.id"
        :data-tile-priority="entry.tile.priority"
        :data-tile-state="entry.state"
        decoding="async"
        draggable="false"
        referrerpolicy="strict-origin-when-cross-origin"
        @load="onTileLoad($event, committedDefinition?.token, entry.key)"
        @error="onTileError(committedDefinition?.token, entry.key)"
      />
    </div>
    <div
      v-if="pendingDefinition"
      class="transport-map-basemap__definition transport-map-basemap__definition--pending"
      data-definition-role="pending"
      :data-definition-signature="pendingDefinition.signature"
      :data-definition-source-zoom="definitionSourceZoom(pendingDefinition)"
      :data-definition-token="pendingDefinition.token"
      :style="pendingDefinitionStyle"
    >
      <img
        v-for="entry in pendingDefinition.entries"
        :key="entry.key"
        :src="entry.tile.url"
        alt=""
        class="transport-map-basemap__tile"
        :class="{
          'transport-map-basemap__tile--loaded': entry.state === 'decoded',
          'transport-map-basemap__tile--error': entry.state === 'error',
        }"
        :style="tileStyle(entry.tile)"
        :data-tile-id="entry.tile.id"
        :data-tile-priority="entry.tile.priority"
        :data-tile-state="entry.state"
        decoding="async"
        draggable="false"
        referrerpolicy="strict-origin-when-cross-origin"
        @load="onTileLoad($event, pendingDefinition?.token, entry.key)"
        @error="onTileError(pendingDefinition?.token, entry.key)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import type { CameraState } from "../geo/camera";
import type { GlobalMapBounds } from "../contracts/manifest";
import {
  createTransportMapBasemapTiles,
  reprojectTransportMapBasemapTile,
  type TransportMapBasemapLayer,
  type TransportMapBasemapProvider,
  type TransportMapBasemapStyle,
  type TransportMapBasemapTile,
} from "./tileMath";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../config/globalTransportPlanConfig";
import { definitionTransformStyle, tileDefinitionSignature } from "./basemapDefinition";

const props = withDefaults(
  defineProps<{
    camera: CameraState;
    enabled?: boolean;
    layer?: TransportMapBasemapLayer;
    basemapProvider?: TransportMapBasemapProvider;
    basemapStyle?: TransportMapBasemapStyle;
    contrast?: number;
    /** Keeps tile selection stable while the parent presents a gesture. */
    interactionActive?: boolean;
    /** Precommits a tile definition while the camera is still easing. */
    tileRefreshCamera?: CameraState;
    /** Optional complete world rectangle whose raster tiles should be prefetched. */
    preloadBounds?: GlobalMapBounds;
    /** Deterministic readiness delay used only by the coverage audit. */
    debugReadyDelayMs?: number;
  }>(),
  {
    enabled: true,
    layer: "plan",
    basemapProvider: "carto",
    basemapStyle: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.style.default,
    contrast: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.contrast.default,
    interactionActive: false,
    debugReadyDelayMs: 0,
  },
);

type TileLoadState = "loading" | "decoded" | "error";
type TileDefinitionEntry = {
  key: string;
  tile: TransportMapBasemapTile;
  state: TileLoadState;
  lastUsedAt: number;
};
type TileDefinition = {
  token: number;
  signature: string;
  anchorCamera: CameraState;
  entries: TileDefinitionEntry[];
  requiredKeys: Set<string>;
  createdAt: number;
  bootstrap?: boolean;
};

interface TransportMapBasemapDebugMetrics {
  desiredDefinitionChanges: number;
  committedDefinitionChanges: number;
  supersededDefinitions: number;
  commitsBeforeReady: number;
  visibleTileErrors: number;
  maxMountedTiles: number;
  committedSignature?: string;
  fallbackSignature?: string;
  pendingSignature?: string;
  committedSourceZoom?: number;
  fallbackSourceZoom?: number;
  fallbackTiles: number;
  pendingRequiredTiles: number;
  pendingDecodedRequiredTiles: number;
}

const isOnline = ref(true);
const committedDefinition = shallowRef<TileDefinition>();
const fallbackDefinition = shallowRef<TileDefinition>();
const pendingDefinition = shallowRef<TileDefinition>();
const tileCamera = shallowRef<CameraState>({ ...props.camera });
const debugMetrics: TransportMapBasemapDebugMetrics = {
  desiredDefinitionChanges: 0,
  committedDefinitionChanges: 0,
  supersededDefinitions: 0,
  commitsBeforeReady: 0,
  visibleTileErrors: 0,
  maxMountedTiles: 0,
  fallbackTiles: 0,
  pendingRequiredTiles: 0,
  pendingDecodedRequiredTiles: 0,
};
let definitionToken = 0;
let pendingCommitFrame: number | undefined;
const readinessTimers = new Set<number>();
const linePreloadTileCache = new Map<string, TransportMapBasemapTile>();
let linePreloadBoundsKey = "";
let desiredTileKeys = new Set<string>();

const desiredTiles = computed(() => {
  if (!props.enabled || !isOnline.value) return [];
  const options = {
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
  };
  const visibleTiles = createTransportMapBasemapTiles(tileCamera.value, options);
  const nextPreloadBoundsKey = `${props.basemapProvider}:${props.layer}:${props.basemapStyle}:${getPreloadBoundsKey(props.preloadBounds)}`;
  if (nextPreloadBoundsKey !== linePreloadBoundsKey) {
    linePreloadBoundsKey = nextPreloadBoundsKey;
    linePreloadTileCache.clear();
  }
  if (!props.preloadBounds) return visibleTiles;

  // This remains opt-in and is intentionally independent from the atomic
  // definition swap. The normal selected-line scenario keeps the config flag
  // false; when explicitly enabled, its bounded world rectangle is still
  // represented as one raster definition.
  const nextPreloadTiles = createTransportMapBasemapTiles(tileCamera.value, {
    ...options,
    maxTiles: Number.MAX_SAFE_INTEGER,
    highZoomMaxTiles: Number.MAX_SAFE_INTEGER,
    overscanTiles: 0,
    worldBounds: props.preloadBounds,
  });
  for (const tile of nextPreloadTiles) linePreloadTileCache.set(tile.id, tile);
  const preloadTiles = [...linePreloadTileCache.values()].map((tile) =>
    reprojectTransportMapBasemapTile(tile, tileCamera.value),
  );
  const byId = new Map(visibleTiles.map((tile) => [tile.id, tile]));
  for (const tile of preloadTiles) {
    if (!byId.has(tile.id)) byId.set(tile.id, tile);
  }
  return [...byId.values()];
});

const committedDefinitionStyle = computed(() => {
  const definition = committedDefinition.value;
  if (!definition) return undefined;
  // Keep the last atomic definition aligned with every camera sample until
  // its replacement has decoded and commits. Restricting this transform to
  // wheel interaction left a settled/station animation able to display the
  // old tile rectangle at its obsolete camera.
  return definitionTransformStyle(definition.anchorCamera, props.camera);
});
const fallbackDefinitionStyle = computed(() => {
  const definition = fallbackDefinition.value;
  if (!definition) return undefined;
  return definitionTransformStyle(definition.anchorCamera, props.camera);
});
const fallbackDecodedEntries = computed(
  () => fallbackDefinition.value?.entries.filter((entry) => entry.state === "decoded") ?? [],
);
const pendingDefinitionStyle = computed(() => {
  const definition = pendingDefinition.value;
  if (!definition) return undefined;
  return definitionTransformStyle(definition.anchorCamera, props.camera);
});
const basemapStyle = computed<Record<string, string>>(() => ({
  "--global-map-basemap-background": props.layer === "satellite"
    ? "#1b2430"
    : GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.background,
  "--transport-map-basemap-opacity": props.layer === "satellite"
    ? "0.92"
    : props.basemapStyle === "voyager"
      ? "1"
      : "0.94",
}));

function getPreloadBoundsKey(bounds?: GlobalMapBounds): string {
  if (!bounds) return "";
  return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].join(":");
}

function definitionSourceZoom(definition?: TileDefinition): number | undefined {
  return definition?.entries[0]?.tile.zoom;
}

function syncDebugMetrics(): void {
  const committed = committedDefinition.value;
  const fallback = fallbackDefinition.value;
  const pending = pendingDefinition.value;
  const pendingRequired = pending?.requiredKeys ?? new Set<string>();
  debugMetrics.committedSignature = committed?.signature;
  debugMetrics.fallbackSignature = fallback?.signature;
  debugMetrics.pendingSignature = pending?.signature;
  debugMetrics.committedSourceZoom = definitionSourceZoom(committed);
  debugMetrics.fallbackSourceZoom = definitionSourceZoom(fallback);
  debugMetrics.fallbackTiles = fallbackDecodedEntries.value.length;
  debugMetrics.pendingRequiredTiles = pendingRequired.size;
  debugMetrics.pendingDecodedRequiredTiles = pending
    ? pending.entries.filter((entry) => pendingRequired.has(entry.key) && entry.state === "decoded").length
    : 0;
  debugMetrics.maxMountedTiles = Math.max(
    debugMetrics.maxMountedTiles,
    (committed?.entries.length ?? 0) +
      fallbackDecodedEntries.value.length +
      (pending?.entries.length ?? 0),
  );
}

function getDebugMetrics(): TransportMapBasemapDebugMetrics {
  syncDebugMetrics();
  return { ...debugMetrics };
}

function resetDebugMetrics(): void {
  debugMetrics.desiredDefinitionChanges = 0;
  debugMetrics.committedDefinitionChanges = 0;
  debugMetrics.supersededDefinitions = 0;
  debugMetrics.commitsBeforeReady = 0;
  debugMetrics.visibleTileErrors = 0;
  debugMetrics.maxMountedTiles = 0;
  syncDebugMetrics();
}

defineExpose({ getDebugMetrics, resetDebugMetrics });

watch(desiredTiles, (nextTiles) => {
  syncTileDefinition(nextTiles);
}, { immediate: true });

// Camera changes while idle are semantic changes and immediately re-anchor
// the committed definition. During a gesture only tileRefreshCamera can
// request a new raster definition; the visible layer remains anchored to the
// last committed camera.
watch(() => props.camera, (nextCamera) => {
  if (!props.interactionActive) tileCamera.value = nextCamera;
});
watch(() => props.tileRefreshCamera, (nextCamera) => {
  if (nextCamera && props.interactionActive) tileCamera.value = nextCamera;
});
watch(() => props.interactionActive, (active) => {
  if (!active) tileCamera.value = props.camera;
});

function createDefinition(nextTiles: TransportMapBasemapTile[], bootstrap = false): TileDefinition {
  const now = Date.now();
  const uniqueTiles = [...new Map(nextTiles.map((tile) => [tile.id, tile])).values()];
  const entries = uniqueTiles.map((tile) => ({
    key: tile.id,
    tile,
    state: "loading" as const,
    lastUsedAt: now,
  }));
  return {
    token: ++definitionToken,
    signature: tileDefinitionSignature(uniqueTiles),
    anchorCamera: { ...tileCamera.value },
    entries,
    requiredKeys: new Set(uniqueTiles.filter((tile) => tile.priority === "visible").map((tile) => tile.id)),
    createdAt: now,
    bootstrap,
  };
}

function updateDefinitionForTiles(
  definition: TileDefinition,
  nextTiles: TransportMapBasemapTile[],
): TileDefinition {
  const now = Date.now();
  const previousByKey = new Map(definition.entries.map((entry) => [entry.key, entry]));
  const uniqueTiles = [...new Map(nextTiles.map((tile) => [tile.id, tile])).values()];
  const entries = uniqueTiles.map((tile) => {
    const previous = previousByKey.get(tile.id);
    return previous
      ? { ...previous, tile, lastUsedAt: now }
      : { key: tile.id, tile, state: "loading" as const, lastUsedAt: now };
  });
  return {
    ...definition,
    anchorCamera: { ...tileCamera.value },
    entries,
    requiredKeys: new Set(uniqueTiles.filter((tile) => tile.priority === "visible").map((tile) => tile.id)),
  };
}

function cancelPendingCommit(): void {
  if (pendingCommitFrame === undefined) return;
  if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(pendingCommitFrame);
  else window.clearTimeout(pendingCommitFrame);
  pendingCommitFrame = undefined;
}

function supersedePendingDefinition(): void {
  if (!pendingDefinition.value) return;
  debugMetrics.supersededDefinitions += 1;
  pendingDefinition.value = undefined;
  cancelPendingCommit();
  syncDebugMetrics();
}

function rasterFamily(definition: TileDefinition): string | undefined {
  const id = definition.entries[0]?.tile.id;
  return id?.split("/").slice(0, 2).join("/");
}

function retainFallbackDefinition(
  previous: TileDefinition | undefined,
  current: TileDefinition,
): TileDefinition | undefined {
  if (!previous || !isDefinitionReady(previous)) return undefined;
  if (rasterFamily(previous) !== rasterFamily(current)) return undefined;
  // At most three live definitions can coexist (fallback + committed +
  // pending). Keep that transaction inside the existing decoded-tile budget.
  const perDefinitionBudget = Math.max(
    1,
    Math.floor(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.cacheMaxTiles / 3),
  );
  return previous.entries.length <= perDefinitionBudget ? previous : undefined;
}

function syncTileDefinition(nextTiles: TransportMapBasemapTile[]): void {
  if (!props.enabled) {
    desiredTileKeys.clear();
    supersedePendingDefinition();
    committedDefinition.value = undefined;
    fallbackDefinition.value = undefined;
    linePreloadTileCache.clear();
    syncDebugMetrics();
    return;
  }
  // A transient offline computed value must never erase the last valid
  // definition. The online/offline handlers own retry and token invalidation.
  if (!isOnline.value || nextTiles.length === 0) return;

  desiredTileKeys = new Set(nextTiles.map((tile) => tile.id));
  const signature = tileDefinitionSignature(nextTiles);
  const committed = committedDefinition.value;
  if (!committed) {
    const bootstrap = createDefinition(nextTiles, true);
    fallbackDefinition.value = undefined;
    committedDefinition.value = bootstrap;
    debugMetrics.desiredDefinitionChanges += 1;
    debugMetrics.committedDefinitionChanges += 1;
    syncDebugMetrics();
    queueCompleteImageScan();
    return;
  }

  if (signature === committed.signature) {
    supersedePendingDefinition();
    committedDefinition.value = updateDefinitionForTiles(committed, nextTiles);
    syncDebugMetrics();
    queueCompleteImageScan();
    return;
  }

  const pending = pendingDefinition.value;
  if (pending && pending.signature === signature) {
    pendingDefinition.value = updateDefinitionForTiles(pending, nextTiles);
    syncDebugMetrics();
    queueCompleteImageScan();
    schedulePendingCommitIfReady();
    return;
  }

  supersedePendingDefinition();
  const nextDefinition = createDefinition(nextTiles);
  // The committed definition already remains visible until this atomic
  // replacement is decoded. Drop the older fallback before mounting pending
  // tiles so the transition never retains three full live grids at once.
  fallbackDefinition.value = undefined;
  pendingDefinition.value = nextDefinition;
  debugMetrics.desiredDefinitionChanges += 1;
  syncDebugMetrics();
  queueCompleteImageScan();
}

function findDefinition(token: number): TileDefinition | undefined {
  if (pendingDefinition.value?.token === token) return pendingDefinition.value;
  if (committedDefinition.value?.token === token) return committedDefinition.value;
  return undefined;
}

function updateDefinition(token: number, update: (definition: TileDefinition) => TileDefinition): boolean {
  if (pendingDefinition.value?.token === token) {
    pendingDefinition.value = update(pendingDefinition.value);
    return true;
  }
  if (committedDefinition.value?.token === token) {
    committedDefinition.value = update(committedDefinition.value);
    return true;
  }
  return false;
}

function setTileState(token: number, tileId: string, state: TileLoadState): void {
  const definition = findDefinition(token);
  const entry = definition?.entries.find((candidate) => candidate.key === tileId);
  if (!definition || !entry || entry.state === state) return;
  if (state === "error" && entry.tile.priority === "visible") debugMetrics.visibleTileErrors += 1;
  updateDefinition(token, (current) => ({
    ...current,
    entries: current.entries.map((candidate) =>
      candidate.key === tileId
        ? { ...candidate, state, lastUsedAt: Date.now() }
        : candidate,
    ),
  }));
  syncDebugMetrics();
  if (state === "decoded") schedulePendingCommitIfReady();
}

async function decodeImage(image: HTMLImageElement, token: number, tileId: string): Promise<void> {
  const definition = findDefinition(token);
  const entry = definition?.entries.find((candidate) => candidate.key === tileId);
  if (!definition || !entry || entry.state !== "loading") return;
  try {
    if (typeof image.decode === "function") await image.decode();
    const delayMs = Math.max(0, Math.floor(props.debugReadyDelayMs ?? 0));
    if (delayMs > 0) {
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(() => {
          readinessTimers.delete(timer);
          resolve();
        }, delayMs);
        readinessTimers.add(timer);
      });
    }
    if (findDefinition(token)) setTileState(token, tileId, "decoded");
  } catch {
    if (findDefinition(token)) setTileState(token, tileId, "error");
  }
}

function onTileLoad(event: Event, token: number | undefined, tileId: string): void {
  if (token === undefined) return;
  const image = event.currentTarget;
  if (!(image instanceof HTMLImageElement)) return;
  void decodeImage(image, token, tileId);
}

function onTileError(token: number | undefined, tileId: string): void {
  if (token !== undefined) setTileState(token, tileId, "error");
}

function isDefinitionReady(definition: TileDefinition): boolean {
  return [...definition.requiredKeys].every((key) =>
    definition.entries.some((entry) => entry.key === key && entry.state === "decoded"),
  );
}

function schedulePendingCommitIfReady(): void {
  const pending = pendingDefinition.value;
  if (!pending || !isDefinitionReady(pending) || pendingCommitFrame !== undefined) return;
  const token = pending.token;
  const commit = () => {
    pendingCommitFrame = undefined;
    const current = pendingDefinition.value;
    if (!current || current.token !== token || !isDefinitionReady(current)) return;
    // Both assignments happen in one synchronous Vue update. The pending
    // layer was opacity-zero throughout preparation, so no partial definition
    // can be painted between them.
    const previous = committedDefinition.value;
    fallbackDefinition.value = retainFallbackDefinition(previous, current);
    committedDefinition.value = current;
    pendingDefinition.value = undefined;
    debugMetrics.committedDefinitionChanges += 1;
    syncDebugMetrics();
    queueCompleteImageScan();
  };
  if (typeof requestAnimationFrame !== "undefined") pendingCommitFrame = requestAnimationFrame(commit);
  else pendingCommitFrame = window.setTimeout(commit, 0);
}

function queueCompleteImageScan(): void {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    const root = document.querySelector<HTMLElement>("[data-transport-map-basemap]");
    if (!root) return;
    for (const image of root.querySelectorAll<HTMLImageElement>("img")) {
      if (!image.complete || image.naturalWidth <= 0) continue;
      const layer = image.closest<HTMLElement>("[data-definition-role]");
      const token = Number(layer?.dataset.definitionToken);
      const tileId = image.dataset.tileId;
      if (Number.isFinite(token) && tileId) void decodeImage(image, token, tileId);
    }
  }, 0);
}

function restoreOnlineTiles(): void {
  isOnline.value = true;
}

function markOffline(): void {
  isOnline.value = false;
  if (pendingDefinition.value) debugMetrics.supersededDefinitions += 1;
  definitionToken += 1;
  pendingDefinition.value = undefined;
  cancelPendingCommit();
  syncDebugMetrics();
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

onMounted(() => {
  isOnline.value = typeof navigator === "undefined" || navigator.onLine !== false;
  window.addEventListener("online", restoreOnlineTiles);
  window.addEventListener("offline", markOffline);
  queueCompleteImageScan();
});

onBeforeUnmount(() => {
  definitionToken += 1;
  cancelPendingCommit();
  for (const timer of readinessTimers) window.clearTimeout(timer);
  readinessTimers.clear();
  committedDefinition.value = undefined;
  fallbackDefinition.value = undefined;
  pendingDefinition.value = undefined;
  linePreloadTileCache.clear();
  window.removeEventListener("online", restoreOnlineTiles);
  window.removeEventListener("offline", markOffline);
});
</script>

<style scoped>
.transport-map-basemap {
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  background: var(--global-map-basemap-background);
  /* Apply opacity once to avoid stale/committed raster text ghosting. */
  opacity: var(--transport-map-basemap-opacity, 0.92);
  contain: paint;
  pointer-events: none;
}

.transport-map-basemap__definition {
  position: absolute;
  inset: 0;
  /* The root already clips to the stage. Keeping an additional viewport clip
     here discarded every decoded overscan tile before the definition was
     transformed, so an off-centre zoom exposed the background even though the
     cache contained the neighbouring pixels. */
  overflow: visible;
  transform-origin: 0 0;
  will-change: transform;
  pointer-events: none;
}

.transport-map-basemap__definition--fallback,
.transport-map-basemap__definition--committed { opacity: 1; }
.transport-map-basemap__definition--pending {
  opacity: 0;
  transition: none;
}

.transport-map-basemap__tile {
  position: absolute;
  display: block;
  max-width: none;
  opacity: 0;
  user-select: none;
  z-index: 1;
}

.transport-map-basemap__tile--loaded { opacity: 1; }
.transport-map-basemap__tile--error { opacity: 0; }
</style>
