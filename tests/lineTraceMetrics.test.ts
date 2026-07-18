import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NetexLineCache } from "../server/services/topology/netexCache";
import {
  buildLineTraceSegmentMetrics,
  clearIdfmLineTraceCache,
  createIdfmLineTraceUrl,
  loadIdfmLineTraceSegmentMetrics,
  parseIdfmLineTracePayload,
} from "../packages/realtime-vehicles/src/runtime/server/lineTraceMetrics";

const SOURCE = { lon: 2, lat: 48 };
const TARGET = { lon: 2.01, lat: 48 };
const CURVED_TRACE = [
  SOURCE,
  { lon: 2.005, lat: 48.01 },
  TARGET,
];

beforeEach(() => {
  clearIdfmLineTraceCache();
});

describe("IDFM line trace metrics", () => {
  it("parses the official MultiLineString response", () => {
    expect(parseIdfmLineTracePayload(createTracePayload())).toEqual([
      CURVED_TRACE,
    ]);
    expect(parseIdfmLineTracePayload({ results: [] })).toEqual([]);
  });

  it("measures the polyline instead of the straight-line chord", () => {
    const [metric] = buildLineTraceSegmentMetrics(
      createLineCache(),
      [CURVED_TRACE],
    );

    expect(metric.distanceSource).toBe("gtfs_shape");
    expect(metric.distanceMeters).toBeGreaterThan(
      metric.fallbackDistanceMeters * 2,
    );
    expect(metric.projectionErrorMeters).toBe(0);
  });

  it("falls back to geodesic distance when no shape can be projected", () => {
    const [metric] = buildLineTraceSegmentMetrics(createLineCache(), []);

    expect(metric).toMatchObject({
      sourceStationId: "station:a",
      targetStationId: "station:b",
      distanceSource: "geodesic_fallback",
    });
    expect(metric.distanceMeters).toBe(metric.fallbackDistanceMeters);
  });

  it("caches fresh geometry and retains it stale after an upstream failure", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(createTracePayload()), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(undefined, { status: 503 }));
    const lineCache = createLineCache();
    const first = await loadIdfmLineTraceSegmentMetrics({
      fetchImpl: fetchMock,
      lineCache,
      nowMs: 1_000,
    });
    const cached = await loadIdfmLineTraceSegmentMetrics({
      fetchImpl: fetchMock,
      lineCache,
      nowMs: 2_000,
    });
    const stale = await loadIdfmLineTraceSegmentMetrics({
      fetchImpl: fetchMock,
      lineCache,
      nowMs: 9 * 60 * 60_000,
    });

    expect(first.status).toBe("fresh");
    expect(cached.status).toBe("fresh");
    expect(stale.status).toBe("stale");
    expect(stale.metrics[0].distanceSource).toBe("gtfs_shape");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "route_id%3D%22IDFM%3AC01383%22",
    );
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
      Accept: "application/json",
    });
  });

  it("builds a public unauthenticated query for a normalized route id", () => {
    const url = createIdfmLineTraceUrl("IDFM:C01383");

    expect(url).toContain("traces-des-lignes-de-transport-en-commun-idfm");
    expect(url).toContain("route_id%3D%22IDFM%3AC01383%22");
    expect(url).not.toContain("apikey");
  });

  it.runIf(process.env.LIVE_IDFM_LINE_TRACE_TESTS === "1")(
    "loads the live line 13 geometry without an API key",
    async () => {
      const response = await fetch(createIdfmLineTraceUrl("IDFM:C01383"));
      const traces = parseIdfmLineTracePayload(await response.json());

      expect(response.ok).toBe(true);
      expect(traces.length).toBeGreaterThan(1);
      expect(
        traces.reduce((count, trace) => count + trace.length, 0),
      ).toBeGreaterThan(100);
    },
    15_000,
  );
});

function createTracePayload(): unknown {
  return {
    total_count: 1,
    results: [
      {
        route_id: "IDFM:C01383",
        route_type: "Subway",
        shape: {
          geometry: {
            type: "MultiLineString",
            coordinates: [
              CURVED_TRACE.map((point) => [point.lon, point.lat]),
            ],
          },
        },
      },
    ],
  };
}

function createLineCache(): NetexLineCache {
  const line = {
    id: "FR1:Line:C01383:",
    code: "C01383",
    name: "Metro 13",
    primLineId: "line:IDFM:C01383",
    transportMode: "metro",
  };

  return {
    generatedAt: "2026-07-15T00:00:00.000Z",
    line,
    schematic: {
      schemaVersion: 1,
      line,
      nodes: [
        {
          id: "station:a",
          name: "A",
          x: SOURCE.lon,
          y: SOURCE.lat,
          srsName: "EPSG:4326",
          degree: 1,
          isTerminal: true,
          isJunction: false,
        },
        {
          id: "station:b",
          name: "B",
          x: TARGET.lon,
          y: TARGET.lat,
          srsName: "EPSG:4326",
          degree: 1,
          isTerminal: true,
          isJunction: false,
        },
      ],
      segments: [
        {
          id: "segment:a-b",
          from: "station:a",
          to: "station:b",
          stationIds: ["station:a", "station:b"],
        },
      ],
      branchGroups: [],
      parallelGroups: [],
      loops: [],
    },
  };
}
