import { describe, expect, it } from "vitest";
import {
  COMPACT_PATTERN_STATION_THRESHOLD,
  countPatternTopologyStations,
  shouldUseCompactPatternFlow,
} from "../src/features/service-pattern/compactPatternFlow";
import type { LineRouteSequence, LineRouteStop } from "../src/types/transit";

describe("compact pattern flow defaults", () => {
  it("keeps short lines in comfortable mode by default", () => {
    const topology = createLinearTopology(COMPACT_PATTERN_STATION_THRESHOLD - 1);

    expect(countPatternTopologyStations(topology)).toBe(
      COMPACT_PATTERN_STATION_THRESHOLD - 1,
    );
    expect(shouldUseCompactPatternFlow(topology)).toBe(false);
  });

  it("enables compact mode by default for dense line maps", () => {
    const topology = createLinearTopology(COMPACT_PATTERN_STATION_THRESHOLD);

    expect(countPatternTopologyStations(topology)).toBe(
      COMPACT_PATTERN_STATION_THRESHOLD,
    );
    expect(shouldUseCompactPatternFlow(topology)).toBe(true);
  });

  it("counts shared branch junctions once", () => {
    const trunk = createStops(["A", "B", "C"]);
    const branchOne = createStops(["C", "D", "E"]);
    const branchTwo = createStops(["C", "F", "G"]);

    expect(
      countPatternTopologyStations([
        createSequence("trunk", trunk),
        createSequence("branch-one", branchOne),
        createSequence("branch-two", branchTwo),
      ]),
    ).toBe(7);
  });
});

function createLinearTopology(stationCount: number): LineRouteSequence[] {
  return [
    createSequence(
      "linear",
      Array.from({ length: stationCount }, (_, index) =>
        createStop(`Station ${index + 1}`),
      ),
    ),
  ];
}

function createStops(labels: string[]): LineRouteStop[] {
  return labels.map(createStop);
}

function createSequence(
  id: string,
  stops: LineRouteStop[],
): LineRouteSequence {
  return {
    id,
    label: id,
    stops,
  };
}

function createStop(label: string): LineRouteStop {
  return {
    id: `station:${label}`,
    label,
    station: {
      id: `station:${label}`,
      label,
      monitoringRef: `station:${label}`,
    },
  };
}
