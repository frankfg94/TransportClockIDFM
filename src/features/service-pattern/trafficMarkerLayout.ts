import type {
  PatternTrafficEdge,
  PatternTrafficImpactKind,
  PatternTrafficImpactSegment,
} from "./trafficImpactAnalysis";
import { getPatternTrafficEdgeKey } from "./trafficImpactAnalysis";

export interface PatternTrafficMarkerGroup {
  id: string;
  representative: PatternTrafficImpactSegment;
  segments: PatternTrafficImpactSegment[];
  stationKeys: string[];
  edgeKeys: string[];
}

export interface TrafficMarkerPoint {
  x: number;
  y: number;
}

export interface TrafficMarkerRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TrafficMarkerPlacementSide = "above" | "below";

export interface TrafficMarkerLayoutRequest {
  key: string;
  anchor: TrafficMarkerPoint;
  width: number;
  height: number;
  preferAbove: boolean;
}

/**
 * Keep traffic info cards above a single-row line and above every row except
 * the lowest one on a branched line. The decision uses rendered rail rows
 * only, so it remains valid when the topology changes.
 */
export function shouldPreferTrafficMarkerAbove(
  anchor: Pick<TrafficMarkerPoint, "y">,
  railPositions: Iterable<TrafficMarkerPoint>,
): boolean {
  const rows = [...railPositions]
    .map(({ y }) => y)
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
    .filter((y, index, values) => index === 0 || y - values[index - 1]! > 2);

  return rows.length <= 1 || rows.some((rowY) => rowY > anchor.y + 2);
}

export interface TrafficMarkerLayoutResult {
  position: TrafficMarkerPoint;
  placement: TrafficMarkerPlacementSide;
  connectorHeight: number;
  connectorOffset: number;
  connectorLength: number;
  connectorAngle: number;
  rect: TrafficMarkerRect;
}

const MARKER_GAP = 18;
const MARKER_CLEARANCE = 12;
type IndexedGroup = { index: number; group: PatternTrafficMarkerGroup };

export function groupPatternTrafficMarkerSegments({
  segments,
  edges,
  unifyReplacementBusMarkers,
  availableStationKeys,
}: {
  segments: PatternTrafficImpactSegment[];
  edges: PatternTrafficEdge[];
  unifyReplacementBusMarkers: boolean;
  availableStationKeys?: Iterable<string>;
}): PatternTrafficMarkerGroup[] {
  if (!unifyReplacementBusMarkers) {
    return segments.map((segment) => createMarkerGroup([segment], segment.id));
  }

  const edgeByKey = new Map(edges.map((edge) => [getPatternTrafficEdgeKey(edge), edge]));
  const availableStationKeySet = availableStationKeys
    ? new Set(availableStationKeys)
    : undefined;
  const buckets = new Map<string, Array<{ segment: PatternTrafficImpactSegment; index: number }>>();

  segments.forEach((segment, index) => {
    const key = [
      segment.disruption.id,
      segment.kind,
      normalizeTrafficMarkerMessage(segment.disruption.message),
      createTrafficMarkerDisplayDateKey(segment),
    ].join("\u001e");
    buckets.set(key, [...(buckets.get(key) ?? []), { segment, index }]);
  });

  const grouped: IndexedGroup[] = [];
  for (const entries of buckets.values()) {
    for (const component of splitIntoConnectedComponents(entries, edgeByKey)) {
      component.sort((left, right) => left.index - right.index);
      const first = component[0];
      if (!first) continue;
      grouped.push({
        index: first.index,
        group: createMarkerGroup(
          component.map(({ segment }) => segment),
          `group:${first.segment.id}`,
        ),
      });
    }
  }

  // Calendar entries can have different source ids/messages while rendering
  // the same info card. The visible text, end date and exact focus station set
  // are the safe merge key.
  const fallbackGroups = new Map<string, IndexedGroup[]>();
  grouped.forEach((candidate) => {
    const textKey = getTrafficMarkerDisplayTextKey(
      candidate.group.representative,
    );
    const endDateKey = normalizeTrafficMarkerMessage(
      candidate.group.representative.endDateLabel,
    );
    const pulseStationKey = getTrafficMarkerPulseStationKey(
      candidate.group.segments,
      availableStationKeySet,
    );
    if (!textKey || !endDateKey || !pulseStationKey) return;

    const key = [
      textKey,
      endDateKey,
      pulseStationKey,
    ].join("\u001e");
    fallbackGroups.set(key, [
      ...(fallbackGroups.get(key) ?? []),
      candidate,
    ]);
  });

  const mergedGrouped: IndexedGroup[] = [];
  const mergedCandidates = new Set<IndexedGroup>();
  for (const candidates of fallbackGroups.values()) {
    if (candidates.length < 2) continue;
    const first = candidates[0];
    if (!first) continue;
    const segments = candidates
      .slice()
      .sort((left, right) => left.index - right.index)
      .flatMap(({ group }) => group.segments);
    mergedGrouped.push({
      index: Math.min(...candidates.map(({ index }) => index)),
      group: createMarkerGroup(segments, `group:${first.group.representative.id}`),
    });
    candidates.forEach((candidate) => mergedCandidates.add(candidate));
  }

  const finalGrouped = [
    ...grouped.filter((candidate) => !mergedCandidates.has(candidate)),
    ...mergedGrouped,
  ];

  return finalGrouped
    .sort((left, right) => left.index - right.index)
    .map(({ group }) => group);
}

