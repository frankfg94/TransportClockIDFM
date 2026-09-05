import type { H3Event } from "h3";
import { getServerIdfmApiKey } from "../idfm/resolveStopArea";
import {
  fetchIdfmMarketplaceWithRetry,
  IDFM_MARKETPLACE_BASE_URL,
} from "../idfm/marketplaceClient";
import type { NearbyJourneyPoint } from "../../../src/features/nearby-stations/nearbyHeavyTransports";
import {
  createStraightLineWalkingRoute,
  haversineMeters,
  type NearbyWalkingMatrixDestination,
  type NearbyWalkingRoute,
} from "../../../src/features/nearby-stations/nearbyWalkingRoutes";
import {
  NEARBY_ISOCHRONES_NOT_CONFIGURED_CODE,
  normalizeNearbyIsochronePayload,
  type NearbyIsochronesResponse,
} from "../../../src/features/nearby-stations/nearbyIsochrones";
import {
  NEARBY_WALKING_MINUTES,
  walkingMinutesToSeconds,
} from "../../../src/features/nearby-stations/nearbyWalkingMinutes";

export const OPEN_ROUTE_SERVICE_DEFAULT_ROOT = "https://api.openrouteservice.org";
export const OPEN_ROUTE_SERVICE_PROFILE = "foot-walking";
export const OPEN_ROUTE_SERVICE_MAX_MATRIX_DESTINATIONS = 64;
const PREFERRED_MATRIX_CONCURRENCY = 6;

const REQUEST_TIMEOUT_MS = 12_000;
const ROUTE_CACHE_TTL_MS = 15 * 60_000;
const MATRIX_CACHE_TTL_MS = 5 * 60_000;
const ISOCHRONE_CACHE_TTL_MS = 15 * 60_000;
const MAX_CACHE_ENTRIES = 512;
const ROUTE_CACHE_GEOMETRY_VERSION = "v3";
const ISOCHRONE_CACHE_GEOMETRY_VERSION = "v1";
const NAVITIA_ARRIVAL_LOOKBACK_POINTS = 4;
const NAVITIA_ARRIVAL_MATCH_MAX_METERS = 100;

type RuntimeEnv = Record<string, string | undefined>;

type OpenRouteServiceConfig = {
  apiKey: string;
  root: string;
};

type DirectionsPayload = {
  features?: Array<{
    geometry?: { coordinates?: unknown };
    properties?: { summary?: { distance?: number; duration?: number } };
  }>;
};

type MatrixPayload = {
  durations?: Array<Array<number | null>>;
  distances?: Array<Array<number | null>>;
};

type CachedRoute = { expiresAt: number; route: NearbyWalkingRoute };
type CachedMatrix = { expiresAt: number; routes: NearbyWalkingRoute[] };
type CachedIsochrones = { expiresAt: number; response: NearbyIsochronesResponse };
const routeCache = new Map<string, CachedRoute>();
const matrixCache = new Map<string, CachedMatrix>();
const isochroneCache = new Map<string, CachedIsochrones>();

export function getOpenRouteServiceConfig(event: H3Event): OpenRouteServiceConfig {
  const cfEnv = ((event.context as { cloudflare?: { env?: RuntimeEnv } }).cloudflare?.env ?? {});
  const nodeEnv = ((globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } }).process?.env ?? {});

  return {
    apiKey: (
      cfEnv.NUXT_ORS_API_KEY
      ?? cfEnv.ORS_API_KEY
      ?? nodeEnv.NUXT_ORS_API_KEY
      ?? nodeEnv.ORS_API_KEY
      ?? ""
    ).trim(),
    root: (
      cfEnv.NUXT_ORS_API_URL
      ?? cfEnv.ORS_API_URL
      ?? nodeEnv.NUXT_ORS_API_URL
      ?? nodeEnv.ORS_API_URL
      ?? OPEN_ROUTE_SERVICE_DEFAULT_ROOT
    ).trim().replace(/\/+$/u, ""),
  };
}

export function isOpenRouteServiceConfigured(event: H3Event): boolean {
  return Boolean(getOpenRouteServiceConfig(event).apiKey);
}

/**
 * Prefer the street-network geometry already supplied by the IDFM/Navitia
 * journey service. ORS is only used when the PRIM route is unavailable or
 * does not contain usable walking geometry.
 */
