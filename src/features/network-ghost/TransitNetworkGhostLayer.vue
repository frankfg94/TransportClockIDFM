<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "../../i18n";
import {
  buildRoundedPolylinePath,
  createScreenSpaceRoundedPolylineOptions,
} from "../line-map/lineGeometry";
import { recordLineMapRuntimeMetrics } from "../line-map/lineMapPerformance";
import {
  buildNetworkGhostHitScene,
  buildNetworkGhostCanvasScene,
  createNetworkGhostTilePlan,
  drawNetworkGhostCanvasTile,
  hitTestNetworkGhostScene,
  NetworkGhostTileLruCache,
  type NetworkGhostCanvasRect,
  type NetworkGhostHitScene,
  type NetworkGhostCanvasTile,
  type NetworkGhostCanvasTilePlan,
} from "./networkGhostCanvas";
import {
  createNetworkGhostSceneSignature,
  createSerializableNetworkGhostLines,
  createSerializableNetworkGhostPlan,
  createSerializableNetworkGhostRect,
  type NetworkGhostWorkerPlan,
  type NetworkGhostWorkerResponse,
  type NetworkGhostWorkerTile,
} from "./networkGhostCanvasWorkerProtocol";
import type { NetworkGhostLineView, NetworkGhostQuayView } from "./types";

interface GhostTapRequest {
  id: number;
  lineId: string;
  mode?: "select" | "toggle";
}

interface RenderLayer {
  id: number;
  ready: boolean;
  signature: string;
  plan: NetworkGhostWorkerPlan;
  fallbackPlan?: NetworkGhostCanvasTilePlan;
  lineCount: number;
  segmentCount: number;
  workerDurationMs?: number;
  roundTripMs?: number;
  swapDurationMs?: number;
}

const props = withDefaults(
  defineProps<{
    lines: NetworkGhostLineView[];
    quays?: NetworkGhostQuayView[];
    anchorX: number;
    anchorY: number;
    viewBoxWidth?: number;
    viewBoxHeight?: number;
    paddingX?: number;
    paddingY?: number;
    zoom?: number;
    viewportRect?: NetworkGhostCanvasRect;
    pixelRatio?: number;
    moving?: boolean;
    zooming?: boolean;
    tooltipTarget?: string;
    reduceMotion?: boolean;
    resetKey?: number;
    tapRequest?: GhostTapRequest;
  }>(),
  {
    quays: () => [],
    viewBoxWidth: 1080,
    viewBoxHeight: 620,
    paddingX: 78,
    paddingY: 68,
    zoom: 1,
    viewportRect: () => ({ x: 0, y: 0, width: 1080, height: 620 }),
    pixelRatio: 1,
    moving: false,
    zooming: false,
    tooltipTarget: "",
    reduceMotion: false,
    resetKey: 0,
  },
);

const emit = defineEmits<{
  activeLineChange: [line: NetworkGhostLineView | undefined];
  linePointerDown: [line: NetworkGhostLineView, event: PointerEvent];
}>();

const { t } = useI18n();
const root = ref<HTMLDivElement>();
const hoveredLineId = ref("");
const pinnedLineId = ref("");
const pointerX = ref(0);
const pointerY = ref(0);
const renderLayers = ref<RenderLayer[]>([]);
const interactionScene = ref<NetworkGhostHitScene>();
const bitmapMemoryBudget = getBitmapMemoryBudget();
const bitmapCache = new NetworkGhostTileLruCache<ImageBitmap>(16, bitmapMemoryBudget);
const activeLineId = computed(() => pinnedLineId.value || hoveredLineId.value);
const activeLine = computed(() => props.lines.find((line) => line.id === activeLineId.value));
let renderRequest = 0;
let renderFrame: number | undefined;
let renderTimer: number | undefined;
let progressiveRenderTimer: number | undefined;
let lastRenderStartedAt = 0;
let canvasWorker: Worker | undefined;
let workerUnavailable = false;
const queuedOverscan = new Map<number, NetworkGhostWorkerTile[]>();
const renderRequestedAt = new Map<number, number>();
const postRenderFrames = new Set<number>();
const fallbackFrames = new Map<number, () => void>();
let abandonedGenerations = 0;
let disposed = false;

