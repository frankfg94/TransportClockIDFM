import type { NeighborhoodCategoryResult, NeighborhoodScoreInput } from "../contracts";
import { category, withFacts } from "../facts";
import { buildTransportFactsContext } from "./context";
import { calculateTransportScoreDetails } from "./scoring";
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
import { personalJourneyFact, personalJourneyScoreDetails } from "../personalJourneys";

export function buildTransportCategory(input: NeighborhoodScoreInput): NeighborhoodCategoryResult {
  const base = category("transport");
  if (!input.stationsLoaded) {
    const personalFacts = (input.personalJourneys ?? []).filter(row => row.status !== "loading").map(personalJourneyFact);
    const personal = personalJourneyScoreDetails(undefined, input.personalJourneys ?? []);
    const score = personal.score;
    return withFacts({ ...base, available: score !== undefined, score, scoreDetails: personal.group ? [personal.group] : undefined,
      unavailableReasonKey: "nearbyStations.neighborhoodScore.unavailable.transport",
      positiveFacts: personalFacts.filter(fact => fact.polarity === "positive"),
      negativeFacts: personalFacts.filter(fact => fact.polarity === "negative"),
      neutralFacts: personalFacts.filter(fact => fact.polarity === "neutral"),
    });
  }
  const context = buildTransportFactsContext(input);
  const transport = calculateTransportScoreDetails(context);
  const personal = personalJourneyScoreDetails(transport.score, input.personalJourneys ?? []);
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
  for (const row of input.personalJourneys ?? []) {
    if (row.status === "loading") continue;
    const fact = personalJourneyFact(row);
    (fact.polarity === "positive" ? facts.positiveFacts : fact.polarity === "negative" ? facts.negativeFacts : facts.neutralFacts).push(fact);
  }
  return withFacts({ ...base, available: true, score: personal.score, scoreDetails: [transport.group, ...(personal.group ? [personal.group] : [])], ...facts });
}
