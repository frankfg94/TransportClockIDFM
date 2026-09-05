/** WGS84 contours shared by the nearby API and the offline global-map atlas. */
export type WalkingIsochronePosition = readonly [number, number];
export type WalkingIsochroneRing = readonly WalkingIsochronePosition[];
export type WalkingIsochronePolygon = readonly WalkingIsochroneRing[];
export type WalkingIsochroneGeometry =
  | { type: "Polygon"; coordinates: WalkingIsochronePolygon }
  | { type: "MultiPolygon"; coordinates: readonly WalkingIsochronePolygon[] };

export function normalizeWalkingIsochroneGeometry(value: unknown): WalkingIsochroneGeometry | undefined {
  if (!isRecord(value)) return undefined;
  if (value.type === "Polygon") {
    const coordinates = normalizePolygon(value.coordinates);
    return coordinates ? { type: "Polygon", coordinates } : undefined;
  }
  if (value.type !== "MultiPolygon" || !Array.isArray(value.coordinates) || !value.coordinates.length) return undefined;
  const coordinates = value.coordinates.map(normalizePolygon);
  return coordinates.every((polygon): polygon is WalkingIsochronePolygon => Boolean(polygon))
    ? { type: "MultiPolygon", coordinates }
    : undefined;
}

function normalizePolygon(value: unknown): WalkingIsochronePolygon | undefined {
  if (!Array.isArray(value) || !value.length) return undefined;
  const rings = value.map(normalizeRing);
  return rings.every((ring): ring is WalkingIsochroneRing => Boolean(ring)) ? rings : undefined;
}

function normalizeRing(value: unknown): WalkingIsochroneRing | undefined {
  if (!Array.isArray(value) || value.length < 4) return undefined;
  const ring: WalkingIsochronePosition[] = [];
  for (const position of value) {
    if (!Array.isArray(position) || position.length < 2) return undefined;
    const lon = Number(position[0]);
    const lat = Number(position[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) return undefined;
    ring.push([lon, lat]);
  }
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  return first[0] === last[0] && first[1] === last[1] ? ring : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
