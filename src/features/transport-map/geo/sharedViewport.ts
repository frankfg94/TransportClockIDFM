import type { GlobalMapBounds } from "../contracts/manifest";
import type { CameraState } from "./camera";
import { updateCamera } from "./camera";
import { visibleWorldBounds } from "./coordinateKernel";

export const SHARED_VIEWPORT_QUERY_KEY = "viewport";

const SHARED_VIEWPORT_SEPARATOR = "~";
const SHARED_VIEWPORT_COORDINATE_PRECISION = 10;

/**
 * Serializes the complete visible world rectangle rather than just a center
 * point. A shared URL therefore restores the same framing on the same map
 * viewport and derives the corresponding camera zoom from its width/height.
 */
export function encodeSharedViewport(camera: CameraState): string {
  const bounds = visibleWorldBounds(camera);
  return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]
    .map((coordinate) => coordinate.toFixed(SHARED_VIEWPORT_COORDINATE_PRECISION))
    .join(SHARED_VIEWPORT_SEPARATOR);
}

export function decodeSharedViewport(value: unknown): GlobalMapBounds | undefined {
  if (typeof value !== "string") return undefined;
  const coordinates = value.split(SHARED_VIEWPORT_SEPARATOR).map(Number);
  if (
    coordinates.length !== 4 ||
    coordinates.some((coordinate) => !Number.isFinite(coordinate))
  ) return undefined;

  const [minX, minY, maxX, maxY] = coordinates;
  if (
    minX === undefined ||
    minY === undefined ||
    maxX === undefined ||
    maxY === undefined ||
    maxX <= minX ||
    maxY <= minY ||
    maxX - minX > 2 ||
    maxY - minY > 2
  ) return undefined;

  return { minX, minY, maxX, maxY };
}

export function cameraFromSharedViewport(
  camera: CameraState,
  bounds: GlobalMapBounds,
  minZoom: number,
  maxZoom: number,
): CameraState {
  const width = Math.max(bounds.maxX - bounds.minX, Number.EPSILON);
  const height = Math.max(bounds.maxY - bounds.minY, Number.EPSILON);
  const scale = Math.min(
    camera.viewportWidthCssPx / width,
    camera.viewportHeightCssPx / height,
  );
  const zoom = Math.max(minZoom, Math.min(maxZoom, Math.log2(scale / 256)));
  return updateCamera(camera, {
    centerWorldX: (bounds.minX + bounds.maxX) / 2,
    centerWorldY: (bounds.minY + bounds.maxY) / 2,
    zoom,
  });
}
