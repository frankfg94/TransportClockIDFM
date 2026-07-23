import {
  buildRoundedPolylinePath,
  createScreenSpaceRoundedPolylineOptions,
  type LineGeometryCornerDecision,
  type LineGeometryPoint,
} from "../line-map/lineGeometry";
import type { NetworkGhostLineView } from "./types";

export interface NetworkGhostCanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NetworkGhostCanvasSceneOptions {
  viewBoxWidth: number;
  viewBoxHeight: number;
  paddingX: number;
  paddingY: number;
  zoom: number;
}

export interface NetworkGhostCanvasSegment {
  id: string;
  lineId: string;
  points: LineGeometryPoint[];
  path: string;
  corners: LineGeometryCornerDecision[];
  bounds: NetworkGhostCanvasRect;
}

export interface NetworkGhostHitSegment {
  id: string;
  lineId: string;
  points: LineGeometryPoint[];
  bounds: NetworkGhostCanvasRect;
}

export interface NetworkGhostCanvasLine {
  line: NetworkGhostLineView;
  segments: NetworkGhostCanvasSegment[];
  bounds: NetworkGhostCanvasRect;
}

export interface NetworkGhostCanvasScene {
  lines: NetworkGhostCanvasLine[];
  segmentCount: number;
  viewBoxWidth: number;
  viewBoxHeight: number;
  zoom: number;
  cellSize: number;
  spatialIndex: Map<string, NetworkGhostCanvasSegment[]>;
  lineById: Map<string, NetworkGhostLineView>;
}

export interface NetworkGhostHitScene {
  segmentCount: number;
  cellSize: number;
  spatialIndex: Map<string, NetworkGhostHitSegment[]>;
  lineById: Map<string, NetworkGhostLineView>;
}

export interface NetworkGhostTilePlanOptions {
  zoom: number;
  viewport: NetworkGhostCanvasRect;
  pixelRatio: number;
  tileSize?: number;
  maxTiles?: number;
  memoryBudgetBytes?: number;
}

export interface NetworkGhostCanvasTileLine {
  line: NetworkGhostLineView;
  segments: NetworkGhostCanvasSegment[];
}

export interface NetworkGhostCanvasTile {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  memoryBytes: number;
  priority: "visible" | "overscan";
  lines: NetworkGhostCanvasTileLine[];
}

export interface NetworkGhostCanvasTilePlan {
  zoom: number;
  pixelRatio: number;
  tileSize: number;
  memoryBytes: number;
  tiles: NetworkGhostCanvasTile[];
}

export interface NetworkGhostCacheEntry {
  close?: () => void;
}

export class NetworkGhostTileLruCache<T extends NetworkGhostCacheEntry> {
  readonly entries = new Map<string, { value: T; bytes: number }>();
  private residentBytes = 0;

  constructor(
    readonly maxEntries: number,
    readonly maxBytes: number,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get bytes(): number {
    return this.residentBytes;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, bytes: number): void {
    const existing = this.entries.get(key);
    if (existing) {
      this.residentBytes -= existing.bytes;
      if (existing.value !== value) existing.value.close?.();
      this.entries.delete(key);
    }

    const safeBytes = Math.max(0, Math.floor(bytes));
    this.entries.set(key, { value, bytes: safeBytes });
    this.residentBytes += safeBytes;
    this.evictOverflow();
  }

  clear(): void {
    this.entries.forEach(({ value }) => value.close?.());
    this.entries.clear();
    this.residentBytes = 0;
  }

  private evictOverflow(): void {
    while (
      this.entries.size > Math.max(0, this.maxEntries) ||
      this.residentBytes > Math.max(0, this.maxBytes)
    ) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;

      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      if (oldest) {
        this.residentBytes -= oldest.bytes;
        oldest.value.close?.();
      }
    }
  }
}

const DEFAULT_TILE_SIZE = 512;
const DEFAULT_MAX_TILES = 16;
const SPATIAL_CELL_SIZE = 64;

