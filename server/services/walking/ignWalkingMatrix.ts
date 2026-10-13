import { fetchBufferedWithTimeout } from "../idfm/boundedFetch";
import {
  createStraightLineWalkingRoute, haversineMeters,
  type NearbyWalkingMatrixDestination, type NearbyWalkingRoute,
} from "../../../src/features/nearby-stations/nearbyWalkingRoutes";
import type { NearbyJourneyPoint } from "../../../src/features/nearby-stations/nearbyHeavyTransports";

// IGN publishes a 5 requests/second/IP limit and at most 15 intermediate
// points. Eight out-and-back pairs fit in one request. Every outward and
// return portion is computed independently, including directed restrictions.
const ENDPOINT = "https://data.geopf.fr/navigation/itineraire";
const BATCH_SIZE = 8;
const CACHE_TTL_MS = 15 * 60_000;
const MAX_CACHE_ENTRIES = 4096;
const MAX_SNAP_METERS = 100;
const CONNECTOR_METERS_PER_SECOND = 4_000 / 3_600;

interface IgnStep { geometry?: { type?: string; coordinates?: unknown }; distance?: number; duration?: number }
interface IgnPortion { start?: string; end?: string; distance?: number; duration?: number; steps?: IgnStep[] }
interface IgnRoute { resource?: string; resourceVersion?: string; distanceUnit?: string; timeUnit?: string; portions?: IgnPortion[] }
type RouteResult = { outward: NearbyWalkingRoute; inward: NearbyWalkingRoute };
type MatrixOptions = { reverse?: boolean; signal?: AbortSignal };

function coordinates(value: unknown): NearbyJourneyPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])
    ? [{ lon: point[0] as number, lat: point[1] as number }] : []);
}
function parsePortion(portion: IgnPortion | undefined, from: NearbyJourneyPoint, to: NearbyJourneyPoint, version?: string): NearbyWalkingRoute | undefined {
  const points = portion?.steps?.flatMap(step => step.geometry?.type === "LineString" ? coordinates(step.geometry.coordinates) : []) ?? [];
  if (!portion || points.length < 2 || !Number.isFinite(portion.distance) || !Number.isFinite(portion.duration)
    || portion.distance! < 0 || portion.duration! < 0) return undefined;
  const startConnector = haversineMeters(from, points[0]!), endConnector = haversineMeters(points.at(-1)!, to);
  if (startConnector > MAX_SNAP_METERS || endConnector > MAX_SNAP_METERS) return undefined;
  const connector = startConnector + endConnector;
  return { provider: "ign-bdtopo", datasetVersion: version, distanceMeters: Math.round(portion.distance! + connector),
    durationSeconds: Math.ceil(portion.duration! + connector / CONNECTOR_METERS_PER_SECOND),
    coordinates: [{ lon: from.lon, lat: from.lat }, ...points, { lon: to.lon, lat: to.lat }], fallback: false };
}

/** One common, public street-network source for every verdict environment.
 * The caches are bounded directed coordinate pairs, never address results. */
