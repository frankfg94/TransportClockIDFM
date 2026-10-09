import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OPTIMIZER_SETTINGS,
  enumerateOptimizerCandidates,
  rankOptimizerCandidates,
  isOptimizerRoute,
} from "../src/features/line-optimizer/lineOptimizer";
import { resolveLineOptimizerConfig } from "../src/features/line-optimizer/optimizerConfig";
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
      allowedModes: ["TRAM", "RER"],
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
