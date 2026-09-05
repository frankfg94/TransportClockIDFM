import {
  analyzeTrafficImpacts,
  getDisturbedStations,
  getInterruptedStations,
  getPatternTrafficEdgeKey,
  type PatternTrafficEdge,
  type PatternTrafficStation,
} from "../../service-pattern/trafficImpactAnalysis";
import type { TrafficDisruption } from "../../traffic/types";
import {
  getGlobalMapPathSubpathRanges,
  type GlobalMapPath,
  type GlobalMapStation,
} from "../contracts/manifest";
import type { TransportMapTrafficPathSpan } from "../contracts/renderer";

export interface TransportMapActiveTrafficAnalysis {
  interruptedStationIds: string[];
  disturbedStationIds: string[];
  pathSpans: TransportMapTrafficPathSpan[];
}

interface PathEdgeRange {
  pathId: string;
  startVertexIndex: number;
  endVertexIndex: number;
  edge: PatternTrafficEdge;
}

interface PathEndpoint {
  pathId: string;
  rangeStart: number;
  rangeEnd: number;
  side: "start" | "end";
  stationId: string;
  stationVertexIndex: number;
  x: number;
  y: number;
}

interface TopologyTrafficInterval {
  startMeasure: number;
  endMeasure: number;
  kind: TransportMapTrafficPathSpan["kind"];
  disruptionId: string;
}

interface TopologyTrafficRoute {
  lineId: string;
  geometrySource: GlobalMapPath["geometrySource"];
  stationIds: Set<string>;
  vertices: GlobalMapPath["vertices"];
  measures: number[];
  intervals: TopologyTrafficInterval[];
}

interface RenderPathTopologyGroup {
  lineId: string;
  geometrySource: GlobalMapPath["geometrySource"];
  stationIds: Set<string>;
}

// Chunk clipping removes the last/first station anchor from adjacent path
// fragments. The endpoints still share the same tile-boundary coordinate, so
// this small tolerance lets the traffic graph reconnect the route without
// inventing a connection between unrelated nearby lines.
const PATH_FRAGMENT_JOIN_TOLERANCE_WORLD = 2e-6;

// Detailed chunk vertices and their regional topology are emitted from the
// same compiled trace. A small tolerance still absorbs Float64 clipping at a
// tile edge, while remaining far below the distance between parallel tracks.
const TOPOLOGY_PROJECTION_TOLERANCE_WORLD = 2e-6;

const EMPTY_ANALYSIS: TransportMapActiveTrafficAnalysis = {
  interruptedStationIds: [],
  disturbedStationIds: [],
  pathSpans: [],
};

/**
 * Analyze the already-selected direction paths.
 *
 * `paths` is the render set and may be clipped to the current viewport.
 * `topologyPaths` is the complete focused-line topology and must not depend on
 * the camera. Keeping those inputs separate prevents an interruption outside
 * the viewport from being reinterpreted as a disturbance of the visible
 * remainder of the line.
 */
