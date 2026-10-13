import { makeFact } from "../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../i18nKeys";
import type { TransportFactsContext } from "./context";
import { createTransportFactCollection } from "./types";
import { getNeighborhoodFrequencyLowThreshold, NEIGHBORHOOD_FREQUENCY_CONTEXT_MAX_SECONDS } from "../contracts";
import { NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS } from "./heavyTransports";

export function buildFrequencyFacts(context: TransportFactsContext) {
  const { positiveFacts, negativeFacts, neutralFacts } = createTransportFactCollection();
  const { readyFrequencies } = context;
  for (const entry of readyFrequencies) {
    const peakMinutes = entry.minutes;
    const minutes = Math.round(peakMinutes * 10) / 10;
    const values = { minutes, transport: entry.label, lines: entry.label };
    if (entry.accessSeconds > NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS) {
      neutralFacts.push(makeFact({
        id: `frequency-context:${entry.lineId}`,
        kind: "frequencyRemote",
        category: "transport",
        polarity: "neutral",
        family: `frequency:${entry.lineId}`,
        priority: 4,
        values,
        sourceKey: SOURCE_KEYS.frequency,
        proof: "direct",
        ruleKey: RULE_KEYS.frequencyContext,
        ruleValues: {
          threshold: NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS / 60,
          maximum: NEIGHBORHOOD_FREQUENCY_CONTEXT_MAX_SECONDS / 60,
        },
      }));
    } else if (peakMinutes <= 5) {
      positiveFacts.push(makeFact({
        id: `frequency-high:${entry.lineId}`,
        kind: "frequencyVeryGood",
        category: "transport",
        polarity: "positive",
        family: `frequency:${entry.lineId}`,
        priority: 7,
        values,
        sourceKey: SOURCE_KEYS.frequency,
        proof: "direct",
        ruleKey: RULE_KEYS.frequencyHigh,
        ruleValues: { threshold: 5 },
      }));
    } else if (
      entry.mode === "TRANSILIEN"
        ? peakMinutes > getNeighborhoodFrequencyLowThreshold(entry.mode)
        : peakMinutes >= getNeighborhoodFrequencyLowThreshold(entry.mode)
    ) {
      const threshold = getNeighborhoodFrequencyLowThreshold(entry.mode);
      negativeFacts.push(makeFact({
        id: `frequency-low:${entry.lineId}`,
        kind: "frequencyLow",
        category: "transport",
        polarity: "negative",
        family: `frequency:${entry.lineId}`,
        priority: 6,
        values,
        sourceKey: SOURCE_KEYS.frequency,
        proof: "direct",
        ruleKey: entry.mode === "TRANSILIEN"
          ? RULE_KEYS.frequencyLowTransilien
          : RULE_KEYS.frequencyLow,
        ruleValues: { threshold },
      }));
    } else {
      neutralFacts.push(makeFact({
        id: `frequency-context:${entry.lineId}`,
        kind: "frequencyContext",
        category: "transport",
        polarity: "neutral",
        family: `frequency:${entry.lineId}`,
        priority: 5,
        values,
        sourceKey: SOURCE_KEYS.frequency,
        proof: "direct",
        ruleKey: RULE_KEYS.frequencyReference,
        ruleValues: {},
      }));
    }
  }

  return { positiveFacts, negativeFacts, neutralFacts };
}
