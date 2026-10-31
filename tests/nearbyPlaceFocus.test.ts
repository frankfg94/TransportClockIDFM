import { describe, expect, it } from "vitest";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { lonLatToWorld, worldToScreen } from "../src/features/transport-map/geo/coordinateKernel";
import { fitNearbyPlaceRoute } from "../src/features/nearby-stations/nearbyPlaceFocus";
import { createStraightLineWalkingRoute } from "../src/features/nearby-stations/nearbyWalkingRoutes";

describe("commerce route framing", () => {
  it('keeps the entire footprint visible when the origin and marker are close together', () => {
    const origin = { lon: 2.298, lat: 48.772 };
    const ring: [number, number][] = [[2.28,48.76],[2.31,48.76],[2.31,48.78],[2.28,48.78],[2.28,48.76]];
    const camera = createCamera({ viewportWidthCssPx: 400, viewportHeightCssPx: 650 });
    const fitted = fitNearbyPlaceRoute(camera, origin, { ...origin, footprintRings: [ring] });
    for (const [lon,lat] of ring) {
      const point = worldToScreen(lonLatToWorld({lon,lat}), fitted);
      expect(point.x).toBeGreaterThanOrEqual(47.99);
      expect(point.x).toBeLessThanOrEqual(352.01);
      expect(point.y).toBeGreaterThanOrEqual(47.99);
      expect(point.y).toBeLessThanOrEqual(602.01);
    }
  });
  it.each([[900, 650], [350, 430]])("keeps origin, commerce and a late detour visible in %sx%s", (width, height) => {
    const origin = { lon: 2.29, lat: 48.8 };
    const place = { lon: 2.30, lat: 48.802 };
    const detour = { lon: 2.32, lat: 48.81 };
    const camera = createCamera({ viewportWidthCssPx: width, viewportHeightCssPx: height });
    const route = { ...createStraightLineWalkingRoute(origin, place), coordinates: [origin, detour, place] };
    const initial = fitNearbyPlaceRoute(camera, origin, place);
    const fitted = fitNearbyPlaceRoute(camera, origin, place, route);
    expect(fitted.zoom).toBeLessThan(initial.zoom);
    for (const point of route.coordinates) {
      const screen = worldToScreen(lonLatToWorld(point), fitted);
      expect(screen.x).toBeGreaterThanOrEqual(47.99);
      expect(screen.y).toBeGreaterThanOrEqual(47.99);
      expect(screen.x).toBeLessThanOrEqual(width - 47.99);
      expect(screen.y).toBeLessThanOrEqual(height - 47.99);
    }
  });
});