export function analyzeActiveTransportMapTraffic(
  disruptions: TrafficDisruption[],
  paths: GlobalMapPath[],
  stationsById: ReadonlyMap<string, GlobalMapStation>,
  topologyPaths: GlobalMapPath[] = paths,
): TransportMapActiveTrafficAnalysis {
  if (disruptions.length === 0 || paths.length === 0) return EMPTY_ANALYSIS;

  const stationIds = new Set<string>();
  const edgeByKey = new Map<string, PatternTrafficEdge>();
  const pathEdgeRanges: PathEdgeRange[] = [];
  const topologyEndpointsByLogicalPath = new Map<string, PathEndpoint[]>();
  const renderEndpointsByLogicalPath = new Map<string, PathEndpoint[]>();
  const neighboursByStation = new Map<string, Set<string>>();

  const collectGraphPaths = (
    sourcePaths: GlobalMapPath[],
    endpointsByLogicalPath: Map<string, PathEndpoint[]>,
  ): void => {
    for (const path of sourcePaths) {
      for (const { start, end } of getGlobalMapPathSubpathRanges(path)) {
        const anchors = getPathAnchors(path, start, end);

        for (const anchor of anchors) stationIds.add(anchor.stationId);
        for (let index = 1; index < anchors.length; index += 1) {
          const previous = anchors[index - 1]!;
          const current = anchors[index]!;
          if (previous.stationId === current.stationId) continue;

          const edge: PatternTrafficEdge = {
            id: `${path.id}:${previous.vertexIndex}-${current.vertexIndex}`,
            source: previous.stationId,
            target: current.stationId,
          };
          const edgeKey = getPatternTrafficEdgeKey(edge);
          edgeByKey.set(edgeKey, edge);
          addNeighbour(neighboursByStation, previous.stationId, current.stationId);
          addNeighbour(neighboursByStation, current.stationId, previous.stationId);
        }

        addPathEndpoints(endpointsByLogicalPath, path, start, end, anchors);
      }
    }
  };

  collectGraphPaths(
    topologyPaths.length > 0 ? topologyPaths : paths,
    topologyEndpointsByLogicalPath,
  );

  // A clipped chunk can end between stations and the next chunk can begin
  // between stations. Reconnect those fragments before parsing the textual
  // disruption endpoints, then retain a render range on both sides of the
  // clipped boundary so the coloured line remains continuous.
  connectPathFragments(topologyEndpointsByLogicalPath, edgeByKey, neighboursByStation);

  // The render paths can be a viewport subset of the stable topology. Only
  // project already-known topology edges onto that subset; this keeps local
  // path spans visible without allowing a clipped viewport to create a new
  // traffic graph.
  collectRenderPathRanges(paths, edgeByKey, renderEndpointsByLogicalPath, pathEdgeRanges);
  connectPathFragments(
    renderEndpointsByLogicalPath,
    edgeByKey,
    neighboursByStation,
    pathEdgeRanges,
  );

  const stations: PatternTrafficStation[] = [...stationIds].map((stationId) => ({
    key: stationId,
    label: stationsById.get(stationId)?.name ?? stationId,
    branchEnd: (neighboursByStation.get(stationId)?.size ?? 0) <= 1,
  }));
  if (stations.length === 0) return EMPTY_ANALYSIS;

  const analysis = analyzeTrafficImpacts(disruptions, stations, [...edgeByKey.values()]);
  const pathSpans = mergeTrafficPathSpans(
    pathEdgeRanges.flatMap((range) => {
      const impact = analysis.edgeImpacts[getPatternTrafficEdgeKey(range.edge)];
      return impact
        ? [
            {
              pathId: range.pathId,
              startVertexIndex: range.startVertexIndex,
              endVertexIndex: range.endVertexIndex,
              kind: impact.kind,
              disruptionId: impact.disruption.id,
            },
          ]
        : [];
    }),
  );
  const projectedTopologySpans = projectTopologyTrafficSpans(
    paths,
    topologyPaths.length > 0 ? topologyPaths : paths,
    analysis.edgeImpacts,
  );

  return {
    interruptedStationIds: getInterruptedStations(analysis),
    disturbedStationIds: getDisturbedStations(analysis),
    pathSpans: mergeTrafficPathSpans([...pathSpans, ...projectedTopologySpans]),
  };
}

function getPathAnchors(
  path: GlobalMapPath,
  start: number,
  end: number,
): Array<{ stationId: string; vertexIndex: number }> {
  return path.vertices
    .slice(start, end)
    .flatMap((vertex, relativeIndex) =>
      vertex.stationId ? [{ stationId: vertex.stationId, vertexIndex: start + relativeIndex }] : [],
    );
}

function addPathEndpoints(
  endpointsByLogicalPath: Map<string, PathEndpoint[]>,
  path: GlobalMapPath,
  start: number,
  end: number,
  anchors: Array<{ stationId: string; vertexIndex: number }>,
): void {
  const firstAnchor = anchors[0];
  const lastAnchor = anchors.at(-1);
  if (!firstAnchor || !lastAnchor) return;

  const logicalPathId = path.id.split("#", 1)[0] ?? path.id;
  const endpoints = endpointsByLogicalPath.get(logicalPathId) ?? [];
  endpoints.push(
    {
      pathId: path.id,
      rangeStart: start,
      rangeEnd: end,
      side: "start",
      stationId: firstAnchor.stationId,
      stationVertexIndex: firstAnchor.vertexIndex,
      x: path.vertices[start]!.x,
      y: path.vertices[start]!.y,
    },
    {
      pathId: path.id,
      rangeStart: start,
      rangeEnd: end,
      side: "end",
      stationId: lastAnchor.stationId,
      stationVertexIndex: lastAnchor.vertexIndex,
      x: path.vertices[end - 1]!.x,
      y: path.vertices[end - 1]!.y,
    },
  );
  endpointsByLogicalPath.set(logicalPathId, endpoints);
}

