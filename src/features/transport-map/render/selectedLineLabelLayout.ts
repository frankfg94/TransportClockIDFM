import type { GlobalMapStation } from "../contracts/manifest";
import type { CameraState } from "../geo/camera";
import { worldToScreen, type WorldPoint } from "../geo/coordinateKernel";
import { packScreenIntervals } from "./screenIntervalPacking";

export type SelectedLineLabelOrientation = "vertical" | "horizontal";
export interface SelectedLineConnectionGroupSize {
  stationId: string;
  lineCount: number;
}
export interface SelectedLineConnectionIconBox {
  stationId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  anchorX: number;
  anchorY: number;
  side: "left" | "below";
}
export interface SelectedLineAnnotationLayout {
  key: string;
  orientation: SelectedLineLabelOrientation;
  connectionIconBoxes: readonly SelectedLineConnectionIconBox[];
}

/** Shared with HTML so the collision bounds match the rendered single row. */
export const SELECTED_LINE_CONNECTION_METRICS = {
  iconWidth: 28,
  iconHeight: 24,
  iconGap: 3,
  paddingX: 4,
  paddingY: 3,
  border: 1,
} as const;

const STATION_GAP_CSS_PX = 14;
const BOX_COLLISION_GAP_CSS_PX = 6;
// The selected route is 10px wide; leave another 5px beyond its stroke/dots.
const TRACE_CLEARANCE_CSS_PX = 10;
type ScreenBox = Pick<SelectedLineConnectionIconBox, "left" | "top" | "width" | "height">;

export function resolveSelectedLineLabelOrientation(
  stations: readonly Pick<GlobalMapStation, "worldX" | "worldY">[],
): SelectedLineLabelOrientation | undefined {
  const points = stations.filter((station) =>
    Number.isFinite(station.worldX) && Number.isFinite(station.worldY),
  );
  if (points.length < 2) return undefined;
  const xs = points.map((point) => point.worldX);
  const ys = points.map((point) => point.worldY);
  return Math.max(...ys) - Math.min(...ys) >= Math.max(...xs) - Math.min(...xs)
    ? "vertical" : "horizontal";
}

/**
 * Shares correspondence bounds with Deck labels. The entire rendered trace is
 * an obstacle, including bends between stations and independent branches.
 */
