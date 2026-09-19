import { onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import type { NearbyIsochronesResponse } from "./nearbyIsochrones";
import { fetchNearbyIsochrones } from "../../services/nearbyIsochrones";
import {
  normalizeNearbyWalkingMinutes,
  NEARBY_WALKING_MINUTES,
  type NearbyWalkingMinutes,
} from "./nearbyWalkingMinutes";

export type NearbyStationIsochronesStatus = "idle" | "loading" | "ready" | "error";

export interface NearbyStationIsochroneOrigin {
  id: string;
  lon: number;
  lat: number;
}

export interface NearbyStationIsochroneResponse {
  stationId: string;
  origin: { lon: number; lat: number };
  response: NearbyIsochronesResponse;
}

// ORS can transiently reject a burst of city-station requests. Keep the
// client-side fan-out deliberately small and retry an individual station so a
// selected line (notably a Noctilien line with many stops) does not lose its
// southern or peripheral contours just because requests overlapped.
const MAX_CONCURRENT_REQUESTS = 2;
const MAX_ATTEMPTS_PER_ORIGIN = 3;
const RETRY_DELAY_MS = 250;

/**
 * Load walking contours around the stations currently visible in the city
 * view. Successful responses are cached by coordinate so camera/mode changes
 * do not refetch the same station, while newly visible stations can be added
 * incrementally to the existing result.
 */
export function useNearbyStationIsochrones(
  origins: MaybeRefOrGetter<readonly NearbyStationIsochroneOrigin[]>,
  enabled: MaybeRefOrGetter<boolean>,
  minutes: MaybeRefOrGetter<readonly NearbyWalkingMinutes[]> = () => NEARBY_WALKING_MINUTES,
) {
  const status = ref<NearbyStationIsochronesStatus>("idle");
  const responses = ref<NearbyStationIsochroneResponse[]>([]);
  const error = ref<unknown>();
  const cache = new Map<string, NearbyIsochronesResponse>();
  let controller: AbortController | undefined;
  let requestToken = 0;

  function originKey(value: Pick<NearbyStationIsochroneOrigin, "lon" | "lat">): string {
    return `${value.lon.toFixed(5)},${value.lat.toFixed(5)}`;
  }

  function minutesKey(value: readonly NearbyWalkingMinutes[]): string {
    return normalizeNearbyWalkingMinutes(value).join(",");
  }

  function responseCacheKey(
    origin: Pick<NearbyStationIsochroneOrigin, "lon" | "lat">,
    requestedMinutes: readonly NearbyWalkingMinutes[],
  ): string {
    return `${originKey(origin)}|${minutesKey(requestedMinutes)}`;
  }

  function normalizedOrigins(value: readonly NearbyStationIsochroneOrigin[]): NearbyStationIsochroneOrigin[] {
    const unique = new Map<string, NearbyStationIsochroneOrigin>();
    for (const origin of value) {
      if (!origin.id || !Number.isFinite(origin.lon) || !Number.isFinite(origin.lat)) continue;
      const key = originKey(origin);
      if (!unique.has(key)) unique.set(key, { id: origin.id, lon: origin.lon, lat: origin.lat });
    }
    return [...unique.values()].sort((left, right) => left.id.localeCompare(right.id, "fr-FR", { numeric: true }));
  }

  function originsKey(
    value: readonly NearbyStationIsochroneOrigin[],
    requestedMinutes: readonly NearbyWalkingMinutes[],
  ): string {
    return `${minutesKey(requestedMinutes)}|${normalizedOrigins(value).map(originKey).join("|")}`;
  }

  function cancelRequest(): void {
    controller?.abort();
    controller = undefined;
  }

  function disable(): void {
    cancelRequest();
    requestToken += 1;
    responses.value = [];
    error.value = undefined;
    status.value = "idle";
  }

  async function load(force = false): Promise<void> {
    if (!toValue(enabled)) {
      disable();
      return;
    }

    const currentOrigins = normalizedOrigins(toValue(origins));
    const currentMinutes = normalizeNearbyWalkingMinutes(toValue(minutes));
    if (currentOrigins.length === 0) {
      disable();
      return;
    }

    cancelRequest();
    const currentToken = ++requestToken;
    const nextController = new AbortController();
    controller = nextController;
    if (force) {
      for (const origin of currentOrigins) cache.delete(responseCacheKey(origin, currentMinutes));
    }

    const cachedResponses = () => currentOrigins.flatMap((origin) => {
      const cached = cache.get(responseCacheKey(origin, currentMinutes));
      return cached
        ? [{ stationId: origin.id, origin: { lon: origin.lon, lat: origin.lat }, response: cached }]
        : [];
    });
    responses.value = cachedResponses();
    error.value = undefined;

    const pendingOrigins = currentOrigins.filter((origin) => !cache.has(responseCacheKey(origin, currentMinutes)));
    if (pendingOrigins.length === 0) {
      status.value = "ready";
      controller = undefined;
      return;
    }

    status.value = "loading";
    let firstError: unknown;
    let nextIndex = 0;
    let stopScheduling = false;

    const worker = async (): Promise<void> => {
      while (!stopScheduling && nextIndex < pendingOrigins.length) {
        const origin = pendingOrigins[nextIndex++];
        if (!origin) return;
        try {
          const nextResponse = await fetchNearbyIsochronesWithRetry(origin, nextController.signal, currentMinutes);
          if (currentToken !== requestToken) return;
          cache.set(responseCacheKey(origin, currentMinutes), nextResponse);
          responses.value = cachedResponses();
        } catch (nextError) {
          if (nextError instanceof Error && nextError.name === "AbortError") return;
          firstError ??= nextError;
          if (isMissingIsochroneConfiguration(nextError) || isQuotaError(nextError)) stopScheduling = true;
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT_REQUESTS, pendingOrigins.length) }, () => worker()),
    );
    if (currentToken !== requestToken || !toValue(enabled)) return;

    responses.value = cachedResponses();
    error.value = firstError;
    status.value = responses.value.length > 0 ? "ready" : "error";
    controller = undefined;
  }

  watch(
    [
      () => toValue(enabled),
      () => originsKey(toValue(origins), toValue(minutes)),
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
    responses,
    error,
    load,
    retry: () => load(),
  };
}

async function fetchNearbyIsochronesWithRetry(
  origin: NearbyStationIsochroneOrigin,
  signal: AbortSignal,
  requestedMinutes: readonly NearbyWalkingMinutes[],
): Promise<NearbyIsochronesResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_ORIGIN; attempt += 1) {
    try {
      return await fetchNearbyIsochrones({ lon: origin.lon, lat: origin.lat }, signal, requestedMinutes);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      if (isMissingIsochroneConfiguration(error) || isQuotaError(error)) throw error;
      lastError = error;
      if (attempt + 1 < MAX_ATTEMPTS_PER_ORIGIN) {
        await waitBeforeIsochroneRetry(RETRY_DELAY_MS * (attempt + 1), signal);
      }
    }
  }
  throw lastError ?? new Error("Walking isochrones request failed.");
}

function waitBeforeIsochroneRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(createAbortError());
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function createAbortError(): Error {
  const error = new Error("The isochrone request was aborted.");
  error.name = "AbortError";
  return error;
}

function isMissingIsochroneConfiguration(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "not-configured");
}

function isQuotaError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "quota");
}
