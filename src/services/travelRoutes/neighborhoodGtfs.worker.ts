/// <reference lib="webworker" />
import { createNeighborhoodGtfsRouter } from "../../../shared/gtfs/routing";
import { createGtfsTimetableLoader } from "../../../shared/gtfs/timetableRuntime";
import { computeGtfsLineFrequency, getGtfsFrequencyServiceDate } from "../../../shared/gtfs/frequencyComputation";
import { mapFrequencyStops } from "../../../shared/gtfs/frequencyTopology";
import { findGtfsLastService } from "../../../shared/gtfs/lastService";
import type { GtfsManifest } from "../../../server/services/gtfs/types";
import type { LineTopology } from "../../../server/services/topology/types";
import type { GtfsLineFrequencyResponse } from "../../types/lineFrequency";
import type { NeighborhoodJourneysResponse } from "../../features/nearby-stations/neighborhoodJourneys";
import type { NeighborhoodGtfsWorkerDiagnostics, NeighborhoodGtfsWorkerRequest, NeighborhoodGtfsWorkerResponse } from "./neighborhoodGtfsWorkerProtocol";
import { createNeighborhoodGtfsTaskQueue } from "./neighborhoodGtfsTaskQueue";
import { createNeighborhoodGtfsWalkingMatrix } from "./neighborhoodGtfsWalkingMatrix";
import { createNeighborhoodTimetableCache, selectNeighborhoodCivilTimetable, selectNeighborhoodServiceTimetable } from "./neighborhoodTimetableCache";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const CACHE_NAME = "neighborhood-gtfs-routing-v1";
let manifest: { baseUrl: string; expires: number; value?: GtfsManifest } | undefined;
let activeDiagnostics: NeighborhoodGtfsWorkerDiagnostics | undefined;
async function readAsset<T>(baseUrl: string, path: string): Promise<T | undefined> {
  if (activeDiagnostics) activeDiagnostics.assetReads++;
  const url = new URL("/_gtfs-data/" + path.split("/").map(encodeURIComponent).join("/"), baseUrl).href;
  const cache = typeof caches === "undefined" ? undefined : await caches.open(CACHE_NAME).catch(() => undefined);
  const cached = await cache?.match(url).catch(() => undefined);
  // GTFS files are immutable and keyed by dataset hash + generator version.
  if (path !== "current.json" && cached) return await cached.json() as T;
  try {
    const response = await fetch(url, { cache: path === "current.json" ? "no-cache" : "default", signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`GTFS asset unavailable (${response.status})`);
    if (cache) void cache.put(url, response.clone()).catch(() => {});
    return await response.json() as T;
  } catch (error) {
    if (cached) return await cached.json() as T;
    throw error;
  }
}
const runtime = {
  getManifest: async (baseUrl: string) => {
    if (!manifest || manifest.baseUrl !== baseUrl || manifest.expires <= Date.now()) {
      manifest = { baseUrl, expires: Date.now() + 60_000, value: await readAsset<GtfsManifest>(baseUrl, "current.json") };
    }
    return manifest.value;
  },
  isEnabled: () => true, cacheEpoch: () => 0, readJson: readAsset,
};
const timetable = createGtfsTimetableLoader<string>(runtime);
const loadTimetable = createNeighborhoodTimetableCache(timetable.loadForDate);
const matrix = createNeighborhoodGtfsWalkingMatrix(fetch, (cached, reused, requested) => {
  if (activeDiagnostics) {
    activeDiagnostics.matrixCalls++;
    if (cached) activeDiagnostics.matrixCacheHits++;
    activeDiagnostics.walkingPairsReused += reused;
    activeDiagnostics.walkingPairsRequested += requested;
  }
});
const route = createNeighborhoodGtfsRouter<string>({
  ...runtime,
  matrix,
});

const topologies = new Map<string, Promise<LineTopology | undefined>>();
async function topology(baseUrl: string, lineId: string, version: string): Promise<LineTopology | undefined> {
  const key = `${baseUrl}:${lineId}:${version}`;
  if (!topologies.has(key)) {
    const request = (async () => {
      try {
        const url = new URL(`/api/lines/${encodeURIComponent(lineId)}/topology`, baseUrl);
        url.searchParams.set("gtfsVersion", version);
        const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) return undefined;
        const value = await response.json() as LineTopology;
        return Array.isArray(value.stations) && Array.isArray(value.segments) && Array.isArray(value.patterns) ? value : undefined;
      } catch { return undefined; }
    })();
    topologies.set(key, request);
    void request.then(value => {
      if (!value && topologies.get(key) === request) topologies.delete(key);
    });
    while (topologies.size > 8) topologies.delete(topologies.keys().next().value!);
  }
  return topologies.get(key)!;
}
const frequencies = new Map<string, GtfsLineFrequencyResponse>();
async function frequency(baseUrl: string, lineId: string): Promise<GtfsLineFrequencyResponse> {
  const current = await runtime.getManifest(baseUrl), serviceDate = getGtfsFrequencyServiceDate();
  const version = `${current?.timetable?.path}:${current?.cacheGeneration}`;
  const key = `${baseUrl}:${lineId}:${serviceDate}:${version}`;
  if (frequencies.has(key)) return frequencies.get(key)!;
  const loaded = selectNeighborhoodCivilTimetable(await loadTimetable(baseUrl, lineId, serviceDate, version));
  const profile = computeGtfsLineFrequency({ lineId, serviceDate, timetable: loaded, topology: await topology(baseUrl, lineId, version) });
  if (profile.status === "ready" && profile.topologyAvailable) frequencies.set(key, profile);
  while (frequencies.size > 16) frequencies.delete(frequencies.keys().next().value!);
  return profile;
}
async function lastService(baseUrl: string, request: Extract<NeighborhoodGtfsWorkerRequest, { kind: "last-service" }>) {
  const serviceDate = request.serviceDate ?? getGtfsFrequencyServiceDate();
  const current = await runtime.getManifest(baseUrl), version = `${current?.timetable?.path}:${current?.cacheGeneration}`;
  const loaded = selectNeighborhoodServiceTimetable(await loadTimetable(baseUrl, request.lineId, serviceDate, version), serviceDate);
  const stopIds = loaded.index && loaded.status === "ready" ? mapFrequencyStops(loaded.index.stops, await topology(baseUrl, request.lineId, version)) : new Map<string,string>();
  return findGtfsLastService({ status: loaded.status,
    stops: (loaded.index?.stops ?? []).map(stop => ({ id: stop.id, parentId: stop.parentId, name: stop.name, topologyId: stopIds.get(stop.id) })),
    trips: loaded.trips,
  }, request.stationId);
}

