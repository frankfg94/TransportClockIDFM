import {
  convertLambert93ToWgs84,
  projectLonLat,
} from "../../network-ghost/geoProjection.js";
import type { CameraState } from "./camera.js";
import type { GlobalMapBounds } from "../contracts/manifest.js";

export const WORLD_SCALE_AT_ZOOM_0 = 256;
export const MAX_MERCATOR_LATITUDE = 85.0511287798066;
export const WEB_MERCATOR_EARTH_RADIUS_METERS = 6_378_137;

export interface LonLatPoint {
  lon: number;
  lat: number;
}

export interface WorldPoint {
  x: number;
  y: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface SourcePoint {
  x: number;
  y: number;
  srsName?: string;
}

export function assertLonLat(point: LonLatPoint): void {
  if (
    !Number.isFinite(point.lon) ||
    !Number.isFinite(point.lat) ||
    point.lon < -180 ||
    point.lon > 180 ||
    point.lat < -90 ||
    point.lat > 90
  ) {
    throw new Error(`Invalid WGS84 coordinate (${point.lon}, ${point.lat})`);
  }
}

export function lonLatToWorld(point: LonLatPoint): WorldPoint {
  assertLonLat(point);
  const projected = projectLonLat(
    point.lon,
    Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, point.lat)),
  );
  return { x: projected.x, y: projected.y };
}

export function worldToLonLat(point: WorldPoint): LonLatPoint {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`Invalid world coordinate (${point.x}, ${point.y})`);
  }
  const result = {
    lon: point.x * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * point.y))) * 180) / Math.PI,
  };
  assertLonLat(result);
  return result;
}

export function sourceToLonLat(point: SourcePoint): LonLatPoint {
  if (point.srsName && point.srsName !== "EPSG:2154") {
    throw new Error(`Unsupported source CRS ${point.srsName}`);
  }
  const result = convertLambert93ToWgs84(point.x, point.y);
  if (!result) throw new Error(`Invalid EPSG:2154 coordinate (${point.x}, ${point.y})`);
  return result;
}

export function worldScaleAtZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) throw new Error("Zoom must be finite");
  return WORLD_SCALE_AT_ZOOM_0 * 2 ** zoom;
}

export function worldToScreen(point: WorldPoint, camera: CameraState): ScreenPoint {
  const scale = worldScaleAtZoom(camera.zoom);
  if (camera.pitch || camera.bearing) {
    const { cosB, sinB, cosP, sinP, distance } = perspective(camera);
    const dx = (point.x - camera.centerWorldX) * scale;
    const dy = (point.y - camera.centerWorldY) * scale;
    const y = -dx * sinB + dy * cosB;
    const factor = distance / Math.max(0.001, distance - y * sinP);
    return {
      x: camera.viewportWidthCssPx / 2 + (dx * cosB + dy * sinB) * factor,
      y: camera.viewportHeightCssPx / 2 + y * cosP * factor,
    };
  }
  return {
    x: (point.x - camera.centerWorldX) * scale + camera.viewportWidthCssPx / 2,
    y: (point.y - camera.centerWorldY) * scale + camera.viewportHeightCssPx / 2,
  };
}

export function screenToWorld(point: ScreenPoint, camera: CameraState): WorldPoint {
  const scale = worldScaleAtZoom(camera.zoom);
  if (camera.pitch || camera.bearing) {
    const { cosB, sinB, cosP, sinP, distance } = perspective(camera);
    const sy = point.y - camera.viewportHeightCssPx / 2;
    const y = sy / (cosP + sy * sinP / distance);
    const x = (point.x - camera.viewportWidthCssPx / 2) * (1 - y * sinP / distance);
    return {
      x: camera.centerWorldX + (x * cosB - y * sinB) / scale,
      y: camera.centerWorldY + (x * sinB + y * cosB) / scale,
    };
  }
  return {
    x: camera.centerWorldX + (point.x - camera.viewportWidthCssPx / 2) / scale,
    y: camera.centerWorldY + (point.y - camera.viewportHeightCssPx / 2) / scale,
  };
}

export function lonLatToScreen(point: LonLatPoint, camera: CameraState): ScreenPoint {
  return worldToScreen(lonLatToWorld(point), camera);
}

