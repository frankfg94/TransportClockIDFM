import { canopyBonus, CANOPY_LABEL_THRESHOLDS } from "../../../../../shared/natureInCityRules";
import { NATURE_IN_CITY_URL, type CanopyMeasure } from "../../../../../shared/natureInCity";
import type { NeighborhoodCategoryResult, NeighborhoodFact } from "../contracts";
import { makeFact } from "../facts";

export function makeCanopyFact(measure: CanopyMeasure, city: boolean): NeighborhoodFact {
  const band = canopyBonus(measure.percentage);
  const kind = city ? "cityGreenDensity" : "addressCanopy";
  const fact = makeFact({
    id: kind,
    kind,
    category: "nature-leisure",
    polarity: band ? "positive" : "neutral",
    family: kind,
    priority: 16,
    values: { percent: Math.floor(measure.percentage * 10) / 10, period: measure.period },
    sourceKey: "nearbyStations.neighborhoodScore.datasets.ign-nature-en-ville",
    proof: "derived",
    ruleKey: city ? "nearbyStations.neighborhoodScore.rules.cityGreenDensity" : "nearbyStations.neighborhoodScore.rules.addressCanopy",
    ruleValues: {},
    emphasis: band === 3 ? "exceptional" : undefined,
    contributionWeight: city ? 0 : band,
    greenMap: measure.map,
  });
  const labelKey = city
    ? band === 3 ? "nearbyStations.neighborhoodScore.canopyLevels.cityExceptional"
      : band >= 1 ? "nearbyStations.neighborhoodScore.canopyLevels.cityGreen" : fact.labelKey
    : band === 3 ? "nearbyStations.neighborhoodScore.canopyLevels.addressExceptional"
      : band === 2 ? "nearbyStations.neighborhoodScore.canopyLevels.addressVeryGreen"
      : band === 1 ? "nearbyStations.neighborhoodScore.canopyLevels.addressGreen"
      : measure.percentage < CANOPY_LABEL_THRESHOLDS.mineralBelowPercent ? "nearbyStations.neighborhoodScore.canopyLevels.addressMineral"
      : measure.percentage < CANOPY_LABEL_THRESHOLDS.lowBelowPercent ? "nearbyStations.neighborhoodScore.canopyLevels.addressLow" : "nearbyStations.neighborhoodScore.canopyLevels.addressModerate";
  return { ...fact, labelKey, evidence: { ...fact.evidence, sourceUrl: NATURE_IN_CITY_URL, referencePeriod: measure.period } };
}

export function addCityGreenDensity(category: NeighborhoodCategoryResult, measure: CanopyMeasure | undefined): NeighborhoodCategoryResult {
  if (!measure) return category;
  const fact = makeCanopyFact(measure, true);
  return {
    ...category,
    available: true,
    positiveFacts: fact.polarity === "positive" ? [fact, ...category.positiveFacts] : category.positiveFacts,
    neutralFacts: fact.polarity === "neutral" ? [fact, ...category.neutralFacts] : category.neutralFacts,
  };
}
