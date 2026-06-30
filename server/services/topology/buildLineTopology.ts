import type {
  LineTopology,
  RawLineFixture,
  TopologyBranch,
  TopologySegment,
} from "./types";

export function buildLineTopologyFromFixture(raw: RawLineFixture): LineTopology {
  const stationIds = new Set(raw.stations.map((station) => station.id));
  const segmentsById = new Map<string, TopologySegment>();
  const patterns = raw.patterns.map((pattern) => {
    const stops = dedupeConsecutive(pattern.stops);

    for (const stopId of stops) {
      if (!stationIds.has(stopId)) {
        throw new Error(
          `Pattern ${pattern.id} references unknown station ${stopId}`,
        );
      }
    }

    stops.slice(0, -1).forEach((from, index) => {
      const to = stops[index + 1];
      const id = segmentId(from, to);
      const existing = segmentsById.get(id);

      if (existing) {
        if (!existing.patterns.includes(pattern.id)) {
          existing.patterns.push(pattern.id);
        }
      } else {
        segmentsById.set(id, {
          id,
          from,
          to,
          patterns: [pattern.id],
        });
      }
    });

    return {
      ...pattern,
      stops,
    };
  });
  const segments = [...segmentsById.values()].sort(compareSegments);
  const neighbors = buildNeighborMap(raw.stations.map((station) => station.id), segments);
  const stations = raw.stations
    .map((station) => ({
      ...station,
      degree: neighbors.get(station.id)?.size ?? 0,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));
  const branchPoints = stations
    .filter((station) => station.degree >= 3)
    .map((station) => station.id)
    .sort();
  const terminals = stations
    .filter((station) => station.degree === 1)
    .map((station) => station.id)
    .sort();

  return {
    line: raw.line,
    stations,
    segments,
    patterns,
    branches: buildBranches(neighbors, branchPoints, terminals),
    loops: [],
    branchPoints,
    terminals,
  };
}

export function buildNeighborMap(
  stationIds: string[],
  segments: TopologySegment[],
): Map<string, Set<string>> {
  const neighbors = new Map(stationIds.map((id) => [id, new Set<string>()]));

  for (const segment of segments) {
    neighbors.get(segment.from)?.add(segment.to);
    neighbors.get(segment.to)?.add(segment.from);
  }

  return neighbors;
}

export function segmentId(left: string, right: string): string {
  return [left, right].sort().join("__");
}

function buildBranches(
  neighbors: Map<string, Set<string>>,
  branchPoints: string[],
  terminals: string[],
): TopologyBranch[] {
  const anchors = new Set([...branchPoints, ...terminals]);
  const visitedEdges = new Set<string>();
  const branches: TopologyBranch[] = [];

  for (const anchor of anchors) {
    for (const neighbor of neighbors.get(anchor) ?? []) {
      const firstEdgeId = segmentId(anchor, neighbor);

      if (visitedEdges.has(firstEdgeId)) {
        continue;
      }

      const path = [anchor];
      let previous = anchor;
      let current = neighbor;

      visitedEdges.add(firstEdgeId);

      while (true) {
        path.push(current);

        if (anchors.has(current)) {
          break;
        }

        const next = [...(neighbors.get(current) ?? [])].find(
          (candidate) => candidate !== previous,
        );

        if (!next) {
          break;
        }

        visitedEdges.add(segmentId(current, next));
        previous = current;
        current = next;
      }

      const from = path[0];
      const to = path[path.length - 1];

      branches.push({
        id: `${from}__${to}`,
        from,
        to,
        stops: path,
      });
    }
  }

  return branches.sort((left, right) => left.id.localeCompare(right.id));
}

function dedupeConsecutive(values: string[]): string[] {
  return values.filter((value, index) => index === 0 || value !== values[index - 1]);
}

function compareSegments(left: TopologySegment, right: TopologySegment): number {
  return left.id.localeCompare(right.id);
}
