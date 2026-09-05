import {
  createUndirectedEdgeKey,
  type LineGeometryCoordinate,
  type LineGeometryBranchRequest,
  type LineGeometryRequest,
  type LineGeometrySegment,
  type LineGeometryStopRequest,
} from "../../../src/features/line-map/lineGeometry.js";

const MAX_PROJECTION_ERROR_METERS = 300;
const MIN_PATH_RATIO = 0.35;
const MAX_PATH_RATIO = 8;
const MAX_PREFERRED_PATH_RATIO = 1.8;
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

interface MonotonicProjectionState {
  projection: TraceProjection;
  previousIndex: number;
  totalErrorMeters: number;
  maximumErrorMeters: number;
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
        projectStopsMonotonically([branchStops[index], branchStops[index + 1]], traces);
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

/**
 * Allows separate provider traces to cover adjacent requested edges while
 * keeping the provider result all-or-nothing. An unmatched physical edge must
 * reject the result instead of being presented as a trace-backed chord.
 */
export function createCompleteSegmentsFromTraces(
  request: LineGeometryRequest,
  traces: LineGeometryCoordinate[][],
): LineGeometrySegment[] | undefined {
  const stops = new Map(request.stops.map((stop) => [stop.id, stop]));
  const segments = new Map<string, LineGeometrySegment>();

  for (const branch of request.branches) {
    for (let index = 0; index < branch.stopIds.length - 1; index += 1) {
      const fromStopId = branch.stopIds[index];
      const toStopId = branch.stopIds[index + 1];
      const key = createUndirectedEdgeKey(fromStopId, toStopId);
      if (segments.has(key)) continue;

      const from = stops.get(fromStopId);
      const to = stops.get(toStopId);
      if (!from || !to) return undefined;

      const projected = createSegmentsFromTraces(
        {
          ...request,
          branches: [{ id: key, stopIds: [fromStopId, toStopId] }],
        },
        traces,
      )?.[0];
      if (!projected) return undefined;
      segments.set(key, projected);
    }
  }

  return segments.size > 0 ? [...segments.values()] : undefined;
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
      const defined = selectMonotonicProjections(
        stops,
        orientedTrace,
        directDistance,
        maximumErrorMeters,
      );
      if (!defined) return [];
      const errorMeters = Math.max(...defined.map((projection) => projection.errorMeters));
      const meanErrorMeters =
        defined.reduce((total, projection) => total + projection.errorMeters, 0) / defined.length;
      const pathDistance = defined[defined.length - 1].along - defined[0].along;
      const pathRatio = pathDistance / Math.max(directDistance, 1);
      const score = meanErrorMeters + errorMeters * 0.35 + Math.max(0, pathRatio - 2.5) * 40;

      return [
        {
          trace: orientedTrace,
          projections: defined,
          errorMeters,
          meanErrorMeters,
          pathRatio,
          score,
          reversed,
        },
      ];
    });
  });

  return candidates.sort(
    (left, right) =>
      getTracePathRatioPenalty(left.pathRatio) - getTracePathRatioPenalty(right.pathRatio) ||
      left.score - right.score ||
      left.errorMeters - right.errorMeters ||
      left.trace.length - right.trace.length,
  )[0];
}

function getTracePathRatioPenalty(pathRatio: number): number {
  return pathRatio > MAX_PREFERRED_PATH_RATIO ? 1 : 0;
}

/**
 * Finds one globally monotonic projection path instead of independently taking
 * the nearest shape point for every stop. Closed and self-crossing routes can
 * contain the same station more than once; a local nearest-point choice maps
 * both occurrences to the first visit and makes an otherwise valid loop look
 * non-monotonic.
 */
