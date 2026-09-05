<template>
  <div
    class="selected-line-basemap-cover"
    :class="{
      'selected-line-basemap-cover--ready': ready,
      'selected-line-basemap-cover--canvas': compositeLoaded,
    }"
    ref="rootElement"
    data-selected-line-basemap-cover
    :data-cover-enabled="props.enabled ? 'true' : 'false'"
    :data-cover-ready="ready ? 'true' : 'false'"
    :data-cover-pending="pendingRuntime ? 'true' : 'false'"
    :data-cover-line-id="props.lineId"
    :data-cover-source-zoom="definition?.sourceZoom"
    :data-cover-density="definition?.density"
    :data-cover-tile-count="definition?.tiles.length"
    :data-cover-estimated-decoded-bytes="definition?.estimatedDecodedBytes"
    :data-cover-render-mode="compositeLoaded ? 'canvas' : 'tiles'"
    :data-cover-composite-verified="compositeVerified ? 'true' : 'false'"
    aria-hidden="true"
  >
    <div
      v-if="runtime"
      class="selected-line-basemap-cover__definition"
      data-selected-line-cover-definition
      :data-cover-runtime-token="runtime.token"
      :data-cover-definition-key="definition?.key"
      :data-cover-definition-signature="definition?.signature"
      :style="definitionStyle"
    >
      <canvas
        ref="compositeCanvasElement"
        data-selected-line-cover-composite
        class="selected-line-basemap-cover__composite"
        aria-hidden="true"
        :style="compositeStyle"
      />
      <template v-if="!compositeLoaded">
        <img
          v-for="entry in runtime.entries"
          v-memo="[runtime.token, entry.key, entry.state]"
          :key="`${runtime.token}:${entry.key}`"
          data-selected-line-cover-tile
          :data-cover-tile-id="entry.tile.id"
          :data-cover-tile-state="entry.state"
          :src="entry.tile.url"
          alt=""
          loading="eager"
          decoding="async"
          draggable="false"
          crossorigin="anonymous"
          referrerpolicy="no-referrer"
          :style="tileStyle(entry.tile)"
          @load="onTileLoad($event, runtime.token, entry.key)"
          @error="onTileError(runtime.token, entry.key)"
        >
      </template>
    </div>
    <div
      v-if="pendingRuntime"
      class="selected-line-basemap-cover__pending-sources"
      :data-cover-runtime-token="pendingRuntime.token"
      aria-hidden="true"
    >
      <img
        v-for="entry in pendingRuntime.entries"
        :key="`pending:${pendingRuntime.token}:${entry.key}`"
        data-selected-line-cover-tile
        :data-cover-tile-id="entry.tile.id"
        :data-cover-tile-state="entry.state"
        :src="entry.tile.url"
        alt=""
        loading="eager"
        decoding="async"
        draggable="false"
        crossorigin="anonymous"
        referrerpolicy="no-referrer"
        @load="onTileLoad($event, pendingRuntime.token, entry.key)"
        @error="onTileError(pendingRuntime.token, entry.key)"
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import type { GlobalMapBounds } from "../contracts/manifest";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../config/globalTransportPlanConfig";
import type { CameraState } from "../geo/camera";
import {
  definitionTransformStyle,
} from "./basemapDefinition";
import {
  createSelectedLineBasemapCoverDefinition,
  selectedLineBasemapCoverDefinitionKey,
  type SelectedLineBasemapCoverDebugMetrics,
  type SelectedLineBasemapCoverDefinition,
  type SelectedLineBasemapCoverOptions,
} from "./selectedLineBasemapCover";
import type {
  TransportMapBasemapLayer,
  TransportMapBasemapStyle,
  TransportMapBasemapTile,
} from "./tileMath";

type CoverTileState = "loading" | "decoded" | "error";

interface CoverTileEntry {
  key: string;
  tile: TransportMapBasemapTile;
  state: CoverTileState;
}

interface CoverRuntime {
  token: number;
  definition: SelectedLineBasemapCoverDefinition;
  entries: CoverTileEntry[];
}

const props = withDefaults(
  defineProps<{
    enabled: boolean;
    lineId?: string;
    camera: CameraState;
    anchorCamera?: CameraState;
    lineBounds?: GlobalMapBounds;
    layer: TransportMapBasemapLayer;
    basemapStyle: TransportMapBasemapStyle;
    contrast: number;
    interactionActive: boolean;
    options?: Partial<SelectedLineBasemapCoverOptions>;
  }>(),
  { contrast: 1 },
);

