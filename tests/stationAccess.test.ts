import { describe, expect, it, vi } from "vitest";
import { DEFAULT_OPTIMIZER_SETTINGS, enumerateOptimizerCandidates, optimizerBaselineCourses } from "../src/features/line-optimizer/lineOptimizer";
import { createLineOptimizerProvider } from "../src/features/line-optimizer/lineOptimizerProvider";
import { velizyOptimizerConfig } from "../src/features/line-optimizer/optimizerConfig";
import { stationAccessJourneys, stationAccessUltimateJourney } from "../src/features/line-optimizer/stationAccessJourneys";
import { resolveStationAccessDestination, stationAccessLines, stationAccessTargets } from "../src/features/line-optimizer/stationAccessTargets";
import { rankStationAccessRows } from "../src/features/line-optimizer/useStationAccessOptimizer";
import type { NearbyJourneyRequest, NearbyJourneySection } from "../src/features/nearby-stations/nearbyHeavyTransports";
import { parisDateTime, turboTime } from "../src/features/nearby-stations/travelTurbo";
import type { GlobalMapLine, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";
import type { GpeMapStation } from "../src/features/transport-map/gpeStationsApi";
import { createTravelTurboProvider } from "../src/services/travelRoutes/travelTurboProvider";

const origin = { lon: 2.26, lat: 48.765, label: "Châtenay-Malabry" };
const start = turboTime("20261117T083000")!;
const settings = { ...DEFAULT_OPTIMIZER_SETTINGS, walkSeconds: undefined, transferSeconds: undefined };
const at = (minutes: number) => new Date(start + minutes * 60_000).toISOString();
const walk = (durationSeconds: number): NearbyJourneySection => ({ type: "street_network", mode: "walking", durationSeconds });
const ride = (lineMode: NearbyJourneySection["lineMode"], lineCode: string, departure: number, arrival: number): NearbyJourneySection => ({
  type: "public_transport", lineMode, lineCode, lineId: `line:${lineCode}`,
  departureDateTime: at(departure), arrivalDateTime: at(arrival), durationSeconds: (arrival - departure) * 60,
  timingSource: "schedule",
});
const stationCandidate = (id: string, sections: NearbyJourneySection[]) => {
  const route = { id, sections, transitSections: sections.filter(({ lineMode }) => lineMode), durationSeconds: 0 };
  return enumerateOptimizerCandidates(route, optimizerBaselineCourses(route), settings, start, "station-access")[0]!;
};
const project = (id: string, name: string, line: string, lat: number): GpeMapStation => ({
  id, name, line, lat, lon: origin.lon, projectStatus: "under-construction", verifiedAt: "2026-09-01",
});

describe("station access", () => {
  it("groups timetable comparisons by lines while keeping the first discovered route on a tie", async () => {
    const destination = { ...origin, label: "Gare" };
    const routes = [
      { id: "first", sections: [ride("BUS", "195", 6, 30)] },
      { id: "second", sections: [ride("BUS", "194", 6, 30)] },
      { id: "third", sections: [walk(60), ride("BUS", "195", 6, 30)] },
    ].map((route) => ({ ...route, durationSeconds: 1440 }));
    const compared: string[] = [];
    const provider = createLineOptimizerProvider({
      journeys: async ({ datetime }) => datetime === parisDateTime(start) ? routes : [],
      courses: async ({ route }) => {
        const [leg] = route.transitSections;
        compared.push(leg!.lineCode!);
        const sections = [ride("BUS", leg!.lineCode!, 6, 16)];
        return { batches: optimizerBaselineCourses({ ...route, sections }), complete: true, analyzedAt: at(0) };
      },
    });
    const { candidate } = await provider.analyzeUltimateStationAccess({
      origin, destination, settings, start, signal: new AbortController().signal,
    });
    expect(compared).toEqual(["194", "195", "195"]);
    expect(candidate?.route.id).toMatch(/:first$/);
    expect(candidate?.arriveAt).toBe(start + 16 * 60_000);
  });

  it("applies the requested transfer limit to route discovery and scheduled journeys", async () => {
    const destination = { ...origin, id: "stop_area:station", label: "Gare" };
    const journeys = vi.fn(async (_request: NearbyJourneyRequest) => [
      { id: "two-changes", durationSeconds: 540, sections: [
        ride("BUS", "194", 2, 5), ride("TRAM", "T6", 6, 8), ride("METRO", "13", 9, 11),
      ] },
      { id: "one-change", durationSeconds: 1200, sections: [
        ride("BUS", "294", 4, 20), ride("METRO", "13", 21, 24),
      ] },
      { id: "direct", durationSeconds: 2160, sections: [ride("BUS", "195", 32, 68)] },
    ]);
    const provider = createLineOptimizerProvider({
      journeys, courses: async () => ({ batches: [], complete: false, analyzedAt: at(0) }),
    });
    const request = { origin, destination, settings, start, signal: new AbortController().signal };
    const analyze = provider.createStationAccessSession(false);
    const unrestricted = await analyze(request);
    expect(unrestricted.candidates[0]?.courses).toHaveLength(3);

    const capped = { ...request, maxTransfers: 1 };
    const progress: number[] = [];
    journeys.mockClear();
    const result = await analyze({ ...capped, onProgress: (percent) => progress.push(percent) });
    expect(journeys.mock.calls.map(([options]) => options.maxTransfers)).toEqual([1, 0]);
    expect(progress).toEqual([25, 50, 75, 100]);
    for (const mode of ["now", "zeroWait"] as const) {
      expect(stationAccessJourneys(result, origin, destination, start, 60, mode)[0]?.transfers).toBe(1);
    }
    expect(result.candidates.every(({ courses }) => courses.length <= 2)).toBe(true);

    journeys.mockClear();
    const ultimate = await provider.analyzeUltimateStationAccess(capped);
    expect(ultimate.candidate?.courses).toHaveLength(2);
    expect(new Set(journeys.mock.calls.map(([options]) => options.maxTransfers))).toEqual(new Set([1, 0]));

    const directOnly = { ...request, maxTransfers: 0 };
    journeys.mockClear();
    const direct = await analyze(directOnly);
    expect(direct.candidates).toHaveLength(1);
    expect(direct.candidates[0]?.courses).toHaveLength(1);
    expect(journeys.mock.calls.map(([options]) => options.maxTransfers)).toEqual([0]);

    journeys.mockClear();
    const ultimateDirect = await provider.analyzeUltimateStationAccess(directOnly);
    expect(ultimateDirect.candidate?.courses).toHaveLength(1);
    const directRequests = journeys.mock.calls.map(([options]) => options);
    expect(directRequests.every(({ maxTransfers }) => maxTransfers === 0)).toBe(true);
    expect(new Set(directRequests.map(({ datetime }) => datetime)).size).toBe(directRequests.length);
  });

  it("finds a shorter afternoon trip with a faster bus and a tight transfer", async () => {
    const reference = turboTime("20261117T060000")!;
    const destination = { ...origin, id: "stop_area:station", label: "Gare" };
    const morning = [walk(120), ride("BUS", "194", -140, -108), walk(120),
      ride("TRAM", "T6", -100, -85), walk(120)];
    const afternoon = [walk(120), ride("BUS", "194", 393, 403), walk(120),
      ride("TRAM", "T6", 406, 411), walk(120)];
    const dated = (sections: NearbyJourneySection[]) => optimizerBaselineCourses({
      id: "trips", durationSeconds: 0, sections, transitSections: sections.filter((section) => section.lineMode),
    });
    // First available tram at 15:15 is overtaken by the 15:16 tram.
    const [lateBus, fastTram] = dated(afternoon);
    const [morningBus, morningTram] = dated(morning);
    const [, slowTram] = dated([ride("BUS", "194", 393, 403), ride("TRAM", "T6", 405, 421)]);
    const journeys = vi.fn(async (request: NearbyJourneyRequest) => {
      if (request.maxTransfers === 0 || request.datetime !== "20261117T060000") return [];
      return [{ id: "bus-tram", durationSeconds: 0, sections: morning }];
    });
    const courses = vi.fn(async () => ({
      batches: [[...morningBus!, ...lateBus!], [...morningTram!, ...slowTram!, ...fastTram!]],
      complete: true, analyzedAt: at(0),
    }));
    const progress: number[] = [];
    const { candidate, complete } = await createLineOptimizerProvider({ journeys, courses }).analyzeUltimateStationAccess({
      origin, destination, start: reference, settings, signal: new AbortController().signal,
      onProgress: (percent) => progress.push(percent),
    });
    expect(complete).toBe(true);
    expect(progress).toHaveLength(journeys.mock.calls.length + courses.mock.calls.length);
    expect(progress.slice(-2)).toEqual([50, 100]);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(journeys.mock.calls.map(([{ datetime }]) => datetime)).toContain("20261117T230000");
    expect(journeys.mock.calls.every(([request]) => request.dataFreshness === "base_schedule")).toBe(true);
    expect(courses).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      start: turboTime("20261117T000000"), horizonSeconds: 28 * 3600, realtime: false,
    }));
    const journey = stationAccessUltimateJourney(candidate!, origin, destination);
    expect(journey).toMatchObject({
      kind: "ultimate", recommendedDeparture: turboTime("20261117T150000"), arrival: turboTime("20261117T152300"),
      transfers: 1, walkingSeconds: 360, itinerary: { totalWaitSeconds: 60, route: { durationSeconds: 23 * 60 } },
    });
    expect(journey.itinerary.steps.filter(({ kind }) => kind === "wait").map(({ courseIndex }) => courseIndex)).toEqual([1]);
  });

  it("accepts a late trip with a midnight connection while excluding departures on the next Paris day", async () => {
    const destination = { ...origin, label: "Gare" };
    const legs = [walk(120), ride("BUS", "194", 931, 933), walk(120), ride("TRAM", "T6", 935, 937)];
    const dated = optimizerBaselineCourses({ id: "night", durationSeconds: 420, sections: legs, transitSections: [] });
    const [bus, tram] = dated.map((batch) => batch[0]!);
    const courses = vi.fn(async () => ({ complete: true, analyzedAt: at(0), batches: [
      [bus, { ...bus, id: "next-day-bus", departure: turboTime("20261118T000300")!, arrival: turboTime("20261118T000400")! }],
      [tram, { ...tram, id: "next-day-tram", departure: turboTime("20261118T000600")!, arrival: turboTime("20261118T000700")! }],
    ] }));
    const { candidate } = await createLineOptimizerProvider({
      journeys: async () => [{ id: "night", durationSeconds: 420, sections: legs }], courses,
    }).analyzeUltimateStationAccess({ origin, destination, start, settings, signal: new AbortController().signal });
    expect(candidate).toMatchObject({
      leaveAt: turboTime("20261117T235800"), arriveAt: turboTime("20261118T000700"), totalWaitSeconds: 0,
    });
  });

  it("uses the faster transit arrival at the farther Metro 15 station and keeps walking complementary", async () => {
    const [closer, farther] = stationAccessTargets(stationAccessLines(undefined, [
      project("cm", "Châtillon–Montrouge", "15", 48.79),
      project("ac", "Arcueil–Cachan", "15", 48.803),
      project("vg", "Villejuif–Gustave Roussy", "1514", 48.82),
    ]).find((line) => line.code === "15")!, undefined, origin, 5_000);

    const journeys = vi.fn(async (request: NearbyJourneyRequest) => {
      const viaBus = request.destination.lat === closer!.point.lat;
      return [{
        id: viaBus ? "direct-bus" : "tram-rer", durationSeconds: viaBus ? 2160 : 1320,
        sections: viaBus ? [walk(120), ride("BUS", "194", 7, 34), walk(120)] :
          [walk(120), ride("TRAM", "T10", 6, 10), walk(120), ride("RER", "B", 13, 20), walk(120)],
      }, { id: "walking", durationSeconds: 900, sections: [walk(900)] }];
    });
    const provider = createLineOptimizerProvider({
      journeys,
      courses: vi.fn(async () => ({ batches: [], complete: false, analyzedAt: at(0) })),
    });
    const analyze = provider.createStationAccessSession(false);
    const signal = new AbortController().signal;
    const rows = await Promise.all([closer!, farther!].map(async (target) => {
      const result = await analyze({ origin, destination: target.point, settings, start, signal });
      return { target, state: "ready" as const, options: stationAccessJourneys(result, origin, target.point, start, 60) };
    }));

    for (const [request] of journeys.mock.calls) {
      expect(request.datetime).toBe(parisDateTime(start + 60_000));
      expect(request.dataFreshness).toBe("base_schedule");
      expect(request.allowedModes).toBeUndefined();
      expect(request.maxTransfers).toBeUndefined();
    }
    expect(closer!.distanceMeters).toBeLessThan(farther!.distanceMeters);
    expect(rankStationAccessRows(rows).map(({ target }) => target.point.label)).toEqual(["Arcueil–Cachan", "Châtillon–Montrouge"]);
    const [fastest, onFoot] = rows[1]!.options;
    expect(fastest).toMatchObject({ kind: "fastest", walkingSeconds: 360, transfers: 1, itinerary: { totalWaitSeconds: 240 } });
    expect(fastest!.itinerary.route.durationSeconds).toBe(22 * 60);
    expect(fastest!.itinerary.steps[0]).toMatchObject({ kind: "preparation", startAt: start });
    expect(fastest!.itinerary.steps.find((step) => step.kind === "wait" && step.courseIndex === 0))
      .toMatchObject({ startAt: start + 180_000, endAt: start + 360_000 });
    expect(onFoot!.kind).toBe("walkOnly");
    expect(onFoot!.arrival).toBeLessThan(fastest!.arrival);

    const single = await provider.analyze({ config: velizyOptimizerConfig, origin, destination: farther!.point, settings, start, signal });
    expect(at(fastest!.itinerary.route.durationSeconds / 60)).toBe(new Date(single.candidates[0]!.arriveAt).toISOString());
  });

  it("keeps the earliest arrival for Leave now and recommends a timely semi-direct departure for Zero wait", () => {
    const destination = { ...origin, label: "Gare" };
    const direct = stationCandidate("direct", [walk(120), ride("BUS", "194", 6, 20)]);
    const semiDirect = stationCandidate("express", [
      walk(120), ride("TRAM", "T10", 8, 11), walk(120),
      { ...ride("RER", "B", 14, 23), serviceType: "semi-direct" },
    ]);
    const tooLate = stationCandidate("late", [
      walk(120), ride("TRAM", "T10", 10, 13), walk(120),
      { ...ride("RER", "B", 15.5, 31), serviceType: "semi-direct" },
    ]);
    const result = { candidates: [direct, semiDirect, tooLate], walkingRoutes: [] };
    expect(stationAccessJourneys(result, origin, destination, start, 60)[0])
      .toMatchObject({ kind: "fastest", arrival: start + 20 * 60_000, itinerary: { totalWaitSeconds: 180 } });
    const [recommended] = stationAccessJourneys(result, origin, destination, start, 60, "zeroWait");
    expect(recommended).toMatchObject({
      kind: "recommended", semiDirect: true, recommendedDeparture: start + 5 * 60_000,
      arrival: start + 23 * 60_000, itinerary: { totalWaitSeconds: 60, route: { durationSeconds: 18 * 60 } },
    });
    expect(recommended!.itinerary.steps.filter((step) => step.kind === "wait").map((step) => step.courseIndex)).toEqual([1]);
    const [outOfTolerance] = stationAccessJourneys({
      ...result, candidates: [{ ...direct, totalWaitSeconds: 0 }, { ...semiDirect, totalWaitSeconds: 121 }],
    }, origin, destination, start, 60, "zeroWait");
    expect(outOfTolerance?.semiDirect).toBe(false);
  });

  it("prefers staying on a semi-direct RER B in Zero wait when a second RER B would save little time", () => {
    const destination = { ...origin, label: "Arcueil - Cachan" };
    const feeder = [walk(120), ride("TRAM", "T10", 6, 10), walk(120)];
    const change = stationCandidate("bourg-la-reine", [
      ...feeder, ride("RER", "B", 12.5, 15), walk(30),
      { ...ride("RER", "B", 16, 23), serviceType: "semi-direct" },
    ]);
    const stay = stationCandidate("stay-on-b", [
      ...feeder, { ...ride("RER", "B", 13.5, 24), serviceType: "semi-direct" },
    ]);
    const result = { candidates: [change, stay], walkingRoutes: [] };
    const [recommended] = stationAccessJourneys(result, origin, destination, start, 60, "zeroWait");
    expect(recommended).toMatchObject({ transfers: 1, semiDirect: true, arrival: stay.arriveAt });
    expect(recommended!.itinerary.route.transitSections.map(({ lineCode }) => lineCode)).toEqual(["T10", "B"]);
    expect(stationAccessJourneys(result, origin, destination, start, 60)[0]?.arrival).toBe(change.arriveAt);
    expect(stationAccessJourneys({ ...result, candidates: [change] }, origin, destination, start, 60, "zeroWait")[0]?.transfers).toBe(2);
  });

  it("uses an interchange's individual line membership and requires public service evidence to reconcile it", () => {
    const line14 = { id: "line:IDFM:C014", code: "C014", label: "14", mode: "METRO", stationIds: ["station:vg"] } as GlobalMapLine;
    const station = {
      id: "station:vg", name: "Villejuif–Gustave Roussy", aliases: [], rawRefs: [],
      lineIds: [line14.id], lat: 48.795, lon: 2.26,
    } as unknown as GlobalMapStation;
    const network = {
      lines: [line14], stations: [station],
      entrances: [{ stationId: station.id, lat: 48.7949, lon: 2.26 }],
    } as unknown as TransportMapNetwork;
    const future = project("vg", "Villejuif Institut Gustave Roussy", "1514", 48.795);
    const lines = stationAccessLines(network, [future]);
    expect(lines.map(({ code }) => code)).toEqual(["14", "15"]);
    const publicStations = new Set([station.id]);
    expect(stationAccessTargets(lines[0]!, network, origin, 5000, publicStations)).toMatchObject([
      { id: station.id, future: false, approximate: false, point: { lat: 48.7949 } },
    ]);
    expect(stationAccessTargets(lines[1]!, network, origin, 5000, publicStations)).toMatchObject([
      { id: "gpe:vg", future: true, approximate: true },
    ]);
  });

  it("routes to a nearby existing rail hub with a matching name while keeping the future metro status", async () => {
    const rer = { id: "line:B", code: "B", label: "B", mode: "RER", stationIds: ["station:arcueil"] } as GlobalMapLine;
    const operationalHub = {
      id: "station:arcueil", name: "Arcueil–Cachan", aliases: [],
      rawRefs: ["stop_area:IDFM:70263"],
      lineIds: [rer.id], lat: 48.798698, lon: 2.328093,
    } as unknown as GlobalMapStation;
    const network = { lines: [rer], stations: [operationalHub], entrances: [] } as unknown as TransportMapNetwork;
    const futureGare = { ...project("arcueil", "Arcueil - Cachan", "15", 48.797458), lon: 2.328342 };
    const metro = stationAccessLines(network, [futureGare]).find(({ code }) => code === "15")!;
    const [target] = stationAccessTargets(metro, network, origin, 10_000);
    expect(target).toMatchObject({
      future: true, arrivalAtExistingStation: true, approximate: false,
      point: { id: "stop_area:IDFM:70263", lat: operationalHub.lat, lon: operationalHub.lon },
    });
    const provider = createLineOptimizerProvider({
      journeys: async (request) => {
        expect(request.destination.id).toBe("stop_area:IDFM:70263");
        return [{
          id: "arrives-at-hub", durationSeconds: 1200,
          sections: [walk(120), ride("RER", "B", 6, 20), { type: "crow_fly", durationSeconds: 0 }],
        }];
      },
      courses: async () => ({ batches: [], complete: false, analyzedAt: at(0) }),
    });
    const result = await provider.createStationAccessSession(false)({
      origin, destination: target!.point, settings, start, signal: new AbortController().signal,
    });
    const [option] = stationAccessJourneys(result, origin, target!.point, start, 60, "zeroWait");
    expect(option?.itinerary.steps.at(-1)?.kind).toBe("transit");
    expect(option?.arrival).toBe(start + 20 * 60_000);
    const [unmatched] = stationAccessTargets({ ...metro, projects: [{ ...futureGare, name: "Autre gare" }] }, network, origin, 10_000);
    expect(unmatched).toMatchObject({ future: true, approximate: true, point: { lat: futureGare.lat, lon: futureGare.lon } });
    expect(unmatched?.point.id).toBeUndefined();
  });

  it("uses the existing Pont de Sèvres stop area when the project pin is farther from the metro platform", async () => {
    const line9 = { id: "line:9", code: "9", label: "9", mode: "METRO", stationIds: ["station:pont"] } as GlobalMapLine;
    const station = {
      id: "station:pont", name: "Pont de Sèvres", aliases: [],
      rawRefs: ["station:FR::Quay:50026379:FR1"], lineIds: [line9.id], lat: 48.829809, lon: 2.231293,
    } as unknown as GlobalMapStation;
    const network = { lines: [line9], stations: [station], entrances: [] } as unknown as TransportMapNetwork;
    const future = { ...project("pont", "Pont de Sèvres", "15", 48.827291), lon: 2.230480 };
    const metro = stationAccessLines(network, [future]).find(({ code }) => code === "15")!;
    const address = { lon: 2.21082, lat: 48.786022, label: "10 rue Marcel Dassault" };
    const [target] = stationAccessTargets(metro, network, address, 5_000);
    expect(target).toMatchObject({ future: true, arrivalAtExistingStation: true, point: { lat: station.lat, lon: station.lon } });
    const signal = new AbortController().signal;
    const destination = await resolveStationAccessDestination(target!, signal, async () => [
      { id: "stop_area:IDFM:70698", label: "Pont de Sèvres (Boulogne-Billancourt)", lat: 48.829806, lon: 2.230742 },
    ]);
    expect(destination.id).toBe("stop_area:IDFM:70698");
    const provider = createLineOptimizerProvider({
      journeys: async ({ destination: point }) => [{
        id: "6140", durationSeconds: 900, sections: [ride("BUS", "6140", 2, 17),
          point.id === "stop_area:IDFM:70698" ? { type: "crow_fly", durationSeconds: 0 } : walk(751)],
      }],
      courses: async () => ({ batches: [], complete: false, analyzedAt: at(0) }),
    });
    const result = await provider.createStationAccessSession(false)({ origin: address, destination, settings, start, signal });
    const [option] = stationAccessJourneys(result, address, destination, start, settings.exitSeconds);
    expect(option).toMatchObject({ arrival: start + 17 * 60_000, walkingSeconds: 0,
      itinerary: { route: { durationSeconds: 17 * 60, transitSections: [{ lineCode: "6140", durationSeconds: 15 * 60 }] } } });
    expect(option?.itinerary.steps.at(-1)?.kind).toBe("transit");
  });

  it("resolves Châtillon–Montrouge to the existing stop area and keeps a direct 194 outside the arrival ceiling", async () => {
    const tram = { id: "line:T6", code: "T6", label: "T6", mode: "TRAM", stationIds: ["station:chatillon"] } as GlobalMapLine;
    const existing = {
      id: "station:chatillon", name: "Chatillon - Montrouge", aliases: [], rawRefs: [],
      lineIds: [tram.id], lat: 48.810447, lon: 2.300483,
    } as unknown as GlobalMapStation;
    const network = { lines: [tram], stations: [existing], entrances: [] } as unknown as TransportMapNetwork;
    const future = { ...project("chatillon", "Châtillon–Montrouge", "15", 48.811218), lon: 2.302360 };
    const metro = stationAccessLines(network, [future]).find(({ code }) => code === "15")!;
    const [target] = stationAccessTargets(metro, network, origin, 10_000);
    expect(target).toMatchObject({ future: true, arrivalAtExistingStation: true, point: { lat: existing.lat, lon: existing.lon } });
    expect(target!.point.id).toBeUndefined();
    const signal = new AbortController().signal;
    const search = vi.fn().mockResolvedValue([
      { id: "stop_area:IDFM:70386", label: "Pierre Sémard - Châtillon-Montrouge (Châtillon)", lat: existing.lat, lon: existing.lon },
      { id: "stop_area:IDFM:461505", label: "Châtillon - Montrouge (Bagneux)", lat: 48.810622, lon: 2.302679 },
    ]);
    const destination = await resolveStationAccessDestination(target!, signal, search);
    expect(destination.id).toBe("stop_area:IDFM:461505");
    const bus294 = { id: "294", durationSeconds: 1200, sections: [walk(90), ride("BUS", "294", 6, 20)] };
    const bus194 = {
      id: "194", durationSeconds: 2200,
      sections: [walk(120), ride("BUS", "194", 7, 36), { type: "crow_fly", durationSeconds: 0 }],
    };
    const journeys = vi.fn(async ({ maxTransfers }: NearbyJourneyRequest) =>
      maxTransfers === 0 ? [bus194, bus294] : [bus294]);
    const provider = createLineOptimizerProvider({
      journeys,
      courses: async () => ({ batches: [], complete: false, analyzedAt: at(0) }),
    });
    const result = await provider.createStationAccessSession(false)({ origin, destination, settings, start, signal });
    expect(journeys.mock.calls.map(([request]) => request.maxTransfers)).toEqual([undefined, 0]);
    const [primary, alternative] = stationAccessJourneys(result, origin, destination, start, 60, "zeroWait");
    expect(primary?.itinerary.route.transitSections[0]?.lineCode).toBe("294");
    expect(alternative).toMatchObject({ kind: "direct", transfers: 0, arrival: start + 36 * 60_000 });
    expect(alternative?.itinerary.route.transitSections[0]?.lineCode).toBe("194");
    expect(alternative?.itinerary.steps.at(-1)?.kind).toBe("transit");
  });

  it("shares timetable and monitoring lookups across stations and retries a rejected timetable", async () => {
    const timetable = vi.fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue({ status: "ready", serviceDate: "20261117", stops: [], trips: [] });
    const monitoring = vi.fn().mockResolvedValue([]);
    const load = createTravelTurboProvider({ timetable, monitoring }).createCourseSession({ limitRequests: true });
    const sections = [{
      ...ride("BUS", "194", 7, 34),
      fromStopPointId: "stop_point:IDFM:123",
      toStopPointId: "stop_point:IDFM:456",
    }];
    const route = { id: "shared", durationSeconds: 3200, sections, transitSections: sections };
    const signal = new AbortController().signal;
    const request = { route, start, signal };
    const failed = await Promise.allSettled([load(request), load(request)]);
    expect(failed.map(({ status }) => status)).toEqual(["rejected", "rejected"]);
    expect(timetable).toHaveBeenCalledTimes(1);

    await Promise.all([load(request), load(request)]);
    expect(timetable).toHaveBeenCalledTimes(2);
    expect(monitoring).toHaveBeenCalledTimes(2);
  });

  it("keeps recently used timetables within the cache limit during a comparison", async () => {
    const timetable = vi.fn(async (lineId: string) =>
      ({ lineId, source: "gtfs" as const, status: "ready" as const, serviceDate: "20261117", stops: [], trips: [] }));
    const load = createTravelTurboProvider({ timetable }).createCourseSession();
    const signal = new AbortController().signal;
    const loadLine = (lineId: string) => {
      const sections = [{
        ...ride("BUS", lineId, 7, 34), fromStopPointId: "stop_point:IDFM:123", toStopPointId: "stop_point:IDFM:456",
      }];
      return load({ route: { id: lineId, durationSeconds: 3200, sections, transitSections: sections }, start, signal, realtime: false });
    };
    for (let index = 0; index < 12; index++) await loadLine(String(index));
    await loadLine("0");
    expect(timetable).toHaveBeenCalledTimes(12);
    await loadLine("12");
    await loadLine("0");
    expect(timetable).toHaveBeenCalledTimes(13);
    await loadLine("1");
    expect(timetable).toHaveBeenCalledTimes(14);
  });
});