function collectRenderPathRanges(
  paths: GlobalMapPath[],
  edgeByKey: ReadonlyMap<string, PatternTrafficEdge>,
  endpointsByLogicalPath: Map<string, PathEndpoint[]>,
  pathEdgeRanges: PathEdgeRange[],
): void {
  for (const path of paths) {
    for (const { start, end } of getGlobalMapPathSubpathRanges(path)) {
      const anchors = getPathAnchors(path, start, end);
      for (let index = 1; index < anchors.length; index += 1) {
        const previous = anchors[index - 1]!;
        const current = anchors[index]!;
        if (previous.stationId === current.stationId) continue;
        const edge = edgeByKey.get(
          getPatternTrafficEdgeKey({
            source: previous.stationId,
            target: current.stationId,
          }),
        );
        if (!edge) continue;
        pathEdgeRanges.push({
          pathId: path.id,
          startVertexIndex: previous.vertexIndex,
          endVertexIndex: current.vertexIndex,
          edge,
        });
      }
      addPathEndpoints(endpointsByLogicalPath, path, start, end, anchors);
    }
  }
}

function connectPathFragments(
  endpointsByLogicalPath: Map<string, PathEndpoint[]>,
  edgeByKey: Map<string, PatternTrafficEdge>,
  neighboursByStation: Map<string, Set<string>>,
  pathEdgeRanges: PathEdgeRange[] = [],
): void {
  endpointsByLogicalPath.forEach((endpoints) => {
    for (let leftIndex = 0; leftIndex < endpoints.length; leftIndex += 1) {
      const left = endpoints[leftIndex]!;
      for (let rightIndex = leftIndex + 1; rightIndex < endpoints.length; rightIndex += 1) {
        const right = endpoints[rightIndex]!;
        if (left.pathId === right.pathId || left.stationId === right.stationId) continue;

        const distance = Math.hypot(left.x - right.x, left.y - right.y);
        if (distance > PATH_FRAGMENT_JOIN_TOLERANCE_WORLD) continue;

        const edge: PatternTrafficEdge = {
          id: `${left.pathId}:${left.side}-${right.pathId}:${right.side}`,
          source: left.stationId,
          target: right.stationId,
        };
        const edgeKey = getPatternTrafficEdgeKey(edge);
        const knownEdge = edgeByKey.get(edgeKey);
        if (!knownEdge) {
          // Topology fragments are allowed to reconnect the stable graph. A
          // render-only fragment may only project a pre-existing edge.
          if (pathEdgeRanges.length > 0) continue;
          edgeByKey.set(edgeKey, edge);
          addNeighbour(neighboursByStation, left.stationId, right.stationId);
          addNeighbour(neighboursByStation, right.stationId, left.stationId);
        }

        const resolvedEdge = knownEdge ?? edgeByKey.get(edgeKey);
        if (!resolvedEdge) continue;
        const leftRange = createEndpointTrafficRange(left, resolvedEdge);
        if (leftRange) pathEdgeRanges.push(leftRange);
        const rightRange = createEndpointTrafficRange(right, resolvedEdge);
        if (rightRange) pathEdgeRanges.push(rightRange);
      }
    }
  });
}

export function findTrafficPathSpan(
  spans: TransportMapTrafficPathSpan[],
  pathId: string,
  vertexSegmentIndex: number | undefined,
): TransportMapTrafficPathSpan | undefined {
  if (vertexSegmentIndex === undefined) return undefined;
  return spans.find(
    (span) =>
      span.pathId === pathId &&
      vertexSegmentIndex >= span.startVertexIndex &&
      vertexSegmentIndex < span.endVertexIndex,
  );
}

