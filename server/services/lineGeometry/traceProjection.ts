import {
  createUndirectedEdgeKey,
  type LineGeometryCoordinate,
  type LineGeometryBranchRequest,
  type LineGeometryRequest,
  type LineGeometrySegment,
  type LineGeometryStopRequest,
} from "../../../src/features/line-map/lineGeometry";

const MAX_PROJECTION_ERROR_METERS = 300;
const MIN_PATH_RATIO = 0.35;
const MAX_PATH_RATIO = 8;
const MAX_DEGENERATE_EDGE_METERS = 50;

export interface TraceProjection {
  point: LineGeometryCoordinate;
  segmentIndex: number;
  progress: number;
  along: number;
  errorMeters: number;
}

export interface ProjectedTrace {
  trace: LineGeometryCoordinate[];
  projections: TraceProjection[];
  errorMeters: number;
  meanErrorMeters: number;
  pathRatio: number;
  score: number;
  reversed: boolean;
}

export interface CanonicalTraceGeometry {
  stops: LineGeometryStopRequest[];
  branches: LineGeometryBranchRequest[];
  segments: LineGeometrySegment[];
}

export function createCanonicalTraceGeometry(
  traces: LineGeometryCoordinate[][],
): CanonicalTraceGeometry {
  const stops: LineGeometryStopRequest[] = [];
  const branches: LineGeometryBranchRequest[] = [];
  const segments: LineGeometrySegment[] = [];

  traces.forEach((trace, index) => {
    if (trace.length < 2 || !trace.every(isValidTraceCoordinate)) return;

    const id = `provider-trace:${index}`;
    const fromStopId = `${id}:start`;
    const toStopId = `${id}:end`;
    const from = trace[0];
    const to = trace[trace.length - 1];

    stops.push(
      { id: fromStopId, lon: from.lon, lat: from.lat },
      { id: toStopId, lon: to.lon, lat: to.lat },
    );
    branches.push({ id, stopIds: [fromStopId, toStopId] });
    segments.push({ id, fromStopId, toStopId, coordinates: trace });
  });

  return { stops, branches, segments };
}

export function createSegmentsFromTraces(
  request: LineGeometryRequest,
  traces: LineGeometryCoordinate[][],
): LineGeometrySegment[] | undefined {
  const stops = new Map(request.stops.map((stop) => [stop.id, stop]));
  const segments = new Map<string, LineGeometrySegment>();

  for (const branch of request.branches) {
    const branchStops = branch.stopIds
      .map((stopId) => stops.get(stopId))
      .filter((stop): stop is NonNullable<typeof stop> => Boolean(stop));

    if (branchStops.length !== branch.stopIds.length || branchStops.length < 2) {
      return undefined;
    }

    const projectedBranch = projectStopsMonotonically(branchStops, traces);

    for (let index = 0; index < branch.stopIds.length - 1; index += 1) {
      const fromStopId = branch.stopIds[index];
      const toStopId = branch.stopIds[index + 1];
      const key = createUndirectedEdgeKey(fromStopId, toStopId);
      if (segments.has(key)) continue;

      const projected =
        projectedBranch ??
        projectStopsMonotonically(
          [branchStops[index], branchStops[index + 1]],
          traces,
        );
      const from = branchStops[index];
      const to = branchStops[index + 1];
      let coordinates = projected
        ? sliceTraceBetween(
            projected.trace,
            projected.projections[projectedBranch ? index : 0],
            projected.projections[projectedBranch ? index + 1 : 1],
          )
        : [];
      if (coordinates.length < 2) {
        if (distanceMeters(from, to) > MAX_DEGENERATE_EDGE_METERS) return undefined;
        coordinates = [
          { lon: from.lon, lat: from.lat },
          { lon: to.lon, lat: to.lat },
        ];
      }

      segments.set(key, {
        id: key,
        fromStopId,
        toStopId,
        coordinates,
      });
    }
  }

  return [...segments.values()];
}

