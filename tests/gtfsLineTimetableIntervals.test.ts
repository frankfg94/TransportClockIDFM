import { describe, expect, it } from "vitest";
import {
  calculateGtfsTimetableInterval,
  calculateGtfsTimetableServiceBounds,
  GTFS_LINE_TIMETABLE_WINDOWS,
} from "../src/features/line-map/lineFrequencyTimetableIntervals";
import type {
  GtfsLineTimetableCall,
  GtfsLineTimetableStop,
  GtfsLineTimetableTrip,
} from "../src/types/lineFrequencyTimetable";

function call(stopId: string, departure: number, pickupType = 0): GtfsLineTimetableCall {
  return {
    stopId,
    sequence: 1,
    arrival: departure,
    departure,
    pickupType,
    dropOffType: 0,
  };
}

function trip(id: string, calls: GtfsLineTimetableCall[]): GtfsLineTimetableTrip {
  return { id, serviceDate: "20260831", directionId: "0", calls };
}

describe("GTFS human-readable timetable intervals", () => {
  it("builds a range from station medians and keeps raw fractional minutes until display", () => {
    const window = GTFS_LINE_TIMETABLE_WINDOWS.find((item) => item.key === "fiveToSeven")!;
    const stops = new Map<string, GtfsLineTimetableStop>([
      ["platform-1", { id: "platform-1", parentId: "station-a", name: "Station A" }],
      ["platform-2", { id: "platform-2", parentId: "station-b", name: "Station B" }],
    ]);
    const interval = calculateGtfsTimetableInterval(
      [
        trip("a", [call("platform-1", 5 * 3600)]),
        trip("b", [call("platform-1", 5 * 3600 + 10 * 60 + 24)]),
        trip("c", [call("platform-1", 5 * 3600 + 21 * 60)]),
        trip("d", [call("platform-2", 5 * 3600 + 60)]),
        trip("e", [call("platform-2", 5 * 3600 + 13 * 60 + 12)]),
        trip("f", [call("platform-2", 5 * 3600 + 25 * 60 + 36)]),
      ],
      window,
      stops,
    );

    expect(interval).toEqual({ minMinutes: 10.5, maxMinutes: 12.3 });
  });

  it("creates independent rows for adjacent sub-ranges and ignores boundary gaps", () => {
    const early = GTFS_LINE_TIMETABLE_WINDOWS.find((item) => item.key === "fiveToSeven")!;
    const day = GTFS_LINE_TIMETABLE_WINDOWS.find((item) => item.key === "sevenToNineThirty")!;
    const trips = [
      trip("early-a", [call("station", 6 * 3600)]),
      trip("early-b", [call("station", 6 * 3600 + 10 * 60)]),
      trip("early-c", [call("station", 6 * 3600 + 20 * 60)]),
      trip("day-a", [call("station", 7 * 3600)]),
      trip("day-b", [call("station", 7 * 3600 + 10 * 60)]),
      trip("day-c", [call("station", 7 * 3600 + 30 * 60)]),
    ];

    expect(calculateGtfsTimetableInterval(trips, early)).toEqual({
      minMinutes: 10,
      maxMinutes: 10,
    });
    expect(calculateGtfsTimetableInterval(trips, day)).toEqual({
      minMinutes: 15,
      maxMinutes: 15,
    });
  });

  it("does not fabricate an interval when a station has fewer than two boardable passages", () => {
    const window = GTFS_LINE_TIMETABLE_WINDOWS.find((item) => item.key === "fiveToSeven")!;
    expect(
      calculateGtfsTimetableInterval(
        [
          trip("one", [call("station-a", 6 * 3600)]),
          trip("two", [call("station-b", 6 * 3600 + 10 * 60)]),
          trip("drop-off-only", [call("station-a", 6 * 3600 + 20 * 60, 1)]),
        ],
        window,
      ),
    ).toBeUndefined();
  });
});

describe("GTFS service-day regressions", () => {
  it("does not confuse successive stops sharing a parent with separate buses", () => {
    const stops = new Map<string, GtfsLineTimetableStop>([
      ["mermoz", { id: "mermoz", parentId: "parent", name: "Mermoz" }],
      ["stade", { id: "stade", parentId: "parent", name: "Stade" }],
    ]);
    const trips = [23.5, 23.5 + 19 / 60, 23.5 + 38 / 60].map((hour, index) =>
      trip(String(index), [call("mermoz", hour * 3600), call("stade", hour * 3600 + 60)]),
    );
    expect(
      calculateGtfsTimetableInterval(trips, GTFS_LINE_TIMETABLE_WINDOWS.at(-1)!, stops),
    ).toEqual({ minMinutes: 19, maxMinutes: 19 });
  });

  it("uses two late buses across midnight without wrapping into the early-morning band", () => {
    const trips = [
      trip("a", [call("stop", 23 * 3600 + 44 * 60)]),
      trip("b", [call("stop", 24 * 3600 + 3 * 60)]),
    ];
    expect(calculateGtfsTimetableInterval(trips, GTFS_LINE_TIMETABLE_WINDOWS.at(-1)!)).toEqual({
      minMinutes: 19,
      maxMinutes: 19,
    });
    expect(calculateGtfsTimetableInterval(trips, GTFS_LINE_TIMETABLE_WINDOWS[0])).toBeUndefined();
  });

  it("reports first and last trip departures, ignores drop-off and preserves next-day times", () => {
    const trips = [
      trip("a", [call("origin", 5 * 3600), { ...call("end", 6 * 3600, 1), sequence: 2 }]),
      trip("b", [call("origin", 25 * 3600), { ...call("end", 26 * 3600, 1), sequence: 2 }]),
    ];
    expect(calculateGtfsTimetableServiceBounds(trips)).toEqual({
      firstDeparture: 5 * 3600,
      lastDeparture: 25 * 3600,
      approximate: false,
    });
    expect(
      calculateGtfsTimetableServiceBounds([...trips, trip("partial", [call("other", 4 * 3600)])])
        ?.approximate,
    ).toBe(true);
    expect(calculateGtfsTimetableServiceBounds(trips, undefined, new Set(["end"]))).toBeUndefined();
    expect(calculateGtfsTimetableServiceBounds([])).toBeUndefined();
  });

  it("uses the section entry and resolves topology ids for service bounds", () => {
    const stops = new Map<string, GtfsLineTimetableStop>([
      ["mid", { id: "mid", name: "Middle", topologyId: "FR::monomodalStopPlace:123" }],
    ]);
    const trips = [trip("a", [call("start", 18000), { ...call("mid", 18600), sequence: 2 }])];
    expect(
      calculateGtfsTimetableServiceBounds(trips, stops, new Set(["IDFM:monomodalStopPlace:123"])),
    ).toEqual({ firstDeparture: 18600, lastDeparture: 18600, approximate: false });
  });
});
