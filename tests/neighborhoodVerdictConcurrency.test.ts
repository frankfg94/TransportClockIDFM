import { afterEach, describe, expect, it, vi } from "vitest";
import { buildNeighborhoodVerdict, type WalkingRoute, type WalkingRouter } from "../server/services/neighborhoodVerdict/score";
import { IRIS_SOURCE_ID, SERVICE_QUALITY_SOURCE_ID, VERDICT_SCHEMA_VERSION, type CompiledNeighborhoodVerdictData } from "../server/services/neighborhoodVerdict/contracts";

afterEach(() => vi.useRealTimers());
function fixture(): CompiledNeighborhoodVerdictData {
  return { schemaVersion: VERDICT_SCHEMA_VERSION, generatedAt: "2026-10-13T09:00:00Z", sources: [], warnings: [],
    // Deliberately unsorted: completion order must not replace distance order.
    gpeStations: [3, 1, 4, 2].map(i => ({ id: `gpe-${i}`, name: `Gare ${i}`, line: "15", lon: 2.3 + i * .001,
      lat: 48.8, projectStatus: "planned", verifiedAt: "2026-10-13" })),
    greenSpaces: [1, 2].map(i => ({ id: `park-${i}`, name: `Parc ${i}`, category: "parc", surfaceM2: 100_000,
      centroid: [2.3, 48.8 + i * .004], geometry: { type: "Polygon", coordinates: [[[2.299,48.8+i*.004],[2.301,48.8+i*.004],
        [2.301,48.8+i*.004+.001],[2.299,48.8+i*.004+.001],[2.299,48.8+i*.004]]] } })),
    airNoiseCommunes: {}, iris: { sourceId: IRIS_SOURCE_ID, bbox: [2,48,3,49], neighborhoods: [] }, security: { communes: {}, trends: {} },
    serviceQuality: { sourceId: SERVICE_QUALITY_SOURCE_ID, generatedAt: "2026-10-13", availableYears: [], lines: [] } };
}
const origin = { lon: 2.3, lat: 48.8 }, admin = { commune: { code: "fixture", name: "Commune" }, departmentCode: "92" };
const route: WalkingRouter = async (_from, to) => ({ durationSeconds: to[1] > 48.8 ? 600 : Math.round((to[0] - 2.3) * 1000) * 300, distanceMeters: 800 });
describe("documentary walking concurrency", () => {
  it("starts GPE and green-space candidates together and preserves complete results when replies are out of order", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-13T09:00:00Z"));
    const expected = await buildNeighborhoodVerdict(fixture(), origin, admin, route);
    const pending: { to: [number,number]; resolve: (value: WalkingRoute | undefined) => void }[] = [];
    const waiting = buildNeighborhoodVerdict(fixture(), origin, admin, (_from, to) => new Promise(resolve => { pending.push({ to, resolve }); }));
    expect(pending).toHaveLength(6);
    for (const item of [...pending].reverse()) item.resolve(await route([origin.lon,origin.lat], item.to));
    expect(await waiting).toEqual(expected);
    expect(expected.futureProjects.map(p => p.id)).toEqual(["gpe-1","gpe-2","gpe-3","gpe-4"]);
    expect(expected.nearbyGreenSpaces).toHaveLength(2);
    expect(expected.categories.find(c => c.id === "transport")?.positiveFacts.map(f => f.id)).toEqual(["gpe-gpe-1","gpe-gpe-2","gpe-gpe-3"]);
  });
  it("keeps missing pedestrian routes and stale GPE sources explicit", async () => {
    const missing = await buildNeighborhoodVerdict(fixture(), origin, admin, async () => undefined);
    expect(missing.futureProjects).toEqual([]);
    expect(missing.categories.find(c=>c.id==='transport')?.status).toBe("unavailable");
    expect(missing.nearbyGreenSpaces.every(space=>space.walkingMinutes === undefined)).toBe(true);
  });
});
