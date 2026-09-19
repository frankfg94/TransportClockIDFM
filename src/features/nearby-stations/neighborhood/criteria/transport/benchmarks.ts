import { analyzeNearbyJourneyTiming } from "../../../nearbyJourneyTiming";
import type { NeighborhoodFact, NeighborhoodScoreInput } from "../../contracts";
import { makeFact } from "../../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../../i18nKeys";
import { chooseFastestJourney, summarizeJourney } from "../../journeys";

export function buildJourneyBenchmarkFacts(input: NeighborhoodScoreInput): {
  positiveFacts: NeighborhoodFact[];
  negativeFacts: NeighborhoodFact[];
} {
  const positiveFacts: NeighborhoodFact[] = [];
  const negativeFacts: NeighborhoodFact[] = [];
  const benchmarks = input.journeyBenchmarks ?? [];
  for (const benchmark of benchmarks) {
    if (benchmark.id === "chatelet") continue;
    const journey = chooseFastestJourney(benchmark.journeys);
    if (!journey) continue;
    const summary = summarizeJourney(journey);
    const timing = analyzeNearbyJourneyTiming(journey);
    if (timing.scoreSeconds >= 40 * 60) continue;
    positiveFacts.push(makeFact({
      id: `major-station-${benchmark.id}`,
      kind: "majorStationUnder40",
      category: "transport",
      polarity: "positive",
      family: `major-station:${benchmark.id}`,
      priority: 9,
      values: {
        destination: benchmark.label,
        duration: summary.durationMinutes,
        elapsed: summary.elapsedMinutes,
        walking: summary.walkingMinutes,
        transfers: summary.transfers,
        lines: summary.lines,
        initialWait: Math.round(timing.initialWaitSeconds / 60),
      },
      sourceKey: SOURCE_KEYS.journeys,
      proof: "direct",
      ruleKey: RULE_KEYS.majorStationUnder40,
      ruleValues: { threshold: 40 },
      emphasis: summary.durationMinutes <= 20 ? "exceptional" : undefined,
      travel: { journey },
    }));
  }
  return { positiveFacts, negativeFacts };
}