export async function routeWalkingWithPreferredProvider(
  event: H3Event,
  origin: NearbyJourneyPoint,
  destination: NearbyJourneyPoint,
  id?: string,
): Promise<NearbyWalkingRoute> {
  const fallback = createStraightLineWalkingRoute(origin, destination, id);
  const cacheKey = routeCacheKey(origin, destination);
  const cached = routeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.route, id };

  const navitiaRoute = await routeWalkingWithNavitia(event, origin, destination, id);
  if (navitiaRoute) {
    saveCache(routeCache, cacheKey, navitiaRoute, ROUTE_CACHE_TTL_MS);
    return navitiaRoute;
  }

  return routeWalkingWithOpenRouteService(event, origin, destination, id) ?? fallback;
}

async function routeWalkingWithNavitia(
  event: H3Event,
  origin: NearbyJourneyPoint,
  destination: NearbyJourneyPoint,
  id?: string,
): Promise<NearbyWalkingRoute | undefined> {
  const apiKey = getServerIdfmApiKey(event);
  if (!apiKey) return undefined;

  const url = new URL(`${IDFM_MARKETPLACE_BASE_URL}/v2/navitia/journeys`);
  url.searchParams.set("count", "3");
  url.searchParams.set("data_freshness", "base_schedule");
  url.searchParams.set("disable_disruption", "true");
  url.searchParams.set("disable_geojson", "false");
  url.searchParams.set("direct_path", "only");
  url.searchParams.append("first_section_mode[]", "walking");
  url.searchParams.append("last_section_mode[]", "walking");
  url.searchParams.set("traveler_type", "standard");
  url.searchParams.set("from", `${origin.lon};${origin.lat}`);
  url.searchParams.set("to", `${destination.lon};${destination.lat}`);

  try {
    const response = await fetchIdfmMarketplaceWithRetry(url, {
      headers: { accept: "application/json", apikey: apiKey },
    });
    if (!response.ok) return undefined;
    const payload = await response.json() as { journeys?: RawNavitiaJourney[] };
    const journey = (payload.journeys ?? []).find(isWalkingOnlyJourney);
    if (!journey) return undefined;

    const sections = journey.sections ?? [];
    const providerCoordinates = joinCoordinates(sections.map((section) => normalizeRawSectionCoordinates(section)));
    if (providerCoordinates.length < 2) return undefined;
    // Navitia snaps the end of a walking section to its pedestrian network.
    // Keep the short off-network connector to the actual POI so the trace
    // reaches the same coordinate as the marker drawn by the map.
    const coordinates = connectRouteEndpoints(providerCoordinates, origin, destination);
    const distanceMeters = sections.reduce((sum, section) => sum + positiveNumber(section.length), 0)
      || pathDistanceMeters(coordinates);
    const durationSeconds = Number(journey.duration) > 0
      ? Number(journey.duration)
      : sections.reduce((sum, section) => sum + positiveNumber(section.duration), 0);
    if (!(distanceMeters > 0) || !(durationSeconds > 0)) return undefined;

    return {
      id,
      provider: "idfm-navitia",
      distanceMeters,
      durationSeconds,
      coordinates,
    };
  } catch {
    return undefined;
  }
}

export async function routeWalkingWithOpenRouteService(
  event: H3Event,
  origin: NearbyJourneyPoint,
  destination: NearbyJourneyPoint,
  id?: string,
): Promise<NearbyWalkingRoute> {
  const fallback = createStraightLineWalkingRoute(origin, destination, id);
  const config = getOpenRouteServiceConfig(event);
  if (!config.apiKey) return fallback;

  const cacheKey = routeCacheKey(origin, destination);
  const cached = routeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.route, id };

  try {
    const response = await fetchWithTimeout(`${config.root}/v2/directions/${OPEN_ROUTE_SERVICE_PROFILE}/geojson`, {
      method: "POST",
      headers: {
        accept: "application/geo+json, application/json",
        authorization: config.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        coordinates: [[origin.lon, origin.lat], [destination.lon, destination.lat]],
        instructions: false,
      }),
    });
    if (!response.ok) throw new Error(`openrouteservice-directions-${response.status}`);
    const payload = await response.json() as DirectionsPayload;
    const feature = payload.features?.[0];
    const summary = feature?.properties?.summary;
    const providerCoordinates = normalizeCoordinates(feature?.geometry?.coordinates);
    if (!summary || !providerCoordinates || !isPositiveNumber(summary.distance) || !isPositiveNumber(summary.duration)) {
      throw new Error("openrouteservice-directions-invalid");
    }
    const coordinates = connectRouteEndpoints(providerCoordinates, origin, destination);
    const route: NearbyWalkingRoute = {
      id,
      provider: "openrouteservice",
      distanceMeters: summary.distance,
      durationSeconds: summary.duration,
      coordinates,
    };
    saveCache(routeCache, cacheKey, route, ROUTE_CACHE_TTL_MS);
    return route;
  } catch {
    return fallback;
  }
}