const tooltip = computed(() => {
  const line = activeLine.value;
  if (!line) return undefined;

  const zoom = Math.max(props.zoom, 0.01);
  const inverseZoom = 1 / zoom;
  const width = Math.max(148, Math.min(280, line.label.length * 8.4 + 94));
  const height = 50;
  const margin = 8 * inverseZoom;
  const offsetX = 14 * inverseZoom;
  const offsetY = 52 * inverseZoom;
  const sourceX = hoveredLineId.value === line.id ? pointerX.value : toSvgX(line.anchorX);
  const sourceY = hoveredLineId.value === line.id ? pointerY.value : toSvgY(line.anchorY);

  return {
    line,
    width,
    height,
    inverseZoom,
    x: Math.max(
      margin,
      Math.min(props.viewBoxWidth - width * inverseZoom - margin, sourceX + offsetX),
    ),
    y: Math.max(
      margin,
      Math.min(props.viewBoxHeight - height * inverseZoom - margin, sourceY - offsetY),
    ),
  };
});

watch(
  () => props.resetKey,
  () => {
    pinnedLineId.value = "";
    hoveredLineId.value = "";
  },
);

watch(
  () => props.lines,
  (nextLines) => {
    const lineIds = nextLines.map((line) => line.id).join("|");
    if (pinnedLineId.value && !lineIds.includes(pinnedLineId.value)) {
      pinnedLineId.value = "";
    }
    if (hoveredLineId.value && !lineIds.includes(hoveredLineId.value)) {
      hoveredLineId.value = "";
    }
    scheduleRender();
  },
  { immediate: true },
);

watch(
  () => [props.tapRequest?.id, props.lines.map((line) => line.id).join("|")] as const,
  () => {
    const request = props.tapRequest;
    if (!request) return;

    const line = props.lines.find((item) => item.id === request.lineId);
    if (!line) return;

    if (request.mode === "select") {
      pinnedLineId.value = line.id;
      hoveredLineId.value = "";
    } else {
      togglePinnedLine(line);
    }
  },
  { immediate: true },
);

watch(
  () => [
    props.pixelRatio,
    props.viewportRect.x,
    props.viewportRect.y,
    props.viewportRect.width,
    props.viewportRect.height,
  ],
  () => scheduleRender(),
);

watch(
  () => props.zoom,
  () => {
    if (!props.moving && !props.zooming) scheduleRender();
  },
);

watch(
  () => props.moving,
  (moving) => {
    if (moving) {
      hoveredLineId.value = "";
      cancelScheduledRender();
      invalidatePendingRender();
      return;
    }
    scheduleRender(true);
  },
);

watch(
  () => props.zooming,
  (zooming) => {
    if (zooming) {
      cancelScheduledRender();
      invalidatePendingRender();
      return;
    }
    if (!props.moving) scheduleRender(true);
  },
);

watch(
  activeLine,
  (line) => {
    emit("activeLineChange", line);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  disposed = true;
  cancelScheduledRender();
  invalidatePendingRender();
  canvasWorker?.terminate();
  canvasWorker = undefined;
  cancelPostRenderFrames();
  cancelFallbackFrames();
  closeQueuedOverscan();
  bitmapCache.clear();
  renderLayers.value = [];
  interactionScene.value = undefined;
});

function scheduleRender(afterMotion = false): void {
  if (props.moving || typeof window === "undefined") return;

  if (afterMotion) {
    if (renderTimer !== undefined) window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => {
      renderTimer = undefined;
      scheduleRenderFrame();
    }, 48);
    return;
  }

  scheduleRenderFrame();
}

function scheduleRenderFrame(): void {
  if (
    renderFrame !== undefined ||
    progressiveRenderTimer !== undefined ||
    typeof window === "undefined"
  ) {
    return;
  }

  const progressive = props.lines.some((line) => line.geometryPending);
  const throttleRemaining = progressive
    ? Math.max(0, 160 - (performance.now() - lastRenderStartedAt))
    : 0;
  if (throttleRemaining > 0) {
    progressiveRenderTimer = window.setTimeout(() => {
      progressiveRenderTimer = undefined;
      scheduleRenderFrame();
    }, throttleRemaining);
    return;
  }

  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = undefined;
    createPendingLayer();
  });
}

function cancelScheduledRender(): void {
  if (typeof window === "undefined") return;
  if (renderFrame !== undefined) window.cancelAnimationFrame(renderFrame);
  if (renderTimer !== undefined) window.clearTimeout(renderTimer);
  if (progressiveRenderTimer !== undefined) window.clearTimeout(progressiveRenderTimer);
  renderFrame = undefined;
  renderTimer = undefined;
  progressiveRenderTimer = undefined;
}

