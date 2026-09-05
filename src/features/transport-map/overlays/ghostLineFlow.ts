import type { CameraState } from "../geo/camera";
import {
  getGlobalMapPathSubpathRanges,
  resolveGlobalMapVertex,
  type GlobalMapLine,
  type GlobalMapMode,
  type GlobalMapPath,
  type GlobalMapStation,
} from "../contracts/manifest";
import { worldToScreen, type ScreenPoint } from "../geo/coordinateKernel";

export interface GhostLineFlowDirection {
  id: string;
  label: string;
  orderedStationIds: string[];
  destinationStationId?: string;
  destinationCity?: string;
}

export interface GhostLineFlowPath {
  key: string;
  directionId?: string;
  d: string;
  animationDelayMs: number;
}

export interface GhostLineFlowChevron {
  key: string;
  directionId: string;
  x: number;
  y: number;
  angleDeg: number;
}

export type GhostLineExitSide = "top" | "right" | "bottom" | "left";

export interface GhostLineExitIndicator {
  key: string;
  directionId: string;
  destination: string;
  destinationCity?: string;
  side: GhostLineExitSide;
  x: number;
  y: number;
  angleDeg: number;
}

export interface GhostLineTerminusIndicator {
  key: string;
  directionId: string;
  x: number;
  y: number;
}

export interface GhostLineFlowModel {
  width: number;
  height: number;
  color: string;
  lineId?: string;
  lineMode?: GlobalMapMode;
  focusedDirectionId?: string;
  strokeWidth: number;
  paths: GhostLineFlowPath[];
  wavePaths: GhostLineFlowPath[];
  chevrons: GhostLineFlowChevron[];
  exits: GhostLineExitIndicator[];
  termini: GhostLineTerminusIndicator[];
}

export interface GhostLineFlowInput {
  camera: CameraState;
  line: GlobalMapLine;
  paths: readonly GlobalMapPath[];
  stationsById: ReadonlyMap<string, GlobalMapStation>;
  directions: readonly GhostLineFlowDirection[];
  focusedDirectionId?: string;
  /** When set with a focused direction, hide geometry before this boarding station. */
  focusedFromStationId?: string;
}

interface ProjectedFragment {
  key: string;
  directionId?: string;
  points: ScreenPoint[];
  order: number;
}

interface DirectionCandidate {
  direction: GhostLineFlowDirection;
  reverse: boolean;
  score: number;
}

interface ExitCandidate {
  side: GhostLineExitSide;
  point: ScreenPoint;
  angleDeg: number;
  progress: number;
}

/**
 * Creates the presentation-only overlay model for a line.  It consumes the
 * exact vertices already supplied by the transport-map data source; it never
 * simplifies them or creates a station-to-station chord.
 */