export async function matrixWalkingWithOpenRouteService(
  event: H3Event,
  origin: NearbyJourneyPoint,
  destinations: readonly NearbyWalkingMatrixDestination[],
): Promise<NearbyWalkingRoute[]> {
  const limitedDestinations = destinations.slice(0, OPEN_ROUTE_SERVICE_MAX_MATRIX_DESTINATIONS);
  const fallbacks = limitedDestinations.map((destination) => createStraightLineWalkingRoute(origin, destination, destination.id));
  const config = getOpenRouteServiceConfig(event);
  if (!config.apiKey || limitedDestinations.length === 0) return fallbacks;

  const cacheKey = matrixCacheKey(origin, limitedDestinations);
  const cached = matrixCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const routesById = new Map(cached.routes.map((route) => [route.id, route]));
    return limitedDestinations.map((destination) => routesById.get(destination.id) ?? createStraightLineWalkingRoute(origin, destination, destination.id));
  }

  try {
    const response = await fetchWithTimeout(`${config.root}/v2/matrix/${OPEN_ROUTE_SERVICE_PROFILE}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: config.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        locations: [[origin.lon, origin.lat], ...limitedDestinations.map((destination) => [destination.lon, destination.lat])],
        sources: ["0"],
        destinations: limitedDestinations.map((_, index) => String(index + 1)),
        metrics: ["distance", "duration"],
        units: "m",
      }),
    });
    if (!response.ok) throw new Error(`openrouteservice-matrix-${response.status}`);
    const payload = await response.json() as MatrixPayload;
    const durations = payload.durations?.[0];
    const distances = payload.distances?.[0];
    if (!durations || !distances || durations.length < limitedDestinations.length || distances.length < limitedDestinations.length) {
      throw new Error("openrouteservice-matrix-invalid");
    }
    const routes = limitedDestinations.map((destination, index) => {
      const distanceMeters = distances[index];
      const durationSeconds = durations[index];
      if (!isPositiveNumber(distanceMeters) || !isPositiveNumber(durationSeconds)) {
        return fallbacks[index]!;
      }
      return {
        id: destination.id,
        provider: "openrouteservice" as const,
        distanceMeters,
        durationSeconds,
        coordinates: [origin, destination],
      } satisfies NearbyWalkingRoute;
    });
    saveMatrixCache(matrixCache, cacheKey, routes, MATRIX_CACHE_TTL_MS);
    return routes;
  } catch {
    return fallbacks;
  }
}

/**
 * Fetch the complete set of walking-time contours in one ORS request. Unlike
 * the route helpers above, this feature is intentionally strict: an invalid or
 * unavailable isochrone response must be surfaced to the UI rather than
 * replaced with a misleading straight-line approximation.
 */
export async function getNearbyIsochronesWithOpenRouteService(
  event: H3Event,
  origin: { lon: number; lat: number },
): Promise<NearbyIsochronesResponse> {
  const config = getOpenRouteServiceConfig(event);
  if (!config.apiKey) throw new Error(NEARBY_ISOCHRONES_NOT_CONFIGURED_CODE);

  const cacheKey = isochroneCacheKey(origin);
  const cached = isochroneCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.response;

  const response = await fetchWithTimeout(`${config.root}/v2/isochrones/${OPEN_ROUTE_SERVICE_PROFILE}`, {
    method: "POST",
    headers: {
      accept: "application/geo+json, application/json",
      authorization: config.apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      locations: [[origin.lon, origin.lat]],
      range_type: "time",
      range: NEARBY_WALKING_MINUTES.map(walkingMinutesToSeconds),
      location_type: "start",
      smoothing: 0.25,
    }),
  });
  if (!response.ok) throw new Error(`openrouteservice-isochrones-${response.status}`);

  const payload = await response.json() as unknown;
  const normalized = normalizeNearbyIsochronePayload(payload, origin);
  if (!normalized) throw new Error("openrouteservice-isochrones-invalid");

  isochroneCache.set(cacheKey, {
    expiresAt: Date.now() + ISOCHRONE_CACHE_TTL_MS,
    response: normalized,
  });
  while (isochroneCache.size > MAX_CACHE_ENTRIES) {
    isochroneCache.delete(isochroneCache.keys().next().value as string);
  }
  return normalized;
}

/**
 * Use the same detailed provider chain as an explicitly selected place when
 * IDFM is available. ORS Matrix remains the efficient batch path when PRIM is
 * not configured; every route still ends in the straight-line fallback.
 */
export async function matrixWalkingWithPreferredProvider(
  event: H3Event,
  origin: NearbyJourneyPoint,
  destinations: readonly NearbyWalkingMatrixDestination[],
): Promise<NearbyWalkingRoute[]> {
  const limitedDestinations = destinations.slice(0, OPEN_ROUTE_SERVICE_MAX_MATRIX_DESTINATIONS);
  if (!getServerIdfmApiKey(event) || limitedDestinations.length === 0) {
    return matrixWalkingWithOpenRouteService(event, origin, limitedDestinations);
  }

  const routes: NearbyWalkingRoute[] = [];
  for (let index = 0; index < limitedDestinations.length; index += PREFERRED_MATRIX_CONCURRENCY) {
    const batch = limitedDestinations.slice(index, index + PREFERRED_MATRIX_CONCURRENCY);
    routes.push(...await Promise.all(batch.map((destination) => routeWalkingWithPreferredProvider(
      event,
      origin,
      destination,
      destination.id,
    ))));
  }
  return routes;
}

export async function fetchOpenRouteServiceHealth(event: H3Event): Promise<Response | undefined> {
  const config = getOpenRouteServiceConfig(event);
  if (!config.apiKey) return undefined;
  return fetchWithTimeout(`${config.root}/v2/matrix/${OPEN_ROUTE_SERVICE_PROFILE}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: config.apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      locations: [[2.333974, 48.829464], [2.3348, 48.8298]],
      sources: ["0"],
      destinations: ["1"],
      metrics: ["duration"],
    }),
  });
}

