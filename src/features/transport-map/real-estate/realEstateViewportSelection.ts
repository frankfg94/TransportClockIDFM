import type { CameraState } from "../geo/camera";
import {
  cssPixelsToWorldUnits,
  lonLatToWorld,
  metersToWorldUnits,
  worldUnitsPerMeterAt,
  writeVisibleWorldBounds,
} from "../geo/coordinateKernel";
import type { GlobalMapBounds } from "../contracts/manifest";
import type { DvfMapGridCell } from "../../../services/real-estate/realEstateMapLayer";

const TARGET_CELLS_PER_BUCKET = 64;
const PICK_RADIUS_MAX_PIXELS = 12;
const EMPTY_CELLS: readonly DvfMapGridCell[] = [];

interface SpatialIndex {
  cells: readonly DvfMapGridCell[];
  worldX: Float64Array;
  worldY: Float64Array;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  columns: number;
  rows: number;
  buckets: number[][];
}

interface CachedSelection {
  coverage: GlobalMapBounds;
  cells: readonly DvfMapGridCell[];
}

export interface NearbyRealEstateCell {
  cell: DvfMapGridCell;
  distanceMeters: number;
}

const selectorByDataset = new WeakMap<readonly DvfMapGridCell[], RealEstateViewportCellSelector>();

/**
 * Reuses an indexed DVF grid across camera frames and keeps one viewport of
 * overscan around the last query. The rendered-cell support radius is measured
 * in CSS pixels, then converted into the same normalized world space as the
 * camera so no contributing kernel can be cut off at a viewport edge.
 */
export class RealEstateViewportCellSelector {
  private readonly index: SpatialIndex;
  private readonly visibleBounds: GlobalMapBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  private selection?: CachedSelection;

  constructor(cells: readonly DvfMapGridCell[]) {
    this.index = buildSpatialIndex(cells);
  }

  select(camera: CameraState, cellSupportRadiusPixels: number): readonly DvfMapGridCell[] {
    const visible = writeVisibleWorldBounds(camera, this.visibleBounds);
    const support = cssPixelsToWorldUnits(
      Math.max(cellSupportRadiusPixels, PICK_RADIUS_MAX_PIXELS),
      camera,
    );
    const previous = this.selection;
    if (previous
      && previous.coverage.minX <= visible.minX - support
      && previous.coverage.minY <= visible.minY - support
      && previous.coverage.maxX >= visible.maxX + support
      && previous.coverage.maxY >= visible.maxY + support) return previous.cells;

    const width = visible.maxX - visible.minX;
    const height = visible.maxY - visible.minY;
    const queryBounds = {
      minX: visible.minX - width - support,
      minY: visible.minY - height - support,
      maxX: visible.maxX + width + support,
      maxY: visible.maxY + height + support,
    };
    const cells = querySpatialIndex(this.index, queryBounds);
    this.selection = { coverage: queryBounds, cells };
    return cells;
  }

  /** Find the closest cell in map space, optionally keeping the point's commune. */
  findNearest(longitude: number, latitude: number, cityCode?: string): DvfMapGridCell | undefined {
    const index = this.index;
    if (!index.cells.length) return undefined;

    const point = lonLatToWorld({ lon: longitude, lat: latitude });
    const centerColumn = gridCoordinate(point.x, index.minX, index.maxX, index.columns);
    const centerRow = gridCoordinate(point.y, index.minY, index.maxY, index.rows);
    let nearestIndex = -1;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;

    const visitBucket = (row: number, column: number): void => {
      for (const cellIndex of index.buckets[row * index.columns + column]!) {
        const cell = index.cells[cellIndex]!;
        if (cityCode && cell.cityCode !== cityCode) continue;
        const dx = index.worldX[cellIndex]! - point.x;
        const dy = index.worldY[cellIndex]! - point.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < nearestDistanceSquared) {
          nearestIndex = cellIndex;
          nearestDistanceSquared = distanceSquared;
        }
      }
    };

