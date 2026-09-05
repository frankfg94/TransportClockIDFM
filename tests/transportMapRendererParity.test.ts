import { describe, expect, it } from "vitest";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { worldToScreen } from "../src/features/transport-map/geo/coordinateKernel";
import {
  Canvas2dRenderer,
  createTransportMapPathRoundingOptions,
} from "../src/features/transport-map/render/canvas2d/canvas2dRenderer";
import { createTransportMapRenderer } from "../src/features/transport-map/render/createRenderer";

describe("transport map renderer parity", () => {
  it("keeps short GTFS bends on the focused line at intermediate zoom", () => {
    const activeOptions = createTransportMapPathRoundingOptions(true, 10);
    const networkOptions = createTransportMapPathRoundingOptions(false, 10);
    const transilienOptions = createTransportMapPathRoundingOptions(false, 8.5, "TRANSILIEN");

    expect(activeOptions.minimumPointDistance).toBe(
      0.1,
    );
    expect(activeOptions.maximumShortSegmentLength).toBeUndefined();
    expect(networkOptions.maximumShortSegmentLength).toBeGreaterThan(0);
    expect(transilienOptions.maximumShortSegmentLength).toBeUndefined();
  });

  it("keeps Canvas2D as the production renderer and uses the same CSS transform at every DPR", () => {
    expect(createTransportMapRenderer().kind).toBe("canvas2d-main-thread");
    const main = new Canvas2dRenderer("canvas2d-main-thread");
    const worker = new Canvas2dRenderer("canvas2d-worker");
    expect(main.kind).toBe("canvas2d-main-thread");
    expect(worker.kind).toBe("canvas2d-worker");

    const point = { x: 0.506123, y: 0.351987 };
    for (const zoom of [8, 12, 16, 20]) {
      const lowDpr = createCamera({ centerWorldX: 0.5, centerWorldY: 0.35, zoom, pixelRatio: 1, viewportWidthCssPx: 412, viewportHeightCssPx: 915 });
      const highDpr = createCamera({ ...lowDpr, pixelRatio: 3 });
      expect(worldToScreen(point, lowDpr)).toEqual(worldToScreen(point, highDpr));
    }
    main.dispose();
    worker.dispose();
  });
});
