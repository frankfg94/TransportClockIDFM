import type { H3Event } from "h3";
import {
  createDirectLineGeometryProvider,
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
} from "../gtfs/runtime";
import {
  createCanonicalTraceGeometry,
  createSegmentsFromTraces,
} from "./traceProjection";
import { matchGtfsEntrancesToRequestStops } from "./entranceMatching";
import { createSegmentsFromIndexedGtfs } from "./gtfsIndexedGeometry";

const IDFM_LINE_TRACES_ROOT =
  "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/traces-des-lignes-de-transport-en-commun-idfm/records";
const PROVIDER_TIMEOUT_MS = 4_500;
const PUBLIC_TRACE_CACHE_TTL_MS = 7 * 24 * 60 * 60_000;
const NAVITIA_CACHE_TTL_MS = 30 * 24 * 60 * 60_000;
const NAVITIA_BREAKER_FAILURES = 3;
const NAVITIA_BREAKER_DURATION_MS = 5 * 60_000;
const GTFS_GEOMETRY_CACHE_ENTRIES = 128;

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
      const [manifest, artifact, compiled] = await Promise.all([
        getGtfsManifest(event),
        loadGtfsLineArtifact(event, request.lineId),
        loadCompiledGtfsLineArtifact(event, request.lineId),
      ]);
      if (!manifest || !artifact || !compiled) {
        return { status: "unavailable", reason: "not_installed" };
      }

      const cacheKey = createGtfsGeometryCacheKey(manifest, request);
      const cached = readGtfsGeometryCache(cacheKey);
      if (cached) return { status: "success", geometry: cached };

      const segments = createSegmentsFromIndexedGtfs(request, compiled);
      if (!segments) return { status: "miss", reason: "shape_projection_failed" };

      const geometry: LineGeometry = {
        schemaVersion: 1,
        source: "gtfs",
        topology: "requested",
        datasetVersion: manifest.datasetVersion,
        generatedAt: new Date().toISOString(),
        stops: request.stops,
        branches: request.branches,
        segments,
        entrances: matchGtfsEntrancesToRequestStops(
          artifact.entrances,
          artifact.patterns,
          request.stops,
        ),
      };
      writeGtfsGeometryCache(cacheKey, geometry);

      return {
        status: "success",
        geometry,
      };
    },
  };
}

function createGtfsGeometryCacheKey(
  manifest: { sha256: string; cacheGeneration: number },
  request: LineGeometryRequest,
): string {
  return JSON.stringify([
    manifest.sha256,
    manifest.cacheGeneration,
    request.lineId,
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

  if (projectedSegments) {
    return {
      schemaVersion: 1,
      source,
      topology: "requested",
      datasetVersion: options.datasetVersion,
      generatedAt: new Date().toISOString(),
      stops: request.stops,
      branches: request.branches,
      segments: projectedSegments,
      entrances: options.entrances ?? [],
    };
  }

  const canonical = createCanonicalTraceGeometry(traces);
  if (canonical.segments.length === 0) return undefined;

  return {
    schemaVersion: 1,
    source,
    topology: "provider",
    datasetVersion: options.datasetVersion,
    generatedAt: new Date().toISOString(),
    ...canonical,
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
  provider: "idfm" | "navitia",
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
