import type { NeighborhoodScoreInput } from "../contracts";
import { prepareJourneyBenchmarks } from "./benchmarkJourneys";
import { buildLargeStationFacts } from "./largeStations";
import { buildEmploymentHubFacts } from "./employmentHubs";

export function buildJourneyBenchmarkFacts(input: NeighborhoodScoreInput) {
  const context = prepareJourneyBenchmarks(input);
  const stations = buildLargeStationFacts(context), hubs = buildEmploymentHubFacts(context);
  return { positiveFacts: [...stations.positiveFacts, ...hubs.positiveFacts], neutralFacts: [...stations.neutralFacts, ...hubs.neutralFacts] };
}
