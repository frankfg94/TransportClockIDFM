import {
  convertLambert93ToWgs84,
  getCoordinatesDistanceKm,
  NetexLineCache,
  NetexSchematicNode,
} from "#transport-clock/plugin-server";
import type { TransitVehicleSegmentMetric } from "../client/transportPositions";

export const IDFM_LINE_TRACES_DATASET =
  "traces-des-lignes-de-transport-en-commun-idfm";
export const IDFM_LINE_TRACES_API_ROOT =
  `https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/${IDFM_LINE_TRACES_DATASET}/records`;

const TRACE_CACHE_TTL_MS = 8 * 60 * 60_000;
const MAX_SERVER_PROJECTION_ERROR_METERS = 1_000;
const TRACE_REQUEST_TIMEOUT_MS = 3_000;

interface LonLat {
  lon: number;
  lat: number;
}

export type IdfmLineTrace = LonLat[];

interface TraceCacheEntry {
  expiresAt: number;
  traces: IdfmLineTrace[];
}

interface TraceLoadResult {
  status: "fresh" | "stale";
  traces: IdfmLineTrace[];
}

export interface LineTraceSegmentMetricsResult {
  routeId?: string;
  status: "fresh" | "stale" | "unavailable";
  metrics: TransitVehicleSegmentMetric[];
  missing: string[];
}

export interface LoadLineTraceSegmentMetricsOptions {
  fetchImpl?: typeof fetch;
  lineCache: NetexLineCache;
  nowMs?: number;
}

const traceCache = new Map<string, TraceCacheEntry>();
const inFlightTraces = new Map<string, Promise<TraceLoadResult>>();

export function clearIdfmLineTraceCache(): void {
  traceCache.clear();
  inFlightTraces.clear();
}

export function createIdfmLineTraceUrl(routeId: string): string {
  const url = new URL(IDFM_LINE_TRACES_API_ROOT);
  url.searchParams.set("select", "route_id,route_type,shape");
  url.searchParams.set("where", `route_id=\"${routeId}\"`);
  url.searchParams.set("limit", "1");
  return url.toString();
}

export async function loadIdfmLineTraceSegmentMetrics(
  options: LoadLineTraceSegmentMetricsOptions,
): Promise<LineTraceSegmentMetricsResult> {
  const routeId = resolveIdfmRouteId(options.lineCache);
  const fallback = buildLineTraceSegmentMetrics(options.lineCache, []);

  if (!routeId) {
    return {
      status: "unavailable",
      metrics: fallback,
      missing: ["idfm_route_id"],
    };
  }

  try {
    const loaded = await loadLineTraces(
      routeId,
      options.fetchImpl ?? fetch,
      options.nowMs ?? Date.now(),
    );
    const metrics = buildLineTraceSegmentMetrics(
      options.lineCache,
      loaded.traces,
    );
    const gtfsMetricCount = metrics.filter(
      (metric) => metric.distanceSource === "gtfs_shape",
    ).length;

    return {
      routeId,
      status: loaded.status,
      metrics,
      missing:
        gtfsMetricCount > 0
          ? []
          : ["projectable_gtfs_shape_segments"],
    };
  } catch (error) {
    return {
      routeId,
      status: "unavailable",
      metrics: fallback,
      missing: [
        "idfm_line_trace",
        ...(fallback.length > 0 ? [] : ["station_coordinates"]),
        error instanceof Error ? error.message : String(error),
      ],
    };
  }
}

