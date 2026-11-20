import { describe, expect, it, vi } from "vitest";
import { cachedStationWalkMatrix, resetStationWalkCache } from "../server/services/walking/stationWalkCache";
import type { NearbyWalkingMatrixDestination } from "../src/features/nearby-stations/nearbyWalkingRoutes";

const stop = { lon: 2.3, lat: 48.8 };
const entrance = { id: "entrance", lon: 2.301, lat: 48.801, stationWalk: true };
const addressWalk = { id: "address", lon: 2.31, lat: 48.81 };
function fixture() {
  const records = new Map<string, string>();
  const store = { get: async (key: string) => records.get(key) ?? null,
    put: async (key: string, value: string) => { records.set(key, value); } };
  const calculate = vi.fn(async (points: NearbyWalkingMatrixDestination[]) => points.map(point => ({
    id: point.id, provider: "ign-bdtopo" as const, fallback: false, durationSeconds: 60,
    distanceMeters: 82, coordinates: [stop, point], datasetVersion: "source-version",
  })));
  return { store, calculate, records };
}
describe("shared station walking routes", () => {
  it("shares verified directed routes across callers and keeps private walks out of storage", async () => {
    const { store, calculate, records } = fixture();
    await cachedStationWalkMatrix(store, stop, [entrance, addressWalk], false, calculate);
    expect(records.size).toBe(1);
    const routes = await cachedStationWalkMatrix(store, stop, [{ ...entrance, id: "other-id" }, addressWalk], false, calculate);
    expect(calculate.mock.lastCall?.[0]).toEqual([addressWalk]);
    expect(routes[0]).toMatchObject({ id: "other-id", datasetVersion: "source-version", walkingDiagnostic: { cacheState: "hit" } });
    await cachedStationWalkMatrix(store, stop, [entrance], true, calculate);
    expect(records.size).toBe(2);
  });
  it("rejects late writes from before a reset and leaves estimates retryable", async () => {
    const { store, calculate } = fixture();
    await cachedStationWalkMatrix(store, stop, [entrance], false, async points => {
      await resetStationWalkCache(store);
      return calculate(points);
    });
    await cachedStationWalkMatrix(store, stop, [entrance], false, async points =>
      (await calculate(points)).map(route => ({ ...route, provider: "straight-line", fallback: true })));
    await cachedStationWalkMatrix(store, stop, [entrance], false, calculate);
    expect(calculate).toHaveBeenCalledTimes(3);
  });
});
