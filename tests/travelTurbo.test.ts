import { describe, expect, it, vi } from "vitest";
import { optimizeTurbo, turboFirstTransitDeparture, turboInitialWaitingSeconds, turboJourneyDurationWithoutInitialWait, turboTime, parisDateTime, type TurboCourse, type TurboObservation } from "../src/features/nearby-stations/travelTurbo";
import { applyTurboRealtime, createTravelTurboProvider, gtfsTurboTime, matchTurboObservation } from "../src/services/travelRoutes/travelTurboProvider";
import type { TravelRoute } from "../src/features/nearby-stations/useTravelRoutes";
import type { GtfsLineTimetableResponse } from "../src/types/lineFrequencyTimetable";

const start = turboTime("20260909T200000")!;
const at = (minutes: number) => start + minutes * 60_000;
const course = (id: string, dep: number, arr: number): TurboCourse => ({ id, departure: at(dep), arrival: at(arr), baseDeparture: at(dep), baseArrival: at(arr), source: "realtime" });
const route = (): TravelRoute => {
  const sections = [
    { type: "street_network", mode: "walking", durationSeconds: 120 },
    { type: "public_transport", lineId: "line:IDFM:C1", lineCode: "T10", fromStopPointId: "stop_point:IDFM:1", toStopPointId: "stop_point:IDFM:2", durationSeconds: 600, departureDateTime: new Date(at(5)).toISOString(), arrivalDateTime: new Date(at(15)).toISOString() },
    { type: "transfer", mode: "walking", durationSeconds: 180 },
    { type: "waiting", durationSeconds: 420 },
    { type: "public_transport", lineId: "line:IDFM:C2", lineCode: "B", fromStopPointId: "stop_point:IDFM:3", toStopPointId: "stop_point:IDFM:4", durationSeconds: 1500, departureDateTime: new Date(at(25)).toISOString(), arrivalDateTime: new Date(at(50)).toISOString() },
    { type: "street_network", mode: "walking", durationSeconds: 60 },
  ];
  return { id: "current", durationSeconds: 2880, sections, transitSections: [sections[1]!, sections[4]!], departureDateTime: new Date(at(3)).toISOString(), arrivalDateTime: new Date(at(51)).toISOString() };
};

