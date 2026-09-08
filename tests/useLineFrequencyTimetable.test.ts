import { describe, expect, it } from "vitest";
import type { GtfsLineFrequencyResponse } from "../src/types/lineFrequency";
import type { GtfsLineTimetableResponse } from "../src/types/lineFrequencyTimetable";
import { useLineFrequencyTimetable } from "../src/features/line-map/useLineFrequencyTimetable";

const profile: GtfsLineFrequencyResponse = {
  lineId: "line:metro:4",
  serviceDate: "20260907",
  source: "gtfs",
  status: "ready",
  topologyAvailable: true,
  branched: true,
  average: { peakMinutes: 4 },
  directions: [],
  sections: [
    {
      id: "branch-a",
      kind: "branch",
      from: { id: "topology:station-a", name: "Station A" },
      to: { id: "topology:station-a", name: "Station A" },
      stationIds: ["topology:station-a"],
      average: { peakMinutes: 9 },
      directions: [],
    },
    {
      id: "central",
      kind: "central",
      from: { id: "topology:station-b", name: "Station B" },
      to: { id: "topology:station-b", name: "Station B" },
      stationIds: ["topology:station-b"],
      average: { peakMinutes: 4 },
      directions: [],
    },
  ],
  stationCount: 2,
  sampledStationCount: 2,
};

const timetable: GtfsLineTimetableResponse = {
  lineId: "line:metro:4",
  serviceDate: "20260907",
  source: "gtfs",
  status: "ready",
  stops: [
    { id: "stop-a", topologyId: "topology:station-a", name: "Station A" },
    { id: "stop-b", topologyId: "topology:station-b", name: "Station B" },
  ],
  trips: [{
    id: "trip-1",
    serviceDate: "20260907",
    calls: [
      { stopId: "stop-a", sequence: 1, arrival: 19 * 3_600, departure: 19 * 3_600, pickupType: 0, dropOffType: 0 },
      { stopId: "stop-a", sequence: 2, arrival: 23 * 3_600 + 30 * 60, departure: 23 * 3_600 + 30 * 60, pickupType: 0, dropOffType: 0 },
    ],
  }],
};

describe("useLineFrequencyTimetable", () => {
  it("selects the timetable frequency section and last service for a station", async () => {
    const source = useLineFrequencyTimetable({
      fetchFrequency: async () => profile,
      fetchTimetable: async () => timetable,
    });

    const branch = await source.getFrequencies("line:metro:4", "topology:station-a");
    const lastService = await source.getLastService("line:metro:4", "topology:station-a");

    expect(branch.average.peakMinutes).toBe(9);
    expect(branch.sections.map((section) => section.id)).toEqual(["branch-a"]);
    expect(lastService).toEqual({ seconds: 23 * 3_600 + 30 * 60, stopName: "Station A" });
  });
});