function mergeTrafficPathSpans(
  spans: TransportMapTrafficPathSpan[],
): TransportMapTrafficPathSpan[] {
  const sorted = [...spans].sort(
    (left, right) =>
      left.pathId.localeCompare(right.pathId) ||
      left.startVertexIndex - right.startVertexIndex ||
      left.endVertexIndex - right.endVertexIndex,
  );
  const merged: TransportMapTrafficPathSpan[] = [];
  for (const span of sorted) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.pathId === span.pathId &&
      previous.kind === span.kind &&
      previous.disruptionId === span.disruptionId &&
      previous.endVertexIndex >= span.startVertexIndex
    ) {
      previous.endVertexIndex = Math.max(previous.endVertexIndex, span.endVertexIndex);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/**
 * A detailed path is clipped independently in every tile. The middle tile of
 * a station-to-station edge can therefore contain no station anchor at all.
 * Deriving traffic spans only from local anchors makes that tile fall back to
 * the line colour even though the regional topology has already identified
 * the impacted edge. Project those known topology intervals back onto the
 * rendered trace so every retained GTFS fragment receives the same impact.
 */
function projectTopologyTrafficSpans(
  renderPaths: readonly GlobalMapPath[],
  topologyPaths: readonly GlobalMapPath[],
  edgeImpacts: Record<string, { kind: TransportMapTrafficPathSpan["kind"]; disruption: { id: string } }>,
): TransportMapTrafficPathSpan[] {
  const routesByLineId = new Map<string, TopologyTrafficRoute[]>();
  for (const topologyPath of topologyPaths) {
    for (const { start, end } of getGlobalMapPathSubpathRanges(topologyPath)) {
      const route = createTopologyTrafficRoute(topologyPath, start, end, edgeImpacts);
      if (!route || route.intervals.length === 0) continue;
      const routes = routesByLineId.get(route.lineId) ?? [];
      routes.push(route);
      routesByLineId.set(route.lineId, routes);
    }
  }
  if (routesByLineId.size === 0) return [];

  const groups = new Map<string, RenderPathTopologyGroup>();
  for (const path of renderPaths) {
    const key = logicalPathId(path);
    const group = groups.get(key) ?? {
      lineId: path.lineId,
      geometrySource: path.geometrySource,
      stationIds: new Set<string>(),
    };
    for (const stationId of path.stationIds) group.stationIds.add(stationId);
    groups.set(key, group);
  }

  const routeByRenderPathId = new Map<string, TopologyTrafficRoute>();
  for (const path of renderPaths) {
    const group = groups.get(logicalPathId(path));
    if (!group) continue;
    const route = selectTopologyTrafficRoute(
      group,
      routesByLineId.get(path.lineId) ?? [],
    );
    if (route) routeByRenderPathId.set(path.id, route);
  }

  return renderPaths.flatMap((path) => {
    const route = routeByRenderPathId.get(path.id);
    return route ? projectPathSpansOnTopologyRoute(path, route) : [];
  });
}

function createTopologyTrafficRoute(
  path: GlobalMapPath,
  start: number,
  end: number,
  edgeImpacts: Record<string, { kind: TransportMapTrafficPathSpan["kind"]; disruption: { id: string } }>,
): TopologyTrafficRoute | undefined {
  const vertices = path.vertices.slice(start, end);
  if (vertices.length < 2) return undefined;

  const measures = [0];
  for (let index = 1; index < vertices.length; index += 1) {
    const previous = vertices[index - 1]!;
    const current = vertices[index]!;
    measures.push(measures[index - 1]! + Math.hypot(current.x - previous.x, current.y - previous.y));
  }

  const anchors = vertices.flatMap((vertex, index) =>
    vertex.stationId ? [{ stationId: vertex.stationId, measure: measures[index]! }] : [],
  );
  const intervals = anchors.slice(1).flatMap((anchor, index) => {
    const previous = anchors[index]!;
    if (previous.stationId === anchor.stationId || anchor.measure <= previous.measure) return [];
    const impact = edgeImpacts[
      getPatternTrafficEdgeKey({ source: previous.stationId, target: anchor.stationId })
    ];
    return impact
      ? [{
          startMeasure: previous.measure,
          endMeasure: anchor.measure,
          kind: impact.kind,
          disruptionId: impact.disruption.id,
        }]
      : [];
  });
  if (intervals.length === 0) return undefined;

  return {
    lineId: path.lineId,
    geometrySource: path.geometrySource,
    stationIds: new Set(anchors.map((anchor) => anchor.stationId)),
    vertices,
    measures,
    intervals,
  };
}

function selectTopologyTrafficRoute(
  group: RenderPathTopologyGroup,
  candidates: readonly TopologyTrafficRoute[],
): TopologyTrafficRoute | undefined {
  let best: TopologyTrafficRoute | undefined;
  let bestScore = 0;
  for (const candidate of candidates) {
    if (candidate.geometrySource !== group.geometrySource) continue;
    const sharedStationCount = [...group.stationIds].filter((stationId) =>
      candidate.stationIds.has(stationId),
    ).length;
    if (sharedStationCount > bestScore) {
      best = candidate;
      bestScore = sharedStationCount;
    }
  }

  // One shared station is ambiguous at most junctions. Failing closed leaves
  // the normal path rendering intact instead of colouring a parallel branch.
  return bestScore >= 2 ? best : undefined;
}

function projectPathSpansOnTopologyRoute(
  path: GlobalMapPath,
  route: TopologyTrafficRoute,
): TransportMapTrafficPathSpan[] {
  const spans: TransportMapTrafficPathSpan[] = [];
  for (const { start, end } of getGlobalMapPathSubpathRanges(path)) {
    const projections = path.vertices
      .slice(start, end)
      .map((vertex) => projectPointOnTopologyRoute(vertex, route));
    for (let index = 1; index < projections.length; index += 1) {
      const previous = projections[index - 1]!;
      const current = projections[index]!;
      if (
        !previous ||
        !current ||
        previous.distance > TOPOLOGY_PROJECTION_TOLERANCE_WORLD ||
        current.distance > TOPOLOGY_PROJECTION_TOLERANCE_WORLD
      ) {
        continue;
      }
      const interval = selectTrafficIntervalForMeasures(
        route.intervals,
        previous.measure,
        current.measure,
      );
      if (!interval) continue;
      spans.push({
        pathId: path.id,
        startVertexIndex: start + index - 1,
        endVertexIndex: start + index,
        kind: interval.kind,
        disruptionId: interval.disruptionId,
      });
    }
  }
  return mergeTrafficPathSpans(spans);
}

function projectPointOnTopologyRoute(
  point: Pick<GlobalMapPath["vertices"][number], "x" | "y">,
  route: TopologyTrafficRoute,
): { measure: number; distance: number } | undefined {
  let nearest: { measure: number; distance: number } | undefined;
  for (let index = 1; index < route.vertices.length; index += 1) {
    const start = route.vertices[index - 1]!;
    const end = route.vertices[index]!;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) continue;
    const rawRatio = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
    const ratio = Math.max(0, Math.min(1, rawRatio));
    const projectedX = start.x + dx * ratio;
    const projectedY = start.y + dy * ratio;
    const distance = Math.hypot(point.x - projectedX, point.y - projectedY);
    if (!nearest || distance < nearest.distance) {
      nearest = {
        measure:
          route.measures[index - 1]! + Math.sqrt(lengthSquared) * ratio,
        distance,
      };
    }
  }
  return nearest;
}