// Serialize routes and timetable computations to bound the retained datasets.
const queue = createNeighborhoodGtfsTaskQueue();
scope.addEventListener("message", (event: MessageEvent<NeighborhoodGtfsWorkerRequest>) => {
  const message = event.data;
  if (message.kind === "cancel") { queue.cancel(message.id); return; }
  const { id, baseUrl } = message, enqueued = performance.now();
  queue.enqueue(id, async isCancelled => {
    const started = performance.now();
    const diagnostics: NeighborhoodGtfsWorkerDiagnostics = { kind: message.kind, queueMs: Math.round(started - enqueued), taskMs: 0, assetReads: 0, matrixCalls: 0, matrixCacheHits: 0, walkingPairsReused: 0, walkingPairsRequested: 0 };
    activeDiagnostics = diagnostics;
    try {
      const payload = message.kind === "frequency" ? await frequency(baseUrl, message.lineId)
        : message.kind === "last-service" ? await lastService(baseUrl, message)
        : await route(baseUrl, message.request);
      if (message.kind === "routes") {
        const routing = (payload as NeighborhoodJourneysResponse).diagnostics;
        diagnostics.cacheHit = routing?.cacheHit;
        diagnostics.scannedConnections = routing?.scannedConnections;
      }
      diagnostics.taskMs = Math.round(performance.now() - started);
      if (!isCancelled()) scope.postMessage({ id, payload, diagnostics } satisfies NeighborhoodGtfsWorkerResponse);
    }
    catch (error) {
      diagnostics.taskMs = Math.round(performance.now() - started);
      if (!isCancelled()) scope.postMessage({ id, error: error instanceof Error ? error.message : "GTFS routing failed", diagnostics } satisfies NeighborhoodGtfsWorkerResponse);
    } finally { activeDiagnostics = undefined; }
  });
});