export function createTrafficMarkerDisplayDateKey(
  segment: PatternTrafficImpactSegment,
): string {
  return [segment.restartTimeLabel ?? "", segment.endDateLabel ?? ""].join(
    "\u001f",
  );
}

export function getTrafficMarkerDisplayTextKey(
  segment: Pick<
    PatternTrafficImpactSegment,
    "kind" | "replacementBus" | "restartTimeLabel"
  >,
): string {
  return [
    segment.kind,
    segment.replacementBus,
    normalizeTrafficMarkerMessage(segment.restartTimeLabel),
  ].join("\u001f");
}

export function normalizeTrafficMarkerMessage(message?: string): string {
  return (message ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

/** The exact station set used by the marker focus action. */
export function getTrafficMarkerPulseStationKeys(
  segments: Array<Pick<PatternTrafficImpactSegment, "stationKeys" | "edgeKeys">>,
): string[] {
  const stationKeys = new Set<string>();
  segments.forEach((segment) => {
    segment.stationKeys.forEach((stationKey) => stationKeys.add(stationKey));
    segment.edgeKeys.forEach((edgeKey) => {
      const [source, target] = edgeKey.split("--");
      if (source) stationKeys.add(source);
      if (target) stationKeys.add(target);
    });
  });
  return [...stationKeys].sort();
}

/**
 * The focus station set is also the presentation identity used to merge
 * duplicate alerts that were split into separate source disruptions.
 */
function getTrafficMarkerPulseStationKey(
  segments: Array<Pick<PatternTrafficImpactSegment, "stationKeys" | "edgeKeys">>,
  availableStationKeys?: ReadonlySet<string>,
): string {
  return getTrafficMarkerPulseStationKeys(segments)
    .filter(
      (stationKey) =>
        !availableStationKeys || availableStationKeys.has(stationKey),
    )
    .join("\u001f");
}

export function getTrafficMarkerSize(
  kind: PatternTrafficImpactKind,
  compact: boolean,
  replacementBus = false,
): { width: number; height: number } {
  if (kind === "interruption" || replacementBus) {
    return compact
      ? { width: 340, height: 124 }
      : { width: 420, height: 152 };
  }
  return compact
    ? { width: 120, height: 68 }
    : { width: 156, height: 72 };
}

export function createTrafficMarkerStationObstacles({
  position,
  width,
  height,
  compact,
}: {
  position: TrafficMarkerPoint;
  width: number;
  height: number;
  compact: boolean;
}): TrafficMarkerRect[] {
  const station = { x: position.x, y: position.y, width, height };
  return compact
    ? [station, { x: position.x - 48, y: position.y - 145, width: width + 240, height: 180 }]
    : [station];
}

/** Anchor on the midpoint of the horizontal rail run with the most impacted stations. */
export function getTrafficMarkerAnchor(
  segment: Pick<PatternTrafficImpactSegment, "edgeKeys" | "stationKeys">,
  edges: PatternTrafficEdge[],
  positions: Map<string, TrafficMarkerPoint>,
): TrafficMarkerPoint | undefined {
  const edgeByKey = new Map(edges.map((edge) => [getPatternTrafficEdgeKey(edge), edge]));
  const impactedEdges = segment.edgeKeys
    .map((key) => edgeByKey.get(key))
    .filter((edge): edge is PatternTrafficEdge => Boolean(edge));
  const dominant = findDominantRailRun(segment, impactedEdges, positions);

  if (dominant) {
    return { x: (dominant.minX + dominant.maxX) / 2, y: dominant.y };
  }

  const points = impactedEdges.flatMap(({ source, target }) => {
    const left = positions.get(source);
    const right = positions.get(target);
    return left && right ? [{ left, right }] : [];
  });
  const longest = points.sort((a, b) => distance(b.left, b.right) - distance(a.left, a.right))[0];
  if (longest) return midpoint(longest.left, longest.right);

  return segment.stationKeys.map((key) => positions.get(key)).find(Boolean);
}

export function layoutTrafficMarkers(
  requests: TrafficMarkerLayoutRequest[],
  obstacles: TrafficMarkerRect[],
): Map<string, TrafficMarkerLayoutResult> {
  const occupied = [...obstacles];
  const placements = new Map<string, TrafficMarkerLayoutResult>();

  for (const request of requests) {
    const sides: TrafficMarkerPlacementSide[] = request.preferAbove
      ? ["above", "below"]
      : ["below", "above"];
    let placement: TrafficMarkerLayoutResult | undefined;

    for (const side of sides) {
      for (let lane = 0; !placement; lane += 1) {
        const y = side === "above"
          ? request.anchor.y - MARKER_GAP - request.height - lane * (request.height + MARKER_GAP)
          : request.anchor.y + MARKER_GAP + lane * (request.height + MARKER_GAP);

        // Keep the card centered on its rail anchor. Only the vertical lane
        // changes, so the connector can never become diagonal or detached.
        const rect = {
          x: request.anchor.x - request.width / 2,
          y,
          width: request.width,
          height: request.height,
        };
        if (occupied.some((obstacle) => rectanglesOverlap(rect, obstacle, MARKER_CLEARANCE))) {
          continue;
        }

        const startY = side === "above" ? rect.y + rect.height : rect.y;
        const dy = request.anchor.y - startY;
        placement = {
          position: { x: rect.x, y: rect.y },
          placement: side,
          connectorHeight: Math.abs(dy),
          connectorOffset: 0,
          connectorLength: Math.abs(dy),
          connectorAngle: dy < 0 ? -90 : 90,
          rect,
        };
        break;
      }
      if (placement) break;
    }

    if (!placement) throw new Error("Traffic marker placement search did not converge");
    placements.set(request.key, placement);
    occupied.push(placement.rect);
  }

  return placements;
}

export function rectanglesOverlap(
  left: TrafficMarkerRect,
  right: TrafficMarkerRect,
  clearance = 0,
): boolean {
  return (
    left.x < right.x + right.width + clearance &&
    left.x + left.width + clearance > right.x &&
    left.y < right.y + right.height + clearance &&
    left.y + left.height + clearance > right.y
  );
}

function findDominantRailRun(
  segment: Pick<PatternTrafficImpactSegment, "stationKeys">,
  edges: PatternTrafficEdge[],
  positions: Map<string, TrafficMarkerPoint>,
): { y: number; minX: number; maxX: number; stationCount: number; length: number } | undefined {
  const impactedStations = new Set(segment.stationKeys);
  const runs = new Map<number, { y: number; minX: number; maxX: number; stations: Set<string>; length: number }>();

  for (const edge of edges) {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target || Math.abs(source.y - target.y) > 2) continue;

    const y = (source.y + target.y) / 2;
    const key = Math.round(y);
    const run = runs.get(key) ?? {
      y,
      minX: Math.min(source.x, target.x),
      maxX: Math.max(source.x, target.x),
      stations: new Set<string>(),
      length: 0,
    };
    run.y = (run.y + y) / 2;
    run.minX = Math.min(run.minX, source.x, target.x);
    run.maxX = Math.max(run.maxX, source.x, target.x);
    run.stations.add(edge.source);
    run.stations.add(edge.target);
    run.length += Math.abs(target.x - source.x);
    runs.set(key, run);
  }

  return [...runs.values()]
    .map((run) => ({
      ...run,
      stationCount: [...run.stations].filter((key) => impactedStations.has(key)).length,
    }))
    .sort(
      (left, right) =>
        right.stationCount - left.stationCount ||
        right.length - left.length ||
        right.maxX - right.minX - (left.maxX - left.minX),
    )[0];
}

function createMarkerGroup(
  segments: PatternTrafficImpactSegment[],
  id: string,
): PatternTrafficMarkerGroup {
  return {
    id,
    representative: segments[0]!,
    segments,
    stationKeys: [...new Set(segments.flatMap((segment) => segment.stationKeys))],
    edgeKeys: [...new Set(segments.flatMap((segment) => segment.edgeKeys))],
  };
}

function splitIntoConnectedComponents(
  entries: Array<{ segment: PatternTrafficImpactSegment; index: number }>,
  edgeByKey: Map<string, PatternTrafficEdge>,
): Array<Array<{ segment: PatternTrafficImpactSegment; index: number }>> {
  const footprints = entries.map(({ segment }) => {
    const footprint = new Set(segment.stationKeys.map((key) => `s:${key}`));
    segment.edgeKeys.forEach((key) => {
      footprint.add(`e:${key}`);
      const edge = edgeByKey.get(key);
      if (edge) {
        footprint.add(`s:${edge.source}`);
        footprint.add(`s:${edge.target}`);
      }
    });
    return footprint;
  });
  const remaining = new Set(entries.map((_, index) => index));
  const components: Array<Array<{ segment: PatternTrafficImpactSegment; index: number }>> = [];

  while (remaining.size) {
    const start = remaining.values().next().value as number;
    remaining.delete(start);
    const queue = [start];
    const component: Array<{ segment: PatternTrafficImpactSegment; index: number }> = [];
    while (queue.length) {
      const current = queue.pop()!;
      component.push(entries[current]!);
      for (const candidate of [...remaining]) {
        if (![...footprints[current]!].some((value) => footprints[candidate]!.has(value))) continue;
        remaining.delete(candidate);
        queue.push(candidate);
      }
    }
    components.push(component);
  }
  return components;
}

function midpoint(left: TrafficMarkerPoint, right: TrafficMarkerPoint): TrafficMarkerPoint {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function distance(left: TrafficMarkerPoint, right: TrafficMarkerPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
