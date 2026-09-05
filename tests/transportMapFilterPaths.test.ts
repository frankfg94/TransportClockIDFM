import { describe, expect, it } from "vitest";
import type { GlobalMapPath } from "../src/features/transport-map/contracts/manifest";
import { filterPathsByBounds } from "../src/features/transport-map/data/filterPathsByBounds";

const bounds = { minX: 10, minY: 10, maxX: 20, maxY: 20 };

function path(id: string, minX: number, minY: number, maxX = minX, maxY = minY): GlobalMapPath {
  return {
    id,
    lineId: `line:${id}`,
    geometrySource: "gtfs",
    sourceVersion: "test",
    quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
    stationIds: [],
    vertices: [{ x: minX, y: minY }, { x: maxX, y: maxY }],
    minX,
    minY,
    maxX,
    maxY,
    chunkIds: ["chunk:test"],
  };
}

describe("filterPathsByBounds", () => {
  it("keeps an empty input empty", () => {
    expect(filterPathsByBounds([], bounds)).toEqual([]);
  });

  it("keeps every path when all bounding boxes intersect", () => {
    const paths = [path("a", 10, 10), path("b", 20, 20), path("c", 12, 12, 18, 18)];
    expect(filterPathsByBounds(paths, bounds)).toEqual(paths);
  });

  it("filters every path when no bounding box intersects", () => {
    expect(filterPathsByBounds([path("a", 0, 0, 5, 5), path("b", 30, 30)], bounds)).toEqual([]);
  });

  it("preserves the historical inclusive intersection and input order", () => {
    const paths = [
      path("outside-left", 0, 12, 9.99, 13),
      path("edge", 20, 15, 25, 16),
      path("inside", 11, 11, 12, 12),
      path("outside-top", 12, 21, 13, 22),
    ];
    expect(filterPathsByBounds(paths, bounds).map((entry) => entry.id)).toEqual(["edge", "inside"]);
  });

  it("does not apply mode, forced-line, detail-line, or generation policy", () => {
    const paths = [path("mixed-mode", 12, 12)];
    expect(filterPathsByBounds(paths, bounds).map((entry) => entry.id)).toEqual(["mixed-mode"]);
  });
});