function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

function normalizeCoordinates(value: unknown): NearbyJourneyPoint[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const coordinates = value.flatMap((entry): NearbyJourneyPoint[] => {
    if (!Array.isArray(entry) || entry.length < 2) return [];
    const lon = Number(entry[0]);
    const lat = Number(entry[1]);
    return Number.isFinite(lon) && Number.isFinite(lat) ? [{ lon, lat }] : [];
  });
  return coordinates.length >= 2 ? coordinates : undefined;
}

type RawNavitiaJourney = {
  duration?: number;
  sections?: RawNavitiaSection[];
};

type RawNavitiaSection = {
  type?: string;
  mode?: string;
  duration?: number;
  length?: number;
  from?: { coord?: { lon?: string | number; lat?: string | number } };
  to?: { coord?: { lon?: string | number; lat?: string | number } };
  geojson?: { coordinates?: unknown; geometry?: { coordinates?: unknown } };
  path?: unknown[];
};

function isWalkingOnlyJourney(journey: RawNavitiaJourney): boolean {
  const sections = journey.sections ?? [];
  return sections.length > 0 && sections.every((section) => {
    const type = (section.type ?? "").toLocaleLowerCase("en-US");
    const mode = (section.mode ?? "").toLocaleLowerCase("en-US");
    return type.includes("street_network")
      || type.includes("walking")
      || type.includes("transfer")
      || type === "non_pt_walk"
      || mode === "walking"
      || mode === "pedestrian";
  });
}

function normalizeRawSectionCoordinates(section: RawNavitiaSection): NearbyJourneyPoint[] {
  const candidates = [section.geojson?.coordinates, section.geojson?.geometry?.coordinates, section.path];
  for (const candidate of candidates) {
    const coordinates = extractPointCoordinates(candidate);
    if (coordinates.length >= 2) {
      return trimNavitiaGeometryAfterArrival(coordinates, extractNavitiaArrivalPoint(section.path));
    }
  }
  // Endpoints alone are not a walking trace: accepting them here would make
  // a PRIM journey look precise while drawing a straight line. Let the
  // preferred-provider chain try ORS (then the explicit straight-line
  // fallback) when Navitia did not return street-network geometry.
  return [];
}

function extractNavitiaArrivalPoint(path: unknown): NearbyJourneyPoint | undefined {
  if (!Array.isArray(path)) return undefined;

  const arrivalStep = [...path].reverse().find((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const step = entry as Record<string, unknown>;
    const instruction = typeof step.instruction === "string" ? step.instruction : "";
    const length = Number(step.length);
    const duration = Number(step.duration);
    return (length === 0 && duration === 0) || /arriv|destination/iu.test(instruction);
  });
  if (!arrivalStep || typeof arrivalStep !== "object") return undefined;

  const step = arrivalStep as Record<string, unknown>;
  return extractPointCoordinates(step.instruction_start_coordinate)[0]
    ?? extractPointCoordinates(step.coord)[0]
    ?? extractPointCoordinates(step.coordinates)[0];
}