export function buildNetworkGhostCanvasScene(
  lines: NetworkGhostLineView[],
  options: NetworkGhostCanvasSceneOptions,
): NetworkGhostCanvasScene {
  const spatialIndex = new Map<string, NetworkGhostCanvasSegment[]>();
  const sceneLines = lines.map((line) => {
    const segments = line.segments.flatMap((segment) => {
      const rawPoints = segment.polyline?.length
        ? segment.polyline
        : [
            { x: segment.fromX, y: segment.fromY },
            { x: segment.toX, y: segment.toY },
          ];
      const points = rawPoints
        .map((point) => ({
          x: toSceneX(point.x, options),
          y: toSceneY(point.y, options),
        }))
        .filter(isFinitePoint);

      if (points.length < 2) return [];

      const rounded = buildRoundedPolylinePath(
        points,
        createScreenSpaceRoundedPolylineOptions(options.zoom),
      );
      const canvasSegment: NetworkGhostCanvasSegment = {
        id: segment.id,
        lineId: line.id,
        points,
        path: rounded.path,
        corners: rounded.corners,
        bounds: getPointBounds(points),
      };

      addSegmentToSpatialIndex(spatialIndex, canvasSegment, SPATIAL_CELL_SIZE);
      return [canvasSegment];
    });

    return {
      line,
      segments,
      bounds: mergeBounds(segments.map((segment) => segment.bounds)),
    };
  });

  return {
    lines: sceneLines,
    segmentCount: sceneLines.reduce((count, line) => count + line.segments.length, 0),
    viewBoxWidth: options.viewBoxWidth,
    viewBoxHeight: options.viewBoxHeight,
    zoom: options.zoom,
    cellSize: SPATIAL_CELL_SIZE,
    spatialIndex,
    lineById: new Map(lines.map((line) => [line.id, line])),
  };
}

export function buildNetworkGhostHitScene(
  lines: NetworkGhostLineView[],
  options: NetworkGhostCanvasSceneOptions,
): NetworkGhostHitScene {
  const spatialIndex = new Map<string, NetworkGhostHitSegment[]>();
  let segmentCount = 0;

  lines.forEach((line) => {
    line.segments.forEach((segment) => {
      const rawPoints = segment.polyline?.length
        ? segment.polyline
        : [
            { x: segment.fromX, y: segment.fromY },
            { x: segment.toX, y: segment.toY },
          ];
      const points = rawPoints
        .map((point) => ({
          x: toSceneX(point.x, options),
          y: toSceneY(point.y, options),
        }))
        .filter(isFinitePoint);
      if (points.length < 2) return;

      const hitSegment: NetworkGhostHitSegment = {
        id: segment.id,
        lineId: line.id,
        points,
        bounds: getPointBounds(points),
      };
      addSegmentToSpatialIndex(spatialIndex, hitSegment, SPATIAL_CELL_SIZE);
      segmentCount += 1;
    });
  });

  return {
    segmentCount,
    cellSize: SPATIAL_CELL_SIZE,
    spatialIndex,
    lineById: new Map(lines.map((line) => [line.id, line])),
  };
}

