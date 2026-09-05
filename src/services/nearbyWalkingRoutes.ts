import type { NearbyJourneyPoint } from "../features/nearby-stations/nearbyHeavyTransports";
import {
  createStraightLineWalkingRoute,
  sanitizeNearbyWalkingCacheKey,
  type NearbyWalkingMatrixDestination,
  type NearbyWalkingRoute,
  type NearbyWalkingRouteRequest,
} from "../features/nearby-stations/nearbyWalkingRoutes";
import { toServerApiUrl } from "./serverApi";

// v3 invalidates routes generated before malformed provider geometry tails
// were removed before connecting the route to the requested POI.
const PERSISTED_ROUTE_CACHE_STORAGE_KEY = "transport-clock:nearby-walking-routes:v3";
const PERSISTED_ROUTE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PERSISTED_ROUTE_CACHE_ENTRIES = 400;

interface PersistedWalkingRoute {
  expiresAt: number;
  route: NearbyWalkingRoute;
}

let persistentRouteCache: Record<string, PersistedWalkingRoute> = {};
let persistentCacheLoaded = false;
let persistentCacheStorage: Storage | undefined;

function getPersistentStorage(): Storage | undefined {
  try {
    return (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
  } catch {
    return undefined;
  }
}

function writePersistentRouteCache(storage: Storage | undefined): void {
  if (!storage) return;
  try {
    storage.setItem(PERSISTED_ROUTE_CACHE_STORAGE_KEY, JSON.stringify(persistentRouteCache));
  } catch {
    // Private browsing and full storage quotas should not break walking routes.
  }
}

function ensurePersistentRouteCacheLoaded(): Storage | undefined {
  const storage = getPersistentStorage();
  if (persistentCacheLoaded && persistentCacheStorage === storage) return storage;

  persistentCacheLoaded = true;
  persistentCacheStorage = storage;
  persistentRouteCache = {};
  if (!storage) return undefined;

  let changed = false;
  const now = Date.now();
  try {
    const raw = storage.getItem(PERSISTED_ROUTE_CACHE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        if (!value || typeof value !== "object") {
          changed = true;
          continue;
        }
        const entry = value as Partial<PersistedWalkingRoute>;
        const expiresAt = Number(entry.expiresAt);
        if (!Number.isFinite(expiresAt) || expiresAt <= now || !isWalkingRoute(entry.route)) {
          changed = true;
          continue;
        }
        persistentRouteCache[key] = {
          expiresAt,
          route: entry.route,
        };
      }
    }
  } catch {
    persistentRouteCache = {};
    changed = true;
  }
  if (changed) writePersistentRouteCache(storage);
  return storage;
}

function coordinateCacheKey(point: NearbyJourneyPoint): string {
  return `${point.lon.toFixed(5)},${point.lat.toFixed(5)}`;
}

function walkingRouteCacheKey(
  origin: NearbyJourneyPoint,
  destination: Pick<NearbyJourneyPoint, "lon" | "lat"> & { cacheKey?: string },
  requestCacheKey?: string,
): string {
  const sanitizedDestinationKey = (requestCacheKey ?? destination.cacheKey)
    ? sanitizeNearbyWalkingCacheKey(requestCacheKey ?? destination.cacheKey ?? "")
    : "";
  const destinationKey = sanitizedDestinationKey || coordinateCacheKey(destination);
  return `${coordinateCacheKey(origin)}::${destinationKey}`;
}

function cloneWalkingRoute(route: NearbyWalkingRoute, id?: string): NearbyWalkingRoute {
  return {
    ...route,
    id: id ?? route.id,
    coordinates: route.coordinates.map((point) => ({ ...point })),
  };
}

function isPersistableWalkingRoute(route: NearbyWalkingRoute): boolean {
  return isWalkingRoute(route) && route.provider !== "straight-line" && route.fallback !== true;
}

function persistWalkingRoute(request: NearbyWalkingRouteRequest, route: NearbyWalkingRoute): void {
  if (!isPersistableWalkingRoute(route)) return;
  const storage = ensurePersistentRouteCacheLoaded();
  if (!storage) return;
  const key = walkingRouteCacheKey(request.origin, request.destination, request.cacheKey);
  persistentRouteCache[key] = {
    expiresAt: Date.now() + PERSISTED_ROUTE_CACHE_TTL_MS,
    route: cloneWalkingRoute(route),
  };
  const entries = Object.entries(persistentRouteCache)
    .sort((left, right) => left[1].expiresAt - right[1].expiresAt);
  while (entries.length > MAX_PERSISTED_ROUTE_CACHE_ENTRIES) {
    const oldest = entries.shift();
    if (oldest) delete persistentRouteCache[oldest[0]];
  }
  writePersistentRouteCache(storage);
}