const ready = ref(false);
const rootElement = ref<HTMLElement>();
const compositeCanvasElement = ref<HTMLCanvasElement>();
const compositeLoaded = ref(false);
const compositeVerified = ref(false);
const runtime = shallowRef<CoverRuntime>();
const pendingRuntime = shallowRef<CoverRuntime>();
const metrics = ref<SelectedLineBasemapCoverDebugMetrics>({
  enabled: false,
  mounted: false,
  ready: false,
  tileCount: 0,
  loadedTiles: 0,
  failedTiles: 0,
  density: 1,
  estimatedDecodedBytes: 0,
  rebuilds: 0,
  rebuildsDuringInteraction: 0,
  lateCallbacksIgnored: 0,
  retries: 0,
  terminalFailures: 0,
  compositeVerified: false,
  rejectedComposites: 0,
});
const coverOptions = computed<SelectedLineBasemapCoverOptions>(() => ({
  coveredZoomOutLevels: GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.basemapCover.coveredZoomOutLevels,
  detailLeadLevels: GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.basemapCover.detailLeadLevels,
  maxSourceZoom: GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.basemapCover.maxSourceZoom,
  maxTiles: GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.basemapCover.maxTiles,
  maxEstimatedDecodedBytes:
    GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.basemapCover.maxEstimatedDecodedBytes,
  boundsPaddingRatio: GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.basemapCover.boundsPaddingRatio,
  retinaPixelRatio: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.retinaPixelRatio,
  // The cover is deliberately a zoom-transition safety raster. Its Carto
  // labels become oversized when a broad line forces the fixed source down
  // to z6/z7; station and line labels remain available from the transport
  // canvas above it.
  showCityAndStreetLabels: false,
  ...props.options,
}));
const definitionInputKey = computed(() => {
  if (!props.enabled || !props.lineId || !props.anchorCamera || !props.lineBounds) return undefined;
  return selectedLineBasemapCoverDefinitionKey({
    lineId: props.lineId,
    anchorCamera: props.anchorCamera,
    lineBounds: props.lineBounds,
    layer: props.layer,
    basemapStyle: props.basemapStyle,
    options: coverOptions.value,
  });
});
const definition = computed(() => runtime.value?.definition);
const definitionStyle = computed(() => {
  const current = runtime.value?.definition;
  return current ? definitionTransformStyle(current.anchorCamera, props.camera) : undefined;
});
const compositeStyle = computed<Record<string, string> | undefined>(() => {
  const tiles = runtime.value?.definition.tiles;
  const firstTile = tiles?.[0];
  if (!tiles?.length || !firstTile) return undefined;
  const minTileX = Math.min(...tiles.map((tile) => tile.tileX));
  const minTileY = Math.min(...tiles.map((tile) => tile.tileY));
  const maxTileX = Math.max(...tiles.map((tile) => tile.tileX));
  const maxTileY = Math.max(...tiles.map((tile) => tile.tileY));
  const minLeft = Math.min(...tiles.map((tile) => tile.leftCssPx));
  const minTop = Math.min(...tiles.map((tile) => tile.topCssPx));
  const maxRight = Math.max(...tiles.map((tile) => tile.leftCssPx + tile.widthCssPx));
  const maxBottom = Math.max(...tiles.map((tile) => tile.topCssPx + tile.heightCssPx));
  return {
    position: "absolute",
    left: `${minLeft}px`,
    top: `${minTop}px`,
    width: `${Math.max(1, maxRight - minLeft)}px`,
    height: `${Math.max(1, maxBottom - minTop)}px`,
    pointerEvents: "none",
  };
});

let definitionToken = 0;
let retryTimer: number | undefined;
let retryKey: string | undefined;
let retryCountForKey = 0;
let mounted = false;

function clearRetryTimer(): void {
  if (retryTimer === undefined) return;
  window.clearTimeout(retryTimer);
  retryTimer = undefined;
}

function syncMetrics(): void {
  const current = runtime.value?.definition;
  const entries = runtime.value?.entries ?? [];
  metrics.value = {
    ...metrics.value,
    enabled: props.enabled,
    mounted,
    ready: ready.value,
    lineId: props.lineId,
    definitionKey: current?.key,
    definitionSignature: current?.signature,
    floorZoom: current?.floorZoom,
    requestedSourceZoom: current?.requestedSourceZoom,
    sourceZoom: current?.sourceZoom,
    tileCount: entries.length,
    loadedTiles: entries.filter((entry) => entry.state === "decoded").length,
    failedTiles: entries.filter((entry) => entry.state === "error").length,
    density: current?.density ?? 1,
    estimatedDecodedBytes: current?.estimatedDecodedBytes ?? 0,
    compositeVerified: compositeVerified.value,
  };
}