    // Walk outward through the existing uniform grid. The first enclosing
    // rectangle whose edge is farther away than the best match proves that
    // no unvisited bucket can contain a nearer cell.
    const maxRadius = Math.max(index.columns, index.rows);
    for (let radius = 0; radius <= maxRadius; radius += 1) {
      const minColumn = Math.max(0, centerColumn - radius);
      const maxColumn = Math.min(index.columns - 1, centerColumn + radius);
      const minRow = Math.max(0, centerRow - radius);
      const maxRow = Math.min(index.rows - 1, centerRow + radius);

      for (let column = minColumn; column <= maxColumn; column += 1) {
        visitBucket(minRow, column);
        if (maxRow !== minRow) visitBucket(maxRow, column);
      }
      for (let row = minRow + 1; row < maxRow; row += 1) {
        visitBucket(row, minColumn);
        if (maxColumn !== minColumn) visitBucket(row, maxColumn);
      }

      if (nearestIndex >= 0) {
        const left = index.minX + (minColumn / index.columns) * (index.maxX - index.minX);
        const right = index.minX + ((maxColumn + 1) / index.columns) * (index.maxX - index.minX);
        const top = index.minY + (minRow / index.rows) * (index.maxY - index.minY);
        const bottom = index.minY + ((maxRow + 1) / index.rows) * (index.maxY - index.minY);
        const pointInsideVisitedBounds = point.x >= left && point.x <= right
          && point.y >= top && point.y <= bottom;
        if (pointInsideVisitedBounds) {
          const distanceToUnvisitedBuckets = Math.min(
            point.x - left,
            right - point.x,
            point.y - top,
            bottom - point.y,
          );
          if (distanceToUnvisitedBuckets * distanceToUnvisitedBuckets >= nearestDistanceSquared) break;
        }
      }
    }

    return nearestIndex >= 0 ? index.cells[nearestIndex] : undefined;
  }

  /** Return only cells within the requested local ground-distance radius. */
  findWithinRadius(longitude: number, latitude: number, radiusMeters: number): NearbyRealEstateCell[] {
    const index = this.index;
    if (!index.cells.length || !Number.isFinite(radiusMeters) || radiusMeters < 0) return [];

    const point = lonLatToWorld({ lon: longitude, lat: latitude });
    const radiusWorldUnits = metersToWorldUnits(radiusMeters, point);
    const bounds = {
      minX: point.x - radiusWorldUnits,
      minY: point.y - radiusWorldUnits,
      maxX: point.x + radiusWorldUnits,
      maxY: point.y + radiusWorldUnits,
    };
    const radiusSquared = radiusWorldUnits * radiusWorldUnits;
    const worldUnitsPerMeter = worldUnitsPerMeterAt(point);
    const nearby: NearbyRealEstateCell[] = [];

    for (const cell of querySpatialIndex(index, bounds)) {
      const cellWorld = lonLatToWorld({ lon: cell.lon, lat: cell.lat });
      const dx = cellWorld.x - point.x;
      const dy = cellWorld.y - point.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > radiusSquared) continue;
      nearby.push({ cell, distanceMeters: Math.sqrt(distanceSquared) / worldUnitsPerMeter });
    }

    return nearby;
  }
}

/** Selects the cells whose interpolation kernels can affect the visible map. */
export function selectRealEstateViewportCells(
  cells: readonly DvfMapGridCell[],
  camera: CameraState,
  cellSupportRadiusPixels: number,
): readonly DvfMapGridCell[] {
  let selector = selectorByDataset.get(cells);
  if (!selector) {
    selector = new RealEstateViewportCellSelector(cells);
    selectorByDataset.set(cells, selector);
  }
  return selector.select(camera, cellSupportRadiusPixels);
}