function createPendingLayer(): void {
  if (props.moving) return;

  const id = ++renderRequest;
  lastRenderStartedAt = performance.now();
  const worker = getCanvasWorker();
  recordGhostPerfStage("request", {
    generation: id,
    lineCount: props.lines.length,
    renderer: worker ? "worker" : "main-thread-fallback",
  });
  if (worker) {
    const cloneStartedAt = performance.now();
    const lines = createSerializableNetworkGhostLines(props.lines);
    renderRequestedAt.set(id, performance.now());
    try {
      worker.postMessage({
        type: "render",
        generation: id,
        lines,
        sceneOptions: {
          viewBoxWidth: props.viewBoxWidth,
          viewBoxHeight: props.viewBoxHeight,
          paddingX: props.paddingX,
          paddingY: props.paddingY,
          zoom: props.zoom,
        },
        tileOptions: {
          zoom: props.zoom,
          viewport: createSerializableNetworkGhostRect(props.viewportRect),
          pixelRatio: props.pixelRatio,
          tileSize: 512,
          maxTiles: 16,
          memoryBudgetBytes: bitmapMemoryBudget,
        },
      });
      recordGhostPerfStage("worker-posted", {
        generation: id,
        cloneMs: performance.now() - cloneStartedAt,
      });
      recordLineMapRuntimeMetrics({
        ghostCloneMs: performance.now() - cloneStartedAt,
      });
    } catch (error) {
      recordGhostPerfStage("worker-clone-failed", {
        generation: id,
        message: error instanceof Error ? error.message : String(error),
      });
      renderRequestedAt.delete(id);
      disableWorkerAndFallback(id);
    }
    return;
  }

  createFallbackLayer(id);
}

function createFallbackLayer(id: number): void {
  if (id !== renderRequest || props.moving) return;
  const startedAt = performance.now();
  const scene = buildNetworkGhostCanvasScene(props.lines, {
    viewBoxWidth: props.viewBoxWidth,
    viewBoxHeight: props.viewBoxHeight,
    paddingX: props.paddingX,
    paddingY: props.paddingY,
    zoom: props.zoom,
  });
  const plan = createNetworkGhostTilePlan(scene, {
    zoom: props.zoom,
    viewport: props.viewportRect,
    pixelRatio: props.pixelRatio,
    tileSize: 512,
    maxTiles: 16,
    memoryBudgetBytes: bitmapMemoryBudget,
  });
  const layer: RenderLayer = {
    id,
    ready: false,
    signature: createNetworkGhostSceneSignature(props.lines, {
      viewBoxWidth: props.viewBoxWidth,
      viewBoxHeight: props.viewBoxHeight,
      paddingX: props.paddingX,
      paddingY: props.paddingY,
      zoom: props.zoom,
    }),
    plan: createSerializableNetworkGhostPlan(plan),
    fallbackPlan: plan,
    lineCount: scene.lines.length,
    segmentCount: scene.segmentCount,
  };

  renderLayers.value = [...renderLayers.value.slice(-1), layer];
  recordGhostPerfStage("fallback-plan", {
    generation: id,
    durationMs: performance.now() - startedAt,
    segmentCount: scene.segmentCount,
    tileCount: plan.tiles.length,
  });
  void nextTick(() => drawFallbackLayer(layer));
}

async function drawFallbackLayer(layer: RenderLayer): Promise<void> {
  const plan = layer.fallbackPlan;
  if (!plan) return;

  const visible = plan.tiles.filter((tile) => tile.priority === "visible");
  const overscan = plan.tiles.filter((tile) => tile.priority === "overscan");
  const visibleDrawn = await drawFallbackTilesOnePerFrame(layer, visible);
  if (!visibleDrawn) {
    recordGhostPerfStage("fallback-abandoned", { generation: layer.id });
    return;
  }

  completeLayer(layer);
  await drawFallbackTilesOnePerFrame(layer, overscan);
}

function getCanvasWorker(): Worker | undefined {
  if (workerUnavailable || typeof Worker === "undefined") return undefined;
  if (canvasWorker) return canvasWorker;

  try {
    canvasWorker = new Worker(
      new URL("./networkGhostCanvas.worker.ts", import.meta.url),
      { type: "module" },
    );
    canvasWorker.onmessage = (event: MessageEvent<NetworkGhostWorkerResponse>) => {
      void handleWorkerResponse(event.data);
    };
    canvasWorker.onerror = () => {
      disableWorkerAndFallback(renderRequest);
    };
    return canvasWorker;
  } catch {
    workerUnavailable = true;
    return undefined;
  }
}