function getDebugMetrics(): SelectedLineBasemapCoverDebugMetrics {
  syncMetrics();
  return { ...metrics.value };
}

function resetDebugMetrics(): void {
  metrics.value = {
    ...metrics.value,
    rebuilds: 0,
    rebuildsDuringInteraction: 0,
    lateCallbacksIgnored: 0,
    retries: 0,
    terminalFailures: 0,
    rejectedComposites: 0,
  };
  syncMetrics();
}

function isReady(): boolean {
  return ready.value;
}

defineExpose({ getDebugMetrics, resetDebugMetrics, isReady });

function setReady(nextReady: boolean): void {
  ready.value = nextReady;
  syncMetrics();
}

async function composeCanvas(token: number): Promise<boolean> {
  await nextTick();
  const current = runtimeForToken(token);
  if (!current || typeof document === "undefined") return false;
  // Flatten every fully decoded mosaic into one native-resolution surface.
  // The source <img> nodes are unmounted immediately afterwards, so this does
  // not retain a duplicate decoded copy. Their URLs remain in the browser HTTP
  // cache for the next gesture/page visit.
  const isPending = pendingRuntime.value?.token === token;
  const visibleCanvas = compositeCanvasElement.value;
  const canvas = isPending ? document.createElement("canvas") : visibleCanvas;
  if (!isPending) compositeVerified.value = false;
  if (!canvas) return true;
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext("2d");
  } catch {
    context = null;
  }
  // Environments without Canvas2D keep the already decoded source images.
  // The browser production path normally flattens them below.
  if (!context) return true;

  const tiles = current.definition.tiles;
  const minTileX = Math.min(...tiles.map((tile) => tile.tileX));
  const minTileY = Math.min(...tiles.map((tile) => tile.tileY));
  const maxTileX = Math.max(...tiles.map((tile) => tile.tileX));
  const maxTileY = Math.max(...tiles.map((tile) => tile.tileY));
  const sourceTileSize = 256 * current.definition.density;
  canvas.width = (maxTileX - minTileX + 1) * sourceTileSize;
  canvas.height = (maxTileY - minTileY + 1) * sourceTileSize;
  context.clearRect(0, 0, canvas.width, canvas.height);

  const images = new Map<string, HTMLImageElement>();
  for (const image of rootElement.value?.querySelectorAll<HTMLImageElement>(
    `[data-cover-runtime-token="${token}"] img[data-selected-line-cover-tile]`,
  ) ?? []) {
    const tileId = image.dataset.coverTileId;
    if (tileId) images.set(tileId, image);
  }
  try {
    for (const tile of tiles) {
      const image = images.get(tile.id);
      if (!image || (image.complete && (image.naturalWidth <= 0 || image.naturalHeight <= 0))) {
        return false;
      }
      context.drawImage(
        image,
        (tile.tileX - minTileX) * sourceTileSize,
        (tile.tileY - minTileY) * sourceTileSize,
        sourceTileSize,
        sourceTileSize,
      );
    }
  } catch {
    return false;
  }
  if (!verifyCompositeTilePixels(context, tiles, minTileX, minTileY, sourceTileSize)) {
    return false;
  }
  if (!runtimeForToken(token)) return false;
  if (isPending) {
    // Keep the old verified canvas visible while the next camera-centred
    // mosaic decodes. Swap its definition and bitmap in the same microtask so
    // no empty/partially composed surface can be painted or cached.
    runtime.value = current;
    pendingRuntime.value = undefined;
    await nextTick();
    const committedCanvas = compositeCanvasElement.value;
    if (!committedCanvas) return false;
    let committedContext: CanvasRenderingContext2D | null = null;
    try {
      committedContext = committedCanvas.getContext("2d");
    } catch {
      committedContext = null;
    }
    if (!committedContext) {
      compositeLoaded.value = false;
      compositeVerified.value = false;
      return true;
    }
    committedCanvas.width = canvas.width;
    committedCanvas.height = canvas.height;
    committedContext.clearRect(0, 0, committedCanvas.width, committedCanvas.height);
    committedContext.drawImage(canvas, 0, 0);
  }
  compositeVerified.value = true;
  compositeLoaded.value = true;
  await nextTick();
  return true;
}

