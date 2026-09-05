/**
 * Boundary for geocoding and destination providers. The transport map
 * consumes normalized points, never a provider-specific response or
 * localStorage implementation.
 */
export type GeocoderPlaceCategory = "shop" | "food" | "culture" | "service" | "attraction";

export interface GeocoderPlaceMetadata {
  /** Provider-native POI kind, such as `museum`, `cafe`, or `supermarket`. */
  kind?: string;
  /** Broad category used when no translated provider-native kind is available. */
  category?: GeocoderPlaceCategory;
}

export interface GeocoderPoint extends GeocoderPlaceMetadata {
  id?: string;
  lon: number;
  lat: number;
  label?: string;
  /** Provider-normalized street/address display, when distinct from label. */
  address?: string;
  /** True only for an address-book suggestion selected as the primary address. */
  addressBookPrimary?: boolean;
  provider?: string;
  city?: string;
  postcode?: string;
  type?: "address" | "street" | "municipality" | "locality" | "station" | "place" | "unknown";
}

export interface TransportMapGeocoder {
  autocomplete?(query: string, signal?: AbortSignal): Promise<GeocoderPoint[]>;
  geocode(query: string, signal?: AbortSignal): Promise<GeocoderPoint[]>;
  reverseGeocode?(point: Pick<GeocoderPoint, "lon" | "lat">, signal?: AbortSignal): Promise<GeocoderPoint[]>;
}
