import {
  getGlobalMapPathSubpathRanges,
  resolveGlobalMapVertex,
  type GlobalMapLine,
  type GlobalMapPath,
  type GlobalMapStation,
} from "../contracts/manifest";

const WORLD_CIRCUMFERENCE_METERS = 40_075_016.68557849;
const MIN_V_ANGLE_DEGREES = 90;
const MIN_V_LEG_METERS = 40;
const COORDINATE_EPSILON_WORLD = 1e-10;

export interface GlobalMapStationAngle {
  stationId: string;
  stationName: string;
  angleDegrees?: number;
  incomingMeters?: number;
  outgoingMeters?: number;
  pathIds: string[];
  inconsistent: boolean;
}

interface WorldPoint {
  x: number;
  y: number;
}

/**
 * Produces one diagnostic row for every station in a line.  A sharply folded
 * provider trace is suspicious only when both adjacent legs are substantial:
 * short vertices in a real curve must not be reported as a V.
 */
export function measureLineStationAngles(
  line: GlobalMapLine,
  paths: readonly GlobalMapPath[],
  stationsById: ReadonlyMap<string, GlobalMapStation>,
): GlobalMapStationAngle[] {
  const rows = new Map<string, GlobalMapStationAngle>(
    line.stationIds.map((stationId) => [stationId, {
      stationId,
      stationName: stationsById.get(stationId)?.name ?? stationId,
      pathIds: [],
      inconsistent: false,
    }]),
  );

  for (const path of paths) {
    if (path.lineId !== line.id) continue;
    for (const { start, end } of getGlobalMapPathSubpathRanges(path)) {
      const points = path.vertices.slice(start, end).map((vertex) => ({
        ...resolveGlobalMapVertex(path, vertex, vertex.stationId ? stationsById.get(vertex.stationId) : undefined, line.mode),
        stationId: vertex.stationId,
      }));
      for (let index = 0; index < points.length; index += 1) {
        const current = points[index]!;
        if (!current.stationId) continue;
        const row = rows.get(current.stationId);
        if (!row) continue;
        if (!row.pathIds.includes(path.id)) row.pathIds.push(path.id);

        const previous = closestDistinctPoint(points, index, -1);
        const next = closestDistinctPoint(points, index, 1);
        if (!previous || !next) continue;

        const incomingMeters = worldDistanceMeters(previous, current);
        const outgoingMeters = worldDistanceMeters(current, next);
        const angleDegrees = interiorAngleDegrees(previous, current, next);
        // A line can appear in several chunks. Keep the smallest angle, because
        // it is the one that exposes a folded trace at a station.
        if (row.angleDegrees === undefined || angleDegrees < row.angleDegrees) {
          row.angleDegrees = angleDegrees;
          row.incomingMeters = incomingMeters;
          row.outgoingMeters = outgoingMeters;
        }
      }
    }
  }

  return line.stationIds.map((stationId) => {
    const row = rows.get(stationId)!;
    const shortestLeg = Math.min(row.incomingMeters ?? 0, row.outgoingMeters ?? 0);
    return {
      ...row,
      inconsistent: row.angleDegrees !== undefined &&
        row.angleDegrees < MIN_V_ANGLE_DEGREES &&
        shortestLeg >= MIN_V_LEG_METERS,
    };
  });
}

export function resolveDebugLine(
  lines: readonly GlobalMapLine[],
  query: string | undefined,
): GlobalMapLine | undefined {
  const normalized = query?.trim();
  if (!normalized) return undefined;
  const key = normalized.replace(/^line:/iu, "").toLocaleLowerCase("en-US");
  return lines.find((line) =>
    [line.id, line.id.replace(/^line:/iu, ""), line.code, line.label]
      .some((value) => value.toLocaleLowerCase("en-US") === key),
  );
}

function closestDistinctPoint(
  points: ReadonlyArray<WorldPoint & { stationId?: string }>,
  index: number,
  direction: -1 | 1,
): WorldPoint | undefined {
  const current = points[index]!;
  for (let cursor = index + direction; cursor >= 0 && cursor < points.length; cursor += direction) {
    const candidate = points[cursor]!;
    if (worldDistance(current, candidate) > COORDINATE_EPSILON_WORLD) return candidate;
  }
  return undefined;
}

function interiorAngleDegrees(previous: WorldPoint, current: WorldPoint, next: WorldPoint): number {
  const incoming = { x: previous.x - current.x, y: previous.y - current.y };
  const outgoing = { x: next.x - current.x, y: next.y - current.y };
  const denominator = Math.hypot(incoming.x, incoming.y) * Math.hypot(outgoing.x, outgoing.y);
  if (denominator <= 0) return 180;
  const cosine = Math.max(-1, Math.min(1, (incoming.x * outgoing.x + incoming.y * outgoing.y) / denominator));
  return Math.acos(cosine) * 180 / Math.PI;
}

function worldDistance(left: WorldPoint, right: WorldPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function worldDistanceMeters(left: WorldPoint, right: WorldPoint): number {
  return worldDistance(left, right) * WORLD_CIRCUMFERENCE_METERS;
}