describe("fixed-route Turbo engine", () => {
  it("waits at home for a later tram and uses a later semi-direct that arrives earlier", () => {
    const result = optimizeTurbo(route(), [[course("tram1", 5, 15), course("tram2", 12, 22)], [course("omnibus", 25, 50), course("express", 28, 45)]], start, true);
    const best = result.proposals.find((p) => p.id === result.winners.fastest)!;
    expect(turboTime(best.departureDateTime)).toBe(at(10));
    expect(turboTime(best.arrivalDateTime)).toBe(at(46));
    expect(best.transitSections.map((s) => s.lineId)).toEqual(route().transitSections.map((s) => s.lineId));
    expect(best.sections.filter((s) => s.type === "waiting").map((s) => s.durationSeconds)).toEqual([180]);
    expect(best.sections.filter((s) => s.mode === "walking").map((s) => s.durationSeconds)).toEqual([120, 180, 60]);
  });
  it("ranks the fastest journey by door-to-door duration, not arrival clock", () => {
    const result = optimizeTurbo(route(), [[course("early", 5, 15), course("later", 30, 40)], [course("slow", 25, 50), course("short", 45, 60)]], start, true);
    const best = result.proposals.find((p) => p.id === result.winners.fastest)!;
    expect(best.transitSections.map((section) => section.vehicleJourneyId)).toEqual(["later", "short"]);
    expect(turboTime(best.departureDateTime)).toBe(at(28));
    expect(turboTime(best.arrivalDateTime)).toBe(at(61));
    expect(best.durationSeconds).toBe(33 * 60);
  });
  it("accepts exactly walk + two minutes and rejects one second less", () => {
    const invalid = { ...course("tight", 20, 30), departure: at(20) - 1000 };
    const result = optimizeTurbo(route(), [[course("tram", 5, 15)], [invalid, course("safe", 20, 35)]], start, true);
    expect(result.proposals[0]!.transitSections[1]!.vehicleJourneyId).toBe("safe");
    expect(result.proposals[0]!.sections.find((s) => s.type === "waiting")?.durationSeconds).toBe(120);
  });
  it("minimizes platform waiting subject to the thirty-minute arrival ceiling", () => {
    const result = optimizeTurbo(route(), [[course("early", 5, 15), course("late", 30, 40), course("tooLate", 50, 60)], [course("fast", 25, 35), course("smooth", 45, 65), course("outside", 65, 66)]], start, true);
    const smooth = result.proposals.find((p) => p.id === result.winners.smooth)!;
    expect(smooth.transitSections.map((s) => s.vehicleJourneyId)).toEqual(["late", "smooth"]);
    expect(turboTime(smooth.arrivalDateTime)).toBe(at(66));
  });
  it("keeps an already optimal original without a duplicate", () => {
    const result = optimizeTurbo(route(), [[course("tram", 5, 15)], [course("train", 25, 50)]], start, true);
    expect(result.proposals).toHaveLength(1);
    expect(result.winners).toEqual({ fastest: "current", smooth: "current" });
    expect(result.currentOptimal.fastest).toBe(true);
    expect(optimizeTurbo(route(), [[course("tram", 5, 15)], [course("train", 25, 50)]], start, false).currentOptimal.fastest).toBe(false);
  });
  it("applies the hour to the origin departure, allowing later connections and arrival", () => {
    const result = optimizeTurbo(route(), [[course("edge", 62, 72), course("outside", 63, 73)], [course("train", 78, 100)]], start, true);
    expect(turboTime(result.proposals[0]!.departureDateTime)).toBe(at(60));
    expect(turboTime(result.proposals[0]!.arrivalDateTime)).toBe(at(101));
  });
  it("handles two successive transfer walks without counting initial waiting", () => {
    const journey = route();
    journey.sections.push({ type: "public_transport", durationSeconds: 600, lineId: "C3", fromStopPointId: "stop_point:IDFM:5", toStopPointId: "stop_point:IDFM:6" });
    const result = optimizeTurbo(journey, [[course("a", 5, 15)], [course("b", 20, 30)], [course("tooTight", 32, 40), course("c", 33, 43)]], start, true);
    expect(result.proposals[0]!.transitSections.map((s) => s.vehicleJourneyId)).toEqual(["a", "b", "c"]);
    expect(result.proposals[0]!.sections.filter((s) => s.type === "waiting").map((s) => s.durationSeconds)).toEqual([120, 120]);
  });
  it("never claims optimality when the search budget was exhausted", () => {
    const result = optimizeTurbo(route(), [[course("a", 5, 15), course("b", 6, 16)], [course("c", 25, 50)]], start, true, 3);
    expect(result.status).toBe("partial");
    expect(result.currentOptimal.fastest).toBe(false);
  });
  it("reports unavailable for an unsupported or disconnected leg", () => {
    expect(optimizeTurbo(route(), [[], []], start, true).status).toBe("unavailable");
    expect(optimizeTurbo(route(), [[course("a", 5, 15)], [course("b", 16, 30)]], start, true).proposals).toEqual([]);
  });
});

