import { describe, expect, it } from "vitest";
import {
  calculateTrafficCalendarDurationMinutes,
  createPatternTrafficCalendarEvents,
  createPatternTrafficCalendarMonth,
  getPatternTrafficCalendarBounds,
} from "../src/features/service-pattern/trafficCalendar";
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

describe("pattern traffic calendar", () => {
  it("marks every covered day, including an event already in progress", () => {
    const now = new Date(2026, 6, 8, 12).getTime();
    const events = createPatternTrafficCalendarEvents(
      [
        createDisruption("current", [{ begin: "20260707T090000", end: "20260710T220000" }]),
        createDisruption("expired", [{ begin: "20260706T090000", end: "20260706T220000" }]),
      ],
      stations,
      edges,
      "all-impacts",
      now,
    );
    const month = createPatternTrafficCalendarMonth(
      events,
      stations,
      edges,
      new Date(2026, 6, 1),
      now,
    );

    expect(events.map((event) => event.disruption.id)).toEqual(["current"]);
    expect(
      ["2026-07-08", "2026-07-09", "2026-07-10"].map(
        (key) => month.days.find((day) => day.dateKey === key)?.impactCount,
      ),
    ).toEqual([1, 1, 1]);
  });

  it("uses a corrected textual period before technical padding", () => {
    const now = new Date(2026, 6, 9, 12).getTime();
    const [event] = createPatternTrafficCalendarEvents(
      [
        createDisruption("text-date", [{ begin: "20260708T030000", end: "20260715T030000" }], {
          message:
            "P?riode : toute la journ?e. Date : Le 14 juillet. La gare de Station A ne sera pas desservie.",
          title: "Station A non desservie le 14/7",
          impactedStopNames: ["Station A"],
        }),
      ],
      stations,
      edges,
      "all-impacts",
      now,
    );

    expect(event.start.toISOString()).toBe(new Date(2026, 6, 14).toISOString());
    expect(event.end?.toISOString()).toBe(new Date(2026, 6, 14, 23, 59, 59, 999).toISOString());
  });

  it("does not show an inclusive-until disruption on the following technical service day", () => {
    const now = new Date(2026, 6, 22, 12).getTime();
    const events = createPatternTrafficCalendarEvents(
      [
        createDisruption(
          "metro-4-july-works",
          [{ begin: "20260706T044500", end: "20260725T043000" }],
          {
            message:
              "Jusqu'au 24 juillet inclus, le trafic est interrompu entre Station A et Station D en raison de travaux.",
            title: "Trafic interrompu",
          },
        ),
      ],
      stations,
      edges,
      "all-impacts",
      now,
    );
    const month = createPatternTrafficCalendarMonth(
      events,
      stations,
      edges,
      new Date(2026, 6, 1),
      now,
    );

    expect(month.days.find((day) => day.dateKey === "2026-07-24")?.impactCount).toBe(1);
    expect(month.days.find((day) => day.dateKey === "2026-07-25")?.events).toEqual([]);
  });

  it("does not assign an early-morning technical end to the next calendar day", () => {
    const now = new Date(2026, 6, 22, 12).getTime();
    const events = createPatternTrafficCalendarEvents(
      [
        createDisruption(
          "metro-4-extended-dwell",
          [{ begin: "20260717T062600", end: "20260725T043000" }],
          {
            title: "Métro 4 : Travaux - Trafic perturbé",
            message:
              "Durant les travaux entre Les Halles et Montparnasse–B., le temps de stationnement en station peut être allongé vers Porte de Clignancourt. Nous vous remercions pour votre patience.",
          },
        ),
      ],
      stations,
      edges,
      "all-impacts",
      now,
    );
    const month = createPatternTrafficCalendarMonth(
      events,
      stations,
      edges,
      new Date(2026, 6, 1),
      now,
    );

    expect(month.days.find((day) => day.dateKey === "2026-07-24")?.impactCount).toBe(1);
    expect(month.days.find((day) => day.dateKey === "2026-07-25")?.events).toEqual([]);
  });

  it("keeps consecutive empty months through the final event month", () => {
    const now = new Date(2026, 6, 8, 12).getTime();
    const events = createPatternTrafficCalendarEvents(
      [createDisruption("september", [{ begin: "20260912T090000", end: "20260912T120000" }])],
      stations,
      edges,
      "all-impacts",
      now,
    );
    const bounds = getPatternTrafficCalendarBounds(events, now);
    const august = createPatternTrafficCalendarMonth(
      events,
      stations,
      edges,
      new Date(2026, 7, 1),
      now,
    );

    expect(bounds.firstMonth.getMonth()).toBe(6);
    expect(bounds.lastMonth.getMonth()).toBe(8);
    expect(
      august.days.filter((day) => day.inCurrentMonth).every((day) => day.events.length === 0),
    ).toBe(true);
  });

  it("filters disturbances without changing interruption events", () => {
    const now = new Date(2026, 6, 8, 12).getTime();
    const disruptions = [
      createDisruption("disturbance", [{ begin: "20260712T090000", end: "20260712T120000" }], {
        title: "Trafic perturb? entre Station A et Station D",
      }),
      createDisruption("interruption", [{ begin: "20260713T090000", end: "20260713T120000" }]),
    ];

    expect(
      createPatternTrafficCalendarEvents(disruptions, stations, edges, "all-impacts", now).map(
        (event) => event.disruption.id,
      ),
    ).toEqual(["disturbance", "interruption"]);
    expect(
      createPatternTrafficCalendarEvents(
        disruptions,
        stations,
        edges,
        "interruptions-only",
        now,
      ).map((event) => event.disruption.id),
    ).toEqual(["interruption"]);
  });

  it("unions overlapping periods and shows a reliable one-day window", () => {
    const now = new Date(2026, 6, 8, 12).getTime();
    const events = createPatternTrafficCalendarEvents(
      [createDisruption("single", [{ begin: "20260712T090000", end: "20260712T120000" }])],
      stations,
      edges,
      "all-impacts",
      now,
    );
    const day = createPatternTrafficCalendarMonth(
      events,
      stations,
      edges,
      new Date(2026, 6, 1),
      now,
    ).days.find((candidate) => candidate.dateKey === "2026-07-12");

    expect(day?.timeWindow).toBe("09:00–12:00");
    expect(day?.durationMinutes).toBe(180);
    expect(
      calculateTrafficCalendarDurationMinutes([
        {
          start: new Date(2026, 6, 12, 9),
          end: new Date(2026, 6, 12, 12),
        },
        {
          start: new Date(2026, 6, 12, 11),
          end: new Date(2026, 6, 12, 14),
        },
      ]),
    ).toBe(300);
  });

  it("deduplicates affected stations and lets interruptions win", () => {
    const now = new Date(2026, 6, 8, 12).getTime();
    const events = createPatternTrafficCalendarEvents(
      [
        createDisruption("disturbance", [{ begin: "20260712T090000", end: "20260712T120000" }], {
          title: "Trafic perturb? entre Station A et Station D",
        }),
        createDisruption("interruption", [{ begin: "20260712T130000", end: "20260712T160000" }]),
      ],
      stations,
      edges,
      "all-impacts",
      now,
    );
    const day = createPatternTrafficCalendarMonth(
      events,
      stations,
      edges,
      new Date(2026, 6, 1),
      now,
    ).days.find((candidate) => candidate.dateKey === "2026-07-12");

    expect(day?.impactCount).toBe(2);
    expect(day?.interruptedStationLabels.length).toBe(new Set(day?.interruptedStationLabels).size);
    expect(
      day?.disturbedStationLabels.some((station) => day.interruptedStationLabels.includes(station)),
    ).toBe(false);
  });
  it("downgrades a late-evening interruption while keeping unspecified hours full-day", () => {
    const now = new Date(2026, 6, 8, 12).getTime();
    const events = createPatternTrafficCalendarEvents(
      [
        createDisruption("evening", [{ begin: "20260712T224500", end: "20260713T030000" }], {
          title: "Trafic interrompu entre Station A et Station D a partir de 22h45, reprise a 3h",
        }),
        createDisruption("full-day", [{ begin: "20260714T000000", end: "20260714T235959" }]),
      ],
      stations,
      edges,
      "all-impacts",
      now,
    );
    const month = createPatternTrafficCalendarMonth(
      events,
      stations,
      edges,
      new Date(2026, 6, 1),
      now,
    );
    const evening = month.days.find((candidate) => candidate.dateKey === "2026-07-12");
    const fullDay = month.days.find((candidate) => candidate.dateKey === "2026-07-14");

    expect(events[0].impactTimeWindow).toEqual({
      startMinute: 22 * 60 + 45,
      endMinute: 3 * 60,
    });
    expect(
      evening?.severity?.stationContributions.every(
        (contribution) => contribution.temporalMultiplier === 0.09,
      ),
    ).toBe(true);
    expect(
      fullDay?.severity?.stationContributions.every(
        (contribution) => contribution.temporalMultiplier === 1,
      ),
    ).toBe(true);
    expect(evening?.severity?.score).toBeLessThan(fullDay?.severity?.score ?? 0);
    expect(evening?.severity?.level).toBe("low");
    expect(month.days.find((candidate) => candidate.dateKey === "2026-07-13")?.events).toEqual([]);
  });

  it("uses every shared textual date set instead of one broad technical period", () => {
    const now = new Date(2026, 6, 19, 12).getTime();
    const events = createPatternTrafficCalendarEvents(
      [
        createDisruption(
          "rer-e-multiple-date-sets",
          [{ begin: "20260720T000000", end: "20260807T235900" }],
          {
            message: [
              "Période : toute la journée",
              "Dates : du 20 juillet au 24 juillet",
              "Rosny-Bois-Perrier non desservie du 1/08 au 7/08 : bus de remplacement",
            ].join("\n"),
          },
        ),
      ],
      stations,
      edges,
      "all-impacts",
      now,
    );

    expect(events).toHaveLength(2);
    expect(
      events.map((event) => [
        event.start.getFullYear(),
        event.start.getMonth(),
        event.start.getDate(),
        event.end?.getFullYear(),
        event.end?.getMonth(),
        event.end?.getDate(),
      ]),
    ).toEqual([
      [2026, 6, 20, 2026, 6, 24],
      [2026, 7, 1, 2026, 7, 7],
    ]);
  });
});

function createDisruption(
  id: string,
  applicationPeriods: TrafficDisruption["applicationPeriods"],
  overrides: Partial<TrafficDisruption> = {},
): TrafficDisruption {
  return {
    id,
    title: "Trafic interrompu entre Station A et Station D",
    kind: "works",
    applicationPeriods,
    impactedLineRefs: ["line:test"],
    impactedStopNames: [],
    ...overrides,
  };
}
