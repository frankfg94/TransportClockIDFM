import type { H3Event } from "h3";
import {
  createDirectLineGeometry,
  createDirectLineGeometryProvider,
  createUndirectedEdgeKey,
  measureLineGeometryContinuity,
  resolveLineGeometryWithProviders,
  type LineGeometry,
  type LineGeometryCoordinate,
  type LineGeometryProvider,
  type LineGeometryRequest,
  type LineGeometryResolution,
} from "../../../src/features/line-map/lineGeometry";
import { getServerIdfmApiKey } from "../idfm/resolveStopArea";
import {
  getGtfsManifest,
  isGtfsEnabled,
  loadCompiledGtfsLineArtifact,
  loadGtfsLineArtifact,
  loadGtfsLineArtifactsByLabel,
} from "../gtfs/runtime";
import type { GtfsLineArtifact } from "../gtfs/types";
import { normalizeGtfsLineLabel } from "../gtfs/labels";
import {
  createCompleteSegmentsFromTraces,
  createSegmentsFromTraces,
} from "./traceProjection";
import { matchGtfsEntrancesToRequestStops } from "./entranceMatching";
import { createSegmentsFromIndexedGtfs } from "./gtfsIndexedGeometry";

const IDFM_LINE_TRACES_ROOT =
  "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/traces-des-lignes-de-transport-en-commun-idfm/records";
const IDFM_RAIL_TRACES_ROOT =
  "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/traces-du-reseau-ferre-idf/records";
const PROVIDER_TIMEOUT_MS = 4_500;
const PUBLIC_TRACE_CACHE_TTL_MS = 7 * 24 * 60 * 60_000;
const NAVITIA_CACHE_TTL_MS = 30 * 24 * 60 * 60_000;
const NAVITIA_BREAKER_FAILURES = 3;
const NAVITIA_BREAKER_DURATION_MS = 5 * 60_000;
const GTFS_GEOMETRY_CACHE_ENTRIES = 128;
const GTFS_GEOMETRY_ALGORITHM_VERSION = 9;
const GTFS_SIBLING_RELEVANCE_METERS = 2_000;

interface CachedTraces {
  expiresAt: number;
  traces: LineGeometryCoordinate[][];
}

