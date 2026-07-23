export type LineGeometrySource = "gtfs" | "idfm-line-traces" | "prim-navitia" | "direct";
export type LineGeometryTopology = "requested" | "provider";

export type LineGeometryAttemptStatus =
  "success" | "disabled" | "miss" | "invalid" | "unavailable" | "error";

export interface LineGeometryCoordinate {
  lon: number;
  lat: number;
}

export interface LineGeometryStopRequest extends LineGeometryCoordinate {
  id: string;
  label?: string;
}

export interface LineGeometryBranchRequest {
  id: string;
  direction?: string;
  stopIds: string[];
}

export interface LineGeometryRequest {
  lineId: string;
  lineLabel?: string;
  useGtfs?: boolean;
  stops: LineGeometryStopRequest[];
  branches: LineGeometryBranchRequest[];
}

export interface LineGeometrySegment {
  id: string;
  fromStopId: string;
  toStopId: string;
  coordinates: LineGeometryCoordinate[];
}

export interface LineGeometryEntrance extends LineGeometryCoordinate {
  id: string;
  parentStopId: string;
  name: string;
  code?: string;
}

export interface LineGeometry {
  schemaVersion: 1;
  source: LineGeometrySource;
  topology?: LineGeometryTopology;
  datasetVersion?: string;
  generatedAt: string;
  stops: LineGeometryStopRequest[];
  branches: LineGeometryBranchRequest[];
  segments: LineGeometrySegment[];
  entrances: LineGeometryEntrance[];
}

export interface LineGeometryAttempt {
  source: LineGeometrySource;
  status: LineGeometryAttemptStatus;
  reason?: string;
}

export interface LineGeometryResolution extends LineGeometry {
  attempts: LineGeometryAttempt[];
}

export type LineGeometryProviderResult =
  | { status: "success"; geometry: LineGeometry }
  | {
      status: Exclude<LineGeometryAttemptStatus, "success" | "error">;
      reason?: string;
    };

export interface LineGeometryProvider {
  source: LineGeometrySource;
  enabled?: (request: LineGeometryRequest) => boolean;
  resolve: (request: LineGeometryRequest) => Promise<LineGeometryProviderResult>;
}

export interface LineGeometryPoint {
  x: number;
  y: number;
}

export interface LineGeometryCornerDecision {
  index: number;
  mode: "rounded" | "straight";
  at: LineGeometryPoint;
  before?: LineGeometryPoint;
  after?: LineGeometryPoint;
  radius: number;
  reason?: "too-close" | "collinear";
}

export interface LineGeometryRenderSegment {
  id: string;
  fromStopId: string;
  toStopId: string;
  points: LineGeometryPoint[];
  path: string;
  corners: LineGeometryCornerDecision[];
}

export interface LineGeometryRenderPlan {
  source: LineGeometrySource;
  topology: LineGeometryTopology;
  datasetVersion?: string;
  attempts: LineGeometryAttempt[];
  stops: LineGeometryStopRequest[];
  branches: LineGeometryBranchRequest[];
  segments: LineGeometryRenderSegment[];
  entrances: LineGeometryEntrance[];
}

export interface AlignedLineGeometryRenderPlan {
  segments: LineGeometryRenderSegment[];
  stopPoints: Map<string, LineGeometryPoint>;
}

export interface RoundedPolylineOptions {
  minimumPointDistance?: number;
  minimumCornerSegmentLength?: number;
  maximumCornerRadius?: number;
  cornerRadiusRatio?: number;
}

export interface LineGeometryAlignmentOptions extends RoundedPolylineOptions {
  maximumEndpointSnapDistance?: number;
}

export interface LineGeometryContinuityReport {
  segmentCount: number;
  pointCount: number;
  sharedStopCount: number;
  maxSharedStopGapMeters: number;
  maxCoordinateStepMeters: number;
  disconnectedStops: Array<{ stopId: string; gapMeters: number }>;
}

const DEFAULT_ROUNDED_POLYLINE_OPTIONS: Required<RoundedPolylineOptions> = {
  minimumPointDistance: 0.7,
  minimumCornerSegmentLength: 2.5,
  maximumCornerRadius: 7,
  cornerRadiusRatio: 0.22,
};

/**
 * Sequential provider resolver. A provider either supplies every requested edge
 * or the next provider is tried; geometries are never merged.
 */
