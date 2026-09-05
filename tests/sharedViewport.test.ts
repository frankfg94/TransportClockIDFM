import { describe, expect, it } from "vitest";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { visibleWorldBounds } from "../src/features/transport-map/geo/coordinateKernel";
import {
  cameraFromSharedViewport,
  decodeSharedViewport,
  encodeSharedViewport,
} from "../src/features/transport-map/geo/sharedViewport";

describe("shared global map viewport", () => {
  it("round-trips the visible rectangle", () => {
    const camera = createCamera({
      centerWorldX: 0.5062,
      centerWorldY: 0.3438,
      zoom: 12.35,
      viewportWidthCssPx: 1_600,
      viewportHeightCssPx: 900,
    });

    const encoded = encodeSharedViewport(camera);
    const decoded = decodeSharedViewport(encoded);
    expect(decoded).toBeDefined();
    expect(decoded).toEqual({
      minX: expect.closeTo(visibleWorldBounds(camera).minX, 1e-10),
      minY: expect.closeTo(visibleWorldBounds(camera).minY, 1e-10),
      maxX: expect.closeTo(visibleWorldBounds(camera).maxX, 1e-10),
      maxY: expect.closeTo(visibleWorldBounds(camera).maxY, 1e-10),
    });

    const restored = cameraFromSharedViewport(camera, decoded!, 0, 20);
    expect(restored.centerWorldX).toBeCloseTo(camera.centerWorldX, 10);
    expect(restored.centerWorldY).toBeCloseTo(camera.centerWorldY, 10);
    expect(restored.zoom).toBeCloseTo(camera.zoom, 6);
  });

  it("rejects malformed or unreasonably wide rectangles", () => {
    expect(decodeSharedViewport("not-a-viewport")).toBeUndefined();
    expect(decodeSharedViewport("0~0~3~1")).toBeUndefined();
    expect(decodeSharedViewport("0~0~1~0")).toBeUndefined();
  });
});
