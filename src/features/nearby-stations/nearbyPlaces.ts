import type {
  GeocoderPlaceCategory,
  GeocoderPlaceMetadata,
  GeocoderPoint,
} from "../transport-map/contracts/geocoder";

export type NearbyPlaceCategory = GeocoderPlaceCategory;

export interface PlaceDestinationSearchOptions {
  includeStations?: boolean;
  includePlaces?: boolean;
  /** Also query the street/address geocoder, even when POI results are enabled. */
  includeAddresses?: boolean;
  count?: number;
}

export interface NearbyPlacesRequest {
  origin: Pick<GeocoderPoint, "lon" | "lat">;
  radiusMeters: number;
}

export interface NearbyPlace extends GeocoderPlaceMetadata {
  id: string;
  name: string;
  /** Brand and operator are kept separately when the source exposes them. */
  brand?: string;
  operator?: string;
  lon: number;
  lat: number;
  category: NearbyPlaceCategory;
  kind: string;
  distanceMeters: number;
  address?: string;
  city?: string;
}

export interface NearbyPlacesResponse {
  provider?: string;
  places: NearbyPlace[];
}

/**
 * Stable application port for place discovery.
 *
 * Implementations may use Navitia, IGN, Overpass, Google Places, or another
 * provider, but the nearby and travel features only consume these normalized
 * application models.
 */
export interface PlacesProvider {
  searchDestinations(
    query: string,
    options?: PlaceDestinationSearchOptions,
    signal?: AbortSignal,
  ): Promise<GeocoderPoint[]>;
  searchNearby(request: NearbyPlacesRequest, signal?: AbortSignal): Promise<NearbyPlace[]>;
}
