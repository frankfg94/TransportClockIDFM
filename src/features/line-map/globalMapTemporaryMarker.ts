export interface GlobalMapTemporaryMarker {
  lon: number;
  lat: number;
  text: string;
}

export const GLOBAL_MAP_TEMPORARY_MARKER_QUERY_KEY = "temporaryMarker";
export const GLOBAL_MAP_TEMPORARY_MARKER_TEXT_QUERY_KEY = "temporaryMarkerText";
export const GLOBAL_MAP_TEMPORARY_MARKER_RADIUS_QUERY_KEY = "temporaryMarkerRadius";
export const GLOBAL_MAP_LINE_TO_KEEP_QUERY_KEY = "lineToKeep";
export const GLOBAL_MAP_NEARBY_HEAVY_LINE_QUERY_KEY = "nearbyHeavyLine";
export const GLOBAL_MAP_NEARBY_HEAVY_STATION_QUERY_KEY = "nearbyHeavyStation";

export function queryStringValue(value: unknown): string | undefined {
  return typeof value === "string"
    ? value
    : Array.isArray(value) && typeof value[0] === "string"
      ? value[0]
      : undefined;
}

export function queryStringValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((candidate): candidate is string => typeof candidate === "string");
}

export function parseGlobalMapTemporaryMarker(
  query: Readonly<Record<string, unknown>>,
): GlobalMapTemporaryMarker | undefined {
  const raw = queryStringValue(query[GLOBAL_MAP_TEMPORARY_MARKER_QUERY_KEY]);
  if (!raw) return undefined;

  const coordinates = raw.split(/[;,]/u).map((value) => Number(value.trim()));
  if (coordinates.length !== 2) return undefined;
  const [lon, lat] = coordinates;
  if (
    !Number.isFinite(lon) ||
    !Number.isFinite(lat) ||
    lon < -180 ||
    lon > 180 ||
    lat < -90 ||
    lat > 90
  ) return undefined;

  return {
    lon,
    lat,
    text: queryStringValue(query[GLOBAL_MAP_TEMPORARY_MARKER_TEXT_QUERY_KEY])?.trim() ||
      `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
  };
}

export function parseGlobalMapTemporaryMarkerRadius(
  query: Readonly<Record<string, unknown>>,
): number | undefined {
  const radius = Number(queryStringValue(query[GLOBAL_MAP_TEMPORARY_MARKER_RADIUS_QUERY_KEY]));
  return Number.isFinite(radius) && radius > 0 ? radius : undefined;
}

export function parseGlobalMapLineToKeep(
  query: Readonly<Record<string, unknown>>,
): string[] {
  return parseGlobalMapQueryIds(query, GLOBAL_MAP_LINE_TO_KEEP_QUERY_KEY);
}

export function parseGlobalMapNearbyHeavyLineIds(
  query: Readonly<Record<string, unknown>>,
): string[] {
  return parseGlobalMapQueryIds(query, GLOBAL_MAP_NEARBY_HEAVY_LINE_QUERY_KEY);
}

export function parseGlobalMapNearbyHeavyStationIds(
  query: Readonly<Record<string, unknown>>,
): string[] {
  return parseGlobalMapQueryIds(query, GLOBAL_MAP_NEARBY_HEAVY_STATION_QUERY_KEY);
}

function parseGlobalMapQueryIds(
  query: Readonly<Record<string, unknown>>,
  key: string,
): string[] {
  return [...new Set(
    queryStringValues(query[key])
      .map((value) => value.trim())
      .filter(Boolean),
  )];
}
