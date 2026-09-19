import { onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import type { NearbyIsochronesResponse } from "./nearbyIsochrones";
import { fetchNearbyIsochrones } from "../../services/nearbyIsochrones";
import {
  normalizeNearbyWalkingMinutes,
  NEARBY_WALKING_MINUTES,
  type NearbyWalkingMinutes,
} from "./nearbyWalkingMinutes";

export type NearbyIsochronesStatus = "idle" | "loading" | "ready" | "error";

export function useNearbyIsochrones(
  origin: MaybeRefOrGetter<{ lon: number; lat: number }>,
  enabled: MaybeRefOrGetter<boolean>,
  minutes: MaybeRefOrGetter<readonly NearbyWalkingMinutes[]> = () => NEARBY_WALKING_MINUTES,
) {
  const status = ref<NearbyIsochronesStatus>("idle");
  const response = ref<NearbyIsochronesResponse>();
  const error = ref<unknown>();
  const cache = new Map<string, NearbyIsochronesResponse>();
  let controller: AbortController | undefined;
  let requestToken = 0;

  function originKey(value: { lon: number; lat: number }): string {
    return `${value.lon.toFixed(5)},${value.lat.toFixed(5)}`;
  }

  function requestKey(value: { lon: number; lat: number }, requestedMinutes: readonly NearbyWalkingMinutes[]): string {
    return `${originKey(value)}|${normalizeNearbyWalkingMinutes(requestedMinutes).join(",")}`;
  }

  function cancelRequest(): void {
    controller?.abort();
    controller = undefined;
  }

  function disable(): void {
    cancelRequest();
    requestToken += 1;
    response.value = undefined;
    error.value = undefined;
    status.value = "idle";
  }

  async function load(force = false): Promise<void> {
    if (!toValue(enabled)) {
      disable();
      return;
    }

    const currentOrigin = toValue(origin);
    const currentMinutes = normalizeNearbyWalkingMinutes(toValue(minutes));
    const key = requestKey(currentOrigin, currentMinutes);
    if (!force) {
      const cached = cache.get(key);
      if (cached) {
        response.value = cached;
        error.value = undefined;
        status.value = "ready";
        return;
      }
    }

    cancelRequest();
    const currentToken = ++requestToken;
    const nextController = new AbortController();
    controller = nextController;
    response.value = undefined;
    error.value = undefined;
    status.value = "loading";

    try {
      const nextResponse = await fetchNearbyIsochrones(currentOrigin, nextController.signal, currentMinutes);
      if (currentToken !== requestToken || !toValue(enabled)) return;
      cache.set(key, nextResponse);
      response.value = nextResponse;
      status.value = "ready";
    } catch (nextError) {
      if (currentToken !== requestToken) return;
      if (nextError instanceof Error && nextError.name === "AbortError") return;
      response.value = undefined;
      error.value = nextError;
      status.value = "error";
    } finally {
      if (currentToken === requestToken) controller = undefined;
    }
  }

  watch(
    [
      () => toValue(enabled),
      () => originKey(toValue(origin)),
      () => normalizeNearbyWalkingMinutes(toValue(minutes)).join(","),
    ],
    ([isEnabled]) => {
      if (!isEnabled) {
        disable();
        return;
      }
      void load();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    cancelRequest();
    requestToken += 1;
    cache.clear();
  });

  return {
    status,
    response,
    error,
    load,
    retry: () => load(true),
  };
}
