import type { PublicNeighborhoodVerdict } from "../neighborhoodVerdictApi";
import type { NeighborhoodCategoryId, NeighborhoodCategoryResult, NeighborhoodFact, NeighborhoodFactKind, NeighborhoodScoreBand, NeighborhoodScoreInput, NeighborhoodScoreResult } from "./contracts";
import { buildDailyLifeCategory } from "./criteria/dailyLife";
import { buildEducationCategory } from "./criteria/education";
import { buildHealthCategory } from "./criteria/health";
import { buildNatureLeisureCategory } from "./criteria/natureLeisure";
import { buildTransportCategory } from "./criteria/transport/index";
import { buildUnavailableCategory } from "./criteria/unavailable";
import { category, compareFacts, externalFact, selectFacts, withFacts } from "./facts";
import { clamp, getNeighborhoodScoreDisplay, weightedAverage } from "./primitives";

export function getNeighborhoodScoreBand(score: number | undefined): NeighborhoodScoreBand | undefined {
  if (score === undefined || !Number.isFinite(score)) return undefined;
  if (score >= 8.5) return "excellent";
  if (score >= 7) return "good";
  if (score >= 5) return "medium";
  if (score >= 3) return "weak";
  return "very-weak";
}

export const NEIGHBORHOOD_SCORE_BAND_COLORS: Readonly<Record<NeighborhoodScoreBand, string>> = {
  excellent: "#17864c",
  good: "#4f9f46",
  medium: "#c18b16",
  weak: "#d56a27",
  "very-weak": "#bd3428",
};

export function buildNeighborhoodScore(input: NeighborhoodScoreInput): NeighborhoodScoreResult {
  const categories = mergeBackendVerdict([
    buildTransportCategory(input),
    buildDailyLifeCategory(input),
    buildNatureLeisureCategory(input),
    buildHealthCategory(input),
    buildEducationCategory(input),
    buildUnavailableCategory("living-environment", "nearbyStations.neighborhoodScore.unavailable.livingEnvironment"),
    buildUnavailableCategory("security", "nearbyStations.neighborhoodScore.unavailable.security"),
  ], input.backendVerdict);
  const availableCategories = categories.filter(
    (category): category is NeighborhoodCategoryResult & { score: number } =>
      category.available && category.score !== undefined,
  );
  const score = availableCategories.length > 0
    ? weightedAverage(
      availableCategories.map((category) => ({ value: category.score, weight: category.weight })),
    )
    : undefined;
  const selectedPositiveFacts = selectFacts(
    availableCategories.flatMap((category) => category.positiveFacts),
    "positive",
    3,
  );
  const selectedNegativeFacts = selectFacts(
    availableCategories.flatMap((category) => category.negativeFacts),
    "negative",
    3,
  );
  const selectedNeutralFacts = selectFacts(
    categories.flatMap((category) => category.neutralFacts),
    "neutral",
    4,
  );

  return {
    score,
    displayScore: getNeighborhoodScoreDisplay(score),
    band: getNeighborhoodScoreBand(score),
    categories,
    positiveFacts: selectedPositiveFacts,
    negativeFacts: selectedNegativeFacts,
    neutralFacts: selectedNeutralFacts,
    availableCategoryCount: availableCategories.length,
    totalCategoryCount: categories.length,
    generatedAt: input.generatedAt ?? Date.now(),
    coverageRatio: availableCategories.reduce((sum, category) => sum + category.weight, 0),
    sources: input.backendVerdict?.sources ?? [],
    warnings: input.backendVerdict?.warnings ?? [],
  };
}

function mergeBackendVerdict(categories: NeighborhoodCategoryResult[], verdict: PublicNeighborhoodVerdict | undefined): NeighborhoodCategoryResult[] {
  if (!verdict) return categories;
  const byId = new Map(verdict.categories.map((category) => [category.id, category]));
  return categories.map((local) => {
    const external = byId.get(local.id);
    if (!external || external.status !== "available") return local;
    const externalFacts = [
      ...external.positiveFacts,
      ...external.negativeFacts,
      ...(external.neutralFacts ?? []),
    ].map((fact) => externalFact(fact, verdict.sources));
    const positiveFacts = mergePositiveFactsWithBackend(local.id, local.positiveFacts, externalFacts);
    const negativeFacts = selectFacts([...local.negativeFacts, ...externalFacts], "negative", 2);
    const neutralFacts = selectFacts([...local.neutralFacts, ...externalFacts], "neutral", 4);
    if (local.id === "transport" && external.scoreDelta !== undefined) {
      const score = local.score === undefined ? undefined : clamp(local.score + external.scoreDelta);
      return withFacts({ ...local, score, positiveFacts, negativeFacts, neutralFacts });
    }
    if (external.score === undefined) return { ...local, positiveFacts, negativeFacts, neutralFacts };
    const score = local.available && local.score !== undefined ? weightedAverage([{ value: local.score, weight: 1 }, { value: external.score, weight: 1 }]) : external.score;
    return withFacts({ ...local, available: true, unavailableReasonKey: undefined, score, positiveFacts, negativeFacts, neutralFacts });
  });
}

/**
 * Local nature-leisure facts that must survive `mergePositiveFactsWithBackend`.
 * That merge keeps only two positive facts, and a backend green space outranks
 * an ordinary local one, so any local nature advantage that has to stay visible
 * next to a documented park must be listed here.
 */
const NATURE_LOCAL_PROTECTED_FACT_KINDS: ReadonlySet<NeighborhoodFactKind> = new Set([
  "sportsFacilitiesNearby",
  "tennisCourtNearby",
  "tennisCourtsStack",
]);

function mergePositiveFactsWithBackend(
  categoryId: NeighborhoodCategoryId,
  localFacts: readonly NeighborhoodFact[],
  externalFacts: readonly NeighborhoodFact[],
): NeighborhoodFact[] {
  const protectedLocalFacts = categoryId === "nature-leisure"
    ? localFacts.filter((fact) => NATURE_LOCAL_PROTECTED_FACT_KINDS.has(fact.kind))
    : [];
  const protectedFamilies = new Set(protectedLocalFacts.map((fact) => fact.family));
  const selectableFacts = [...localFacts, ...externalFacts].filter(
    (fact) => !protectedFamilies.has(fact.family),
  );
  return [...protectedLocalFacts, ...selectFacts(selectableFacts, "positive", 2)].sort(compareFacts);
}
