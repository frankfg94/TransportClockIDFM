import type { GlobalMapLine, GlobalMapPath, GlobalMapStation } from "../contracts/manifest";
import type { GlobalIsochroneSurface } from "../isochrones/contracts";
import {
  GLOBAL_MAP_MODE_ORDER,
  getGlobalMapPathSubpathRanges,
  resolveGlobalMapVertex,
} from "../contracts/manifest";
import type { CameraState } from "../geo/camera";
import {
  cssPixelsToWorldUnits,
  metersToWorldUnits,
  screenToWorld,
  worldToScreen,
  worldUnitsToMeters,
  type ScreenPoint,
  type WorldPoint,
} from "../geo/coordinateKernel";
import { PackedSpatialIndex } from "./packedIndex";

export interface MapHitTestResult {
  id: string;
  distanceCssPx: number;
}

export interface LineHitResult extends MapHitTestResult {
  type: "line";
}

export interface LineHitCandidate extends LineHitResult {
  type: "line";
  pathId: string;
  /** Index of the first vertex of the closest path segment. */
  vertexSegmentIndex?: number;
  /** Geographic distance from the primary line's closest point, in metres. */
  distanceMeters: number;
}

export interface IsochroneHitCandidate extends MapHitTestResult {
  type: "isochrone";
  /** All transport-specific zones containing the pointer, ordered by mode/time. */
  surfaces: readonly GlobalIsochroneSurface[];
}

export interface StationHitCandidate extends MapHitTestResult {
  type: "station";
}

export type HitTestResult = StationHitCandidate | LineHitResult | IsochroneHitCandidate;

export interface TransportMapHitCandidates {
  station?: HitTestResult & { type: "station" };
  lines: LineHitCandidate[];
  isochrone?: IsochroneHitCandidate;
}

export interface HitTestOptions {
  stationToleranceCssPx?: number;
  lineToleranceCssPx?: number;
  /** Radius around the primary line's closest point used for grouping. */
  lineCandidateRadiusMeters?: number;
  modeMask?: number;
}

// Keep station selection forgiving enough for a pointer to land near the
// small rendered dot, especially on touchpads and dense metro/RER segments.
// Lines are deliberately kept on their narrower tolerance below.
export const DEFAULT_STATION_HIT_TOLERANCE_CSS_PX = 18;
export const DEFAULT_LINE_HIT_TOLERANCE_CSS_PX = 8;
export const DEFAULT_LINE_CANDIDATE_RADIUS_METERS = 5;

export function hitTestTransportMap(
  point: ScreenPoint,
  camera: CameraState,
  stations: GlobalMapStation[],
  lines: GlobalMapLine[],
  paths: GlobalMapPath[],
  stationIndex = new PackedSpatialIndex([]),
  pathIndex = new PackedSpatialIndex([]),
  options: HitTestOptions = {},
): HitTestResult | undefined {
  const candidates = queryTransportMapCandidates(
    point,
    camera,
    stations,
    lines,
    paths,
    stationIndex,
    pathIndex,
    options,
  );
  const firstLine = candidates.lines[0];
  return candidates.station ?? (
    firstLine
      ? { type: "line", id: firstLine.id, distanceCssPx: firstLine.distanceCssPx }
      : undefined
  );
}

/**
 * Run the normal station-first hit test and, when no station owns the point,
 * return every visible line close to the closest point on the primary line.
 * The caller supplies the already-rendered paths, so this never loads data or
 * considers hidden LOD/chunk geometry.
 */
export function queryTransportMapCandidates(
  point: ScreenPoint,
  camera: CameraState,
  stations: GlobalMapStation[],
  lines: GlobalMapLine[],
  paths: GlobalMapPath[],
  stationIndex = new PackedSpatialIndex([]),
  pathIndex = new PackedSpatialIndex([]),
  options: HitTestOptions = {},
): TransportMapHitCandidates {
  const bestStation = findNearestStation(
    point,
    camera,
    stations,
    stationIndex,
    options.stationToleranceCssPx ?? DEFAULT_STATION_HIT_TOLERANCE_CSS_PX,
  );
  if (bestStation) return { station: bestStation, lines: [] };

  return {
    lines: queryTransportMapLineCandidates(
      point,
      camera,
      stations,
      lines,
      paths,
      pathIndex,
      options,
    ),
  };
}

/**
 * Find the primary line with the existing screen-space tolerance, then group
 * visible paths by line when their closest point is within the local metric
 * radius of that primary closest point. Paths are deduplicated by line id.
 */
