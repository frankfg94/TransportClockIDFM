export interface NearbySupermarketFootprint {
  placeId: string;
  surfaceM2: number;
}

/** Access threshold for medium-size supermarkets; brand assumptions live in supermarketSizeAssumptions.ts. */
export const MEDIUM_SUPERMARKET_ACCESS_RULES = {
  minimumSurfaceM2: 1_000,
  maximumWalkingMinutes: 10,
} as const;
