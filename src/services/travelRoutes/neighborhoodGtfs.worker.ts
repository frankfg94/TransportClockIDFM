/// <reference lib="webworker" />
import { createNeighborhoodGtfsRouter } from "../../../shared/gtfs/routing";
import type { GtfsManifest } from "../../../server/services/gtfs/types";
import { createStraightLineWalkingRoute, type NearbyWalkingRoute } from "../../features/nearby-stations/nearbyWalkingRoutes";
import type { NeighborhoodGtfsWorkerRequest, NeighborhoodGtfsWorkerResponse } from "./neighborhoodGtfsWorkerProtocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const CACHE_NAME = "neighborhood-gtfs-routing-v1";
let manifest: { baseUrl: string; expires: number; value?: GtfsManifest } | undefined;
async function readAsset<T>(baseUrl: string, path: string): Promise<T | undefined> {
  const url = new URL("/_gtfs-data/" + path.split("/").map(encodeURIComponent).join("/"), baseUrl).href;
  const cache = await caches.open(CACHE_NAME).catch(() => undefined);
  const cached = await cache?.match(url).catch(() => undefined);
  // Routing files are immutable and keyed by dataset hash + generator version.
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
const route = createNeighborhoodGtfsRouter<string>({
  getManifest: async baseUrl => {
    if (!manifest || manifest.baseUrl !== baseUrl || manifest.expires <= Date.now()) {
      manifest = { baseUrl, expires: Date.now() + 60_000, value: await readAsset<GtfsManifest>(baseUrl, "current.json") };
    }
    return manifest.value;
  },
  isEnabled: () => true, cacheEpoch: () => 0, readJson: readAsset,
  matrix: async (baseUrl, origin, destinations, options) => {
    if (!destinations.length) return [];
    const estimated = destinations.map(destination => options?.reverse
      ? createStraightLineWalkingRoute(destination, origin, destination.id)
      : createStraightLineWalkingRoute(origin, destination, destination.id));
    try {
      const response = await fetch(new URL("/api/walking/matrix", baseUrl), {
        method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ origin, destinations, routingPolicy: "ors-only", reverse: options?.reverse === true }),
      });
      if (!response.ok) return estimated;
      const payload = await response.json() as { routes?: NearbyWalkingRoute[] };
      const routes = new Map(payload.routes?.map(item => [item.id, item]));
      return destinations.map((destination, i) => routes.get(destination.id) ?? estimated[i]!);
    } catch { return estimated; }
  },
});

// Bound the retained routing trees by processing batches on one worker queue.
let queue = Promise.resolve();
scope.addEventListener("message", (event: MessageEvent<NeighborhoodGtfsWorkerRequest>) => {
  const { id, baseUrl, request } = event.data;
  queue = queue.then(async () => {
    try { scope.postMessage({ id, payload: await route(baseUrl, request) } satisfies NeighborhoodGtfsWorkerResponse); }
    catch (error) { scope.postMessage({ id, error: error instanceof Error ? error.message : "GTFS routing failed" } satisfies NeighborhoodGtfsWorkerResponse); }
  });
});
