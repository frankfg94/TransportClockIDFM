import { describe, expect, it } from "vitest";
import {
  classifyPatternTrafficIncident,
  createPatternTrafficSummaryEntries,
  getPatternTrafficSummaryTimeWindow,
} from "../src/features/service-pattern/trafficCalendarSummary";
import type {
  PatternTrafficCalendarDay,
  PatternTrafficCalendarEvent,
} from "../src/features/service-pattern/trafficCalendar";
import type { TrafficDisruption } from "../src/features/traffic";
import { getTrafficDisruptionStartClockTime } from "../src/features/traffic/trafficTextTimes";

describe("traffic calendar friendly summary", () => {
  it.each([
    ["interruption", "Trafic interrompu entre Châtelet et Gare du Nord", "unknown"],
    ["works", "Travaux de renouvellement des voies", "works"],
    ["slowdown", "Ralentissements et retards sur la ligne", "incident"],
    ["crowding", "Affluence élevée à Nation", "incident"],
    ["strike", "Mouvement social régional", "incident"],
    ["weather", "Circulation adaptée en raison de la neige", "incident"],
    ["safety", "Intervention de police à République", "incident"],
    ["technical", "Panne de signalisation", "incident"],
    ["information", "Conseil aux voyageurs", "information"],
    ["incident", "Obstacle sur la voie", "unknown"],
  ] as const)("classifies %s disruptions with a safe fallback", (expected, title, kind) => {
    expect(classifyPatternTrafficIncident(createDisruption(title, kind))).toBe(
      expected,
    );
  });

  it("formats full-day, bounded, starting and ending windows", () => {
    const day = new Date(2026, 6, 18);
    expect(
      getPatternTrafficSummaryTimeWindow(
        createEvent(new Date(2026, 6, 17), new Date(2026, 6, 19)),
        day,
      ),
    ).toEqual({ kind: "all-day" });
    expect(
      getPatternTrafficSummaryTimeWindow(
        createEvent(new Date(2026, 6, 18, 7), new Date(2026, 6, 18, 11)),
        day,
      ),
    ).toEqual({ kind: "range", start: "07:00", end: "11:00" });
    expect(
      getPatternTrafficSummaryTimeWindow(
        createEvent(new Date(2026, 6, 18, 20), new Date(2026, 6, 19, 2)),
        day,
      ),
    ).toEqual({ kind: "from", start: "20:00" });
    expect(
      getPatternTrafficSummaryTimeWindow(
        createEvent(new Date(2026, 6, 17, 22), new Date(2026, 6, 18, 2)),
        day,
      ),
    ).toEqual({ kind: "until", end: "02:00" });
  });

  it("turns IDFM period-only titles into timing instead of incident copy", () => {
    const periodOnly = createDisruption(
      "Période : De 14h à Fin de Service",
      "information",
    );
    periodOnly.message =
      "Période : De 14h à Fin de Service\nAffluence élevée à Châtelet";
    const event = createEvent(
      new Date(2026, 6, 18),
      new Date(2026, 6, 18, 23, 59),
      periodOnly,
    );
    event.startTimeLabel = getTrafficDisruptionStartClockTime(periodOnly)?.label;
    event.restartTimeLabel = "23:59";

    const [entry] = createPatternTrafficSummaryEntries(createDay([event]));
    expect(entry.title).toBe("Affluence élevée à Châtelet");
    expect(entry.timeWindows).toEqual([{ kind: "from", start: "14:00" }]);
  });

  it("groups repeated periods of one incident while preserving distinct incidents", () => {
    const repeated = createDisruption("Travaux de nuit", "works", "works");
    const other = createDisruption("Affluence élevée", "incident", "crowding");
    const day = createDay([
      createEvent(new Date(2026, 6, 18, 1), new Date(2026, 6, 18, 4), repeated),
      createEvent(new Date(2026, 6, 18, 22), new Date(2026, 6, 18, 23), repeated),
      createEvent(new Date(2026, 6, 18), new Date(2026, 6, 19), other),
    ]);

    const entries = createPatternTrafficSummaryEntries(day);
    expect(entries).toHaveLength(2);
    expect(entries[0].timeWindows).toEqual([
      { kind: "range", start: "01:00", end: "04:00" },
      { kind: "range", start: "22:00", end: "23:00" },
    ]);
    expect(entries[1]).toMatchObject({ incidentType: "crowding" });
  });

  it("consolidates visually identical IDFM impacts", () => {
    const first = createDisruption("Grands Travaux d'été", "works", "works-a");
    const second = createDisruption("Grands Travaux d'été", "works", "works-b");
    first.impactedStopNames = ["Gare du Nord"];
    second.impactedStopNames = ["Le Bourget"];
    const entries = createPatternTrafficSummaryEntries(
      createDay([
        createEvent(new Date(2026, 6, 18), new Date(2026, 6, 19), first),
        createEvent(new Date(2026, 6, 18), new Date(2026, 6, 19), second),
      ]),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      incidentType: "works",
      impactedStopNames: ["Gare du Nord", "Le Bourget"],
    });
  });

  it("keeps an explicit service interruption distinct from its works cause", () => {
    const closure = createDisruption(
      "Le trafic est interrompu entre Châtelet et Gare du Nord",
      "works",
    );
    closure.message = "Cette interruption est liée à des travaux.";

    expect(classifyPatternTrafficIncident(closure)).toBe("interruption");
  });
});

function createDisruption(
  title: string,
  kind: TrafficDisruption["kind"],
  id = title,
): TrafficDisruption {
  return {
    id,
    title,
    kind,
    applicationPeriods: [],
    impactedLineRefs: [],
    impactedStopNames: [],
  };
}

function createEvent(
  start: Date,
  end: Date | undefined,
  eventDisruption = createDisruption("Incident", "incident"),
): PatternTrafficCalendarEvent {
  return {
    id: `${eventDisruption.id}:${start.getTime()}`,
    disruption: eventDisruption,
    period: {},
    start,
    end,
    impactAnalysis: { segments: [], stationImpacts: {}, edgeImpacts: {} },
    kind: "disturbance",
    interruptedStationKeys: [],
    disturbedStationKeys: [],
    affectedEdgeKeys: [],
    affectedSegmentLabels: [],
    fallbackStationKeys: [],
  };
}

function createDay(events: PatternTrafficCalendarEvent[]): PatternTrafficCalendarDay {
  return {
    id: "traffic-calendar:2026-07-18",
    date: new Date(2026, 6, 18),
    dateKey: "2026-07-18",
    inCurrentMonth: true,
    isToday: false,
    isPast: false,
    events,
    impactCount: new Set(events.map((event) => event.disruption.id)).size,
    interruptedStationLabels: [],
    disturbedStationLabels: [],
    affectedSegmentLabels: [],
  };
}
