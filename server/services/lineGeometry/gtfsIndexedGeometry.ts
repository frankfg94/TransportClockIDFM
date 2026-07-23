import type {
  GtfsIndexedPattern,
  GtfsLineArtifact,
  GtfsStopShapeProjection,
} from "../gtfs/types";
import {
  createUndirectedEdgeKey,
  type LineGeometryCoordinate,
  type LineGeometryRequest,
  type LineGeometrySegment,
  type LineGeometryStopRequest,
} from "../../../src/features/line-map/lineGeometry";

const MAX_STOP_MATCH_DISTANCE_METERS = 300;
const MIN_UNAMBIGUOUS_DISTANCE_MARGIN_METERS = 20;
const MAX_SHARED_EDGE_DEVIATION_METERS = 75;
const MAX_GEOMETRY_COMPARISON_SAMPLES = 24;

export interface CompiledGtfsPattern {
  id: string;
  direction?: string;
  stopIds: string[];
  projections: GtfsStopShapeProjection[];
  shape: LineGeometryCoordinate[];
}

interface CompiledGtfsStop {
  id: string;
  coordinates: LineGeometryCoordinate[];
}

export interface CompiledGtfsLineArtifact {
  lineId: string;
  patterns: CompiledGtfsPattern[];
  stops: CompiledGtfsStop[];
  stopIdsByReferenceKey: Map<string, string[]>;
}

interface MatchedStop {
  request: LineGeometryStopRequest;
  gtfsStopId: string;
  errorMeters: number;
}

interface PatternMatch {
  pattern: CompiledGtfsPattern;
  stopIndexes: number[];
  score: number;
  directionPenalty: number;
  skippedStops: number;
  geographicErrorMeters: number;
}

interface ScoredSegment {
  segment: LineGeometrySegment;
  score: number;
}

/**
 * Compiles only metadata already produced by the importer. Raw shapes are
 * oriented once and never searched point-by-point while resolving a request.
 */
export function compileGtfsLineArtifact(
  artifact: GtfsLineArtifact,
): CompiledGtfsLineArtifact {
  const orientedShapes = new Map<string, LineGeometryCoordinate[]>();
  const stopsById = new Map<string, CompiledGtfsStop>();
  const referenceSets = new Map<string, Set<string>>();
  const patterns = artifact.patterns.flatMap((pattern) => {
    const compiled = compilePattern(pattern, artifact, orientedShapes);
    if (!compiled) return [];

    compiled.projections.forEach((projection) => {
      const stop = stopsById.get(projection.stopId) ?? {
        id: projection.stopId,
        coordinates: [],
      };
      if (
        !stop.coordinates.some(
          (coordinate) => distanceMeters(coordinate, projection.coordinate) < 0.25,
        )
      ) {
        stop.coordinates.push(projection.coordinate);
      }
      stopsById.set(stop.id, stop);

      createStopReferenceKeys(stop.id).forEach((key) => {
        const ids = referenceSets.get(key) ?? new Set<string>();
        ids.add(stop.id);
        referenceSets.set(key, ids);
      });
    });
    return [compiled];
  });

  return {
    lineId: artifact.lineId,
    patterns,
    stops: [...stopsById.values()],
    stopIdsByReferenceKey: new Map(
      [...referenceSets].map(([key, ids]) => [key, [...ids].sort()]),
    ),
  };
}

