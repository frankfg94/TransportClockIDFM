import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";
import { createNearbyDataProviders } from "../../services/nearbyDataProviders";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import { mergeNearbyPlaces, type NearbyPlace, type NearbyPlaceCityRef, type PlacesProvider } from "./nearbyPlaces";

export const NEARBY_PLACES_REFRESH_DEBOUNCE_MS = 2_500;

export function useNearbyPlaces(options: {
  origin?: Ref<GeocoderPoint | undefined>;
  /** Multiple anchors are useful for a line: one request per sampled station
   * is merged into the same provider-independent place collection. */
  origins?: Ref<readonly GeocoderPoint[]>;
  /** Optional unique communes served by a line. Providers can load one static
   * asset per commune instead of issuing one request per station. */
  cityRefs?: Ref<readonly NearbyPlaceCityRef[]>;
  radius: Ref<number>;
  enabled: Ref<boolean>;
  provider?: PlacesProvider;
}) {
  const places = ref<NearbyPlace[]>([]);
  const isLoading = ref(false);
  const error = ref<Error>();
  let controller: AbortController | undefined;
  let requestToken = 0;
  let refreshTimer: number | undefined;
  const placesProvider = options.provider ?? createNearbyDataProviders().places;
  const resolvedOrigins = computed<readonly GeocoderPoint[]>(() =>
    options.origins?.value
      ?? (options.origin?.value ? [options.origin.value] : []),
  );
  const resolvedCityRefs = computed<readonly NearbyPlaceCityRef[]>(() => options.cityRefs?.value ?? []);

  async function refresh(): Promise<void> {
    const token = ++requestToken;
    controller?.abort();
    controller = undefined;
    const origins = resolvedOrigins.value;
    if (origins.length === 0 || !options.enabled.value) {
      places.value = [];
      isLoading.value = false;
      error.value = undefined;
      return;
    }

    const requestController = new AbortController();
    controller = requestController;
    isLoading.value = true;
    error.value = undefined;
    try {
      const settled = placesProvider.searchNearbyCities && resolvedCityRefs.value.length > 0
        ? await Promise.allSettled([
          placesProvider.searchNearbyCities({
            cities: resolvedCityRefs.value,
            origins,
            radiusMeters: options.radius.value,
          }, requestController.signal),
        ])
        : await Promise.allSettled(origins.map((origin) =>
          placesProvider.searchNearby({
            origin,
            radiusMeters: options.radius.value,
          }, requestController.signal),
        ));
      const responses = settled.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      if (responses.length === 0) {
        const failure = settled.find(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        const cause = failure?.reason;
        if (cause instanceof Error && cause.name === "AbortError") return;
        if (token === requestToken) {
          places.value = [];
          error.value = cause instanceof Error ? cause : new Error("nearby-places-unavailable");
        }
        return;
      }
      const result = mergeNearbyPlaces(...responses);
      if (token === requestToken) places.value = result;
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      if (token === requestToken) {
        places.value = [];
        error.value = cause instanceof Error ? cause : new Error("nearby-places-unavailable");
      }
    } finally {
      if (token === requestToken) isLoading.value = false;
    }
  }

  function clearRefreshTimer(): void {
    if (refreshTimer !== undefined) {
      window.clearTimeout(refreshTimer);
      refreshTimer = undefined;
    }
  }

  function scheduleRefresh(): void {
    clearRefreshTimer();
    refreshTimer = window.setTimeout(() => {
      refreshTimer = undefined;
      void refresh();
    }, NEARBY_PLACES_REFRESH_DEBOUNCE_MS);
  }

  watch(
    () => resolvedOrigins.value
      .map((origin) => `${origin.lat}:${origin.lon}`)
      .concat(resolvedCityRefs.value.map((city) => `${city.code ?? ""}:${city.name ?? ""}:${city.lat ?? ""}:${city.lon ?? ""}`))
      .join("|"),
    () => {
      clearRefreshTimer();
      void refresh();
    },
    { immediate: true },
  );
  watch(
    () => [options.radius.value, options.enabled.value] as const,
    ([, enabled]) => {
      if (!enabled) {
        clearRefreshTimer();
        void refresh();
        return;
      }
      scheduleRefresh();
    },
  );
  onBeforeUnmount(() => {
    clearRefreshTimer();
    controller?.abort();
  });

  return { places, isLoading, error, refresh };
}
