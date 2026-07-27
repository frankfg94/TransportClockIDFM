import type { NetworkGhostLineView } from "./types";
import type {
  NetworkGhostCanvasRect,
  NetworkGhostCanvasSceneOptions,
  NetworkGhostCanvasTile,
} from "./networkGhostCanvas";

export interface NetworkGhostWorkerTile
  extends Omit<NetworkGhostCanvasTile, "lines"> {
  bitmap: ImageBitmap;
}

export interface NetworkGhostWorkerPlan {
  zoom: number;
  pixelRatio: number;
  tileSize: number;
  memoryBytes: number;
  tiles: Array<Omit<NetworkGhostCanvasTile, "lines">>;
}

export interface NetworkGhostWorkerRenderRequest {
  type: "render";
  generation: number;
  lines: NetworkGhostLineView[];
  sceneOptions: NetworkGhostCanvasSceneOptions;
  tileOptions: {
    zoom: number;
    viewport: NetworkGhostCanvasRect;
    pixelRatio: number;
    tileSize: number;
    maxTiles: number;
    memoryBudgetBytes: number;
  };
}

export interface NetworkGhostWorkerCancelRequest {
  type: "cancel";
  generation: number;
}

export type NetworkGhostWorkerRequest =
  | NetworkGhostWorkerRenderRequest
  | NetworkGhostWorkerCancelRequest;

export interface NetworkGhostWorkerTilesResponse {
  type: "tiles";
  generation: number;
  phase: "visible" | "overscan";
  signature: string;
  plan: NetworkGhostWorkerPlan;
  tiles: NetworkGhostWorkerTile[];
  lineCount: number;
  segmentCount: number;
  workerDurationMs: number;
}

export interface NetworkGhostWorkerErrorResponse {
  type: "error";
  generation: number;
  message: string;
}

export type NetworkGhostWorkerResponse =
  | NetworkGhostWorkerTilesResponse
  | NetworkGhostWorkerErrorResponse;

export function createSerializableNetworkGhostLines(
  lines: NetworkGhostLineView[],
): NetworkGhostLineView[] {
  return lines.map((line) => ({
    id: line.id,
    label: line.label,
    mode: line.mode,
    family: line.family,
    ref: line.ref,
    color: line.color,
    textColor: line.textColor,
    iconUrl: line.iconUrl,
    iconUrls: line.iconUrls ? [...line.iconUrls] : undefined,
    isBus: line.isBus,
    anchorStationId: line.anchorStationId,
    anchorX: line.anchorX,
    anchorY: line.anchorY,
    stations: [],
    segments: line.segments.map((segment) => ({
      id: segment.id,
      fromStationId: segment.fromStationId,
      toStationId: segment.toStationId,
      fromX: segment.fromX,
      fromY: segment.fromY,
      toX: segment.toX,
      toY: segment.toY,
      polyline: segment.polyline?.map((point) => ({ x: point.x, y: point.y })),
      level: segment.level,
    })),
    geometrySource: line.geometrySource,
    geometryAttempts: [],
    geometryPending: line.geometryPending,
    loadOrder: line.loadOrder,
  }));
}

export function createSerializableNetworkGhostRect(
  rect: NetworkGhostCanvasRect,
): NetworkGhostCanvasRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

export function createSerializableNetworkGhostPlan(
  plan: {
    zoom: number;
    pixelRatio: number;
    tileSize: number;
    memoryBytes: number;
    tiles: NetworkGhostCanvasTile[];
  },
): NetworkGhostWorkerPlan {
  return {
    zoom: plan.zoom,
    pixelRatio: plan.pixelRatio,
    tileSize: plan.tileSize,
    memoryBytes: plan.memoryBytes,
    tiles: plan.tiles.map(({ lines: _lines, ...tile }) => tile),
  };
}

export function createNetworkGhostSceneSignature(
  lines: NetworkGhostLineView[],
  options?: NetworkGhostCanvasSceneOptions,
): string {
  let hash = 2_166_136_261;
  if (options) {
    hash = hashNumber(hash, options.viewBoxWidth);
    hash = hashNumber(hash, options.viewBoxHeight);
    hash = hashNumber(hash, options.paddingX);
    hash = hashNumber(hash, options.paddingY);
  }
  lines.forEach((line) => {
    hash = hashString(hash, line.id);
    line.segments.forEach((segment) => {
      hash = hashString(hash, segment.id);
      const points = segment.polyline?.length
        ? segment.polyline
        : [
            { x: segment.fromX, y: segment.fromY },
            { x: segment.toX, y: segment.toY },
          ];
      points.forEach((point) => {
        hash = hashNumber(hash, point.x);
        hash = hashNumber(hash, point.y);
      });
    });
  });

  const segmentCount = lines.reduce((count, line) => count + line.segments.length, 0);
  return `${lines.length}-${segmentCount}-${hash >>> 0}`;
}

function hashString(initial: number, value: string): number {
  let hash = initial;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16_777_619);
  }
  return hash;
}

function hashNumber(initial: number, value: number): number {
  return Math.imul(initial ^ Math.round(value * 10_000), 16_777_619);
}