interface CloudflareKvLike {
  get<T>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface LineGeometryCloudflareEnv {
  LINE_GEOMETRY_CACHE_KV?: CloudflareKvLike;
}
const traceCache = new Map<string, CachedTraces>();
const navitiaCache = new Map<string, CachedTraces>();
const gtfsGeometryCache = new Map<string, LineGeometry>();
let navitiaFailureCount = 0;
let navitiaCircuitOpenUntil = 0;

export async function resolveLineGeometry(
  event: H3Event,
  request: LineGeometryRequest,
): Promise<LineGeometryResolution> {
  const providers = createDefaultLineGeometryProviders(event);
  const resolution = await resolveLineGeometryWithProviders(request, providers);

  if (request.useGtfs !== false && resolution.source !== "gtfs") {
    const artifact = await loadGtfsLineArtifact(event, request.lineId).catch(
      (): undefined => undefined,
    );
    if (artifact?.entrances.length) {
      resolution.entrances = matchGtfsEntrancesToRequestStops(
        artifact.entrances,
        artifact.patterns,
        request.stops,
      );
    }
  }

  resolution.attempts
    .filter((attempt) => attempt.status === "error")
    .forEach((attempt) => {
      console.warn(
        `[line-geometry] provider=${attempt.source} failed reason=${attempt.reason ?? "unknown"}`,
      );
    });

  const continuity = measureLineGeometryContinuity(resolution.segments);
  console.info(
    `[line-geometry] line=${request.lineId} source=${resolution.source} points=${continuity.pointCount} ` +
      `maxStep=${continuity.maxCoordinateStepMeters.toFixed(1)}m ` +
      `maxJoinGap=${continuity.maxSharedStopGapMeters.toFixed(1)}m attempts=${resolution.attempts
        .map((attempt) => `${attempt.source}:${attempt.status}`)
        .join(",")}`,
  );
  return resolution;
}

export function createDefaultLineGeometryProviders(event: H3Event): LineGeometryProvider[] {
  return [
    createGtfsProvider(event),
    createIdfmLineTracesProvider(event),
    createPrimNavitiaProvider(event),
    createDirectLineGeometryProvider(),
  ];
}

function createGtfsProvider(event: H3Event): LineGeometryProvider {
  return {
    source: "gtfs",
    enabled: (request) => request.useGtfs !== false && isGtfsEnabled(event),
    resolve: async (request) => {
      const [manifest, artifact, compiled, labelArtifacts] = await Promise.all([
        getGtfsManifest(event),
        loadGtfsLineArtifact(event, request.lineId),
        loadCompiledGtfsLineArtifact(event, request.lineId),
        request.lineLabel
          ? loadGtfsLineArtifactsByLabel(event, request.lineLabel)
          : Promise.resolve([]),
      ]);
      if (!manifest || !artifact || !compiled) {
        return { status: "unavailable", reason: "not_installed" };
      }

      const artifacts = dedupeGtfsArtifacts([artifact, ...labelArtifacts]).filter(
        (candidate) =>
          candidate.lineId === artifact.lineId ||
          (isGtfsArtifactCompatibleWithRequestedLine(candidate, artifact) &&
            isGtfsArtifactRelevantToRequest(candidate, request)),
      );
      const cacheKey = createGtfsGeometryCacheKey(manifest, request);
      const cached = readGtfsGeometryCache(cacheKey);
      if (cached) return { status: "success", geometry: cached };

      const segments = createSegmentsFromIndexedGtfs(request, compiled);
      const entrances = matchGtfsEntrancesToRequestStops(
        artifacts.flatMap((candidate) => candidate.entrances),
        artifacts.flatMap((candidate) => candidate.patterns),
        request.stops,
      );
      const traces = artifacts.flatMap((candidate) =>
        Object.values(candidate.shapes),
      );
      let geometry: LineGeometry | undefined;
      if (segments) {
        geometry = {
            schemaVersion: 1,
            source: "gtfs",
            topology: "requested",
            datasetVersion: manifest.datasetVersion,
            generatedAt: new Date().toISOString(),
            stops: request.stops,
            branches: request.branches,
            segments,
            entrances,
          };
      } else {
        geometry = createGeometryFromTraces("gtfs", request, traces, {
          datasetVersion: manifest.datasetVersion,
          entrances,
        });
        if (!geometry) {
          const railTraces = await loadIdfmRailTraces(
            event,
            normalizeIdfmRouteId(request.lineId),
          ).catch((): LineGeometryCoordinate[][] => []);
          geometry = createPartiallyResolvedGtfsGeometry(
            request,
            compiled,
            traces,
            railTraces,
            manifest.datasetVersion,
            entrances,
          );
        }
      }
      if (!geometry) return { status: "miss", reason: "shape_projection_failed" };
      writeGtfsGeometryCache(cacheKey, geometry);

      return {
        status: "success",
        geometry,
      };
    },
  };
}

/**
 * Current GTFS exports can omit suspended parts of a regular line while still
 * publishing their replacement bus under the same commercial label. Keep every
 * exact regular-line segment that can be resolved, then fill only genuinely
 * absent edges from IDFM's physical rail reference. A station chord remains the
 * last resort when neither official geometry source contains that edge.
 */
function createPartiallyResolvedGtfsGeometry(
  request: LineGeometryRequest,
  compiled: Parameters<typeof createSegmentsFromIndexedGtfs>[1],
  traces: LineGeometryCoordinate[][],
  railTraces: LineGeometryCoordinate[][],
  datasetVersion: string,
  entrances: LineGeometry["entrances"],
): LineGeometry | undefined {
  const gtfsSegments = new Map<string, LineGeometry["segments"][number]>();

  for (const branch of request.branches) {
    for (let index = 0; index < branch.stopIds.length - 1; index += 1) {
      const fromStopId = branch.stopIds[index];
      const toStopId = branch.stopIds[index + 1];
      const edgeKey = createUndirectedEdgeKey(fromStopId, toStopId);
      if (gtfsSegments.has(edgeKey)) continue;

      const edgeRequest: LineGeometryRequest = {
        ...request,
        branches: [
          {
            id: edgeKey,
            direction: branch.direction,
            stopIds: [fromStopId, toStopId],
          },
        ],
      };
      const gtfsSegment =
        createSegmentsFromIndexedGtfs(edgeRequest, compiled)?.[0] ??
        createSegmentsFromTraces(edgeRequest, traces)?.[0];
      const segment =
        gtfsSegment ??
        createSegmentsFromTraces(edgeRequest, railTraces)?.[0];
      if (segment) gtfsSegments.set(edgeKey, segment);
    }
  }

  if (gtfsSegments.size === 0) return undefined;

  const segments = createDirectLineGeometry(request).segments.map(
    (segment) =>
      gtfsSegments.get(
        createUndirectedEdgeKey(segment.fromStopId, segment.toStopId),
      ) ?? segment,
  );

  return {
    schemaVersion: 1,
    source: "gtfs",
    topology: "requested",
    datasetVersion,
    generatedAt: new Date().toISOString(),
    stops: request.stops,
    branches: request.branches,
    segments,
    entrances,
  };
}

function createGtfsGeometryCacheKey(
  manifest: { sha256: string; cacheGeneration: number },
  request: LineGeometryRequest,
): string {
  return JSON.stringify([
    GTFS_GEOMETRY_ALGORITHM_VERSION,
    manifest.sha256,
    manifest.cacheGeneration,
    request.lineId,
    request.lineLabel ?? "",
    request.stops.map(({ id, lon, lat }) => [
      id,
      Number(lon.toFixed(7)),
      Number(lat.toFixed(7)),
    ]),
    request.branches.map(({ id, direction, stopIds }) => [
      id,
      direction ?? "",
      stopIds,
    ]),
  ]);
}

function dedupeGtfsArtifacts(artifacts: GtfsLineArtifact[]): GtfsLineArtifact[] {
  return [...new Map(artifacts.map((artifact) => [artifact.lineId, artifact])).values()];
}

function isGtfsArtifactCompatibleWithRequestedLine(
  candidate: GtfsLineArtifact,
  requested: GtfsLineArtifact,
): boolean {
  if (
    !isReplacementGtfsArtifact(requested) &&
    isReplacementGtfsArtifact(candidate)
  ) {
    return false;
  }

  if (requested.routeTypes.length === 0 || candidate.routeTypes.length === 0) {
    return true;
  }

  const requestedRouteTypes = new Set(requested.routeTypes);
  return candidate.routeTypes.some((routeType) =>
    requestedRouteTypes.has(routeType),
  );
}

function isReplacementGtfsArtifact(artifact: GtfsLineArtifact): boolean {
  return artifact.labels.some((label) =>
    normalizeGtfsLineLabel(label).split(" ").includes("remplacement"),
  );
}

function isGtfsArtifactRelevantToRequest(
  artifact: GtfsLineArtifact,
  request: LineGeometryRequest,
): boolean {
  return Object.values(artifact.shapes).some((shape) =>
    shape.some((coordinate) =>
      request.stops.some(
        (stop) =>
          coordinateDistanceMeters(coordinate, stop) <=
          GTFS_SIBLING_RELEVANCE_METERS,
      ),
    ),
  );
}

function coordinateDistanceMeters(
  left: LineGeometryCoordinate,
  right: LineGeometryCoordinate,
): number {
  const averageLatRadians = ((left.lat + right.lat) * Math.PI) / 360;
  const dx = (left.lon - right.lon) * 111_320 * Math.cos(averageLatRadians);
  const dy = (left.lat - right.lat) * 110_540;
  return Math.hypot(dx, dy);
}

function readGtfsGeometryCache(key: string): LineGeometry | undefined {
  const cached = gtfsGeometryCache.get(key);
  if (!cached) return undefined;
  gtfsGeometryCache.delete(key);
  gtfsGeometryCache.set(key, cached);
  return cached;
}

function writeGtfsGeometryCache(key: string, geometry: LineGeometry): void {
  gtfsGeometryCache.set(key, geometry);
  while (gtfsGeometryCache.size > GTFS_GEOMETRY_CACHE_ENTRIES) {
    const oldestKey = gtfsGeometryCache.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    gtfsGeometryCache.delete(oldestKey);
  }
}

function createIdfmLineTracesProvider(event: H3Event): LineGeometryProvider {
  return {
    source: "idfm-line-traces",
    resolve: async (request) => {
      const routeId = normalizeIdfmRouteId(request.lineId);
      const traces = await loadIdfmLineTraces(event, routeId);
      if (traces.length === 0) return { status: "miss", reason: "no_public_trace" };
      const geometry = createGeometryFromTraces("idfm-line-traces", request, traces);
      if (!geometry) return { status: "miss", reason: "trace_projection_failed" };

      return {
        status: "success",
        geometry,
      };
    },
  };
}

function createPrimNavitiaProvider(event: H3Event): LineGeometryProvider {
  return {
    source: "prim-navitia",
    resolve: async (request) => {
      const apiKey = getServerIdfmApiKey(event);
      if (!apiKey) return { status: "unavailable", reason: "api_key_missing" };

      const lineId = normalizeNavitiaLineId(request.lineId);
      const traces = await loadNavitiaLineTraces(event, lineId, apiKey);
      if (traces.length === 0) return { status: "miss", reason: "no_geojson" };
      const geometry = createGeometryFromTraces("prim-navitia", request, traces);
      if (!geometry) return { status: "miss", reason: "geojson_projection_failed" };

      return {
        status: "success",
        geometry,
      };
    },
  };
}

function createGeometryFromTraces(
  source: Exclude<LineGeometry["source"], "direct">,
  request: LineGeometryRequest,
  traces: LineGeometryCoordinate[][],
  options: {
    datasetVersion?: string;
    entrances?: LineGeometry["entrances"];
  } = {},
): LineGeometry | undefined {
  const projectedSegments = createSegmentsFromTraces(request, traces);
  const completeSegments =
    projectedSegments ?? createCompleteSegmentsFromTraces(request, traces);
  if (!completeSegments) return undefined;

  return {
    schemaVersion: 1,
    source,
    topology: "requested",
    datasetVersion: options.datasetVersion,
    generatedAt: new Date().toISOString(),
    stops: request.stops,
    branches: request.branches,
    segments: completeSegments,
    entrances: options.entrances ?? [],
  };
}

async function loadIdfmLineTraces(
  event: H3Event,
  routeId: string,
): Promise<LineGeometryCoordinate[][]> {
  const cacheKey = await createPersistentTraceCacheKey(event, "idfm", routeId);
  const cached = await readPersistentTraceCache(event, traceCache, cacheKey);
  if (cached) return cached;

  const url = new URL(IDFM_LINE_TRACES_ROOT);
  url.searchParams.set("select", "route_id,shape");
  url.searchParams.set("where", `route_id=\"${routeId}\"`);
  url.searchParams.set("limit", "20");
  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`IDFM line traces HTTP ${response.status}`);
  const traces = extractGeoJsonTraces(await response.json());
  await writePersistentTraceCache(event, traceCache, cacheKey, traces, PUBLIC_TRACE_CACHE_TTL_MS);
  return traces;
}

