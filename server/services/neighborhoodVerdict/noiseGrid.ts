import {
  AIR_NOISE_GRID_SOURCE_ID,
  VERDICT_SCHEMA_VERSION,
  type CompiledAirNoiseGrid,
  type CompiledNeighborhoodVerdictData,
  type VerdictSourceMetadata,
} from "./contracts";

export const NEARBY_NOISE_GRID_DEFAULT_RADIUS_METERS = 600;
export const NEARBY_NOISE_GRID_MIN_RADIUS_METERS = 100;
export const NEARBY_NOISE_GRID_MAX_RADIUS_METERS = 2_000;

export type NoiseLevel = 1 | 2 | 3;

export interface PublicNoiseGridSource {
  id: string;
  title: string;
  producer: string;
  pageUrl: string;
  referencePeriod?: string;
  attribution: string;
  limitations: string[];
}

export interface NearbyNoiseGridCell {
  column: number;
  row: number;
  /** Official SIG value: first digit is noise, second digit is air. */
  value: string;
  noiseLevel: NoiseLevel;
}

export interface NearbyNoiseGridResponse {
  schemaVersion: typeof VERDICT_SCHEMA_VERSION;
  origin: { lat: number; lon: number };
  radiusMeters: number;
  /** The original grid extent is kept so the client can project columns/rows. */
  bbox: [number, number, number, number];
  cellSizeDegrees: number;
  columns: number;
  rows: number;
  cells: NearbyNoiseGridCell[];
  source: PublicNoiseGridSource;
}

/**
 * Build a small map payload from the compiled SIG grid. The compiled artifact
 * is intentionally never sent in full: at most the cells around the requested
 * map origin are returned.
 */
export function buildNearbyNoiseGridResponse(
  data: Pick<CompiledNeighborhoodVerdictData, "schemaVersion" | "sources" | "airNoiseGrid">,
  origin: { lat: number; lon: number },
  radiusMeters: number,
): NearbyNoiseGridResponse | undefined {
  const grid = data.airNoiseGrid;
  const source = data.sources.find((candidate) => candidate.id === AIR_NOISE_GRID_SOURCE_ID);
  if (!source || !isUsableGrid(data.schemaVersion, grid, source) || !isValidOrigin(origin)) return undefined;

  const radius = Math.round(radiusMeters);
  if (!Number.isFinite(radius) || radius <= 0) return undefined;

  const [minLon, minLat] = grid.bbox;
  const paddingMeters = Math.SQRT2 * grid.cellSizeDegrees * 111_320;
  const searchRadius = radius + paddingMeters;
  const latitudeDelta = searchRadius / 111_320;
  const longitudeDelta = searchRadius / (111_320 * Math.max(0.2, Math.abs(Math.cos(toRadians(origin.lat)))));
  const firstColumn = clampGridIndex(
    Math.floor((origin.lon - longitudeDelta - minLon) / grid.cellSizeDegrees),
    grid.columns,
  );
  const lastColumn = clampGridIndex(
    Math.floor((origin.lon + longitudeDelta - minLon) / grid.cellSizeDegrees),
    grid.columns,
  );
  const firstRow = clampGridIndex(
    Math.floor((origin.lat - latitudeDelta - minLat) / grid.cellSizeDegrees),
    grid.rows,
  );
  const lastRow = clampGridIndex(
    Math.floor((origin.lat + latitudeDelta - minLat) / grid.cellSizeDegrees),
    grid.rows,
  );

  const cells: NearbyNoiseGridCell[] = [];
  if (firstColumn <= lastColumn && firstRow <= lastRow) {
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const value = gridValue(grid, column, row);
        const noiseLevel = value ? parseNoiseLevel(value) : undefined;
        if (!value || noiseLevel === undefined) continue;

        const cellCenter = {
          lon: minLon + (column + 0.5) * grid.cellSizeDegrees,
          lat: minLat + (row + 0.5) * grid.cellSizeDegrees,
        };
        if (distanceMeters(origin, cellCenter) > searchRadius) continue;
        cells.push({ column, row, value, noiseLevel });
      }
    }
  }

  return {
    schemaVersion: VERDICT_SCHEMA_VERSION,
    origin: { lat: origin.lat, lon: origin.lon },
    radiusMeters: radius,
    bbox: [...grid.bbox] as [number, number, number, number],
    cellSizeDegrees: grid.cellSizeDegrees,
    columns: grid.columns,
    rows: grid.rows,
    cells,
    source: toPublicSource(source),
  };
}

function isUsableGrid(
  schemaVersion: CompiledNeighborhoodVerdictData["schemaVersion"],
  grid: CompiledAirNoiseGrid | undefined,
  source: VerdictSourceMetadata | undefined,
): grid is CompiledAirNoiseGrid {
  return schemaVersion === VERDICT_SCHEMA_VERSION
    && Boolean(source?.scorable)
    && Boolean(
      grid
      && grid.sourceCrs === "EPSG:4326"
      && grid.cellSizeDegrees > 0
      && Number.isInteger(grid.columns)
      && grid.columns > 0
      && Number.isInteger(grid.rows)
      && grid.rows > 0
      && grid.classes.length === grid.columns * grid.rows
      && grid.values.length > 0
      && grid.bbox.length === 4
      && grid.bbox[0] < grid.bbox[2]
      && grid.bbox[1] < grid.bbox[3],
    );
}

function toPublicSource(source: VerdictSourceMetadata): PublicNoiseGridSource {
  return {
    id: source.id,
    title: source.title,
    producer: source.producer,
    pageUrl: source.pageUrl,
    referencePeriod: source.referencePeriod,
    attribution: source.licence.attribution,
    limitations: [...source.limitations],
  };
}

function gridValue(grid: CompiledAirNoiseGrid, column: number, row: number): string | undefined {
  if (column < 0 || column >= grid.columns || row < 0 || row >= grid.rows) return undefined;
  const classCode = grid.classes[row * grid.columns + column];
  if (!Number.isInteger(classCode) || classCode < 1) return undefined;
  const value = grid.values[classCode - 1];
  return typeof value === "string" && /^[123][123]$/u.test(value) ? value : undefined;
}

function parseNoiseLevel(value: string): NoiseLevel | undefined {
  const level = Number(value[0]);
  return level === 1 || level === 2 || level === 3 ? level : undefined;
}

function clampGridIndex(value: number, size: number): number {
  return Math.max(0, Math.min(size - 1, value));
}

function isValidOrigin(origin: { lat: number; lon: number }): boolean {
  return Number.isFinite(origin.lat)
    && Number.isFinite(origin.lon)
    && origin.lat >= -90
    && origin.lat <= 90
    && origin.lon >= -180
    && origin.lon <= 180;
}

function distanceMeters(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): number {
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lon - from.lon);
  const fromLatitude = toRadians(from.lat);
  const toLatitude = toRadians(to.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

function toRadians(value: number): number {
  return value * Math.PI / 180;
}
