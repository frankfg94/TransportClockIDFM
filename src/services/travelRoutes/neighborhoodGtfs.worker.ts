/// <reference lib="webworker" />
import { createNeighborhoodGtfsRouter } from "../../../shared/gtfs/routing";
import { createGtfsTimetableLoader } from "../../../shared/gtfs/timetableRuntime";
import { computeGtfsLineFrequency, getGtfsFrequencyServiceDate } from "../../../shared/gtfs/frequencyComputation";
import { mapFrequencyStops } from "../../../shared/gtfs/frequencyTopology";
import { findGtfsLastService } from "../../../shared/gtfs/lastService";
import type { GtfsManifest } from "../../../server/services/gtfs/types";
import type { LineTopology } from "../../../server/services/topology/types";
import type { GtfsLineFrequencyResponse } from "../../types/lineFrequency";
import { createStraightLineWalkingRoute, type NearbyWalkingRoute } from "../../features/nearby-stations/nearbyWalkingRoutes";
import type { NeighborhoodGtfsWorkerRequest, NeighborhoodGtfsWorkerResponse } from "./neighborhoodGtfsWorkerProtocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const CACHE_NAME = "neighborhood-gtfs-routing-v1";
let manifest: { baseUrl: string; expires: number; value?: GtfsManifest } | undefined;
async function readAsset<T>(baseUrl: string, path: string): Promise<T | undefined> {
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
const route = createNeighborhoodGtfsRouter<string>({
  ...runtime,
  matrix: async (baseUrl, origin, destinations, options) => {
    if (!destinations.length) return [];
    const estimated = destinations.map(destination => options?.reverse
      ? createStraightLineWalkingRoute(destination, origin, destination.id)
      : createStraightLineWalkingRoute(origin, destination, destination.id));
    try {
      const response = await fetch(new URL("/api/walking/matrix", baseUrl), {
        method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ origin, destinations, routingPolicy: "gtfs-access", reverse: options?.reverse === true }),
      });
      if (!response.ok) return estimated;
      const payload = await response.json() as { routes?: NearbyWalkingRoute[] };
      const routes = new Map(payload.routes?.map(item => [item.id, item]));
      return destinations.map((destination, i) => routes.get(destination.id) ?? estimated[i]!);
    } catch { return estimated; }
  },
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
  const loaded = await timetable.loadForDate(baseUrl, lineId, serviceDate);
  const profile = computeGtfsLineFrequency({ lineId, serviceDate, timetable: loaded, topology: await topology(baseUrl, lineId, version) });
  if (profile.status === "ready" && profile.topologyAvailable) frequencies.set(key, profile);
  while (frequencies.size > 16) frequencies.delete(frequencies.keys().next().value!);
  return profile;
}
async function lastService(baseUrl: string, request: Extract<NeighborhoodGtfsWorkerRequest, { kind: "last-service" }>) {
  const serviceDate = request.serviceDate ?? getGtfsFrequencyServiceDate();
  const loaded = await timetable.loadForDate(baseUrl, request.lineId, serviceDate, { serviceDayOnly: true });
  const current = loaded.manifest, version = `${current?.timetable?.path}:${current?.cacheGeneration}`;
  const stopIds = loaded.index && loaded.status === "ready" ? mapFrequencyStops(loaded.index.stops, await topology(baseUrl, request.lineId, version)) : new Map<string,string>();
  return findGtfsLastService({ status: loaded.status,
    stops: (loaded.index?.stops ?? []).map(stop => ({ id: stop.id, parentId: stop.parentId, name: stop.name, topologyId: stopIds.get(stop.id) })),
    trips: loaded.trips,
  }, request.stationId);
}

// Serialize routes and timetable computations to bound the retained datasets.
let queue = Promise.resolve();
scope.addEventListener("message", (event: MessageEvent<NeighborhoodGtfsWorkerRequest>) => {
  const message = event.data, { id, baseUrl } = message;
  queue = queue.then(async () => {
    try {
      const payload = message.kind === "frequency" ? await frequency(baseUrl, message.lineId)
        : message.kind === "last-service" ? await lastService(baseUrl, message)
        : await route(baseUrl, message.request);
      scope.postMessage({ id, payload } satisfies NeighborhoodGtfsWorkerResponse);
    }
    catch (error) { scope.postMessage({ id, error: error instanceof Error ? error.message : "GTFS routing failed" } satisfies NeighborhoodGtfsWorkerResponse); }
  });
});
