import type { OverpassElement } from "./compiledPlaces";

export function elementAreaSquareMeters(element: OverpassElement): number | undefined {
  if (element.geometry?.length) {
    const area = ringArea(element.geometry);
    if (area > 0) return area;
  }
  if (!element.members?.length) return undefined;

  const outerSegments = element.members
    .filter((member) => (member.role ?? "outer") === "outer" && member.geometry?.length)
    .map((member) => member.geometry!);
  const innerSegments = element.members
    .filter((member) => member.role === "inner" && member.geometry?.length)
    .map((member) => member.geometry!);
  const outerArea = stitchRings(outerSegments).reduce((sum, ring) => sum + ringArea(ring), 0);
  const innerArea = stitchRings(innerSegments).reduce((sum, ring) => sum + ringArea(ring), 0);
  const area = Math.max(0, outerArea - innerArea);
  return area > 0 ? area : undefined;
}

function stitchRings(segments: Array<Array<{ lat: number; lon: number }>>): Array<Array<{ lat: number; lon: number }>> {
  const remaining = segments.map((segment) => [...segment]);
  const rings: Array<Array<{ lat: number; lon: number }>> = [];
  while (remaining.length > 0) {
    const ring = remaining.shift()!;
    let matched = true;
    while (matched && !sameCoordinate(ring[0]!, ring.at(-1)!)) {
      matched = false;
      const endpoint = ring.at(-1)!;
      const index = remaining.findIndex((segment) => sameCoordinate(segment[0]!, endpoint)
        || sameCoordinate(segment.at(-1)!, endpoint));
      if (index < 0) break;
      let segment = remaining.splice(index, 1)[0]!;
      if (sameCoordinate(segment.at(-1)!, endpoint)) segment = segment.reverse();
      ring.push(...segment.slice(1));
      matched = true;
    }
    if (ring.length >= 4 && sameCoordinate(ring[0]!, ring.at(-1)!)) rings.push(ring);
  }
  return rings;
}

function ringArea(points: readonly { lat: number; lon: number }[]): number {
  if (points.length < 4 || !sameCoordinate(points[0]!, points.at(-1)!)) return 0;
  const radius = 6_371_008.8;
  let sum = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]!;
    const next = points[index + 1]!;
    const longitudeDelta = (next.lon - current.lon) * Math.PI / 180;
    sum += longitudeDelta * (2 + Math.sin(current.lat * Math.PI / 180) + Math.sin(next.lat * Math.PI / 180));
  }
  return Math.abs(sum * radius * radius / 2);
}

function sameCoordinate(left: { lat: number; lon: number }, right: { lat: number; lon: number }): boolean {
  return Math.abs(left.lat - right.lat) < 1e-7 && Math.abs(left.lon - right.lon) < 1e-7;
}


