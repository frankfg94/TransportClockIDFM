import { analyzeNearbyJourneyTiming } from "../../../nearbyJourneyTiming";
import type { NeighborhoodFact, NeighborhoodScoreInput } from "../../contracts";
import { makeFact } from "../../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../../i18nKeys";
import { chooseFastestJourney, summarizeJourney } from "../../journeys";
import { JOURNEY_REFERENCE_BENCHMARKS } from "./majorStationBenchmarks";

export function buildJourneyBenchmarkFacts(input: NeighborhoodScoreInput): {
  positiveFacts: NeighborhoodFact[];
  neutralFacts: NeighborhoodFact[];
} {
  const positiveFacts: NeighborhoodFact[] = [];
  const neutralFacts: NeighborhoodFact[] = [];
  const providedBenchmarks = input.journeyBenchmarks;
  const benchmarksById = new Map((providedBenchmarks ?? []).map((benchmark) => [benchmark.id, benchmark]));
  const canReportUnavailable = input.stationsLoaded && input.journeyBenchmarksLoading === false;
  const benchmarks = providedBenchmarks === undefined
    ? []
    : JOURNEY_REFERENCE_BENCHMARKS.map((station) => benchmarksById.get(station.id) ?? (canReportUnavailable
      ? { id: station.id, label: station.label, journeys: [], status: "unavailable" as const }
      : undefined)).filter((benchmark): benchmark is NonNullable<typeof benchmark> => benchmark !== undefined);
  for (const benchmark of benchmarks) {
    if (benchmark.id === "chatelet") continue;
    const employment = JOURNEY_REFERENCE_BENCHMARKS.find(reference => reference.id === benchmark.id)?.employment === true;
    const family = `${employment ? "employment-hub" : "major-station"}:${benchmark.id}`;
    const journey = chooseFastestJourney(benchmark.journeys);
    if (!journey) {
      if (benchmark.status === "unavailable" || (benchmark.status === "loading" && canReportUnavailable)) {
        neutralFacts.push(makeFact({
          id: employment ? family : `major-station-${benchmark.id}`,
          kind: employment ? "employmentHubUnavailable" : "majorStationUnavailable",
          category: "transport",
          polarity: "neutral",
          family,
          priority: 9,
          values: { destination: benchmark.label },
          sourceKey: SOURCE_KEYS.journeys,
          proof: "direct",
          ruleKey: employment ? RULE_KEYS.employmentHubContext : RULE_KEYS.majorStationUnavailable,
          ruleValues: {},
        }));
      }
      continue;
    }
    const summary = summarizeJourney(journey);
    const timing = analyzeNearbyJourneyTiming(journey);
    const isPositive = !employment && timing.scoreSeconds < 40 * 60;
    const fact = makeFact({
      id: employment ? family : `major-station-${benchmark.id}`,
      kind: employment ? "employmentHubContext" : isPositive ? "majorStationUnder40" : "majorStationContext",
      category: "transport",
      polarity: isPositive ? "positive" : "neutral",
      family,
      priority: 9,
      values: {
        destination: benchmark.label,
        station: benchmark.stationLabel ?? benchmark.label,
        duration: summary.durationMinutes,
        elapsed: summary.elapsedMinutes,
        walking: summary.walkingMinutes,
        transfers: summary.transfers,
        lines: summary.lines,
        initialWait: Math.round(timing.initialWaitSeconds / 60),
      },
      sourceKey: SOURCE_KEYS.journeys,
      proof: "direct",
      ruleKey: employment ? RULE_KEYS.employmentHubContext : isPositive ? RULE_KEYS.majorStationUnder40 : RULE_KEYS.majorStationContext,
      ruleValues: { threshold: 40 },
      emphasis: !employment && summary.durationMinutes <= 20 ? "exceptional" : undefined,
      travel: { journey },
    });
    if (isPositive) positiveFacts.push(fact);
    else neutralFacts.push(fact);
  }
  return { positiveFacts, neutralFacts };
}
