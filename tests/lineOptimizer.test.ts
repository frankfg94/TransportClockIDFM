import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OPTIMIZER_SETTINGS,
  enumerateOptimizerCandidates,
  rankOptimizerCandidates,
  isOptimizerRoute,
  optimizerConnectionSteps,
} from "../src/features/line-optimizer/lineOptimizer";
import { velizyOptimizerConfig, resolveLineOptimizerConfig } from "../src/features/line-optimizer/optimizerConfig";
import { createLineOptimizerProvider } from "../src/features/line-optimizer/lineOptimizerProvider";
import { inferCourseServiceType } from "../src/services/travelRoutes/travelTurboProvider";
import { turboTime, type TurboCourse } from "../src/features/nearby-stations/travelTurbo";
import type { TravelRoute } from "../src/features/nearby-stations/useTravelRoutes";
import type { NearbyJourneyRequest } from "../src/features/nearby-stations/nearbyHeavyTransports";

const start = turboTime("20261008T100000")!;
const at = (minutes: number) => start + minutes * 60_000;
const course = (
  id: string,
  departure: number,
  arrival: number,
  serviceType?: TurboCourse["serviceType"],
): TurboCourse => ({
  id,
  departure: at(departure),
  arrival: at(arrival),
  baseDeparture: at(departure),
  baseArrival: at(arrival),
  source: "schedule",
  serviceType,
});
const config = resolveLineOptimizerConfig("tram", "T10")!;
const route = (): TravelRoute => {
  const sections = [
    { type: "street_network", mode: "walking", durationSeconds: 90 },
    { type: "waiting", durationSeconds: 600 },
    {
      type: "public_transport",
      lineId: "line:IDFM:C02317",
      lineCode: "T10",
      lineMode: "TRAM" as const,
      fromStopPointId: "stop_point:IDFM:1",
      toStopPointId: "stop_point:IDFM:2",
      fromName: "La Vallée",
      toName: "La Croix de Berny (Antony)",
      durationSeconds: 600,
      departureDateTime: new Date(at(5)).toISOString(),
      arrivalDateTime: new Date(at(15)).toISOString(),
    },
    { type: "transfer", durationSeconds: 240 },
    { type: "waiting", durationSeconds: 900 },
    {
      type: "public_transport",
      lineId: "line:IDFM:C01743",
      lineCode: "B",
      lineMode: "RER" as const,
      fromStopPointId: "stop_point:IDFM:3",
      toStopPointId: "stop_point:IDFM:4",
      fromName: "La Croix-de-Berny",
      toName: "Châtelet les Halles",
      durationSeconds: 1500,
      departureDateTime: new Date(at(30)).toISOString(),
      arrivalDateTime: new Date(at(55)).toISOString(),
    },
    { type: "street_network", mode: "walking", durationSeconds: 60 },
  ];
  return {
    id: "real",
    durationSeconds: 3000,
    sections,
    transitSections: sections.filter((s) => s.lineMode),
  };
};
const settings = { ...DEFAULT_OPTIMIZER_SETTINGS };