export function createNetworkGhostTilePlan(
  scene: NetworkGhostCanvasScene,
  options: NetworkGhostTilePlanOptions,
): NetworkGhostCanvasTilePlan {
  const maximumTiles = Math.max(1, Math.floor(options.maxTiles ?? DEFAULT_MAX_TILES));
  const requestedPixelRatio = clamp(options.pixelRatio, 1, 2);
  let tileSize = Math.max(128, Math.floor(options.tileSize ?? DEFAULT_TILE_SIZE));
  const worldWidth = scene.viewBoxWidth * options.zoom;
  const worldHeight = scene.viewBoxHeight * options.zoom;

  while (
    countVisibleTiles(options.viewport, tileSize, worldWidth, worldHeight) > maximumTiles &&
    tileSize < 2_048
  ) {
    tileSize *= 2;
  }

  const visibleCoordinates = getVisibleTileCoordinates(
    options.viewport,
    tileSize,
    worldWidth,
    worldHeight,
  );
  const visibleKeys = new Set(visibleCoordinates.map(({ column, row }) => `${column}:${row}`));
  const overscanCoordinates = getOverscanTileCoordinates(
    visibleCoordinates,
    visibleKeys,
    tileSize,
    worldWidth,
    worldHeight,
  );
  const coordinates = [
    ...visibleCoordinates.map((coordinate) => ({ ...coordinate, priority: "visible" as const })),
    ...overscanCoordinates.map((coordinate) => ({
      ...coordinate,
      priority: "overscan" as const,
    })),
  ].slice(0, maximumTiles);
  const basePixelCount = coordinates.reduce((total, { column, row }) => {
    const x = column * tileSize;
    const y = row * tileSize;
    return (
      total +
      Math.min(tileSize, Math.max(0, worldWidth - x)) *
        Math.min(tileSize, Math.max(0, worldHeight - y))
    );
  }, 0);
  const budgetPixelRatio =
    options.memoryBudgetBytes && basePixelCount > 0
      ? Math.sqrt(options.memoryBudgetBytes / (basePixelCount * 4))
      : requestedPixelRatio;
  const pixelRatio = clamp(Math.min(requestedPixelRatio, budgetPixelRatio), 1, 2);
  const tiles = coordinates.map(({ column, row, priority }) =>
    createCanvasTile(scene, {
      column,
      row,
      priority,
      tileSize,
      pixelRatio,
      zoom: options.zoom,
      worldWidth,
      worldHeight,
    }),
  );

  return {
    zoom: options.zoom,
    pixelRatio,
    tileSize,
    memoryBytes: tiles.reduce((total, tile) => total + tile.memoryBytes, 0),
    tiles,
  };
}

export function hitTestNetworkGhostScene(
  scene: NetworkGhostCanvasScene | NetworkGhostHitScene,
  point: LineGeometryPoint,
  tolerance: number,
): NetworkGhostLineView | undefined {
  const safeTolerance = Math.max(0, tolerance);
  const minColumn = Math.floor((point.x - safeTolerance) / scene.cellSize);
  const maxColumn = Math.floor((point.x + safeTolerance) / scene.cellSize);
  const minRow = Math.floor((point.y - safeTolerance) / scene.cellSize);
  const maxRow = Math.floor((point.y + safeTolerance) / scene.cellSize);
  const candidates = new Map<string, NetworkGhostHitSegment>();

  for (let column = minColumn; column <= maxColumn; column += 1) {
    for (let row = minRow; row <= maxRow; row += 1) {
      for (const segment of scene.spatialIndex.get(`${column}:${row}`) ?? []) {
        candidates.set(`${segment.lineId}:${segment.id}`, segment);
      }
    }
  }

  let closest:
    | {
        distance: number;
        line: NetworkGhostLineView;
      }
    | undefined;

  candidates.forEach((segment) => {
    const distance = distanceToPolyline(point, segment.points);
    const line = scene.lineById.get(segment.lineId);
    if (line && distance <= safeTolerance && (!closest || distance < closest.distance)) {
      closest = { distance, line };
    }
  });

  return closest?.line;
}

export function traceNetworkGhostSegment(
  context: Pick<
    CanvasRenderingContext2D,
    "moveTo" | "lineTo" | "quadraticCurveTo"
  >,
  segment: NetworkGhostCanvasSegment,
): void {
  const first = segment.points[0];
  const last = segment.points.at(-1);
  if (!first || !last) return;

  context.moveTo(first.x, first.y);
  segment.corners.forEach((corner) => {
    if (corner.mode === "rounded" && corner.before && corner.after) {
      context.lineTo(corner.before.x, corner.before.y);
      context.quadraticCurveTo(corner.at.x, corner.at.y, corner.after.x, corner.after.y);
      return;
    }

    context.lineTo(corner.at.x, corner.at.y);
  });
  context.lineTo(last.x, last.y);
}