async function loadLineTraces(
  routeId: string,
  fetchImpl: typeof fetch,
  nowMs: number,
): Promise<TraceLoadResult> {
  const cached = traceCache.get(routeId);

  if (cached && cached.expiresAt > nowMs) {
    return { status: "fresh", traces: cached.traces };
  }

  const pending = inFlightTraces.get(routeId);
  if (pending) {
    return pending;
  }

  const request = (async (): Promise<TraceLoadResult> => {
    try {
      const response = await fetchLineTraceWithTimeout(
        fetchImpl,
        createIdfmLineTraceUrl(routeId),
      );

      if (!response.ok) {
        throw new Error(`IDFM line trace request failed (${response.status}).`);
      }

      const traces = parseIdfmLineTracePayload(await response.json());

      if (traces.length === 0) {
        throw new Error("IDFM line trace response contains no usable geometry.");
      }

      traceCache.set(routeId, {
        expiresAt: nowMs + TRACE_CACHE_TTL_MS,
        traces,
      });
      return { status: "fresh", traces };
    } catch (error) {
      if (cached?.traces.length) {
        return { status: "stale", traces: cached.traces };
      }
      throw error;
    }
  })();
  inFlightTraces.set(routeId, request);

  try {
    return await request;
  } finally {
    if (inFlightTraces.get(routeId) === request) {
      inFlightTraces.delete(routeId);
    }
  }
}

async function fetchLineTraceWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    TRACE_REQUEST_TIMEOUT_MS,
  );

  try {
    return await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function parseIdfmLineTracePayload(payload: unknown): IdfmLineTrace[] {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    return [];
  }

  return payload.results.flatMap((result) => {
    const geometry = isRecord(result) && isRecord(result.shape)
      ? result.shape.geometry
      : undefined;

    if (!isRecord(geometry) || geometry.type !== "MultiLineString") {
      return [];
    }

    return asCoordinateArray(geometry.coordinates);
  });
}

function asCoordinateArray(value: unknown): IdfmLineTrace[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((line) => {
    if (!Array.isArray(line)) {
      return [];
    }

    const points = line.flatMap((coordinate) => {
      if (
        !Array.isArray(coordinate) ||
        coordinate.length < 2 ||
        !Number.isFinite(Number(coordinate[0])) ||
        !Number.isFinite(Number(coordinate[1]))
      ) {
        return [];
      }

      return [{ lon: Number(coordinate[0]), lat: Number(coordinate[1]) }];
    });

    return points.length >= 2 ? [points] : [];
  });
}

export function buildLineTraceSegmentMetrics(
  lineCache: NetexLineCache,
  traces: IdfmLineTrace[],
): TransitVehicleSegmentMetric[] {
  const nodes = new Map(
    lineCache.schematic.nodes.map((node) => [node.id, node]),
  );
  const seen = new Set<string>();
  const metrics: TransitVehicleSegmentMetric[] = [];

  for (const segment of lineCache.schematic.segments) {
    const stationIds = segment.stationIds.length >= 2
      ? segment.stationIds
      : [segment.from, segment.to];

    for (let index = 0; index < stationIds.length - 1; index += 1) {
      const sourceStationId = stationIds[index];
      const targetStationId = stationIds[index + 1];
      const pairKey = [sourceStationId, targetStationId].sort().join("\u0000");

      if (seen.has(pairKey)) {
        continue;
      }
      seen.add(pairKey);

      const source = resolveNodeLonLat(nodes.get(sourceStationId));
      const target = resolveNodeLonLat(nodes.get(targetStationId));

      if (!source || !target) {
        continue;
      }

      const fallbackDistanceMeters = Math.round(
        getCoordinatesDistanceKm(
          source.lat,
          source.lon,
          target.lat,
          target.lon,
        ) * 1_000,
      );
      const traced = findBestTraceDistance(source, target, traces);
      const useTrace =
        traced !== undefined &&
        traced.projectionErrorMeters <= MAX_SERVER_PROJECTION_ERROR_METERS &&
        isPlausibleTraceDistance(
          traced.distanceMeters,
          fallbackDistanceMeters,
        );

      metrics.push({
        id: `${segment.id}:${index}`,
        sourceStationId,
        targetStationId,
        distanceMeters: useTrace
          ? Math.round(traced.distanceMeters)
          : fallbackDistanceMeters,
        fallbackDistanceMeters,
        distanceSource: useTrace ? "gtfs_shape" : "geodesic_fallback",
        ...(traced
          ? { projectionErrorMeters: Math.round(traced.projectionErrorMeters) }
          : {}),
      });
    }
  }

  return metrics;
}

