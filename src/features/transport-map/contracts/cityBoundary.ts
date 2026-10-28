import type { IrisPolygonGeometry } from "../iris/irisApi";

/** Official commune geometry, separate from the IRIS neighbourhood dataset. */
export interface CityBoundary {
  code: string;
  name: string;
  geometry: IrisPolygonGeometry;
  centroid: [number, number];
}

export function parseCityBoundary(value: unknown): CityBoundary {
  const item = value as Partial<CityBoundary> | null;
  const point = (p: unknown): p is [number, number] => Array.isArray(p) && p.length >= 2 &&
    typeof p[0] === "number" && typeof p[1] === "number" &&
    Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  const ring = (r: unknown): boolean => {
    if (!Array.isArray(r) || r.length < 4 || !r.every(point)) return false;
    const first = r[0]!;
    const last = r[r.length - 1]!;
    return first[0] === last[0] && first[1] === last[1];
  };
  const polygon = (p: unknown): boolean => Array.isArray(p) && p.length > 0 && p.every(ring);
  const geometry = item?.geometry;
  if (!item || typeof item.code !== "string" || !/^[0-9AB]{5}$/u.test(item.code) ||
    typeof item.name !== "string" || !item.name.trim() || !point(item.centroid) || !geometry ||
    !(geometry.type === "Polygon" ? polygon(geometry.coordinates) : geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates) &&
      geometry.coordinates.length > 0 && geometry.coordinates.every(polygon))) {
    throw new Error("Invalid official commune boundary");
  }
  return item as CityBoundary;
}
