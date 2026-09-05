import { describe, expect, it } from "vitest";
import {
  cssPixelsToWorldUnits,
  lonLatToScreen,
  lonLatToWorld,
  metersToWorldUnits,
  screenToLonLat,
  screenToWorld,
  worldToLonLat,
  worldToScreen,
  worldUnitsToMeters,
} from "../src/features/transport-map/geo/coordinateKernel";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { TRANSPORT_MAP_PRECISION } from "../src/features/transport-map/geo/precisionContract";

describe("transport map projection", () => {
  it("keeps world/screen inverses within the Float64 contract", () => {
    for (const zoom of [8, 9, 10, 12, 14, 16, 18, 20]) {
      for (const pixelRatio of [1, 1.5, 2, 2.625, 3]) {
        const camera = createCamera({
          centerWorldX: 0.008,
          centerWorldY: 0.149,
          zoom,
          viewportWidthCssPx: 412,
          viewportHeightCssPx: 915,
          pixelRatio,
        });
        const point = { x: 0.008123456789, y: 0.149234567891 };
        const screen = worldToScreen(point, camera);
        const roundTrip = screenToWorld(screen, camera);
        const roundTripScreen = worldToScreen(roundTrip, camera);
        expect(Math.hypot(roundTripScreen.x - screen.x, roundTripScreen.y - screen.y)).toBeLessThanOrEqual(
          TRANSPORT_MAP_PRECISION.inverseScreenCssPx,
        );
      }
    }
  });

  it("does not let DPR change CSS coordinates", () => {
    const point = { lon: 2.3522, lat: 48.8566 };
    const lowDpr = createCamera({ pixelRatio: 1, viewportWidthCssPx: 360, viewportHeightCssPx: 800 });
    const highDpr = createCamera({ pixelRatio: 3, viewportWidthCssPx: 360, viewportHeightCssPx: 800 });
    expect(lonLatToScreen(point, lowDpr)).toEqual(lonLatToScreen(point, highDpr));
    expect(screenToLonLat(lonLatToScreen(point, highDpr), highDpr)).toEqual(
      screenToLonLat(lonLatToScreen(point, lowDpr), lowDpr),
    );
  });

  it("round-trips lon/lat at all supported zooms", () => {
    for (const zoom of [8, 11, 14, 17, 20]) {
      const camera = createCamera({ zoom, viewportWidthCssPx: 1280, viewportHeightCssPx: 720 });
      const point = { lon: 2.3522, lat: 48.8566 };
      const roundTrip = screenToLonLat(lonLatToScreen(point, camera), camera);
      expect(Math.hypot(roundTrip.lon - point.lon, roundTrip.lat - point.lat)).toBeLessThan(1e-12);
    }
  });

  it("converts CSS tolerance to world units without a renderer-specific branch", () => {
    const camera = createCamera({ zoom: 8 });
    expect(cssPixelsToWorldUnits(8, camera)).toBeCloseTo(8 / (256 * 2 ** 8), 15);
  });

  it("round-trips local geographic distances around the reference latitude", () => {
    const reference = lonLatToWorld({ lon: 2.3522, lat: 48.8566 });
    const worldDistance = metersToWorldUnits(5, reference);
    expect(worldUnitsToMeters(worldDistance, reference)).toBeCloseTo(5, 8);
  });

  it("rejects invalid lon/lat", () => {
    expect(() => lonLatToWorld({ lon: 181, lat: 0 })).toThrow();
    expect(() => lonLatToWorld({ lon: 0, lat: Number.NaN })).toThrow();
    expect(() => worldToLonLat({ x: Number.NaN, y: 0.5 })).toThrow();
  });
});
