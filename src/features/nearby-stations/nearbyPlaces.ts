import type {
  GeocoderPlaceCategory,
  GeocoderPlaceMetadata,
  GeocoderPoint,
} from "../transport-map/contracts/geocoder";
import type {
  CompiledPlaceGenericNameKey,
  CompiledPlaceRecord,
  PlacesRankingCategory,
} from "../../services/places/compiledPlaces";

export type NearbyPlaceCategory = GeocoderPlaceCategory;

export type NearbyPlaceGenericNameKey = CompiledPlaceGenericNameKey;

export interface PlaceDestinationSearchOptions {
  includeStations?: boolean;
  includePlaces?: boolean;
  /** Also query the street/address geocoder, even when POI results are enabled. */
  includeAddresses?: boolean;
  count?: number;
}

export interface NearbyPlacesRequest {
  origin: Pick<GeocoderPoint, "lon" | "lat"> & {
    /** Optional geocoder commune hints used by the compiled city resolver. */
    city?: string;
    code?: string;
  };
  radiusMeters: number;
}

export interface NearbyPlaceCityRef {
  code?: string;
  name?: string;
  lat?: number;
  lon?: number;
}

export interface NearbyPlacesCitiesRequest {
  cities: readonly NearbyPlaceCityRef[];
  origins: readonly Pick<GeocoderPoint, "lon" | "lat">[];
  radiusMeters: number;
}

export type NearbyPlace = CompiledPlaceRecord & GeocoderPlaceMetadata & {
  distanceMeters: number;
};

/**
 * Merge normalized place collections while keeping one canonical record per
 * OSM id. The same helper is used by provider responses and the city overlay
 * so a place found in the neighborhood view cannot disappear in city view.
 */
export function mergeNearbyPlaces(...collections: readonly (readonly NearbyPlace[])[]): NearbyPlace[] {
  const byId = new Map<string, NearbyPlace>();
  for (const collection of collections) {
    for (const place of collection) {
      const key = place.id || `${place.name}:${place.lon}:${place.lat}`;
      const previous = byId.get(key);
      if (!previous || place.distanceMeters < previous.distanceMeters) byId.set(key, place);
    }
  }
  return [...byId.values()].sort(
    (left, right) => left.distanceMeters - right.distanceMeters || left.name.localeCompare(right.name, "fr-FR"),
  );
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
  /** Optional batch path used by line views to load each served city once. */
  searchNearbyCities?(
    request: NearbyPlacesCitiesRequest,
    signal?: AbortSignal,
  ): Promise<NearbyPlace[]>;
}

export type { CompiledPlaceRecord, PlacesRankingCategory };
