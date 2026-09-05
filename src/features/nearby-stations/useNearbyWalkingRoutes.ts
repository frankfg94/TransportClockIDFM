import { getCurrentInstance, onBeforeUnmount, ref } from "vue";
import type { NearbyPlace } from "./nearbyPlaces";
import type { NearbyJourneyPoint } from "./nearbyHeavyTransports";
import type { NearbyWalkingMapSegment } from "./nearbyTravelGeometry";
import {
  createNearbyWalkingPlaceCacheKey,
  type NearbyWalkingRoute,
} from "./nearbyWalkingRoutes";
import {
  getCachedNearbyWalkingRoute,
  getNearbyWalkingRoute,
  getNearbyWalkingRouteMatrix,
} from "../../services/nearbyWalkingRoutes";

const MATRIX_BATCH_SIZE = 48;

export interface NearbyWalkingLoadProgress {
  completed: number;
  total: number;
  remaining: number;
}

export function useNearbyWalkingRoutes() {
  const placeRoutes = ref<Record<string, NearbyWalkingRoute | undefined>>({});
  const segmentRoutes = ref<Record<string, NearbyWalkingRoute | undefined>>({});
  const placeLoadProgress = ref<Record<string, NearbyWalkingLoadProgress>>({});
  const isLoadingPlaces = ref(false);
  const error = ref<Error>();
  const placeControllers = new Map<string, AbortController>();
  const placeRequestTokens = new Map<string, number>();
  const placeProgressTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingPlaceScans = new Set<string>();
  const directPlaceRouteIds = new Set<string>();
  let segmentRequestToken = 0;

  function updatePlaceLoading(scope: string, loading: boolean): void {
    if (loading) pendingPlaceScans.add(scope);
    else pendingPlaceScans.delete(scope);
    isLoadingPlaces.value = pendingPlaceScans.size > 0;
  }

  function updatePlaceLoadProgress(
    scope: string,
    progress?: Pick<NearbyWalkingLoadProgress, "completed" | "total">,
  ): void {
    const next = { ...placeLoadProgress.value };
    if (!progress) {
      delete next[scope];
    } else {
      next[scope] = {
        completed: Math.min(progress.total, Math.max(0, progress.completed)),
        total: Math.max(0, progress.total),
        remaining: Math.max(0, progress.total - progress.completed),
      };
    }
    placeLoadProgress.value = next;
  }

  function clearPlaceLoadProgressTimer(scope: string): void {
    const timer = placeProgressTimers.get(scope);
    if (timer !== undefined) clearTimeout(timer);
    placeProgressTimers.delete(scope);
  }

  function hydrateCachedPlaceRoutes(
    origin: NearbyJourneyPoint,
    places: readonly NearbyPlace[],
  ): void {
    const merged = { ...placeRoutes.value };
    let changed = false;
    for (const place of places) {
      if (merged[place.id] || directPlaceRouteIds.has(place.id)) continue;
      const cached = getCachedNearbyWalkingRoute({
        id: place.id,
        cacheKey: createNearbyWalkingPlaceCacheKey(place),
        origin,
        destination: { lon: place.lon, lat: place.lat },
      });
      if (!cached) continue;
      merged[place.id] = cached;
      changed = true;
    }
    if (changed) placeRoutes.value = merged;
  }

  async function loadPlaceMetricsForGroup(
    origin: NearbyJourneyPoint,
    places: readonly NearbyPlace[],
    scope = "directory",
  ): Promise<void> {
    hydrateCachedPlaceRoutes(origin, places);
    const missingPlaces = places.filter((place) => !placeRoutes.value[place.id] && !directPlaceRouteIds.has(place.id));
    if (missingPlaces.length === 0) return;
    const token = (placeRequestTokens.get(scope) ?? 0) + 1;
    placeRequestTokens.set(scope, token);
    placeControllers.get(scope)?.abort();
    clearPlaceLoadProgressTimer(scope);
    const controller = new AbortController();
    placeControllers.set(scope, controller);
    updatePlaceLoading(scope, true);
    updatePlaceLoadProgress(scope, { completed: 0, total: missingPlaces.length });
    error.value = undefined;
    const next: Record<string, NearbyWalkingRoute | undefined> = {};
    let completed = 0;
    let completedSuccessfully = false;
    try {
      for (let index = 0; index < missingPlaces.length; index += MATRIX_BATCH_SIZE) {
        const batch = missingPlaces.slice(index, index + MATRIX_BATCH_SIZE).map((place) => ({
          id: place.id,
          cacheKey: createNearbyWalkingPlaceCacheKey(place),
          lon: place.lon,
          lat: place.lat,
        }));
        const routes = await getNearbyWalkingRouteMatrix(origin, batch, controller.signal);
        for (const route of routes) {
          if (route.id) next[route.id] = route;
        }
        if (token !== placeRequestTokens.get(scope)) return;
        completed += batch.length;
        updatePlaceLoadProgress(scope, { completed, total: missingPlaces.length });
      }
      const merged = { ...placeRoutes.value };
      for (const [placeId, route] of Object.entries(next)) {
        if (!directPlaceRouteIds.has(placeId) && route) merged[placeId] = route;
      }
      placeRoutes.value = merged;
      completedSuccessfully = true;
      updatePlaceLoadProgress(scope, { completed: missingPlaces.length, total: missingPlaces.length });
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      if (token === placeRequestTokens.get(scope)) error.value = cause instanceof Error ? cause : new Error("walking-routes-unavailable");
    } finally {
      if (token === placeRequestTokens.get(scope)) {
        updatePlaceLoading(scope, false);
        if (completedSuccessfully) {
          clearPlaceLoadProgressTimer(scope);
          placeProgressTimers.set(scope, setTimeout(() => {
            if (token !== placeRequestTokens.get(scope)) return;
            updatePlaceLoadProgress(scope);
            placeProgressTimers.delete(scope);
          }, 620));
        } else {
          updatePlaceLoadProgress(scope);
        }
        if (placeControllers.get(scope) === controller) placeControllers.delete(scope);
      }
    }
  }

  async function loadPlaceMetrics(
    origin: NearbyJourneyPoint,
    places: readonly NearbyPlace[],
  ): Promise<void> {
    return loadPlaceMetricsForGroup(origin, places, "all");
  }

  async function loadPlaceRoute(
    origin: NearbyJourneyPoint,
    place: NearbyPlace,
  ): Promise<NearbyWalkingRoute> {
    directPlaceRouteIds.add(place.id);
    const request = {
      id: place.id,
      cacheKey: createNearbyWalkingPlaceCacheKey(place),
      origin,
      destination: { lon: place.lon, lat: place.lat },
    };
    const cached = getCachedNearbyWalkingRoute(request);
    if (cached) {
      placeRoutes.value = { ...placeRoutes.value, [place.id]: cached };
      return cached;
    }
    const route = await getNearbyWalkingRoute(request);
    placeRoutes.value = { ...placeRoutes.value, [place.id]: route };
    return route;
  }

  async function loadMissingSegmentRoutes(
    origin: NearbyJourneyPoint,
    segments: readonly NearbyWalkingMapSegment[],
  ): Promise<void> {
    const missing = segments.filter((segment) => !segment.coordinates || segment.coordinates.length < 2);
    if (missing.length === 0) return;
    const token = ++segmentRequestToken;
    const routes = await Promise.all(missing.map((segment) => getNearbyWalkingRoute({
      id: segment.id,
      origin: segment.from,
      destination: segment.to,
    })));
    if (token !== segmentRequestToken) return;
    segmentRoutes.value = {
      ...segmentRoutes.value,
      ...Object.fromEntries(routes.map((route) => [route.id, route])),
    };
  }

  function clear(): void {
    for (const controller of placeControllers.values()) controller.abort();
    for (const scope of [...placeProgressTimers.keys()]) clearPlaceLoadProgressTimer(scope);
    for (const scope of placeRequestTokens.keys()) {
      placeRequestTokens.set(scope, (placeRequestTokens.get(scope) ?? 0) + 1);
    }
    segmentRequestToken += 1;
    placeControllers.clear();
    pendingPlaceScans.clear();
    directPlaceRouteIds.clear();
    placeRoutes.value = {};
    segmentRoutes.value = {};
    placeLoadProgress.value = {};
    isLoadingPlaces.value = false;
    error.value = undefined;
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      for (const controller of placeControllers.values()) controller.abort();
      for (const scope of placeRequestTokens.keys()) {
        placeRequestTokens.set(scope, (placeRequestTokens.get(scope) ?? 0) + 1);
      }
      segmentRequestToken += 1;
      placeControllers.clear();
    pendingPlaceScans.clear();
      for (const scope of [...placeProgressTimers.keys()]) clearPlaceLoadProgressTimer(scope);
    placeLoadProgress.value = {};
    });
  }

  return {
    placeRoutes,
    segmentRoutes,
    placeLoadProgress,
    isLoadingPlaces,
    error,
    loadPlaceMetrics,
    loadPlaceMetricsForGroup,
    loadPlaceRoute,
    loadMissingSegmentRoutes,
    clear,
  };
}
