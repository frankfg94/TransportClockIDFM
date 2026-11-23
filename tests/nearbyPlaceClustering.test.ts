import { describe, expect, it } from "vitest";
import { clusterNearbyPlaceMarkers, NEARBY_PLACE_CLUSTER_CELL_SIZE_CSS_PX } from "../src/features/nearby-stations/nearbyPlaceClustering";

function entry(id: string, order: number, worldX: number, worldY: number) {
  return { place: { id }, order, worldX, worldY };
}

describe("nearby place marker clusters", () => {
  it("combines dense markers into a countable cell and leaves isolated places intact", () => {
    const groups = clusterNearbyPlaceMarkers([
      entry("one", 0, 0.501, 0.401),
      entry("two", 1, 0.503, 0.404),
      entry("three", 2, 0.58, 0.45),
    ], 1_000);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ kind: "cluster", order: 0, items: [{ place: { id: "one" } }, { place: { id: "two" } }] });
    expect(groups[1]).toMatchObject({ kind: "place", item: { place: { id: "three" } } });
  });

  it("splits a nearby pair after zooming in and keeps cluster centers inside their stable cells", () => {
    const places = [entry("west", 0, 0.501, 0.401), entry("east", 1, 0.503, 0.404)];
    const far = clusterNearbyPlaceMarkers(places, 1_000);
    const close = clusterNearbyPlaceMarkers(places, 20_000);

    expect(far[0]?.kind).toBe("cluster");
    expect(close.every(group => group.kind === "place")).toBe(true);
    if (far[0]?.kind === "cluster") {
      const cellStart = Math.floor(places[0]!.worldX * 1_000 / NEARBY_PLACE_CLUSTER_CELL_SIZE_CSS_PX)
        * NEARBY_PLACE_CLUSTER_CELL_SIZE_CSS_PX / 1_000;
      expect(far[0].centerWorldX).toBeGreaterThanOrEqual(cellStart);
      expect(far[0].centerWorldX).toBeLessThan(cellStart + NEARBY_PLACE_CLUSTER_CELL_SIZE_CSS_PX / 1_000);
    }
  });

  it("keeps input order deterministic and avoids grouping in invalid scales", () => {
    const places = [entry("late", 4, 0.9, 0.9), entry("early", 1, 0.1, 0.1)];
    expect(clusterNearbyPlaceMarkers(places, 10_000).map(group => group.order)).toEqual([1, 4]);
    expect(clusterNearbyPlaceMarkers(places, 0).map(group => group.kind)).toEqual(["place", "place"]);
  });
});
