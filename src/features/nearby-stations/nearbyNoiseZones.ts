import { PUBLIC_NEIGHBORHOOD_VERDICT_SCHEMA_VERSION } from "./neighborhoodVerdictApi";

export type NearbyNoiseLevel = 1 | 2 | 3;
export type NearbyAirQualityLevel = 1 | 2 | 3;

export interface NearbyNoiseGridCell {
  column: number;
  row: number;
  value: string;
  noiseLevel: NearbyNoiseLevel;
}

export interface NearbyNoiseGridSource {
  id: string;
  title: string;
  producer: string;
  pageUrl: string;
  referencePeriod?: string;
  attribution: string;
  limitations: string[];
}

export interface NearbyNoiseZonesResponse {
  schemaVersion: typeof PUBLIC_NEIGHBORHOOD_VERDICT_SCHEMA_VERSION;
  origin: { lat: number; lon: number };
  radiusMeters: number;
  bbox: [number, number, number, number];
  cellSizeDegrees: number;
  columns: number;
  rows: number;
  cells: NearbyNoiseGridCell[];
  source: NearbyNoiseGridSource;
}

export function isNearbyNoiseZonesResponse(value: unknown): value is NearbyNoiseZonesResponse {
  if (!isRecord(value) || value.schemaVersion !== PUBLIC_NEIGHBORHOOD_VERDICT_SCHEMA_VERSION) return false;
  if (!isCoordinate(value.origin)) return false;
  if (!isFinitePositiveNumber(value.radiusMeters)) return false;
  if (!isBoundingBox(value.bbox)) return false;
  if (!isFinitePositiveNumber(value.cellSizeDegrees)) return false;
  if (!isPositiveInteger(value.columns) || !isPositiveInteger(value.rows)) return false;
  if (!Array.isArray(value.cells) || !isNoiseSource(value.source)) return false;

  const seen = new Set<string>();
  for (const cell of value.cells) {
    if (!isRecord(cell)) return false;
    if (!isGridIndex(cell.column, value.columns) || !isGridIndex(cell.row, value.rows)) return false;
    if (typeof cell.value !== "string" || !/^[123][123]$/u.test(cell.value)) return false;
    if (!isNoiseLevel(cell.noiseLevel) || cell.noiseLevel !== Number(cell.value[0])) return false;
    const key = `${cell.column}:${cell.row}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/**
 * Official Bruitparif Symbologie.xlsx: noise first, air second.
 * For example, 12 means noise class 1 and air class 2.
 */
export function parseNearbyAirQualityLevel(value: string): NearbyAirQualityLevel | undefined {
  const level = Number(value[1]);
  return level === 1 || level === 2 || level === 3 ? level : undefined;
}

function isNoiseSource(value: unknown): value is NearbyNoiseGridSource {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.producer === "string"
    && typeof value.pageUrl === "string"
    && (value.referencePeriod === undefined || typeof value.referencePeriod === "string")
    && typeof value.attribution === "string"
    && Array.isArray(value.limitations)
    && value.limitations.every((limitation) => typeof limitation === "string");
}

function isCoordinate(value: unknown): value is { lat: number; lon: number } {
  if (!isRecord(value)) return false;
  return typeof value.lat === "number"
    && typeof value.lon === "number"
    && Number.isFinite(value.lat)
    && Number.isFinite(value.lon)
    && value.lat >= -90
    && value.lat <= 90
    && value.lon >= -180
    && value.lon <= 180;
}

function isBoundingBox(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value)
    && value.length === 4
    && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    && value[0]! < value[2]!
    && value[1]! < value[3]!;
}

function isGridIndex(value: unknown, size: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < size;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNoiseLevel(value: unknown): value is NearbyNoiseLevel {
  return value === 1 || value === 2 || value === 3;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
