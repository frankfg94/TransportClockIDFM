import type { GlobalIsochroneSurface } from "./contracts";
import { GLOBAL_MAP_MODE_ORDER } from "../contracts/manifest";
import type { CameraState } from "../geo/camera";
import {
  screenToWorld,
  worldScaleAtZoom,
  type ScreenPoint,
  type WorldPoint,
} from "../geo/coordinateKernel";
import type { WalkingIsochroneGeometry } from "../../../shared/walkingIsochroneGeometry";

interface PreparedPolygon {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  rings: Float64Array[];
}

/** Projection is cached by immutable geometry identity for pointermove performance. */
const preparedGeometryCache = new WeakMap<WalkingIsochroneGeometry, PreparedPolygon[]>();

/** Return every transport-specific walking zone containing the screen point. */
export function hitTestGlobalIsochrones(
  point: ScreenPoint,
  camera: CameraState,
  surfaces: readonly GlobalIsochroneSurface[] = [],
): GlobalIsochroneSurface[] {
  if (!surfaces.length) return [];
  const worldPoint = screenToWorld(point, camera);
  const edgeTolerance = 2 / worldScaleAtZoom(camera.zoom);
  return surfaces
    .filter((surface) => geometryContainsPoint(surface.geometry, worldPoint, edgeTolerance))
    .sort(compareIsochrones);
}

function geometryContainsPoint(
  geometry: WalkingIsochroneGeometry,
  point: WorldPoint,
  edgeTolerance: number,
): boolean {
  return prepareGeometry(geometry).some((polygon) => {
    if (
      point.x < polygon.minX - edgeTolerance ||
      point.x > polygon.maxX + edgeTolerance ||
      point.y < polygon.minY - edgeTolerance ||
      point.y > polygon.maxY + edgeTolerance
    ) return false;

    const outerRing = polygon.rings[0];
    if (!outerRing || !pointInRing(point, outerRing, edgeTolerance)) return false;
    return polygon.rings.slice(1).every((ring) => !pointInRing(point, ring, edgeTolerance));
  });
}

function prepareGeometry(geometry: WalkingIsochroneGeometry): PreparedPolygon[] {
  const cached = preparedGeometryCache.get(geometry);
  if (cached) return cached;

  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const prepared = polygons.map((polygon) => {
    const result: PreparedPolygon = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      rings: [],
    };
    for (const sourceRing of polygon) {
      const ring = new Float64Array(sourceRing.length * 2);
      sourceRing.forEach(([lon, lat], index) => {
        const world = projectLonLatToWorld(lon, lat);
        ring[index * 2] = world.x;
        ring[index * 2 + 1] = world.y;
        result.minX = Math.min(result.minX, world.x);
        result.minY = Math.min(result.minY, world.y);
        result.maxX = Math.max(result.maxX, world.x);
        result.maxY = Math.max(result.maxY, world.y);
      });
      result.rings.push(ring);
    }
    return result;
  });
  preparedGeometryCache.set(geometry, prepared);
  return prepared;
}

function projectLonLatToWorld(lon: number, lat: number): WorldPoint {
  // Keep this local import-free path in the cache builder so the hot pointer
  // path only works with already projected Float64Arrays.
  const x = (lon + 180) / 360;
  const latitude = Math.max(-85.0511287798066, Math.min(85.0511287798066, lat));
  const latitudeRadians = (latitude * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2;
  return { x, y };
}

function pointInRing(point: WorldPoint, ring: Float64Array, edgeTolerance: number): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 2; index < ring.length; index += 2) {
    const currentX = ring[index]!;
    const currentY = ring[index + 1]!;
    const previousX = ring[previous]!;
    const previousY = ring[previous + 1]!;
    if (distanceToSegment(point, previousX, previousY, currentX, currentY) <= edgeTolerance) {
      return true;
    }

    const crosses = (currentY > point.y) !== (previousY > point.y) &&
      point.x < ((previousX - currentX) * (point.y - currentY)) / (previousY - currentY) + currentX;
    if (crosses) inside = !inside;
    previous = index;
  }
  return inside;
}

function distanceToSegment(
  point: WorldPoint,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number {
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - startX) * dx + (point.y - startY) * dy) / lengthSquared));
  return Math.hypot(point.x - (startX + dx * ratio), point.y - (startY + dy * ratio));
}

function compareIsochrones(left: GlobalIsochroneSurface, right: GlobalIsochroneSurface): number {
  return left.minutes - right.minutes ||
    GLOBAL_MAP_MODE_ORDER.indexOf(left.mode) - GLOBAL_MAP_MODE_ORDER.indexOf(right.mode) ||
    left.id.localeCompare(right.id);
}