function selectMonotonicProjections(
  points: LineGeometryCoordinate[],
  trace: LineGeometryCoordinate[],
  directDistance: number,
  maximumErrorMeters: number,
): TraceProjection[] | undefined {
  const candidateLayers = points.map((point) =>
    projectPointCandidatesOnTrace(point, trace).filter(
      (candidate) => candidate.errorMeters <= maximumErrorMeters,
    ),
  );
  if (candidateLayers.some((candidates) => candidates.length === 0)) {
    return undefined;
  }
  if (candidateLayers.length === 2) {
    return selectTwoPointProjectionPath(
      candidateLayers[0],
      candidateLayers[1],
      directDistance,
    );
  }

  const stateLayers: Array<Array<MonotonicProjectionState | undefined>> = [
    candidateLayers[0].map((projection) => ({
      projection,
      previousIndex: -1,
      totalErrorMeters: projection.errorMeters,
      maximumErrorMeters: projection.errorMeters,
    })),
  ];

  for (let layerIndex = 1; layerIndex < candidateLayers.length; layerIndex += 1) {
    const previousStates = stateLayers[layerIndex - 1];
    const currentCandidates = candidateLayers[layerIndex];
    const currentStates: Array<MonotonicProjectionState | undefined> = [];
    let previousCursor = 0;
    let bestPreviousIndex = -1;

    for (const projection of currentCandidates) {
      while (
        previousCursor < previousStates.length &&
        candidateLayers[layerIndex - 1][previousCursor].along <= projection.along
      ) {
        const candidateState = previousStates[previousCursor];
        const bestState = bestPreviousIndex >= 0 ? previousStates[bestPreviousIndex] : undefined;
        if (
          candidateState &&
          (!bestState || compareProjectionStates(candidateState, bestState, points.length) < 0)
        ) {
          bestPreviousIndex = previousCursor;
        }
        previousCursor += 1;
      }

      const previousState = bestPreviousIndex >= 0 ? previousStates[bestPreviousIndex] : undefined;
      currentStates.push(
        previousState
          ? {
              projection,
              previousIndex: bestPreviousIndex,
              totalErrorMeters: previousState.totalErrorMeters + projection.errorMeters,
              maximumErrorMeters: Math.max(
                previousState.maximumErrorMeters,
                projection.errorMeters,
              ),
            }
          : undefined,
      );
    }

    if (currentStates.every((state) => !state)) return undefined;
    stateLayers.push(currentStates);
  }

  const lastLayerIndex = stateLayers.length - 1;
  const viablePaths = stateLayers[lastLayerIndex].flatMap((state, stateIndex) => {
    if (!state) return [];
    const projections = reconstructProjectionPath(stateLayers, lastLayerIndex, stateIndex);
    const pathDistance = projections[projections.length - 1].along - projections[0].along;
    const pathRatio = pathDistance / Math.max(directDistance, 1);
    return pathRatio >= MIN_PATH_RATIO && pathRatio <= MAX_PATH_RATIO
      ? [{ projections, pathRatio }]
      : [];
  });

  return viablePaths.sort(
    (left, right) =>
      getTracePathRatioPenalty(left.pathRatio) - getTracePathRatioPenalty(right.pathRatio) ||
      compareProjectionPaths(left.projections, right.projections),
  )[0]?.projections;
}

function selectTwoPointProjectionPath(
  fromCandidates: TraceProjection[],
  toCandidates: TraceProjection[],
  directDistance: number,
): TraceProjection[] | undefined {
  const normalizedDirectDistance = Math.max(directDistance, 1);
  const minimumPathMeters = MIN_PATH_RATIO * normalizedDirectDistance;
  const preferredMaximumPathMeters =
    MAX_PREFERRED_PATH_RATIO * normalizedDirectDistance;
  const maximumPathMeters = MAX_PATH_RATIO * normalizedDirectDistance;

  return (
    selectBestProjectionPairWithinPathRange(
      fromCandidates,
      toCandidates,
      minimumPathMeters,
      preferredMaximumPathMeters,
    ) ??
    selectBestProjectionPairWithinPathRange(
      fromCandidates,
      toCandidates,
      minimumPathMeters,
      maximumPathMeters,
    )
  );
}

