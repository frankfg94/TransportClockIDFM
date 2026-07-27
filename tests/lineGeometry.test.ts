import { describe, expect, it, vi } from "vitest";
import {
  alignLineGeometrySegmentEndpoints,
  buildLineGeometryDebugPlan,
  buildRoundedPolylinePath,
  createDirectLineGeometry,
  createScreenSpaceRoundedPolylineOptions,
  measureLineGeometryContinuity,
  createDirectLineGeometryProvider,
  resolveLineGeometryWithProviders,
  type LineGeometry,
  type LineGeometryProvider,
  type LineGeometryRequest,
  type LineGeometrySource,
} from "../src/features/line-map/lineGeometry";

const request: LineGeometryRequest = {
  lineId: "line:IDFM:C01383",
  lineLabel: "57",
  useGtfs: true,
  stops: [
    { id: "A", lon: 2.3, lat: 48.8 },
    { id: "B", lon: 2.31, lat: 48.81 },
    { id: "C", lon: 2.32, lat: 48.82 },
  ],
  branches: [{ id: "main", stopIds: ["A", "B", "C"] }],
};

describe("resolveLineGeometryWithProviders", () => {
  it("tries providers in order and stops at the first complete success", async () => {
    const calls: string[] = [];
    const providers = [
      provider("gtfs", calls, { status: "miss", reason: "line_absent" }),
      provider("idfm-line-traces", calls, new Error("temporary failure")),
      provider("prim-navitia", calls, {
        status: "success",
        geometry: completeGeometry("prim-navitia"),
      }),
      provider("direct", calls, {
        status: "success",
        geometry: completeGeometry("direct"),
      }),
    ];

    const result = await resolveLineGeometryWithProviders(request, providers);

    expect(calls).toEqual(["gtfs", "idfm-line-traces", "prim-navitia"]);
    expect(result.source).toBe("prim-navitia");
    expect(result.attempts).toEqual([
      { source: "gtfs", status: "miss", reason: "line_absent" },
      { source: "idfm-line-traces", status: "error", reason: "temporary failure" },
      { source: "prim-navitia", status: "success" },
    ]);
  });

  it("skips GTFS when the request toggle disables it", async () => {
    const gtfsResolve = vi.fn();
    const providers: LineGeometryProvider[] = [
      {
        source: "gtfs",
        enabled: (candidate) => candidate.useGtfs !== false,
        resolve: gtfsResolve,
      },
      createDirectLineGeometryProvider(),
    ];

    const result = await resolveLineGeometryWithProviders(
      { ...request, useGtfs: false },
      providers,
    );

    expect(gtfsResolve).not.toHaveBeenCalled();
    expect(result.source).toBe("direct");
    expect(result.attempts).toEqual([
      { source: "gtfs", status: "disabled" },
      { source: "direct", status: "success" },
    ]);
  });

  it("rejects a partial provider result instead of mixing suppliers", async () => {
    const partial = completeGeometry("gtfs");
    partial.segments = partial.segments.slice(0, 1);

    const result = await resolveLineGeometryWithProviders(request, [
      {
        source: "gtfs",
        resolve: async () => ({ status: "success", geometry: partial }),
      },
      createDirectLineGeometryProvider(),
    ]);

    expect(result.source).toBe("direct");
    expect(result.attempts).toEqual([
      { source: "gtfs", status: "invalid", reason: "missing_edge:B--C" },
      { source: "direct", status: "success" },
    ]);
    expect(result.segments).toEqual(
      createDirectLineGeometry(request, new Date(result.generatedAt)).segments,
    );
  });

  it("accepts a complete provider-owned topology without requiring stale request edges", async () => {
    const canonical = completeGeometry("gtfs");
    canonical.topology = "provider";
    canonical.stops = [
      { id: "provider-trace:0:start", lon: 2.3, lat: 48.8 },
      { id: "provider-trace:0:end", lon: 2.32, lat: 48.82 },
    ];
    canonical.branches = [
      {
        id: "provider-trace:0",
        stopIds: ["provider-trace:0:start", "provider-trace:0:end"],
      },
    ];
    canonical.segments = [
      {
        id: "provider-trace:0",
        fromStopId: "provider-trace:0:start",
        toStopId: "provider-trace:0:end",
        coordinates: [
          { lon: 2.3, lat: 48.8 },
          { lon: 2.31, lat: 48.815 },
          { lon: 2.32, lat: 48.82 },
        ],
      },
    ];

    const result = await resolveLineGeometryWithProviders(request, [
      {
        source: "gtfs",
        resolve: async () => ({ status: "success", geometry: canonical }),
      },
      createDirectLineGeometryProvider(),
    ]);

    expect(result.source).toBe("gtfs");
    expect(result.topology).toBe("provider");
    expect(result.attempts).toEqual([{ source: "gtfs", status: "success" }]);
  });
});