export function projectStopsMonotonically(
  stops: LineGeometryCoordinate[],
  traces: LineGeometryCoordinate[][],
  maximumErrorMeters = MAX_PROJECTION_ERROR_METERS,
): ProjectedTrace | undefined {
  if (stops.length < 2) return undefined;

  const directDistance = stops
    .slice(1)
    .reduce((total, stop, index) => total + distanceMeters(stops[index], stop), 0);
  const candidates = traces.flatMap((trace) => {
    if (trace.length < 2) return [];

    return (
      [
        [false, trace],
        [true, [...trace].reverse()],
      ] as const
    ).flatMap(([reversed, orientedTrace]) => {
      const projections = stops.map((stop) => projectPointOnTrace(stop, orientedTrace));
      if (projections.some((projection) => !projection)) return [];

      const defined = projections as TraceProjection[];
      const monotonic = defined.every(
        (projection, index) => index === 0 || projection.along >= defined[index - 1].along,
      );
      const errorMeters = Math.max(...defined.map((projection) => projection.errorMeters));
      const meanErrorMeters =
        defined.reduce((total, projection) => total + projection.errorMeters, 0) / defined.length;
      const pathDistance = defined[defined.length - 1].along - defined[0].along;
      const pathRatio = pathDistance / Math.max(directDistance, 1);
      const plausiblePath = pathRatio >= MIN_PATH_RATIO && pathRatio <= MAX_PATH_RATIO;
      const score = meanErrorMeters + errorMeters * 0.35 + Math.max(0, pathRatio - 2.5) * 40;

      return monotonic && plausiblePath && errorMeters <= maximumErrorMeters
        ? [
            {
              trace: orientedTrace,
              projections: defined,
              errorMeters,
              meanErrorMeters,
              pathRatio,
              score,
              reversed,
            },
          ]
        : [];
    });
  });

  return candidates.sort(
    (left, right) =>
      left.score - right.score ||
      left.errorMeters - right.errorMeters ||
      left.trace.length - right.trace.length,
  )[0];
}
function projectPointOnTrace(
  point: LineGeometryCoordinate,
  trace: LineGeometryCoordinate[],
): TraceProjection | undefined {
  let travelled = 0;
  let best: TraceProjection | undefined;

  for (let index = 0; index < trace.length - 1; index += 1) {
    const start = trace[index];
    const end = trace[index + 1];
    const segmentMeters = distanceMeters(start, end);
    if (segmentMeters <= 0) continue;

    const projected = projectOnSegment(point, start, end);
    const candidate: TraceProjection = {
      point: projected.point,
      segmentIndex: index,
      progress: projected.progress,
      along: travelled + projected.progress * segmentMeters,
      errorMeters: distanceMeters(point, projected.point),
    };

    if (!best || candidate.errorMeters < best.errorMeters) best = candidate;
    travelled += segmentMeters;
  }

  return best;
}

function sliceTraceBetween(
  trace: LineGeometryCoordinate[],
  from: TraceProjection,
  to: TraceProjection,
): LineGeometryCoordinate[] {
  if (to.along < from.along) return [];
  const points = [from.point];

  for (let index = from.segmentIndex + 1; index <= to.segmentIndex; index += 1) {
    points.push(trace[index]);
  }
  points.push(to.point);

  return dedupeCoordinates(points);
}

function projectOnSegment(
  point: LineGeometryCoordinate,
  start: LineGeometryCoordinate,
  end: LineGeometryCoordinate,
): { point: LineGeometryCoordinate; progress: number } {
  const latitudeRadians = (point.lat * Math.PI) / 180;
  const xScale = Math.max(0.1, Math.cos(latitudeRadians));
  const dx = (end.lon - start.lon) * xScale;
  const dy = end.lat - start.lat;
  const px = (point.lon - start.lon) * xScale;
  const py = point.lat - start.lat;
  const denominator = dx * dx + dy * dy;
  const progress = denominator ? Math.min(1, Math.max(0, (px * dx + py * dy) / denominator)) : 0;

  return {
    progress,
    point: {
      lon: start.lon + (end.lon - start.lon) * progress,
      lat: start.lat + (end.lat - start.lat) * progress,
    },
  };
}

function dedupeCoordinates(coordinates: LineGeometryCoordinate[]): LineGeometryCoordinate[] {
  return coordinates.filter((coordinate, index) => {
    const previous = coordinates[index - 1];
    return !previous || distanceMeters(previous, coordinate) >= 0.25;
  });
}

function distanceMeters(left: LineGeometryCoordinate, right: LineGeometryCoordinate): number {
  const latitudeRadians = (((left.lat + right.lat) / 2) * Math.PI) / 180;
  const x = (right.lon - left.lon) * Math.cos(latitudeRadians);
  const y = right.lat - left.lat;
  return Math.hypot(x, y) * 111_320;
}

function isValidTraceCoordinate(coordinate: LineGeometryCoordinate): boolean {
  return (
    Number.isFinite(coordinate.lon) &&
    Number.isFinite(coordinate.lat) &&
    Math.abs(coordinate.lon) <= 180 &&
    Math.abs(coordinate.lat) <= 90
  );
}
