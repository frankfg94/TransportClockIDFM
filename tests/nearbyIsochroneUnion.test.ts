import { describe, expect, it } from "vitest";

import { mergeNearbyIsochroneGeometries } from "../src/features/nearby-stations/nearbyIsochroneUnion";
import type { NearbyIsochroneGeometry } from "../src/features/nearby-stations/nearbyIsochrones";

function square(minX: number, minY: number, maxX: number, maxY: number): NearbyIsochroneGeometry {
  return {
    type: "Polygon",
    coordinates: [[
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
      [minX, minY],
    ]],
  };
}

function ringArea(ring: readonly (readonly [number, number])[]): number {
  return Math.abs(ring.reduce((area, position, index) => {
    const next = ring[(index + 1) % ring.length]!;
    return area + position[0] * next[1] - next[0] * position[1];
  }, 0) / 2);
}

describe("mergeNearbyIsochroneGeometries", () => {
  it("removes the shared edge when walking zones overlap", () => {
    const merged = mergeNearbyIsochroneGeometries([
      square(0, 0, 2, 2),
      square(1, 1, 3, 3),
    ]);

    expect(merged?.type).toBe("Polygon");
    if (merged?.type !== "Polygon") return;
    expect(merged.coordinates).toHaveLength(1);
    expect(ringArea(merged.coordinates[0]!)).toBeCloseTo(7, 8);
  });

  it("keeps disconnected walking areas as separate outer polygons", () => {
    const merged = mergeNearbyIsochroneGeometries([
      square(0, 0, 1, 1),
      square(3, 3, 4, 4),
    ]);

    expect(merged?.type).toBe("MultiPolygon");
    if (merged?.type !== "MultiPolygon") return;
    expect(merged.coordinates).toHaveLength(2);
  });
});