async function loadIdfmRailTraces(
  event: H3Event,
  routeId: string,
): Promise<LineGeometryCoordinate[][]> {
  const commercialLineRef = routeId.replace(/^IDFM:/iu, "");
  const cacheKey = await createPersistentTraceCacheKey(
    event,
    "idfm-rail",
    commercialLineRef,
  );
  const cached = await readPersistentTraceCache(event, traceCache, cacheKey);
  if (cached) return cached;

  const url = new URL(IDFM_RAIL_TRACES_ROOT);
  url.searchParams.set("select", "idrefligc,geo_shape");
  url.searchParams.set("where", `idrefligc="${commercialLineRef}"`);
  url.searchParams.set("limit", "100");
  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`IDFM rail traces HTTP ${response.status}`);
  const traces = extractGeoJsonTraces(await response.json());
  await writePersistentTraceCache(
    event,
    traceCache,
    cacheKey,
    traces,
    PUBLIC_TRACE_CACHE_TTL_MS,
  );
  return traces;
}

async function loadNavitiaLineTraces(
  event: H3Event,
  lineId: string,
  apiKey: string,
): Promise<LineGeometryCoordinate[][]> {
  const cacheKey = await createPersistentTraceCacheKey(event, "navitia", lineId);
  const cached = await readPersistentTraceCache(event, navitiaCache, cacheKey);
  if (cached) return cached;
  if (navitiaCircuitOpenUntil > Date.now()) {
    throw new Error("PRIM Navitia geometry circuit is temporarily open.");
  }

  const url = `https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/lines/${encodeURIComponent(lineId)}?disable_disruption=true`;
  const response = await fetchWithTimeout(url, {
    headers: { Accept: "application/json", apikey: apiKey },
  });
  if (!response.ok) {
    navitiaFailureCount += 1;
    if (navitiaFailureCount >= NAVITIA_BREAKER_FAILURES) {
      navitiaCircuitOpenUntil = Date.now() + NAVITIA_BREAKER_DURATION_MS;
    }
    throw new Error(`PRIM Navitia geometry HTTP ${response.status}`);
  }
  const traces = extractGeoJsonTraces(await response.json());
  navitiaFailureCount = 0;
  navitiaCircuitOpenUntil = 0;
  await writePersistentTraceCache(event, navitiaCache, cacheKey, traces, NAVITIA_CACHE_TTL_MS);
  return traces;
}

