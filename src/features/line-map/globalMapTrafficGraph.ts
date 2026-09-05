import {
  getPatternTrafficEdgeKey,
  type PatternTrafficEdge,
  type PatternTrafficStation,
} from "../service-pattern/trafficImpactAnalysis";
import type {
  GlobalMapLine,
  GlobalMapPath,
  GlobalMapStation,
} from "../transport-map/contracts/manifest";

export interface GlobalMapTrafficGraph {
  stations: PatternTrafficStation[];
  edges: PatternTrafficEdge[];
}

/**
 * Adapts the global map's line/path contract to the traffic calendar graph.
 * The line station sequence is retained as a fallback because a viewport can
 * contain paths without all their station anchors; path anchors then add any
 * branch topology that is present in the selected geometry.
 */
export function createGlobalMapTrafficGraph(
  line: GlobalMapLine | undefined,
  stations: readonly GlobalMapStation[] = [],
  paths: readonly GlobalMapPath[] = [],
): GlobalMapTrafficGraph {
  if (!line) return { stations: [], edges: [] };

  const stationIds = new Set<string>();
  const edgesByKey = new Map<string, PatternTrafficEdge>();

  const addRoute = (route: readonly string[], routeId: string): void => {
    let previous: string | undefined;
    for (const stationId of route) {
      if (!stationId) continue;
      stationIds.add(stationId);
      if (previous && previous !== stationId) {
        const edge: PatternTrafficEdge = {
          id: `${routeId}:${previous}-${stationId}`,
          source: previous,
          target: stationId,
        };
        const key = getPatternTrafficEdgeKey(edge);
        if (!edgesByKey.has(key)) edgesByKey.set(key, edge);
      }
      previous = stationId;
    }
  };

  addRoute(line.stationIds, `line:${line.id}`);
  paths
    .filter((path) => path.lineId === line.id)
    .forEach((path) => {
      const anchoredStationIds = path.stationIds.length > 0
        ? path.stationIds
        : path.vertices.flatMap((vertex) => vertex.stationId ? [vertex.stationId] : []);
      addRoute(anchoredStationIds, `path:${path.id}`);
    });

  const degreeByStation = new Map<string, number>();
  for (const edge of edgesByKey.values()) {
    degreeByStation.set(edge.source, (degreeByStation.get(edge.source) ?? 0) + 1);
    degreeByStation.set(edge.target, (degreeByStation.get(edge.target) ?? 0) + 1);
  }

  const stationsById = new Map(stations.map((station) => [station.id, station]));
  return {
    stations: [...stationIds].map((stationId) => ({
      key: stationId,
      label: stationsById.get(stationId)?.name ?? stationId,
      branchEnd: (degreeByStation.get(stationId) ?? 0) <= 1,
    })),
    edges: [...edgesByKey.values()],
  };
}
