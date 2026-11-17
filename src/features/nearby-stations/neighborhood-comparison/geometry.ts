import type { IrisPolygonGeometry } from "../../transport-map/iris/irisApi";

export type GeometryBounds = [number, number, number, number];
/** Paris OSM assets use the city code, while IRIS use arrondissement codes. */
export function placesCityCode(communeCode: string): string {
  return /^751\d{2}$/u.test(communeCode) ? "75056" : communeCode;
}
export function geometryBounds(geometry: IrisPolygonGeometry): GeometryBounds {
  const result: GeometryBounds = [Infinity, Infinity, -Infinity, -Infinity];
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const part of polygons) for (const ring of part) for (const point of ring) {
    result[0] = Math.min(result[0], point[0]!); result[1] = Math.min(result[1], point[1]!);
    result[2] = Math.max(result[2], point[0]!); result[3] = Math.max(result[3], point[1]!);
  }
  return result;
}
export function pointOnBoundary(geometry: IrisPolygonGeometry, point: { lon: number; lat: number }): boolean {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const epsilon = 1e-9;
  for (const part of polygons) for (const ring of part) for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!;
    const length2 = dx * dx + dy * dy;
    if (!length2) continue;
    const t = Math.max(0, Math.min(1, ((point.lon - a[0]!) * dx + (point.lat - a[1]!) * dy) / length2));
    if (Math.hypot(point.lon - (a[0]! + t * dx), point.lat - (a[1]! + t * dy)) <= epsilon) return true;
  }
  return false;
}