async function createPersistentTraceCacheKey(
  event: H3Event,
  provider: "idfm" | "idfm-rail" | "navitia",
  lineId: string,
): Promise<string> {
  const generation = (await getGtfsManifest(event).catch(() => undefined))?.cacheGeneration ?? 0;
  return `${provider}:${generation}:${encodeURIComponent(lineId)}`;
}

async function readPersistentTraceCache(
  event: H3Event,
  memory: Map<string, CachedTraces>,
  key: string,
): Promise<LineGeometryCoordinate[][] | undefined> {
  const cached = memory.get(key);
  if (cached?.expiresAt && cached.expiresAt > Date.now()) return cached.traces;

  const cloudflareKv = getLineGeometryCloudflareKv(event);
  if (cloudflareKv) {
    try {
      const stored = await cloudflareKv.get<CachedTraces>(`line-geometry:${key}`, "json");
      if (isFreshTraceCache(stored)) {
        memory.set(key, stored);
        return stored.traces;
      }
    } catch {
      // Fall through to the configured Nitro storage driver.
    }
  }
  try {
    const stored = await useStorage("lineGeometry").getItem<CachedTraces>(key);
    if (stored?.expiresAt && stored.expiresAt > Date.now() && Array.isArray(stored.traces)) {
      memory.set(key, stored);
      return stored.traces;
    }
  } catch {
    // A persistent driver is optional; the in-memory cache remains available.
  }
  return undefined;
}

