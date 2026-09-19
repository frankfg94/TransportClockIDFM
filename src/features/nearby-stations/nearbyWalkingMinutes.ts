import {
  GLOBAL_ISOCHRONE_MINUTES,
  type GlobalIsochroneMinutes,
} from "../transport-map/isochrones/contracts";

export type NearbyWalkingMinutes = GlobalIsochroneMinutes;

/**
 * Walking thresholds shared by the nearby directory and map isochrones.
 * Keep this tuple ordered from the closest to the furthest threshold.
 */
export const NEARBY_WALKING_MINUTES = [5, 10, 15] as const satisfies readonly NearbyWalkingMinutes[];

/**
 * All thresholds available in the prepared archive and in the ORS fallback.
 * The shorter tuple above remains the legacy/default nearby request so older
 * callers and older archives continue to work without a migration.
 */
export const NEARBY_ISOCHRONE_MINUTES = GLOBAL_ISOCHRONE_MINUTES satisfies readonly NearbyWalkingMinutes[];

export function normalizeNearbyWalkingMinutes(
  value: readonly NearbyWalkingMinutes[] | undefined,
  fallback: readonly NearbyWalkingMinutes[] = NEARBY_WALKING_MINUTES,
): NearbyWalkingMinutes[] {
  const candidates = value?.length ? value : fallback;
  const unique = new Set<NearbyWalkingMinutes>();
  for (const minutes of candidates) {
    if (NEARBY_ISOCHRONE_MINUTES.includes(minutes) && Number.isInteger(minutes)) unique.add(minutes);
  }
  const normalized = NEARBY_ISOCHRONE_MINUTES.filter((minutes) => unique.has(minutes));
  return normalized.length > 0 ? [...normalized] : [...fallback];
}

export function walkingMinutesToSeconds(minutes: NearbyWalkingMinutes): number {
  return minutes * 60;
}
