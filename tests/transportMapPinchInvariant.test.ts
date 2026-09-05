import { describe, expect, it } from "vitest";
import {
  createCamera,
  transformCameraForPinch,
} from "../src/features/transport-map/geo/camera";
import { screenToWorld, worldToScreen } from "../src/features/transport-map/geo/coordinateKernel";

describe("transport map pinch invariant", () => {
  it("preserves the initial geographic centroid while zoom and midpoint move together", () => {
    for (const pixelRatio of [1, 1.5, 2, 2.625, 3]) {
      const initialCamera = createCamera({
        centerWorldX: 0.008,
        centerWorldY: 0.149,
        zoom: 10,
        viewportWidthCssPx: 412,
        viewportHeightCssPx: 915,
        pixelRatio,
      });
      const initialMidpoint = { x: 140, y: 420 };
      const anchorWorld = screenToWorld(initialMidpoint, initialCamera);
      const currentMidpoint = { x: 204, y: 468 };
      const transformed = transformCameraForPinch(
        initialCamera,
        120,
        anchorWorld,
        240,
        currentMidpoint,
      );

      expect(worldToScreen(anchorWorld, transformed).x).toBeCloseTo(currentMidpoint.x, 10);
      expect(worldToScreen(anchorWorld, transformed).y).toBeCloseTo(currentMidpoint.y, 10);
      expect(transformed.zoom).toBeCloseTo(11, 10);
    }
  });

  it("clamps pinch zoom without changing the anchor contract", () => {
    const camera = createCamera({ zoom: 19, viewportWidthCssPx: 360, viewportHeightCssPx: 800 });
    const midpoint = { x: 90, y: 610 };
    const anchorWorld = screenToWorld(midpoint, camera);
    const transformed = transformCameraForPinch(camera, 100, anchorWorld, 1000, midpoint, 8, 20);
    expect(transformed.zoom).toBe(20);
    expect(worldToScreen(anchorWorld, transformed)).toEqual(midpoint);
  });
});
