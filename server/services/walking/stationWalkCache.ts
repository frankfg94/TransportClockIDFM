import type { H3Event } from "h3";
import type { NearbyWalkingMatrixDestination, NearbyWalkingRoute } from "../../../src/features/nearby-stations/nearbyWalkingRoutes";
import type { NearbyJourneyPoint } from "../../../src/features/nearby-stations/nearbyHeavyTransports";
import type { DiagnosticWalkingRoute } from "../../../src/services/travelRoutes/neighborhoodGtfsWalkingMatrix";

interface Store {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl: number }): Promise<unknown>;
}
const prefix = "station-walk-v1-ign-pedestrian-fastest:";
const lifetime = 30 * 24 * 3600;

export function stationWalkStore(event: H3Event): Store | undefined {
  const env = event.context?.cloudflare?.env;
  const kv = env?.WALKING_CACHE_KV ?? env?.LINE_GEOMETRY_CACHE_KV;
  if (kv) return kv;
  if (!import.meta.dev) return;
  const local = useStorage("stationWalks");
  return {
    async get(key) {
      const value = await local.getItem(key);
      return value === null || typeof value === "string" ? value : JSON.stringify(value);
    },
    put: (key, value) => local.setItem(key, value),
  };
}

export async function resetStationWalkCache(store: Store) {
  // A late completion from an old generation cannot repopulate the new one.
  await store.put(prefix + "generation", crypto.randomUUID());
}

export async function cachedStationWalkMatrix(store: Store, origin: NearbyJourneyPoint,
  destinations: readonly NearbyWalkingMatrixDestination[], reverse: boolean,
  calculate: (missing: NearbyWalkingMatrixDestination[]) => Promise<DiagnosticWalkingRoute[]>) {
  let generation: string;
  try { generation = await store.get(prefix + "generation") ?? "initial"; }
  catch { return calculate([...destinations]); }
  const keys = destinations.map(point => {
    if (!point.stationWalk) return;
    const [from, to] = reverse ? [point, origin] : [origin, point];
    return prefix + [from.lon, from.lat, to.lon, to.lat].join(",");
  });
  const routes = await Promise.all(keys.map(async (key, i): Promise<DiagnosticWalkingRoute | undefined> => {
    if (!key) return;
    try {
      const value = await store.get(key);
      if (!value) return;
      const record = JSON.parse(value);
      const route: NearbyWalkingRoute = record.route;
      if (record.generation !== generation || !Number.isFinite(record.expires) || record.expires <= Date.now() || route.provider !== "ign-bdtopo" ||
        route.fallback !== false || !Number.isFinite(route.durationSeconds) || !route.coordinates?.length) return;
      return { ...route, id: destinations[i]!.id, walkingDiagnostic: { source: "walking-matrix-proxy", phase: "response",
        cause: "success", observedAt: new Date().toISOString(), cacheState: "hit" } };
    } catch { return; }
  }));
  const missing = destinations.map((_, i) => i).filter(i => !routes[i]);
  if (missing.length) {
    const fetched = await calculate(missing.map(i => destinations[i]!));
    await Promise.all(missing.map(async (i, ordinal) => {
      const route = fetched[ordinal]!;
      routes[i] = route;
      if (!keys[i] || route.fallback !== false || route.provider !== "ign-bdtopo") return;
      const { walkingDiagnostic, id, ...geometry } = route;
      await store.put(keys[i]!, JSON.stringify({ generation, expires: Date.now() + lifetime * 1000, route: geometry }),
        { expirationTtl: lifetime }).catch(() => {});
    }));
  }
  return routes as DiagnosticWalkingRoute[];
}
