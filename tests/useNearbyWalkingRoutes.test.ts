import { afterEach, describe, expect, it, vi } from "vitest";
import type { NearbyPlace } from "../src/features/nearby-stations/nearbyPlaces";
import type { NearbyJourneyPoint } from "../src/features/nearby-stations/nearbyHeavyTransports";
import type {
  NearbyWalkingRoute,
  NearbyWalkingRouteRequest,
} from "../src/features/nearby-stations/nearbyWalkingRoutes";

const mocks = vi.hoisted(() => ({
  matrix: vi.fn(),
  route: vi.fn(),
  cached: vi.fn(() => undefined as NearbyWalkingRoute | undefined),
}));

vi.mock("../src/services/nearbyWalkingRoutes", () => ({
  getNearbyWalkingRouteMatrix: mocks.matrix,
  getNearbyWalkingRoute: mocks.route,
  getCachedNearbyWalkingRoute: mocks.cached,
}));

import { useNearbyWalkingRoutes } from "../src/features/nearby-stations/useNearbyWalkingRoutes";

const origin = { lon: 2.3, lat: 48.81 };

function routeFor(
  id: string,
  lon: number,
  lat: number,
  routeOrigin: NearbyJourneyPoint = origin,
  distanceMeters = 500,
  durationSeconds = 360,
): NearbyWalkingRoute {
  return {
    id,
    provider: "openrouteservice",
    distanceMeters,
    durationSeconds,
    coordinates: [routeOrigin, { lon, lat }],
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
  vi.resetAllMocks();
  vi.useRealTimers();
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

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

  it("does not publish a direct route resolved after clear", async () => {
    const place = placeFor(1);
    const pending = deferred<NearbyWalkingRoute>();
    mocks.route.mockImplementationOnce((_request: NearbyWalkingRouteRequest, _signal?: AbortSignal) => pending.promise);

    const walking = useNearbyWalkingRoutes();
    const load = walking.loadPlaceRoute(origin, place);
    const signal = mocks.route.mock.calls[0]?.[1] as AbortSignal;

    walking.clear();
    expect(signal.aborted).toBe(true);

    // This mock deliberately ignores AbortSignal and resolves after invalidation.
    pending.resolve(routeFor(place.id, place.lon, place.lat));

    await expect(load).resolves.toBeUndefined();
    expect(walking.placeRoutes.value).toEqual({});
  });

  it("keeps the new-origin direct route when an old response arrives afterwards", async () => {
    const place = placeFor(1);
    const first = deferred<NearbyWalkingRoute>();
    const second = deferred<NearbyWalkingRoute>();
    mocks.route
      .mockImplementationOnce((_request: NearbyWalkingRouteRequest, _signal?: AbortSignal) => first.promise)
      .mockImplementationOnce((_request: NearbyWalkingRouteRequest, _signal?: AbortSignal) => second.promise);
    const walking = useNearbyWalkingRoutes();
    const oldLoad = walking.loadPlaceRoute(origin, place);

    const newOrigin = { lon: 2.4, lat: 48.82 };
    walking.clear();
    const newRoute = routeFor(place.id, place.lon, place.lat, newOrigin, 1_240, 780);
    const newLoad = walking.loadPlaceRoute(newOrigin, place);
    second.resolve(newRoute);
    await expect(newLoad).resolves.toEqual(newRoute);

    first.resolve(routeFor(place.id, place.lon, place.lat, origin, 500, 360));
    await expect(oldLoad).resolves.toBeUndefined();

    expect(walking.placeRoutes.value[place.id]).toMatchObject({
      coordinates: [newOrigin, { lon: place.lon, lat: place.lat }],
      distanceMeters: 1_240,
      durationSeconds: 780,
    });
  });

  it("keeps the latest direct request for one place when responses arrive out of order", async () => {
    const place = placeFor(1);
    const first = deferred<NearbyWalkingRoute>();
    const second = deferred<NearbyWalkingRoute>();
    mocks.route
      .mockImplementationOnce((_request: NearbyWalkingRouteRequest, _signal?: AbortSignal) => first.promise)
      .mockImplementationOnce((_request: NearbyWalkingRouteRequest, _signal?: AbortSignal) => second.promise);
    const walking = useNearbyWalkingRoutes();
    const firstLoad = walking.loadPlaceRoute(origin, place);
    const secondRoute = routeFor(place.id, place.lon, place.lat, origin, 1_100, 660);
    const secondLoad = walking.loadPlaceRoute(origin, place);

    second.resolve(secondRoute);
    await expect(secondLoad).resolves.toEqual(secondRoute);
    first.resolve(routeFor(place.id, place.lon, place.lat, origin, 400, 240));
    await expect(firstLoad).resolves.toBeUndefined();

    expect(walking.placeRoutes.value[place.id]).toMatchObject({
      distanceMeters: 1_100,
      durationSeconds: 660,
    });
  });

  it("publishes simultaneous direct routes for different places", async () => {
    const place = placeFor(1);
    const otherPlace = placeFor(2);
    const placePending = deferred<NearbyWalkingRoute>();
    const otherPlacePending = deferred<NearbyWalkingRoute>();
    mocks.route.mockImplementation((request: NearbyWalkingRouteRequest, _signal?: AbortSignal) => (
      request.id === place.id ? placePending.promise : otherPlacePending.promise
    ));
    const walking = useNearbyWalkingRoutes();
    const placeLoad = walking.loadPlaceRoute(origin, place);
    const otherPlaceLoad = walking.loadPlaceRoute(origin, otherPlace);
    const placeRoute = routeFor(place.id, place.lon, place.lat, origin, 520, 300);
    const otherPlaceRoute = routeFor(otherPlace.id, otherPlace.lon, otherPlace.lat, origin, 840, 540);

    otherPlacePending.resolve(otherPlaceRoute);
    placePending.resolve(placeRoute);
    await expect(Promise.all([placeLoad, otherPlaceLoad])).resolves.toEqual([placeRoute, otherPlaceRoute]);

    expect(walking.placeRoutes.value).toMatchObject({
      [place.id]: placeRoute,
      [otherPlace.id]: otherPlaceRoute,
    });
  });

  it("publishes a cached direct route without starting a request", async () => {
    const place = placeFor(1);
    const cachedRoute = routeFor(place.id, place.lon, place.lat, origin, 640, 420);
    mocks.cached.mockReturnValue(cachedRoute);
    const walking = useNearbyWalkingRoutes();

    await expect(walking.loadPlaceRoute(origin, place)).resolves.toEqual(cachedRoute);

    expect(mocks.route).not.toHaveBeenCalled();
    expect(walking.placeRoutes.value[place.id]).toEqual(cachedRoute);
  });

  it("does not let a late matrix response replace a valid direct route", async () => {
    const place = placeFor(1);
    const matrixPending = deferred<NearbyWalkingRoute[]>();
    const matrixRoute = routeFor(place.id, place.lon, place.lat, origin, 320, 240);
    const directRoute = routeFor(place.id, place.lon, place.lat, origin, 1_080, 720);
    mocks.matrix.mockImplementationOnce((
      _requestOrigin: typeof origin,
      _destinations: readonly { id: string; lon: number; lat: number }[],
      _signal?: AbortSignal,
    ) => matrixPending.promise);
    mocks.route.mockImplementationOnce(async () => directRoute);
    const walking = useNearbyWalkingRoutes();

    const matrixLoad = walking.loadPlaceMetricsForGroup(origin, [place], "food-shopping");
    await expect(walking.loadPlaceRoute(origin, place)).resolves.toEqual(directRoute);

    matrixPending.resolve([matrixRoute]);
    await matrixLoad;

    expect(walking.placeRoutes.value[place.id]).toMatchObject({
      distanceMeters: 1_080,
      durationSeconds: 720,
    });
  });
});
