import { describe, expect, it } from "vitest";
import {
  createCamera,
  zoomCameraAroundScreenPoint,
} from "../src/features/transport-map/geo/camera";
import {
  screenToWorld,
  worldToScreen,
} from "../src/features/transport-map/geo/coordinateKernel";
import { TRANSPORT_MAP_PRECISION } from "../src/features/transport-map/geo/precisionContract";

describe("transport map zoom drift", () => {
  it("keeps a non-central station stable after 1000 zoom cycles", () => {
    const anchor = { x: 91, y: 381 };
    let camera = createCamera({
      centerWorldX: 0.008,
      centerWorldY: 0.149,
      zoom: 8,
      viewportWidthCssPx: 412,
      viewportHeightCssPx: 915,
    });
    const anchorWorld = screenToWorld(anchor, camera);
    for (let cycle = 0; cycle < 1000; cycle += 1) {
      for (let zoom = 9; zoom <= 20; zoom += 1) {
        camera = zoomCameraAroundScreenPoint(camera, zoom, anchor);
      }
      for (let zoom = 19; zoom >= 8; zoom -= 1) {
        camera = zoomCameraAroundScreenPoint(camera, zoom, anchor);
      }
    }
    const actual = worldToScreen(anchorWorld, camera);
    expect(Math.hypot(actual.x - anchor.x, actual.y - anchor.y)).toBeLessThanOrEqual(
      TRANSPORT_MAP_PRECISION.zoomDriftCssPx,
    );
    expect(Math.hypot(anchorWorld.x - screenToWorld(anchor, camera).x, anchorWorld.y - screenToWorld(anchor, camera).y)).toBeLessThan(
      1e-12,
    );
  });
});
