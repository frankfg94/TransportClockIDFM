import type { NeighborhoodScoreInput } from "../contracts";
import { makeFact } from "../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../i18nKeys";
import type { TransportFactsContext } from "./context";
import { createTransportFactCollection } from "./types";
import { EARLY_LAST_SERVICE_CUTOFF_SECONDS, HEAVY_SCORE_MODES } from "../contracts";
import { findLineById, formatServiceTime } from "../journeys";
import { formatTransportLineName } from "./heavyTransports";

export function buildLastServiceFacts(input: NeighborhoodScoreInput) {
  const { positiveFacts, negativeFacts, neutralFacts } = createTransportFactCollection();
  for (const [lineId, lastService] of input.lastServiceByLine ?? []) {
    if (!lastService || lastService.seconds >= EARLY_LAST_SERVICE_CUTOFF_SECONDS) continue;
    const line = findLineById(input, lineId);
    if (!line || !HEAVY_SCORE_MODES.has(line.mode)) continue;
    negativeFacts.push(makeFact({
      id: `last-service-early:${lineId}`,
      kind: "lastServiceEarly",
      category: "transport",
      polarity: "negative",
      family: `last-service:${lineId}`,
      priority: 8,
      values: { line: formatTransportLineName(line), time: formatServiceTime(lastService.seconds) },
      sourceKey: SOURCE_KEYS.frequency,
      proof: "direct",
      ruleKey: RULE_KEYS.lastService,
      ruleValues: { threshold: "21:00" },
    }));
  }

  return { positiveFacts, negativeFacts, neutralFacts };
}
