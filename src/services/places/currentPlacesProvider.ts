import { runNetworkTask } from "../networkScheduler";
import * as idfmClient from "../idfm";
import { toServerApiUrl } from "../serverApi";
import { createIgnTransportMapGeocoder } from "../geocoding/ign";
import {
  createCompiledPlacesProvider,
  type CompiledPlacesAccess,
} from "./compiledPlacesProvider";
import type { GeocoderPoint, TransportMapGeocoder } from "../../features/transport-map/contracts/geocoder";
import type {
  NearbyPlace,
  NearbyPlacesCitiesRequest,
  NearbyPlacesRequest,
  PlaceDestinationSearchOptions,
  PlacesProvider,
} from "../../features/nearby-stations/nearbyPlaces";

const DEFAULT_NEARBY_PATH = "/api/places/nearby";
const MIN_NEARBY_RADIUS_METERS = 100;
const MAX_NEARBY_RADIUS_METERS = 2_000;
const MAX_FALLBACK_CITY_ORIGINS = 24;

type NearbyPlacesApiResponse = { places?: unknown };

export interface CurrentPlacesProviderOptions {
  fetcher?: typeof fetch;
  geocoder?: TransportMapGeocoder;
  nearbyPath?: string;
  compiledBasePath?: string;
  compiledProvider?: Pick<PlacesProvider, "searchNearby" | "searchNearbyCities"> & Partial<CompiledPlacesAccess>;
  searchDestinationPoints?: typeof idfmClient.searchNavitiaDestinationPoints;
}

export type CurrentPlacesProvider = PlacesProvider & Partial<CompiledPlacesAccess>;

/**
 * Adapter for the current Navitia + IGN + same-origin nearby places stack.
 * The application only sees PlacesProvider, so another implementation can be
 * substituted without changing the nearby or travel business workflows.
 */
export function createCurrentPlacesProvider(
  options: CurrentPlacesProviderOptions = {},
): CurrentPlacesProvider {
  const fetcher = options.fetcher ?? fetch;
  const geocoder = options.geocoder ?? createIgnTransportMapGeocoder();
  const compiledProvider = options.compiledProvider ?? createCompiledPlacesProvider({
    fetcher,
    basePath: options.compiledBasePath,
  });
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
      try {
        return await compiledProvider.searchNearby(request, signal);
      } catch (error) {
        if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
        // The static artifact is authoritative when available. Only a missing
        // or invalid city asset may reach this legacy API path.
      }
      return searchNearbyFallback(request, signal);
    },

    async searchNearbyCities(request: NearbyPlacesCitiesRequest, signal?: AbortSignal): Promise<NearbyPlace[]> {
      if (compiledProvider.searchNearbyCities) {
        try {
          return await compiledProvider.searchNearbyCities(request, signal);
        } catch (error) {
          if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
        }
      }
      // The compiled provider receives every station so its static spatial
      // index can return every matching place. If that provider is absent or
      // invalid, keep the legacy HTTP fallback on representative origins
      // instead of turning one line into hundreds of rate-limited calls.
      const fallbackOrigins = representativeOrigins(request.origins, MAX_FALLBACK_CITY_ORIGINS);
      const settled = await Promise.allSettled(fallbackOrigins.map((origin) => searchNearbyFallback({
        origin,
        radiusMeters: request.radiusMeters,
      }, signal)));
      const failure = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failure && settled.every((result) => result.status === "rejected")) throw failure.reason;
      return settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    },

    ...(compiledProvider.loadPlacesManifest ? { loadPlacesManifest: compiledProvider.loadPlacesManifest } : {}),
    ...(compiledProvider.loadPlacesCity ? { loadPlacesCity: compiledProvider.loadPlacesCity } : {}),
    ...(compiledProvider.loadPlacesRanking ? { loadPlacesRanking: compiledProvider.loadPlacesRanking } : {}),
  };

  async function searchNearbyFallback(request: NearbyPlacesRequest, signal?: AbortSignal): Promise<NearbyPlace[]> {
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
    return runNetworkTask(async (requestSignal) => {
      const response = await fetcher(toServerApiUrl(`${path}?${params}`), {
        headers: { accept: "application/json" },
        signal: requestSignal,
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const payload = await response.json() as NearbyPlacesApiResponse;
      return Array.isArray(payload.places)
        ? payload.places.flatMap((place) => {
            const normalized = normalizeFallbackPlace(place);
            return normalized ? [normalized] : [];
          })
        : [];
    }, signal);
  }
}

function representativeOrigins<T>(origins: readonly T[], maximum: number): T[] {
  if (origins.length <= maximum) return [...origins];
  const selected = new Set<number>([0, origins.length - 1]);
  const step = (origins.length - 1) / (maximum - 1);
  for (let index = 0; index < maximum; index += 1) selected.add(Math.round(index * step));
  return [...selected].sort((left, right) => left - right).map((index) => origins[index]!);
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

type RawFallbackPlace = Omit<NearbyPlace, "name"> & {
  name?: unknown;
  label?: unknown;
  tags?: Record<string, string>;
};

function isNearbyPlace(value: unknown): value is RawFallbackPlace {
  if (!value || typeof value !== "object") return false;
  const place = value as Partial<RawFallbackPlace>;
  return typeof place.id === "string"
    && typeof place.lon === "number"
    && Number.isFinite(place.lon)
    && typeof place.lat === "number"
    && Number.isFinite(place.lat)
    && typeof place.category === "string"
    && typeof place.kind === "string"
    && typeof place.distanceMeters === "number"
    && Number.isFinite(place.distanceMeters);
}

function normalizeFallbackPlace(value: unknown): NearbyPlace | undefined {
  if (!isNearbyPlace(value)) return undefined;
  const place = value;
  const tags = place.tags ?? {};
  const name = [
    place.name,
    place.label,
    tags.name,
    place.brand,
    tags.brand,
    place.operator,
    tags.operator,
  ].find((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)?.trim() ?? "";
  return { ...place, name };
}