export function createSegmentsFromIndexedGtfs(
  request: LineGeometryRequest,
  compiled: CompiledGtfsLineArtifact,
): LineGeometrySegment[] | undefined {
  if (compiled.patterns.length === 0) return undefined;

  const referencedStopIds = new Set(request.branches.flatMap((branch) => branch.stopIds));
  const requestedStops = request.stops.filter((stop) => referencedStopIds.has(stop.id));
  const matchedStops = matchRequestStops(requestedStops, compiled);
  if (!matchedStops) return undefined;

  const matchByRequestId = new Map(matchedStops.map((match) => [match.request.id, match]));
  const segments = new Map<string, ScoredSegment>();

  for (const branch of request.branches) {
    const branchMatches = branch.stopIds.map((stopId) => matchByRequestId.get(stopId));
    if (branchMatches.some((match) => !match)) return undefined;

    const definedMatches = branchMatches as MatchedStop[];
    const patternMatch = findBestPatternMatch(
      definedMatches.map(({ gtfsStopId }) => gtfsStopId),
      branch.direction,
      definedMatches.reduce((total, match) => total + match.errorMeters, 0),
      compiled.patterns,
    );
    if (!patternMatch) return undefined;

    for (let index = 0; index < branch.stopIds.length - 1; index += 1) {
      const fromStopId = branch.stopIds[index];
      const toStopId = branch.stopIds[index + 1];
      const coordinates = slicePatternShape(
        patternMatch.pattern,
        patternMatch.stopIndexes[index],
        patternMatch.stopIndexes[index + 1],
      );
      if (coordinates.length < 2) return undefined;

      const edgeKey = createUndirectedEdgeKey(fromStopId, toStopId);
      const candidate: ScoredSegment = {
        score: patternMatch.score,
        segment: {
          id: edgeKey,
          fromStopId,
          toStopId,
          coordinates,
        },
      };
      const existing = segments.get(edgeKey);
      if (!existing) {
        segments.set(edgeKey, candidate);
        continue;
      }

      const orientedCandidate =
        existing.segment.fromStopId === candidate.segment.fromStopId
          ? candidate.segment.coordinates
          : [...candidate.segment.coordinates].reverse();
      if (
        maximumPolylineDeviationMeters(
          existing.segment.coordinates,
          orientedCandidate,
        ) > MAX_SHARED_EDGE_DEVIATION_METERS
      ) {
        return undefined;
      }
      if (candidate.score < existing.score) {
        segments.set(edgeKey, candidate);
      }
    }
  }

  return [...segments.values()].map(({ segment }) => segment);
}

function compilePattern(
  pattern: GtfsIndexedPattern,
  artifact: GtfsLineArtifact,
  orientedShapes: Map<string, LineGeometryCoordinate[]>,
): CompiledGtfsPattern | undefined {
  if (
    pattern.stopIds.length < 2 ||
    pattern.projections.length !== pattern.stopIds.length ||
    pattern.projections.some(
      (projection, index) =>
        projection.stopId !== pattern.stopIds[index] ||
        !isValidCoordinate(projection.coordinate) ||
        !Number.isInteger(projection.shapePointIndex) ||
        projection.shapePointIndex < 0 ||
        projection.segmentProgress < 0 ||
        projection.segmentProgress > 1 ||
        (index > 0 &&
          projection.distanceAlongMeters <
            pattern.projections[index - 1].distanceAlongMeters),
    )
  ) {
    return undefined;
  }

  const shapeKey = `${pattern.shapeId}:${pattern.shapeDirection}`;
  let shape = orientedShapes.get(shapeKey);
  if (!shape) {
    const rawShape = artifact.shapes[pattern.shapeId];
    if (!rawShape?.length || rawShape.length < 2 || !rawShape.every(isValidCoordinate)) {
      return undefined;
    }
    shape =
      pattern.shapeDirection === "reverse"
        ? [...rawShape].reverse()
        : rawShape;
    orientedShapes.set(shapeKey, shape);
  }
  if (
    pattern.projections.some(
      (projection) => projection.shapePointIndex >= shape.length - 1,
    )
  ) {
    return undefined;
  }

  return {
    id: pattern.id,
    direction: pattern.direction,
    stopIds: pattern.stopIds,
    projections: pattern.projections,
    shape,
  };
}

function matchRequestStops(
  requestStops: LineGeometryStopRequest[],
  compiled: CompiledGtfsLineArtifact,
): MatchedStop[] | undefined {
  const matches: MatchedStop[] = [];
  const requestIdByGtfsStop = new Map<string, string>();

  for (const request of requestStops) {
    const exactIds = new Set(
      compiled.stopIdsByReferenceKey.get(createCanonicalStopReferenceKey(request.id)) ?? [],
    );
    const candidates = (exactIds.size > 0
      ? compiled.stops.filter(({ id }) => exactIds.has(id))
      : compiled.stops
    )
      .map((stop) => ({
        stop,
        distance: minimumCoordinateDistance(request, stop.coordinates),
      }))
      .sort(
        (left, right) =>
          left.distance - right.distance ||
          left.stop.id.localeCompare(right.stop.id),
      );
    const nearest = candidates[0];
    const second = candidates[1];

    if (
      !nearest ||
      nearest.distance > MAX_STOP_MATCH_DISTANCE_METERS ||
      (exactIds.size !== 1 &&
        second &&
        second.distance - nearest.distance <
          MIN_UNAMBIGUOUS_DISTANCE_MARGIN_METERS)
    ) {
      return undefined;
    }

    const previousRequestId = requestIdByGtfsStop.get(nearest.stop.id);
    if (previousRequestId && previousRequestId !== request.id) return undefined;
    requestIdByGtfsStop.set(nearest.stop.id, request.id);
    matches.push({
      request,
      gtfsStopId: nearest.stop.id,
      errorMeters: nearest.distance,
    });
  }

  return matches;
}