describe("Turbo displayed duration", () => {
  it("removes only the initial wait and keeps transfer waits in the total", () => {
    const journey: TravelRoute = {
      id: "door-to-door",
      departureDateTime: "20260909T200000",
      arrivalDateTime: "20260909T203800",
      durationSeconds: 38 * 60,
      sections: [
        { type: "public_transport", lineId: "line:IDFM:T10", lineCode: "T10", durationSeconds: 10 * 60, departureDateTime: "20260909T201100", arrivalDateTime: "20260909T202100" },
        { type: "street_network", mode: "walking", durationSeconds: 3 * 60, departureDateTime: "20260909T202100", arrivalDateTime: "20260909T202400" },
        { type: "waiting", mode: "waiting", durationSeconds: 3 * 60, departureDateTime: "20260909T202400", arrivalDateTime: "20260909T202700" },
        { type: "public_transport", lineId: "line:IDFM:C01743", lineCode: "B", durationSeconds: 10 * 60, departureDateTime: "20260909T202700", arrivalDateTime: "20260909T203700" },
        { type: "street_network", mode: "walking", durationSeconds: 60, departureDateTime: "20260909T203700", arrivalDateTime: "20260909T203800" },
      ],
      transitSections: [],
    };
    journey.transitSections = journey.sections.filter((section) => Boolean(section.lineId));
    expect(turboFirstTransitDeparture(journey)).toBe(turboTime("20260909T201100"));
    expect(turboInitialWaitingSeconds(journey)).toBe(11 * 60);
    expect(turboJourneyDurationWithoutInitialWait(journey)).toBe(27 * 60);
  });
});

describe("Turbo real-time matching", () => {
  const base = course("trip", 5, 15);
  const observation: TurboObservation = { lineId: "STIF:Line::C1:", stopId: "STIF:StopPoint:Q:1:", journeyId: "vehicle_journey:trip", departure: at(8), observedAt: start, cancelled: false };
  it("matches only official course, line and stop identity with fresh observations", () => {
    expect(matchTurboObservation([observation], base, { id: "trip" }, "line:IDFM:C1", "stop_point:IDFM:1", "departure", start)).toEqual(observation);
    for (const patch of [{ lineId: "C2" }, { stopId: "STIF:StopPoint:Q:2:" }, { observedAt: start - 121_000 }]) {
      expect(matchTurboObservation([{ ...observation, ...patch }], base, { id: "trip" }, "line:IDFM:C1", "stop_point:IDFM:1", "departure", start)).toBeUndefined();
    }
  });
  it("joins monomodal stations and complete SIRI journey tokens without confusing quays", () => {
    const rer = { ...observation, lineId: "STIF:Line::C01743:", stopId: "STIF:StopArea:SP:46007:", journeyId: "SNCF_MAGENTA_PRD:VehicleJourney::111829b7-6377-4694-8b3b-615bc6b7eadc:LOC" };
    const trip = { id: "IDFM:TN:SNCF:111829b7-6377-4694-8b3b-615bc6b7eadc" };
    expect(matchTurboObservation([rer], base, trip, "line:IDFM:C01743", "stop_point:IDFM:monomodalStopPlace:46007", "departure", start)).toEqual(rer);
    expect(matchTurboObservation([rer], base, trip, "line:IDFM:C01743", "stop_point:IDFM:46007", "departure", start)).toBeUndefined();
  });
  it("requires a unique mission and aimed-time match when no shared trip ID exists", () => {
    const fallback = { ...observation, journeyId: undefined, mission: "MISSION", aimedDeparture: at(5) };
    expect(matchTurboObservation([fallback], base, { id: "trip", headsign: "MISSION" }, "C1", "stop_point:IDFM:1", "departure", start)).toEqual(fallback);
    expect(matchTurboObservation([fallback, fallback], base, { id: "trip", headsign: "MISSION" }, "C1", "stop_point:IDFM:1", "departure", start)).toBeUndefined();
    expect(matchTurboObservation([fallback], base, { id: "trip", headsign: "MISSION" }, "C1", "stop_point:IDFM:1", "departure", start, false)).toBeUndefined();
  });
  it("propagates a known delay only as an estimate, prefers observed arrival, and preserves cancellations", () => {
    expect(applyTurboRealtime(base, observation)).toMatchObject({ departure: at(8), arrival: at(18), source: "estimated" });
    expect(applyTurboRealtime(base, observation, { ...observation, arrival: at(16) })).toMatchObject({ arrival: at(16), source: "realtime" });
    expect(applyTurboRealtime(base, { ...observation, cancelled: true })).toBeUndefined();
    expect(applyTurboRealtime(base)).toMatchObject({ departure: at(5), source: "schedule" });
  });
  it("recomputes feasibility when a delayed tram misses the connection", () => {
    const delayed = applyTurboRealtime(base, { ...observation, departure: at(10) })!;
    const result = optimizeTurbo(route(), [[delayed], [course("missed", 20, 30), course("next", 26, 40)]], start, false);
    expect(result.proposals[0]!.transitSections[1]!.vehicleJourneyId).toBe("next");
  });
});

