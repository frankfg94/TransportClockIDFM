import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import { createNearbyDataProviders } from "../../services/nearbyDataProviders";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import type { NearbyPlace, PlacesProvider } from "./nearbyPlaces";

export const NEARBY_PLACES_REFRESH_DEBOUNCE_MS = 2_500;

export function useNearbyPlaces(options: {
  origin: Ref<GeocoderPoint | undefined>;
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

  async function refresh(): Promise<void> {
    const token = ++requestToken;
    controller?.abort();
    controller = undefined;
    const origin = options.origin.value;
    if (!origin || !options.enabled.value) {
      places.value = [];
      isLoading.value = false;
      error.value = undefined;
      return;
    }

    controller = new AbortController();
    isLoading.value = true;
    error.value = undefined;
    try {
      const result = await placesProvider.searchNearby({
        origin,
        radiusMeters: options.radius.value,
      }, controller.signal);
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
    () => [options.origin.value?.lat, options.origin.value?.lon] as const,
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
