import { describe, expect, it } from "vitest";
import {
  computeGtfsLineFrequency,
  getGtfsFrequencyServiceDate,
} from "../server/services/gtfs/frequencyComputation";
import {
  buildFrequencyGraph,
  findFrequencyPath,
  mapFrequencyStops,
} from "../server/services/gtfs/frequencyTopology";
import type {
  ActiveGtfsTimetableTrip,
  GtfsTimetableLoadResult,
  GtfsTimetableStop,
} from "../server/services/gtfs/timetableTypes";
import type { LineTopology } from "../server/services/topology/types";

const MONDAY = "20260831";
function topology(routes: string[][]): LineTopology {
  const ids = [...new Set(routes.flat())];
  const edges = new Map<string, [string, string]>();
  for (const route of routes)
    for (let i = 1; i < route.length; i++) {
      if (route[i - 1] !== route[i])
        edges.set(JSON.stringify([route[i - 1], route[i]].sort()), [route[i - 1]!, route[i]!]);
    }
  const degree = (id: string) => [...edges.values()].filter((edge) => edge.includes(id)).length;
  return {
    line: { id: "L", name: "Line", shortName: "L", aliases: [], mode: "rail" },
    stations: ids.map((id) => ({ id, name: id.toUpperCase(), degree: degree(id) })),
    segments: [...edges].map(([id, [from, to]]) => ({ id, from, to, patterns: [] })),
    patterns: routes.map((stops, i) => ({
      id: `p${i}`,
      terminalFrom: stops[0]!,
      terminalTo: stops.at(-1)!,
      stops,
      tripCount: 1,
    })),
    branches: [],
    loops: [],
    branchPoints: ids.filter((id) => degree(id) > 2),
    terminals: ids.filter((id) => degree(id) === 1),
  };
}
function trip(
  id: string,
  stops: string[],
  minutes: number,
  directionId?: string,
): ActiveGtfsTimetableTrip {
  return {
    id,
    serviceDate: MONDAY,
    directionId,
    calls: stops.map((stopId, sequence) => ({
      stopId,
      sequence,
      arrival: minutes * 60,
      departure: minutes * 60,
      pickupType: 0,
      dropOffType: 0,
    })),
  };
}
function series(
  stops: string[],
  minutes: number[],
  directionId?: string,
): ActiveGtfsTimetableTrip[] {
  return minutes.map((minute, i) =>
    trip(`${stops.join("-")}-${i}-${minute}`, stops, minute, directionId),
  );
}
function timetable(
  trips: ActiveGtfsTimetableTrip[],
  stops?: GtfsTimetableStop[],
): GtfsTimetableLoadResult {
  return {
    status: "ready",
    trips,
    index: {
      schemaVersion: 1,
      lineId: "L",
      startDate: MONDAY,
      endDate: "20260930",
      maxTimeSeconds: 90000,
      services: [],
      chunks: [],
      tripCount: trips.length,
      stops:
        stops ??
        [...new Set(trips.flatMap((t) => t.calls.map((c) => c.stopId)))].map((id) => ({
          id,
          name: id.toUpperCase(),
        })),
    },
  };
}
function compute(
  trips: ActiveGtfsTimetableTrip[],
  graph?: LineTopology,
  stops?: GtfsTimetableStop[],
) {
  return computeGtfsLineFrequency({
    lineId: "L",
    serviceDate: MONDAY,
    timetable: timetable(trips, stops),
    topology: graph,
  });
}

describe("GTFS civil reference weekday selection", () => {
  it.each([
    ["2026-08-30T21:59:59Z", "20260831"],
    ["2026-08-30T22:00:00Z", "20260831"],
    ["2026-08-31T21:59:59Z", "20260831"],
    ["2026-08-31T22:00:00Z", "20260901"],
    ["2026-09-01T10:00:00Z", "20260901"],
    ["2026-03-29T01:30:00Z", "20260330"],
    ["2026-10-25T01:30:00Z", "20261026"],
    ["2026-12-31T23:30:00Z", "20270101"],
  ])("selects the reference Paris weekday at %s", (instant, expected) => {
    expect(getGtfsFrequencyServiceDate(new Date(instant))).toBe(expected);
  });
});

