import { describe, expect, it } from "vitest";
import {
  cameraAnchorError,
  createCamera,
  fitCameraToBounds,
  panCameraByScreen,
  resizeCamera,
  zoomCameraAroundScreenPoint,
} from "../src/features/transport-map/geo/camera";
import { screenToWorld, worldToScreen } from "../src/features/transport-map/geo/coordinateKernel";

describe("transport map camera", () => {
  it("keeps the geographic point below the cursor during zoom", () => {
    const anchor = { x: 87, y: 413 };
    const camera = createCamera({
      centerWorldX: 0.008,
      centerWorldY: 0.149,
      zoom: 8,
      viewportWidthCssPx: 412,
      viewportHeightCssPx: 915,
    });
    const anchorWorld = screenToWorld(anchor, camera);
    const zoomed = zoomCameraAroundScreenPoint(camera, 20, anchor);
    expect(cameraAnchorError(zoomed, anchorWorld, anchor)).toBeLessThanOrEqual(0.1);
    expect(cameraAnchorError(zoomed, anchorWorld, anchor)).toBeLessThan(1e-8);
    expect(zoomed.generation).toBe(camera.generation + 1);
  });

  it("keeps the midpoint under a pinch anchor for every supported DPR", () => {
    for (const pixelRatio of [1, 2, 3]) {
      const camera = createCamera({
        centerWorldX: 0.008,
        centerWorldY: 0.149,
        zoom: 11,
        viewportWidthCssPx: 412,
        viewportHeightCssPx: 915,
        pixelRatio,
      });
      const midpoint = { x: 183, y: 521 };
      const anchorWorld = screenToWorld(midpoint, camera);
      const pinched = zoomCameraAroundScreenPoint(camera, 17.25, midpoint);
      expect(cameraAnchorError(pinched, anchorWorld, midpoint)).toBeLessThanOrEqual(1e-8);
    }
  });

  it("keeps pan renderer-agnostic and invertible", () => {
    const camera = createCamera({ zoom: 14, viewportWidthCssPx: 768, viewportHeightCssPx: 1024 });
    const point = { x: 0.0082, y: 0.1491 };
    const before = worldToScreen(point, camera);
    const panned = panCameraByScreen(camera, { x: 40, y: -32 });
    const after = worldToScreen(point, panned);
    expect(after.x - before.x).toBeCloseTo(40, 10);
    expect(after.y - before.y).toBeCloseTo(-32, 10);
  });

  it("fits bounds and changes only camera state", () => {
    const camera = createCamera({ viewportWidthCssPx: 1280, viewportHeightCssPx: 720 });
    const bounds = { minX: 0.001, minY: 0.14, maxX: 0.02, maxY: 0.16 };
    const fitted = fitCameraToBounds(camera, bounds, 32, 8, 20);
    expect(fitted.centerWorldX).toBeCloseTo(0.0105, 15);
    expect(fitted.centerWorldY).toBeCloseTo(0.15, 15);
    expect(fitted.zoom).toBeGreaterThanOrEqual(8);
    expect(fitted.zoom).toBeLessThanOrEqual(20);
    expect(fitted.generation).toBeGreaterThan(camera.generation);
  });

  it("keeps CSS positions independent from backing-buffer DPR after resize", () => {
    const camera = createCamera({ viewportWidthCssPx: 360, viewportHeightCssPx: 800, pixelRatio: 1 });
    const point = { x: 0.008, y: 0.149 };
    const first = worldToScreen(point, camera);
    const resized = resizeCamera(camera, 360, 800, 3);
    expect(worldToScreen(point, resized)).toEqual(first);
    expect(resized.pixelRatio).toBe(3);
  });
});
