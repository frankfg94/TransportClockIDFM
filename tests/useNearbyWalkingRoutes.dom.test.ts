import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NearbyPlace } from "../src/features/nearby-stations/nearbyPlaces";
import type {
  NearbyWalkingRoute,
  NearbyWalkingRouteRequest,
} from "../src/features/nearby-stations/nearbyWalkingRoutes";

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

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function place(): NearbyPlace {
  return {
    id: "place:mounted",
    name: "Place mounted",
    lon: 2.301,
    lat: 48.811,
    category: "shop",
    kind: "supermarket",
    distanceMeters: 300,
  };
}

function route(): NearbyWalkingRoute {
  return {
    id: "place:mounted",
    provider: "openrouteservice",
    distanceMeters: 720,
    durationSeconds: 480,
    coordinates: [origin, { lon: 2.301, lat: 48.811 }],
  };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("useNearbyWalkingRoutes teardown", () => {
  it("does not publish a direct route resolved after the owner component unmounts", async () => {
    const pending = deferred<NearbyWalkingRoute>();
    mocks.route.mockImplementationOnce((_request: NearbyWalkingRouteRequest, _signal?: AbortSignal) => pending.promise);
    let walking!: ReturnType<typeof useNearbyWalkingRoutes>;
    const Harness = defineComponent({
      setup() {
        walking = useNearbyWalkingRoutes();
        return () => null;
      },
    });
    const wrapper = mount(Harness);
    const load = walking.loadPlaceRoute(origin, place());
    const signal = mocks.route.mock.calls[0]?.[1] as AbortSignal;

    wrapper.unmount();
    expect(signal.aborted).toBe(true);

    // This mock deliberately ignores AbortSignal and resolves after teardown.
    pending.resolve(route());

    await expect(load).resolves.toBeUndefined();
    expect(walking.placeRoutes.value).toEqual({});
  });
});