describe("line optimizer", () => {
  it.each([0, 1, 120])(
    "separates walking to the T10 platform from %i seconds of actual waiting",
    (tramWaitSeconds) => {
      const chained = route();
      const feeder = {
        ...chained.transitSections[0]!,
        lineCode: "T6",
        fromName: "Parc André Malraux",
        toName: "La Vallée",
      };
      chained.sections.splice(2, 0, feeder, { type: "transfer", durationSeconds: 120 });
      chained.transitSections = chained.sections.filter((section) => section.lineMode);
      const offset = tramWaitSeconds / 60;
      const candidate = enumerateOptimizerCandidates(
        chained,
        [
          [course("feeder", 5, 10)],
          [course("tram-to-croix-de-berny", 12 + offset, 22 + offset)],
          [course("rer", 30 + offset, 55 + offset)],
        ],
        settings,
        start,
        config,
      )[0]!;
      expect(candidate).toBeDefined();
      expect(optimizerConnectionSteps(candidate, 0)).toEqual([]);
      const tramSteps = optimizerConnectionSteps(candidate, 1);
      expect(tramSteps[0]).toEqual({
        kind: "walk",
        startAt: at(10),
        endAt: at(12),
        durationSeconds: 120,
      });
      expect(tramSteps.slice(1)).toEqual(
        tramWaitSeconds > 0
          ? [
              {
                kind: "wait",
                startAt: at(12),
                endAt: at(12 + offset),
                durationSeconds: tramWaitSeconds,
              },
            ]
          : [],
      );
      const rerSteps = optimizerConnectionSteps(candidate, 2);
      expect(rerSteps).toEqual([
        { kind: "walk", startAt: at(22 + offset), endAt: at(25 + offset), durationSeconds: 180 },
        { kind: "wait", startAt: at(25 + offset), endAt: at(30 + offset), durationSeconds: 300 },
      ]);
      const connectionSteps = [...tramSteps, ...rerSteps];
      expect(
        connectionSteps
          .filter((step) => step.kind === "wait")
          .reduce((sum, step) => sum + step.durationSeconds, 0),
      ).toBe(candidate.totalWaitSeconds);
      const transitSeconds = candidate.courses.reduce(
        (sum, c) => sum + (c.arrival - c.departure) / 1000,
        0,
      );
      const egressSeconds = (candidate.arriveAt - candidate.courses.at(-1)!.arrival) / 1000;
      const timelineSeconds =
        settings.exitSeconds +
        candidate.walkSeconds +
        transitSeconds +
        egressSeconds +
        connectionSteps.reduce((sum, step) => sum + step.durationSeconds, 0);
      expect(timelineSeconds).toBe((candidate.arriveAt - candidate.leaveAt) / 1000);
      expect(candidate.totalWaitSeconds).toBe(tramWaitSeconds + 300);
      expect(tramSteps[0]!.endAt).toBe(
        tramWaitSeconds ? tramSteps[1]!.startAt : candidate.tram.departure,
      );
    },
  );
  it.each([0, 180])(
    "omits waiting at an immediate RER connection after %i seconds walking",
    (transferSeconds) => {
      const candidate = enumerateOptimizerCandidates(
        route(),
        [[course("tram", 5, 15)], [course("rer", 15 + transferSeconds / 60, 40)]],
        { ...settings, transferSeconds, marginSeconds: 0 },
        start,
      )[0]!;
      expect(optimizerConnectionSteps(candidate, 1)).toEqual(
        transferSeconds
          ? [{ kind: "walk", startAt: at(15), endAt: at(18), durationSeconds: transferSeconds }]
          : [],
      );
      expect(candidate.totalWaitSeconds).toBe(0);
    },
  );
  it("chooses the second real tram for the same RER and accounts for leaving home", () => {
    const candidates = enumerateOptimizerCandidates(
      route(),
      [[course("first", 5, 15), course("second", 12, 22)], [course("rer", 30, 55)]],
      settings,
      start,
    );
    const best = rankOptimizerCandidates(candidates, settings)[0]!;
    expect(best.tram.id).toBe("second");
    expect(best.leaveAt).toBe(at(9.5));
    expect(best.walkAt).toBe(at(10.5));
    expect(best.platformAt).toBe(at(25));
    expect(best.waitSeconds).toBe(300);
    expect(best.arriveAt).toBe(at(56));
    expect(best.providerTransferSeconds).toBe(240);
  });
  it("prefers a proven semi-direct within the small extra-wait allowance", () => {
    const candidates = enumerateOptimizerCandidates(
      route(),
      [
        [course("tram", 12, 22)],
        [course("all", 26, 55, "omnibus"), course("express", 27, 48, "semi-direct")],
      ],
      settings,
      start,
    );
    expect(rankOptimizerCandidates(candidates, settings)[0]!.train.id).toBe("express");
    expect(
      rankOptimizerCandidates(candidates, { ...settings, preferSemiDirect: false })[0]!.train.id,
    ).toBe("all");
  });
  it("never trades long platform waiting for a semi-direct", () => {
    const candidates = enumerateOptimizerCandidates(
      route(),
      [
        [course("tram", 12, 22)],
        [course("all", 26, 55, "omnibus"), course("express", 35, 53, "semi-direct")],
      ],
      settings,
      start,
    );
    expect(rankOptimizerCandidates(candidates, settings)[0]!.train.id).toBe("all");
  });
  it("accepts exact transfer + margin and rejects one second short", () => {
    const batches = [
      [course("tram", 5, 15)],
      [course("tight", 18.5 - 1 / 60, 40), course("safe", 18.5, 40)],
    ];
    expect(
      enumerateOptimizerCandidates(route(), batches, settings, start).map(
        (candidate) => candidate.train.id,
      ),
    ).toEqual(["safe"]);
  });
  it("uses provider movement times on request and excludes explicit initial waits", () => {
    const candidate = enumerateOptimizerCandidates(
      route(),
      [[course("tram", 5, 15)], [course("rer", 25, 50)]],
      { ...settings, walkSeconds: undefined, transferSeconds: undefined },
      start,
    )[0]!;
    expect(candidate.leaveAt).toBe(at(2.5));
    expect(candidate.waitSeconds).toBe(360);
    expect(candidate.transferSeconds).toBe(240);
  });
  it("rejects already unreachable departures and malformed timing", () => {
    expect(
      enumerateOptimizerCandidates(
        route(),
        [[course("tooSoon", 2, 12)], [course("rer", 20, 40)]],
        settings,
        start,
      ),
    ).toEqual([]);
    expect(
      enumerateOptimizerCandidates(
        route(),
        [[course("tram", 5, 15)], [course("rer", 25, 50)]],
        { ...settings, exitSeconds: NaN },
        start,
      ),
    ).toEqual([]);
  });
  it("bounds later arrival even when a later tram has zero platform waiting", () => {
    const candidates = enumerateOptimizerCandidates(
      route(),
      [
        [course("early", 5, 15), course("late", 40, 50)],
        [course("earlyRer", 23, 43), course("lateRer", 53.5, 73.5)],
      ],
      settings,
      start,
    );
    expect(rankOptimizerCandidates(candidates, settings)[0]!.train.id).toBe("earlyRer");
  });
  it("accepts feeder and onward services and checks every connection", () => {
    const chained = route();
    const feeder = {
      ...chained.transitSections[0]!,
      lineCode: "T6",
      fromName: "Parc André Malraux",
      toName: "La Vallée",
    };
    const onward = {
      ...chained.transitSections[1]!,
      lineCode: "1",
      lineMode: "METRO" as const,
      fromName: "Châtelet les Halles",
      toName: "Destination",
    };
    chained.sections.splice(2, 0, feeder, { type: "transfer", durationSeconds: 120 });
    chained.sections.splice(
      chained.sections.length - 1,
      0,
      { type: "transfer", durationSeconds: 180 },
      onward,
    );
    chained.transitSections = chained.sections.filter((s) => s.lineMode);
    expect(isOptimizerRoute(chained, config)).toBe(true);
    const batches = [
      [course("feeder", 5, 10)],
      [course("tram", 12, 22)],
      [course("rer", 30, 55)],
      [course("onward", 58, 65)],
    ];
    const candidate = enumerateOptimizerCandidates(chained, batches, settings, start, config)[0]!;
    expect(candidate.courses.map((c) => c.id)).toEqual(["feeder", "tram", "rer", "onward"]);
    expect(candidate.leaveAt).toBe(at(2.5));
    expect(candidate.arriveAt).toBe(at(66));
    expect(candidate.waitSeconds).toBe(300);
    expect(candidate.totalWaitSeconds).toBe(300);
    expect(
      enumerateOptimizerCandidates(
        chained,
        [batches[0]!, batches[1]!, batches[2]!, [course("missed", 57, 65)]],
        settings,
        start,
        config,
      ),
    ).toEqual([]);
    expect(
      enumerateOptimizerCandidates(
        chained,
        [[course("lateFeeder", 5, 11)], ...batches.slice(1)],
        settings,
        start,
        config,
      ),
    ).toEqual([]);
  });
  it("requires the actual two-leg T10/RER B corridor and supports future route shapes without guessing", () => {
    expect(isOptimizerRoute(route(), config)).toBe(true);
    const wrong = route();
    wrong.transitSections[1]!.lineCode = "A";
    expect(isOptimizerRoute(wrong, config)).toBe(false);
    const other = route();
    other.transitSections[1]!.fromName = "Antony";
    expect(isOptimizerRoute(other, config)).toBe(false);
    expect(resolveLineOptimizerConfig("tram", "T11")).toBeUndefined();
  });
});