function selectBestProjectionPairWithinPathRange(
  fromCandidates: TraceProjection[],
  toCandidates: TraceProjection[],
  minimumPathMeters: number,
  maximumPathMeters: number,
): TraceProjection[] | undefined {
  const activeFromIndexes: number[] = [];
  let nextFromIndex = 0;
  const pairs: TraceProjection[][] = [];

  for (const to of toCandidates) {
    const latestAllowedAlong = to.along - minimumPathMeters;
    const earliestAllowedAlong = to.along - maximumPathMeters;

    while (
      nextFromIndex < fromCandidates.length &&
      fromCandidates[nextFromIndex].along <= latestAllowedAlong
    ) {
      pushProjectionCandidateIndex(
        activeFromIndexes,
        nextFromIndex,
        fromCandidates,
      );
      nextFromIndex += 1;
    }

    while (
      activeFromIndexes.length > 0 &&
      fromCandidates[activeFromIndexes[0]].along < earliestAllowedAlong
    ) {
      popProjectionCandidateIndex(activeFromIndexes, fromCandidates);
    }

    const bestFromIndex = activeFromIndexes[0];
    if (bestFromIndex !== undefined) {
      pairs.push([fromCandidates[bestFromIndex], to]);
    }
  }

  return pairs.sort(compareProjectionPaths)[0];
}

function pushProjectionCandidateIndex(
  heap: number[],
  candidateIndex: number,
  candidates: TraceProjection[],
): void {
  heap.push(candidateIndex);
  let index = heap.length - 1;

  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    if (
      compareProjectionCandidates(
        candidates[heap[parentIndex]],
        candidates[heap[index]],
      ) <= 0
    ) {
      break;
    }
    [heap[parentIndex], heap[index]] = [heap[index], heap[parentIndex]];
    index = parentIndex;
  }
}

function popProjectionCandidateIndex(
  heap: number[],
  candidates: TraceProjection[],
): void {
  const last = heap.pop();
  if (last === undefined || heap.length === 0) return;
  heap[0] = last;
  let index = 0;

  while (true) {
    const leftIndex = index * 2 + 1;
    const rightIndex = leftIndex + 1;
    let bestIndex = index;

    if (
      leftIndex < heap.length &&
      compareProjectionCandidates(
        candidates[heap[leftIndex]],
        candidates[heap[bestIndex]],
      ) < 0
    ) {
      bestIndex = leftIndex;
    }
    if (
      rightIndex < heap.length &&
      compareProjectionCandidates(
        candidates[heap[rightIndex]],
        candidates[heap[bestIndex]],
      ) < 0
    ) {
      bestIndex = rightIndex;
    }
    if (bestIndex === index) return;
    [heap[index], heap[bestIndex]] = [heap[bestIndex], heap[index]];
    index = bestIndex;
  }
}

function compareProjectionCandidates(
  left: TraceProjection,
  right: TraceProjection,
): number {
  return left.errorMeters - right.errorMeters || left.along - right.along;
}

function compareProjectionStates(
  left: MonotonicProjectionState,
  right: MonotonicProjectionState,
  stopCount: number,
): number {
  return (
    left.totalErrorMeters / stopCount +
      left.maximumErrorMeters * 0.35 -
      (right.totalErrorMeters / stopCount + right.maximumErrorMeters * 0.35) ||
    left.projection.along - right.projection.along
  );
}

function compareProjectionPaths(left: TraceProjection[], right: TraceProjection[]): number {
  const leftMaximum = Math.max(...left.map(({ errorMeters }) => errorMeters));
  const rightMaximum = Math.max(...right.map(({ errorMeters }) => errorMeters));
  const leftMean = left.reduce((total, { errorMeters }) => total + errorMeters, 0) / left.length;
  const rightMean = right.reduce((total, { errorMeters }) => total + errorMeters, 0) / right.length;
  return (
    leftMean + leftMaximum * 0.35 - (rightMean + rightMaximum * 0.35) ||
    left[0].along - right[0].along
  );
}

function reconstructProjectionPath(
  stateLayers: Array<Array<MonotonicProjectionState | undefined>>,
  layerIndex: number,
  stateIndex: number,
): TraceProjection[] {
  const projections: TraceProjection[] = [];
  let currentStateIndex = stateIndex;
  for (let currentLayerIndex = layerIndex; currentLayerIndex >= 0; currentLayerIndex -= 1) {
    const state = stateLayers[currentLayerIndex][currentStateIndex]!;
    projections.push(state.projection);
    currentStateIndex = state.previousIndex;
  }
  return projections.reverse();
}

function projectPointCandidatesOnTrace(
  point: LineGeometryCoordinate,
  trace: LineGeometryCoordinate[],
): TraceProjection[] {
  let travelled = 0;
  const candidates: TraceProjection[] = [];

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

    candidates.push(candidate);
    travelled += segmentMeters;
  }

  return candidates;
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