describe("GTFS frequency computation", () => {
  it("finds seven terminal/junction chains and a unique central chain from full terminal pairs", () => {
    // Three western arms (two merging before the third), two eastern arms.
    // Labels are arbitrary: classification must not recognize RER A names.
    const west = [
      ["w1", "j1", "j2"],
      ["w2", "j1", "j2"],
      ["w3", "j2"],
    ];
    const routes = west.flatMap((w) => ["e1", "e2"].map((e) => [...w, "center", "j3", e]));
    const graph = topology(routes);
    const trips = Array.from({ length: 24 }, (_, i) =>
      trip(`t${i}`, [...west[i % 3]!, "center", "j3", i % 2 ? "e1" : "e2"], 430 + 2 * i, "0"),
    );
    const response = compute(trips, graph);
    expect(response.sections).toHaveLength(7);
    expect(response.branched).toBe(true);
    const central = response.sections.filter((section) => section.kind === "central");
    expect(central).toHaveLength(1);
    expect(central[0]!.stationIds).toEqual(["j2", "center", "j3"]);
    expect(central[0]!.average.peakMinutes).toBe(2);
    for (const origin of ["w1", "w2", "w3"]) {
      expect(
        response.sections.find((section) => section.stationIds.includes(origin))!.average
          .peakMinutes,
      ).toBe(6);
    }
    // Reversing pattern/segment input cannot change ids, senses, or classification.
    const reordered = {
      ...graph,
      segments: [...graph.segments].reverse(),
      patterns: [...graph.patterns].reverse(),
    };
    expect(compute(trips, reordered)).toEqual(response);
  });

  it("does not select a central section when maximum full-pair counts tie", () => {
    const routes = [
      ["a", "j", "b"],
      ["a", "j", "c"],
      ["b", "j", "c"],
    ];
    const response = compute(
      routes.flatMap((route) => series(route, [430, 436])),
      topology(routes),
    );
    expect(response.sections.every((section) => section.kind !== "central")).toBe(true);
  });

  it("keeps asymmetrical opposite senses separate and averages directions equally", () => {
    const graph = topology([["a", "b", "c"]]);
    const trips = [
      ...series(["a", "b", "c"], [430, 434, 438, 442, 446], "0"),
      ...series(["c", "b", "a"], [430, 438, 446], "1"),
    ];
    const response = compute(trips, graph);
    expect(response.average.peakMinutes).toBe(6);
    expect(
      response.sections[0]!.directions.map((d) => d.peakMinutes).sort((a, b) => a! - b!),
    ).toEqual([4, 8]);
    expect(response.sections[0]!.average.peakMinutes).toBe(6);
    expect(response.sampledStationCount).toBe(3);
  });

  it("preserves meaningful endpoint labels for simple line directions with GTFS ids", () => {
    const response = compute(
      [
        ...series(["a", "b", "c"], [430, 436, 442], "0"),
        ...series(["c", "b", "a"], [430, 440, 450], "1"),
      ],
      topology([["a", "b", "c"]]),
    );
    expect(response.directions).toEqual([
      { id: "gtfs:0", from: "A", to: "C", stationCount: 2, peakMinutes: 6 },
      { id: "gtfs:1", from: "C", to: "A", stationCount: 2, peakMinutes: 10 },
    ]);
  });

  it("includes partial trips locally without creating branches or changing topology", () => {
    const graph = topology([["a", "b", "c", "d"]]);
    const original = structuredClone(graph);
    const response = compute(
      [...series(["a", "b", "c", "d"], [430, 440, 450]), ...series(["b", "c"], [435, 445])],
      graph,
    );
    expect(response.sections).toHaveLength(1);
    expect(response.branched).toBe(false);
    // A=10, B=5, C=10 (the short working ends at C; boarding there is excluded).
    expect(response.average.peakMinutes).toBe(25 / 3);
    expect(graph).toEqual(original);
  });

  it("does not invent calls at skipped stations on express trips", () => {
    const response = compute(
      [...series(["a", "b", "c", "d"], [430, 440, 450]), ...series(["a", "c", "d"], [435, 445])],
      topology([["a", "b", "c", "d"]]),
    );
    // A=5, B=10, C=5. The path through B contributes no departure sample.
    expect(response.average.peakMinutes).toBe(20 / 3);
    expect(response.sections).toHaveLength(1);
  });

  it("gives stations equal weight, retaining fractional values", () => {
    const response = compute(
      [
        ...series(["a", "b", "c", "d"], [430, 440, 450]),
        ...series(["a", "b"], [432, 434, 436, 438, 442, 444, 446, 448]),
      ],
      topology([["a", "b", "c", "d"]]),
    );
    expect(response.average.peakMinutes).toBe(22 / 3); // 2, 10, 10
    expect(response.stationCount).toBe(4);
    expect(response.sampledStationCount).toBe(3);
  });

  it("uses medians of positive local gaps, never gaps across contiguous windows", () => {
    const minutes = [
      0, 12, 299, 301, 419, 420, 426, 426, 569, 571, 1049, 1050, 1056, 1139, 1141, 1409, 1410, 1422,
    ];
    const response = compute(series(["a", "b"], minutes), topology([["a", "b"]]));
    // peak gaps: 6,143,6,83 -> median 44.5; every off-peak sub-window is
    // sparse here, so the pooled fallback remains 268.
    expect(response.average).toEqual({ peakMinutes: 44.5, offPeakMinutes: 268, nightMinutes: 12 });
    const singletons = compute(series(["a", "b"], [300, 570, 1140, 420, 1050, 0, 1410]));
    expect(singletons.status).toBe("insufficient");
    expect(singletons.average).toEqual({});
  });

  it("uses the slowest stable off-peak sub-window and falls back when all are sparse", () => {
    const stable = compute(
      series(["a", "b"], [300, 310, 320, 570, 575, 580, 1140, 1145, 1150]),
      topology([["a", "b"]]),
    );
    expect(stable.average.offPeakMinutes).toBe(10);

    const sparse = compute(
      series(["a", "b"], [300, 304, 570, 576, 1140, 1150]),
      topology([["a", "b"]]),
    );
    expect(sparse.average.offPeakMinutes).toBe(6);
  });

  it("does not wrap negative or next-day times into the requested civil day", () => {
    const response = compute(series(["a", "b"], [-1, 1, 1441, 1447], "0"));
    expect(response.status).toBe("insufficient");
    const previousService = trip("previous", ["a", "b"], 7, "0");
    previousService.serviceDate = "20260830";
    expect(compute([previousService, ...series(["a", "b"], [1], "0")]).average.nightMinutes).toBe(
      6,
    );
  });

  it("preserves repeated loop visits, including a second lap of one trip", () => {
    const loop = trip("loop", ["a", "b", "c", "a", "b", "c", "a"], 430, "0");
    loop.calls.forEach((call, i) => {
      call.departure = (430 + 2 * i) * 60;
    });
    const response = compute([loop], topology([["a", "b", "c", "a"]]));
    expect(response.sections).toHaveLength(1);
    expect(response.average.peakMinutes).toBe(6);
    expect(response.sampledStationCount).toBe(3);
    expect(response.directions).toHaveLength(1);
  });

  it("does not merge opposite loop senses even if GTFS direction ids are identical", () => {
    const graph = topology([["a", "b", "c", "a"]]);
    const response = compute(
      [
        ...series(["a", "b", "c", "a"], [430, 436, 442], "0"),
        ...series(["a", "c", "b", "a"], [430, 440, 450], "0"),
      ],
      graph,
    );
    expect(
      response.directions.map((direction) => direction.peakMinutes).sort((a, b) => a! - b!),
    ).toEqual([6, 10]);
    expect(response.average.peakMinutes).toBe(8);
  });

  it("deduplicates adjacent same-parent platforms but retains later returns", () => {
    const stops = [
      { id: "a1", parentId: "a", name: "A" },
      { id: "a2", parentId: "a", name: "A" },
      { id: "b", name: "B" },
    ];
    const trips = series(["a1", "a2", "b"], [430, 436], "0");
    for (const item of trips) item.calls[1]!.departure! += 60;
    expect(compute(trips, undefined, stops).average.peakMinutes).toBe(6);
    expect(compute([trips[0]!], undefined, stops).status).toBe("insufficient");
    const returning = trip("return", ["a1", "a2", "b", "a1", "a2", "b"], 430, "0");
    returning.calls.forEach((call, i) => {
      call.departure = (430 + i) * 60;
    });
    expect(compute([returning], undefined, stops).average.peakMinutes).toBe(3);
  });

  it("excludes forbidden pickup and final arrivals even with populated departure times", () => {
    const trips = series(["a", "b", "c"], [430, 435, 440], "0");
    trips[1]!.calls[0]!.pickupType = 1;
    trips.forEach((t) => {
      t.calls[1]!.pickupType = 1;
    });
    const response = compute(trips, topology([["a", "b", "c"]]));
    expect(response.average.peakMinutes).toBe(10);
    expect(response.sampledStationCount).toBe(1);
    expect(response.directions[0]!.stationCount).toBe(1);
  });

  it("does not substitute arrival times for unspecified departures", () => {
    const trips = series(["a", "b"], [430, 436], "0");
    trips[0]!.calls[0]!.departure = null;
    expect(compute(trips).status).toBe("insufficient");
  });

  it("uses the outgoing section at a junction and excludes a terminating service there", () => {
    const graph = topology([
      ["a", "j", "b"],
      ["a", "j", "c"],
    ]);
    const response = compute(
      [
        ...series(["a", "j", "b"], [430, 436, 442], "0"),
        ...series(["a", "j", "c"], [433, 439, 445], "0"),
        ...series(["a", "j"], [431, 437, 443], "0"),
      ],
      graph,
    );
    for (const terminal of ["b", "c"]) {
      const branch = response.sections.find((section) => section.stationIds.includes(terminal))!;
      expect(branch.average.peakMinutes).toBe(6);
      expect(branch.directions[0]!.stationCount).toBe(1); // J only, outgoing.
    }
  });

  it.each([true, false])(
    "weights a fork as two line senses, retaining section corridors (direction ids: %s)",
    (knownDirections) => {
      const graph = topology([
        ["a", "j", "b"],
        ["a", "j", "c"],
      ]);
      const response = compute(
        [
          ...series(["a", "j", "b"], [430, 436, 442, 448], knownDirections ? "0" : undefined),
          ...series(["a", "j", "c"], [433, 439, 445, 451], knownDirections ? "0" : undefined),
          ...series(["b", "j", "a"], [430, 440, 450], knownDirections ? "1" : undefined),
          ...series(["c", "j", "a"], [435, 445, 455], knownDirections ? "1" : undefined),
        ],
        graph,
      );
      // A=3; J=(3+5)/2=4, not (6+6+5)/3; B=10; C=10.
      expect(response.average.peakMinutes).toBe(6.75);
      if (knownDirections) {
        expect(response.directions).toHaveLength(2);
        expect(response.directions.map((d) => d.peakMinutes)).toEqual([3, 25 / 3]);
      }
      for (const terminal of ["b", "c"]) {
        const branch = response.sections.find((section) => section.stationIds.includes(terminal))!;
        expect(branch.directions.map((d) => d.peakMinutes).sort((a, b) => a! - b!)).toEqual([
          6, 10,
        ]);
        expect(branch.average.peakMinutes).toBe(8);
      }
    },
  );

  it("retains an overall average without topology using supplied directions", () => {
    const response = compute([
      ...series(["a", "b"], [430, 436, 442], "0"),
      ...series(["a", "c"], [433, 439, 445], "0"),
      ...series(["b", "a"], [430, 440, 450], "1"),
    ]);
    expect(response.topologyAvailable).toBe(false);
    expect(response.sections).toEqual([]);
    expect(response.directions.map((d) => d.peakMinutes)).toEqual([3, 10]);
    expect(response.average.peakMinutes).toBe(6.5);
  });

  it("keeps unknown incompatible directions separate instead of one unknown bucket", () => {
    const response = compute([
      ...series(["a", "b"], [430, 436, 442]),
      ...series(["a", "c"], [433, 439, 445]),
    ]);
    expect(response.average.peakMinutes).toBe(6);
    expect(response.directions).toHaveLength(2);
  });

  it("does not overwrite incompatible senses when topology is missing and a direction id is reused", () => {
    const response = compute([
      ...series(["a", "b", "c"], [430, 436, 442], "0"),
      ...series(["c", "b", "a"], [430, 440, 450], "0"),
    ]);
    expect(response.average.peakMinutes).toBe(8);
    expect(response.sampledStationCount).toBe(3);
    expect(response.directions.every((direction) => [6, 10].includes(direction.peakMinutes!))).toBe(
      true,
    );
  });

  it("deduplicates a loaded trip only within its service date", () => {
    const first = trip("same", ["a", "b"], 1, "0");
    const previous = trip("same", ["a", "b"], 7, "0");
    previous.serviceDate = "20260830";
    expect(compute([first, first, previous]).average.nightMinutes).toBe(6);
  });

  it.each(["disabled", "missing", "out-of-coverage", "line-missing"] as const)(
    "preserves %s availability with no fabricated values",
    (status) => {
      const result = computeGtfsLineFrequency({
        lineId: "L",
        serviceDate: MONDAY,
        timetable: { status, trips: [] },
      });
      expect(result.status).toBe(status);
      expect(result.average).toEqual({});
      expect(result.sampledStationCount).toBe(0);
      expect(result.sections).toEqual([]);
    },
  );

  it("returns insufficient for an active day with no measurable gaps", () => {
    expect(compute([]).status).toBe("insufficient");
    expect(compute([trip("one", ["a", "b"], 430)]).average).toEqual({});
  });
});

