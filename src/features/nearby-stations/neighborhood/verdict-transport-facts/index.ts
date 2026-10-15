import type { NeighborhoodCategoryResult, NeighborhoodScoreInput } from "../contracts";
import { category, withFacts } from "../facts";
import { buildTransportFactsContext } from "./context";
import { calculateTransportScore } from "./scoring";
import { buildLineRegularityFacts } from "./lineRegularity";
import { buildHeavyTransportFacts } from "./heavyTransports";
import { buildTransportDiversityFacts } from "./transportDiversity";
import { buildGpeExpressFacts } from "./gpeExpress";
import { buildJourneyBenchmarkFacts } from "./benchmarks";
import { buildNoctilienFacts } from "./noctilien";
import { buildChateletFacts } from "./chatelet";
import { buildFrequencyFacts } from "./frequencies";
import { buildLastServiceFacts } from "./lastServices";
import { createTransportFactCollection } from "./types";

export function buildTransportCategory(input: NeighborhoodScoreInput): NeighborhoodCategoryResult {
  const base = category("transport");
  if (!input.stationsLoaded) return { ...base, available: false, unavailableReasonKey: "nearbyStations.neighborhoodScore.unavailable.transport", positiveFacts: [], negativeFacts: [] };
  const context = buildTransportFactsContext(input);
  const score = calculateTransportScore(context);
  const facts = createTransportFactCollection();
  const regularity = buildLineRegularityFacts(context);
  facts.positiveFacts.push(...regularity.positiveFacts);
  facts.negativeFacts.push(...regularity.negativeFacts);
  facts.neutralFacts.push(...regularity.neutralFacts);
  for (const fact of buildHeavyTransportFacts(context)) {
    (fact.polarity === "neutral" ? facts.neutralFacts : facts.positiveFacts).push(fact);
  }
  const diversity = buildTransportDiversityFacts(context);
  facts.positiveFacts.push(...diversity.positiveFacts);
  facts.negativeFacts.push(...diversity.negativeFacts);
  for (const fact of buildGpeExpressFacts(context)) {
    (fact.polarity === "neutral" ? facts.neutralFacts : facts.positiveFacts).push(fact);
  }
  const benchmarks = buildJourneyBenchmarkFacts(input);
  facts.positiveFacts.push(...benchmarks.positiveFacts);
  facts.neutralFacts.push(...benchmarks.neutralFacts);
  facts.positiveFacts.push(...buildNoctilienFacts(input.noctilienJourneys, input.noctilienDepartureTime));
  for (const family of [buildChateletFacts(context), buildFrequencyFacts(context), buildLastServiceFacts(input)]) {
    facts.positiveFacts.push(...family.positiveFacts);
    facts.negativeFacts.push(...family.negativeFacts);
    facts.neutralFacts.push(...family.neutralFacts);
  }
  return withFacts({ ...base, available: true, score, ...facts });
}
