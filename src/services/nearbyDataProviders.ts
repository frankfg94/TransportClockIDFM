import type { PlacesProvider } from "../features/nearby-stations/nearbyPlaces";
import type { TravelRoutesProvider } from "../features/nearby-stations/nearbyHeavyTransports";
import { createCurrentPlacesProvider } from "./places/currentPlacesProvider";
import { createNavitiaTravelRoutesProvider } from "./travelRoutes/navitiaTravelRoutesProvider";

export interface NearbyDataProviders {
  places: PlacesProvider;
  travelRoutes: TravelRoutesProvider;
}

/**
 * Composition root for nearby discovery and travel APIs.
 * Replacing the current providers here is enough to wire Google Places or a
 * Google Routes adapter into the existing business workflows.
 */
export function createNearbyDataProviders(
  overrides: Partial<NearbyDataProviders> = {},
): NearbyDataProviders {
  return {
    places: overrides.places ?? createCurrentPlacesProvider(),
    travelRoutes: overrides.travelRoutes ?? createNavitiaTravelRoutesProvider(),
  };
}