export function queryTransportMapLineCandidates(
  point: ScreenPoint,
  camera: CameraState,
  stations: GlobalMapStation[],
  lines: GlobalMapLine[],
  paths: GlobalMapPath[],
  pathIndex = new PackedSpatialIndex([]),
  options: HitTestOptions = {},
): LineHitCandidate[] {
  const lineTolerance = options.lineToleranceCssPx ?? DEFAULT_LINE_HIT_TOLERANCE_CSS_PX;
  const primary = findNearestLine(
    point,
    camera,
    stations,
    lines,
    paths,
    pathIndex,
    lineTolerance,
    options.modeMask,
  );
  if (!primary) return [];

  const radiusMeters = options.lineCandidateRadiusMeters ?? DEFAULT_LINE_CANDIDATE_RADIUS_METERS;
  const radiusWorld = metersToWorldUnits(radiusMeters, primary.closestPointWorld);
  const lineCandidates = pathIndex.query({
    minX: primary.closestPointWorld.x - radiusWorld,
    minY: primary.closestPointWorld.y - radiusWorld,
    maxX: primary.closestPointWorld.x + radiusWorld,
    maxY: primary.closestPointWorld.y + radiusWorld,
  });
  const stationsById = new Map(stations.map((station) => [station.id, station]));
  const linesById = new Map(lines.map((line) => [line.id, line]));
  const bestByLineId = new Map<string, LineHitCandidate>();

  for (const pathIndexValue of lineCandidates) {
    const path = paths[pathIndexValue];
    if (!path) continue;
    const line = linesById.get(path.lineId);
    if (!line || !isModeVisible(line, options.modeMask)) continue;
    const closest = closestPointToPathWorld(
      primary.closestPointWorld,
      path,
      stationsById,
      line.mode,
    );
    if (!closest) continue;
    const distanceMeters = worldUnitsToMeters(
      Math.hypot(
        closest.pointWorld.x - primary.closestPointWorld.x,
        closest.pointWorld.y - primary.closestPointWorld.y,
      ),
      primary.closestPointWorld,
    );
    if (distanceMeters > radiusMeters + 1e-6) continue;
    const distanceCssPx = distanceBetweenScreenPoints(
      point,
      worldToScreen(closest.pointWorld, camera),
    );
    const candidate: LineHitCandidate = {
      type: "line",
      id: line.id,
      pathId: path.id,
      vertexSegmentIndex: closest.vertexSegmentIndex,
      distanceCssPx,
      distanceMeters,
    };
    const previous = bestByLineId.get(line.id);
    if (!previous || isCloserLineCandidate(candidate, previous)) {
      bestByLineId.set(line.id, candidate);
    }
  }

  // A canonical station anchor can sit just outside a path's indexed bounds.
  // The primary path was already accepted by the screen-space hit test, so it
  // must remain available even if that endpoint adjustment clipped the index
  // query around the geographic anchor.
  if (!bestByLineId.has(primary.line.id)) {
    bestByLineId.set(primary.line.id, {
      type: "line",
      id: primary.line.id,
      pathId: primary.path.id,
      vertexSegmentIndex: primary.vertexSegmentIndex,
      distanceCssPx: primary.distanceCssPx,
      distanceMeters: 0,
    });
  }

  return [...bestByLineId.values()].sort(compareLineCandidates);
}

interface NearestLine {
  line: GlobalMapLine;
  path: GlobalMapPath;
  closestPointWorld: WorldPoint;
  vertexSegmentIndex: number;
  distanceCssPx: number;
}

function findNearestStation(
  point: ScreenPoint,
  camera: CameraState,
  stations: GlobalMapStation[],
  stationIndex: PackedSpatialIndex,
  stationTolerance: number,
): HitTestResult & { type: "station" } | undefined {
  const worldPoint = screenToWorld(point, camera);
  const stationWorldRadius = cssPixelsToWorldUnits(stationTolerance, camera);
  const stationCandidates = stationIndex.query({
    minX: worldPoint.x - stationWorldRadius,
    minY: worldPoint.y - stationWorldRadius,
    maxX: worldPoint.x + stationWorldRadius,
    maxY: worldPoint.y + stationWorldRadius,
  });
  let bestStation: (HitTestResult & { type: "station" }) | undefined;
  for (const stationIndexValue of stationCandidates) {
    const station = stations.find((candidate) => candidate.index === stationIndexValue);
    if (!station) continue;
    const distanceCssPx = distanceBetweenScreenPoints(
      point,
      worldToScreen({ x: station.worldX, y: station.worldY }, camera),
    );
    if (
      distanceCssPx <= stationTolerance &&
      (!bestStation || distanceCssPx < bestStation.distanceCssPx)
    ) {
      bestStation = { type: "station", id: station.id, distanceCssPx };
    }
  }
  return bestStation;
}

