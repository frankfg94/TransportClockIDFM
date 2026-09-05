import { onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import type { NearbyNoiseZonesResponse } from "./nearbyNoiseZones";
import { fetchNearbyNoiseZones } from "../../services/nearbyNoiseZones";

export type NearbyNoiseZonesStatus = "idle" | "loading" | "ready" | "error";

export function useNearbyNoiseZones(
  origin: MaybeRefOrGetter<{ lon: number; lat: number }>,
  enabled: MaybeRefOrGetter<boolean>,
  radiusMeters: MaybeRefOrGetter<number>,
) {
  const status = ref<NearbyNoiseZonesStatus>("idle");
  const response = ref<NearbyNoiseZonesResponse>();
  const error = ref<unknown>();
  const cache = new Map<string, NearbyNoiseZonesResponse>();
  let controller: AbortController | undefined;
  let requestToken = 0;

  function originKey(value: { lon: number; lat: number }): string {
    return `${value.lon.toFixed(5)},${value.lat.toFixed(5)}`;
  }

  function radiusKey(value: number): string {
    return String(Math.round(value));
  }

  function requestKey(value: { lon: number; lat: number }, radius: number): string {
    return `${originKey(value)}:${radiusKey(radius)}`;
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
    const currentRadius = toValue(radiusMeters);
    const key = requestKey(currentOrigin, currentRadius);
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
      const nextResponse = await fetchNearbyNoiseZones(currentOrigin, currentRadius, nextController.signal);
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
      () => requestKey(toValue(origin), toValue(radiusMeters)),
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