export function drawNetworkGhostCanvasTile(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  tile: NetworkGhostCanvasTile,
  plan: Pick<NetworkGhostCanvasTilePlan, "pixelRatio" | "zoom">,
  visualZoom = plan.zoom,
): void {
  const ratio = plan.pixelRatio;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, tile.pixelWidth, tile.pixelHeight);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.translate(-tile.x, -tile.y);
  context.scale(plan.zoom, plan.zoom);
  context.lineCap = "round";
  context.lineJoin = "round";

  tile.lines.forEach(({ line, segments }) => {
    context.beginPath();
    segments.forEach((segment) => traceNetworkGhostSegment(context, segment));
    context.strokeStyle = line.color;
    context.globalAlpha = line.isBus ? 0.3 : 0.58;
    context.lineWidth = (line.isBus ? 4 : 5) / Math.max(visualZoom, 0.01);
    context.stroke();
  });
  context.globalAlpha = 1;
}

function createCanvasTile(
  scene: NetworkGhostCanvasScene,
  options: {
    column: number;
    row: number;
    priority: "visible" | "overscan";
    tileSize: number;
    pixelRatio: number;
    zoom: number;
    worldWidth: number;
    worldHeight: number;
  },
): NetworkGhostCanvasTile {
  const x = options.column * options.tileSize;
  const y = options.row * options.tileSize;
  const width = Math.min(options.tileSize, Math.max(0, options.worldWidth - x));
  const height = Math.min(options.tileSize, Math.max(0, options.worldHeight - y));
  const sceneRect = {
    x: x / options.zoom,
    y: y / options.zoom,
    width: width / options.zoom,
    height: height / options.zoom,
  };
  const lines = scene.lines.flatMap((line) => {
    if (!rectsIntersect(line.bounds, sceneRect)) return [];

    const segments = line.segments.filter((segment) => rectsIntersect(segment.bounds, sceneRect));
    return segments.length > 0 ? [{ line: line.line, segments }] : [];
  });

  return {
    id: `${options.column}:${options.row}`,
    x,
    y,
    width,
    height,
    pixelWidth: Math.max(1, Math.round(width * options.pixelRatio)),
    pixelHeight: Math.max(1, Math.round(height * options.pixelRatio)),
    memoryBytes:
      Math.max(1, Math.round(width * options.pixelRatio)) *
      Math.max(1, Math.round(height * options.pixelRatio)) *
      4,
    priority: options.priority,
    lines,
  };
}

function countVisibleTiles(
  viewport: NetworkGhostCanvasRect,
  tileSize: number,
  worldWidth: number,
  worldHeight: number,
): number {
  return getVisibleTileCoordinates(viewport, tileSize, worldWidth, worldHeight).length;
}

function getVisibleTileCoordinates(
  viewport: NetworkGhostCanvasRect,
  tileSize: number,
  worldWidth: number,
  worldHeight: number,
): Array<{ column: number; row: number }> {
  const maximumColumn = Math.max(0, Math.ceil(worldWidth / tileSize) - 1);
  const maximumRow = Math.max(0, Math.ceil(worldHeight / tileSize) - 1);
  const minColumn = clamp(Math.floor(viewport.x / tileSize), 0, maximumColumn);
  const maxColumn = clamp(
    Math.floor(Math.max(viewport.x, viewport.x + viewport.width - 0.001) / tileSize),
    0,
    maximumColumn,
  );
  const minRow = clamp(Math.floor(viewport.y / tileSize), 0, maximumRow);
  const maxRow = clamp(
    Math.floor(Math.max(viewport.y, viewport.y + viewport.height - 0.001) / tileSize),
    0,
    maximumRow,
  );
  const coordinates: Array<{ column: number; row: number }> = [];

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      coordinates.push({ column, row });
    }
  }

  return coordinates;
}

