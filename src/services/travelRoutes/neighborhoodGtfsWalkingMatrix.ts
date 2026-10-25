import type { NearbyJourneyPoint } from "../../features/nearby-stations/nearbyHeavyTransports";
import { NEIGHBORHOOD_TRANSPORT_TIMEOUT_MS } from "../../../shared/gtfs/neighborhoodTimeout";
import { createStraightLineWalkingRoute, type NearbyWalkingMatrixDestination, type NearbyWalkingRoute } from "../../features/nearby-stations/nearbyWalkingRoutes";

/** Additive diagnostic metadata: deliberately excludes URLs, exception messages and credentials. */
export interface WalkingRouteDiagnostic {
  source: "ign-navigation" | "walking-matrix-proxy";
  phase: "queue" | "upstream" | "response";
  cause: "success" | "http" | "timeout" | "network" | "invalid-response" | "unreachable" | "cooldown";
  httpStatus?: number;
  requestId?: string;
  observedAt: string;
  queuedMs?: number;
  durationMs?: number;
  retryAfterMs?: number;
  cacheState?: "hit" | "pending" | "requested";
}
export type DiagnosticWalkingRoute = NearbyWalkingRoute & { walkingDiagnostic?: WalkingRouteDiagnostic };
export interface WalkingMatrixObservation {
  requestId: string; phase: "initial-access" | "egress" | "final-line-access" | "night-access";
  pairs: number; httpStatus?: number; cause: WalkingRouteDiagnostic["cause"]; durationMs: number;
}

/** Cache directed street routes, rather than whole matrices: day/night trees
 * and different destination lists can share their overlapping stop pairs. */