function resolveNodeLonLat(
  node: NetexSchematicNode | undefined,
): LonLat | undefined {
  if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) {
    return undefined;
  }

  const x = node.x as number;
  const y = node.y as number;

  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    return { lon: x, lat: y };
  }

  return convertLambert93ToWgs84(x, y);
}

function findBestTraceDistance(
  source: LonLat,
  target: LonLat,
  traces: IdfmLineTrace[],
): { distanceMeters: number; projectionErrorMeters: number } | undefined {
  return traces
    .flatMap((trace) => {
      const sourceProjection = projectPointOnTrace(source, trace);
      const targetProjection = projectPointOnTrace(target, trace);

      if (!sourceProjection || !targetProjection) {
        return [];
      }

      return [{
        distanceMeters: Math.abs(
          targetProjection.alongMeters - sourceProjection.alongMeters,
        ),
        projectionErrorMeters: Math.max(
          sourceProjection.errorMeters,
          targetProjection.errorMeters,
        ),
      }];
    })
    .sort(
      (left, right) =>
        left.projectionErrorMeters - right.projectionErrorMeters ||
        left.distanceMeters - right.distanceMeters,
    )[0];
}

function projectPointOnTrace(
  point: LonLat,
  trace: IdfmLineTrace,
): { alongMeters: number; errorMeters: number } | undefined {
  let travelledMeters = 0;
  let best:
    | { alongMeters: number; errorMeters: number }
    | undefined;

  for (let index = 0; index < trace.length - 1; index += 1) {
    const start = trace[index];
    const end = trace[index + 1];
    const segmentMeters = distanceMeters(start, end);

    if (segmentMeters <= 0) {
      continue;
    }

    const projected = projectOnSegment(point, start, end);
    const candidate = {
      alongMeters: travelledMeters + projected.progress * segmentMeters,
      errorMeters: distanceMeters(point, projected.point),
    };

    if (!best || candidate.errorMeters < best.errorMeters) {
      best = candidate;
    }
    travelledMeters += segmentMeters;
  }

  return best;
}

function projectOnSegment(
  point: LonLat,
  start: LonLat,
  end: LonLat,
): { point: LonLat; progress: number } {
  const latitudeRadians = (point.lat * Math.PI) / 180;
  const xScale = Math.max(0.1, Math.cos(latitudeRadians));
  const dx = (end.lon - start.lon) * xScale;
  const dy = end.lat - start.lat;
  const px = (point.lon - start.lon) * xScale;
  const py = point.lat - start.lat;
  const denominator = dx * dx + dy * dy;
  const progress = denominator > 0
    ? Math.min(1, Math.max(0, (px * dx + py * dy) / denominator))
    : 0;

  return {
    progress,
    point: {
      lon: start.lon + (end.lon - start.lon) * progress,
      lat: start.lat + (end.lat - start.lat) * progress,
    },
  };
}

function isPlausibleTraceDistance(
  traceDistanceMeters: number,
  fallbackDistanceMeters: number,
): boolean {
  if (!Number.isFinite(traceDistanceMeters) || traceDistanceMeters <= 0) {
    return false;
  }

  if (fallbackDistanceMeters <= 0) {
    return traceDistanceMeters <= 10_000;
  }

  return (
    traceDistanceMeters >= fallbackDistanceMeters * 0.7 &&
    traceDistanceMeters <= Math.max(
      fallbackDistanceMeters * 8,
      fallbackDistanceMeters + 4_000,
    )
  );
}

function distanceMeters(left: LonLat, right: LonLat): number {
  return (
    getCoordinatesDistanceKm(left.lat, left.lon, right.lat, right.lon) * 1_000
  );
}

function resolveIdfmRouteId(lineCache: NetexLineCache): string | undefined {
  const value =
    lineCache.line.primLineId ??
    lineCache.schematic.line.primLineId ??
    lineCache.line.id ??
    lineCache.schematic.line.id;
  const code = value?.match(/(?:line:)?IDFM:(C\d{5})/iu)?.[1]
    ?? value?.match(/(?:Line::)?(C\d{5})/iu)?.[1]
    ?? lineCache.line.code?.match(/C\d{5}/iu)?.[0];
  return code ? `IDFM:${code.toUpperCase()}` : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