describe("Paris and GTFS service times", () => {
  it("parses civil dates independently of the device timezone", () => {
    expect(new Date(turboTime("20260909T200000")!).toISOString()).toBe("2026-09-09T18:00:00.000Z");
    expect(parisDateTime(turboTime("20260109T200000")!)).toBe("20260109T200000");
    expect(turboTime("invalid")).toBeUndefined();
  });
  it("handles after-midnight calls and the runtime's previous-service-day offsets", () => {
    expect(gtfsTurboTime("20260909", "20260909", 25 * 3600)).toBe(turboTime("20260910T010000"));
    expect(gtfsTurboTime("20260910", "20260909", 3600)).toBe(turboTime("20260910T010000"));
  });
  it("uses the GTFS noon anchor across daylight saving changes", () => {
    expect(gtfsTurboTime("20261025", "20261025", 12 * 3600)).toBe(turboTime("20261025T120000"));
    expect(gtfsTurboTime("20260329", "20260329", 12 * 3600)).toBe(turboTime("20260329T120000"));
  });
});

describe("Turbo provider", () => {
  it("keeps the selected Navitia services when its schedule is newer than GTFS", async () => {
    const initial = route();
    initial.transitSections.forEach((s, i) => { s.vehicleJourneyId = `new-service-${i}`; });
    const provider = createTravelTurboProvider({
      timetable: async (lineId) => ({ lineId, source: "gtfs", status: "missing", serviceDate: "20260909", stops: [], trips: [] }),
      monitoring: async () => [], now: () => start,
    });
    const result = await provider.analyze({ route: initial, start, signal: new AbortController().signal });
    expect(result.status).toBe("partial");
    expect(result.winners.fastest).toBe("current");
    expect(result.proposals).toHaveLength(1);
  });
  it("uses GTFS calls and marks missing real time as partial without pretending the original is optimal", async () => {
    const timetable = vi.fn(async (lineId: string): Promise<GtfsLineTimetableResponse> => {
      const first = lineId.endsWith("C1");
      return { lineId, serviceDate: "20260909", status: "ready", source: "gtfs",
        stops: (first ? ["1", "2"] : ["3", "4"]).map((id) => ({ id: `IDFM:${id}`, name: id })),
        trips: [{ id: lineId, serviceDate: "20260909", calls: [
          { stopId: first ? "IDFM:1" : "IDFM:3", sequence: 1, arrival: 72000 + (first ? 5 : 25) * 60, departure: 72000 + (first ? 5 : 25) * 60, pickupType: 0, dropOffType: 0 },
          { stopId: first ? "IDFM:2" : "IDFM:4", sequence: 2, arrival: 72000 + (first ? 15 : 50) * 60, departure: 72000 + (first ? 15 : 50) * 60, pickupType: 0, dropOffType: 0 },
        ] }],
      };
    });
    const monitoring = vi.fn(async () => []);
    const provider = createTravelTurboProvider({ timetable, monitoring, now: () => start });
    const result = await provider.analyze({ route: route(), start, signal: new AbortController().signal });
    expect(result.status).toBe("partial");
    expect(result.proposals[0]!.id).toBe("current");
    expect(monitoring).toHaveBeenCalledTimes(4);
    expect(result.currentOptimal.fastest).toBe(false);
  });
});
