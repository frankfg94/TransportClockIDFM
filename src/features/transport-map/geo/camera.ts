import type { GlobalMapBounds } from "../contracts/manifest.js";
import {
  screenToWorld,
  visibleWorldBounds,
  worldScaleAtZoom,
  worldToScreen,
  type ScreenPoint,
  type WorldPoint,
} from "./coordinateKernel.js";

export interface CameraState {
  centerWorldX: number;
  centerWorldY: number;
  zoom: number;
  bearing: 0;
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
  pixelRatio: number;
  generation: number;
}

export interface CameraViewportOptions {
  centerWorldX?: number;
  centerWorldY?: number;
  zoom?: number;
  viewportWidthCssPx?: number;
  viewportHeightCssPx?: number;
  pixelRatio?: number;
  generation?: number;
}

export const DEFAULT_CAMERA: Readonly<CameraState> = {
  centerWorldX: 0.5,
  centerWorldY: 0.5,
  zoom: 8,
  bearing: 0,
  viewportWidthCssPx: 360,
  viewportHeightCssPx: 640,
  pixelRatio: 1,
  generation: 0,
};

export function createCamera(options: CameraViewportOptions = {}): CameraState {
  return {
    ...DEFAULT_CAMERA,
    ...options,
    bearing: 0,
  };
}

export function cloneCamera(camera: CameraState): CameraState {
  return { ...camera };
}

export function updateCamera(
  camera: CameraState,
  patch: Partial<Omit<CameraState, "bearing">>,
): CameraState {
  return {
    ...camera,
    ...patch,
    bearing: 0,
    generation: patch.generation ?? camera.generation + 1,
  };
}

export function panCameraByScreen(
  camera: CameraState,
  delta: ScreenPoint,
): CameraState {
  const scale = worldScaleAtZoom(camera.zoom);
  return updateCamera(camera, {
    centerWorldX: camera.centerWorldX - delta.x / scale,
    centerWorldY: camera.centerWorldY - delta.y / scale,
  });
}

export function zoomCameraAroundScreenPoint(
  camera: CameraState,
  nextZoom: number,
  anchorScreen: ScreenPoint,
): CameraState {
  const anchorWorld = screenToWorld(anchorScreen, camera);
  const newScale = worldScaleAtZoom(nextZoom);
  // Apply the zoom and anchor correction as one camera update. Apart from
  // avoiding a short-lived intermediate object, this keeps one wheel sample
  // to one generation and reduces obsolete viewport bookkeeping during a
  // continuous gesture.
  return updateCamera(camera, {
    zoom: nextZoom,
    centerWorldX: anchorWorld.x - (anchorScreen.x - camera.viewportWidthCssPx / 2) / newScale,
    centerWorldY: anchorWorld.y - (anchorScreen.y - camera.viewportHeightCssPx / 2) / newScale,
  });
}

export function resizeCamera(
  camera: CameraState,
  widthCssPx: number,
  heightCssPx: number,
  pixelRatio: number,
): CameraState {
  if (!Number.isFinite(widthCssPx) || widthCssPx <= 0) throw new Error("Invalid camera width");
  if (!Number.isFinite(heightCssPx) || heightCssPx <= 0) throw new Error("Invalid camera height");
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) throw new Error("Invalid pixel ratio");
  return updateCamera(camera, {
    viewportWidthCssPx: widthCssPx,
    viewportHeightCssPx: heightCssPx,
    pixelRatio,
  });
}

export function fitCameraToBounds(
  camera: CameraState,
  bounds: GlobalMapBounds,
  paddingCssPx = 24,
  minZoom = 0,
  maxZoom = 20,
): CameraState {
  const width = Math.max(bounds.maxX - bounds.minX, Number.EPSILON);
  const height = Math.max(bounds.maxY - bounds.minY, Number.EPSILON);
  const availableWidth = Math.max(1, camera.viewportWidthCssPx - paddingCssPx * 2);
  const availableHeight = Math.max(1, camera.viewportHeightCssPx - paddingCssPx * 2);
  const scale = Math.min(availableWidth / width, availableHeight / height);
  const zoom = Math.max(minZoom, Math.min(maxZoom, Math.log2(scale / 256)));
  return updateCamera(camera, {
    centerWorldX: (bounds.minX + bounds.maxX) / 2,
    centerWorldY: (bounds.minY + bounds.maxY) / 2,
    zoom,
  });
}

export function clampCameraToBounds(
  camera: CameraState,
  bounds: GlobalMapBounds,
  paddingRatio = 0.15,
): CameraState {
  const viewportBounds = visibleWorldBounds(camera);
  const width = viewportBounds.maxX - viewportBounds.minX;
  const height = viewportBounds.maxY - viewportBounds.minY;
  const padded = {
    minX: bounds.minX - width * paddingRatio,
    minY: bounds.minY - height * paddingRatio,
    maxX: bounds.maxX + width * paddingRatio,
    maxY: bounds.maxY + height * paddingRatio,
  };
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const centerWorldX = Math.max(padded.minX + halfWidth, Math.min(padded.maxX - halfWidth, camera.centerWorldX));
  const centerWorldY = Math.max(padded.minY + halfHeight, Math.min(padded.maxY - halfHeight, camera.centerWorldY));
  return updateCamera(camera, { centerWorldX, centerWorldY });
}

export function preserveScreenAnchor(
  camera: CameraState,
  anchorWorld: WorldPoint,
  anchorScreen: ScreenPoint,
): CameraState {
  const scale = worldScaleAtZoom(camera.zoom);
  return updateCamera(camera, {
    centerWorldX: anchorWorld.x - (anchorScreen.x - camera.viewportWidthCssPx / 2) / scale,
    centerWorldY: anchorWorld.y - (anchorScreen.y - camera.viewportHeightCssPx / 2) / scale,
  });
}

export function transformCameraForPinch(
  initialCamera: CameraState,
  initialDistance: number,
  anchorWorld: WorldPoint,
  currentDistance: number,
  currentMidpoint: ScreenPoint,
  minZoom = 0,
  maxZoom = 20,
): CameraState {
  if (!Number.isFinite(initialDistance) || initialDistance <= 0) throw new Error("Invalid initial pinch distance");
  if (!Number.isFinite(currentDistance) || currentDistance <= 0) throw new Error("Invalid current pinch distance");
  const nextZoom = Math.max(
    minZoom,
    Math.min(maxZoom, initialCamera.zoom + Math.log2(currentDistance / initialDistance)),
  );
  return preserveScreenAnchor(
    updateCamera(initialCamera, { zoom: nextZoom }),
    anchorWorld,
    currentMidpoint,
  );
}

export function cameraAnchorError(
  camera: CameraState,
  world: WorldPoint,
  expectedScreen: ScreenPoint,
): number {
  const actual = worldToScreen(world, camera);
  return Math.hypot(actual.x - expectedScreen.x, actual.y - expectedScreen.y);
}