async function handleWorkerResponse(response: NetworkGhostWorkerResponse): Promise<void> {
  if (response.type === "error") {
    if (response.generation === renderRequest) {
      disableWorkerAndFallback(response.generation);
    }
    return;
  }

  if (
    disposed ||
    response.generation !== renderRequest ||
    props.moving ||
    props.zooming
  ) {
    abandonedGenerations += 1;
    recordLineMapRuntimeMetrics({
      ghostAbandonedGenerations: abandonedGenerations,
    });
    closeWorkerTiles(response.tiles);
    return;
  }

  if (response.phase === "overscan") {
    const layer = renderLayers.value.find(({ id }) => id === response.generation);
    if (!layer?.ready) {
      queuedOverscan.set(response.generation, response.tiles);
      return;
    }
    await drawWorkerTiles(layer, response.tiles);
    return;
  }

  const layer: RenderLayer = {
    id: response.generation,
    ready: false,
    signature: response.signature,
    plan: response.plan,
    lineCount: response.lineCount,
    segmentCount: response.segmentCount,
    workerDurationMs: response.workerDurationMs,
    roundTripMs: performance.now() - (renderRequestedAt.get(response.generation) ?? performance.now()),
  };
  recordLineMapRuntimeMetrics({
    ghostWorkerMs: layer.workerDurationMs,
    ghostWorkerRoundTripMs: layer.roundTripMs,
  });
  recordGhostPerfStage("worker-visible", {
    generation: response.generation,
    workerMs: response.workerDurationMs,
    roundTripMs: layer.roundTripMs,
    segmentCount: response.segmentCount,
    tileCount: response.tiles.length,
  });
  renderLayers.value = [...renderLayers.value.slice(-1), layer];
  await nextTick();
  const swapStartedAt = performance.now();
  if (!(await drawWorkerTiles(layer, response.tiles))) {
    renderLayers.value = renderLayers.value.filter(({ id }) => id !== layer.id);
    return;
  }
  layer.swapDurationMs = performance.now() - swapStartedAt;
  recordLineMapRuntimeMetrics({ ghostMainSwapMs: layer.swapDurationMs });
  renderRequestedAt.delete(layer.id);

  completeLayer(layer);
  const overscan = queuedOverscan.get(layer.id);
  if (overscan) {
    queuedOverscan.delete(layer.id);
    await drawWorkerTiles(layer, overscan);
  }
}

function disableWorkerAndFallback(generation: number): void {
  if (generation !== renderRequest || disposed) return;
  workerUnavailable = true;
  canvasWorker?.terminate();
  canvasWorker = undefined;
  createFallbackLayer(generation);
}

async function drawWorkerTiles(
  layer: RenderLayer,
  tiles: NetworkGhostWorkerTile[],
): Promise<boolean> {
  if (layer.id !== renderRequest || !root.value) {
    closeWorkerTiles(tiles);
    return false;
  }

  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index];
    const canvas = root.value.querySelector<HTMLCanvasElement>(
      `canvas[data-layer-id="${layer.id}"][data-tile-id="${tile.id}"]`,
    );
    const context =
      canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
    if (!canvas) {
      closeWorkerTiles(tiles.slice(index));
      return false;
    }
    if (!context) {
      tile.bitmap.close();
      continue;
    }

    try {
      const cacheKey = getTileCacheKey(layer, tile);
      const cached = bitmapCache.get(cacheKey);
      const bitmap = cached ?? tile.bitmap;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, tile.pixelWidth, tile.pixelHeight);
      context.drawImage(bitmap, 0, 0, tile.pixelWidth, tile.pixelHeight);
      if (cached) {
        tile.bitmap.close();
      } else {
        bitmapCache.set(cacheKey, tile.bitmap, tile.memoryBytes);
      }
    } catch {
      closeWorkerTiles(tiles.slice(index));
      return false;
    }
  }

  return true;
}