function findBestPatternMatch(
  stopIds: string[],
  requestedDirection: string | undefined,
  stopMatchErrorMeters: number,
  patterns: CompiledGtfsPattern[],
): PatternMatch | undefined {
  const matches = patterns.flatMap((pattern) => {
    const increasing = findIncreasingSubsequence(pattern.stopIds, stopIds);
    const decreasing = findDecreasingSubsequence(pattern.stopIds, stopIds);

    return [increasing, decreasing].flatMap((stopIndexes) => {
      if (!stopIndexes) return [];
      const skippedStops = stopIndexes
        .slice(1)
        .reduce(
          (total, stopIndex, index) =>
            total + Math.abs(stopIndex - stopIndexes[index]) - 1,
          0,
        );
      const projectionError = stopIndexes.reduce(
        (total, stopIndex) =>
          total + pattern.projections[stopIndex].errorMeters,
        0,
      );
      const directionPenalty =
        requestedDirection &&
        pattern.direction &&
        normalizeDirection(requestedDirection) !==
          normalizeDirection(pattern.direction)
          ? 1
          : 0;
      const geographicErrorMeters = stopMatchErrorMeters + projectionError;

      return [
        {
          pattern,
          stopIndexes,
          score:
            directionPenalty * 1_000_000_000_000 +
            skippedStops * 100_000_000 +
            geographicErrorMeters,
          directionPenalty,
          skippedStops,
          geographicErrorMeters,
        },
      ];
    });
  });

  return matches.sort(
    (left, right) =>
      left.directionPenalty - right.directionPenalty ||
      left.skippedStops - right.skippedStops ||
      left.geographicErrorMeters - right.geographicErrorMeters ||
      left.pattern.id.localeCompare(right.pattern.id) ||
      left.stopIndexes.join(",").localeCompare(right.stopIndexes.join(",")),
  )[0];
}

function findIncreasingSubsequence(
  sequence: string[],
  targets: string[],
): number[] | undefined {
  if (targets.length === 0) return undefined;
  let states = sequence.flatMap((stopId, index) =>
    stopId === targets[0] ? [{ indexes: [index], skipped: 0 }] : [],
  );

  for (const target of targets.slice(1)) {
    const nextByIndex = new Map<number, { indexes: number[]; skipped: number }>();
    for (const state of states) {
      const previousIndex = state.indexes[state.indexes.length - 1];
      for (let index = previousIndex + 1; index < sequence.length; index += 1) {
        if (sequence[index] !== target) continue;
        const candidate = {
          indexes: [...state.indexes, index],
          skipped: state.skipped + index - previousIndex - 1,
        };
        const existing = nextByIndex.get(index);
        if (
          !existing ||
          candidate.skipped < existing.skipped ||
          (candidate.skipped === existing.skipped &&
            candidate.indexes[0] > existing.indexes[0])
        ) {
          nextByIndex.set(index, candidate);
        }
      }
    }
    states = [...nextByIndex.values()];
    if (states.length === 0) return undefined;
  }

  return states.sort(
    (left, right) =>
      left.skipped - right.skipped ||
      left.indexes[left.indexes.length - 1] -
        left.indexes[0] -
        (right.indexes[right.indexes.length - 1] - right.indexes[0]) ||
      left.indexes.join(",").localeCompare(right.indexes.join(",")),
  )[0]?.indexes;
}

function findDecreasingSubsequence(
  sequence: string[],
  targets: string[],
): number[] | undefined {
  const reversed = findIncreasingSubsequence([...sequence].reverse(), targets);
  return reversed?.map((index) => sequence.length - 1 - index);
}

function slicePatternShape(
  pattern: CompiledGtfsPattern,
  fromStopIndex: number,
  toStopIndex: number,
): LineGeometryCoordinate[] {
  if (fromStopIndex === toStopIndex) return [];
  if (fromStopIndex > toStopIndex) {
    return slicePatternShape(pattern, toStopIndex, fromStopIndex).reverse();
  }

  const from = pattern.projections[fromStopIndex];
  const to = pattern.projections[toStopIndex];
  if (!from || !to || to.distanceAlongMeters < from.distanceAlongMeters) {
    return [];
  }

  const coordinates = [from.coordinate];
  for (
    let index = from.shapePointIndex + 1;
    index <= to.shapePointIndex;
    index += 1
  ) {
    const coordinate = pattern.shape[index];
    if (coordinate) coordinates.push(coordinate);
  }
  coordinates.push(to.coordinate);
  return dedupeCoordinates(coordinates);
}

