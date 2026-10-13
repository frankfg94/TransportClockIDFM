import { analyzeNearbyJourneyTiming } from "../../nearbyJourneyTiming";
import type { NeighborhoodFact } from "../contracts";
import { makeFact } from "../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../i18nKeys";
import { chooseFastestJourney, summarizeJourney } from "../journeys";
import { MAJOR_STATION_BENCHMARKS } from "./benchmarkDestinations";
import type { prepareJourneyBenchmarks } from "./benchmarkJourneys";

export function buildLargeStationFacts({ benchmarks, canReportUnavailable }: ReturnType<typeof prepareJourneyBenchmarks>) {
  const positiveFacts: NeighborhoodFact[] = [], neutralFacts: NeighborhoodFact[] = [];
  for (const benchmark of benchmarks) {
    if (benchmark.id === "chatelet" || !MAJOR_STATION_BENCHMARKS.some(reference => reference.id === benchmark.id)) continue;
    const family = `major-station:${benchmark.id}`;
    const journey = chooseFastestJourney(benchmark.journeys);
    if (!journey) {
      if (benchmark.status === "unavailable" || (benchmark.status === "loading" && canReportUnavailable)) {
        neutralFacts.push(makeFact({
          id: `major-station-${benchmark.id}`,
          kind: "majorStationUnavailable",
          category: "transport",
          polarity: "neutral",
          family,
          priority: 9,
          values: { destination: benchmark.label },
          sourceKey: SOURCE_KEYS.journeys,
          proof: "direct",
          ruleKey: RULE_KEYS.majorStationUnavailable,
          ruleValues: {},
        }));
      }
      continue;
    }
    const summary = summarizeJourney(journey);
    const timing = analyzeNearbyJourneyTiming(journey);
    const isPositive = timing.scoreSeconds < 40 * 60;
    const fact = makeFact({
      id: `major-station-${benchmark.id}`,
      kind: isPositive ? "majorStationUnder40" : "majorStationContext",
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
      ruleKey: isPositive ? RULE_KEYS.majorStationUnder40 : RULE_KEYS.majorStationContext,
      ruleValues: { threshold: 40 },
      emphasis: summary.durationMinutes <= 20 ? "exceptional" : undefined,
      travel: { journey },
    });
    if (isPositive) positiveFacts.push(fact);
    else neutralFacts.push(fact);
  }
  return { positiveFacts, neutralFacts };
}