async function finishReady(token: number): Promise<void> {
  const current = runtimeForToken(token);
  if (!current || !current.entries.every((entry) => entry.state === "decoded")) return;
  const composed = await composeCanvas(token);
  if (!runtimeForToken(token)) return;
  if (!composed) {
    metrics.value = {
      ...metrics.value,
      rejectedComposites: metrics.value.rejectedComposites + 1,
    };
    if (pendingRuntime.value?.token !== token) setReady(false);
    scheduleRetry(token);
    return;
  }
  setReady(true);
}

function verifyCompositeTilePixels(
  context: CanvasRenderingContext2D,
  tiles: TransportMapBasemapTile[],
  minTileX: number,
  minTileY: number,
  sourceTileSize: number,
): boolean {
  if (typeof context.getImageData !== "function") return true;
  const offsets = [0.18, 0.5, 0.82] as const;
  try {
    for (const tile of tiles) {
      let opaqueSamples = 0;
      for (const yOffset of offsets) {
        for (const xOffset of offsets) {
          const x = Math.min(
            context.canvas.width - 1,
            Math.max(0, Math.floor((tile.tileX - minTileX + xOffset) * sourceTileSize)),
          );
          const y = Math.min(
            context.canvas.height - 1,
            Math.max(0, Math.floor((tile.tileY - minTileY + yOffset) * sourceTileSize)),
          );
          const alpha = context.getImageData(x, y, 1, 1).data[3] ?? 0;
          if (alpha >= 200) opaqueSamples += 1;
        }
      }
      // Carto and satellite tiles are opaque. Reject a tile-sized region when
      // at least 40% of its probes are transparent instead of caching a canvas
      // that only looks complete from its DOM rectangle.
      if (opaqueSamples < 6) return false;
    }
  } catch {
    return false;
  }
  return true;
}

function runtimeForToken(token: number): CoverRuntime | undefined {
  const current = runtime.value?.token === token
    ? runtime.value
    : pendingRuntime.value?.token === token
      ? pendingRuntime.value
      : undefined;
  if (!current) {
    metrics.value = {
      ...metrics.value,
      lateCallbacksIgnored: metrics.value.lateCallbacksIgnored + 1,
    };
    return undefined;
  }
  return current;
}

function scheduleCompleteImageScan(token: number): void {
  void nextTick(() => {
    const current = runtimeForToken(token);
    if (!current) return;
    const root = rootElement.value;
    if (!root) return;
    for (const image of root.querySelectorAll<HTMLImageElement>(
      `[data-cover-runtime-token="${token}"] img[data-selected-line-cover-tile]`,
    )) {
      if (image.complete && image.naturalWidth > 0) void decodeTile(image, token, image.dataset.coverTileId ?? "");
    }
  });
}

function updateTileState(token: number, tileKey: string, state: CoverTileState): void {
  const current = runtimeForToken(token);
  if (!current) return;
  const entry = current.entries.find((candidate) => candidate.key === tileKey);
  if (!entry || entry.state === state) return;
  const nextRuntime = {
    ...current,
    entries: current.entries.map((candidate) =>
      candidate.key === tileKey ? { ...candidate, state } : candidate,
    ),
  };
  if (pendingRuntime.value?.token === token) pendingRuntime.value = nextRuntime;
  else runtime.value = nextRuntime;
  syncMetrics();
  if (state === "error") {
    if (pendingRuntime.value?.token !== token) setReady(false);
    scheduleRetry(token);
    return;
  }
  const updated = runtimeForToken(token);
  if (state === "decoded" && updated?.entries.every((candidate) => candidate.state === "decoded")) {
    void finishReady(token);
  }
}

async function decodeTile(image: HTMLImageElement, token: number, tileKey: string): Promise<void> {
  if (!tileKey) return;
  const current = runtimeForToken(token);
  const entry = current?.entries.find((candidate) => candidate.key === tileKey);
  if (!entry || entry.state !== "loading") return;
  try {
    if (typeof image.decode === "function") await image.decode();
    if (image.complete && (image.naturalWidth <= 0 || image.naturalHeight <= 0)) {
      throw new Error("decoded cover tile has no pixels");
    }
    if (!runtimeForToken(token)) return;
    updateTileState(token, tileKey, "decoded");
  } catch {
    if (runtimeForToken(token)) updateTileState(token, tileKey, "error");
  }
}

function onTileLoad(event: Event, token: number, tileKey: string): void {
  const image = event.currentTarget;
  if (!(image instanceof HTMLImageElement)) return;
  void decodeTile(image, token, tileKey);
}

function onTileError(token: number, tileKey: string): void {
  updateTileState(token, tileKey, "error");
}

