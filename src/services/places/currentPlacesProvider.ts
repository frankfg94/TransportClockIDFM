import * as idfmClient from "../idfm";
import { toServerApiUrl } from "../serverApi";
import { createIgnTransportMapGeocoder } from "../geocoding/ign";
import type { GeocoderPoint, TransportMapGeocoder } from "../../features/transport-map/contracts/geocoder";
import type {
  NearbyPlace,
  NearbyPlacesRequest,
  PlaceDestinationSearchOptions,
  PlacesProvider,
} from "../../features/nearby-stations/nearbyPlaces";

const DEFAULT_NEARBY_PATH = "/api/places/nearby";
const MIN_NEARBY_RADIUS_METERS = 100;
const MAX_NEARBY_RADIUS_METERS = 2_000;

type NearbyPlacesApiResponse = { places?: unknown };

export interface CurrentPlacesProviderOptions {
  fetcher?: typeof fetch;
  geocoder?: TransportMapGeocoder;
  nearbyPath?: string;
  searchDestinationPoints?: typeof idfmClient.searchNavitiaDestinationPoints;
}

/**
 * Adapter for the current Navitia + IGN + same-origin nearby places stack.
 * The application only sees PlacesProvider, so another implementation can be
 * substituted without changing the nearby or travel business workflows.
 */
export function createCurrentPlacesProvider(
  options: CurrentPlacesProviderOptions = {},
): PlacesProvider {
  const fetcher = options.fetcher ?? fetch;
  const geocoder = options.geocoder ?? createIgnTransportMapGeocoder();
  // Keep the composition root usable with legacy/partial consumers that only
  // mock the former IDFM client surface. The real application always exposes
  // the Navitia adapter, while an unavailable optional adapter simply leaves
  // the geocoder as the source for that search branch.
  const idfmModule = idfmClient as unknown as Record<string, unknown>;
  const defaultSearchDestinationPoints = Object.prototype.hasOwnProperty.call(
    idfmModule,
    "searchNavitiaDestinationPoints",
  )
    ? idfmModule.searchNavitiaDestinationPoints as typeof idfmClient.searchNavitiaDestinationPoints
    : undefined;
  const searchDestinationPoints = options.searchDestinationPoints
    ?? (typeof defaultSearchDestinationPoints === "function"
      ? defaultSearchDestinationPoints
      : async () => []);

  return {
    async searchDestinations(
      query: string,
      searchOptions: PlaceDestinationSearchOptions = {},
      signal?: AbortSignal,
    ): Promise<GeocoderPoint[]> {
      const searchStations = searchOptions.includeStations === true;
      const searchPlaces = searchOptions.includePlaces === true;
      const searchAddresses = searchOptions.includeAddresses === true;
      const requests: Promise<Awaited<ReturnType<PlacesProvider["searchDestinations"]>>>[] = [];

      if (searchStations || searchPlaces) {
        requests.push(searchDestinationPoints(
          query,
          {
            includeStations: searchStations,
            includePlaces: searchPlaces,
            ...(searchAddresses ? { includeAddresses: true } : {}),
            count: searchOptions.count,
          },
          { signal },
        ));
      }

      if (searchAddresses || searchPlaces || (!searchStations && !searchPlaces && !searchAddresses)) {
        const request = geocoder.autocomplete
          ? geocoder.autocomplete(query, signal)
          : geocoder.geocode(query, signal);
        requests.push(request);
      }

      const settled = await Promise.allSettled(requests);
      const results = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
      if (results.length === 0) {
        const failure = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
        if (failure) throw failure.reason;
      }

      return dedupeDestinationPoints(results);
    },

    async searchNearby(request: NearbyPlacesRequest, signal?: AbortSignal): Promise<NearbyPlace[]> {
      const radius = Math.max(
        MIN_NEARBY_RADIUS_METERS,
        Math.min(MAX_NEARBY_RADIUS_METERS, Math.round(request.radiusMeters)),
      );
      const params = new URLSearchParams({
        lat: String(request.origin.lat),
        lon: String(request.origin.lon),
        radius: String(radius),
      });
      const path = options.nearbyPath ?? DEFAULT_NEARBY_PATH;
      const response = await fetcher(toServerApiUrl(`${path}?${params}`), {
        headers: { accept: "application/json" },
        signal,
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const payload = await response.json() as NearbyPlacesApiResponse;
      return Array.isArray(payload.places) ? payload.places.filter(isNearbyPlace) : [];
    },
  };
}

function dedupeDestinationPoints(points: GeocoderPoint[]): GeocoderPoint[] {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = point.id ?? `${point.label ?? ""}:${point.lon}:${point.lat}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isNearbyPlace(value: unknown): value is NearbyPlace {
  if (!value || typeof value !== "object") return false;
  const place = value as Partial<NearbyPlace>;
  return typeof place.id === "string"
    && typeof place.name === "string"
    && typeof place.lon === "number"
    && Number.isFinite(place.lon)
    && typeof place.lat === "number"
    && Number.isFinite(place.lat)
    && typeof place.category === "string"
    && typeof place.kind === "string"
    && typeof place.distanceMeters === "number"
    && Number.isFinite(place.distanceMeters);
}
