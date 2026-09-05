import type { NearbyPlace } from "../../../src/features/nearby-stations/nearbyPlaces";

export interface ServerNearbyPlacesRequest {
  lat: number;
  lon: number;
  radiusMeters: number;
}

/** Server-side port that keeps provider credentials and HTTP details private. */
export interface ServerNearbyPlacesProvider {
  readonly id: string;
  searchNearby(request: ServerNearbyPlacesRequest): Promise<NearbyPlace[]>;
}
