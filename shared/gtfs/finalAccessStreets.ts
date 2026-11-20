import type { NearbyJourneyPoint } from "../../src/features/nearby-stations/nearbyHeavyTransports";
import { haversineMeters, type NearbyWalkingMatrixDestination, type NearbyWalkingRoute } from "../../src/features/nearby-stations/nearbyWalkingRoutes";

type Point = NearbyJourneyPoint & { id: string };
export type FinalAccessMatrix = (origin: NearbyJourneyPoint, destinations: NearbyWalkingMatrixDestination[],
  options?: { reverse?: boolean }) => Promise<NearbyWalkingRoute[]>;

interface Pair {
  from: Point;
  to: Point;
  matrix: FinalAccessMatrix;
  resolve: (route: NearbyWalkingRoute) => void;
}

const MAX_DESTINATIONS = 64;
const pointKey = (p: Point) => `${p.lon},${p.lat}`;

export function createFinalAccessStreetRouter() {
  const cache = new Map<string, { expires: number; promise: Promise<NearbyWalkingRoute> }>();
  let pending: Pair[] = [];

  async function fetchGroup(pairs: Pair[], reverse: boolean) {
    const first = pairs[0]!;
    const center = reverse ? first.to : first.from;
    const ends = pairs.map(pair => reverse ? pair.from : pair.to);
    // Two different address coordinates can both have the public ID "address".
    const uniqueIds = new Set(ends.map(point => point.id)).size === ends.length;
    const destinations = ends.map((p, i) => ({ ...p, id: uniqueIds ? p.id : String(i), walkingPhase: "final-line-access",
      ...(p.id !== "address" && center.id !== "address" ? { stationWalk: true } : {}) }));
    let values: NearbyWalkingRoute[];
    try { values = await first.matrix(center, destinations, { reverse }); }
    catch { values = []; }
    const byId = new Map(values.map(route => [route.id, route]));
    pairs.forEach((pair, i) => {
      const route = byId.get(destinations[i]!.id) ?? (values[i]?.id === undefined ? values[i] : undefined);
      if (route && route.fallback === false && route.provider !== "straight-line" && Number.isFinite(route.durationSeconds) && route.durationSeconds >= 0) {
        pair.resolve({ ...route, id: pair.to.id });
      } else {
        const distance = haversineMeters(pair.from, pair.to);
        pair.resolve({ ...route, id: pair.to.id, provider: "straight-line", fallback: true, distanceMeters: distance,
          durationSeconds: Math.ceil(distance / (80 / 60)), coordinates: [pair.from, pair.to] });
      }
    });
  }

  function flush() {
    const pairs = pending;
    pending = [];
    // A station may have many feeder stops and just one entrance, or many
    // entrances for one feeder. Group the same directed pairs by either end.
    const groups = new Map<string, { reverse: boolean; pairs: Pair[] }>();
    for (const pair of pairs) {
      for (const reverse of [false, true]) {
        const key = (reverse ? "to:" : "from:") + pointKey(reverse ? pair.to : pair.from);
        let group = groups.get(key);
        if (!group) { group = { reverse, pairs: [] }; groups.set(key, group); }
        group.pairs.push(pair);
      }
    }
    const assigned = new Set<Pair>();
    for (const group of [...groups.values()].sort((a, b) => b.pairs.length - a.pairs.length || Number(a.reverse) - Number(b.reverse))) {
      const remaining = group.pairs.filter(pair => !assigned.has(pair));
      for (const pair of remaining) assigned.add(pair);
      for (let i = 0; i < remaining.length; i += MAX_DESTINATIONS) {
        void fetchGroup(remaining.slice(i, i + MAX_DESTINATIONS), group.reverse);
      }
    }
  }

  return async function streets(from: Point, destinations: Point[], matrix: FinalAccessMatrix) {
    const now = Date.now();
    const promises = destinations.map(to => {
      const key = `${pointKey(from)}>${pointKey(to)}`;
      const cached = cache.get(key);
      if (cached && cached.expires > now) return cached.promise;
      const promise = new Promise<NearbyWalkingRoute>(resolve => {
        if (!pending.length) queueMicrotask(flush);
        pending.push({ from, to, matrix, resolve });
      });
      const entry = { expires: Infinity, promise };
      cache.set(key, entry);
      void promise.then(route => {
        entry.expires = Date.now() + (route.fallback ? 60_000 : 300_000);
        // In-flight pairs are shared by every arrival until the matrix settles.
        if (cache.size > 1024) {
          for (const [oldKey, oldEntry] of cache) {
            if (oldEntry.expires !== Infinity) cache.delete(oldKey);
            if (cache.size <= 1024) break;
          }
        }
      });
      return promise;
    });
    const routes = await Promise.all(promises);
    return new Map(destinations.map((to, i) => [to.id, routes[i]!]));
  };
}