function trimNavitiaGeometryAfterArrival(
  coordinates: NearbyJourneyPoint[],
  arrival: NearbyJourneyPoint | undefined,
): NearbyJourneyPoint[] {
  if (!arrival || coordinates.length < 2) return coordinates;

  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  coordinates.forEach((point, index) => {
    const distance = haversineMeters(point, arrival);
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  });

  const lastIndex = coordinates.length - 1;
  if (
    nearestIndex < Math.max(0, lastIndex - NAVITIA_ARRIVAL_LOOKBACK_POINTS)
    || nearestDistance > NAVITIA_ARRIVAL_MATCH_MAX_METERS
  ) {
    return coordinates;
  }

  const trimmed = coordinates.slice(0, nearestIndex + 1);
  const last = trimmed.at(-1);
  if (!last || !sameCoordinate(last, arrival)) trimmed.push(arrival);
  return trimmed;
}

function sameCoordinate(left: NearbyJourneyPoint, right: NearbyJourneyPoint): boolean {
  return Math.abs(left.lon - right.lon) < 1e-7 && Math.abs(left.lat - right.lat) < 1e-7;
}

function extractPointCoordinates(value: unknown): NearbyJourneyPoint[] {
  if (Array.isArray(value)) {
    const lon = Number(value[0]);
    const lat = Number(value[1]);
    if (Number.isFinite(lon) && Number.isFinite(lat) && typeof value[0] !== "object" && typeof value[1] !== "object") {
      return [{ lon, lat }];
    }
    return value.flatMap((entry) => extractPointCoordinates(entry));
  }
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const lon = Number(record.lon ?? record.longitude);
  const lat = Number(record.lat ?? record.latitude);
  if (Number.isFinite(lon) && Number.isFinite(lat)) return [{ lon, lat }];
  if (record.coord) return extractPointCoordinates(record.coord);
  if (record.coordinates) return extractPointCoordinates(record.coordinates);
  return [];
}

function joinCoordinates(parts: NearbyJourneyPoint[][]): NearbyJourneyPoint[] {
  return parts.reduce<NearbyJourneyPoint[]>((result, part) => {
    for (const point of part) {
      const previous = result.at(-1);
      if (!previous || previous.lon !== point.lon || previous.lat !== point.lat) result.push(point);
    }
    return result;
  }, []);
}

function connectRouteEndpoints(
  coordinates: NearbyJourneyPoint[],
  origin: NearbyJourneyPoint,
  destination: NearbyJourneyPoint,
): NearbyJourneyPoint[] {
  const connected = [...coordinates];
  const first = connected[0];
  if (!first || first.lon !== origin.lon || first.lat !== origin.lat) {
    connected.unshift({ ...origin });
  }
  const last = connected.at(-1);
  if (!last || last.lon !== destination.lon || last.lat !== destination.lat) {
    connected.push({ ...destination });
  }
  return connected;
}

function pathDistanceMeters(points: readonly NearbyJourneyPoint[]): number {
  return points.slice(1).reduce((sum, point, index) => sum + haversineMeters(points[index]!, point), 0);
}

function positiveNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function routeCacheKey(origin: NearbyJourneyPoint, destination: NearbyJourneyPoint): string {
  return `${ROUTE_CACHE_GEOMETRY_VERSION}:${origin.lon.toFixed(5)},${origin.lat.toFixed(5)}>${destination.lon.toFixed(5)},${destination.lat.toFixed(5)}`;
}

function matrixCacheKey(origin: NearbyJourneyPoint, destinations: readonly NearbyWalkingMatrixDestination[]): string {
  return `${origin.lon.toFixed(5)},${origin.lat.toFixed(5)}>${destinations.map((destination) => `${destination.lon.toFixed(5)},${destination.lat.toFixed(5)}`).join(";")}`;
}

function isochroneCacheKey(origin: { lon: number; lat: number }): string {
  return `${ISOCHRONE_CACHE_GEOMETRY_VERSION}:${origin.lon.toFixed(5)},${origin.lat.toFixed(5)}`;
}

function saveCache(cache: Map<string, CachedRoute>, key: string, route: NearbyWalkingRoute, ttlMs: number): void {
  cache.set(key, { expiresAt: Date.now() + ttlMs, route });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
}

function saveMatrixCache(cache: Map<string, CachedMatrix>, key: string, routes: NearbyWalkingRoute[], ttlMs: number): void {
  cache.set(key, { expiresAt: Date.now() + ttlMs, routes });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
}