// MapLibre's default vertical field of view is 2 * atan(1/3). Cache the
// ground-plane transform across the many projections in one camera frame.
const perspectiveCache = new WeakMap<CameraState, ReturnType<typeof makePerspective>>();
function makePerspective(camera: CameraState) {
  const bearing = camera.bearing * Math.PI / 180;
  const pitch = (camera.pitch ?? 0) * Math.PI / 180;
  return { cosB: Math.cos(bearing), sinB: Math.sin(bearing), cosP: Math.cos(pitch),
    sinP: Math.sin(pitch), distance: camera.viewportHeightCssPx * 1.5 };
}
function perspective(camera: CameraState) {
  const cached = perspectiveCache.get(camera);
  if (cached) return cached;
  const transform = makePerspective(camera);
  perspectiveCache.set(camera, transform);
  return transform;
}

export function screenToLonLat(point: ScreenPoint, camera: CameraState): LonLatPoint {
  return worldToLonLat(screenToWorld(point, camera));
}

export function writeVisibleWorldBounds(
  camera: CameraState,
  target: GlobalMapBounds,
): GlobalMapBounds {
  const topLeft = screenToWorld({ x: 0, y: 0 }, camera);
  const bottomRight = screenToWorld(
    { x: camera.viewportWidthCssPx, y: camera.viewportHeightCssPx },
    camera,
  );
  target.minX = Math.min(topLeft.x, bottomRight.x);
  target.minY = Math.min(topLeft.y, bottomRight.y);
  target.maxX = Math.max(topLeft.x, bottomRight.x);
  target.maxY = Math.max(topLeft.y, bottomRight.y);
  if (camera.pitch || camera.bearing) {
    const tr = screenToWorld({ x: camera.viewportWidthCssPx, y: 0 }, camera);
    const bl = screenToWorld({ x: 0, y: camera.viewportHeightCssPx }, camera);
    target.minX = Math.min(target.minX, tr.x, bl.x);
    target.minY = Math.min(target.minY, tr.y, bl.y);
    target.maxX = Math.max(target.maxX, tr.x, bl.x);
    target.maxY = Math.max(target.maxY, tr.y, bl.y);
  }
  return target;
}

export function visibleWorldBounds(camera: CameraState): GlobalMapBounds {
  return writeVisibleWorldBounds(camera, {
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
  });
}

export function boundsCorners(bounds: GlobalMapBounds): WorldPoint[] {
  return [
    { x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY }, { x: bounds.minX, y: bounds.maxY },
  ];
}

export function expandBounds(bounds: GlobalMapBounds, ratio: number): GlobalMapBounds {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  return {
    minX: bounds.minX - width * ratio,
    minY: bounds.minY - height * ratio,
    maxX: bounds.maxX + width * ratio,
    maxY: bounds.maxY + height * ratio,
  };
}

export function boundsContainsPoint(bounds: GlobalMapBounds, point: WorldPoint): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
}

export function boundsIntersect(left: GlobalMapBounds, right: GlobalMapBounds): boolean {
  return !(
    left.maxX < right.minX ||
    left.minX > right.maxX ||
    left.maxY < right.minY ||
    left.minY > right.maxY
  );
}

export function cssPixelsToWorldUnits(cssPixels: number, camera: CameraState): number {
  if (!Number.isFinite(cssPixels) || cssPixels < 0) throw new Error("Invalid CSS pixel tolerance");
  return cssPixels / worldScaleAtZoom(camera.zoom);
}

/**
 * Return the local normalized-world scale at a reference point. Normalized
 * WebMercator uses the same local scale in both axes, with the latitude
 * correction accounting for the fact that the map is measured on the Earth
 * rather than on the projected plane.
 */
export function worldUnitsPerMeterAt(referenceWorld: WorldPoint): number {
  const latitude = worldToLonLat(referenceWorld).lat;
  const latitudeCosine = Math.max(
    1e-6,
    Math.abs(Math.cos((latitude * Math.PI) / 180)),
  );
  return 1 / (2 * Math.PI * WEB_MERCATOR_EARTH_RADIUS_METERS * latitudeCosine);
}

export function metersToWorldUnits(meters: number, referenceWorld: WorldPoint): number {
  if (!Number.isFinite(meters) || meters < 0) throw new Error("Invalid meter distance");
  return meters * worldUnitsPerMeterAt(referenceWorld);
}

export function worldUnitsToMeters(worldUnits: number, referenceWorld: WorldPoint): number {
  if (!Number.isFinite(worldUnits) || worldUnits < 0) throw new Error("Invalid world distance");
  return worldUnits / worldUnitsPerMeterAt(referenceWorld);
}