function createStopReferenceKeys(value: string): string[] {
  const normalized = createCanonicalStopReferenceKey(value);
  const tokens = value
    .toLowerCase()
    .split(/[^a-z0-9]+/gu)
    .filter(Boolean);
  const numericTail = value.match(/(\d{3,})\D*$/u)?.[1];

  return [
    normalized,
    tokens.at(-1),
    numericTail ? `number:${numericTail}` : undefined,
  ].filter(
    (key, index, keys): key is string =>
      Boolean(key) && keys.indexOf(key) === index,
  );
}

function createCanonicalStopReferenceKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

function normalizeDirection(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
}

function minimumCoordinateDistance(
  coordinate: LineGeometryCoordinate,
  candidates: LineGeometryCoordinate[],
): number {
  return candidates.reduce(
    (minimum, candidate) =>
      Math.min(minimum, distanceMeters(coordinate, candidate)),
    Number.POSITIVE_INFINITY,
  );
}

function maximumPolylineDeviationMeters(
  left: LineGeometryCoordinate[],
  right: LineGeometryCoordinate[],
): number {
  return Math.max(
    sampleCoordinates(left).reduce(
      (maximum, point) =>
        Math.max(maximum, distancePointToPolylineMeters(point, right)),
      0,
    ),
    sampleCoordinates(right).reduce(
      (maximum, point) =>
        Math.max(maximum, distancePointToPolylineMeters(point, left)),
      0,
    ),
  );
}

function sampleCoordinates(
  coordinates: LineGeometryCoordinate[],
): LineGeometryCoordinate[] {
  if (coordinates.length <= MAX_GEOMETRY_COMPARISON_SAMPLES) return coordinates;
  return Array.from(
    { length: MAX_GEOMETRY_COMPARISON_SAMPLES },
    (_, index) =>
      coordinates[
        Math.round(
          (index * (coordinates.length - 1)) /
            (MAX_GEOMETRY_COMPARISON_SAMPLES - 1),
        )
      ],
  );
}

function distancePointToPolylineMeters(
  point: LineGeometryCoordinate,
  coordinates: LineGeometryCoordinate[],
): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    minimum = Math.min(
      minimum,
      distancePointToSegmentMeters(
        point,
        coordinates[index],
        coordinates[index + 1],
      ),
    );
  }
  return minimum;
}

function distancePointToSegmentMeters(
  point: LineGeometryCoordinate,
  start: LineGeometryCoordinate,
  end: LineGeometryCoordinate,
): number {
  const latitudeRadians = (point.lat * Math.PI) / 180;
  const xScale = Math.max(0.1, Math.cos(latitudeRadians));
  const dx = (end.lon - start.lon) * xScale;
  const dy = end.lat - start.lat;
  const px = (point.lon - start.lon) * xScale;
  const py = point.lat - start.lat;
  const denominator = dx * dx + dy * dy;
  const progress = denominator
    ? Math.min(1, Math.max(0, (px * dx + py * dy) / denominator))
    : 0;
  return (
    Math.hypot(
      px - dx * progress,
      py - dy * progress,
    ) * 111_320
  );
}

function dedupeCoordinates(
  coordinates: LineGeometryCoordinate[],
): LineGeometryCoordinate[] {
  return coordinates.filter((coordinate, index) => {
    const previous = coordinates[index - 1];
    return !previous || distanceMeters(previous, coordinate) >= 0.25;
  });
}

function distanceMeters(
  left: LineGeometryCoordinate,
  right: LineGeometryCoordinate,
): number {
  const latitudeRadians = (((left.lat + right.lat) / 2) * Math.PI) / 180;
  return (
    Math.hypot(
      (right.lon - left.lon) * Math.cos(latitudeRadians),
      right.lat - left.lat,
    ) * 111_320
  );
}

function isValidCoordinate(
  coordinate: LineGeometryCoordinate,
): boolean {
  return (
    Number.isFinite(coordinate.lon) &&
    Number.isFinite(coordinate.lat) &&
    Math.abs(coordinate.lon) <= 180 &&
    Math.abs(coordinate.lat) <= 90
  );
}