function getOverscanTileCoordinates(
  visible: Array<{ column: number; row: number }>,
  visibleKeys: Set<string>,
  tileSize: number,
  worldWidth: number,
  worldHeight: number,
): Array<{ column: number; row: number }> {
  if (visible.length === 0) return [];

  const maximumColumn = Math.max(0, Math.ceil(worldWidth / tileSize) - 1);
  const maximumRow = Math.max(0, Math.ceil(worldHeight / tileSize) - 1);
  const minColumn = Math.max(0, Math.min(...visible.map(({ column }) => column)) - 1);
  const maxColumn = Math.min(
    maximumColumn,
    Math.max(...visible.map(({ column }) => column)) + 1,
  );
  const minRow = Math.max(0, Math.min(...visible.map(({ row }) => row)) - 1);
  const maxRow = Math.min(maximumRow, Math.max(...visible.map(({ row }) => row)) + 1);
  const centerColumn = (minColumn + maxColumn) / 2;
  const centerRow = (minRow + maxRow) / 2;
  const coordinates: Array<{ column: number; row: number }> = [];

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      if (!visibleKeys.has(`${column}:${row}`)) coordinates.push({ column, row });
    }
  }

  return coordinates.sort(
    (left, right) =>
      Math.hypot(left.column - centerColumn, left.row - centerRow) -
      Math.hypot(right.column - centerColumn, right.row - centerRow),
  );
}

function addSegmentToSpatialIndex<T extends NetworkGhostHitSegment>(
  index: Map<string, T[]>,
  segment: T,
  cellSize: number,
): void {
  const minColumn = Math.floor(segment.bounds.x / cellSize);
  const maxColumn = Math.floor((segment.bounds.x + segment.bounds.width) / cellSize);
  const minRow = Math.floor(segment.bounds.y / cellSize);
  const maxRow = Math.floor((segment.bounds.y + segment.bounds.height) / cellSize);

  for (let column = minColumn; column <= maxColumn; column += 1) {
    for (let row = minRow; row <= maxRow; row += 1) {
      const key = `${column}:${row}`;
      const segments = index.get(key) ?? [];
      segments.push(segment);
      index.set(key, segments);
    }
  }
}

function distanceToPolyline(point: LineGeometryPoint, points: LineGeometryPoint[]): number {
  let minimum = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length - 1; index += 1) {
    minimum = Math.min(minimum, distanceToSegment(point, points[index], points[index + 1]));
  }

  return minimum;
}

function distanceToSegment(
  point: LineGeometryPoint,
  start: LineGeometryPoint,
  end: LineGeometryPoint,
): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);

  const ratio = clamp(
    ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared,
    0,
    1,
  );
  return Math.hypot(point.x - (start.x + deltaX * ratio), point.y - (start.y + deltaY * ratio));
}

function getPointBounds(points: LineGeometryPoint[]): NetworkGhostCanvasRect {
  const xValues = points.map(({ x }) => x);
  const yValues = points.map(({ y }) => y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function mergeBounds(bounds: NetworkGhostCanvasRect[]): NetworkGhostCanvasRect {
  if (bounds.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  const minX = Math.min(...bounds.map(({ x }) => x));
  const minY = Math.min(...bounds.map(({ y }) => y));
  const maxX = Math.max(...bounds.map(({ x, width }) => x + width));
  const maxY = Math.max(...bounds.map(({ y, height }) => y + height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function rectsIntersect(left: NetworkGhostCanvasRect, right: NetworkGhostCanvasRect): boolean {
  return (
    left.x <= right.x + right.width &&
    left.x + left.width >= right.x &&
    left.y <= right.y + right.height &&
    left.y + left.height >= right.y
  );
}

function isFinitePoint(point: LineGeometryPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function toSceneX(value: number, options: NetworkGhostCanvasSceneOptions): number {
  return options.paddingX + value * (options.viewBoxWidth - options.paddingX * 2);
}

function toSceneY(value: number, options: NetworkGhostCanvasSceneOptions): number {
  return options.paddingY + value * (options.viewBoxHeight - options.paddingY * 2);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
