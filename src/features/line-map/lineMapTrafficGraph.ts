import type {
  PatternTrafficEdge,
  PatternTrafficStation,
} from "../service-pattern/trafficImpactAnalysis";
import type { LineMapViewModel } from "./types";

export interface LineMapTrafficGraph {
  stations: PatternTrafficStation[];
  edges: PatternTrafficEdge[];
}

export function createLineMapTrafficGraph(map?: LineMapViewModel): LineMapTrafficGraph {
  if (!map) {
    return { stations: [], edges: [] };
  }

  const degrees = new Map<string, number>();
  const edges = map.segments.map((segment) => {
    degrees.set(segment.fromStopId, (degrees.get(segment.fromStopId) ?? 0) + 1);
    degrees.set(segment.toStopId, (degrees.get(segment.toStopId) ?? 0) + 1);

    return {
      id: segment.id,
      source: segment.fromStopId,
      target: segment.toStopId,
    };
  });

  return {
    stations: map.stops.map((stop) => ({
      key: stop.id,
      label: stop.label,
      branchEnd: (degrees.get(stop.id) ?? 0) <= 1,
    })),
    edges,
  };
}