export function createIgnWalkingMatrix(fetcher: typeof fetch = fetch) {
  const cache = new Map<string, { expires: number; promise: Promise<NearbyWalkingRoute> }>();
  let nextRequestAt = 0, cooldownUntil = 0;
  const key = (from: NearbyJourneyPoint, to: NearbyJourneyPoint) => JSON.stringify([from.lon, from.lat, to.lon, to.lat]);
  const point = (p: NearbyJourneyPoint) => `${p.lon},${p.lat}`;
  const fallback = (from: NearbyJourneyPoint, to: NearbyJourneyPoint, reason: NearbyWalkingRoute["unavailabilityReason"] = "unavailable") => ({
    ...createStraightLineWalkingRoute(from, to), unavailabilityReason: reason,
  });

  async function batch(origin: NearbyJourneyPoint, destinations: NearbyJourneyPoint[], signal?: AbortSignal): Promise<RouteResult[]> {
    const estimated = (reason?: NearbyWalkingRoute["unavailabilityReason"]) => destinations.map(to => ({ outward: fallback(origin, to, reason), inward: fallback(to, origin, reason) }));
    if (cooldownUntil > Date.now()) return estimated("quota-exceeded");
    // Reserve synchronously; no worker invocation owns another one's promise.
    const startsAt = Math.max(nextRequestAt, Date.now()); nextRequestAt = startsAt + 250;
    const delay = startsAt - Date.now();
    if (delay > 0) await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); reject(signal?.reason); };
      const timer = setTimeout(() => { signal?.removeEventListener("abort", cancel); resolve(); }, delay);
      signal?.addEventListener("abort", cancel, { once: true }); if (signal?.aborted) cancel();
    });
    signal?.throwIfAborted();
    if (cooldownUntil > Date.now()) return estimated("quota-exceeded");
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({ resource: "bdtopo-osrm", start: point(origin), end: point(origin),
      intermediates: destinations.flatMap(to => [point(to), point(origin)]).slice(0, -1).join("|"),
      profile: "pedestrian", optimization: "fastest", geometryFormat: "geojson", getSteps: "true",
      getBbox: "false", distanceUnit: "meter", timeUnit: "second", crs: "EPSG:4326" }).toString();
    try {
      const response = await fetchBufferedWithTimeout(url, { signal, headers: { accept: "application/json" } }, fetcher, 12_000);
      if (response.status === 429) {
        const retry = Number(response.headers.get("retry-after"));
        cooldownUntil = Date.now() + (Number.isFinite(retry) && retry > 0 ? Math.min(retry * 1000, 86_400_000) : 60_000);
        return estimated("quota-exceeded");
      }
      if (!response.ok) return estimated(response.status === 400 ? "unreachable" : "unavailable");
      const payload = await response.json() as IgnRoute;
      if (payload.resource !== "bdtopo-osrm" || payload.distanceUnit !== "meter" || payload.timeUnit !== "second"
        || payload.portions?.length !== destinations.length * 2) return estimated();
      return destinations.map((to, i) => ({
        outward: parsePortion(payload.portions![i * 2], origin, to, payload.resourceVersion) ?? fallback(origin, to, "unreachable"),
        inward: parsePortion(payload.portions![i * 2 + 1], to, origin, payload.resourceVersion) ?? fallback(to, origin, "unreachable"),
      }));
    } catch (error) { signal?.throwIfAborted(); return estimated(); }
  }

  return async (origin: NearbyJourneyPoint, destinations: readonly NearbyWalkingMatrixDestination[], options: MatrixOptions = {}): Promise<NearbyWalkingRoute[]> => {
    const missing = new Map<string, NearbyJourneyPoint>();
    const now = Date.now();
    for (const to of destinations) {
      const from = options.reverse ? to : origin, end = options.reverse ? origin : to;
      if (haversineMeters(from, end) < 0.01) {
        cache.set(key(from, end), { expires: now + CACHE_TTL_MS, promise: Promise.resolve({ provider: "ign-bdtopo", distanceMeters: 0,
          durationSeconds: 0, coordinates: [from, end], fallback: false }) });
        continue;
      }
      const existing = cache.get(key(from, end));
      if (!existing || existing.expires <= now) missing.set(key(origin, to), to);
    }
    const unique = [...missing.values()];
    // Register all pending pairs before yielding, so day/night and overlapping
    // destination matrices join the same work and both directions are reusable.
    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      const group = unique.slice(i, i + BATCH_SIZE);
      const promise = Promise.resolve().then(() => batch(origin, group, options.signal));
      for (const [ordinal, to] of group.entries()) for (const [from, end, direction] of [
        [origin, to, "outward"], [to, origin, "inward"],
      ] as const) {
        const pairKey = key(from, end);
        const existing = cache.get(pairKey);
        if (existing && existing.expires > now) continue;
        const entry = { expires: Infinity, promise: promise.then(results => {
          const route = results[ordinal]![direction];
          entry.expires = Date.now() + (route.fallback ? 60_000 : CACHE_TTL_MS); return route;
        }) };
        cache.set(pairKey, entry);
        void entry.promise.catch(() => { if (cache.get(pairKey) === entry) cache.delete(pairKey); });
      }
    }
    const results = await Promise.all(destinations.map(async to => {
      const from = options.reverse ? to : origin, end = options.reverse ? origin : to;
      const entry = cache.get(key(from, end))!;
      const route = await entry.promise;
      return { ...route, id: to.id };
    }));
    while (cache.size > MAX_CACHE_ENTRIES) {
      const expired = [...cache].find(([, entry]) => entry.expires !== Infinity);
      if (!expired) break; cache.delete(expired[0]);
    }
    return results;
  };
}
export const matrixWalkingWithIgn = createIgnWalkingMatrix();