export function getCachedNearbyWalkingRoute(
  request: NearbyWalkingRouteRequest,
): NearbyWalkingRoute | undefined {
  const storage = ensurePersistentRouteCacheLoaded();
  if (!storage) return undefined;
  const key = walkingRouteCacheKey(request.origin, request.destination, request.cacheKey);
  const entry = persistentRouteCache[key];
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now() || !isPersistableWalkingRoute(entry.route)) {
    delete persistentRouteCache[key];
    writePersistentRouteCache(storage);
    return undefined;
  }
  return cloneWalkingRoute(entry.route, request.id);
}

export function clearNearbyWalkingRouteCache(): void {
  const storage = ensurePersistentRouteCacheLoaded();
  persistentRouteCache = {};
  if (!storage) return;
  try {
    storage.removeItem(PERSISTED_ROUTE_CACHE_STORAGE_KEY);
  } catch {
    // A storage cleanup failure should not prevent the settings page from resetting.
  }
}

export async function getNearbyWalkingRoute(
  request: NearbyWalkingRouteRequest,
  signal?: AbortSignal,
): Promise<NearbyWalkingRoute> {
  const cached = getCachedNearbyWalkingRoute(request);
  if (cached) return cached;
  const fallback = createStraightLineWalkingRoute(request.origin, request.destination, request.id);
  try {
    const response = await fetch(toServerApiUrl("/api/walking/route"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok) throw new Error(`walking-route-${response.status}`);
    const route = await response.json() as NearbyWalkingRoute;
    if (!isWalkingRoute(route)) return fallback;
    const resolved = cloneWalkingRoute(route, request.id);
    persistWalkingRoute(request, resolved);
    return resolved;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    return fallback;
  }
}

export async function getNearbyWalkingRouteMatrix(
  origin: NearbyJourneyPoint,
  destinations: readonly NearbyWalkingMatrixDestination[],
  signal?: AbortSignal,
): Promise<NearbyWalkingRoute[]> {
  if (destinations.length === 0) return [];
  const fallbacks = destinations.map((destination) => createStraightLineWalkingRoute(origin, destination, destination.id));
  const cachedRoutes = destinations.map((destination) => getCachedNearbyWalkingRoute({
    id: destination.id,
    cacheKey: destination.cacheKey,
    origin,
    destination,
  }));
  const missingDestinations = destinations.filter((_, index) => !cachedRoutes[index]);
  if (missingDestinations.length === 0) {
    return cachedRoutes.map((route, index) => route ?? fallbacks[index]!);
  }

  try {
    const response = await fetch(toServerApiUrl("/api/walking/matrix"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ origin, destinations: missingDestinations }),
      signal,
    });
    if (!response.ok) throw new Error(`walking-matrix-${response.status}`);
    const payload = await response.json() as { routes?: unknown };
    const routes = Array.isArray(payload.routes) ? payload.routes : [];
    const routesById = new Map(routes.filter(isWalkingRoute).map((route) => [route.id, route]));
    const fetchedRoutes = new Map<string, NearbyWalkingRoute>();
    for (const destination of missingDestinations) {
      const route = routesById.get(destination.id);
      const resolved = route
        ? cloneWalkingRoute(route, destination.id)
        : createStraightLineWalkingRoute(origin, destination, destination.id);
      const request = {
        id: destination.id,
        cacheKey: destination.cacheKey,
        origin,
        destination,
      } satisfies NearbyWalkingRouteRequest;
      persistWalkingRoute(request, resolved);
      fetchedRoutes.set(walkingRouteCacheKey(origin, destination, destination.cacheKey), resolved);
    }
    return destinations.map((destination, index) => cachedRoutes[index]
      ?? fetchedRoutes.get(walkingRouteCacheKey(origin, destination, destination.cacheKey))
      ?? fallbacks[index]!);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    return destinations.map((_, index) => cachedRoutes[index] ?? fallbacks[index]!);
  }
}

function isWalkingRoute(value: unknown): value is NearbyWalkingRoute & { id?: string } {
  if (!value || typeof value !== "object") return false;
  const route = value as Partial<NearbyWalkingRoute>;
  return (route.provider === "idfm-navitia" || route.provider === "openrouteservice" || route.provider === "straight-line")
    && Number.isFinite(route.distanceMeters)
    && Number.isFinite(route.durationSeconds)
    && Array.isArray(route.coordinates)
    && route.coordinates.length >= 2;
}