describe("official service patterns", () => {
  it("proves skipped stops using ordered official IDs and leaves incomparable branches unknown", () => {
    const all = ["croix", "parc", "bourg", "arcueil", "chatelet"];
    const express = ["croix", "arcueil", "chatelet"];
    expect(inferCourseServiceType(express, [all, express])).toBe("semi-direct");
    expect(inferCourseServiceType(all, [all, express])).toBe("omnibus");
    expect(inferCourseServiceType(express, [express])).toBeUndefined();
    expect(inferCourseServiceType(["croix", "robinson", "chatelet"], [all])).toBeUndefined();
  });
});

describe("real-journey provider", () => {
  const request = () => ({
    config,
    origin: { lon: 2.27, lat: 48.77 },
    destination: { lon: 2.35, lat: 48.86 },
    settings,
    start,
    signal: new AbortController().signal,
  });
  it("discovers the real route then enumerates actual courses instead of only the first itinerary", async () => {
    const journeys = vi.fn(async (_request: NearbyJourneyRequest) => [route()]);
    const courses = vi.fn(async () => ({
      batches: [[course("first", 5, 15), course("second", 12, 22)], [course("rer", 30, 55)]],
      complete: false,
      analyzedAt: new Date(start).toISOString(),
    }));
    const result = await createLineOptimizerProvider({
      journeys,
      courses,
      now: () => start,
    }).analyze(request());
    expect(result.candidates[0]!.tram.id).toBe("second");
    expect(result.complete).toBe(false);
    expect(journeys.mock.calls[0]![0]).toMatchObject({
      datetime: "20261008T100100",
      count: 20,
      includeDisruptions: true,
      dataFreshness: "realtime",
    });
  });
  it("preserves a real dated itinerary when timetable lookup fails and reports partial coverage", async () => {
    const result = await createLineOptimizerProvider({
      journeys: async () => [route()],
      courses: async () => {
        throw new Error("missing timetable");
      },
    }).analyze(request());
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.tram.departure).toBe(at(5));
    expect(result.complete).toBe(false);
  });
  it("retries corridor discovery and enumerates all three legs", async () => {
    const chained = route();
    const feeder = {
      ...chained.transitSections[0]!,
      lineCode: "T6",
      fromName: "Parc André Malraux",
      toName: "La Vallée",
    };
    chained.sections.splice(2, 0, feeder, { type: "transfer", durationSeconds: 120 });
    chained.transitSections = chained.sections.filter((s) => s.lineMode);
    const journeys = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([chained]);
    const result = await createLineOptimizerProvider({
      journeys,
      courses: async () => ({
        batches: [[course("feeder", 5, 10)], [course("tram", 12, 22)], [course("rer", 30, 55)]],
        complete: true,
        analyzedAt: new Date(start).toISOString(),
      }),
    }).analyze(request());
    expect(journeys.mock.calls[0]![0].allowedModes).toBeUndefined();
    expect(journeys.mock.calls[1]![0].allowedModes).toEqual(["TRAM", "RER"]);
    expect(result.courseCount).toBe(3);
    expect(result.candidates[0]!.courses.map((c) => c.id)).toEqual(["feeder", "tram", "rer"]);
  });
  it("does not revive a cancelled service when enumeration returned no courses", async () => {
    const result = await createLineOptimizerProvider({
      journeys: async () => [route()],
      courses: async () => ({
        batches: [[], []],
        complete: false,
        analyzedAt: new Date(start).toISOString(),
      }),
    }).analyze(request());
    expect(result.candidates).toEqual([]);
  });
  it("propagates cancellation instead of returning a stale suggestion", async () => {
    const controller = new AbortController();
    const provider = createLineOptimizerProvider({
      journeys: async () => {
        controller.abort();
        return [route()];
      },
    });
    await expect(provider.analyze({ ...request(), signal: controller.signal })).rejects.toThrow();
  });
});


