import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeparturePatternCacheKey, createDepartureServiceIdentity } from "../src/features/service-pattern/serviceClassification";
import type { Departure, LineRouteSequence, TransitBoardConfig } from "../src/types/transit";

const board: TransitBoardConfig = {
  id: "test", title: "A", city: "", line: {
    ref: "STIF:Line::test:", shortName: "X", longName: "Test", mode: "rer", color: "#000", textColor: "#fff",
  },
  monitoringPoints: [], directionGroups: [], maxDepartures: 5,
  schedule: { lineRef: "line:test", stopAreaRef: "stop_area:A" },
};
const labels = ["A", "B", "C", "D", "E"];
const lineTopology: LineRouteSequence[] = [{
  id: "full", label: "E", stops: labels.map((label) => ({
    id: `stop_area:${label}`, label,
    station: { id: `stop_area:${label}`, label, monitoringRef: `monitor:${label}` },
  })),
}];

function departure(journey = "all", current = "A"): Departure {
  return {
    id: journey, lineRef: board.line.ref, monitoringRef: `monitor:${current}`, monitoringLabel: "",
    stopName: current, destination: "E", vehicleAtStop: false,
    journeyRef: `operator:VehicleJourney::${journey}:LOC`,
    aimedDepartureTime: "2026-10-22T18:00:00Z", expectedDepartureTime: "2026-10-22T18:04:00Z",
  };
}

