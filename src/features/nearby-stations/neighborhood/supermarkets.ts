export interface NearbySupermarketFootprint {
  placeId: string;
  surfaceM2: number;
}

/** Only verified OSM footprints are used; missing geometry never implies a size. */
export const MEDIUM_SUPERMARKET_ACCESS_RULES = {
  minimumSurfaceM2: 1_000,
  maximumWalkingMinutes: 10,
} as const;