async function drawFallbackTilesOnePerFrame(
  layer: RenderLayer,
  tiles: NetworkGhostCanvasTile[],
): Promise<boolean> {
  const plan = layer.fallbackPlan;
  if (!plan) return false;

  for (const tile of tiles) {
    await nextAnimationFrame();
    if (layer.id !== renderRequest || props.moving || !root.value) return false;

    const canvas = root.value.querySelector<HTMLCanvasElement>(
      `canvas[data-layer-id="${layer.id}"][data-tile-id="${tile.id}"]`,
    );
    const context =
      canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
    if (!canvas) return false;
    if (!context) continue;

    try {
      const cacheKey = getTileCacheKey(layer, tile);
      const cached = bitmapCache.get(cacheKey);
      if (cached) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, tile.pixelWidth, tile.pixelHeight);
        context.drawImage(cached, 0, 0, tile.pixelWidth, tile.pixelHeight);
      } else {
        drawNetworkGhostCanvasTile(context, tile, plan);
        cacheTileBitmap(canvas, cacheKey, tile.memoryBytes);
      }
    } catch {
      return false;
    }
  }

  return true;
}

function completeLayer(layer: RenderLayer): void {
  if (layer.id !== renderRequest || props.moving) return;

  layer.ready = true;
  renderLayers.value = renderLayers.value.map((item) =>
    item.id === layer.id ? { ...item, ready: true } : item,
  );
  recordRenderProbe(layer);
  scheduleInteractionScene(layer.id);

  schedulePostRenderFrame(() => {
    if (layer.id === renderRequest) {
      renderLayers.value = renderLayers.value.filter(({ id }) => id === layer.id);
    }
  });
}

function scheduleInteractionScene(layerId: number): void {
  interactionScene.value = undefined;
  schedulePostRenderFrame(() => {
    if (layerId !== renderRequest || props.moving) return;
    interactionScene.value = buildNetworkGhostHitScene(props.lines, {
      viewBoxWidth: props.viewBoxWidth,
      viewBoxHeight: props.viewBoxHeight,
      paddingX: props.paddingX,
      paddingY: props.paddingY,
      zoom: props.zoom,
    });
  });
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    const handle = window.requestAnimationFrame(() => {
      fallbackFrames.delete(handle);
      resolve();
    });
    fallbackFrames.set(handle, resolve);
  });
}

function invalidatePendingRender(): void {
  renderRequest += 1;
  cancelPostRenderFrames();
  cancelFallbackFrames();
  canvasWorker?.postMessage({ type: "cancel", generation: renderRequest });
  for (const [generation, tiles] of queuedOverscan) {
    if (generation < renderRequest) {
      closeWorkerTiles(tiles);
      queuedOverscan.delete(generation);
    }
  }
  for (const generation of renderRequestedAt.keys()) {
    if (generation < renderRequest) {
      renderRequestedAt.delete(generation);
    abandonedGenerations += 1;
    recordLineMapRuntimeMetrics({
      ghostAbandonedGenerations: abandonedGenerations,
    });
    }
  }
  renderLayers.value = renderLayers.value.filter(({ ready }) => ready).slice(-1);
}

function schedulePostRenderFrame(callback: () => void): void {
  const handle = window.requestAnimationFrame(() => {
    postRenderFrames.delete(handle);
    callback();
  });
  postRenderFrames.add(handle);
}

function cancelPostRenderFrames(): void {
  if (typeof window === "undefined") return;
  postRenderFrames.forEach((handle) => window.cancelAnimationFrame(handle));
  postRenderFrames.clear();
}

function cancelFallbackFrames(): void {
  if (typeof window === "undefined") return;
  fallbackFrames.forEach((resolve, handle) => {
    window.cancelAnimationFrame(handle);
    resolve();
  });
  fallbackFrames.clear();
}

function closeWorkerTiles(tiles: NetworkGhostWorkerTile[]): void {
  tiles.forEach((tile) => tile.bitmap.close());
}

function closeQueuedOverscan(): void {
  queuedOverscan.forEach(closeWorkerTiles);
  queuedOverscan.clear();
}

function cacheTileBitmap(canvas: HTMLCanvasElement, key: string, bytes: number): void {
  if (typeof window === "undefined" || typeof window.createImageBitmap !== "function") return;

  void window
    .createImageBitmap(canvas)
    .then((bitmap) => {
      if (disposed) {
        bitmap.close();
        return;
      }
      bitmapCache.set(key, bitmap, bytes);
    })
    .catch(() => undefined);
}

function getTileCacheKey(layer: RenderLayer, tile: { id: string }): string {
  return [
    layer.signature,
    layer.plan.zoom.toFixed(4),
    layer.plan.pixelRatio.toFixed(3),
    tile.id,
  ].join(":");
}

