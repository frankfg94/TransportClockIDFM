import { afterEach, describe, expect, it, vi } from "vitest";
import type { NearbyPlace } from "../src/features/nearby-stations/nearbyPlaces";
import type { NearbyWalkingRoute } from "../src/features/nearby-stations/nearbyWalkingRoutes";

const mocks = vi.hoisted(() => ({
  matrix: vi.fn(),
  route: vi.fn(),
  cached: vi.fn(() => undefined),
}));

vi.mock("../src/services/nearbyWalkingRoutes", () => ({
  getNearbyWalkingRouteMatrix: mocks.matrix,
  getNearbyWalkingRoute: mocks.route,
  getCachedNearbyWalkingRoute: mocks.cached,
}));

import { useNearbyWalkingRoutes } from "../src/features/nearby-stations/useNearbyWalkingRoutes";

const origin = { lon: 2.3, lat: 48.81 };

function routeFor(id: string, lon: number, lat: number): NearbyWalkingRoute {
  return {
    id,
    provider: "openrouteservice",
    distanceMeters: 500,
    durationSeconds: 360,
    coordinates: [origin, { lon, lat }],
  };
}

function placeFor(index: number): NearbyPlace {
  return {
    id: `place:${index}`,
    name: `Place ${index}`,
    lon: 2.3 + index / 100_000,
    lat: 48.81 + index / 100_000,
    category: "shop",
    kind: "supermarket",
    distanceMeters: 300,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("useNearbyWalkingRoutes", () => {
  it("reports completed and remaining matrix items while a group is loading", async () => {
    const places = Array.from({ length: 49 }, (_, index) => placeFor(index));
    let callCount = 0;
    let releaseSecondBatch: ((routes: NearbyWalkingRoute[]) => void) | undefined;
    mocks.matrix.mockImplementation(async (
      _requestOrigin: typeof origin,
      destinations: readonly { id: string; lon: number; lat: number }[],
    ) => {
      callCount += 1;
      const routes = destinations.map((destination) => routeFor(destination.id, destination.lon, destination.lat));
      if (callCount === 2) {
        return new Promise<NearbyWalkingRoute[]>((resolve) => {
          releaseSecondBatch = resolve;
        });
      }
      return routes;
    });

    const walking = useNearbyWalkingRoutes();
    const pending = walking.loadPlaceMetricsForGroup(origin, places, "food-shopping");
    await vi.waitFor(() => expect(mocks.matrix).toHaveBeenCalledTimes(2));

    expect(walking.placeLoadProgress.value["food-shopping"]).toEqual({
      completed: 48,
      total: 49,
      remaining: 1,
    });
    expect(walking.isLoadingPlaces.value).toBe(true);

    vi.useFakeTimers();
    releaseSecondBatch?.([routeFor("place:48", places[48]!.lon, places[48]!.lat)]);
    await pending;

    expect(walking.placeLoadProgress.value["food-shopping"]).toEqual({
      completed: 49,
      total: 49,
      remaining: 0,
    });
    expect(walking.isLoadingPlaces.value).toBe(false);
    expect(walking.placeRoutes.value["place:48"]?.durationSeconds).toBe(360);

    vi.advanceTimersByTime(620);
    expect(walking.placeLoadProgress.value["food-shopping"]).toBeUndefined();
  });
});