function selectTrafficIntervalForMeasures(
  intervals: readonly TopologyTrafficInterval[],
  leftMeasure: number,
  rightMeasure: number,
): TopologyTrafficInterval | undefined {
  const startMeasure = Math.min(leftMeasure, rightMeasure);
  const endMeasure = Math.max(leftMeasure, rightMeasure);
  return intervals.find(
    (interval) =>
      interval.startMeasure < endMeasure && interval.endMeasure > startMeasure,
  );
}

function logicalPathId(path: Pick<GlobalMapPath, "id">): string {
  return path.id.split("#", 1)[0] ?? path.id;
}

function addNeighbour(
  neighboursByStation: Map<string, Set<string>>,
  stationId: string,
  neighbourId: string,
): void {
  const neighbours = neighboursByStation.get(stationId) ?? new Set<string>();
  neighbours.add(neighbourId);
  neighboursByStation.set(stationId, neighbours);
}

function createEndpointTrafficRange(
  endpoint: PathEndpoint,
  edge: PatternTrafficEdge,
): PathEdgeRange | undefined {
  if (endpoint.side === "start") {
    return endpoint.stationVertexIndex > endpoint.rangeStart
      ? {
          pathId: endpoint.pathId,
          startVertexIndex: endpoint.rangeStart,
          endVertexIndex: endpoint.stationVertexIndex,
          edge,
        }
      : undefined;
  }

  return endpoint.stationVertexIndex < endpoint.rangeEnd - 1
    ? {
        pathId: endpoint.pathId,
        startVertexIndex: endpoint.stationVertexIndex,
        endVertexIndex: endpoint.rangeEnd - 1,
        edge,
      }
    : undefined;
}
