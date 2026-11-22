import type { GreenBoundary, GreenPoint } from "./natureInCity";

export function normalizeGreenSpaceName(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** Find the nearest mapped boundary, accounting for interior holes and separate parcels. */
export function locateAtGreenBoundary(origin: GreenPoint, geometry: GreenBoundary) {
  const longitudeScale = Math.cos(origin.lat * Math.PI / 180);
  let nearest: GreenPoint | undefined;
  let distanceSquared = Infinity;
  let inside = false;
  for (const polygon of geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates) {
    let insidePolygon = false;
    for (const ring of polygon) {
      for (let index = 1; index < ring.length; index++) {
        const [ax, ay] = ring[index - 1]!;
        const [bx, by] = ring[index]!;
        if (ax === undefined || ay === undefined || bx === undefined || by === undefined) continue;
        const x = (ax - origin.lon) * longitudeScale;
        const y = ay - origin.lat;
        const dx = (bx - ax) * longitudeScale;
        const dy = by - ay;
        if ((y > 0) !== (y + dy > 0) && x - y * dx / dy > 0) insidePolygon = !insidePolygon;
        const length = dx * dx + dy * dy;
        const ratio = length ? Math.max(0, Math.min(1, -(x * dx + y * dy) / length)) : 0;
        const squared = (x + ratio * dx) ** 2 + (y + ratio * dy) ** 2;
        if (squared < distanceSquared) {
          distanceSquared = squared;
          nearest = { lon: ax + ratio * (bx - ax), lat: ay + ratio * (by - ay) };
        }
      }
    }
    inside ||= insidePolygon;
  }
  const distanceMeters = Math.sqrt(distanceSquared) * (Math.PI * 6_371_000 / 180);
  return { inside: inside || distanceMeters < 0.1, nearest, distanceMeters };
}
