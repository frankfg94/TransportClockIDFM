import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentAndUpcomingTrafficWarningDisruptions,
  getCurrentTrafficDisruptions,
  getTrafficDisruptionDisplayPeriod,
  getTrafficDisruptionTiming,
  getUpcomingTrafficDisruptions,
  getUpcomingTrafficWarningStart,
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

  it("includes current and J-10 upcoming disruptions for pattern warnings", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1, 12, 0, 0));

    const disruptions: TrafficDisruption[] = [
      createDisruption("beyond-window", "20260712T120000", "20260713T120000"),
      createDisruption("inside-window", "20260710T120000", "20260711T120000"),
      createDisruption("current", "20260630T120000", "20260702T120000"),
    ];

    expect(
      getCurrentAndUpcomingTrafficWarningDisruptions(disruptions).map(
        (item) => item.id,
      ),
    ).toEqual(["inside-window", "current"]);
  });

  it("includes an upcoming pattern warning exactly ten days before start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1, 12, 0, 0));

    const disruption = createDisruption(
      "exact-window",
      "20260711T120000",
      "20260712T120000",
    );

    expect(
      getCurrentAndUpcomingTrafficWarningDisruptions([disruption]).map(
        (item) => item.id,
      ),
    ).toEqual(["exact-window"]);
  });

  it("uses a custom pattern warning lookahead window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1, 12, 0, 0));

    const disruption = createDisruption(
      "custom-window",
      "20260705T120000",
      "20260706T120000",
    );

    expect(
      getCurrentAndUpcomingTrafficWarningDisruptions([disruption], Date.now(), 3),
    ).toEqual([]);
    expect(
      getCurrentAndUpcomingTrafficWarningDisruptions([disruption], Date.now(), 4),
    ).toEqual([disruption]);
    expect(
      getCurrentAndUpcomingTrafficWarningDisruptions([disruption], Date.now(), 0),
    ).toEqual([]);
  });

  it("returns the next J-10 warning start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1, 12, 0, 0));

    const disruption = createDisruption("multi-period-work", [
      {
        begin: "20260709T180000",
        end: "20260710T030000",
      },
      {
        begin: "20260708T180000",
        end: "20260709T030000",
      },
    ]);

    expect(getUpcomingTrafficWarningStart(disruption)?.toISOString()).toBe(
      new Date(2026, 6, 8, 18, 0, 0).toISOString(),
    );
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
