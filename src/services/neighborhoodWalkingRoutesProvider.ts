import type { NearbyJourneyPoint, NearbyWalkingRouteProvider } from "../features/nearby-stations/nearbyHeavyTransports";
import type { NearbyWalkingRoute } from "../features/nearby-stations/nearbyWalkingRoutes";
import { getNearbyWalkingRouteMatrix } from "./nearbyWalkingRoutes";

interface PendingWalk {
  destination: NearbyJourneyPoint;
  resolve: (route: NearbyWalkingRoute) => void;
  reject: (cause: unknown) => void;
}

/** Page-scoped matrices share the resolver's cancellation scope and existing caches. */
export function createNeighborhoodWalkingRoutesProvider(): NearbyWalkingRouteProvider {
  const groups = new Map<AbortSignal | undefined, Map<string, PendingWalk[]>>();
  return (origin, destination, signal) => {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const key = `${origin.lon}:${origin.lat}`;
    const scope = groups.get(signal) ?? new Map<string, PendingWalk[]>();
    groups.set(signal, scope);
    return new Promise<NearbyWalkingRoute>((resolve, reject) => {
      const active = scope.get(key);
      if (active) { active.push({ destination, resolve, reject }); return; }
      const pending = [{ destination, resolve, reject }]; scope.set(key, pending);
      setTimeout(() => {
        scope.delete(key); if (!scope.size) groups.delete(signal);
        void (async () => {
          signal?.throwIfAborted();
          const destinations = [...new Map(pending.map(p => {
            const id = `station:${p.destination.lon}:${p.destination.lat}`;
            return [id, { ...p.destination, id }] as const;
          })).values()];
          const routes: NearbyWalkingRoute[] = [];
          for (let i = 0; i < destinations.length; i += 64) {
            routes.push(...await getNearbyWalkingRouteMatrix(origin, destinations.slice(i, i + 64), signal, "ors-only"));
          }
          signal?.throwIfAborted();
          const byId = new Map(routes.map(route => [route.id, route]));
          for (const p of pending) p.resolve(byId.get(`station:${p.destination.lon}:${p.destination.lat}`)!);
        })().catch(cause => pending.forEach(p => p.reject(cause)));
      }, 0);
    });
  };
}