function getBitmapMemoryBudget(): number {
  if (typeof window === "undefined") return 64 * 1_024 * 1_024;

  const capacitor = (window as Window & { Capacitor?: unknown }).Capacitor;
  return (capacitor ? 32 : 64) * 1_024 * 1_024;
}

function getLayerClass(layer: RenderLayer): Record<string, boolean> {
  return {
    "network-ghost-canvas-layer--ready": layer.ready,
    "network-ghost-canvas-layer--pending": !layer.ready,
  };
}

function getTileStyle(
  tile: Pick<NetworkGhostCanvasTile, "x" | "y" | "width" | "height">,
  layer: RenderLayer,
) {
  return {
    left: `${tile.x / layer.plan.zoom}px`,
    top: `${tile.y / layer.plan.zoom}px`,
    width: `${tile.width / layer.plan.zoom}px`,
    height: `${tile.height / layer.plan.zoom}px`,
  };
}

function getAccessibilityStyle(line: NetworkGhostLineView) {
  return {
    left: `${toSvgX(line.anchorX)}px`,
    top: `${toSvgY(line.anchorY)}px`,
    width: `${28 / props.zoom}px`,
    height: `${28 / props.zoom}px`,
  };
}

function toSvgX(value: number): number {
  return props.paddingX + value * (props.viewBoxWidth - props.paddingX * 2);
}

function toSvgY(value: number): number {
  return props.paddingY + value * (props.viewBoxHeight - props.paddingY * 2);
}

function showLine(line: NetworkGhostLineView, event?: PointerEvent): void {
  if (props.moving || event?.pointerType === "touch" || pinnedLineId.value) return;
  hoveredLineId.value = line.id;
  if (event) updatePointer(event, line);
}

function handlePointerMove(event: PointerEvent): void {
  if (props.moving || pinnedLineId.value) return;

  const line = getLineAtPointer(event);
  if (!line) {
    hoveredLineId.value = "";
    return;
  }

  hoveredLineId.value = line.id;
  updatePointer(event, line);
}

function handlePointerDown(event: PointerEvent): void {
  if (props.moving || event.button !== 0) return;
  const line = getLineAtPointer(event);
  if (line) emit("linePointerDown", line, event);
}

function handleAccessiblePointerDown(
  line: NetworkGhostLineView,
  event: PointerEvent,
): void {
  if (!props.moving && event.button === 0) emit("linePointerDown", line, event);
}

function hideLine(line?: NetworkGhostLineView): void {
  if (!line || hoveredLineId.value === line.id) hoveredLineId.value = "";
}

function togglePinnedLine(line: NetworkGhostLineView): void {
  pinnedLineId.value = pinnedLineId.value === line.id ? "" : line.id;
  hoveredLineId.value = "";
}

function getLineAtPointer(event: PointerEvent): NetworkGhostLineView | undefined {
  const scene = interactionScene.value;
  const rect = root.value?.getBoundingClientRect();
  if (!scene || !rect || !props.zoom) return undefined;

  return hitTestNetworkGhostScene(
    scene,
    {
      x: (event.clientX - rect.left) / props.zoom,
      y: (event.clientY - rect.top) / props.zoom,
    },
    10 / props.zoom,
  );
}

function updatePointer(event: PointerEvent, line: NetworkGhostLineView): void {
  const rect = root.value?.getBoundingClientRect();
  if (!rect?.width || !rect.height) {
    pointerX.value = toSvgX(line.anchorX);
    pointerY.value = toSvgY(line.anchorY);
    return;
  }

  pointerX.value = (event.clientX - rect.left) / props.zoom;
  pointerY.value = (event.clientY - rect.top) / props.zoom;
}

function getLineVariables(line: NetworkGhostLineView) {
  return {
    "--network-ghost-color": line.color,
    "--network-ghost-width": line.isBus ? "4px" : "5px",
  };
}

function getSegmentPath(segment: NetworkGhostLineView["segments"][number]): string {
  const points = segment.polyline?.length
    ? segment.polyline.map((point) => ({ x: toSvgX(point.x), y: toSvgY(point.y) }))
    : [
        { x: toSvgX(segment.fromX), y: toSvgY(segment.fromY) },
        { x: toSvgX(segment.toX), y: toSvgY(segment.toY) },
      ];

  return buildRoundedPolylinePath(points, createScreenSpaceRoundedPolylineOptions(props.zoom)).path;
}

function getStationRadius(line: NetworkGhostLineView): number {
  return (line.isBus ? 3 : 4) / props.zoom;
}

function getQuayRadius(): number {
  return 3.2 / props.zoom;
}

