import type { IrisBoundarySegment } from "./irisGeometry";

type Point = [number, number];

/** Join shared endpoints, preserving every source edge and stopping at junctions. */
export function joinAdministrativeBoundarySegments(segments: readonly IrisBoundarySegment[]): Point[][] {
  const endpoints = new Map<string, number[]>();
  const key = (point: Point) => `${point[0].toFixed(7)},${point[1].toFixed(7)}`;
  const keys = segments.map(({ from, to }, index) => {
    const pair = [key(from), key(to)] as const;
    for (const endpoint of pair) {
      const incident = endpoints.get(endpoint);
      if (incident) incident.push(index);
      else endpoints.set(endpoint, [index]);
    }
    return pair;
  });
  const visited = new Uint8Array(segments.length);
  const paths: Point[][] = [];
  const walk = (index: number, startKey: string) => {
    const path: Point[] = [];
    let endpoint = startKey;
    while (!visited[index]) {
      visited[index] = 1;
      const segment = segments[index]!;
      const pair = keys[index]!;
      const forward = pair[0] === endpoint;
      if (path.length === 0) path.push(forward ? segment.from : segment.to);
      path.push(forward ? segment.to : segment.from);
      endpoint = forward ? pair[1] : pair[0];
      const incident = endpoints.get(endpoint)!;
      if (incident.length !== 2) break;
      const next = incident.find((candidate) => !visited[candidate]);
      if (next === undefined) break;
      index = next;
    }
    paths.push(path);
  };
  // Open chains/junctions first, then closed rings. Never bridge disjoint islands.
  for (const [endpoint, incident] of endpoints) {
    if (incident.length === 2) continue;
    for (const index of incident) if (!visited[index]) walk(index, endpoint);
  }
  for (let index = 0; index < segments.length; index += 1) {
    if (!visited[index]) walk(index, keys[index]![0]);
  }
  return paths;
}

/** Interior candidate on a horizontal cut; parity excludes holes and gaps. */
export function administrativeInteriorPoint(
  segments: readonly IrisBoundarySegment[],
  preferred: Point,
): Point {
  const scan = (lat: number): Point | undefined => {
    const crossings: number[] = [];
    for (const { from, to } of segments) {
      if ((from[1] > lat) === (to[1] > lat)) continue;
      crossings.push(from[0] + (lat - from[1]) * (to[0] - from[0]) / (to[1] - from[1]));
    }
    crossings.sort((a, b) => a - b);
    let best: Point | undefined;
    let width = 0;
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const left = crossings[index]!;
      const right = crossings[index + 1]!;
      if (right - left > width) {
        width = right - left;
        best = [(left + right) / 2, lat];
      }
    }
    return best;
  };
  const candidate = scan(preferred[1]);
  if (candidate) return candidate;
  // The preferred latitude can lie between islands of a MultiPolygon.
  for (const { from, to } of segments) {
    if (from[1] === to[1]) continue;
    const interior = scan((from[1] + to[1]) / 2);
    if (interior) return interior;
  }
  return preferred;
}
