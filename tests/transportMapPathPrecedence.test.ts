import { describe, expect, it } from "vitest";
import {
  isHighFidelityTransportPath,
  linePathsAreHighFidelity,
  selectPreferredLinePaths,
} from "../src/features/transport-map/data/pathPrecedence";
import type { GlobalMapPath } from "../src/features/transport-map/contracts/manifest";
import { hasSingleConnectedGlobalMapPathGeometry } from "../src/features/line-map/globalBusDirectionGeometry";
import { breakIncompleteGtfsConnectors, materializeLod } from "../src/features/transport-map/data/createTransportMapDataSource";

const lineId = "line:metro:1";

function path(
  id: string,
  geometrySource: GlobalMapPath["geometrySource"],
): GlobalMapPath {
  return {
    id,
    lineId,
    geometrySource,
    sourceVersion: "test",
    quality: {
      complete: geometrySource === "gtfs",
      fallback: geometrySource === "netex-schematic-fallback",
      gapMeters: 0,
      stationDistanceMaxMeters: 0,
    },
    stationIds: ["station:a", "station:b"],
    vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    minX: 0,
    minY: 0,
    maxX: 1,
    maxY: 1,
    chunkIds: [],
  };
}

describe("global map path source precedence", () => {
  it("does not treat a connected partial or regional route as complete direction geometry", () => {
    const fragment = { ...path("detail", "gtfs"), vertices: [
      { x: 0, y: 0, stationId: "a" }, { x: 1, y: 1, stationId: "b" },
    ] };
    expect(hasSingleConnectedGlobalMapPathGeometry([fragment], new Map(), ["a", "b", "c"])).toBe(false);
    expect(hasSingleConnectedGlobalMapPathGeometry([fragment], new Map(), ["a", "b"])).toBe(true);
    expect(hasSingleConnectedGlobalMapPathGeometry([{ ...fragment, id: "path:regional:test" }], new Map(), ["a", "b"])).toBe(false);
  });

  it("preserves explicit compiler continuity at full detail and lower LOD", () => {
    const connector = { ...path("connector", "gtfs"), quality: { ...path("connector", "gtfs").quality, complete: false },
      vertices: [{ x: 0, y: 0, stationId: "a" }, { x: 1, y: 1, stationId: "b" }],
      subpathStarts: [0],
      lodVertices: { "1": [{ x: 0, y: 0, stationId: "a" }, { x: 1, y: 1, stationId: "b" }] },
      lodSubpathStarts: { "1": [0] },
    };
    expect(breakIncompleteGtfsConnectors(connector).subpathStarts).toEqual([0]);
    expect(breakIncompleteGtfsConnectors(materializeLod(connector, 1)).subpathStarts).toEqual([0]);
  });

  it("splits an incomplete provider path at an edge with no provider endpoint, even with explicit chunk starts", () => {
    const incomplete = {
      ...path("provider", "gtfs"),
      quality: { ...path("provider", "gtfs").quality, complete: false },
      vertices: [
        { x: 0, y: 0, stationId: "a" },
        { x: 0, y: 1 },
        { x: 1, y: 1, stationId: "b" },
        { x: 2, y: 2, stationId: "c" },
        { x: 3, y: 2 },
      ],
      subpathStarts: [0],
      renderStationAnchors: [{ stationId: "a", x: 0, y: 0 }, { stationId: "b", x: 1, y: 1 }],
    };
    const result = breakIncompleteGtfsConnectors(incomplete);
    expect(result.subpathStarts).toEqual([0, 3]);
    expect(result.vertices).toBe(incomplete.vertices);
    expect(result.quality.complete).toBe(false);
  });

  it("retains provider-backed two-point edges around an incomplete edge", () => {
    const incomplete = {
      ...path("provider", "gtfs"),
      quality: { ...path("provider", "gtfs").quality, complete: false },
      vertices: ["a", "b", "c", "d"].map((stationId, x) => ({ stationId, x, y: 0 })),
      subpathStarts: [0],
      renderStationAnchors: ["a", "b"].map((stationId, x) => ({ stationId, x, y: 0 })),
    };
    expect(breakIncompleteGtfsConnectors(incomplete).subpathStarts).toEqual([0, 2, 3]);
    expect(breakIncompleteGtfsConnectors({ ...incomplete, quality: { ...incomplete.quality, complete: true } })).toEqual({
      ...incomplete, quality: { ...incomplete.quality, complete: true },
    });
  });
  it("does not paint regional and detailed representations together", () => {
    const regional = path("path:regional:1", "gtfs");
    const detailed = path("path:line:metro:1:segment:1#chunk", "gtfs");

    expect(selectPreferredLinePaths([detailed], [regional], lineId)).toEqual([detailed]);
  });

  it("keeps a detailed road bend when an off-screen station is only covered by the regional layer", () => {
    const detailed = {
      ...path("path:line:test:segment:1#chunk", "gtfs"),
      vertices: [
        { x: 0, y: 0, stationId: "station:a" },
        { x: 0, y: 1 },
        { x: 1, y: 1, stationId: "station:b" },
      ],
    };
    const regional = {
      ...path("path:regional:1", "gtfs"),
      stationIds: ["station:a", "station:b", "station:c"],
      vertices: [
        { x: 0, y: 0, stationId: "station:a" },
        { x: 1, y: 1, stationId: "station:b" },
        { x: 2, y: 1, stationId: "station:c" },
      ],
    };

    // Completeness outside the loaded tiles must not replace a bridge/road
    // bend in those tiles with the regional station-to-station chord.
    expect(selectPreferredLinePaths([detailed], [regional], lineId, {
      requiredStationIds: ["station:a", "station:b", "station:c"],
    })).toEqual([detailed]);
  });

  it("keeps GTFS when the competing representation is NeTEx", () => {
    const regional = path("path:regional:1", "gtfs");
    const detailed = path("path:line:metro:1:segment:1#chunk", "netex-schematic-fallback");

    expect(selectPreferredLinePaths([detailed], [regional], lineId)).toEqual([regional]);
  });

  it("can still restore full coverage from a secondary layer that retains detailed geometry", () => {
    const partial = {
      ...path("path:line:test:segment:1#local", "gtfs"),
      vertices: [
        { x: 0, y: 0, stationId: "station:a" },
        { x: 1, y: 1, stationId: "station:b" },
      ],
    };
    const complete = {
      ...partial,
      id: "path:line:test:segment:1#preloaded",
      stationIds: ["station:a", "station:b", "station:c"],
      vertices: [...partial.vertices, { x: 2, y: 1, stationId: "station:c" }],
    };
    expect(selectPreferredLinePaths([partial], [complete], lineId, {
      requiredStationIds: complete.stationIds,
    })).toEqual([complete]);
  });

  it("never mixes a complete GTFS trace with a NeTEx fallback", () => {
    const detailedGtfs = path("path:line:metro:1:segment:1#chunk", "gtfs");
    const detailedFallback = path("path:line:metro:1:segment:2#chunk", "netex-schematic-fallback");
    const regionalFallback = path("path:regional:1", "netex-schematic-fallback");

    expect(selectPreferredLinePaths(
      [detailedGtfs, detailedFallback],
      [regionalFallback],
      lineId,
    )).toEqual([detailedGtfs]);
  });

  it("keeps independent detailed branches when a line mixes audited sources", () => {
    const detailedGtfs = path("path:line:metro:1:segment:1#chunk", "gtfs");
    const detailedOfficial = {
      ...path("path:line:metro:1:segment:2#chunk", "official-open-data"),
      stationIds: ["station:c", "station:d"],
    };
    const regional = path("path:regional:1", "gtfs");

    expect(selectPreferredLinePaths(
      [detailedGtfs, detailedOfficial],
      [regional],
      lineId,
    )).toEqual([detailedGtfs, detailedOfficial]);
  });

  it("uses the regional representation only while detail is unavailable", () => {
    const regional = path("path:regional:1", "netex-schematic-fallback");

    expect(selectPreferredLinePaths([], [regional], lineId)).toEqual([regional]);
  });

  it("does not leak paths from another line into the focused result", () => {
    const otherLine = { ...path("path:other", "gtfs"), lineId: "line:metro:2" };

    expect(selectPreferredLinePaths([otherLine], [], lineId)).toEqual([]);
  });

  it("distinguishes detailed GTFS chunks from the compact regional GTFS LOD", () => {
    const regional = {
      ...path("path:regional:1", "gtfs"),
      sourceVersion: "gtfs-regional-lod1-v7-provider-road-anchors",
    };
    const detailed = {
      ...path("path:line:metro:1:segment:1#chunk", "gtfs"),
      sourceVersion: "gtfs:2026-08-03:v3-provider-road-anchors",
    };

    expect(isHighFidelityTransportPath(regional)).toBe(false);
    expect(isHighFidelityTransportPath(detailed)).toBe(true);
    expect(linePathsAreHighFidelity([regional], lineId)).toBe(false);
    expect(linePathsAreHighFidelity([detailed], lineId)).toBe(true);
    expect(linePathsAreHighFidelity([detailed, regional], lineId)).toBe(false);
  });
});