export function createGhostLineFlowModel(
  input: GhostLineFlowInput,
): GhostLineFlowModel {
  const width = Math.max(1, input.camera.viewportWidthCssPx);
  const height = Math.max(1, input.camera.viewportHeightCssPx);
  const directions = input.directions.filter((direction) => direction.orderedStationIds.length > 1);
  const fragments: ProjectedFragment[] = [];
  const directionalFragments: ProjectedFragment[] = [];

  input.paths
    .filter((path) => path.lineId === input.line.id)
    .forEach((path, pathIndex) => {
      getGlobalMapPathSubpathRanges(path).forEach((range, rangeIndex) => {
        const sourceVertices = path.vertices.slice(range.start, range.end);
        if (sourceVertices.length < 2) return;

        const projected = sourceVertices.map((vertex) => {
          const resolved = resolveGlobalMapVertex(
            path,
            vertex,
            vertex.stationId ? input.stationsById.get(vertex.stationId) : undefined,
            input.line.mode,
          );
          return worldToScreen(resolved, input.camera);
        });

        const candidates = chooseDirectionCandidates(
          path,
          sourceVertices,
          directions,
        );
        const clipToFocusedBoardingStation = Boolean(
          input.focusedDirectionId && input.focusedFromStationId,
        );
        const renderCandidates = clipToFocusedBoardingStation
          ? candidates.filter((candidate) => candidate.direction.id === input.focusedDirectionId)
          : candidates;

        if (!clipToFocusedBoardingStation) {
          fragments.push({
            key: `${path.id}:${range.start}:${rangeIndex}`,
            points: projected,
            order: pathIndex * 10_000 + rangeIndex,
          });
        }

        renderCandidates.forEach((candidate, candidateIndex) => {
          const orientedPoints = candidate.reverse ? [...projected].reverse() : projected;
          const points = clipToFocusedBoardingStation
            ? clipDirectionalFragment(
              orientedPoints,
              sourceVertices,
              candidate.reverse,
              candidate.direction,
              input.focusedFromStationId!,
            )
            : orientedPoints;
          if (points.length < 2) return;

          if (clipToFocusedBoardingStation) {
            fragments.push({
              key: `${path.id}:${range.start}:${rangeIndex}:focused:${candidate.direction.id}`,
              points,
              order: pathIndex * 10_000 + rangeIndex + candidateIndex / 100,
            });
          }

          directionalFragments.push({
            key: `${path.id}:${range.start}:${rangeIndex}:direction:${candidate.direction.id}`,
            directionId: candidate.direction.id,
            points,
            order: pathIndex * 10_000 + rangeIndex + candidateIndex / 100,
          });
        });
      });
    });

  const paths = fragments.map((fragment) => ({
    key: fragment.key,
    d: createPathData(fragment.points),
    animationDelayMs: -(fragment.order * 37) % 1600,
  }));
  const focusedDirectionalFragments = input.focusedDirectionId
    ? directionalFragments.filter((fragment) => fragment.directionId === input.focusedDirectionId)
    : directionalFragments;
  const wavePaths = focusedDirectionalFragments.map((fragment) => ({
    key: fragment.key,
    directionId: fragment.directionId,
    d: createPathData(fragment.points),
    animationDelayMs: -(fragment.order * 37) % 1600,
  }));
  const chevrons = focusedDirectionalFragments.flatMap((fragment) => {
    if (!fragment.directionId) return [];
    return createChevrons(fragment.points, fragment.key, fragment.directionId);
  });
  const exits = createExitIndicators(
    focusedDirectionalFragments,
    directions,
    input.stationsById,
    input.camera,
    width,
    height,
  );
  const termini = createTerminusIndicators(
    focusedDirectionalFragments,
    directions,
    input.stationsById,
    input.camera,
    width,
    height,
  );

  return {
    width,
    height,
    color: input.line.color,
    lineId: input.line.id,
    lineMode: input.line.mode,
    ...(input.focusedDirectionId ? { focusedDirectionId: input.focusedDirectionId } : {}),
    strokeWidth: input.line.mode === "BUS" || input.line.mode === "NOCTILIEN" ? 3.5 : 4,
    paths,
    wavePaths,
    chevrons,
    exits,
    termini,
  };
}

function clipDirectionalFragment(
  points: readonly ScreenPoint[],
  sourceVertices: readonly GlobalMapPath["vertices"][number][],
  reverse: boolean,
  direction: GhostLineFlowDirection,
  focusedFromStationId: string,
): ScreenPoint[] {
  const sourceIndex = sourceVertices.findIndex((vertex) => vertex.stationId === focusedFromStationId);
  if (sourceIndex >= 0) {
    const orientedIndex = reverse ? sourceVertices.length - 1 - sourceIndex : sourceIndex;
    return points.slice(orientedIndex);
  }

  // A clipped map chunk can omit the boarding anchor. Keep it only when one
  // of its anchored stations is downstream in the selected direction; chunks
  // entirely before the boarding station are deliberately hidden.
  const boardingIndex = direction.orderedStationIds.indexOf(focusedFromStationId);
  if (boardingIndex < 0) return [];
  const hasDownstreamAnchor = sourceVertices.some((vertex) => {
    if (!vertex.stationId) return false;
    return direction.orderedStationIds.indexOf(vertex.stationId) >= boardingIndex;
  });
  return hasDownstreamAnchor ? [...points] : [];
}

function chooseDirectionCandidates(
  path: GlobalMapPath,
  _vertices: readonly GlobalMapPath["vertices"][number][],
  directions: readonly GhostLineFlowDirection[],
): DirectionCandidate[] {
  if (directions.length === 0) return [];

  const hintedDirection = directions.find((direction) =>
    path.id.endsWith(`:direction:${direction.id}`),
  );
  if (hintedDirection) {
    return [{
      direction: hintedDirection,
      reverse: orientationScore(path, _vertices, hintedDirection) < 0,
      score: orientationScore(path, _vertices, hintedDirection),
    }];
  }

  const candidates = directions.map((direction) => {
    const score = orientationScore(path, _vertices, direction);
    return {
      direction,
      reverse: score < 0,
      score,
    };
  });

  if (directions.length === 1) return candidates;

  // A global-map path is usually a physical, bidirectional trace. Keep one
  // oriented copy for every matching direction so a shared tram/rail path can
  // expose both exits. Direction-specific bus paths carry an explicit hint in
  // their id and are handled above, so they are not duplicated here.
  const matched = candidates.filter((candidate) => candidate.score !== 0);
  if (matched.length > 0) return matched;

  // Clipped chunks can contain only one anchored station, which makes the
  // edge score inconclusive. Keep both directions on that fragment; the
  // neighbouring full-detail chunks provide the reliable orientation.
  return candidates.map((candidate, index) => ({
    ...candidate,
    reverse: index % 2 === 1,
  }));
}

