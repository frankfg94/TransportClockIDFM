import { describe, expect, it } from "vitest";
import type { CameraState } from "../src/features/transport-map/geo/camera";
import { worldScaleAtZoom, worldToLonLat } from "../src/features/transport-map/geo/coordinateKernel";
import { selectRealEstateViewportCells } from "../src/features/transport-map/real-estate/realEstateViewportSelection";
import type { DvfMapGridCell } from "../src/services/real-estate/realEstateMapLayer";

function cameraAt(zoom = 12): CameraState {
  return {
    centerWorldX: 0.5,
    centerWorldY: 0.4,
    zoom,
    bearing: 0,
    viewportWidthCssPx: 200,
    viewportHeightCssPx: 120,
    pixelRatio: 1,
    generation: 0,
  };
}

function cellAtScreenX(camera: CameraState, screenX: number, cityCode: string): DvfMapGridCell {
  const world = worldToLonLat({
    x: camera.centerWorldX + (screenX - camera.viewportWidthCssPx / 2) / worldScaleAtZoom(camera.zoom),
    y: camera.centerWorldY,
  });
  return {
    cityCode,
    cityName: cityCode,
    lon: world.lon,
    lat: world.lat,
    transactionCount: 1,
    meanPriceM2: 1,
    medianPriceM2: 1,
  };
}

describe("real-estate viewport cell selection", () => {
  it("keeps visible and heatmap-influence cells, while excluding distant cells", () => {
    const camera = cameraAt();
    const center = cellAtScreenX(camera, 100, "center");
    const justOutsideViewport = cellAtScreenX(camera, 240, "edge");
    const distant = cellAtScreenX(camera, 500, "distant");
    const cells = [distant, justOutsideViewport, center];

    expect(selectRealEstateViewportCells(cells, camera, 72)).toEqual([justOutsideViewport, center]);
  });

  it("reuses the same selected array while panning inside overscan", () => {
    const camera = cameraAt();
    const cells = [cellAtScreenX(camera, 100, "center"), cellAtScreenX(camera, 240, "edge")];
    const first = selectRealEstateViewportCells(cells, camera, 72);
    const smallPan = {
      ...camera,
      centerWorldX: camera.centerWorldX + 100 / worldScaleAtZoom(camera.zoom),
      generation: camera.generation + 1,
    };

    expect(selectRealEstateViewportCells(cells, smallPan, 72)).toBe(first);
  });

  it("requeries the index after the camera leaves its overscan", () => {
    const camera = cameraAt();
    const cells = [
      cellAtScreenX(camera, 100, "old-center"),
      cellAtScreenX(camera, 240, "edge"),
      cellAtScreenX(camera, 500, "new-center"),
    ];
    const first = selectRealEstateViewportCells(cells, camera, 72);
    const largePan = {
      ...camera,
      centerWorldX: camera.centerWorldX + 400 / worldScaleAtZoom(camera.zoom),
      generation: camera.generation + 1,
    };
    const next = selectRealEstateViewportCells(cells, largePan, 72);

    expect(next).not.toBe(first);
    expect(next).toContain(cells[2]);
    expect(next).not.toContain(cells[0]);
  });
});
