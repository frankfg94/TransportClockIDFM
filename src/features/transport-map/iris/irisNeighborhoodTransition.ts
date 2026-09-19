import type { IrisNeighborhood, IrisPolygonGeometry } from "./irisApi";
import { pointInIrisGeometry } from "./irisGeometry";

type IrisPoint = readonly [number, number];

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Segment {
  from: IrisPoint;
  to: IrisPoint;
  bounds: Bounds;
}

interface NeighborhoodTopology {
  neighborhood: IrisNeighborhood;
  segments: readonly Segment[];
  bounds: Bounds;
}

// IRIS polygons generally share the same source vertices. The tolerance keeps
// the animation connected when two imported boundaries differ by a few metres
// because of rounding or independent simplification of the source geometries.
const ADJACENCY_TOLERANCE_DEGREES = 0.00008;
const ORIENTATION_EPSILON = 1e-12;

/**
 * Returns a deterministic reveal order for the city-view IRIS polygons.
 *
 * The order is intentionally not based only on distance: a breadth-first walk
 * through the boundary graph makes the drawing spread from the active
 * neighbourhood to its direct neighbours first, then to the next ring. If the
 * source contains disconnected polygons, the closest remaining component is
 * attached to the current wave so no neighbourhood stays permanently hidden.
 */
export function buildIrisNeighborhoodRevealOrder(
  neighborhoods: readonly IrisNeighborhood[],
  origin: { lon: number; lat: number },
  options: { adjacency?: "exact" | "fast" } = {},
): string[] {
  if (options.adjacency === "fast") {
    return buildFastRevealOrder(neighborhoods, origin);
  }

  const entries = neighborhoods
    .filter((neighborhood) => neighborhood.id.trim().length > 0)
    .filter((neighborhood, index, all) => all.findIndex((candidate) => candidate.id === neighborhood.id) === index)
    .map((neighborhood) => createTopology(neighborhood));

  if (entries.length === 0) return [];

  const topologyById = new Map(entries.map((entry) => [entry.neighborhood.id, entry]));
  const adjacency = new Map<string, Set<string>>(
    entries.map((entry) => [entry.neighborhood.id, new Set<string>()]),
  );

  // The city-scoped selection is deliberately small (one commune), so this
  // pairwise pass remains cheap and lets us compare the actual polygon edges
  // instead of guessing adjacency from centroids.
  for (let firstIndex = 0; firstIndex < entries.length; firstIndex += 1) {
    const first = entries[firstIndex]!;
    for (let secondIndex = firstIndex + 1; secondIndex < entries.length; secondIndex += 1) {
      const second = entries[secondIndex]!;
      if (!areAdjacent(first, second)) continue;
      adjacency.get(first.neighborhood.id)?.add(second.neighborhood.id);
      adjacency.get(second.neighborhood.id)?.add(first.neighborhood.id);
    }
  }

  const start = entries.find((entry) => pointInIrisGeometry(origin, entry.neighborhood.geometry))
    ?? [...entries].sort((left, right) => (
      distanceBetweenCentroids(left.neighborhood, origin) - distanceBetweenCentroids(right.neighborhood, origin)
      || compareNeighborhoods(left.neighborhood, right.neighborhood)
    ))[0]!;

  const visited = new Set<string>();
  const order: string[] = [];

  const appendComponent = (seedId: string): void => {
    const queue = [seedId];
    visited.add(seedId);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const current = topologyById.get(currentId);
      if (!current) continue;
      order.push(currentId);

      const nextIds = [...(adjacency.get(currentId) ?? [])]
        .filter((id) => !visited.has(id))
        .sort((leftId, rightId) => {
          const left = topologyById.get(leftId)!.neighborhood;
          const right = topologyById.get(rightId)!.neighborhood;
          return distanceBetweenCentroids(current.neighborhood, left)
            - distanceBetweenCentroids(current.neighborhood, right)
            || compareNeighborhoods(left, right);
        });

      for (const nextId of nextIds) {
        visited.add(nextId);
        queue.push(nextId);
      }
    }
  };

  appendComponent(start.neighborhood.id);

  // A malformed or multipart dataset can contain more than one disconnected
  // component. Continue with whichever untouched polygon is nearest to the
  // already revealed frontier, preserving the same outward-spreading feeling.
  while (order.length < entries.length) {
    const next = entries
      .filter((entry) => !visited.has(entry.neighborhood.id))
      .sort((left, right) => (
        distanceToVisited(left.neighborhood, visited, topologyById)
          - distanceToVisited(right.neighborhood, visited, topologyById)
        || distanceBetweenCentroids(left.neighborhood, origin) - distanceBetweenCentroids(right.neighborhood, origin)
        || compareNeighborhoods(left.neighborhood, right.neighborhood)
      ))[0];
    if (!next) break;
    appendComponent(next.neighborhood.id);
  }

  return order;
}

