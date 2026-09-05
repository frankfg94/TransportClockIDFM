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
  /** True when the segment is fallback geometry rather than the primary provider shape. */
  fallback?: boolean;
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

export function projectPointOntoLineGeometry(
  point: LineGeometryPoint,
  polylines: LineGeometryPoint[][],
): LineGeometryPoint {
  let closest = point;
  let closestDistance = Number.POSITIVE_INFINITY;

  polylines.forEach((polyline) => {
    polyline.forEach((from, index) => {
      const to = polyline[index + 1];
      if (!to) return;

      const projected = projectPointOntoSegment(point, from, to);
      const distance = pointDistance(point, projected);
      if (distance < closestDistance) {
        closest = projected;
        closestDistance = distance;
      }
    });
  });

  return closest;
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

export type RoundedPolylineCommand =
  | { type: "moveTo"; point: LineGeometryPoint }
  | { type: "lineTo"; point: LineGeometryPoint }
  | { type: "quadraticCurveTo"; control: LineGeometryPoint; point: LineGeometryPoint };

export interface RoundedPolylinePathBuilder {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(controlX: number, controlY: number, x: number, y: number): void;
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
  /** Remove a non-anchor vertex when one of its screen-space legs is a tiny spur. */
  maximumShortSegmentLength?: number;
  maximumShortSegmentRatio?: number;
  protectedPointIndices?: readonly number[];
}

export interface RoundedPolylineScratch {
  retainedIndices: number[];
  dedupedIndices: number[];
}

type RequiredRoundedPolylineDefaults = Required<Pick<
  RoundedPolylineOptions,
  "minimumPointDistance" | "minimumCornerSegmentLength" | "maximumCornerRadius" | "cornerRadiusRatio"
>>;

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

const DEFAULT_ROUNDED_POLYLINE_OPTIONS: RequiredRoundedPolylineDefaults = {
  minimumPointDistance: 0.7,
  minimumCornerSegmentLength: 2.5,
  maximumCornerRadius: 7,
  cornerRadiusRatio: 0.22,
};
// Two GTFS shapes can project the same shared station a few metres apart.
// Permit a short final extension, but never one large enough to reshape the edge.
const SHARED_ENDPOINT_EXTENSION_MULTIPLIER = 4;

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

/**
 * Builds the same physical station-to-station requests used by the V1 line
 * map. GTFS shapes are selected and projected per physical edge so a branch
 * or timetable variant cannot make the complete line fall back as one block.
 */
export function createPhysicalEdgeBranches(
  branches: LineGeometryBranchRequest[],
): LineGeometryBranchRequest[] {
  const edges = new Map<string, LineGeometryBranchRequest>();

  branches.forEach((branch) => {
    branch.stopIds.slice(0, -1).forEach((fromStopId, index) => {
      const toStopId = branch.stopIds[index + 1];
      if (fromStopId === toStopId) return;

      const id = [fromStopId, toStopId].sort().join("--");
      if (!edges.has(id)) {
        edges.set(id, { id, stopIds: [fromStopId, toStopId] });
      }
    });
  });

  return [...edges.values()];
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
  const maximumSharedEndpointExtensionDistance =
    maximumSnapDistance * SHARED_ENDPOINT_EXTENSION_MULTIPLIER;
  const alignedSegments = segments.map((segment) => {
    const points = [...segment.points];
    const from = stopPoints.get(segment.fromStopId);
    const to = stopPoints.get(segment.toStopId);

    if (
      from &&
      points.length > 0 &&
      shouldConnectSegmentEndpoint(
        segment.fromStopId,
        points[0],
        from,
        candidates,
        maximumSnapDistance,
        maximumSharedEndpointExtensionDistance,
      )
    ) {
      points[0] = from;
    }
    if (
      to &&
      points.length > 1 &&
      shouldConnectSegmentEndpoint(
        segment.toStopId,
        points[points.length - 1],
        to,
        candidates,
        maximumSnapDistance,
        maximumSharedEndpointExtensionDistance,
      )
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

function shouldConnectSegmentEndpoint(
  stopId: string,
  endpoint: LineGeometryPoint,
  anchor: LineGeometryPoint,
  candidates: Map<string, LineGeometryPoint[]>,
  maximumSnapDistance: number,
  maximumSharedEndpointExtensionDistance: number,
): boolean {
  const gap = pointDistance(endpoint, anchor);
  if (gap <= maximumSnapDistance) return true;
  if ((candidates.get(stopId)?.length ?? 0) < 2) return false;
  return gap <= maximumSharedEndpointExtensionDistance;
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
  const rounded = createRoundedPolylineCommands(inputPoints, options);
  return {
    path: rounded.commands
      .map((command) => {
        if (command.type === "moveTo") return `M ${formatPoint(command.point)}`;
        if (command.type === "lineTo") return `L ${formatPoint(command.point)}`;
        return `Q ${formatPoint(command.control)} ${formatPoint(command.point)}`;
      })
      .join(" "),
    corners: rounded.corners,
  };
}

/**
 * Removes disproportionate micro-segments from a rendered polyline while
 * preserving station anchors. Provider traces occasionally contain a tiny
 * non-station vertex beside a real anchor; keeping that vertex turns a smooth
 * route into a visible spike at high zoom. The threshold is supplied in the
 * target coordinate space (normally CSS pixels), so the rule stays generic
 * across lines, modes, and zoom levels.
 */
export function collapseShortUnprotectedPolylineVertices(
  inputPoints: LineGeometryPoint[],
  options: Pick<
    RoundedPolylineOptions,
    "maximumShortSegmentLength" | "maximumShortSegmentRatio" | "protectedPointIndices"
  > = {},
): LineGeometryPoint[] {
  const maximumLength = options.maximumShortSegmentLength;
  if (!Number.isFinite(maximumLength) || maximumLength! <= 0 || inputPoints.length < 3) {
    return inputPoints.map((point) => ({ ...point }));
  }

  const maximumRatio = options.maximumShortSegmentRatio ?? 0.12;
  const protectedIndices = new Set(options.protectedPointIndices ?? []);
  const retained = inputPoints.map((point, originalIndex) => ({
    point: { ...point },
    originalIndex,
  }));

  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 1; index < retained.length - 1; index += 1) {
      const current = retained[index]!;
      if (protectedIndices.has(current.originalIndex)) continue;

      const previous = retained[index - 1]!.point;
      const next = retained[index + 1]!.point;
      const incomingLength = pointDistance(previous, current.point);
      const outgoingLength = pointDistance(current.point, next);
      const shortest = Math.min(incomingLength, outgoingLength);
      const longest = Math.max(incomingLength, outgoingLength);
      if (
        shortest > maximumLength! ||
        longest <= 0 ||
        shortest / longest > maximumRatio
      ) {
        continue;
      }

      retained.splice(index, 1);
      changed = true;
      break;
    }
  }

  return retained.map(({ point }) => point);
}

/**
 * Applies the exact V1 screen-space rounding to a Canvas path. Keeping the
 * command generation shared prevents SVG and Canvas from disagreeing at a
 * station corner such as Metro 12 / Concorde.
 */
export function appendRoundedPolylineToPath(
  builder: RoundedPolylinePathBuilder,
  inputPoints: LineGeometryPoint[],
  options: RoundedPolylineOptions = {},
): { corners: LineGeometryCornerDecision[] } {
  const rounded = createRoundedPolylineCommands(inputPoints, options);
  rounded.commands.forEach((command) => {
    if (command.type === "moveTo") {
      builder.moveTo(command.point.x, command.point.y);
    } else if (command.type === "lineTo") {
      builder.lineTo(command.point.x, command.point.y);
    } else {
      builder.quadraticCurveTo(
        command.control.x,
        command.control.y,
        command.point.x,
        command.point.y,
      );
    }
  });
  return { corners: rounded.corners };
}

/**
 * Emits the same Canvas commands as appendRoundedPolylineToPath without
 * allocating command/corner/point arrays. The caller owns the reusable scratch
 * buffers; this is intended for high-frequency map animation, not diagnostics.
 */
export function appendRoundedPolylineToPathDirect(
  builder: RoundedPolylinePathBuilder,
  inputPoints: LineGeometryPoint[],
  options: RoundedPolylineOptions,
  scratch: RoundedPolylineScratch,
): void {
  const retained = scratch.retainedIndices;
  const points = scratch.dedupedIndices;
  retained.length = 0;
  points.length = 0;
  for (let index = 0; index < inputPoints.length; index += 1) retained.push(index);

  const maximumLength = options.maximumShortSegmentLength;
  if (Number.isFinite(maximumLength) && maximumLength! > 0 && retained.length >= 3) {
    const maximumRatio = options.maximumShortSegmentRatio ?? 0.12;
    const protectedIndices = options.protectedPointIndices ?? [];
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = 1; index < retained.length - 1; index += 1) {
        const originalIndex = retained[index]!;
        if (protectedIndices.includes(originalIndex)) continue;
        const previous = inputPoints[retained[index - 1]!]!;
        const current = inputPoints[originalIndex]!;
        const next = inputPoints[retained[index + 1]!]!;
        const incomingLength = pointDistance(previous, current);
        const outgoingLength = pointDistance(current, next);
        const shortest = Math.min(incomingLength, outgoingLength);
        const longest = Math.max(incomingLength, outgoingLength);
        if (
          shortest > maximumLength! ||
          longest <= 0 ||
          shortest / longest > maximumRatio
        ) {
          continue;
        }
        retained.splice(index, 1);
        changed = true;
        break;
      }
    }
  }

  const minimumPointDistance =
    options.minimumPointDistance ?? DEFAULT_ROUNDED_POLYLINE_OPTIONS.minimumPointDistance;
  for (const originalIndex of retained) {
    const previousIndex = points[points.length - 1];
    if (
      previousIndex === undefined ||
      pointDistance(inputPoints[previousIndex]!, inputPoints[originalIndex]!) >= minimumPointDistance
    ) {
      points.push(originalIndex);
    }
  }
  if (points.length === 1 && retained.length > 1) points.push(retained[retained.length - 1]!);
  if (points.length === 0) return;

  const first = inputPoints[points[0]!]!;
  builder.moveTo(first.x, first.y);
  if (points.length === 1) return;

  const minimumCornerSegmentLength =
    options.minimumCornerSegmentLength ??
    DEFAULT_ROUNDED_POLYLINE_OPTIONS.minimumCornerSegmentLength;
  const maximumCornerRadius =
    options.maximumCornerRadius ?? DEFAULT_ROUNDED_POLYLINE_OPTIONS.maximumCornerRadius;
  const cornerRadiusRatio =
    options.cornerRadiusRatio ?? DEFAULT_ROUNDED_POLYLINE_OPTIONS.cornerRadiusRatio;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = inputPoints[points[index - 1]!]!;
    const current = inputPoints[points[index]!]!;
    const next = inputPoints[points[index + 1]!]!;
    const incomingLength = pointDistance(previous, current);
    const outgoingLength = pointDistance(current, next);
    const cross =
      (current.x - previous.x) * (next.y - current.y) -
      (current.y - previous.y) * (next.x - current.x);
    const shortest = Math.min(incomingLength, outgoingLength);
    if (Math.abs(cross) < 0.0001 || shortest < minimumCornerSegmentLength) {
      builder.lineTo(current.x, current.y);
      continue;
    }

    const radius = Math.min(maximumCornerRadius, shortest * cornerRadiusRatio);
    const incomingRatio = incomingLength > 0 ? Math.min(1, radius / incomingLength) : 0;
    const outgoingRatio = outgoingLength > 0 ? Math.min(1, radius / outgoingLength) : 0;
    builder.lineTo(
      current.x + (previous.x - current.x) * incomingRatio,
      current.y + (previous.y - current.y) * incomingRatio,
    );
    builder.quadraticCurveTo(
      current.x,
      current.y,
      current.x + (next.x - current.x) * outgoingRatio,
      current.y + (next.y - current.y) * outgoingRatio,
    );
  }
  const last = inputPoints[points[points.length - 1]!]!;
  builder.lineTo(last.x, last.y);
}

