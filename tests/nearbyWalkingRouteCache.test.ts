import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNearbyWalkingPlaceCacheKey,
  type NearbyWalkingMatrixDestination,
} from "../src/features/nearby-stations/nearbyWalkingRoutes";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

const origin = { lon: 2.3001, lat: 48.8101 };
const destinationCacheKey = createNearbyWalkingPlaceCacheKey({
  name: "Café République",
  address: "12 rue d'Alésia",
  lon: 2.3027,
  lat: 48.8121,
});
const destination: NearbyWalkingMatrixDestination = {
  id: "place:cafe-republique",
  cacheKey: destinationCacheKey,
  lon: 2.3027,
  lat: 48.8121,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("nearby walking route cache", () => {
  it("sanitizes a place name and address into a stable key", () => {
    expect(destinationCacheKey).toBe("cafe-republique-12-rue-d-alesia");
  });

  it("reuses a persisted matrix route after the service is reloaded", async () => {
    const storage = new MemoryStorage();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      routes: [{
        id: destination.id,
        provider: "openrouteservice",
        distanceMeters: 640,
        durationSeconds: 480,
        coordinates: [origin, { lon: destination.lon, lat: destination.lat }],
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("fetch", fetchMock);

    const firstService = await import("../src/services/nearbyWalkingRoutes");
    const firstRoutes = await firstService.getNearbyWalkingRouteMatrix(origin, [destination]);

    expect(firstRoutes[0]?.provider).toBe("openrouteservice");
    expect(storage.getItem("transport-clock:nearby-walking-routes:v3")).toContain(destination.cacheKey!);

    vi.resetModules();
    const reloadedService = await import("../src/services/nearbyWalkingRoutes");
    const cachedRoutes = await reloadedService.getNearbyWalkingRouteMatrix(origin, [destination]);
    const cachedDirectRoute = await reloadedService.getNearbyWalkingRoute({
      id: destination.id,
      cacheKey: destination.cacheKey,
      origin,
      destination: { lon: destination.lon, lat: destination.lat },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cachedRoutes[0]).toMatchObject({
      id: destination.id,
      provider: "openrouteservice",
      distanceMeters: 640,
      durationSeconds: 480,
    });
    expect(cachedDirectRoute.distanceMeters).toBe(640);

    reloadedService.clearNearbyWalkingRouteCache();
    expect(storage.getItem("transport-clock:nearby-walking-routes:v3")).toBeNull();
    expect(reloadedService.getCachedNearbyWalkingRoute({
      id: destination.id,
      cacheKey: destination.cacheKey,
      origin,
      destination: { lon: destination.lon, lat: destination.lat },
    })).toBeUndefined();
  });
});
