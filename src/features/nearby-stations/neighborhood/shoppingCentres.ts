import type { NearbyJourney } from "../nearbyHeavyTransports";

/** A large commercial site identified from its OSM classification and scale evidence. */
export interface NearbyMajorShoppingCentre {
  id: string;
  name: string;
  lon: number;
  lat: number;
  distanceMeters: number;
  areaM2?: number;
}

export interface NeighborhoodShoppingCentreAccess extends NearbyMajorShoppingCentre {
  walking?: {
    durationSeconds: number;
    distanceMeters: number;
    fallback?: boolean;
  };
  journeys?: readonly NearbyJourney[];
  journeyLookupFailed?: boolean;
}

export const MAJOR_SHOPPING_CENTRE_ACCESS_RULES = {
  maximumWalkingMinutes: 15,
  maximumTransitMinutes: 20,
  maximumWalkingEstimateMinutes: 15,
  walkingMetersPerMinute: 80,
  scoreBonus: 0.6,
} as const;

export const MAJOR_SHOPPING_CENTRE_DETECTION_RULES = {
  minimumMallSurfaceM2: 10_000,
  minimumNearbyShopCount: 20,
  supportRadiusMeters: 700,
} as const;
