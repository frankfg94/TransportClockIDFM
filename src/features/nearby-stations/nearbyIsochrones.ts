import {
  normalizeNearbyWalkingMinutes,
  NEARBY_WALKING_MINUTES,
  walkingMinutesToSeconds,
  type NearbyWalkingMinutes,
} from "./nearbyWalkingMinutes";
import { isGlobalIsochroneMinutes } from "../transport-map/isochrones/contracts";
import { normalizeWalkingIsochroneGeometry } from "../../shared/walkingIsochroneGeometry";
import type { WalkingIsochroneGeometry } from "../../shared/walkingIsochroneGeometry";

/** Stable server/client error code for a missing OpenRouteService key. */
export const NEARBY_ISOCHRONES_NOT_CONFIGURED_CODE = "openrouteservice-isochrones-not-configured" as const;

export type NearbyIsochronePosition = readonly [number, number];
export type NearbyIsochroneRing = readonly NearbyIsochronePosition[];
export type NearbyIsochronePolygonCoordinates = readonly NearbyIsochroneRing[];
export type NearbyIsochroneMultiPolygonCoordinates = readonly NearbyIsochronePolygonCoordinates[];

export type NearbyIsochroneGeometry = WalkingIsochroneGeometry;

export interface NearbyIsochroneZone {
  minutes: NearbyWalkingMinutes;
  geometry: NearbyIsochroneGeometry;
}

export interface NearbyIsochronesResponse {
  origin: { lon: number; lat: number };
  zones: readonly NearbyIsochroneZone[];
}

/**
 * Convert and validate the GeoJSON FeatureCollection returned by ORS into the
 * small contract consumed by the nearby map. ORS identifies each contour by
 * its range in seconds, so the shared minute tuple remains the only threshold
 * source for both the request and the response mapping.
 */
export function normalizeNearbyIsochronePayload(
  value: unknown,
  origin: { lon: number; lat: number },
  requestedMinutes: readonly NearbyWalkingMinutes[] = NEARBY_WALKING_MINUTES,
): NearbyIsochronesResponse | undefined {
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
    return undefined;
  }

  const minutes = normalizeNearbyWalkingMinutes(requestedMinutes);
  const zones = new Map<NearbyWalkingMinutes, NearbyIsochroneZone>();
  for (const feature of value.features) {
    if (!isRecord(feature) || !isRecord(feature.geometry) || !isRecord(feature.properties)) {
      return undefined;
    }

    const geometry = normalizeWalkingIsochroneGeometry(feature.geometry);
    const seconds = Number(feature.properties.value ?? feature.properties.range);
    const zoneMinutes = minutes.find((candidate) =>
      Number.isFinite(seconds) && Math.abs(seconds - walkingMinutesToSeconds(candidate)) < 1,
    );
    if (!geometry || zoneMinutes === undefined || zones.has(zoneMinutes)) return undefined;
    zones.set(zoneMinutes, { minutes: zoneMinutes, geometry });
  }

  if (zones.size !== minutes.length) return undefined;
  return {
    origin: { lon: origin.lon, lat: origin.lat },
    zones: minutes.map((minutes) => zones.get(minutes)!),
  };
}

export function isNearbyIsochronesResponse(
  value: unknown,
  requestedMinutes: readonly NearbyWalkingMinutes[] = NEARBY_WALKING_MINUTES,
): value is NearbyIsochronesResponse {
  if (!isRecord(value) || !isValidCoordinatePair(value.origin)) return false;
  const minutes = normalizeNearbyWalkingMinutes(requestedMinutes);
  // A prepared archive or a legacy proxy may return a superset of the
  // requested contours. Keep accepting it and let the consumer select its
  // configured threshold; missing requested contours remain invalid.
  if (!Array.isArray(value.zones) || value.zones.length < minutes.length) return false;

  const seen = new Set<number>();
  for (const zone of value.zones) {
    if (!isRecord(zone) || !isNearbyWalkingMinutes(zone.minutes) || seen.has(zone.minutes)) return false;
    if (!normalizeWalkingIsochroneGeometry(zone.geometry)) return false;
    seen.add(zone.minutes);
  }
  return minutes.every((minutes) => seen.has(minutes));
}

function isValidCoordinatePair(value: unknown): value is { lon: number; lat: number } {
  if (!isRecord(value)) return false;
  const lon = Number(value.lon);
  const lat = Number(value.lat);
  return Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
}

function isNearbyWalkingMinutes(value: unknown): value is NearbyWalkingMinutes {
  return isGlobalIsochroneMinutes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