export async function resolveLineGeometryWithProviders(
  request: LineGeometryRequest,
  providers: LineGeometryProvider[],
): Promise<LineGeometryResolution> {
  const attempts: LineGeometryAttempt[] = [];

  for (const provider of providers) {
    if (provider.enabled && !provider.enabled(request)) {
      attempts.push({ source: provider.source, status: "disabled" });
      continue;
    }

    try {
      const result = await provider.resolve(request);

      if (result.status !== "success") {
        attempts.push({
          source: provider.source,
          status: result.status,
          ...(result.reason ? { reason: result.reason } : {}),
        });
        continue;
      }

      const validationError = validateLineGeometry(request, result.geometry);

      if (validationError) {
        attempts.push({
          source: provider.source,
          status: "invalid",
          reason: validationError,
        });
        continue;
      }

      attempts.push({ source: provider.source, status: "success" });
      return { ...result.geometry, attempts };
    } catch (error) {
      attempts.push({
        source: provider.source,
        status: "error",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new Error(`No line geometry provider succeeded for ${request.lineId}.`);
}

export function createDirectLineGeometry(
  request: LineGeometryRequest,
  now = new Date(),
): LineGeometry {
  const stops = new Map(request.stops.map((stop) => [stop.id, stop]));
  const seen = new Set<string>();
  const segments: LineGeometrySegment[] = [];

  for (const branch of request.branches) {
    for (let index = 0; index < branch.stopIds.length - 1; index += 1) {
      const fromStopId = branch.stopIds[index];
      const toStopId = branch.stopIds[index + 1];
      const pairKey = createUndirectedEdgeKey(fromStopId, toStopId);

      if (seen.has(pairKey)) continue;

      const from = stops.get(fromStopId);
      const to = stops.get(toStopId);

      if (!from || !to) continue;

      seen.add(pairKey);
      segments.push({
        id: pairKey,
        fromStopId,
        toStopId,
        coordinates: [
          { lon: from.lon, lat: from.lat },
          { lon: to.lon, lat: to.lat },
        ],
      });
    }
  }

  return {
    schemaVersion: 1,
    source: "direct",
    generatedAt: now.toISOString(),
    stops: request.stops,
    branches: request.branches,
    segments,
    entrances: [],
  };
}

export function createDirectLineGeometryProvider(): LineGeometryProvider {
  return {
    source: "direct",
    resolve: async (request) => ({
      status: "success",
      geometry: createDirectLineGeometry(request),
    }),
  };
}

export function validateLineGeometry(
  request: LineGeometryRequest,
  geometry: LineGeometry,
): string | undefined {
  if (geometry.schemaVersion !== 1) return "unsupported_schema";
  if (geometry.segments.length === 0) return "empty_geometry";

  const requestedEdges = collectBranchEdges(
    geometry.topology === "provider" ? geometry.branches : request.branches,
  );
  const suppliedEdges = new Set(
    geometry.segments.map((segment) =>
      createUndirectedEdgeKey(segment.fromStopId, segment.toStopId),
    ),
  );

  for (const edge of requestedEdges) {
    if (!suppliedEdges.has(edge)) return `missing_edge:${edge}`;
  }

  for (const segment of geometry.segments) {
    if (segment.coordinates.length < 2) return `short_segment:${segment.id}`;
    if (!segment.coordinates.every(isValidCoordinate)) {
      return `invalid_coordinate:${segment.id}`;
    }
  }

  return undefined;
}

export function buildLineGeometryRenderPlan(
  resolution: LineGeometryResolution,
  project: (coordinate: LineGeometryCoordinate) => LineGeometryPoint,
  options: RoundedPolylineOptions = {},
): LineGeometryRenderPlan {
  return {
    source: resolution.source,
    topology: resolution.topology ?? "requested",
    datasetVersion: resolution.datasetVersion,
    attempts: resolution.attempts,
    stops: resolution.stops,
    branches: resolution.branches,
    entrances: resolution.entrances,
    segments: resolution.segments.map((segment) => {
      const points = dedupeLineGeometryPoints(
        segment.coordinates.map(project),
        options.minimumPointDistance,
      );
      const rounded = buildRoundedPolylinePath(points, options);

      return {
        id: segment.id,
        fromStopId: segment.fromStopId,
        toStopId: segment.toStopId,
        points,
        path: rounded.path,
        corners: rounded.corners,
      };
    }),
  };
}

/**
 * Uses trace endpoints as visual station anchors, then reconnects every
 * adjacent segment to the same point. Geographic station data stays intact.
 */
export function alignLineGeometrySegmentEndpoints(
  segments: LineGeometryRenderSegment[],
  referencePoints: Map<string, LineGeometryPoint>,
  options: LineGeometryAlignmentOptions = {},
): AlignedLineGeometryRenderPlan {
  const candidates = new Map<string, LineGeometryPoint[]>();

  for (const segment of segments) {
    const first = segment.points[0];
    const last = segment.points.at(-1);
    if (first) appendEndpointCandidate(candidates, segment.fromStopId, first);
    if (last) appendEndpointCandidate(candidates, segment.toStopId, last);
  }

  const stopPoints = new Map(
    [...candidates].map(([stopId, points]) => [
      stopId,
      chooseClosestEndpoint(points, referencePoints.get(stopId)),
    ]),
  );
  const maximumSnapDistance = options.maximumEndpointSnapDistance ?? Number.POSITIVE_INFINITY;
  const alignedSegments = segments.map((segment) => {
    const points = [...segment.points];
    const from = stopPoints.get(segment.fromStopId);
    const to = stopPoints.get(segment.toStopId);

    if (from && points.length > 0 && pointDistance(points[0], from) <= maximumSnapDistance) {
      points[0] = from;
    }
    if (
      to &&
      points.length > 1 &&
      pointDistance(points[points.length - 1], to) <= maximumSnapDistance
    ) {
      points[points.length - 1] = to;
    }

    const rounded = buildRoundedPolylinePath(points, options);
    return {
      ...segment,
      points,
      path: rounded.path,
      corners: rounded.corners,
    };
  });

  return { segments: alignedSegments, stopPoints };
}

/** Stable, JSON-safe representation used by Vitest snapshots and diagnostics. */
export function buildLineGeometryDebugPlan(
  resolution: LineGeometryResolution,
  project: (coordinate: LineGeometryCoordinate) => LineGeometryPoint = (coordinate) => ({
    x: coordinate.lon,
    y: coordinate.lat,
  }),
  options: RoundedPolylineOptions = {},
): LineGeometryRenderPlan {
  return buildLineGeometryRenderPlan(resolution, project, options);
}

export function buildRoundedPolylinePath(
  inputPoints: LineGeometryPoint[],
  options: RoundedPolylineOptions = {},
): { path: string; corners: LineGeometryCornerDecision[] } {
  const settings = { ...DEFAULT_ROUNDED_POLYLINE_OPTIONS, ...options };
  const points = dedupeLineGeometryPoints(inputPoints, settings.minimumPointDistance);

  if (points.length === 0) return { path: "", corners: [] };
  if (points.length === 1) {
    return { path: `M ${formatPoint(points[0])}`, corners: [] };
  }

  const commands = [`M ${formatPoint(points[0])}`];
  const corners: LineGeometryCornerDecision[] = [];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incomingLength = pointDistance(previous, current);
    const outgoingLength = pointDistance(current, next);
    const cross =
      (current.x - previous.x) * (next.y - current.y) -
      (current.y - previous.y) * (next.x - current.x);

    if (Math.abs(cross) < 0.0001) {
      commands.push(`L ${formatPoint(current)}`);
      corners.push({
        index,
        mode: "straight",
        at: current,
        radius: 0,
        reason: "collinear",
      });
      continue;
    }

    const shortest = Math.min(incomingLength, outgoingLength);

    if (shortest < settings.minimumCornerSegmentLength) {
      commands.push(`L ${formatPoint(current)}`);
      corners.push({
        index,
        mode: "straight",
        at: current,
        radius: 0,
        reason: "too-close",
      });
      continue;
    }

    const radius = Math.min(settings.maximumCornerRadius, shortest * settings.cornerRadiusRatio);
    const before = moveTowards(current, previous, radius);
    const after = moveTowards(current, next, radius);

    commands.push(`L ${formatPoint(before)}`, `Q ${formatPoint(current)} ${formatPoint(after)}`);
    corners.push({
      index,
      mode: "rounded",
      at: current,
      before,
      after,
      radius: roundCoordinate(radius),
    });
  }

  commands.push(`L ${formatPoint(points[points.length - 1])}`);
  return { path: commands.join(" "), corners };
}

export function createScreenSpaceRoundedPolylineOptions(
  zoom: number,
): Required<RoundedPolylineOptions> {
  const safeZoom = Math.max(0.01, zoom);

  return {
    minimumPointDistance: 0.35 / safeZoom,
    minimumCornerSegmentLength: 1.2 / safeZoom,
    maximumCornerRadius: 10 / safeZoom,
    cornerRadiusRatio: 0.3,
  };
}

/** Geographic continuity metrics intended for readable Vitest/debug JSON. */
export function measureLineGeometryContinuity(
  segments: LineGeometrySegment[],
  toleranceMeters = 5,
): LineGeometryContinuityReport {
  const endpoints = new Map<string, LineGeometryCoordinate[]>();
  let pointCount = 0;
  let maxCoordinateStepMeters = 0;

  for (const segment of segments) {
    pointCount += segment.coordinates.length;
    appendCoordinate(endpoints, segment.fromStopId, segment.coordinates[0]);
    appendCoordinate(endpoints, segment.toStopId, segment.coordinates.at(-1));

    segment.coordinates.slice(1).forEach((coordinate, index) => {
      maxCoordinateStepMeters = Math.max(
        maxCoordinateStepMeters,
        coordinateDistanceMeters(segment.coordinates[index], coordinate),
      );
    });
  }

  const sharedStops = [...endpoints].filter(([, coordinates]) => coordinates.length > 1);
  const gaps = sharedStops.map(([stopId, coordinates]) => ({
    stopId,
    gapMeters: maximumCoordinateDistance(coordinates),
  }));

  return {
    segmentCount: segments.length,
    pointCount,
    sharedStopCount: sharedStops.length,
    maxSharedStopGapMeters: Math.max(0, ...gaps.map(({ gapMeters }) => gapMeters)),
    maxCoordinateStepMeters,
    disconnectedStops: gaps
      .filter(({ gapMeters }) => gapMeters > toleranceMeters)
      .sort((left, right) => right.gapMeters - left.gapMeters),
  };
}

export function createUndirectedEdgeKey(left: string, right: string): string {
  return [left, right].sort().join("--");
}

function collectBranchEdges(branches: LineGeometryBranchRequest[]): Set<string> {
  const edges = new Set<string>();

  branches.forEach((branch) => {
    for (let index = 0; index < branch.stopIds.length - 1; index += 1) {
      edges.add(createUndirectedEdgeKey(branch.stopIds[index], branch.stopIds[index + 1]));
    }
  });

  return edges;
}

function isValidCoordinate(coordinate: LineGeometryCoordinate): boolean {
  return (
    Number.isFinite(coordinate.lon) &&
    Number.isFinite(coordinate.lat) &&
    Math.abs(coordinate.lon) <= 180 &&
    Math.abs(coordinate.lat) <= 90
  );
}

function dedupeLineGeometryPoints(
  points: LineGeometryPoint[],
  minimumDistance = DEFAULT_ROUNDED_POLYLINE_OPTIONS.minimumPointDistance,
): LineGeometryPoint[] {
  const result: LineGeometryPoint[] = [];

  for (const point of points) {
    const previous = result[result.length - 1];
    if (!previous || pointDistance(previous, point) >= minimumDistance) {
      result.push({ x: point.x, y: point.y });
    }
  }

  if (result.length === 1 && points.length > 1) {
    const last = points[points.length - 1];
    result.push({ x: last.x, y: last.y });
  }

  return result;
}

function moveTowards(
  from: LineGeometryPoint,
  to: LineGeometryPoint,
  distance: number,
): LineGeometryPoint {
  const length = pointDistance(from, to);
  const ratio = length > 0 ? Math.min(1, distance / length) : 0;

  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
  };
}

function appendCoordinate(
  coordinatesByStop: Map<string, LineGeometryCoordinate[]>,
  stopId: string,
  coordinate: LineGeometryCoordinate | undefined,
): void {
  if (!coordinate) return;
  coordinatesByStop.set(stopId, [...(coordinatesByStop.get(stopId) ?? []), coordinate]);
}

function maximumCoordinateDistance(coordinates: LineGeometryCoordinate[]): number {
  let maximum = 0;

  coordinates.forEach((left, index) => {
    coordinates.slice(index + 1).forEach((right) => {
      maximum = Math.max(maximum, coordinateDistanceMeters(left, right));
    });
  });

  return maximum;
}

function coordinateDistanceMeters(
  left: LineGeometryCoordinate,
  right: LineGeometryCoordinate,
): number {
  const latitudeRadians = (((left.lat + right.lat) / 2) * Math.PI) / 180;
  return (
    Math.hypot((right.lon - left.lon) * Math.cos(latitudeRadians), right.lat - left.lat) * 111_320
  );
}

function appendEndpointCandidate(
  candidates: Map<string, LineGeometryPoint[]>,
  stopId: string,
  point: LineGeometryPoint,
): void {
  const points = candidates.get(stopId) ?? [];
  points.push(point);
  candidates.set(stopId, points);
}

function chooseClosestEndpoint(
  points: LineGeometryPoint[],
  reference?: LineGeometryPoint,
): LineGeometryPoint {
  if (!reference || points.length === 1) return points[0];

  return [...points].sort(
    (left, right) => pointDistance(left, reference) - pointDistance(right, reference),
  )[0];
}

function pointDistance(left: LineGeometryPoint, right: LineGeometryPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function formatPoint(point: LineGeometryPoint): string {
  return `${roundCoordinate(point.x)} ${roundCoordinate(point.y)}`;
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(6));
}
