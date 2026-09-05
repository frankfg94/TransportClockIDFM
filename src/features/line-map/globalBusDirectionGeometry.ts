import { lonLatToWorld } from "../transport-map/geo/coordinateKernel";
import { resolveTransitLonLat } from "../network-ghost/geoProjection";
import type {
  GlobalMapLine,
  GlobalMapPath,
  GlobalMapStation,
} from "../transport-map/contracts/manifest";
import {
  getGlobalMapPathSubpathRanges,
  resolveGlobalMapVertex,
} from "../transport-map/contracts/manifest";
import type { LineGeometryRequest, LineGeometryResolution } from "./lineGeometry";
import type { BusMapDirectionSelection } from "./lineMapData";

const MAX_JOIN_DISTANCE_METERS = 80;
const WORLD_CIRCUMFERENCE_METERS = 40_075_016.68557849;
const ENDPOINT_PRECISION = 10_000_000;

export function hasSingleConnectedGlobalMapPathGeometry(
  paths: readonly GlobalMapPath[],
  stationsById: ReadonlyMap<string, GlobalMapStation>,
): boolean {
  const parent: number[] = [];
  const endpointIndex = new Map<string, number>();
  const find = (index: number): number => {
    if (parent[index] === index) return index;
    parent[index] = find(parent[index]!);
    return parent[index]!;
  };
  const join = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  const endpoint = (path: GlobalMapPath, vertexIndex: number): number => {
    const vertex = path.vertices[vertexIndex]!;
    const station = vertex.stationId ? stationsById.get(vertex.stationId) : undefined;
    const point = resolveGlobalMapVertex(path, vertex, station, "BUS");
    const key = `${Math.round(point.x * ENDPOINT_PRECISION)}:${Math.round(point.y * ENDPOINT_PRECISION)}`;
    const existing = endpointIndex.get(key);
    if (existing !== undefined) return existing;
    const index = parent.length;
    parent.push(index);
    endpointIndex.set(key, index);
    return index;
  };

  for (const path of paths) {
    // A connected schematic chord is still only a fallback. Let the GTFS
    // provider replace it when a current artifact is available for the line.
    if (path.quality.fallback) continue;
    for (const range of getGlobalMapPathSubpathRanges(path)) {
      if (range.end - range.start < 2) continue;
      join(endpoint(path, range.start), endpoint(path, range.end - 1));
    }
  }
  return parent.length > 0 && new Set(parent.map((_value, index) => find(index))).size === 1;
}

export function createGlobalBusDirectionGeometryRequest(
  line: GlobalMapLine,
  selection: BusMapDirectionSelection,
): LineGeometryRequest | undefined {
  const stops = selection.sequence.stops.flatMap((stop) => {
    const coordinate = resolveTransitLonLat(stop);
    return coordinate
      ? [{ id: stop.id, label: stop.label, ...coordinate }]
      : [];
  });
  if (stops.length !== selection.sequence.stops.length || stops.length < 2) {
    return undefined;
  }

  return {
    lineId: line.sourceLineId ?? line.id,
    lineLabel: line.label || line.code,
    useGtfs: true,
    stops,
    branches: [{
      id: selection.selectedDirectionId,
      direction: selection.sequence.direction,
      stopIds: stops.map((stop) => stop.id),
    }],
  };
}

/**
 * Converts a resolved V1/provider route into one V2 render path. The provider
 * may project the same stop to a different quay on each adjacent edge. Those
 * two endpoints must be reconciled before the segments are concatenated;
 * otherwise the global map falls back to several clipped static fragments and
 * exposes a visible gap. A direct fallback chord is still rejected because it
 * would invent the whole edge, whereas reconciling two validated provider
 * edges only joins their shared stop.
 */
