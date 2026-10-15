import type { NearbyJourneyPoint } from "../../features/nearby-stations/nearbyHeavyTransports";
import { NEIGHBORHOOD_TRANSPORT_TIMEOUT_MS } from "../../../shared/gtfs/neighborhoodTimeout";
import { createStraightLineWalkingRoute, type NearbyWalkingMatrixDestination, type NearbyWalkingRoute } from "../../features/nearby-stations/nearbyWalkingRoutes";

/** Cache directed street routes, rather than whole matrices: day/night trees
 * and different destination lists can share their overlapping stop pairs. */
export function createNeighborhoodGtfsWalkingMatrix(fetcher: typeof fetch = fetch, observe?: (cached: boolean, reused: number, requested: number) => void,
  storage: CacheStorage | undefined = typeof caches === "undefined" ? undefined : caches) {
  const cache = new Map<string, { expires: number; promise: Promise<NearbyWalkingRoute> }>();
  let persisted: Promise<Cache | undefined> | undefined;
  const persistentCache = () => persisted ??= storage?.open("neighborhood-gtfs-walking-v1").catch(() => undefined) ?? Promise.resolve(undefined);
  const cacheUrl = (baseUrl: string, key: string) => new URL("/_neighborhood-walking-cache/" + encodeURIComponent(key), baseUrl).href;
  const pairKey = (baseUrl: string, origin: NearbyJourneyPoint, destination: NearbyJourneyPoint, reverse?: boolean) => {
    const from = reverse ? destination : origin, to = reverse ? origin : destination;
    return JSON.stringify([baseUrl, from.lon, from.lat, to.lon, to.lat]);
  };
  return async (baseUrl: string, origin: NearbyJourneyPoint, destinations: NearbyWalkingMatrixDestination[], options: { reverse?: boolean; coldStart?: boolean; observe?: typeof observe; observeStorage?: (available: boolean) => void } = {}) => {
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
        const entry = await response.json() as { expires: number; route: NearbyWalkingRoute };
        const route = entry.route;
        if (entry.expires <= Date.now() || !Number.isFinite(entry.expires) || route?.fallback !== false
          || route.provider === "straight-line" || !Number.isFinite(route.durationSeconds) || route.durationSeconds < 0
          || !Number.isFinite(route.distanceMeters) || !Array.isArray(route.coordinates)) return;
        cache.set(key, { expires: entry.expires, promise: Promise.resolve(route) });
        while (cache.size > 1024) cache.delete(cache.keys().next().value!);
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
        return route;
      }) };
      cache.set(key, entry);
      while (cache.size > 1024) cache.delete(cache.keys().next().value!);
      return entry.promise;
    });
    (options.observe ?? observe)?.(missing.length === 0, destinations.length - missing.length, destinations.length);
    const batch = (async () => {
      if (!missing.length) return [];
      const estimated = missing.map(destination => createStraightLineWalkingRoute(
        options.reverse ? destination : origin, options.reverse ? origin : destination, destination.id));
      try {
        const response = await fetcher(new URL("/api/walking/matrix", baseUrl), {
          method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(NEIGHBORHOOD_TRANSPORT_TIMEOUT_MS),
          body: JSON.stringify({ origin, destinations: missing, routingPolicy: "gtfs-access", reverse: options.reverse === true }),
        });
        if (!response.ok) return estimated;
        const payload = await response.json() as { routes?: NearbyWalkingRoute[] };
        const routes = new Map(payload.routes?.map(route => [route.id, route]));
        const resolved = missing.map((destination, i) => routes.get(destination.id) ?? estimated[i]!);
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
      } catch { return estimated; }
    })();
    return (await Promise.all(promises)).map((route, i) => ({ ...route, id: destinations[i]!.id }));
  };
}
