import { describe, expect, it } from "vitest";
import { createCamera } from "../src/features/transport-map/geo/camera";
import {
  resolveTransportMapLabelPlacements,
  type TransportMapLabelPlacementCandidate,
} from "../src/features/transport-map/render/stationLabelPlacement";

describe("transport map label placement", () => {
  it("keeps dense labels on distinct candidates and drops labels when no slot remains", () => {
    const camera = createCamera({
      centerWorldX: 0.5,
      centerWorldY: 0.5,
      zoom: 12,
      viewportWidthCssPx: 360,
      viewportHeightCssPx: 640,
    });
    const candidates: TransportMapLabelPlacementCandidate[] = Array.from({ length: 8 }, (_, index) => ({
      id: `station-label:${index}`,
      text: "Station très longue",
      worldPosition: { x: 0.5, y: 0.5 },
      sizeCssPx: 13,
      priority: index === 0 ? 10 : 1,
      order: index,
    }));

    const placements = resolveTransportMapLabelPlacements(candidates, camera);
    const offsets = new Set(
      [...placements.values()].map((placement) => placement.pixelOffsetCssPx.join(",")),
    );

    expect(placements.size).toBeLessThan(candidates.length);
    expect(placements.has("station-label:0")).toBe(true);
    expect(offsets.size).toBe(placements.size);
  });
});
