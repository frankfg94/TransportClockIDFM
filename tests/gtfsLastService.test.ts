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
    expect(findGtfsLastService(timetable)).toEqual({ seconds: 90100, stopName: "B" });
  });
  it("keeps missing stations and unavailable datasets explicit", () => {
    expect(findGtfsLastService(timetable, "unknown")).toBeUndefined();
    expect(findGtfsLastService({ ...timetable, status: "out-of-coverage" })).toBeUndefined();
  });
  it("uses the injected browser summary without requesting the entire timetable", async () => {
    const fetchLastService = vi.fn().mockResolvedValue({ seconds: 90000 }), fetchTimetable = vi.fn();
    const signal = new AbortController().signal;
    await expect(useLineFrequencyTimetable({ fetchLastService, fetchTimetable }).getLastService("line", "station", { serviceDate: "20261013", signal })).resolves.toEqual({ seconds: 90000 });
    expect(fetchLastService).toHaveBeenCalledExactlyOnceWith("line", "station", { serviceDate: "20261013", signal });
    expect(fetchTimetable).not.toHaveBeenCalled();
  });
});
