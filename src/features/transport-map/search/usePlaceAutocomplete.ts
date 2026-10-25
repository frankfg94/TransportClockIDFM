import { onBeforeUnmount, ref } from "vue";
import type { GeocoderPoint } from "../contracts/geocoder";
import { normalizeGlobalMapSearchText } from "./globalMapSearch";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../config/globalTransportPlanConfig";

import { createNearbyDataProviders } from "../../../services/nearbyDataProviders";

export function createPlaceAutocompleteSearch(): PlaceSearch {
  const { places } = createNearbyDataProviders();
  return (query, signal) => places.searchDestinations(query, { includeStations: true, includePlaces: true, includeAddresses: true, count: 8 }, signal);
}

export type PlaceSearch = (query: string, signal?: AbortSignal) => Promise<GeocoderPoint[]>;

/** Shared debouncing, bounded cache, validation and stale-response protection. */
export function usePlaceAutocomplete(getSearch: () => PlaceSearch | undefined) {
  const placeResults = ref<GeocoderPoint[]>([]);
  const placeSearchLoading = ref(false);
  const placeSearchError = ref(false);
  const placeSearchCache = new Map<string, GeocoderPoint[]>();
  const MAX_PLACE_SEARCH_CACHE_ENTRIES = 32;
  const MIN_PLACE_SEARCH_QUERY_LENGTH = 3;
  let placeSearchTimer: ReturnType<typeof setTimeout> | undefined;
  let placeSearchController: AbortController | undefined;
  let searchVersion = 0;
  function placeResultKey(place: GeocoderPoint): string {
    return place.id ?? `${place.label ?? "place"}:${place.lon}:${place.lat}`;
  }
  function cancelPlaceSearch(): void {
    if (placeSearchTimer !== undefined) clearTimeout(placeSearchTimer);
    placeSearchTimer = undefined;
    placeSearchController?.abort();
    placeSearchController = undefined;
    placeSearchLoading.value = false;
  }

  function cachePlaceResults(queryKey: string, places: GeocoderPoint[]): GeocoderPoint[] {
    const cached = [...places];
    placeSearchCache.delete(queryKey);
    placeSearchCache.set(queryKey, cached);
    while (placeSearchCache.size > MAX_PLACE_SEARCH_CACHE_ENTRIES) {
      const oldest = placeSearchCache.keys().next().value;
      if (oldest === undefined) break;
      placeSearchCache.delete(oldest);
    }
    return cached;
  }

  function filterPlaceResults(points: GeocoderPoint[]): GeocoderPoint[] {
    const seen = new Set<string>();
    return points
      .filter((point) => Number.isFinite(point.lon) && Number.isFinite(point.lat)
        && point.lon >= -180 && point.lon <= 180
        && point.lat >= -90 && point.lat <= 90)
      .filter((point) => {
        const key = placeResultKey(point);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }

  function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
  }

  async function runPlaceSearch(searchValue: string, queryKey: string, version: number): Promise<void> {
    const searchPlaces = getSearch();
    if (!searchPlaces || version !== searchVersion) return;

    const cached = placeSearchCache.get(queryKey);
    if (cached) {
      placeSearchCache.delete(queryKey);
      placeSearchCache.set(queryKey, cached);
      placeResults.value = cached;
      placeSearchError.value = false;
      placeSearchLoading.value = false;
      return;
    }

    const controller = new AbortController();
    placeSearchController = controller;
    placeSearchLoading.value = true;
    try {
      const points = await searchPlaces(searchValue, controller.signal);
      if (version !== searchVersion || controller.signal.aborted) return;
      placeResults.value = cachePlaceResults(queryKey, filterPlaceResults(points));
      placeSearchError.value = false;
    } catch (error) {
      if (version !== searchVersion || controller.signal.aborted || isAbortError(error)) return;
      placeResults.value = [];
      placeSearchError.value = true;
    } finally {
      if (version === searchVersion && placeSearchController === controller) {
        placeSearchController = undefined;
        placeSearchLoading.value = false;
      }
    }
  }


  function reset(): void {
    searchVersion += 1;
    cancelPlaceSearch();
    placeResults.value = [];
    placeSearchError.value = false;
  }
  function search(value: string): void {
    reset();
    const searchValue = value.trim();
    const queryKey = normalizeGlobalMapSearchText(searchValue);
    if (!getSearch() || queryKey.length < MIN_PLACE_SEARCH_QUERY_LENGTH) return;
    const version = searchVersion;
    const cached = placeSearchCache.get(queryKey);
    if (cached) {
      placeSearchCache.delete(queryKey);
      placeSearchCache.set(queryKey, cached);
      placeResults.value = cached;
      return;
    }
    placeSearchLoading.value = true;
    placeSearchTimer = setTimeout(() => {
      placeSearchTimer = undefined;
      void runPlaceSearch(searchValue, queryKey, version);
    }, GLOBAL_TRANSPORT_PLAN_CONFIG.search.debounceMs);
  }
  onBeforeUnmount(reset);
  return { results: placeResults, loading: placeSearchLoading, error: placeSearchError, search, reset };
}