function findNearestLine(
  point: ScreenPoint,
  camera: CameraState,
  stations: GlobalMapStation[],
  lines: GlobalMapLine[],
  paths: GlobalMapPath[],
  pathIndex: PackedSpatialIndex,
  lineTolerance: number,
  modeMask: number | undefined,
): NearestLine | undefined {
  const worldPoint = screenToWorld(point, camera);
  const lineWorldRadius = cssPixelsToWorldUnits(lineTolerance, camera);
  const lineCandidates = pathIndex.query({
    minX: worldPoint.x - lineWorldRadius,
    minY: worldPoint.y - lineWorldRadius,
    maxX: worldPoint.x + lineWorldRadius,
    maxY: worldPoint.y + lineWorldRadius,
  });
  const stationsById = new Map(stations.map((station) => [station.id, station]));
  const linesById = new Map(lines.map((line) => [line.id, line]));
  let bestLine: NearestLine | undefined;

  for (const pathIndexValue of lineCandidates) {
    const path = paths[pathIndexValue];
    if (!path) continue;
    const line = linesById.get(path.lineId);
    if (!line || !isModeVisible(line, modeMask)) continue;
    const closest = closestPointToPathWorld(worldPoint, path, stationsById, line.mode);
    if (!closest) continue;
    const distanceCssPx = distanceBetweenScreenPoints(
      point,
      worldToScreen(closest.pointWorld, camera),
    );
    if (
      distanceCssPx <= lineTolerance &&
      (!bestLine || distanceCssPx < bestLine.distanceCssPx)
    ) {
      bestLine = {
        line,
        path,
        closestPointWorld: closest.pointWorld,
        vertexSegmentIndex: closest.vertexSegmentIndex,
        distanceCssPx,
      };
    }
  }
  return bestLine;
}

interface ClosestPathPoint {
  pointWorld: WorldPoint;
  distanceWorld: number;
  vertexSegmentIndex: number;
}

function closestPointToPathWorld(
  point: WorldPoint,
  path: GlobalMapPath,
  stationsById: ReadonlyMap<string, GlobalMapStation>,
  mode: GlobalMapLine["mode"],
): ClosestPathPoint | undefined {
  let best: ClosestPathPoint | undefined;
  for (const { start, end } of getGlobalMapPathSubpathRanges(path)) {
    for (let index = start + 1; index < end; index += 1) {
      const previousVertex = path.vertices[index - 1]!;
      const currentVertex = path.vertices[index]!;
      const previous = resolveGlobalMapVertex(
        path,
        previousVertex,
        previousVertex.stationId ? stationsById.get(previousVertex.stationId) : undefined,
        mode,
      );
      const current = resolveGlobalMapVertex(
        path,
        currentVertex,
        currentVertex.stationId ? stationsById.get(currentVertex.stationId) : undefined,
        mode,
      );
      const pointWorld = closestPointOnSegment(point, previous, current);
      const distanceWorld = Math.hypot(pointWorld.x - point.x, pointWorld.y - point.y);
      if (!best || distanceWorld < best.distanceWorld) {
        best = { pointWorld, distanceWorld, vertexSegmentIndex: index - 1 };
      }
    }
  }
  return best;
}

function closestPointOnSegment(
  point: WorldPoint,
  start: WorldPoint,
  end: WorldPoint,
): WorldPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared === 0
    ? 0
    : Math.max(
      0,
      Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
    );
  return { x: start.x + dx * ratio, y: start.y + dy * ratio };
}

function distanceBetweenScreenPoints(left: ScreenPoint, right: ScreenPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function isCloserLineCandidate(left: LineHitCandidate, right: LineHitCandidate): boolean {
  return left.distanceMeters < right.distanceMeters ||
    (left.distanceMeters === right.distanceMeters && left.distanceCssPx < right.distanceCssPx) ||
    (left.distanceMeters === right.distanceMeters &&
      left.distanceCssPx === right.distanceCssPx &&
      left.pathId.localeCompare(right.pathId) < 0);
}

function compareLineCandidates(left: LineHitCandidate, right: LineHitCandidate): number {
  if (left.distanceMeters !== right.distanceMeters) return left.distanceMeters - right.distanceMeters;
  if (left.distanceCssPx !== right.distanceCssPx) return left.distanceCssPx - right.distanceCssPx;
  return left.id.localeCompare(right.id, "fr-FR", { numeric: true });
}

function isModeVisible(line: GlobalMapLine, mask: number | undefined): boolean {
  if (mask === undefined) return true;
  const index = GLOBAL_MAP_MODE_ORDER.indexOf(line.mode);
  return index >= 0 && (mask & (1 << index)) !== 0;
}
