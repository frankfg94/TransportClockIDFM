import { describe, expect, it, vi } from "vitest";
import { resolveNightAccess } from "../shared/gtfs/nightAccess";
import type { GtfsTimetableLoadResult } from "../shared/gtfs/timetableTypes";
import type { NearbyWalkingRoute } from "../src/features/nearby-stations/nearbyWalkingRoutes";
import { buildNoctilienFacts } from "../src/features/nearby-stations/neighborhood/verdict-transport-facts/noctilien";

const request = { origin: { lat: 48.8, lon: 2.3 }, datetime: "20261015T030000", lines: [{ id: "night-a", code: "N1" }, { id: "night-b", code: "N2" }] };
function timetable(id: string, departure = 12000): GtfsTimetableLoadResult {
  return { status: "ready", index: { schemaVersion: 1, lineId: id, stops: [
    { id: `${id}-stop`, name: "Nearby boarding", lat: 48.8, lon: 2.3001 },
    { id: "far", name: "Next actual call", lat: 49, lon: 2.3 }], services: [], chunks: [], startDate: "20261001", endDate: "20261031", maxTimeSeconds: 90000, tripCount: 1 },
    trips: [{ id: `${id}-trip`, serviceDate: "20261014", directionId: "0", headsign: "Actual terminus", calls: [
      { stopId: `${id}-stop`, sequence: 1, arrival: departure, departure, pickupType: 0, dropOffType: 0 },
      { stopId: "far", sequence: 2, arrival: departure + 120, departure: departure + 120, pickupType: 1, dropOffType: 0 }] }] };
}
function runtime() {
  return { loadLine: vi.fn(async (id: string) => timetable(id)), assertCurrent: vi.fn(),
    matrix: vi.fn(async (_origin: unknown, destinations: { id: string; lat: number; lon: number }[]): Promise<NearbyWalkingRoute[]> => destinations.map(to => ({ id: to.id,
      durationSeconds: to.id.startsWith("night-a") ? 180 : 600, distanceMeters: 100, coordinates: [to], provider: "ign-bdtopo", fallback: false }))) };
}
describe("independent walking access to active night services", () => {
  it("uses GTFS service epochs across the daylight-saving change", async () => {
    const r = runtime(); r.loadLine.mockImplementation(async id => {
      const loaded = timetable(id); loaded.trips[0]!.serviceDate = "20261025"; return loaded;
    });
    const result = await resolveNightAccess({ ...request, datetime: "20261025T030000" }, r);
    expect(result.journeys).toHaveLength(2);
    expect(result.journeys[0]!.sections.at(-1)!.departureDateTime).toBe("20261025T032000");
  });
  it("finds two lines by walking to their boarding stops instead of requiring a ride to those stops", async () => {
    const r = runtime(), result = await resolveNightAccess(request, r);
    expect(result.journeys).toHaveLength(2);
    const facts = buildNoctilienFacts(result.journeys);
    expect(facts[0]!.labelValues).toMatchObject({ line: "N1 et N2", minutes: 10 });
    expect(result.journeys[0]!.sections.map(s => s.type)).toEqual(["walking", "waiting", "public_transport"]);
    expect(result.journeys[0]!.sections.at(-1)).toMatchObject({ durationSeconds: 120, fromName: "Nearby boarding", toName: "Next actual call", direction: "Actual terminus" });
    expect(r.loadLine).toHaveBeenCalledWith("night-a", "20261015");
    expect(r.matrix).toHaveBeenCalledTimes(1);
  });
  it("does not certify inactive service, prohibited pickup, or a departure missed during the walk", async () => {
    const r = runtime(); r.loadLine.mockImplementation(async id => {
      const result = timetable(id, 10860); result.trips[0]!.calls[0]!.pickupType = id === "night-b" ? 1 : 0; return result;
    });
    expect((await resolveNightAccess(request, r)).journeys).toEqual([]);
  });
  it("keeps provider failure explicit and does not turn estimated access into a positive night fact", async () => {
    const r = runtime(); r.matrix.mockImplementation(async (_o, destinations) => destinations.map(to => ({ id: to.id, durationSeconds: 180,
      distanceMeters: 100, coordinates: [to], provider: "straight-line", fallback: true })));
    const result = await resolveNightAccess(request, r);
    expect(result.status).toBe("partial"); expect(buildNoctilienFacts(result.journeys)).toEqual([]);
  });
  it("keeps the strict fifteen-minute threshold and cancels obsolete addresses", async () => {
    const r = runtime(); r.matrix.mockImplementation(async (_o, destinations) => destinations.map(to => ({ id: to.id, durationSeconds: 900,
      distanceMeters: 100, coordinates: [to], provider: "ign-bdtopo", fallback: false })));
    expect((await resolveNightAccess(request, r)).journeys).toEqual([]);
    r.assertCurrent.mockImplementation(() => { throw new DOMException("old address", "AbortError"); });
    await expect(resolveNightAccess(request, r)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("examines all nearby boarding stops and splits walking matrices at sixty-four", async () => {
    const r = runtime();
    r.loadLine.mockImplementation(async id => {
      const loaded = timetable(id), template = loaded.trips[0]!;
      loaded.index!.stops = [loaded.index!.stops[1]!, ...Array.from({ length: 70 }, (_, i) => ({
        id: `S${i}`, name: `Stop ${i}`, lat: 48.8, lon: 2.3001 + i / 100000 }))];
      loaded.trips = Array.from({ length: 70 }, (_, i) => ({ ...template, id: `trip-${i}`,
        calls: [{ ...template.calls[0]!, stopId: `S${i}` }, template.calls[1]!] }));
      return loaded;
    });
    r.matrix.mockImplementation(async (_o, destinations) => destinations.map(to => ({ id: to.id,
      durationSeconds: to.id === "S69" ? 60 : 180, distanceMeters: 100, coordinates: [to], provider: "ign-bdtopo", fallback: false })));
    const result = await resolveNightAccess({ ...request, lines: request.lines.slice(0, 1) }, r);
    expect(r.matrix.mock.calls.map(call => call[1].length)).toEqual([64, 6]);
    expect(result.journeys[0]!.sections[0]!.toStopPointId).toBe("S69");
  });
});