function createRoundedPolylineCommands(
  inputPoints: LineGeometryPoint[],
  options: RoundedPolylineOptions = {},
): { commands: RoundedPolylineCommand[]; corners: LineGeometryCornerDecision[] } {
  const settings = { ...DEFAULT_ROUNDED_POLYLINE_OPTIONS, ...options };
  const simplifiedPoints = collapseShortUnprotectedPolylineVertices(inputPoints, options);
  const points = dedupeLineGeometryPoints(simplifiedPoints, settings.minimumPointDistance);

  if (points.length === 0) return { commands: [], corners: [] };
  if (points.length === 1) {
    return { commands: [{ type: "moveTo", point: points[0] }], corners: [] };
  }

  const commands: RoundedPolylineCommand[] = [{ type: "moveTo", point: points[0] }];
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
      commands.push({ type: "lineTo", point: current });
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
      commands.push({ type: "lineTo", point: current });
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

    commands.push(
      { type: "lineTo", point: before },
      { type: "quadraticCurveTo", control: current, point: after },
    );
    corners.push({
      index,
      mode: "rounded",
      at: current,
      before,
      after,
      radius: roundCoordinate(radius),
    });
  }

  commands.push({ type: "lineTo", point: points[points.length - 1] });
  return { commands, corners };
}

export function createScreenSpaceRoundedPolylineOptions(
  zoom: number,
): RequiredRoundedPolylineDefaults {
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

function projectPointOntoSegment(
  point: LineGeometryPoint,
  from: LineGeometryPoint,
  to: LineGeometryPoint,
): LineGeometryPoint {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) return from;

  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - from.x) * deltaX + (point.y - from.y) * deltaY) / lengthSquared),
  );
  return {
    x: from.x + deltaX * ratio,
    y: from.y + deltaY * ratio,
  };
}

function formatPoint(point: LineGeometryPoint): string {
  return `${roundCoordinate(point.x)} ${roundCoordinate(point.y)}`;
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(6));
}
