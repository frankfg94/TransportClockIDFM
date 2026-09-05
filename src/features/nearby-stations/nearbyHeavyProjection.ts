import type { ScreenPoint } from "../transport-map/geo/coordinateKernel";

export type NearbyHeavyProjectionEdge = "top" | "right" | "bottom" | "left";
export type NearbyHeavyProjectionCorner =
  | "top-right"
  | "bottom-right"
  | "bottom-left"
  | "top-left";

export interface NearbyHeavyViewportProjection {
  point: ScreenPoint;
  anchor: NearbyHeavyProjectionEdge | NearbyHeavyProjectionCorner;
  corner?: NearbyHeavyProjectionCorner;
}

export interface NearbyHeavyProjectionBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Project a station outside the viewport using its actual screen octant.
 *
 * The old edge-only projection sent every diagonal through the first edge hit
 * by a ray. That made a north-east station look like a purely eastern one.
 * Keep cardinal stations on their ray, but snap a balanced diagonal to the
 * corresponding corner so the badge keeps the station's geographic bearing.
 */
export function projectNearbyHeavyStationToViewport(
  point: ScreenPoint,
  center: ScreenPoint,
  width: number,
  height: number,
  inset: number,
  bounds?: NearbyHeavyProjectionBounds,
): NearbyHeavyViewportProjection {
  const safeBounds = normalizeProjectionBounds(width, height, inset, bounds);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (absX >= 0.001 && absY >= 0.001 && isBalancedDiagonal(absX, absY)) {
    const corner = diagonalCorner(dx, dy);
    return {
      point: {
        x: corner.includes("right") ? safeBounds.right : safeBounds.left,
        y: corner.includes("bottom") ? safeBounds.bottom : safeBounds.top,
      },
      anchor: corner,
      corner,
    };
  }

  return {
    point: projectPointToViewportEdge(point, center, safeBounds),
    anchor: nearestMapEdge(
      projectPointToViewportEdge(point, center, safeBounds),
      safeBounds,
    ),
  };
}

/**
 * Use the same 2:1 axis ratio as heavy-line candidate de-duplication. A
 * station is diagonal only when both screen components are substantial; a
 * mostly-east RER marker therefore remains on the right edge.
 */
export function isBalancedDiagonal(absX: number, absY: number): boolean {
  return absX >= 0.001 && absY >= 0.001 &&
    absX < absY * 2 && absY < absX * 2;
}

function diagonalCorner(dx: number, dy: number): NearbyHeavyProjectionCorner {
  if (dx >= 0 && dy < 0) return "top-right";
  if (dx >= 0 && dy >= 0) return "bottom-right";
  if (dx < 0 && dy >= 0) return "bottom-left";
  return "top-left";
}

function projectPointToViewportEdge(
  point: ScreenPoint,
  center: ScreenPoint,
  bounds: NearbyHeavyProjectionBounds,
): ScreenPoint {
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return {
      x: Math.max(bounds.left, Math.min(center.x, bounds.right)),
      y: bounds.top,
    };
  }

  const scales = [
    dx > 0 ? (bounds.right - center.x) / dx : (bounds.left - center.x) / dx,
    dy > 0 ? (bounds.bottom - center.y) / dy : (bounds.top - center.y) / dy,
  ].filter((scale) => Number.isFinite(scale) && scale > 0);
  const scale = Math.min(...scales);

  if (!Number.isFinite(scale)) {
    return {
      x: Math.max(bounds.left, Math.min(point.x, bounds.right)),
      y: Math.max(bounds.top, Math.min(point.y, bounds.bottom)),
    };
  }

  return {
    x: Math.max(bounds.left, Math.min(center.x + dx * scale, bounds.right)),
    y: Math.max(bounds.top, Math.min(center.y + dy * scale, bounds.bottom)),
  };
}

function nearestMapEdge(
  point: ScreenPoint,
  bounds: NearbyHeavyProjectionBounds,
): NearbyHeavyProjectionEdge {
  const distances: Array<[NearbyHeavyProjectionEdge, number]> = [
    ["top", Math.abs(point.y - bounds.top)],
    ["right", Math.abs(point.x - bounds.right)],
    ["bottom", Math.abs(point.y - bounds.bottom)],
    ["left", Math.abs(point.x - bounds.left)],
  ];
  return distances.sort((left, right) => left[1] - right[1])[0]![0];
}

function normalizeProjectionBounds(
  width: number,
  height: number,
  inset: number,
  bounds?: NearbyHeavyProjectionBounds,
): NearbyHeavyProjectionBounds {
  const physicalLeft = Math.min(inset, Math.max(0, width));
  const physicalRight = Math.max(physicalLeft, width - inset);
  const physicalTop = Math.min(inset, Math.max(0, height));
  const physicalBottom = Math.max(physicalTop, height - inset);
  const left = clamp(bounds?.left ?? physicalLeft, physicalLeft, physicalRight);
  const right = clamp(bounds?.right ?? physicalRight, left, physicalRight);
  const top = clamp(bounds?.top ?? physicalTop, physicalTop, physicalBottom);
  const bottom = clamp(bounds?.bottom ?? physicalBottom, top, physicalBottom);
  return { left, right, top, bottom };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
