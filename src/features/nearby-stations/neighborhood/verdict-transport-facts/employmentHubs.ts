import { analyzeNearbyJourneyTiming } from "../../nearbyJourneyTiming";
import type { NeighborhoodFact } from "../contracts";
import { makeFact } from "../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../i18nKeys";
import { chooseFastestJourney, summarizeJourney } from "../journeys";
import { EMPLOYMENT_HUB_BENCHMARKS } from "./benchmarkDestinations";
import type { prepareJourneyBenchmarks } from "./benchmarkJourneys";

export function buildEmploymentHubFacts({ benchmarks, canReportUnavailable }: ReturnType<typeof prepareJourneyBenchmarks>) {
  const positiveFacts: NeighborhoodFact[] = [], neutralFacts: NeighborhoodFact[] = [];
  for (const benchmark of benchmarks) {
    if (!EMPLOYMENT_HUB_BENCHMARKS.some(reference => reference.id === benchmark.id)) continue;
    const family = `employment-hub:${benchmark.id}`;
    const journey = chooseFastestJourney(benchmark.journeys);
    if (!journey) {
      if (benchmark.status === "unavailable" || (benchmark.status === "loading" && canReportUnavailable)) {
        neutralFacts.push(makeFact({
          id: family,
          kind: "employmentHubUnavailable",
          category: "transport",
          polarity: "neutral",
          family,
          priority: 9,
          values: { destination: benchmark.label },
          sourceKey: SOURCE_KEYS.journeys,
          proof: "direct",
          ruleKey: RULE_KEYS.employmentHubContext,
          ruleValues: {},
        }));
      }
      continue;
    }
    const summary = summarizeJourney(journey);
    const timing = analyzeNearbyJourneyTiming(journey);
    const fact = makeFact({
      id: family,
      kind: "employmentHubContext",
      category: "transport",
      polarity: "neutral",
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
      ruleKey: RULE_KEYS.employmentHubContext,
      ruleValues: { threshold: 40 },
      emphasis: undefined,
      travel: { journey },
    });
    neutralFacts.push(fact);
  }
  return { positiveFacts, neutralFacts };
}