export function createGlobalBusDirectionGeometryPath(
  line: GlobalMapLine,
  selection: BusMapDirectionSelection,
  stationIds: readonly string[],
  resolution: LineGeometryResolution,
): GlobalMapPath | undefined {
  const stops = selection.sequence.stops;
  if (stops.length < 2 || stationIds.length !== stops.length) return undefined;
  const hasFallbackLeg = resolution.source === "direct"
    || resolution.segments.some((segment) => segment.fallback === true);
  if (hasFallbackLeg) return undefined;

  const remainingSegments = [...resolution.segments];
  const orderedSegments: Array<{
    fromStationId: string;
    toStationId: string;
    points: Array<{ x: number; y: number }>;
  }> = [];

  for (let index = 1; index < stops.length; index += 1) {
    const from = stops[index - 1]!;
    const to = stops[index]!;
    const segmentIndex = remainingSegments.findIndex((segment) =>
      (segment.fromStopId === from.id && segment.toStopId === to.id)
      || (segment.fromStopId === to.id && segment.toStopId === from.id),
    );
    if (segmentIndex < 0) return undefined;

    const segment = remainingSegments.splice(segmentIndex, 1)[0]!;
    const coordinates = segment.fromStopId === from.id
      ? segment.coordinates
      : [...segment.coordinates].reverse();
    if (coordinates.length < 2) return undefined;

    orderedSegments.push({
      fromStationId: stationIds[index - 1]!,
      toStationId: stationIds[index]!,
      points: coordinates.map(lonLatToWorld),
    });
  }

  const requestedStopPoints = new Map<number, { x: number; y: number }>();
  stops.forEach((stop, index) => {
    const coordinate = resolveTransitLonLat(stop);
    if (coordinate) requestedStopPoints.set(index, lonLatToWorld(coordinate));
  });

  // One shared stop can have two provider endpoints. Pick the endpoint closest
  // to the requested stop and reuse it on both sides of the join. This keeps
  // the road trace continuous without replacing either validated edge with a
  // direct stop-to-stop chord.
  const joinPoints = new Map<number, { x: number; y: number }>();
  let maximumRawJoinGapMeters = 0;
  let maximumStationDistanceMeters = 0;
  for (let index = 1; index < stops.length - 1; index += 1) {
    const previous = orderedSegments[index - 1]?.points.at(-1);
    const next = orderedSegments[index]?.points[0];
    if (!previous || !next) return undefined;

    const rawGapMeters = worldDistanceMeters(previous, next);
    maximumRawJoinGapMeters = Math.max(maximumRawJoinGapMeters, rawGapMeters);
    const reference = requestedStopPoints.get(index);
    const join = chooseClosestGlobalBusEndpoint(previous, next, reference);
    joinPoints.set(index, join);
    if (reference) {
      maximumStationDistanceMeters = Math.max(
        maximumStationDistanceMeters,
        worldDistanceMeters(join, reference),
      );
    }
  }

  const vertices: GlobalMapPath["vertices"] = [];
  const anchors = new Map<string, { stationId: string; x: number; y: number }>();

  orderedSegments.forEach((segment, index) => {
    const projected = [...segment.points];
    const first = index === 0 ? projected[0]! : joinPoints.get(index)!;
    const last = index === orderedSegments.length - 1
      ? projected.at(-1)!
      : joinPoints.get(index + 1)!;
    projected[0] = first;
    projected[projected.length - 1] = last;

    projected.forEach((point, pointIndex) => {
      if (vertices.length > 0 && pointIndex === 0) return;
      const stationId = pointIndex === 0
        ? segment.fromStationId
        : pointIndex === projected.length - 1
          ? segment.toStationId
          : undefined;
      vertices.push({ ...point, ...(stationId ? { stationId } : {}) });
    });
    anchors.set(segment.fromStationId, { stationId: segment.fromStationId, ...first });
    anchors.set(segment.toStationId, { stationId: segment.toStationId, ...last });
    if (requestedStopPoints.has(index)) {
      maximumStationDistanceMeters = Math.max(
        maximumStationDistanceMeters,
        worldDistanceMeters(first, requestedStopPoints.get(index)!),
      );
    }
    if (index === orderedSegments.length - 1 && requestedStopPoints.has(index + 1)) {
      maximumStationDistanceMeters = Math.max(
        maximumStationDistanceMeters,
        worldDistanceMeters(last, requestedStopPoints.get(index + 1)!),
      );
    }
  });

  if (vertices.length < 2) return undefined;
  const joinQuality = maximumRawJoinGapMeters > MAX_JOIN_DISTANCE_METERS
    ? `reconciled-${Math.round(maximumRawJoinGapMeters)}m`
    : "aligned";
  return {
    id: `path:${line.id}:direction:${selection.selectedDirectionId}`,
    lineId: line.id,
    geometrySource: "gtfs",
    sourceVersion: `direction:${resolution.source}:${resolution.datasetVersion ?? "unknown"}:${joinQuality}`,
    quality: {
      complete: true,
      fallback: false,
      gapMeters: 0,
      stationDistanceMaxMeters: maximumStationDistanceMeters,
    },
    stationIds: [...new Set(stationIds)],
    vertices,
    renderStationAnchors: [...anchors.values()],
    minX: Math.min(...vertices.map((vertex) => vertex.x)),
    minY: Math.min(...vertices.map((vertex) => vertex.y)),
    maxX: Math.max(...vertices.map((vertex) => vertex.x)),
    maxY: Math.max(...vertices.map((vertex) => vertex.y)),
    chunkIds: [],
  };
}

function chooseClosestGlobalBusEndpoint(
  previous: { x: number; y: number },
  next: { x: number; y: number },
  reference: { x: number; y: number } | undefined,
): { x: number; y: number } {
  if (!reference) return previous;
  return worldDistanceMeters(previous, reference) <= worldDistanceMeters(next, reference)
    ? previous
    : next;
}

function worldDistanceMeters(
  left: { x: number; y: number },
  right: { x: number; y: number },
): number {
  return Math.hypot(left.x - right.x, left.y - right.y) * WORLD_CIRCUMFERENCE_METERS;
}