export function createNeighborhoodGtfsWalkingMatrix(fetcher: typeof fetch = fetch, observe?: (cached: boolean, reused: number, requested: number) => void,
  storage: CacheStorage | undefined = typeof caches === "undefined" ? undefined : caches) {
  const cache = new Map<string, { expires: number; promise: Promise<DiagnosticWalkingRoute> }>();
  const instanceId = crypto.randomUUID();
  let nextRequestId = 0;
  function trimCache() {
    for (const [key, entry] of cache) {
      if (cache.size <= 1024) break;
      // Pending work is the deduplication registry, not an evictable result.
      if (entry.expires !== Infinity) cache.delete(key);
    }
  }
  let persisted: Promise<Cache | undefined> | undefined;
  const persistentCache = () => persisted ??= storage?.open("neighborhood-gtfs-walking-v1").catch(() => undefined) ?? Promise.resolve(undefined);
  const cacheUrl = (baseUrl: string, key: string) => new URL("/_neighborhood-walking-cache/" + encodeURIComponent(key), baseUrl).href;
  const pairKey = (baseUrl: string, origin: NearbyJourneyPoint, destination: NearbyJourneyPoint, reverse?: boolean) => {
    const from = reverse ? destination : origin, to = reverse ? origin : destination;
    return JSON.stringify([baseUrl, from.lon, from.lat, to.lon, to.lat]);
  };
  return async (baseUrl: string, origin: NearbyJourneyPoint, destinations: NearbyWalkingMatrixDestination[], options: { reverse?: boolean; coldStart?: boolean; phase?: WalkingMatrixObservation["phase"]; observe?: typeof observe; observeStorage?: (available: boolean) => void; observeRequest?: (event: WalkingMatrixObservation) => void } = {}) => {
    if (!destinations.length) return [];
    // Preserve a documented route and its real provider version across page
    // reloads. Estimates remain retryable; cold-start diagnostics bypass disk.
    const disk = options.coldStart ? undefined : await persistentCache();
    options.observeStorage?.(Boolean(disk));
    if (disk) await Promise.all(destinations.map(async destination => {
      const key = pairKey(baseUrl, origin, destination, options.reverse);
      if ((cache.get(key)?.expires ?? 0) > Date.now()) return;
      try {
        const response = await disk.match(cacheUrl(baseUrl, key));
        if (!response) return;
        const entry = await response.json() as { expires: number; route: DiagnosticWalkingRoute };
        const route = entry.route;
        if (entry.expires <= Date.now() || !Number.isFinite(entry.expires) || route?.fallback !== false
          || route.provider === "straight-line" || !Number.isFinite(route.durationSeconds) || route.durationSeconds < 0
          || !Number.isFinite(route.distanceMeters) || !Array.isArray(route.coordinates)) return;
        cache.set(key, { expires: entry.expires, promise: Promise.resolve(route) });
        trimCache();
      } catch { /* Unavailable browser storage must not prevent routing. */ }
    }));
    const missing: NearbyWalkingMatrixDestination[] = [];
    const promises = destinations.map(destination => {
      const key = pairKey(baseUrl, origin, destination, options.reverse);
      const existing = cache.get(key);
      if (existing && existing.expires > Date.now()) {
        cache.delete(key); cache.set(key, existing);
        return existing.promise;
      }
      const ordinal = missing.length;
      missing.push(destination);
      // Start after every missing pair has been registered, so a concurrent
      // or subset request joins these promises without another fetch.
      const entry = { expires: Number.POSITIVE_INFINITY, promise: Promise.resolve().then(async () => {
        const route = (await batch)[ordinal]!;
        entry.expires = Date.now() + (route.fallback ? 60_000 : 5 * 60_000);
        trimCache();
        return route;
      }) };
      cache.set(key, entry);
      trimCache();
      return entry.promise;
    });
    (options.observe ?? observe)?.(missing.length === 0, destinations.length - missing.length, destinations.length);
    const batch = (async () => {
      if (!missing.length) return [];
      const requestId = `${instanceId}:${++nextRequestId}`, started = performance.now();
      const phase = options.phase ?? (options.reverse ? "egress" : "initial-access");
      let httpStatus: number | undefined, cause: WalkingRouteDiagnostic["cause"] = "success";
      const estimated = missing.map(destination => createStraightLineWalkingRoute(
        options.reverse ? destination : origin, options.reverse ? origin : destination, destination.id));
      const failed = (failure: WalkingRouteDiagnostic["cause"]): DiagnosticWalkingRoute[] => {
        cause = failure;
        return estimated.map(route => ({ ...route, unavailabilityReason: httpStatus === 429 ? "quota-exceeded" : "unavailable",
          walkingDiagnostic: { source: "walking-matrix-proxy", phase: "response", cause, requestId, httpStatus,
            observedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started) } }));
      };
      try {
        const response = await fetcher(new URL("/api/walking/matrix", baseUrl), {
          method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(NEIGHBORHOOD_TRANSPORT_TIMEOUT_MS),
          body: JSON.stringify({ origin, destinations: missing, routingPolicy: "gtfs-access", reverse: options.reverse === true }),
        });
        httpStatus = response.status;
        if (!response.ok) return failed("http");
        let payload: { routes?: DiagnosticWalkingRoute[] };
        try { payload = await response.json(); } catch { return failed("invalid-response"); }
        if (!Array.isArray(payload.routes)) return failed("invalid-response");
        const routes = new Map(payload.routes?.map(route => [route.id, route]));
        let invalid: DiagnosticWalkingRoute[] | undefined;
        const resolved = missing.map((destination, i) => routes.get(destination.id) ?? (invalid ??= failed("invalid-response"))[i]!);
        if (disk) {
          await Promise.all(resolved.map(async (route, i) => {
            if (route.fallback || route.provider === "straight-line") return;
            const key = pairKey(baseUrl, origin, missing[i]!, options.reverse);
            await disk.put(cacheUrl(baseUrl, key), Response.json({ expires: Date.now() + 5 * 60_000, route })).catch(() => {});
          }));
          const keys = await disk.keys().catch(() => []);
          // The disk budget must cover a complete multi-destination verdict;
          // the live worker cache remains capped at 1024 pairs.
          await Promise.all(keys.slice(0, Math.max(0, keys.length - 4096)).map(key => disk.delete(key).catch(() => false)));
        }
        return resolved;
      } catch (error) { return failed(error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network"); }
      finally { options.observeRequest?.({ requestId, phase, pairs: missing.length, httpStatus, cause, durationMs: Math.round(performance.now() - started) }); }
    })();
    return (await Promise.all(promises)).map((route, i) => ({ ...route, id: destinations[i]!.id }));
  };
}
