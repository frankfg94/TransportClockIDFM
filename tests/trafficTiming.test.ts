import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentTrafficDisruptions,
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
});

function createDisruption(
  id: string,
  begin: string,
  end: string,
): TrafficDisruption {
  return {
    id,
    title: id,
    kind: "works",
    applicationPeriods: [{ begin, end }],
    impactedLineRefs: ["line:IDFM:C01371"],
    impactedStopNames: [],
  };
}