describe("buildLineGeometryDebugPlan", () => {
  it("produces deterministic readable JSON for rounded and preserved corners", () => {
    const resolution = {
      ...completeGeometry("gtfs"),
      datasetVersion: "fixture-2026-07-23",
      attempts: [{ source: "gtfs" as const, status: "success" as const }],
      segments: [
        {
          id: "rounded",
          fromStopId: "A",
          toStopId: "B",
          coordinates: [
            { lon: 0, lat: 0 },
            { lon: 10, lat: 0 },
            { lon: 10, lat: 10 },
          ],
        },
        {
          id: "too-close",
          fromStopId: "B",
          toStopId: "C",
          coordinates: [
            { lon: 20, lat: 0 },
            { lon: 21, lat: 0 },
            { lon: 21, lat: 1 },
          ],
        },
      ],
    };

    const debug = buildLineGeometryDebugPlan(resolution);
    const readableJson = JSON.stringify(debug, null, 2);

    expect(debug.segments[0].corners[0]).toMatchObject({
      mode: "rounded",
      radius: 2.2,
    });
    expect(debug.segments[1].corners[0]).toMatchObject({
      mode: "straight",
      radius: 0,
      reason: "too-close",
    });
    expect(readableJson).toMatchSnapshot("GTFS geometry debug plan");
  });

  it("preserves sub-pixel normalized coordinates until the final SVG serialization", () => {
    const resolution = {
      ...completeGeometry("gtfs"),
      attempts: [{ source: "gtfs" as const, status: "success" as const }],
      segments: [
        {
          id: "precision",
          fromStopId: "A",
          toStopId: "B",
          coordinates: [
            { lon: 0, lat: 0 },
            { lon: 0.00042, lat: 0.00027 },
            { lon: 0.00084, lat: 0.00003 },
          ],
        },
      ],
    };

    const debug = buildLineGeometryDebugPlan(resolution, undefined, {
      minimumPointDistance: 0.000001,
    });

    expect(debug.segments[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 0.00042, y: 0.00027 },
      { x: 0.00084, y: 0.00003 },
    ]);
    expect(debug.segments[0].path).toContain("0.00042 0.00027");
  });

  it("rounds fine bends once they are large enough on screen", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0.2, y: 0 },
      { x: 0.2, y: 0.2 },
    ];
    const overview = buildRoundedPolylinePath(
      points,
      createScreenSpaceRoundedPolylineOptions(1),
    );
    const closeUp = buildRoundedPolylinePath(
      points,
      createScreenSpaceRoundedPolylineOptions(20),
    );

    expect(overview.path).not.toContain(" Q ");
    expect(closeUp.corners[0]).toMatchObject({ mode: "rounded" });
    expect(closeUp.path).toContain(" Q ");
  });

  it("does not bend a distant directional trace toward another platform", () => {
    const aligned = alignLineGeometrySegmentEndpoints(
      [
        {
          id: "A--B",
          fromStopId: "A",
          toStopId: "B",
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ],
          path: "",
          corners: [],
        },
        {
          id: "B--C",
          fromStopId: "B",
          toStopId: "C",
          points: [
            { x: 20, y: 0 },
            { x: 30, y: 0 },
          ],
          path: "",
          corners: [],
        },
      ],
      new Map([
        ["A", { x: 0, y: 0 }],
        ["B", { x: 10, y: 0 }],
        ["C", { x: 30, y: 0 }],
      ]),
      { maximumEndpointSnapDistance: 2 },
    );

    expect(aligned.stopPoints.get("B")).toEqual({ x: 10, y: 0 });
    expect(aligned.segments[0].points.at(-1)).toEqual({ x: 10, y: 0 });
    expect(aligned.segments[1].points[0]).toEqual({ x: 20, y: 0 });
  });

  it("emits readable continuity metrics for detached route pieces", () => {
    const metrics = measureLineGeometryContinuity(
      [
        {
          id: "A--B",
          fromStopId: "A",
          toStopId: "B",
          coordinates: [
            { lon: 2.3, lat: 48.8 },
            { lon: 2.31, lat: 48.8 },
          ],
        },
        {
          id: "B--C",
          fromStopId: "B",
          toStopId: "C",
          coordinates: [
            { lon: 2.311, lat: 48.8 },
            { lon: 2.32, lat: 48.8 },
          ],
        },
      ],
      20,
    );

    expect(metrics).toMatchObject({
      segmentCount: 2,
      pointCount: 4,
      sharedStopCount: 1,
    });
    expect(metrics.maxSharedStopGapMeters).toBeGreaterThan(70);
    expect(metrics.disconnectedStops).toEqual([
      expect.objectContaining({ stopId: "B" }),
    ]);
    expect(JSON.stringify(metrics, null, 2)).toContain('"maxCoordinateStepMeters"');
  });
});

function provider(
  source: LineGeometrySource,
  calls: string[],
  result: Awaited<ReturnType<LineGeometryProvider["resolve"]>> | Error,
): LineGeometryProvider {
  return {
    source,
    resolve: async () => {
      calls.push(source);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

function completeGeometry(source: LineGeometrySource): LineGeometry {
  return {
    schemaVersion: 1,
    source,
    datasetVersion: "fixture",
    generatedAt: "2026-07-23T10:00:00.000Z",
    stops: request.stops,
    branches: request.branches,
    entrances: [],
    segments: [
      {
        id: "A--B",
        fromStopId: "A",
        toStopId: "B",
        coordinates: [
          { lon: 2.3, lat: 48.8 },
          { lon: 2.31, lat: 48.81 },
        ],
      },
      {
        id: "B--C",
        fromStopId: "B",
        toStopId: "C",
        coordinates: [
          { lon: 2.31, lat: 48.81 },
          { lon: 2.32, lat: 48.82 },
        ],
      },
    ],
  };
}
