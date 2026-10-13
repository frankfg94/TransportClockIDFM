import type { NearbyJourneyPoint } from "../../features/nearby-stations/nearbyHeavyTransports";
import { createStraightLineWalkingRoute, type NearbyWalkingMatrixDestination, type NearbyWalkingRoute } from "../../features/nearby-stations/nearbyWalkingRoutes";

/** Cache directed street routes, rather than whole matrices: day/night trees
 * and different destination lists can share their overlapping stop pairs. */
export function createNeighborhoodGtfsWalkingMatrix(fetcher: typeof fetch = fetch, observe?: (cached: boolean, reused: number, requested: number) => void) {
  const cache = new Map<string, { expires: number; promise: Promise<NearbyWalkingRoute> }>();
  return async (baseUrl: string, origin: NearbyJourneyPoint, destinations: NearbyWalkingMatrixDestination[], options: { reverse?: boolean; observe?: typeof observe } = {}) => {
    if (!destinations.length) return [];
    const missing: NearbyWalkingMatrixDestination[] = [];
    const promises = destinations.map(destination => {
      const from = options.reverse ? destination : origin, to = options.reverse ? origin : destination;
      const key = JSON.stringify([baseUrl, from.lon, from.lat, to.lon, to.lat]);
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
          method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({ origin, destinations: missing, routingPolicy: "gtfs-access", reverse: options.reverse === true }),
        });
        if (!response.ok) return estimated;
        const payload = await response.json() as { routes?: NearbyWalkingRoute[] };
        const routes = new Map(payload.routes?.map(route => [route.id, route]));
        return missing.map((destination, i) => routes.get(destination.id) ?? estimated[i]!);
      } catch { return estimated; }
    })();
    return (await Promise.all(promises)).map((route, i) => ({ ...route, id: destinations[i]!.id }));
  };
}
