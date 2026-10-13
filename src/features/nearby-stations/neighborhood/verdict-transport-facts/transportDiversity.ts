import { makeFact } from "../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../i18nKeys";
import type { TransportFactsContext } from "./context";
import { createTransportFactCollection } from "./types";

export function buildTransportDiversityFacts(context: TransportFactsContext) {
  const { positiveFacts, negativeFacts, neutralFacts } = createTransportFactCollection();
  const { input, structuralLineCount, accessibleModes, effectiveFutureProjects, linesByKey } = context;
  if (structuralLineCount >= 3) {
    positiveFacts.push(makeFact({
      id: "transport-offer",
      kind: "transportOffer",
      category: "transport",
      polarity: "positive",
      family: "transport-diversity",
      priority: 9,
      values: {
        lines: structuralLineCount,
        modes: [...new Set([
          ...accessibleModes,
          ...(effectiveFutureProjects.length > 0 ? ["GPE"] : []),
        ])].sort().join(", "),
      },
      sourceKey: SOURCE_KEYS.stations,
      proof: "direct",
      ruleKey: RULE_KEYS.transportDiversity,
      ruleValues: { threshold: 3 },
    }));
  } else if (linesByKey.size === 0 && !input.heavyCandidatesLoading) {
    negativeFacts.push(makeFact({
      id: "transport-limited",
      kind: "transportLimited",
      category: "transport",
      polarity: "negative",
      family: "transport-diversity",
      priority: 7,
      values: {},
      sourceKey: SOURCE_KEYS.stations,
      proof: "direct",
      ruleKey: RULE_KEYS.transportDiversity,
      ruleValues: { threshold: 1 },
    }));
  }

  return { positiveFacts, negativeFacts, neutralFacts };
}
