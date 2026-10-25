import { fitCameraToBounds, type CameraState } from "../transport-map/geo/camera";
import { lonLatToWorld } from "../transport-map/geo/coordinateKernel";
import type { NearbyWalkingRoute } from "./nearbyWalkingRoutes";

/** Include the entire routed detour, even when it extends outside the discovery circle. */
export function fitNearbyPlaceRoute(
  camera: CameraState,
  origin: { lon: number; lat: number },
  place: { lon: number; lat: number },
  route?: NearbyWalkingRoute,
): CameraState {
  const points = [origin, place, ...(route?.coordinates ?? [])]
    .filter((point) => Number.isFinite(point.lon) && Number.isFinite(point.lat))
    .map(lonLatToWorld);
  // Leave the origin pin and endpoints clear of the top controls and the
  // bottom scale/overview controls in both embedded and fullscreen maps.
  return fitCameraToBounds(camera, {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  }, 48, 0, 18, { top: 36, bottom: 64 });
}
