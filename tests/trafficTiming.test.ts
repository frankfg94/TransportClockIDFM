import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentTrafficDisruptions,
  getTrafficDisruptionDisplayPeriod,
  getTrafficDisruptionTiming,
  getUpcomingTrafficDisruptions,
  parseTrafficDate,
} from "../src/features/traffic";
import type { TrafficDisruption } from "../src/features/traffic";

afterEach(() => {
  vi.useRealTimers();
});

describe("traffic timing", () => {
  it("parses compact Navitia dates", () => {
    expect(parseTrafficDate("20260601T044500")?.getFullYear()).toBe(2026);
    expect(parseTrafficDate("20260601T044500")?.getMonth()).toBe(5);
    expect(parseTrafficDate("20260601T044500")?.getDate()).toBe(1);
  });

  it("keeps future disruptions out of the current dashboard alert", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-29T12:00:00+02:00"));

    const disruptions: TrafficDisruption[] = [
      createDisruption("future", "20260706T044500", "20260725T043000"),
      createDisruption("current", "20260501T044500", "20260601T043000"),
    ];

    expect(getCurrentTrafficDisruptions(disruptions).map((item) => item.id)).toEqual([
      "current",
    ]);
    expect(getUpcomingTrafficDisruptions(disruptions).map((item) => item.id)).toEqual([
      "future",
    ]);
  });

  it("uses every application period instead of only the first one", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T12:00:00+02:00"));

    const weekendWork = createDisruption("rer-b-weekend-work", [
      {
        begin: "20260628T030000",
        end: "20260629T030000",
      },
      {
        begin: "20260627T030000",
        end: "20260628T030000",
      },
    ]);

    expect(getTrafficDisruptionTiming(weekendWork)).toBe("current");
    expect(getCurrentTrafficDisruptions([weekendWork])).toEqual([
      weekendWork,
    ]);
    expect(getUpcomingTrafficDisruptions([weekendWork])).toEqual([]);
  });

  it("displays the active period when Navitia returns periods out of order", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T12:00:00+02:00"));

    const weekendWork = createDisruption("rer-b-weekend-work", [
      {
        begin: "20260628T030000",
        end: "20260629T030000",
      },
      {
        begin: "20260627T030000",
        end: "20260628T030000",
      },
    ]);

    expect(getTrafficDisruptionDisplayPeriod(weekendWork)).toEqual({
      begin: "20260627T030000",
      end: "20260628T030000",
    });
  });
});

function createDisruption(
  id: string,
  beginOrPeriods: string | TrafficDisruption["applicationPeriods"],
  end?: string,
): TrafficDisruption {
  const applicationPeriods =
    typeof beginOrPeriods === "string"
      ? [{ begin: beginOrPeriods, end }]
      : beginOrPeriods;

  return {
    id,
    title: id,
    kind: "works",
    applicationPeriods,
    impactedLineRefs: ["line:IDFM:C01371"],
    impactedStopNames: [],
  };
}