function orientationScore(
  path: GlobalMapPath,
  vertices: readonly GlobalMapPath["vertices"][number][],
  direction: GhostLineFlowDirection,
): number {
  const anchoredIds = vertices
    .map((vertex) => vertex.stationId)
    .filter((stationId): stationId is string => Boolean(stationId));
  const ids = anchoredIds.length >= 2 ? anchoredIds : path.stationIds;
  if (ids.length < 2) return 0;

  const edges = new Set<string>();
  for (let index = 1; index < direction.orderedStationIds.length; index += 1) {
    const from = direction.orderedStationIds[index - 1];
    const to = direction.orderedStationIds[index];
    if (from && to && from !== to) edges.add(edgeKey(from, to));
  }

  let score = 0;
  for (let index = 1; index < ids.length; index += 1) {
    const from = ids[index - 1]!;
    const to = ids[index]!;
    if (edges.has(edgeKey(from, to))) score += 3;
    else if (edges.has(edgeKey(to, from))) score -= 3;
  }
  if (score !== 0) return score;

  const first = direction.orderedStationIds.indexOf(ids[0]!);
  const last = direction.orderedStationIds.lastIndexOf(ids.at(-1)!);
  if (first >= 0 && last >= 0 && first !== last) return last > first ? 1 : -1;
  return 0;
}

function createPathData(points: readonly ScreenPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${format(point.x)} ${format(point.y)}`)
    .join(" ");
}

function createChevrons(
  points: readonly ScreenPoint[],
  fragmentKey: string,
  directionId: string,
): GhostLineFlowChevron[] {
  const lengths = points.slice(1).map((point, index) => distance(points[index]!, point));
  const totalLength = lengths.reduce((sum, value) => sum + value, 0);
  if (totalLength < 8) return [];

  const interval = Math.max(95, Math.min(160, totalLength / 3));
  const first = totalLength < interval * 1.4 ? totalLength / 2 : interval / 2;
  const result: GhostLineFlowChevron[] = [];
  for (let distanceAlong = first; distanceAlong < totalLength; distanceAlong += interval) {
    const sample = samplePolyline(points, lengths, distanceAlong);
    if (!sample) continue;
    result.push({
      key: `${fragmentKey}:chevron:${result.length}`,
      directionId,
      x: sample.point.x,
      y: sample.point.y,
      angleDeg: (Math.atan2(sample.tangent.y, sample.tangent.x) * 180) / Math.PI,
    });
  }
  return result;
}

function createExitIndicators(
  fragments: readonly ProjectedFragment[],
  directions: readonly GhostLineFlowDirection[],
  stationsById: ReadonlyMap<string, GlobalMapStation>,
  camera: CameraState,
  width: number,
  height: number,
): GhostLineExitIndicator[] {
  const result: GhostLineExitIndicator[] = [];

  for (const direction of directions) {
    if (!direction.label) continue;
    const destination = direction.destinationStationId
      ? stationsById.get(direction.destinationStationId)
      : undefined;
    const destinationScreen = destination
      ? worldToScreen({ x: destination.worldX, y: destination.worldY }, camera)
      : undefined;
    if (destinationScreen && isInsideViewport(destinationScreen, width, height)) continue;

    const candidates = fragments
      .filter((fragment) => fragment.directionId === direction.id)
      .flatMap((fragment) => collectExitCandidates(fragment.points, width, height, fragment.order));
    const selected = [...candidates].sort((left, right) => {
      if (destinationScreen) {
        return distance(left.point, destinationScreen) - distance(right.point, destinationScreen);
      }
      return right.progress - left.progress;
    })[0];
    if (!selected) continue;

    result.push({
      key: `exit:${direction.id}`,
      directionId: direction.id,
      destination: direction.label,
      ...(direction.destinationCity ? { destinationCity: direction.destinationCity } : {}),
      side: selected.side,
      x: selected.point.x,
      y: selected.point.y,
      angleDeg: selected.angleDeg,
    });
  }

  return result;
}

function createTerminusIndicators(
  fragments: readonly ProjectedFragment[],
  directions: readonly GhostLineFlowDirection[],
  stationsById: ReadonlyMap<string, GlobalMapStation>,
  camera: CameraState,
  width: number,
  height: number,
): GhostLineTerminusIndicator[] {
  const result: GhostLineTerminusIndicator[] = [];

  for (const direction of directions) {
    const destination = direction.destinationStationId
      ? stationsById.get(direction.destinationStationId)
      : undefined;
    if (!destination) continue;

    const destinationScreen = worldToScreen(
      { x: destination.worldX, y: destination.worldY },
      camera,
    );
    if (!isInsideViewport(destinationScreen, width, height)) continue;
    if (!fragments.some((fragment) => fragment.directionId === direction.id)) continue;

    result.push({
      key: `terminus:${direction.id}`,
      directionId: direction.id,
      x: destinationScreen.x,
      y: destinationScreen.y,
    });
  }

  return result;
}

function collectExitCandidates(
  points: readonly ScreenPoint[],
  width: number,
  height: number,
  fragmentOrder: number,
): ExitCandidate[] {
  const result: ExitCandidate[] = [];
  points.slice(1).forEach((point, index) => {
    const from = points[index]!;
    for (const intersection of segmentRectIntersections(from, point, width, height)) {
      result.push({
        ...intersection,
        progress: fragmentOrder + index + intersection.t,
      });
    }
  });
  return result;
}

function segmentRectIntersections(
  from: ScreenPoint,
  to: ScreenPoint,
  width: number,
  height: number,
): Array<{ side: GhostLineExitSide; point: ScreenPoint; angleDeg: number; t: number }> {
  const edges: Array<{ side: GhostLineExitSide; start: ScreenPoint; end: ScreenPoint }> = [
    { side: "top", start: { x: 0, y: 0 }, end: { x: width, y: 0 } },
    { side: "right", start: { x: width, y: 0 }, end: { x: width, y: height } },
    { side: "bottom", start: { x: width, y: height }, end: { x: 0, y: height } },
    { side: "left", start: { x: 0, y: height }, end: { x: 0, y: 0 } },
  ];
  const result: Array<{ side: GhostLineExitSide; point: ScreenPoint; angleDeg: number; t: number }> = [];
  const seen = new Set<string>();

  edges.forEach((edge) => {
    const intersection = intersectSegments(from, to, edge.start, edge.end);
    if (!intersection) return;
    const key = `${Math.round(intersection.point.x * 10)}:${Math.round(intersection.point.y * 10)}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({
      side: edge.side,
      point: intersection.point,
      angleDeg: (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI,
      t: intersection.t,
    });
  });

  return result;
}