/** Cheap order for interactive transitions; exact segment adjacency stays
 * available for offline analysis and tests without blocking the first click. */
function buildFastRevealOrder(
  neighborhoods: readonly IrisNeighborhood[],
  origin: { lon: number; lat: number },
): string[] {
  return neighborhoods
    .filter((neighborhood) => neighborhood.id.trim().length > 0)
    .filter((neighborhood, index, all) => all.findIndex((candidate) => candidate.id === neighborhood.id) === index)
    .sort((left, right) => (
      distanceBetweenCentroids(left, origin) - distanceBetweenCentroids(right, origin)
      || compareNeighborhoods(left, right)
    ))
    .map((neighborhood) => neighborhood.id);
}

function createTopology(neighborhood: IrisNeighborhood): NeighborhoodTopology {
  const segments = geometrySegments(neighborhood.geometry);
  const bounds = segments.length > 0
    ? segments.reduce<Bounds>((current, segment) => mergeBounds(current, segment.bounds), segments[0]!.bounds)
    : {
      minX: neighborhood.centroid[0],
      maxX: neighborhood.centroid[0],
      minY: neighborhood.centroid[1],
      maxY: neighborhood.centroid[1],
    };
  return { neighborhood, segments, bounds };
}

function geometrySegments(geometry: IrisPolygonGeometry): Segment[] {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const segments: Segment[] = [];

  for (const polygon of polygons) {
    for (const ring of polygon) {
      const points = ring
        .map((coordinate) => toPoint(coordinate))
        .filter((point): point is IrisPoint => Boolean(point));
      if (points.length < 2) continue;

      for (let index = 0; index < points.length; index += 1) {
        const from = points[index]!;
        const to = points[(index + 1) % points.length]!;
        if (from[0] === to[0] && from[1] === to[1]) continue;
        segments.push({ from, to, bounds: segmentBounds(from, to) });
      }
    }
  }
  return segments;
}

function toPoint(coordinate: readonly number[]): IrisPoint | undefined {
  const lon = coordinate[0];
  const lat = coordinate[1];
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return undefined;
  return [lon!, lat!];
}

function areAdjacent(first: NeighborhoodTopology, second: NeighborhoodTopology): boolean {
  if (!boundsNear(first.bounds, second.bounds, ADJACENCY_TOLERANCE_DEGREES)) return false;
  const toleranceSquared = ADJACENCY_TOLERANCE_DEGREES ** 2;

  for (const firstSegment of first.segments) {
    for (const secondSegment of second.segments) {
      if (!boundsNear(firstSegment.bounds, secondSegment.bounds, ADJACENCY_TOLERANCE_DEGREES)) continue;
      if (segmentDistanceSquared(firstSegment, secondSegment) <= toleranceSquared) return true;
    }
  }
  return false;
}

function segmentDistanceSquared(first: Segment, second: Segment): number {
  if (segmentsIntersect(first.from, first.to, second.from, second.to)) return 0;
  return Math.min(
    pointToSegmentDistanceSquared(first.from, second.from, second.to),
    pointToSegmentDistanceSquared(first.to, second.from, second.to),
    pointToSegmentDistanceSquared(second.from, first.from, first.to),
    pointToSegmentDistanceSquared(second.to, first.from, first.to),
  );
}

function pointToSegmentDistanceSquared(point: IrisPoint, from: IrisPoint, to: IrisPoint): number {
  const deltaX = to[0] - from[0];
  const deltaY = to[1] - from[1];
  const lengthSquared = deltaX ** 2 + deltaY ** 2;
  if (lengthSquared <= ORIENTATION_EPSILON) return distanceSquared(point, from);
  const projection = Math.max(0, Math.min(1, ((point[0] - from[0]) * deltaX + (point[1] - from[1]) * deltaY) / lengthSquared));
  return distanceSquared(point, [from[0] + projection * deltaX, from[1] + projection * deltaY]);
}

