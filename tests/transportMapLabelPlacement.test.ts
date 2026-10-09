import { describe, expect, it } from "vitest";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { worldScaleAtZoom } from "../src/features/transport-map/geo/coordinateKernel";
import {
  resolveTransportMapLabelPlacements,
  type TransportMapLabelPlacementCandidate,
} from "../src/features/transport-map/render/stationLabelPlacement";

describe("transport map label placement", () => {
  it("keeps a long station name near its dot in a dense vertical cluster at zoom 11.8", () => {
    const camera = createCamera({ centerWorldX: .5, centerWorldY: .5, zoom: 11.8, viewportWidthCssPx: 1245, viewportHeightCssPx: 1023 });
    const scale = worldScaleAtZoom(12);
    const candidates: TransportMapLabelPlacementCandidate[] = Array.from({ length: 10 }, (_, index) => ({
      id: `station-label:${index}`, text: index === 4 ? "Bibliothèque-François Mitterrand" : `Station voisine ${index}`,
      worldPosition: { x: .5 + [0, -30, -60, 20, -35, -50, 10, -30, 0, 20][index]! / scale, y: .5 + (index - 5) * 18 / scale },
      sizeCssPx: 13, priority: index === 4 ? 1 : 10, order: index,
      selectedLineLabelOrientation: "vertical",
    }));
    const placements = resolveTransportMapLabelPlacements(candidates, camera);
    expect(placements.size).toBe(candidates.length);
    for (const placement of placements.values()) {
      expect(placement.pixelOffsetCssPx[0]).toBe(22);
      expect(Math.abs(placement.pixelOffsetCssPx[1])).toBeLessThan(64);
    }
    expect(placements.get("station-label:4")!.textAnchor).toBe("start");
  });
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
