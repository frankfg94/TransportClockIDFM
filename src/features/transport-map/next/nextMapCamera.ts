import type { CameraState } from "../geo/camera";
import { worldToLonLat } from "../geo/coordinateKernel";

/** MapLibre's default vector world is 512 px at zoom 0; the legacy camera is 256. */
export const MAPLIBRE_VECTOR_WORLD_TILE_SIZE = 512;
export const LEGACY_WORLD_TILE_SIZE = 256;

export interface MapLibreCameraView {
  center: [number, number];
  zoom: number;
  bearing: 0;
  pitch: 0;
}

export function cameraZoomToMapLibreZoom(zoom: number): number {
  return zoom + Math.log2(LEGACY_WORLD_TILE_SIZE / MAPLIBRE_VECTOR_WORLD_TILE_SIZE);
}

export function mapLibreZoomToCameraZoom(zoom: number): number {
  return zoom + Math.log2(MAPLIBRE_VECTOR_WORLD_TILE_SIZE / LEGACY_WORLD_TILE_SIZE);
}

export function cameraStateToMapLibreView(camera: Pick<CameraState, "centerWorldX" | "centerWorldY" | "zoom">): MapLibreCameraView {
  const center = worldToLonLat({ x: camera.centerWorldX, y: camera.centerWorldY });
  return {
    center: [center.lon, center.lat],
    zoom: cameraZoomToMapLibreZoom(camera.zoom),
    bearing: 0,
    pitch: 0,
  };
}

export function mapLibreZoomMatchesCamera(legacyZoom: number, mapLibreZoom: number, epsilon = 1e-9): boolean {
  return Math.abs(cameraZoomToMapLibreZoom(legacyZoom) - mapLibreZoom) <= epsilon;
}
