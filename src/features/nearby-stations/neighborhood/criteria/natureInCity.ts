import { canopyBonus, PARK_WALK_PENALTY } from "../../../../../shared/natureInCityRules";
import type { VerdictGreenery } from "../../../../../shared/natureInCity";
import type { NeighborhoodCategoryResult, NeighborhoodFact } from "../contracts";
import { makeFact, withFacts } from "../facts";
import { clamp } from "../primitives";
import { makeCanopyFact } from "./cityGreenDensity";
import { NATURE_LEISURE_SCORE_RULES } from "./greenSpaceFactRules";

export function addAddressGreenery(category: NeighborhoodCategoryResult, data: VerdictGreenery | undefined): NeighborhoodCategoryResult {
  if (!data) return category;
  const address = data.address ? makeCanopyFact(data.address, false) : unmeasuredCanopy();
  const bonus = data.address ? canopyBonus(data.address.percentage) : 0;
  const penalty = data.parkAccess === "beyond" ? PARK_WALK_PENALTY : 0;
  const park = data.parkAccess && data.parkAccess !== "within" ? parkFact(penalty < 0) : undefined;
  const score = category.score ?? (bonus || penalty ? NATURE_LEISURE_SCORE_RULES.base : undefined);
  const finalScore = score === undefined ? undefined : clamp(score + bonus + penalty);
  const cap = finalScore !== undefined && score !== undefined ? finalScore - score - bonus - penalty : 0;
  return withFacts({
    ...category,
    available: category.available || finalScore !== undefined,
    score: finalScore,
    positiveFacts: address.polarity === "positive" ? [address, ...category.positiveFacts] : category.positiveFacts,
    negativeFacts: park?.polarity === "negative" ? [park, ...category.negativeFacts] : category.negativeFacts,
    neutralFacts: [
      ...(address.polarity === "neutral" ? [address] : []),
      ...(park?.polarity === "neutral" ? [park] : []),
      ...category.neutralFacts,
    ],
    scoreDetails: finalScore === undefined || (!bonus && !penalty) ? category.scoreDetails : [
      ...(category.scoreDetails ?? []),
      { labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.natureInCity", method: "sum", score: finalScore, rows: [
        { labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.beforeGreenery", points: score },
        ...(bonus ? [{ labelKey: "nearbyStations.neighborhoodScore.datasets.ign-nature-en-ville" as const, points: bonus }] : []),
        ...(penalty ? [{ labelKey: "nearbyStations.neighborhoodScore.facts.parkWalkingAccess.label" as const, points: penalty }] : []),
        ...(cap ? [{ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.cap" as const, points: cap }] : []),
      ] },
    ],
  });
}

function unmeasuredCanopy(): NeighborhoodFact {
  const fact = makeFact({
    id: "address-canopy-unavailable",
    kind: "addressCanopy",
    category: "nature-leisure",
    polarity: "neutral",
    family: "addressCanopy",
    priority: 15,
    values: {},
    sourceKey: "nearbyStations.neighborhoodScore.datasets.ign-nature-en-ville",
    proof: "derived",
    ruleKey: "nearbyStations.neighborhoodScore.rules.addressCanopy",
    ruleValues: {},
  });
  const key = "nearbyStations.neighborhoodScore.canopyLevels.addressUnavailable";
  return { ...fact, labelKey: key, tooltipKey: key };
}

function parkFact(negative: boolean): NeighborhoodFact {
  const fact = makeFact({
    id: "park-walking-access",
    kind: "parkWalkingAccess",
    category: "nature-leisure",
    polarity: negative ? "negative" : "neutral",
    family: "park-walking-access",
    priority: 11,
    values: {},
    sourceKey: "nearbyStations.neighborhoodScore.datasets.ipr-public-parks",
    proof: "derived",
    ruleKey: "nearbyStations.neighborhoodScore.rules.parkWalkingAccess",
    ruleValues: {},
  });
  return negative ? fact : { ...fact, labelKey: "nearbyStations.neighborhoodScore.canopyLevels.parkUnknown" };
}
