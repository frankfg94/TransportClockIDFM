export type NearbyWalkingMinutes = 5 | 10 | 15;

/**
 * Walking thresholds shared by the nearby directory and map isochrones.
 * Keep this tuple ordered from the closest to the furthest threshold.
 */
export const NEARBY_WALKING_MINUTES = [5, 10, 15] as const satisfies readonly NearbyWalkingMinutes[];

export function walkingMinutesToSeconds(minutes: NearbyWalkingMinutes): number {
  return minutes * 60;
}