function mockTables(courses: Record<string, string[]>, rowLabels = labels) {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("/routes?") ? {
      routes: [{ id: "route:test", name: "A - E", direction: { name: "E" } }],
      pagination: { total_result: 1, items_on_page: 1, items_per_page: 100, start_page: 0 },
    } : {
      route_schedules: [{ display_informations: { direction: "E" }, table: {
        rows: rowLabels.map((label) => ({
          stop_point: { id: `stop_point:${label}`, name: label, stop_area: { id: `stop_area:${label}`, name: label } },
          date_times: Object.entries(courses).map(([journey, stops]) => ({
            date_time: stops.includes(label) ? `20261022T200${labels.indexOf(label)}00` : "",
            data_freshness: "realtime",
            links: [{ id: `vehicle_journey:test:${journey}`, type: "vehicle_journey" }],
          })),
        })),
      } }],
    };
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

async function pattern(stops: string[], current = "A", rowLabels = labels) {
  mockTables({ all: stops }, rowLabels);
  const { fetchDepartureCallingPattern } = await import("../src/services/idfm");
  return fetchDepartureCallingPattern({ ...board, title: current }, departure("all", current), { lineTopology, hydrateTransfers: false });
}

describe("departure service classification from the observation stop", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the same course identity when SIRI changes its expected time and display id", () => {
    const original = departure();
    const delayed = { ...original, id: "updated-siri-id", expectedDepartureTime: "2026-10-22T18:03:00Z" };
    const clock = vi.spyOn(Date, "now").mockReturnValue(180_000);
    try {
      expect(createDepartureServiceIdentity(board, delayed)).toBe(createDepartureServiceIdentity(board, original));
      expect(createDeparturePatternCacheKey(board, delayed)).toBe(createDeparturePatternCacheKey(board, original));
      const before = createDeparturePatternCacheKey(board, original);
      clock.mockReturnValue(210_000);
      expect(createDeparturePatternCacheKey(board, original)).not.toBe(before);
    } finally {
      clock.mockRestore();
    }
  });

  it("never shares a label across a different course, destination, observation stop or service date", () => {
    const original = departure();
    const key = createDepartureServiceIdentity(board, original);
    expect(createDepartureServiceIdentity(board, departure("other"))).not.toBe(key);
    expect(createDepartureServiceIdentity(board, { ...original, destination: "Other terminus" })).not.toBe(key);
    expect(createDepartureServiceIdentity({ ...board, title: "Other stop", schedule: { ...board.schedule!, stopAreaRef: "stop_area:Other" } }, original)).not.toBe(key);
    expect(createDepartureServiceIdentity(board, { ...original, aimedDepartureTime: "2026-10-23T18:00:00Z" })).not.toBe(key);
  });

  it("requires the exact departure id when no course reference is available", () => {
    const original = { ...departure(), journeyRef: undefined };
    expect(createDepartureServiceIdentity(board, { ...original, id: "another" })).not.toBe(createDepartureServiceIdentity(board, original));
  });

  it("classifies [A, B, C, D, E] as all stops", async () => {
    expect((await pattern(labels)).serviceType).toBe("omnibus");
  });
  it("classifies [A, C, E] as semi-direct", async () => {
    expect((await pattern(["A", "C", "E"])).serviceType).toBe("semi-direct");
  });
  it("counts even one skipped downstream stop", async () => {
    expect((await pattern(["A", "B", "D", "E"])).serviceType).toBe("semi-direct");
  });
  it.each(["rer", "train", "metro", "tram", "bus"] as const)("carries the geographic section through the %s calling-pattern pipeline", async (mode) => {
    mockTables({ all: ["A", "C", "D", "E"] });
    const { fetchDepartureCallingPattern } = await import("../src/services/idfm");
    const topology = lineTopology.map((sequence) => ({ ...sequence, stops: sequence.stops.map((stop, index) => ({
      ...stop, projectedX: 0, projectedY: index - 2,
    })) }));
    const result = await fetchDepartureCallingPattern({ ...board, line: { ...board.line, mode } }, departure(), { lineTopology: topology, hydrateTransfers: false });
    expect(result.serviceType).toBe("semi-direct");
    expect(result.serviceSection).toBe("south");
  });
  it("classifies an upstream semi-direct as all stops from C onwards", async () => {
    const result = await pattern(["A", "C", "D", "E"], "C");
    expect(result.serviceType).toBe("omnibus");
    expect(result.calls.filter((call) => call.served).map((call) => call.label)).toEqual(["C", "D", "E"]);
    expect(result.calls.find((call) => call.current)?.time).toBe("2026-10-22T18:04:00Z");
  });
  it("uses actual course calls when they differ from the complete theoretical pattern", async () => {
    const result = await pattern(["A", "E"]);
    expect(result.serviceType).toBe("direct");
    expect(result.calls.find((call) => call.label === "C")?.served).toBe(false);
  });
  it.each(["B", "A"])("prefers a realtime removal at %s over the same course's theoretical call", async (removed) => {
    const fetcher = mockTables({ all: labels });
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input) => {
      const response = await original(input);
      const payload = await response.json();
      for (const schedule of payload.route_schedules ?? []) {
        for (const row of schedule.table.rows) {
          if (row.stop_point.name !== removed) continue;
          const base = row.date_times[0];
          row.date_times = [{ ...base, data_freshness: "base_schedule" }, { ...base, data_freshness: "realtime", date_time: "" }];
        }
      }
      return Response.json(payload);
    });
    const { fetchDepartureCallingPattern } = await import("../src/services/idfm");
    const result = await fetchDepartureCallingPattern(board, departure(), { lineTopology, hydrateTransfers: false });
    expect(result.serviceType).toBe(removed === "A" ? "inconnu" : "semi-direct");
    expect(result.calls.find((call) => call.label === removed)?.served ?? false).toBe(false);
  });
  it("excludes an unrelated branch even when it appears in the route table", async () => {
    expect((await pattern(labels, "A", ["A", "B", "Branch", "C", "D", "E"])).serviceType).toBe("omnibus");
  });
  it("orients a reverse route table from the observation stop to the course end", async () => {
    const result = await pattern(["A", "C", "D", "E"], "C", [...labels].reverse());
    expect(result.serviceType).toBe("omnibus");
    expect(result.calls.filter((call) => call.served).map((call) => call.label)).toEqual(["C", "D", "E"]);
  });
  it("stitches NeTEx segments without counting stops on another branch", async () => {
    mockTables({ all: labels, express: ["A", "C", "E"] });
    const { fetchDepartureCallingPattern } = await import("../src/services/idfm");
    const stops = lineTopology[0].stops;
    const segments: LineRouteSequence[] = stops.slice(1).map((stop, index) => ({
      id: `segment:${index}`, label: "", stops: [stops[index], stop],
    }));
    segments.push({ id: "branch", label: "", stops: [stops[2], {
      id: "stop_area:Branch", label: "Branch", station: { id: "stop_area:Branch", label: "Branch", monitoringRef: "" },
    }] });
    const options = { lineTopology: segments, hydrateTransfers: false };
    const [all, express] = await Promise.all([
      fetchDepartureCallingPattern(board, departure("all"), options),
      fetchDepartureCallingPattern(board, departure("express"), options),
    ]);
    expect([all.serviceType, express.serviceType]).toEqual(["omnibus", "semi-direct"]);
  });
  it("keeps consecutive trains with the same destination distinct and shares route data", async () => {
    const fetcher = mockTables({ all: labels, express: ["A", "C", "E"] });
    const { fetchDepartureCallingPattern } = await import("../src/services/idfm");
    const options = { lineTopology, hydrateTransfers: false };
    const [all, express] = await Promise.all([
      fetchDepartureCallingPattern(board, departure("all"), options),
      fetchDepartureCallingPattern(board, departure("express"), options),
    ]);
    expect([all.serviceType, express.serviceType]).toEqual(["omnibus", "semi-direct"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("data_freshness=realtime");
    expect(String(fetcher.mock.calls[1]?.[0])).not.toContain("disable_disruption=true");
    expect(createDeparturePatternCacheKey(board, departure("all"))).not.toBe(createDeparturePatternCacheKey(board, departure("express")));
  });
  it("does not replace an unmatched train with the closest departure or theoretical omnibus", async () => {
    mockTables({ "all-extra": labels });
    const { fetchDepartureCallingPattern } = await import("../src/services/idfm");
    const result = await fetchDepartureCallingPattern(board, departure(), { lineTopology, hydrateTransfers: false });
    expect(result.serviceType).toBe("inconnu");
    expect(result.calls).toEqual([]);
  });
  it("does not treat a realtime call order as the route table row index", async () => {
    mockTables({ all: labels });
    const { fetchDepartureCallingPattern } = await import("../src/services/idfm");
    const result = await fetchDepartureCallingPattern({ ...board, title: "Missing" }, { ...departure(), callOrder: 3 }, { lineTopology, hydrateTransfers: false });
    expect(result.serviceType).toBe("inconnu");
  });
  it("respects cancellation before starting optional classification requests", async () => {
    const fetcher = mockTables({ all: labels });
    const { fetchDepartureCallingPattern } = await import("../src/services/idfm");
    const controller = new AbortController();
    controller.abort();
    await expect(fetchDepartureCallingPattern(board, departure(), { lineTopology, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