function segmentsIntersect(firstFrom: IrisPoint, firstTo: IrisPoint, secondFrom: IrisPoint, secondTo: IrisPoint): boolean {
  const firstStart = orientation(firstFrom, firstTo, secondFrom);
  const firstEnd = orientation(firstFrom, firstTo, secondTo);
  const secondStart = orientation(secondFrom, secondTo, firstFrom);
  const secondEnd = orientation(secondFrom, secondTo, firstTo);

  const crosses = ((firstStart > ORIENTATION_EPSILON && firstEnd < -ORIENTATION_EPSILON)
    || (firstStart < -ORIENTATION_EPSILON && firstEnd > ORIENTATION_EPSILON))
    && ((secondStart > ORIENTATION_EPSILON && secondEnd < -ORIENTATION_EPSILON)
      || (secondStart < -ORIENTATION_EPSILON && secondEnd > ORIENTATION_EPSILON));
  if (crosses) return true;

  return (Math.abs(firstStart) <= ORIENTATION_EPSILON && pointOnSegment(secondFrom, firstFrom, firstTo))
    || (Math.abs(firstEnd) <= ORIENTATION_EPSILON && pointOnSegment(secondTo, firstFrom, firstTo))
    || (Math.abs(secondStart) <= ORIENTATION_EPSILON && pointOnSegment(firstFrom, secondFrom, secondTo))
    || (Math.abs(secondEnd) <= ORIENTATION_EPSILON && pointOnSegment(firstTo, secondFrom, secondTo));
}

function orientation(first: IrisPoint, second: IrisPoint, third: IrisPoint): number {
  return (second[0] - first[0]) * (third[1] - first[1]) - (second[1] - first[1]) * (third[0] - first[0]);
}

function pointOnSegment(point: IrisPoint, from: IrisPoint, to: IrisPoint): boolean {
  return point[0] >= Math.min(from[0], to[0]) - ORIENTATION_EPSILON
    && point[0] <= Math.max(from[0], to[0]) + ORIENTATION_EPSILON
    && point[1] >= Math.min(from[1], to[1]) - ORIENTATION_EPSILON
    && point[1] <= Math.max(from[1], to[1]) + ORIENTATION_EPSILON;
}

function segmentBounds(from: IrisPoint, to: IrisPoint): Bounds {
  return {
    minX: Math.min(from[0], to[0]),
    maxX: Math.max(from[0], to[0]),
    minY: Math.min(from[1], to[1]),
    maxY: Math.max(from[1], to[1]),
  };
}

function mergeBounds(first: Bounds, second: Bounds): Bounds {
  return {
    minX: Math.min(first.minX, second.minX),
    minY: Math.min(first.minY, second.minY),
    maxX: Math.max(first.maxX, second.maxX),
    maxY: Math.max(first.maxY, second.maxY),
  };
}

function boundsNear(first: Bounds, second: Bounds, tolerance: number): boolean {
  return first.minX <= second.maxX + tolerance
    && first.maxX + tolerance >= second.minX
    && first.minY <= second.maxY + tolerance
    && first.maxY + tolerance >= second.minY;
}

function distanceSquared(first: IrisPoint, second: IrisPoint): number {
  const longitudeScale = Math.cos(((first[1] + second[1]) / 2) * Math.PI / 180);
  const deltaX = (first[0] - second[0]) * longitudeScale;
  const deltaY = first[1] - second[1];
  return deltaX ** 2 + deltaY ** 2;
}

function distanceBetweenCentroids(
  neighborhood: IrisNeighborhood,
  other: IrisNeighborhood | { lon: number; lat: number },
): number {
  const target: IrisPoint = "centroid" in other
    ? [other.centroid[0], other.centroid[1]]
    : [other.lon, other.lat];
  return distanceSquared([neighborhood.centroid[0], neighborhood.centroid[1]], target);
}

function distanceToVisited(
  neighborhood: IrisNeighborhood,
  visited: ReadonlySet<string>,
  topologyById: ReadonlyMap<string, NeighborhoodTopology>,
): number {
  let closest = Number.POSITIVE_INFINITY;
  for (const id of visited) {
    const other = topologyById.get(id)?.neighborhood;
    if (!other) continue;
    closest = Math.min(closest, distanceBetweenCentroids(neighborhood, other));
  }
  return closest;
}

function compareNeighborhoods(first: IrisNeighborhood, second: IrisNeighborhood): number {
  return first.name.localeCompare(second.name, "fr-FR", { numeric: true }) || first.id.localeCompare(second.id);
}
