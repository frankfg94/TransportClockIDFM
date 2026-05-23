import type { LineRouteSequence } from "../../types/transit";
import { createPatternStationKey } from "./stationKeys";

export interface PatternFlowStructure {
  stationKeys: string[];
  edgeKeys: string[];
  branchKeys: string[];
  terminalKeys: string[];
  orphanKeys: string[];
  componentCount: number;
  degreeByKey: Record<string, number>;
}

export function createPatternFlowStructure(
  lineTopology: LineRouteSequence[],
): PatternFlowStructure {
  const stationKeys = new Set<string>();
  const edgeKeys = new Set<string>();

  for (const sequence of lineTopology) {
    const stops = sequence.stops.map((stop) => createPatternStationKey(stop));

    stops.forEach((key) => stationKeys.add(key));
    stops.slice(0, -1).forEach((source, index) => {
      const target = stops[index + 1];

      if (source !== target) {
        edgeKeys.add(createEdgeKey(source, target));
      }
    });
  }

  const adjacency = new Map<string, Set<string>>(
    [...stationKeys].map((key) => [key, new Set<string>()]),
  );

  for (const edgeKey of edgeKeys) {
    const [source, target] = edgeKey.split("--");

    adjacency.get(source)?.add(target);
    adjacency.get(target)?.add(source);
  }

  const degreeByKey = Object.fromEntries(
    [...adjacency.entries()].map(([key, neighbors]) => [key, neighbors.size]),
  );

  return {
    stationKeys: [...stationKeys].sort(),
    edgeKeys: [...edgeKeys].sort(),
    branchKeys: [...adjacency.entries()]
      .filter(([, neighbors]) => neighbors.size >= 3)
      .map(([key]) => key)
      .sort(),
    terminalKeys: [...adjacency.entries()]
      .filter(([, neighbors]) => neighbors.size === 1)
      .map(([key]) => key)
      .sort(),
    orphanKeys: [...adjacency.entries()]
      .filter(([, neighbors]) => neighbors.size === 0)
      .map(([key]) => key)
      .sort(),
    componentCount: countComponents(adjacency),
    degreeByKey,
  };
}

function createEdgeKey(source: string, target: string): string {
  return [source, target].sort().join("--");
}

function countComponents(adjacency: Map<string, Set<string>>): number {
  const remaining = new Set(adjacency.keys());
  let count = 0;

  while (remaining.size > 0) {
    count += 1;
    const [start] = remaining;
    const queue = [start];

    remaining.delete(start);

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const neighbor of adjacency.get(current) ?? []) {
        if (remaining.delete(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
  }

  return count;
}
