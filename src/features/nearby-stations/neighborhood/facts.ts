import type { TranslationKey, TranslationParams } from "../../../i18n";
import type { PublicVerdictEvidence, PublicVerdictSource } from "../neighborhoodVerdictApi";
import type { NeighborhoodCategoryId, NeighborhoodCategoryResult, NeighborhoodFact, NeighborhoodFactAction, NeighborhoodFactKind, NeighborhoodFactPlace, NeighborhoodFactPolarity, NeighborhoodFactProof, NeighborhoodFactTransportReliabilityLine, NeighborhoodFactTravel } from "./contracts";
import { NEIGHBORHOOD_CATEGORY_WEIGHTS } from "./contracts";
import { CATEGORY_KEYS, FACT_KEYS } from "./i18nKeys";
import { getNeighborhoodScoreDisplay } from "./primitives";

const gtfsTooltipKeys: Partial<Record<NeighborhoodFactKind, TranslationKey>> = {
  transportHub: "nearbyStations.neighborhoodScore.gtfsFacts.transportHub",
  majorStationUnder40: "nearbyStations.neighborhoodScore.gtfsFacts.majorStation",
  noctilienAtNight: "nearbyStations.neighborhoodScore.gtfsFacts.noctilien",
  greenSpaceTransitNearby: "nearbyStations.neighborhoodScore.gtfsFacts.greenSpace",
  hospitalNearby: "nearbyStations.neighborhoodScore.gtfsFacts.hospital",
};
const gtfsRuleKeys: Partial<Record<TranslationKey, TranslationKey>> = {
  "nearbyStations.neighborhoodScore.rules.transportHub": "nearbyStations.neighborhoodScore.gtfsRules.transportHub",
  "nearbyStations.neighborhoodScore.rules.majorStationUnder40": "nearbyStations.neighborhoodScore.gtfsRules.majorStation",
  "nearbyStations.neighborhoodScore.rules.noctilienAtNight": "nearbyStations.neighborhoodScore.gtfsRules.noctilien",
  "nearbyStations.neighborhoodScore.rules.greenSpaceTransit": "nearbyStations.neighborhoodScore.gtfsRules.greenSpace",
  "nearbyStations.neighborhoodScore.rules.hospitalPresence": "nearbyStations.neighborhoodScore.gtfsRules.hospital",
};

export function externalFact(fact: PublicVerdictEvidence, sources: PublicVerdictSource[]): NeighborhoodFact {
  const source = sources.find((candidate) => fact.sourceIds.includes(candidate.id));
  return {
    id: `backend:${fact.id}`, kind: "external", category: fact.category, polarity: fact.polarity,
    family: fact.family, priority: fact.priority, label: fact.label, tooltip: fact.explanation,
    evidence: { proof: fact.proof, observedAt: Date.parse(fact.observedAt), rule: fact.rule, referencePeriod: fact.referencePeriod, value: fact.value, unit: fact.unit, geography: fact.geography, sourceName: source?.title ?? fact.sourceIds.join(", "), sourceUrl: source?.pageUrl, licence: source?.licence.label },
  };
}

export function category(id: NeighborhoodCategoryId): Pick<NeighborhoodCategoryResult, "id" | "labelKey" | "weight" | "neutralFacts"> & {
  positiveFacts: NeighborhoodFact[];
  negativeFacts: NeighborhoodFact[];
} {
  return {
    id,
    labelKey: CATEGORY_KEYS[id],
    weight: NEIGHBORHOOD_CATEGORY_WEIGHTS[id],
    positiveFacts: [],
    negativeFacts: [],
    neutralFacts: [],
  };
}

export function withFacts(
  value: NeighborhoodCategoryResult & { score?: number },
): NeighborhoodCategoryResult {
  if (value.score === undefined) return value;
  return {
    ...value,
    displayScore: getNeighborhoodScoreDisplay(value.score),
    positiveFacts: sortFacts(value.positiveFacts),
    negativeFacts: sortFacts(value.negativeFacts),
    neutralFacts: sortFacts(value.neutralFacts),
  };
}

function sortFacts(facts: readonly NeighborhoodFact[]): NeighborhoodFact[] {
  return [...facts].sort(compareFacts);
}

export function compareFacts(left: NeighborhoodFact, right: NeighborhoodFact): number {
  return Number(hasExceptionalFactMarker(right)) - Number(hasExceptionalFactMarker(left))
    || right.priority - left.priority
    || left.id.localeCompare(right.id);
}

export function hasExceptionalFactMarker(fact: Pick<NeighborhoodFact, "emphasis" | "markerEmphasis">): boolean {
  const markerEmphasis = fact.markerEmphasis
    ?? (fact.emphasis === "exceptional" ? "exceptional" : "standard");
  return markerEmphasis === "exceptional";
}

export function makeFact(options: {
  id: string;
  kind: NeighborhoodFactKind;
  category: NeighborhoodCategoryId;
  polarity: NeighborhoodFactPolarity;
  family: string;
  priority: number;
  values: TranslationParams;
  sourceKey: TranslationKey;
  proof: NeighborhoodFactProof;
  ruleKey: TranslationKey;
  ruleValues: TranslationParams;
  action?: NeighborhoodFactAction;
  emphasis?: "exceptional";
  markerEmphasis?: "standard" | "exceptional";
  travel?: NeighborhoodFactTravel;
  places?: readonly NeighborhoodFactPlace[];
  transportReliabilityLines?: readonly NeighborhoodFactTransportReliabilityLine[];
}): NeighborhoodFact {
  const keys = FACT_KEYS[options.kind];
  const theoretical = options.travel?.journey.source === "gtfs";
  return {
    id: options.id,
    kind: options.kind,
    category: options.category,
    polarity: options.polarity,
    family: options.family,
    priority: options.priority,
    emphasis: options.emphasis,
    markerEmphasis: options.markerEmphasis,
    labelKey: keys.label,
    labelValues: options.values,
    tooltipKey: theoretical ? gtfsTooltipKeys[options.kind] ?? keys.tooltip : keys.tooltip,
    tooltipValues: options.values,
    action: options.action,
    travel: options.travel,
    places: options.places,
    transportReliabilityLines: options.transportReliabilityLines,
    evidence: {
      sourceKey: options.sourceKey,
      proof: options.travel?.journey.sections.some(section => section.timingSource === "estimated") ? "derived" : options.proof,
      ruleKey: theoretical ? gtfsRuleKeys[options.ruleKey] ?? options.ruleKey : options.ruleKey,
      ruleValues: options.ruleValues,
      observedAt: Date.now(),
    },
  };
}

export function selectFacts(
  facts: readonly NeighborhoodFact[],
  polarity: NeighborhoodFactPolarity,
  limit: number,
): NeighborhoodFact[] {
  const families = new Set<string>();
  return [...facts]
    .filter((fact) => fact.polarity === polarity)
    .sort(compareFacts)
    .filter((fact) => {
      if (families.has(fact.family)) return false;
      families.add(fact.family);
      return true;
    })
    .slice(0, limit);
}
