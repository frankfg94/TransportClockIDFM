import { worldScaleAtZoom } from "../geo/coordinateKernel";
import type { CameraState } from "../geo/camera";

export interface ScreenVelocity {
  x: number;
  y: number;
}

export interface CameraPredictionOptions {
  horizonMs?: number;
  maxZoomDelta?: number;
}

/**
 * Predict the camera position reached after a short fling horizon. The
 * velocity is expressed in screen pixels per millisecond, matching the
 * interaction/inertia contract. The returned camera is a request hint only:
 * it deliberately keeps the current generation and never mutates state.
 */
export function predictCameraAhead(
  camera: CameraState,
  velocity: ScreenVelocity,
  options: CameraPredictionOptions = {},
): CameraState {
  const horizonMs = clampFinite(options.horizonMs ?? 0, 0, 5_000);
  const scale = worldScaleAtZoom(camera.zoom);
  const velocityX = Number.isFinite(velocity.x) ? velocity.x : 0;
  const velocityY = Number.isFinite(velocity.y) ? velocity.y : 0;
  return {
    ...camera,
    centerWorldX: camera.centerWorldX - (velocityX * horizonMs) / scale,
    centerWorldY: camera.centerWorldY - (velocityY * horizonMs) / scale,
  };
}

/**
 * Predict a camera flight destination while preserving the viewport/density
 * information required by the data-source prefetch API.
 */
export function predictCameraTarget(
  camera: CameraState,
  target: { centerWorldX: number; centerWorldY: number; zoom?: number },
  options: CameraPredictionOptions = {},
): CameraState {
  const requestedZoom = target.zoom ?? camera.zoom;
  const maxZoomDelta = options.maxZoomDelta;
  const zoom =
    Number.isFinite(maxZoomDelta) && (maxZoomDelta as number) >= 0
      ? clampFinite(requestedZoom, camera.zoom - (maxZoomDelta as number), camera.zoom + (maxZoomDelta as number))
      : requestedZoom;
  return {
    ...camera,
    centerWorldX: Number.isFinite(target.centerWorldX) ? target.centerWorldX : camera.centerWorldX,
    centerWorldY: Number.isFinite(target.centerWorldY) ? target.centerWorldY : camera.centerWorldY,
    zoom: Number.isFinite(zoom) ? zoom : camera.zoom,
  };
}

function clampFinite(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}
