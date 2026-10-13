import { chooseFastestJourney, summarizeJourney } from "../journeys";

import type { NeighborhoodScoreInput } from "../contracts";
import { makeFact } from "../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../i18nKeys";
import type { TransportFactsContext } from "./context";
import { createTransportFactCollection } from "./types";

export function buildChateletFacts(context: TransportFactsContext) {
  const { positiveFacts, negativeFacts, neutralFacts } = createTransportFactCollection();
  const { input, fastestJourney, journeySummary } = context;
  if (!journeySummary && input.chateletJourneyStatus !== "loading") {
    neutralFacts.push(makeFact({
      id: "chatelet-unavailable",
      kind: "chateletUnavailable",
      category: "transport",
      polarity: "neutral",
      family: "chatelet-access",
      priority: 10,
      values: {},
      sourceKey: SOURCE_KEYS.journeys,
      proof: "direct",
      ruleKey: RULE_KEYS.chateletUnavailable,
      ruleValues: {},
    }));
  }

  if (journeySummary) {
    const values = {
      duration: journeySummary.durationMinutes,
      elapsed: journeySummary.elapsedMinutes,
      initialWait: journeySummary.initialWaitMinutes,
      walking: journeySummary.walkingMinutes,
      transfers: journeySummary.transfers,
      lines: journeySummary.lines,
    };
    if (journeySummary.durationMinutes <= 30) {
      positiveFacts.push(makeFact({
        id: "chatelet-under-30",
        kind: "chateletUnder30",
        category: "transport",
        polarity: "positive",
        family: "chatelet-access",
        priority: 10,
        values,
        sourceKey: SOURCE_KEYS.journeys,
        proof: "direct",
        ruleKey: RULE_KEYS.chateletUnder30,
        ruleValues: { threshold: 30 },
        emphasis: journeySummary.durationMinutes <= 20 && journeySummary.transfers === 0 ? "exceptional" : undefined,
        travel: fastestJourney ? { journey: fastestJourney } : undefined,
      }));
    } else if (journeySummary.durationMinutes <= 45) {
      positiveFacts.push(makeFact({
        id: "chatelet-under-45",
        kind: "chateletUnder45",
        category: "transport",
        polarity: "positive",
        family: "chatelet-access",
        priority: 9,
        values,
        sourceKey: SOURCE_KEYS.journeys,
        proof: "direct",
        ruleKey: RULE_KEYS.chateletUnder45,
        ruleValues: { threshold: 45 },
        travel: fastestJourney ? { journey: fastestJourney } : undefined,
      }));
    } else if (journeySummary.durationMinutes >= 60) {
      negativeFacts.push(makeFact({
        id: "chatelet-over-60",
        kind: "chateletOver60",
        category: "transport",
        polarity: "negative",
        family: "chatelet-access",
        priority: 8,
        values,
        sourceKey: SOURCE_KEYS.journeys,
        proof: "direct",
        ruleKey: RULE_KEYS.chateletOver60,
        ruleValues: { threshold: 60 },
        travel: fastestJourney ? { journey: fastestJourney } : undefined,
      }));
    } else {
      neutralFacts.push(makeFact({
        id: "chatelet-context",
        kind: "chateletContext",
        category: "transport",
        polarity: "neutral",
        family: "chatelet-access",
        priority: 6,
        values,
        sourceKey: SOURCE_KEYS.journeys,
        proof: "direct",
        ruleKey: RULE_KEYS.chateletContext,
        ruleValues: { minimum: 45, maximum: 60 },
        travel: fastestJourney ? { journey: fastestJourney } : undefined,
      }));
    }
    if (journeySummary.transitSectionCount <= 1 && journeySummary.transfers === 0) {
      positiveFacts.push(makeFact({
        id: "chatelet-direct",
        kind: "chateletDirect",
        category: "transport",
        polarity: "positive",
        family: "chatelet-direct",
        priority: 8,
        values,
        sourceKey: SOURCE_KEYS.journeys,
        proof: "direct",
        ruleKey: RULE_KEYS.chateletDirect,
        ruleValues: { threshold: 0 },
        emphasis: journeySummary.durationMinutes <= 20 ? "exceptional" : undefined,
        travel: fastestJourney ? { journey: fastestJourney } : undefined,
      }));
    }
  }

  return { positiveFacts, negativeFacts, neutralFacts };
}

export function buildChateletContext(input: NeighborhoodScoreInput) {
  const fastestJourney = chooseFastestJourney(input.chateletJourneys);
  const journeySummary = fastestJourney ? summarizeJourney(fastestJourney) : undefined;
  return { fastestJourney, journeySummary };
}
