import { describe, expect, it } from "vitest";
import {
  isHighFidelityTransportPath,
  linePathsAreHighFidelity,
  selectPreferredLinePaths,
} from "../src/features/transport-map/data/pathPrecedence";
import type { GlobalMapPath } from "../src/features/transport-map/contracts/manifest";

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
  it("does not paint regional and detailed representations together", () => {
    const regional = path("path:regional:1", "gtfs");
    const detailed = path("path:line:metro:1:segment:1#chunk", "gtfs");

    expect(selectPreferredLinePaths([detailed], [regional], lineId)).toEqual([detailed]);
  });

  it("keeps GTFS when the competing representation is NeTEx", () => {
    const regional = path("path:regional:1", "gtfs");
    const detailed = path("path:line:metro:1:segment:1#chunk", "netex-schematic-fallback");

    expect(selectPreferredLinePaths([detailed], [regional], lineId)).toEqual([regional]);
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