export function createSelectedLineAnnotationLayout(
  stations: readonly Pick<GlobalMapStation, "id" | "worldX" | "worldY">[],
  connectionGroups: readonly SelectedLineConnectionGroupSize[],
  camera: CameraState,
  routeSubpaths: readonly (readonly WorldPoint[])[] = [],
): SelectedLineAnnotationLayout {
  const orientation = resolveSelectedLineLabelOrientation(stations) ?? "vertical";
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const metrics = SELECTED_LINE_CONNECTION_METRICS;
  const rowHeight = metrics.iconHeight + 2 * (metrics.paddingY + metrics.border);
  const sortedGroups = connectionGroups
    .filter((group) => group.lineCount > 0 && stationById.has(group.stationId))
    .map((group) => {
      const station = stationById.get(group.stationId)!;
      return {
        ...group,
        point: worldToScreen({ x: station.worldX, y: station.worldY }, camera),
        width: group.lineCount * metrics.iconWidth
          + (group.lineCount - 1) * metrics.iconGap
          + 2 * (metrics.paddingX + metrics.border),
      };
    })
    .sort((left, right) => orientation === "vertical"
      ? left.point.y - right.point.y : left.point.x - right.point.x);
  const screenRoutes = routeSubpaths.map((subpath) =>
    subpath.map((point) => worldToScreen(point, camera)));
  // Keep station dots clear even while detailed trace geometry is loading.
  screenRoutes.push(...stations.map((station) =>
    [worldToScreen({ x: station.worldX, y: station.worldY }, camera)]));
  const rowTops = packScreenIntervals(
    sortedGroups.map((group) => group.point.y), sortedGroups.map(() => rowHeight), BOX_COLLISION_GAP_CSS_PX,
  ).map((center) => center - rowHeight / 2);
  const result: SelectedLineConnectionIconBox[] = [];

  for (let index = 0; index < sortedGroups.length; index += 1) {
    const group = sortedGroups[index]!;
    const box: ScreenBox = {
      left: group.point.x - group.width / 2,
      top: group.point.y + STATION_GAP_CSS_PX,
      width: group.width,
      height: rowHeight,
    };
    if (orientation === "vertical") {
      box.top = rowTops[index]!;
      const traceLeft = routeExtentInBand(screenRoutes, orientation,
        box.top - TRACE_CLEARANCE_CSS_PX,
        box.top + box.height + TRACE_CLEARANCE_CSS_PX);
      const right = Math.min(group.point.x - STATION_GAP_CSS_PX,
        traceLeft === undefined ? Number.POSITIVE_INFINITY : traceLeft - TRACE_CLEARANCE_CSS_PX);
      box.left = right - box.width;
    } else {
      const traceBottom = routeExtentInBand(screenRoutes, orientation,
        box.left - TRACE_CLEARANCE_CSS_PX,
        box.left + box.width + TRACE_CLEARANCE_CSS_PX);
      box.top = Math.max(box.top,
        traceBottom === undefined ? Number.NEGATIVE_INFINITY : traceBottom + TRACE_CLEARANCE_CSS_PX);
      // Preserve x: overlapping intervals use the nearest free row below.
      let collisions = result.filter((other) => boxesOverlap(box, other));
      while (collisions.length) {
        box.top = Math.max(...collisions.map((other) =>
          other.top + other.height + BOX_COLLISION_GAP_CSS_PX));
        collisions = result.filter((other) => boxesOverlap(box, other));
      }
    }
    result.push({
      ...box,
      stationId: group.stationId,
      offsetX: box.left - group.point.x,
      offsetY: box.top - group.point.y,
      anchorX: group.point.x,
      anchorY: group.point.y,
      side: orientation === "vertical" ? "left" : "below",
    });
  }
  const key = [orientation, camera.zoom.toFixed(4), ...result.map((box) =>
    [box.stationId, box.width, box.offsetX.toFixed(2), box.offsetY.toFixed(2)].join(":"))].join("|");
  return { key, orientation, connectionIconBoxes: result };
}

/** Clip segments to the row's band before finding the trace's free side. */
function routeExtentInBand(
  subpaths: readonly (readonly WorldPoint[])[],
  orientation: SelectedLineLabelOrientation,
  lower: number,
  upper: number,
): number | undefined {
  let extent: number | undefined;
  const primary = (point: WorldPoint) => orientation === "vertical" ? point.y : point.x;
  const transverse = (point: WorldPoint) => orientation === "vertical" ? point.x : point.y;
  const include = (value: number) => {
    extent = extent === undefined ? value : orientation === "vertical"
      ? Math.min(extent, value) : Math.max(extent, value);
  };
  for (const points of subpaths) {
    for (const point of points) {
      if (primary(point) >= lower && primary(point) <= upper) include(transverse(point));
    }
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1]!;
      const end = points[index]!;
      const delta = primary(end) - primary(start);
      if (delta === 0) continue; // The endpoints above cover this segment.
      const entry = (lower - primary(start)) / delta;
      const exit = (upper - primary(start)) / delta;
      const from = Math.max(0, Math.min(entry, exit));
      const to = Math.min(1, Math.max(entry, exit));
      if (from > to) continue;
      const crossDelta = transverse(end) - transverse(start);
      include(transverse(start) + from * crossDelta);
      include(transverse(start) + to * crossDelta);
    }
  }
  return extent;
}

function boxesOverlap(left: ScreenBox, right: ScreenBox): boolean {
  const gap = BOX_COLLISION_GAP_CSS_PX;
  return !(
    left.left + left.width + gap <= right.left ||
    right.left + right.width + gap <= left.left ||
    left.top + left.height + gap <= right.top ||
    right.top + right.height + gap <= left.top
  );
}