function intersectSegments(
  firstStart: ScreenPoint,
  firstEnd: ScreenPoint,
  secondStart: ScreenPoint,
  secondEnd: ScreenPoint,
): { point: ScreenPoint; t: number } | undefined {
  const firstVector = { x: firstEnd.x - firstStart.x, y: firstEnd.y - firstStart.y };
  const secondVector = { x: secondEnd.x - secondStart.x, y: secondEnd.y - secondStart.y };
  const denominator = cross(firstVector, secondVector);
  if (Math.abs(denominator) < 1e-9) return undefined;

  const offset = { x: secondStart.x - firstStart.x, y: secondStart.y - firstStart.y };
  const firstT = cross(offset, secondVector) / denominator;
  const secondT = cross(offset, firstVector) / denominator;
  if (firstT < -1e-9 || firstT > 1 + 1e-9 || secondT < -1e-9 || secondT > 1 + 1e-9) {
    return undefined;
  }

  return {
    point: {
      x: firstStart.x + firstVector.x * firstT,
      y: firstStart.y + firstVector.y * firstT,
    },
    t: Math.max(0, Math.min(1, firstT)),
  };
}

function samplePolyline(
  points: readonly ScreenPoint[],
  lengths: readonly number[],
  distanceAlong: number,
): { point: ScreenPoint; tangent: ScreenPoint } | undefined {
  let remaining = distanceAlong;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]!;
    if (remaining > length && index < lengths.length - 1) {
      remaining -= length;
      continue;
    }
    const start = points[index]!;
    const end = points[index + 1]!;
    const ratio = length > 0 ? remaining / length : 0;
    return {
      point: {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      },
      tangent: { x: end.x - start.x, y: end.y - start.y },
    };
  }
  return undefined;
}

function edgeKey(from: string, to: string): string {
  return `${from}::${to}`;
}

function cross(first: ScreenPoint, second: ScreenPoint): number {
  return first.x * second.y - first.y * second.x;
}

function distance(first: ScreenPoint, second: ScreenPoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function isInsideViewport(point: ScreenPoint, width: number, height: number): boolean {
  return point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;
}

function format(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0";
}