describe("Vélizy destination optimizer", () => {
  it("compares tram and bus connections by arrival time", () => {
    const tram = route();
    tram.transitSections[1]!.lineCode = "T6";
    tram.transitSections[1]!.lineMode = "TRAM";
    const bus = route();
    bus.id = "bus";
    bus.transitSections[1]!.lineCode = "379";
    bus.transitSections[1]!.lineMode = "BUS";
    expect(isOptimizerRoute(tram, velizyOptimizerConfig)).toBe(true);
    expect(isOptimizerRoute(bus, velizyOptimizerConfig)).toBe(true);
    const a = enumerateOptimizerCandidates(tram, [[course("t10", 5, 15)], [course("t6", 20, 45)]], settings, start, velizyOptimizerConfig);
    const b = enumerateOptimizerCandidates(bus, [[course("t10", 5, 15)], [course("bus", 22, 35)]], settings, start, velizyOptimizerConfig);
    expect(rankOptimizerCandidates([...a, ...b], settings, true)[0]!.train.id).toBe("bus");
  });
  it("accepts a direct bus and preserves its actual arrival", () => {
    const direct = route();
    direct.sections = [direct.sections[0]!, direct.transitSections[1]!, direct.sections.at(-1)!];
    direct.transitSections = direct.sections.filter(s => s.lineMode);
    const result = enumerateOptimizerCandidates(direct, [[course("bus", 5, 35)]], settings, start, velizyOptimizerConfig);
    expect(result).toHaveLength(1);
    expect(result[0]!.arriveAt).toBe(at(36));
  });
});


