import type { ExpectedTopologyFixture, LineTopology } from "./types";
import { buildNeighborMap, segmentId } from "./buildLineTopology";

export function validateLineTopology(
  topology: LineTopology,
  expected: ExpectedTopologyFixture,
): string[] {
  const failures: string[] = [];
  const stationIds = new Set(topology.stations.map((station) => station.id));
  const neighbors = buildNeighborMap([...stationIds], topology.segments);

  for (const stationId of expected.requiredStations) {
    if (!stationIds.has(stationId)) {
      failures.push(`Missing station ${stationId}`);
    }
  }

  for (const station of topology.stations) {
    const degree = neighbors.get(station.id)?.size ?? 0;

    if (degree === 0) {
      failures.push(`Orphan station ${station.id}`);
    }
  }

  for (const segment of topology.segments) {
    if (!stationIds.has(segment.from) || !stationIds.has(segment.to)) {
      failures.push(`Segment ${segment.id} references an unknown station`);
    }
  }

  if (countConnectedComponents(stationIds, neighbors) !== 1) {
    failures.push("Line graph is not fully connected");
  }

  for (const terminal of expected.expectedTerminals) {
    const degree = neighbors.get(terminal)?.size ?? 0;
    const expectedDegree = expected.expectedTerminalDegrees?.[terminal] ?? 1;

    if (degree !== expectedDegree) {
      failures.push(
        `Expected terminal ${terminal} has degree ${degree}, expected ${expectedDegree}`,
      );
    }
  }

  for (const branchPoint of expected.expectedBranchPoints) {
    const degree = neighbors.get(branchPoint)?.size ?? 0;

    if (!topology.branchPoints.includes(branchPoint) || degree < 3) {
      failures.push(`Expected branch point ${branchPoint} has degree ${degree}`);
    }
  }

  for (const [stationId, expectedNeighbors] of Object.entries(
    expected.expectedNeighbors,
  )) {
    const actual = [...(neighbors.get(stationId) ?? [])].sort();
    const wanted = [...expectedNeighbors].sort();

    if (actual.join("|") !== wanted.join("|")) {
      failures.push(
        `Unexpected neighbors for ${stationId}: got [${actual.join(", ")}], expected [${wanted.join(", ")}]`,
      );
    }

    for (const neighbor of expectedNeighbors) {
      const id = segmentId(stationId, neighbor);

      if (!topology.segments.some((segment) => segment.id === id)) {
        failures.push(`Missing expected segment ${id}`);
      }
    }
  }

  for (const branch of topology.branches) {
    if (!stationIds.has(branch.from) || !stationIds.has(branch.to)) {
      failures.push(`Branch ${branch.id} is not attached to known stations`);
    }

    if (branch.stops.length < 2) {
      failures.push(`Branch ${branch.id} is too short`);
    }
  }

  return failures;
}

function countConnectedComponents(
  stationIds: Set<string>,
  neighbors: Map<string, Set<string>>,
): number {
  const remaining = new Set(stationIds);
  let count = 0;

  while (remaining.size > 0) {
    count += 1;
    const [start] = remaining;
    const queue = [start];

    remaining.delete(start);

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const neighbor of neighbors.get(current) ?? []) {
        if (remaining.delete(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
  }

  return count;
}