function scheduleRetry(token: number): void {
  const current = runtimeForToken(token);
  if (!current || retryTimer !== undefined) return;
  const options = GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.basemapCover;
  if (retryCountForKey >= options.retryCount) {
    metrics.value = {
      ...metrics.value,
      terminalFailures: metrics.value.terminalFailures + 1,
    };
    syncMetrics();
    return;
  }
  retryCountForKey += 1;
  metrics.value = { ...metrics.value, retries: metrics.value.retries + 1 };
  retryTimer = window.setTimeout(() => {
    retryTimer = undefined;
    rebuildDefinition();
  }, Math.max(0, options.retryDelayMs));
}

function rebuildDefinition(): void {
  clearRetryTimer();
  const nextKey = definitionInputKey.value;
  if (nextKey !== retryKey) {
    retryKey = nextKey;
    retryCountForKey = 0;
  }
  const token = ++definitionToken;
  pendingRuntime.value = undefined;
  if (!nextKey || !props.lineId || !props.anchorCamera || !props.lineBounds) {
    runtime.value = undefined;
    compositeLoaded.value = false;
    compositeVerified.value = false;
    setReady(false);
    return;
  }
  const nextDefinition = createSelectedLineBasemapCoverDefinition({
    lineId: props.lineId,
    anchorCamera: props.anchorCamera,
    lineBounds: props.lineBounds,
    layer: props.layer,
    basemapStyle: props.basemapStyle,
    options: coverOptions.value,
  });
  if (!nextDefinition) return;
  const nextRuntime: CoverRuntime = {
    token,
    definition: nextDefinition,
    entries: nextDefinition.tiles.map((tile) => ({ key: tile.id, tile, state: "loading" })),
  };
  const canCommitAtomically =
    ready.value &&
    compositeLoaded.value &&
    compositeVerified.value &&
    runtime.value !== undefined;
  if (canCommitAtomically) {
    pendingRuntime.value = nextRuntime;
  } else {
    runtime.value = nextRuntime;
    compositeLoaded.value = false;
    compositeVerified.value = false;
    setReady(false);
  }
  metrics.value = {
    ...metrics.value,
    rebuilds: metrics.value.rebuilds + 1,
    rebuildsDuringInteraction:
      metrics.value.rebuildsDuringInteraction + (props.interactionActive ? 1 : 0),
  };
  syncMetrics();
  scheduleCompleteImageScan(token);
}

watch(definitionInputKey, rebuildDefinition, { immediate: true });

onMounted(() => {
  mounted = true;
  syncMetrics();
  const token = runtime.value?.token;
  if (token !== undefined) scheduleCompleteImageScan(token);
  const pendingToken = pendingRuntime.value?.token;
  if (pendingToken !== undefined) scheduleCompleteImageScan(pendingToken);
});

onBeforeUnmount(() => {
  mounted = false;
  definitionToken += 1;
  clearRetryTimer();
  runtime.value = undefined;
  pendingRuntime.value = undefined;
  compositeLoaded.value = false;
  compositeVerified.value = false;
  setReady(false);
});

function tileStyle(tile: TransportMapBasemapTile): Record<string, string> {
  return {
    position: "absolute",
    left: `${tile.leftCssPx}px`,
    top: `${tile.topCssPx}px`,
    width: `${tile.widthCssPx}px`,
    height: `${tile.heightCssPx}px`,
    filter: basemapFilter(),
  };
}

function basemapFilter(): string {
  return props.layer === "satellite"
    ? `saturate(0.82) contrast(${props.contrast}) brightness(0.82)`
    : props.basemapStyle === "voyager"
      ? `saturate(1.32) contrast(${props.contrast}) brightness(0.96)`
      : `saturate(1.08) contrast(${props.contrast}) brightness(0.98)`;
}
</script>

<style scoped>
.selected-line-basemap-cover {
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: visible;
  pointer-events: none;
}

.selected-line-basemap-cover__definition {
  position: absolute;
  inset: 0;
  overflow: visible;
  transform-origin: 0 0;
  opacity: 0;
  will-change: var(--selected-line-cover-will-change, auto);
}

.selected-line-basemap-cover--ready .selected-line-basemap-cover__definition {
  opacity: 1;
}

.selected-line-basemap-cover__definition img,
.selected-line-basemap-cover__definition canvas {
  display: block;
  user-select: none;
}

.selected-line-basemap-cover__composite {
  position: absolute;
  display: block;
  image-rendering: auto;
  user-select: none;
}

.selected-line-basemap-cover__pending-sources {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
}
</style>