describe("GTFS/NeTEx stop mapping", () => {
  it("uses actual monitoring references and parent ids, not NeTEx numeric suffixes", () => {
    const graph = topology([["FR:StopPlace:123:", "FR:StopPlace:456:"]]);
    graph.patterns[0]!.monitoringRefs = ["STIF:StopArea:SP:900:", "STIF:StopArea:SP:901:"];
    const stops = [
      { id: "quay:1", parentId: "IDFM:900", name: "Unknown" },
      { id: "IDFM:123", name: "Unrelated" },
    ];
    const mapping = mapFrequencyStops(stops, graph);
    expect(mapping.get("quay:1")).toBe("FR:StopPlace:123:");
    expect(mapping.has("IDFM:123")).toBe(false);
  });

  it("uses exact normalized names but not partial token matches", () => {
    const graph = topology([["a", "b"]]);
    graph.stations[0]!.name = "Maisons-Laffitte";
    graph.stations[1]!.name = "Église de Pantin";
    const mapping = mapFrequencyStops(
      [
        { id: "x", name: "Maisons-Alfort" },
        { id: "y", name: "Eglise-de-Pantin" },
      ],
      graph,
    );
    expect(mapping.has("x")).toBe(false);
    expect(mapping.get("y")).toBe("b");
  });

  it("rejects ambiguous names/coordinates and geographically contradictory names", () => {
    const graph = topology([["a", "b"]]);
    Object.assign(graph.stations[0]!, { name: "Common", lat: 48.8, lon: 2.3 });
    Object.assign(graph.stations[1]!, { name: "Common", lat: 48.8, lon: 2.30001 });
    const mapping = mapFrequencyStops(
      [
        { id: "ambiguous", name: "Common", lat: 48.8, lon: 2.3 },
        { id: "far", name: "Common", lat: 49, lon: 3 },
      ],
      graph,
    );
    expect(mapping.size).toBe(0);
  });

  it("matches a uniquely nearby line station when the stop name differs", () => {
    const graph = topology([["a", "b"]]);
    Object.assign(graph.stations[0]!, { lat: 48.8, lon: 2.3 });
    Object.assign(graph.stations[1]!, { lat: 48.9, lon: 2.4 });
    expect(
      mapFrequencyStops([{ id: "x", name: "Platform 1", lat: 48.80001, lon: 2.3 }], graph).get("x"),
    ).toBe("a");
  });

  it("does not arbitrarily route an express call around two equally short loop arms", () => {
    const graph = buildFrequencyGraph(topology([["a", "b", "c", "d", "a"]]));
    expect(findFrequencyPath(graph, "a", "c")).toBeUndefined();
    expect(findFrequencyPath(graph, "a", "b")).toEqual(["a", "b"]);
  });
});
