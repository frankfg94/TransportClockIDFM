import { describe, expect, it } from "vitest";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { lonLatToWorld, worldToScreen } from "../src/features/transport-map/geo/coordinateKernel";
import { hitTestGlobalIsochrones } from "../src/features/transport-map/isochrones/hitTest";
import type { GlobalIsochroneSurface } from "../src/features/transport-map/isochrones/contracts";
import { walkingPolygon } from "./fixtures/walkingIsochrones";

describe("global walking-zone hit testing", () => {
  it("returns every matching transport mode and excludes polygon holes", () => {
    const center = lonLatToWorld({ lon: 2.35, lat: 48.85 });
    const camera = createCamera({
      centerWorldX: center.x,
      centerWorldY: center.y,
      zoom: 13,
      viewportWidthCssPx: 800,
      viewportHeightCssPx: 600,
    });
    const surfaces: GlobalIsochroneSurface[] = [
      { id: "rer-15", mode: "RER", minutes: 15, geometry: walkingPolygon() },
      { id: "metro-10", mode: "METRO", minutes: 10, geometry: walkingPolygon() },
      { id: "tram-10", mode: "TRAM", minutes: 10, geometry: walkingPolygon(2.35, 48.85, true) },
    ];

    const outsideHole = worldToScreen(lonLatToWorld({ lon: 2.348, lat: 48.848 }), camera);
    expect(hitTestGlobalIsochrones(outsideHole, camera, surfaces).map((surface) => surface.id)).toEqual([
      "metro-10",
      "tram-10",
      "rer-15",
    ]);

    const insideHole = worldToScreen(center, camera);
    expect(hitTestGlobalIsochrones(insideHole, camera, surfaces).map((surface) => surface.id)).toEqual([
      "metro-10",
      "rer-15",
    ]);
  });
});
