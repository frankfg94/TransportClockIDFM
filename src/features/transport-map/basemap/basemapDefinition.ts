import type { CameraState } from "../geo/camera";
import { worldScaleAtZoom } from "../geo/coordinateKernel";
import type { TransportMapBasemapTile } from "./tileMath";

/**
 * Reprojects a raster definition from the camera at which its tiles were
 * created to the current live camera. The formula is intentionally pure so
 * it can be checked independently from the Vue transaction state machine.
 */
export function definitionTransformStyle(
  anchorCamera: CameraState,
  liveCamera: CameraState,
): Record<string, string> | undefined {
  if (
    anchorCamera.viewportWidthCssPx !== liveCamera.viewportWidthCssPx ||
    anchorCamera.viewportHeightCssPx !== liveCamera.viewportHeightCssPx ||
    anchorCamera.pixelRatio !== liveCamera.pixelRatio
  ) return undefined;

  const anchorScale = worldScaleAtZoom(anchorCamera.zoom);
  const currentScale = worldScaleAtZoom(liveCamera.zoom);
  const ratio = currentScale / anchorScale;
  const translateX = (anchorCamera.centerWorldX - liveCamera.centerWorldX) * currentScale
    + (1 - ratio) * liveCamera.viewportWidthCssPx / 2;
  const translateY = (anchorCamera.centerWorldY - liveCamera.centerWorldY) * currentScale
    + (1 - ratio) * liveCamera.viewportHeightCssPx / 2;
  if (Math.abs(ratio - 1) < 0.000001 && Math.abs(translateX) < 0.001 && Math.abs(translateY) < 0.001) {
    return undefined;
  }
  return {
    transform: `translate3d(${translateX}px, ${translateY}px, 0) scale3d(${ratio}, ${ratio}, 1)`,
  };
}

export function tileDefinitionSignature(tiles: TransportMapBasemapTile[]): string {
  return tiles
    .map((tile) => `${tile.id}:${tile.url}`)
    .sort()
    .join("|");
}
