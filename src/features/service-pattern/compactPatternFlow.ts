import type { LineRouteSequence } from "../../types/transit";
import { createPatternStationKey } from "./stationKeys";

export const COMPACT_PATTERN_STATION_THRESHOLD = 34;

export function countPatternTopologyStations(
  lineTopology: LineRouteSequence[],
): number {
  return new Set(
    lineTopology.flatMap((sequence) =>
      sequence.stops.map((stop) => createPatternStationKey(stop)),
    ),
  ).size;
}

export function shouldUseCompactPatternFlow(
  lineTopology: LineRouteSequence[],
): boolean {
  return (
    countPatternTopologyStations(lineTopology) >=
    COMPACT_PATTERN_STATION_THRESHOLD
  );
}
