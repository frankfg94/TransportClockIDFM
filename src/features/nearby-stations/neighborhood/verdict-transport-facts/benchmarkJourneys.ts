import type { NeighborhoodScoreInput } from "../contracts";
import { JOURNEY_REFERENCE_BENCHMARKS } from "./benchmarkDestinations";

export function prepareJourneyBenchmarks(input: NeighborhoodScoreInput) {
  const providedBenchmarks = input.journeyBenchmarks;
  const benchmarksById = new Map((providedBenchmarks ?? []).map((benchmark) => [benchmark.id, benchmark]));
  const canReportUnavailable = input.stationsLoaded && input.journeyBenchmarksLoading === false;
  const benchmarks = providedBenchmarks === undefined
    ? []
    : JOURNEY_REFERENCE_BENCHMARKS.map((station) => benchmarksById.get(station.id) ?? (canReportUnavailable
      ? { id: station.id, label: station.label, journeys: [], status: "unavailable" as const }
      : undefined)).filter((benchmark): benchmark is NonNullable<typeof benchmark> => benchmark !== undefined);
  return { benchmarks, canReportUnavailable };
}
