import { describe, expect, it, vi } from "vitest";
import { findGtfsLastService } from "../shared/gtfs/lastService";
import { useLineFrequencyTimetable } from "../src/features/line-map/useLineFrequencyTimetable";
import type { GtfsLineTimetableResponse } from "../src/types/lineFrequencyTimetable";

const timetable: Pick<GtfsLineTimetableResponse, "status" | "stops" | "trips"> = {
  status: "ready",
  stops: [{ id: "platform-a", parentId: "station-a", topologyId: "123", name: "A" }, { id: "platform-b", name: "B" }],
  trips: [{ id: "trip", serviceDate: "20261013", calls: [
    { stopId: "platform-a", sequence: 1, arrival: 89990, departure: 90000, pickupType: 0, dropOffType: 0 },
    { stopId: "platform-b", sequence: 2, arrival: 90100, departure: null, pickupType: 0, dropOffType: 0 },
  ] }],
};
describe("shared GTFS last service", () => {
  it("matches official parent and topology references and retains service hours beyond midnight", () => {
    expect(findGtfsLastService(timetable, "station-a")).toEqual({ seconds: 90000, stopName: "A" });
    expect(findGtfsLastService(timetable, "123")).toEqual({ seconds: 90000, stopName: "A" });
    expect(findGtfsLastService(timetable)).toEqual({ seconds: 90000, stopName: "A" });
  });
  it.each(["METRO", "TRAM"])("matches map-wrapped NeTEx reference stations to the %s timetable", () => {
    const reference = "FR::Quay:50123456:FR1";
    const source = { ...timetable, stops: [{ ...timetable.stops[0]!, topologyId: reference }] };
    expect(findGtfsLastService(source, "station:" + reference)).toEqual({ seconds: 90000, stopName: "A" });
    expect(findGtfsLastService(source, "station:FR::Quay:50123457:FR1")).toBeUndefined();
  });
  it("recognizes IDFM transport wrappers without conflating quay and stop-place namespaces", () => {
    const source = { ...timetable, stops: [{ ...timetable.stops[0]!, id: "IDFM:77", parentId: "IDFM:88" }],
      trips: timetable.trips.map(trip => ({ ...trip, calls: trip.calls.map(call => ({ ...call, stopId: "IDFM:77" })) })) };
    expect(findGtfsLastService(source, "stop_point:IDFM:77")?.seconds).toBe(90000);
    expect(findGtfsLastService(source, "stop_area:IDFM:88")?.seconds).toBe(90000);
    expect(findGtfsLastService(source, "FR::Quay:77:FR1")).toBeUndefined();
    expect(findGtfsLastService(source, "IDFM:monomodalStopPlace:77")).toBeUndefined();
  });
  it("keeps missing stations and unavailable datasets explicit", () => {
    expect(findGtfsLastService(timetable, "unknown")).toBeUndefined();
    expect(findGtfsLastService({ ...timetable, status: "out-of-coverage" })).toBeUndefined();
  });
  it("excludes arrivals, no-pickup calls and invalid times while retaining a partial valid timetable", () => {
    const calls = [
      { stopId: "platform-a", sequence: 1, arrival: null, departure: 88000, pickupType: 0, dropOffType: 0 },
      { stopId: "platform-a", sequence: 2, arrival: null, departure: 96000, pickupType: 1, dropOffType: 0 },
      { stopId: "platform-a", sequence: 3, arrival: 97000, departure: null, pickupType: 0, dropOffType: 0 },
      { stopId: "platform-a", sequence: 4, arrival: null, departure: NaN, pickupType: 0, dropOffType: 0 },
      { stopId: "platform-a", sequence: 5, arrival: null, departure: -1, pickupType: 0, dropOffType: 0 },
    ];
    expect(findGtfsLastService({ ...timetable, trips: [{ id: "partial", serviceDate: "20261013", calls }] }, "station-a"))
      .toEqual({ seconds: 88000, stopName: "A" });
    expect(findGtfsLastService({ ...timetable, trips: [] })).toBeUndefined();
  });
  it("uses the injected browser summary without requesting the entire timetable", async () => {
    const fetchLastService = vi.fn().mockResolvedValue({ seconds: 90000 }), fetchTimetable = vi.fn();
    const signal = new AbortController().signal;
    await expect(useLineFrequencyTimetable({ fetchLastService, fetchTimetable }).getLastService("line", "station", { serviceDate: "20261013", signal })).resolves.toEqual({ seconds: 90000 });
    expect(fetchLastService).toHaveBeenCalledExactlyOnceWith("line", "station", { serviceDate: "20261013", signal });
    expect(fetchTimetable).not.toHaveBeenCalled();
  });
});
