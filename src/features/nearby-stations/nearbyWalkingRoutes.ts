import type { NearbyJourneyPoint } from "./nearbyHeavyTransports";

export type NearbyWalkingRouteProvider = "idfm-navitia" | "openrouteservice" | "straight-line";

export interface NearbyWalkingRoute {
  id?: string;
  provider: NearbyWalkingRouteProvider;
  distanceMeters: number;
  durationSeconds: number;
  coordinates: NearbyJourneyPoint[];
  fallback?: boolean;
}

export interface NearbyWalkingPlaceCacheIdentity {
  name: string;
  address?: string;
  city?: string;
  lon: number;
  lat: number;
}

export interface NearbyWalkingRouteRequest {
  origin: NearbyJourneyPoint;
  destination: NearbyJourneyPoint;
  id?: string;
  cacheKey?: string;
}

export interface NearbyWalkingMatrixDestination extends NearbyJourneyPoint {
  id: string;
  cacheKey?: string;
}

export interface NearbyWalkingMatrixRequest {
  origin: NearbyJourneyPoint;
  destinations: NearbyWalkingMatrixDestination[];
}

export function createStraightLineWalkingRoute(
  origin: NearbyJourneyPoint,
  destination: NearbyJourneyPoint,
  id?: string,
): NearbyWalkingRoute {
  const distanceMeters = haversineMeters(origin, destination);
  return {
    id,
    provider: "straight-line",
    distanceMeters: Math.round(distanceMeters),
    durationSeconds: Math.max(60, Math.ceil(distanceMeters / 80) * 60),
    coordinates: [origin, destination],
    fallback: true,
  };
}

export function haversineMeters(left: NearbyJourneyPoint, right: NearbyJourneyPoint): number {
  const toRadians = (value: number) => value * Math.PI / 180;
  const earthRadius = 6_371_000;
  const deltaLat = toRadians(right.lat - left.lat);
  const deltaLon = toRadians(right.lon - left.lon);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(left.lat)) * Math.cos(toRadians(right.lat)) * Math.sin(deltaLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Creates a stable, human-readable cache fragment for a place identity.
 * Accents and punctuation are removed so the same name/address is reusable
 * across providers and browser sessions.
 */
export function sanitizeNearbyWalkingCacheKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 160);
}

export function createNearbyWalkingPlaceCacheKey(place: NearbyWalkingPlaceCacheIdentity): string {
  const label = [place.name, place.address || place.city]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const sanitized = sanitizeNearbyWalkingCacheKey(label);
  if (sanitized) return sanitized;
  return `place-${place.lon.toFixed(5)}-${place.lat.toFixed(5)}`;
}
