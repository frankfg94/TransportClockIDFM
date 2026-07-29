import type { H3Event } from "h3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGtfsRuntimeCaches } from "../server/services/gtfs/runtime";
import type {
  GtfsLineArtifact,
  GtfsLineLookupIndex,
  GtfsManifest,
} from "../server/services/gtfs/types";
import { resolveLineGeometry } from "../server/services/lineGeometry/providers";

describe("GTFS geometry split across sibling line identifiers", () => {
  beforeEach(() => {
    process.env.GTFS_ENABLED = "true";
    clearGtfsRuntimeCaches();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearGtfsRuntimeCaches();
  });

  it("recomposes the T1 trace from every geographically relevant T1 artifact", async () => {
    const manifest: GtfsManifest = {
      schemaVersion: 1,
      sha256: "t1-split-fixture",
      datasetVersion: "2026-07-29",
      installedAt: "2026-07-29T00:00:00.000Z",
      cacheGeneration: 1,
      lineCount: 2,
    };
    const lookup: GtfsLineLookupIndex = {
      schemaVersion: 1,
      lineIdsByLabel: {
        t1: ["IDFM:C01389", "IDFM:C02404"],
      },
    };
    const artifacts = new Map<string, GtfsLineArtifact>([
      [
        "IDFM%3AC01389",
        artifact("IDFM:C01389", {
          east: [
            { lon: 2.4, lat: 48.9 },
            { lon: 2.4005, lat: 48.9002 },
            { lon: 2.401, lat: 48.9 },
          ],
        }),
      ],
      [
        "IDFM%3AC02404",
        artifact("IDFM:C02404", {
          west: [
            { lon: 2.401, lat: 48.9 },
            { lon: 2.4015, lat: 48.9002 },
            { lon: 2.402, lat: 48.9 },
            { lon: 2.4025, lat: 48.8998 },
            { lon: 2.403, lat: 48.9 },
          ],
        }),
      ],
    ]);
    vi.stubGlobal("useStorage", () => ({
      getItem: vi.fn(async (key: string) => {
        if (key === "current.json") return manifest;
        if (key.endsWith("/line-index.json")) return lookup;
        const artifactKey = /\/lines\/(.+)\.json$/u.exec(key)?.[1];
        return artifactKey ? artifacts.get(artifactKey) ?? null : null;
      }),
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    const result = await resolveLineGeometry({ context: {} } as H3Event, {
      lineId: "line:IDFM:C01389",
      lineLabel: "T1",
      stops: [
        { id: "A", lon: 2.4, lat: 48.9 },
        { id: "B", lon: 2.401, lat: 48.9 },
        { id: "C", lon: 2.402, lat: 48.9 },
        { id: "D", lon: 2.403, lat: 48.9 },
      ],
      branches: [{ id: "t1", stopIds: ["A", "B", "C", "D"] }],
    });

    expect(result.source).toBe("gtfs");
    expect(result.segments).toHaveLength(3);
    expect(result.segments.every((segment) => segment.coordinates.length >= 3)).toBe(true);
    expect(result.attempts).toEqual([{ source: "gtfs", status: "success" }]);
  });

  it("keeps the regular T2 tram shape instead of a same-label replacement bus", async () => {
    const manifest: GtfsManifest = {
      schemaVersion: 1,
      sha256: "t2-replacement-fixture",
      datasetVersion: "2026-07-29",
      installedAt: "2026-07-29T00:00:00.000Z",
      cacheGeneration: 1,
      lineCount: 2,
    };
    const lookup: GtfsLineLookupIndex = {
      schemaVersion: 1,
      lineIdsByLabel: {
        t2: ["IDFM:C01390", "IDFM:C02405"],
      },
    };
    const artifacts = new Map<string, GtfsLineArtifact>([
      [
        "IDFM%3AC01390",
        artifact(
          "IDFM:C01390",
          {
            tram: [
              { lon: 2.4, lat: 48.9004 },
              { lon: 2.401, lat: 48.9004 },
              { lon: 2.402, lat: 48.9004 },
            ],
          },
          { labels: ["T2"], routeTypes: ["0"] },
        ),
      ],
      [
        "IDFM%3AC02405",
        artifact(
          "IDFM:C02405",
          {
            replacementBus: [
              { lon: 2.4, lat: 48.9 },
              { lon: 2.401, lat: 48.9 },
              { lon: 2.402, lat: 48.9 },
            ],
          },
          {
            labels: ["T2", "Remplacement Tram T2"],
            routeTypes: ["3"],
          },
        ),
      ],
    ]);
    vi.stubGlobal("useStorage", () => ({
      getItem: vi.fn(async (key: string) => {
        if (key === "current.json") return manifest;
        if (key.endsWith("/line-index.json")) return lookup;
        const artifactKey = /\/lines\/(.+)\.json$/u.exec(key)?.[1];
        return artifactKey ? artifacts.get(artifactKey) ?? null : null;
      }),
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    const result = await resolveLineGeometry({ context: {} } as H3Event, {
      lineId: "line:IDFM:C01390",
      lineLabel: "T2",
      stops: [
        { id: "A", lon: 2.4, lat: 48.9 },
        { id: "Charlebourg", lon: 2.401, lat: 48.9 },
        { id: "C", lon: 2.402, lat: 48.9 },
      ],
      branches: [{ id: "t2", stopIds: ["A", "Charlebourg", "C"] }],
    });

    expect(result.source).toBe("gtfs");
    expect(result.segments).toHaveLength(2);
    expect(
      result.segments.flatMap((segment) => segment.coordinates),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lat: 48.9004 }),
      ]),
    );
    expect(
      result.segments
        .flatMap((segment) => segment.coordinates)
        .every(({ lat }) => lat > 48.9003),
    ).toBe(true);
  });

  it("keeps partial regular T1 GTFS segments instead of dropping the whole line to direct", async () => {
    const manifest: GtfsManifest = {
      schemaVersion: 1,
      sha256: "t1-partial-regular-fixture",
      datasetVersion: "2026-07-29",
      installedAt: "2026-07-29T00:00:00.000Z",
      cacheGeneration: 1,
      lineCount: 2,
    };
    const lookup: GtfsLineLookupIndex = {
      schemaVersion: 1,
      lineIdsByLabel: {
        t1: ["IDFM:C01389", "IDFM:C02404"],
      },
    };
    const artifacts = new Map<string, GtfsLineArtifact>([
      [
        "IDFM%3AC01389",
        artifact(
          "IDFM:C01389",
          {
            regularTramEast: [
              { lon: 2.4, lat: 48.9 },
              { lon: 2.4005, lat: 48.9004 },
              { lon: 2.401, lat: 48.9 },
              { lon: 2.4015, lat: 48.9004 },
              { lon: 2.402, lat: 48.9 },
            ],
          },
          { labels: ["T1"], routeTypes: ["0"] },
        ),
      ],
      [
        "IDFM%3AC02404",
        artifact(
          "IDFM:C02404",
          {
            replacementBus: [
              { lon: 2.3, lat: 48.9 },
              { lon: 2.35, lat: 48.91 },
              { lon: 2.4, lat: 48.9 },
            ],
          },
          {
            labels: ["T1", "Remplacement Tram T1"],
            routeTypes: ["3"],
          },
        ),
      ],
    ]);
    vi.stubGlobal("useStorage", () => ({
      getItem: vi.fn(async (key: string) => {
        if (key === "current.json") return manifest;
        if (key.endsWith("/line-index.json")) return lookup;
        const artifactKey = /\/lines\/(.+)\.json$/u.exec(key)?.[1];
        return artifactKey ? artifacts.get(artifactKey) ?? null : null;
      }),
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("traces-du-reseau-ferre-idf")
          ? new Response(
              JSON.stringify({
                results: [
                  {
                    idrefligc: "C01389",
                    geo_shape: {
                      type: "Feature",
                      geometry: {
                        type: "LineString",
                        coordinates: [
                          [2.3, 48.9],
                          [2.35, 48.901],
                          [2.4, 48.9],
                        ],
                      },
                    },
                  },
                ],
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            )
          : new Response(null, { status: 404 }),
      ),
    );

    const result = await resolveLineGeometry({ context: {} } as H3Event, {
      lineId: "line:IDFM:C01389",
      lineLabel: "T1",
      stops: [
        { id: "A", lon: 2.3, lat: 48.9 },
        { id: "B", lon: 2.4, lat: 48.9 },
        { id: "C", lon: 2.401, lat: 48.9 },
        { id: "D", lon: 2.402, lat: 48.9 },
      ],
      branches: [{ id: "t1", stopIds: ["A", "B", "C", "D"] }],
    });

    expect(result.source).toBe("gtfs");
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0].coordinates).toEqual([
      { lon: 2.3, lat: 48.9 },
      { lon: 2.35, lat: 48.901 },
      { lon: 2.4, lat: 48.9 },
    ]);
    expect(
      result.segments
        .slice(1)
        .flatMap((segment) => segment.coordinates)
        .some(({ lat }) => lat === 48.9004),
    ).toBe(true);
    expect(
      result.segments
        .flatMap((segment) => segment.coordinates)
        .some(({ lon, lat }) => lon === 2.35 && lat === 48.91),
    ).toBe(false);
  });
});

function artifact(
  lineId: string,
  shapes: GtfsLineArtifact["shapes"],
  options: {
    labels?: string[];
    routeTypes?: string[];
  } = {},
): GtfsLineArtifact {
  return {
    schemaVersion: 1,
    lineId,
    routeIds: [lineId],
    labels: options.labels ?? ["T1"],
    routeTypes: options.routeTypes ?? ["0"],
    patterns: [],
    shapes,
    entrances: [],
  };
}
