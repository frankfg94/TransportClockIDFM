import { describe, expect, it } from "vitest";
import {
  createPatternTrafficTimelineItems,
  getDaysUntilTrafficTimelineItem,
} from "../src/features/service-pattern/trafficTimeline";
import type { TrafficDisruption } from "../src/features/traffic";

const stations = [
  { key: "station-a", label: "Station A" },
  { key: "station-b", label: "Station B" },
  { key: "station-c", label: "Station C" },
  { key: "station-d", label: "Station D" },
];

const edges = [
  { id: "a-b", source: "station-a", target: "station-b" },
  { id: "b-c", source: "station-b", target: "station-c" },
  { id: "c-d", source: "station-c", target: "station-d" },
];

describe("pattern traffic timeline", () => {
  it("extracts, groups and sorts every future interruption period", () => {
    const now = new Date(2026, 6, 1, 12, 0, 0).getTime();
    const disruptions = [
      createDisruption("late", [
        { begin: "20260710T090000", end: "20260710T120000" },
        { begin: "20260708T090000", end: "20260708T120000" },
      ]),
      createDisruption("same-day", [
        { begin: "20260708T180000", end: "20260708T230000" },
      ]),
    ];

    const items = createPatternTrafficTimelineItems(
      disruptions,
      stations,
      edges,
      now,
    );

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.dateKey)).toEqual([
      "2026-07-08",
      "2026-07-10",
    ]);
    expect(items[0].disruptions.map((item) => item.disruption.id)).toEqual([
      "late",
      "same-day",
    ]);
  });

  it("computes impacted stations, duration and severity", () => {
    const now = new Date(2026, 6, 1, 12, 0, 0).getTime();
    const [item] = createPatternTrafficTimelineItems(
      [
        createDisruption("long-work", [
          { begin: "20260708T090000", end: "20260710T220000" },
        ]),
      ],
      stations,
      edges,
      now,
    );

    expect(item.impactedStationCount).toBe(2);
    expect(item.durationMinutes).toBe(3_660);
    expect(item.severity).toBe("high");
    expect(getDaysUntilTrafficTimelineItem(item, now)).toBe(7);
  });

  it("ignores expired and current periods", () => {
    const now = new Date(2026, 6, 8, 12, 0, 0).getTime();
    const items = createPatternTrafficTimelineItems(
      [
        createDisruption("expired", [
          { begin: "20260706T090000", end: "20260706T120000" },
        ]),
        createDisruption("current", [
          { begin: "20260708T090000", end: "20260708T220000" },
        ]),
        createDisruption("future", [
          { begin: "20260709T090000", end: "20260709T120000" },
        ]),
      ],
      stations,
      edges,
      now,
    );

    expect(items.map((item) => item.disruptions[0].disruption.id)).toEqual([
      "future",
    ]);
  });
});

function createDisruption(
  id: string,
  applicationPeriods: TrafficDisruption["applicationPeriods"],
): TrafficDisruption {
  return {
    id,
    title: "Trafic interrompu entre Station A et Station D",
    kind: "works",
    applicationPeriods,
    impactedLineRefs: ["line:test"],
    impactedStopNames: [],
  };
}