it("prefers at most one bus when requested and still ranks all alternatives", () => {
  const candidate = enumerateOptimizerCandidates(route(), [[course("tram", 5, 15)], [course("bus", 20, 35)]], settings, start, velizyOptimizerConfig)[0]!;
  const oneBus = { ...candidate, id: "one", arriveAt: at(50), route: { ...candidate.route, transitSections: [{ ...candidate.route.transitSections[0]!, lineMode: "TRAM" as const }, { ...candidate.route.transitSections[1]!, lineMode: "BUS" as const, lineId: "one" }] } };
  const twoBuses = { ...candidate, id: "two", arriveAt: at(40), route: { ...candidate.route, transitSections: [{ ...candidate.route.transitSections[0]!, lineMode: "BUS" as const, lineId: "other" }, { ...candidate.route.transitSections[1]!, lineMode: "BUS" as const }] } };
  expect(rankOptimizerCandidates([twoBuses, oneBus], { ...settings, minimizeBusTransfers: true }, true).map(c => c.id)).toEqual(["one", "two"]);
  expect(rankOptimizerCandidates([twoBuses, oneBus], { ...settings, minimizeBusTransfers: false }, true)[0]!.id).toBe("two");
  expect(rankOptimizerCandidates([twoBuses], { ...settings, minimizeBusTransfers: true }, true)[0]!.id).toBe("two");
});


it("prefers up to two vehicles only within ten minutes of the earliest arrival", () => {
  const base = enumerateOptimizerCandidates(route(), [[course("tram", 5, 15)], [course("bus", 20, 35)]], settings, start, velizyOptimizerConfig)[0]!;
  const leg = base.route.transitSections[0]!;
  const fast = { ...base, id: "fast", arriveAt: at(40), route: { ...base.route, transitSections: [leg, leg, { ...leg, lineId: "extra" }] } };
  const simple = { ...base, id: "simple", arriveAt: at(50), route: { ...base.route, transitSections: [leg, { ...leg, lineId: "simple" }] } };
  const withPreference = { ...settings, limitConnections: true };
  expect(rankOptimizerCandidates([fast, simple], withPreference, true).map(c => c.id)).toEqual(["simple", "fast"]);
  expect(rankOptimizerCandidates([fast, { ...simple, arriveAt: at(50) + 1000 }], withPreference, true)[0]!.id).toBe("fast");
  expect(rankOptimizerCandidates([fast, simple], { ...settings, limitConnections: false }, true)[0]!.id).toBe("fast");
});


it("discovers simpler journeys separately when the two-vehicle preference is active", async () => {
  const simple = route();
  const three = route();
  three.id = "three";
  three.sections.splice(three.sections.length - 1, 0, { type: "transfer", durationSeconds: 60 }, { ...three.transitSections[1]!, lineId: "extra", lineCode: "6140", lineMode: "BUS" });
  three.transitSections = three.sections.filter(s => s.lineMode);
  const journeys = vi.fn().mockResolvedValueOnce([three]).mockResolvedValueOnce([simple]);
  const result = await createLineOptimizerProvider({ journeys, courses: async () => { throw new Error("no schedules"); } }).analyze({
    config: velizyOptimizerConfig, origin: { lon: 2.27, lat: 48.77 }, destination: { lon: 2.21, lat: 48.78 },
    settings: { ...settings, limitConnections: true }, start, signal: new AbortController().signal,
  });
  expect(journeys.mock.calls[1]![0].maxTransfers).toBe(1);
  expect(result.candidates[0]?.route.id).toBe("real");
});