function recordRenderProbe(layer: RenderLayer): void {
  if (!import.meta.dev || typeof window === "undefined" || !location.search.includes("mapPerf=1")) {
    return;
  }

  console.info("[line-map:perf]", JSON.stringify({
    ghostLines: layer.lineCount,
    ghostSegments: layer.segmentCount,
    ghostTiles: layer.plan.tiles.length,
    ghostCanvasDraws:
      layer.fallbackPlan?.tiles.reduce((count, tile) => count + tile.lines.length, 0) ??
      layer.plan.tiles.length,
    ghostWorkerMs: layer.workerDurationMs,
    ghostWorkerRoundTripMs: layer.roundTripMs,
    ghostMainSwapMs: layer.swapDurationMs,
    ghostAbandonedGenerations: abandonedGenerations,
  }));
}

function recordGhostPerfStage(stage: string, details: Record<string, unknown>): void {
  if (!import.meta.dev || typeof window === "undefined" || !location.search.includes("mapPerf=1")) {
    return;
  }

  console.info("[line-map:perf:ghost]", JSON.stringify({ stage, ...details }));
}
</script>

<template>
  <div
    ref="root"
    class="network-ghost-layer"
    :class="{
      'network-ghost-layer--moving': moving,
      'network-ghost-layer--zooming': zooming,
      'network-ghost-layer--reduce-motion': reduceMotion,
    }"
    data-testid="network-ghost-layer"
    @pointermove="handlePointerMove"
    @pointerdown="handlePointerDown"
    @pointerleave="hideLine()"
  >
    <div
      v-for="layer in renderLayers"
      :key="layer.id"
      class="network-ghost-canvas-layer"
      :class="getLayerClass(layer)"
      :data-layer-id="layer.id"
      aria-hidden="true"
    >
      <canvas
        v-for="tile in layer.plan.tiles"
        :key="tile.id"
        class="network-ghost-canvas-tile"
        :data-layer-id="layer.id"
        :data-tile-id="tile.id"
        :data-priority="tile.priority"
        :width="tile.pixelWidth"
        :height="tile.pixelHeight"
        :style="getTileStyle(tile, layer)"
      ></canvas>
    </div>

    <button
      v-for="line in lines"
      :key="`${line.id}:accessibility`"
      class="network-ghost-line__accessibility-button"
      :class="{
        'network-ghost-line__accessibility-button--active': activeLineId === line.id,
        'network-ghost-line__accessibility-button--hovered': hoveredLineId === line.id,
      }"
      type="button"
      :data-network-ghost-line="line.id"
      :aria-label="t('lineMap.ghostLineAria', { line: line.label })"
      :style="getAccessibilityStyle(line)"
      @pointerenter="showLine(line, $event)"
      @pointerdown="handleAccessiblePointerDown(line, $event)"
      @pointerleave="hideLine(line)"
      @focus="hoveredLineId = line.id"
      @blur="hideLine(line)"
      @click.stop="togglePinnedLine(line)"
      @keydown.enter.prevent="togglePinnedLine(line)"
      @keydown.space.prevent="togglePinnedLine(line)"
    ></button>
  </div>

  <Teleport :to="tooltipTarget || 'body'" :disabled="!tooltipTarget">
    <g class="network-ghost-svg-overlay">
      <g
        v-if="activeLine"
        class="network-ghost-line network-ghost-line--active"
        :class="{
          'network-ghost-line--hovered': hoveredLineId === activeLine.id,
          'network-ghost-line--bus': activeLine.isBus,
        }"
        :style="getLineVariables(activeLine)"
        :data-network-ghost-line-id="activeLine.id"
      >
        <path
          v-for="segment in activeLine.segments"
          :key="`${activeLine.id}:${segment.id}:active`"
          class="network-ghost-line__segment network-ghost-line__segment--active-overlay"
          :d="getSegmentPath(segment)"
        />
        <g class="network-ghost-line__stations" aria-hidden="true">
          <circle
            v-for="station in activeLine.stations"
            :key="`${activeLine.id}:${station.id}:station`"
            class="network-ghost-line__station"
            :cx="toSvgX(station.x)"
            :cy="toSvgY(station.y)"
            :r="getStationRadius(activeLine)"
          />
        </g>
      </g>

      <g v-if="quays.length > 0" class="network-ghost-quays" data-testid="network-ghost-quays">
        <line
          v-for="quay in quays"
          :key="`${quay.id}:connector`"
          class="network-ghost-quays__connector"
          :x1="toSvgX(anchorX)"
          :y1="toSvgY(anchorY)"
          :x2="toSvgX(quay.x)"
          :y2="toSvgY(quay.y)"
        />
        <circle
          v-for="quay in quays"
          :key="quay.id"
          class="network-ghost-quays__dot"
          :cx="toSvgX(quay.x)"
          :cy="toSvgY(quay.y)"
          :r="getQuayRadius()"
        >
          <title>{{ quay.label }}</title>
        </circle>
      </g>

      <g
        v-if="tooltip"
        class="network-ghost-tooltip"
        :transform="`
          translate(${tooltip.x} ${tooltip.y})
          scale(${tooltip.inverseZoom})
        `"
        pointer-events="none"
      >
        <rect
          class="network-ghost-tooltip__surface"
          :width="tooltip.width"
          :height="tooltip.height"
          rx="10"
        />
        <rect
          class="network-ghost-tooltip__icon-fallback"
          x="9"
          y="9"
          width="32"
          height="32"
          rx="7"
          :fill="tooltip.line.color"
        />
        <text
          class="network-ghost-tooltip__icon-label"
          x="25"
          y="30"
          text-anchor="middle"
          :style="{ fill: tooltip.line.textColor }"
        >
          {{ tooltip.line.label }}
        </text>
        <image
          v-if="tooltip.line.iconUrl"
          class="network-ghost-tooltip__icon"
          :href="tooltip.line.iconUrl"
          x="7"
          y="7"
          width="36"
          height="36"
          preserveAspectRatio="xMidYMid meet"
        />
        <text x="50" y="21">{{ tooltip.line.label }}</text>
        <text class="network-ghost-tooltip__mode" x="50" y="37">
          {{ tooltip.line.mode }}
        </text>
      </g>
    </g>
  </Teleport>
</template>

<style scoped>
.network-ghost-layer {
  height: 100%;
  position: relative;
  width: 100%;
}

.network-ghost-canvas-layer {
  inset: 0;
  opacity: 0;
  pointer-events: none;
  position: absolute;
}

.network-ghost-canvas-layer--ready {
  opacity: 1;
}

.network-ghost-canvas-tile {
  display: block;
  pointer-events: none;
  position: absolute;
}

.network-ghost-line__accessibility-button {
  background: transparent;
  border: 0;
  border-radius: 50%;
  opacity: 0;
  padding: 0;
  pointer-events: none;
  position: absolute;
  transform: translate(-50%, -50%);
}

.network-ghost-line__accessibility-button:focus-visible {
  background: color-mix(in srgb, var(--idfm-blue) 16%, transparent);
  box-shadow: 0 0 0 3px rgba(0, 100, 255, 0.24);
  opacity: 1;
}

.network-ghost-line__segment {
  fill: none;
  pointer-events: none;
  stroke: var(--network-ghost-color);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-opacity: 1;
  stroke-width: var(--network-ghost-width);
  vector-effect: non-scaling-stroke;
}

.network-ghost-line__station {
  fill: #ffffff;
  pointer-events: none;
  stroke: var(--network-ghost-color);
  stroke-width: 2px;
  vector-effect: non-scaling-stroke;
}

.network-ghost-quays__connector {
  pointer-events: none;
  stroke: rgba(15, 23, 42, 0.42);
  stroke-dasharray: 3 3;
  stroke-width: 1.2px;
  vector-effect: non-scaling-stroke;
}

.network-ghost-quays__dot {
  fill: #ffffff;
  pointer-events: auto;
  stroke: #0f172a;
  stroke-width: 1.5px;
  vector-effect: non-scaling-stroke;
}

.network-ghost-tooltip__surface {
  fill: rgba(255, 255, 255, 0.98);
  filter: drop-shadow(0 8px 14px rgba(15, 23, 42, 0.18));
  stroke: rgba(15, 23, 42, 0.14);
  stroke-width: 1px;
}

.network-ghost-tooltip text {
  fill: #0f172a;
  font-size: 12px;
  font-weight: 900;
}

.network-ghost-tooltip__mode {
  fill: #64748b !important;
  font-size: 9px !important;
  font-weight: 750 !important;
  text-transform: uppercase;
}

.network-ghost-tooltip__icon-label {
  font-size: 10px !important;
}

@media (prefers-reduced-motion: reduce) {
  .network-ghost-canvas-layer {
    transition: none;
  }
}
</style>