/** Reuse the viewport selector's spatial index to provide nearby cell context for parcel points. */
export function findNearestRealEstateCell(
  cells: readonly DvfMapGridCell[],
  longitude: number,
  latitude: number,
  cityCode?: string,
): DvfMapGridCell | undefined {
  let selector = selectorByDataset.get(cells);
  if (!selector) {
    selector = new RealEstateViewportCellSelector(cells);
    selectorByDataset.set(cells, selector);
  }
  return selector.findNearest(longitude, latitude, cityCode);
}

/** Reuse the dataset spatial index for local metric interpolation and hover estimates. */
export function findRealEstateCellsWithinRadius(
  cells: readonly DvfMapGridCell[],
  longitude: number,
  latitude: number,
  radiusMeters: number,
): NearbyRealEstateCell[] {
  let selector = selectorByDataset.get(cells);
  if (!selector) {
    selector = new RealEstateViewportCellSelector(cells);
    selectorByDataset.set(cells, selector);
  }
  return selector.findWithinRadius(longitude, latitude, radiusMeters);
}

function buildSpatialIndex(cells: readonly DvfMapGridCell[]): SpatialIndex {
  const worldX = new Float64Array(cells.length);
  const worldY = new Float64Array(cells.length);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index]!;
    const point = lonLatToWorld({ lon: cell.lon, lat: cell.lat });
    worldX[index] = point.x;
    worldY[index] = point.y;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const bucketCount = Math.max(1, Math.ceil(cells.length / TARGET_CELLS_PER_BUCKET));
  const aspectRatio = spanY > 0 ? spanX / spanY : 1;
  const columns = Math.max(1, Math.ceil(Math.sqrt(bucketCount * aspectRatio)));
  const rows = Math.max(1, Math.ceil(bucketCount / columns));
  const buckets = Array.from({ length: columns * rows }, () => [] as number[]);

  for (let index = 0; index < cells.length; index += 1) {
    const column = gridCoordinate(worldX[index]!, minX, maxX, columns);
    const row = gridCoordinate(worldY[index]!, minY, maxY, rows);
    buckets[row * columns + column]!.push(index);
  }

  return { cells, worldX, worldY, minX, minY, maxX, maxY, columns, rows, buckets };
}

function gridCoordinate(value: number, min: number, max: number, count: number): number {
  if (count === 1 || max === min) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor(((value - min) / (max - min)) * count)));
}

function querySpatialIndex(index: SpatialIndex, bounds: GlobalMapBounds): readonly DvfMapGridCell[] {
  if (!index.cells.length
    || bounds.maxX < index.minX || bounds.minX > index.maxX
    || bounds.maxY < index.minY || bounds.minY > index.maxY) return EMPTY_CELLS;

  if (bounds.minX <= index.minX && bounds.maxX >= index.maxX
    && bounds.minY <= index.minY && bounds.maxY >= index.maxY) return index.cells;

  const minX = Math.max(bounds.minX, index.minX);
  const minY = Math.max(bounds.minY, index.minY);
  const maxX = Math.min(bounds.maxX, index.maxX);
  const maxY = Math.min(bounds.maxY, index.maxY);
  const minColumn = gridCoordinate(minX, index.minX, index.maxX, index.columns);
  const maxColumn = gridCoordinate(maxX, index.minX, index.maxX, index.columns);
  const minRow = gridCoordinate(minY, index.minY, index.maxY, index.rows);
  const maxRow = gridCoordinate(maxY, index.minY, index.maxY, index.rows);
  const selectedIndices: number[] = [];

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      for (const cellIndex of index.buckets[row * index.columns + column]!) {
        const x = index.worldX[cellIndex]!;
        const y = index.worldY[cellIndex]!;
        if (x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY) {
          selectedIndices.push(cellIndex);
        }
      }
    }
  }

  if (selectedIndices.length === index.cells.length) return index.cells;
  selectedIndices.sort((left, right) => left - right);
  return selectedIndices.map((cellIndex) => index.cells[cellIndex]!);
}
