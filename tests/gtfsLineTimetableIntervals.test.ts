import { describe, expect, it } from "vitest";
import {
  calculateGtfsTimetableInterval,
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