async function writePersistentTraceCache(
  event: H3Event,
  memory: Map<string, CachedTraces>,
  key: string,
  traces: LineGeometryCoordinate[][],
  ttlMs: number,
): Promise<void> {
  const value: CachedTraces = { expiresAt: Date.now() + ttlMs, traces };
  memory.set(key, value);
  const cloudflareKv = getLineGeometryCloudflareKv(event);
  if (cloudflareKv) {
    try {
      await cloudflareKv.put(`line-geometry:${key}`, JSON.stringify(value), {
        expirationTtl: Math.ceil(ttlMs / 1000),
      });
      return;
    } catch {
      // Fall through to the configured Nitro storage driver.
    }
  }
  try {
    await useStorage("lineGeometry").setItem(key, value);
  } catch {
    // Keep serving the successful response from memory if persistence is unavailable.
  }
}

function isFreshTraceCache(value: CachedTraces | null | undefined): value is CachedTraces {
  return Boolean(value?.expiresAt && value.expiresAt > Date.now() && Array.isArray(value.traces));
}

function getLineGeometryCloudflareKv(event: H3Event): CloudflareKvLike | undefined {
  return (
    event.context as {
      cloudflare?: { env?: LineGeometryCloudflareEnv };
    }
  ).cloudflare?.env?.LINE_GEOMETRY_CACHE_KV;
}
export function extractGeoJsonTraces(payload: unknown): LineGeometryCoordinate[][] {
  const traces: LineGeometryCoordinate[][] = [];

  visit(payload);
  return traces;

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      if (isCoordinateLine(value)) {
        const line = value.map(([lon, lat]) => ({ lon: Number(lon), lat: Number(lat) }));
        if (line.length >= 2) traces.push(line);
        return;
      }
      value.forEach(visit);
      return;
    }

    if (!value || typeof value !== "object") return;
    Object.values(value as Record<string, unknown>).forEach(visit);
  }
}

function isCoordinateLine(value: unknown[]): value is Array<[number, number]> {
  return (
    value.length >= 2 &&
    value.every(
      (coordinate) =>
        Array.isArray(coordinate) &&
        coordinate.length >= 2 &&
        Number.isFinite(Number(coordinate[0])) &&
        Number.isFinite(Number(coordinate[1])) &&
        Math.abs(Number(coordinate[0])) <= 180 &&
        Math.abs(Number(coordinate[1])) <= 90,
    )
  );
}

function normalizeNavitiaLineId(value: string): string {
  return value.startsWith("line:") ? value : `line:${value}`;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeIdfmRouteId(value: string): string {
  return value.replace(/^line:/iu, "");
}
