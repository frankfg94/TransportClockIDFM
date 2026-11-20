import type { TranslationKey } from "../../../i18n";
import type { PublicNeighborhoodVerdict } from "../neighborhoodVerdictApi";
import type { NeighborhoodCategoryId, NeighborhoodCategoryResult, NeighborhoodFact, NeighborhoodFactKind, NeighborhoodScoreBand, NeighborhoodScoreInput, NeighborhoodScoreResult, NeighborhoodScoreDetailGroup } from "./contracts";
import { buildDailyLifeCategory } from "./criteria/dailyLife";
import { buildEducationCategory } from "./criteria/education";
import { buildHealthCategory } from "./criteria/health";
import { buildNatureLeisureCategory } from "./criteria/natureLeisure";
import { buildTransportCategory } from "./verdict-transport-facts";
import { buildUnavailableCategory } from "./criteria/unavailable";
import { category, compareFacts, externalFact, selectFacts, withFacts } from "./facts";
import { clamp, getNeighborhoodScoreDisplay, weightedAverage } from "./primitives";
import { measureDevPerformance } from "../../../services/devPerformance";

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

export const NEIGHBORHOOD_CATEGORY_IDS: readonly NeighborhoodCategoryId[] = [
  "transport",
  "daily-life",
  "nature-leisure",
  "health",
  "education",
  "living-environment",
  "security",
];

type CategoryBuilder = (input: NeighborhoodScoreInput) => NeighborhoodCategoryResult;

const CATEGORY_BUILDERS: Readonly<Record<NeighborhoodCategoryId, CategoryBuilder>> = {
  transport: buildTransportCategory,
  "daily-life": buildDailyLifeCategory,
  "nature-leisure": buildNatureLeisureCategory,
  health: buildHealthCategory,
  education: buildEducationCategory,
  "living-environment": (input) => buildUnavailableCategory(
    "living-environment",
    "nearbyStations.neighborhoodScore.unavailable.livingEnvironment",
  ),
  security: (input) => buildUnavailableCategory(
    "security",
    "nearbyStations.neighborhoodScore.unavailable.security",
  ),
};

/**
 * Build only the local criteria that are dirty. The returned values are kept
 * before the backend merge so a later backend refresh cannot compound its
 * score/facts on top of an already merged category.
 */
export function buildNeighborhoodCategories(
  input: NeighborhoodScoreInput,
  previous?: ReadonlyMap<NeighborhoodCategoryId, NeighborhoodCategoryResult>,
  dirty?: ReadonlySet<NeighborhoodCategoryId>,
): NeighborhoodCategoryResult[] {
  return measureDevPerformance("nearby-neighborhood-criteria", () => NEIGHBORHOOD_CATEGORY_IDS.map((id) => {
    const cached = previous?.get(id);
    if (cached && dirty && !dirty.has(id)) return cached;
    return CATEGORY_BUILDERS[id](input);
  }));
}

export function buildNeighborhoodScore(input: NeighborhoodScoreInput): NeighborhoodScoreResult {
  return aggregateNeighborhoodScore(buildNeighborhoodCategories(input), input);
}

/**
 * Aggregate already-built criteria. This stays intentionally small: all
 * expensive domain work belongs to a criterion builder, while this function
 * only merges external facts and computes the weighted summary.
 */
export function aggregateNeighborhoodScore(
  localCategories: readonly NeighborhoodCategoryResult[],
  input: NeighborhoodScoreInput,
): NeighborhoodScoreResult {
  return measureDevPerformance("nearby-neighborhood-score-aggregation", () => aggregateNeighborhoodScoreInternal(localCategories, input));
}

function aggregateNeighborhoodScoreInternal(
  localCategories: readonly NeighborhoodCategoryResult[],
  input: NeighborhoodScoreInput,
): NeighborhoodScoreResult {
  const categories = mergeBackendVerdict([...localCategories], input.backendVerdict);
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
    Number.POSITIVE_INFINITY,
  );
  preserveChateletJourneyFact(selectedPositiveFacts, availableCategories.flatMap((category) => category.positiveFacts), "positive", 3);
  preserveJourneyBenchmarkFacts(selectedPositiveFacts, availableCategories.flatMap((category) => category.positiveFacts));
  const selectedNegativeFacts = selectFacts(
    availableCategories.flatMap((category) => category.negativeFacts),
    "negative",
    3,
  );
  preserveChateletJourneyFact(selectedNegativeFacts, availableCategories.flatMap((category) => category.negativeFacts), "negative", 3);
  preservePersonalJourneyFacts(selectedNegativeFacts, categories.flatMap(category => category.negativeFacts));
  const selectedNeutralFacts = selectFacts(
    categories.flatMap((category) => category.neutralFacts),
    "neutral",
    4,
  );
  preserveChateletJourneyFact(selectedNeutralFacts, categories.flatMap((category) => category.neutralFacts), "neutral", 4);
  preserveJourneyBenchmarkFacts(selectedNeutralFacts, categories.flatMap((category) => category.neutralFacts));

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

/** Keep the Châtelet route status visible in the page summary for every polarity. */
function preserveChateletJourneyFact(
  selected: NeighborhoodFact[],
  facts: readonly NeighborhoodFact[],
  polarity: NeighborhoodFact["polarity"],
  limit: number,
): void {
  const chatelet = facts.find((fact) => fact.family === "chatelet-access" && fact.polarity === polarity);
  if (!chatelet || selected.some((fact) => fact.family === "chatelet-access")) return;
  if (selected.length >= limit) selected.pop();
  selected.push(chatelet);
  selected.sort(compareFacts);
}

/** Keep each computed major-station time visible as other routes arrive. */
function preserveJourneyBenchmarkFacts(
  selected: NeighborhoodFact[],
  facts: readonly NeighborhoodFact[],
): void {
  preservePersonalJourneyFacts(selected, facts);
  for (const benchmark of facts.filter((fact) => fact.family.startsWith("major-station:") || fact.family.startsWith("employment-hub:") || fact.family.startsWith("transport-hub:") || fact.family.startsWith("transport-proximity:"))) {
    if (!selected.some((fact) => fact.id === benchmark.id)) selected.push(benchmark);
  }
  selected.sort(compareFacts);
}

function preservePersonalJourneyFacts(selected: NeighborhoodFact[], facts: readonly NeighborhoodFact[]): void {
  for (const fact of facts.filter(fact => fact.family.startsWith("personal-journey:"))) {
    if (!selected.some(candidate => candidate.id === fact.id)) selected.push(fact);
  }
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
    const negativeFacts = preserveSelectedFamilyFact(
      selectFacts([...local.negativeFacts, ...externalFacts], "negative", 2),
      [...local.negativeFacts, ...externalFacts],
      "negative",
      2,
    );
    preservePersonalJourneyFacts(negativeFacts, local.negativeFacts);
    const localMarketFacts = local.neutralFacts.filter(fact => fact.family === "food-market");
    const otherNeutralFacts = [...local.neutralFacts, ...externalFacts].filter(fact => fact.family !== "food-market");
    const neutralFacts = preserveSelectedFamilyFact(
      selectFacts(otherNeutralFacts, "neutral", 4),
      otherNeutralFacts,
      "neutral",
      4,
    );
    neutralFacts.push(...localMarketFacts);
    preserveJourneyBenchmarkFacts(neutralFacts, otherNeutralFacts);
    if (local.id === "transport" && external.scoreDelta !== undefined) {
      const score = local.score === undefined ? undefined : clamp(local.score + external.scoreDelta);
      const before = local.score;
      const rows = before === undefined ? [] : [
        { labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.local" as const, points: before },
        { labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.serverDelta" as const, points: external.scoreDelta },
        ...(score !== undefined && score !== before + external.scoreDelta ? [{ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.cap" as const, points: score - before - external.scoreDelta }] : []),
      ];
      return withFacts({ ...local, score, positiveFacts, negativeFacts, neutralFacts,
        scoreDetails: [...(local.scoreDetails ?? []), { labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.merge", method: "sum", rows, score }] });
    }
    if (external.score === undefined) return { ...local, positiveFacts, negativeFacts, neutralFacts };
    const score = local.available && local.score !== undefined ? weightedAverage([{ value: local.score, weight: 1 }, { value: external.score, weight: 1 }]) : external.score;
    const both = local.available && local.score !== undefined;
    const groups = [...(local.scoreDetails ?? []), ...serverScoreDetails(local.id, verdict), ...securityScoreDetails(local.id, verdict)];
    groups.push({ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.merge", method: "average", score, rows: [
      ...(both ? [{ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.local" as const, value: local.score!, weight: 0.5, points: local.score! * 0.5 }] : []),
      { labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.server" as const, value: external.score, weight: both ? 0.5 : 1, points: external.score * (both ? 0.5 : 1) },
    ] });
    return withFacts({ ...local, available: true, unavailableReasonKey: undefined, score, positiveFacts, negativeFacts, neutralFacts, scoreDetails: groups });
  });
}

/** Explain server measurements only when the public response contains the necessary evidence. */
function serverScoreDetails(id: NeighborhoodCategoryId, verdict: PublicNeighborhoodVerdict): NeighborhoodScoreDetailGroup[] {
  const external = verdict.categories.find(category => category.id === id && category.status === "available");
  if (!external || external.score === undefined) return [];
  const facts = [...external.positiveFacts, ...external.negativeFacts, ...(external.neutralFacts ?? [])];
  if (id === "nature-leisure") {
    const reference = facts.find(fact => fact.family === "managed-green-space-reference" && typeof fact.value === "number" && Number.isFinite(fact.value));
    return reference && typeof reference.value === "number" ? [{ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.server", method: "average", score: external.score, rows: [
      { labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.nearestGreen", measurement: reference.value, measurementUnit: "meters", value: external.score, weight: 1, points: external.score },
    ] }] : [];
  }
  if (id === "living-environment") {
    const air = facts.find(fact => fact.family === "air" && typeof fact.value === "number" && Number.isFinite(fact.value));
    const noise = facts.find(fact => fact.family === "noise" && typeof fact.value === "number" && Number.isFinite(fact.value));
    if (!air || typeof air.value !== "number" || !noise || typeof noise.value !== "number") return [];
    const mean = (air.value + noise.value) / 2;
    return [{ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.server", method: "average", score: external.score, rows: [
      { labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.air", value: air.value, weight: 0.5, points: air.value / 2 },
      { labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.noise", value: noise.value, weight: 0.5, points: noise.value / 2 },
      ...(Math.abs(mean - external.score) > 1e-9 ? [{ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.rounding" as const, points: external.score - mean }] : []),
    ] }];
  }
  return [];
}

const SECURITY_INDICATOR_LABELS: Readonly<Record<string, TranslationKey>> = {
  burglary: "nearbyStations.neighborhoodScore.scoreHelp.detail.burglary",
  "vehicle-theft": "nearbyStations.neighborhoodScore.scoreHelp.detail.vehicleTheft",
  damage: "nearbyStations.neighborhoodScore.scoreHelp.detail.damage",
  "physical-violence-outside-family": "nearbyStations.neighborhoodScore.scoreHelp.detail.physicalViolence",
  "violent-theft-without-weapon": "nearbyStations.neighborhoodScore.scoreHelp.detail.violentTheft",
  "nonviolent-theft": "nearbyStations.neighborhoodScore.scoreHelp.detail.nonviolentTheft",
};

/** Uses the artifact's own indicator weights and compiled score; no duplicated compiler constants. */
function securityScoreDetails(id: NeighborhoodCategoryId, verdict: PublicNeighborhoodVerdict): NeighborhoodScoreDetailGroup[] {
  const commune = verdict.security?.commune;
  if (id !== "security" || !commune || typeof commune !== "object" || !Array.isArray(commune.indicators)) return [];
  const indicators = commune.indicators.filter(item => Number.isFinite(item.weight) && item.weight > 0 && Number.isFinite(item.percentile));
  const total = indicators.reduce((sum, item) => sum + item.weight, 0);
  if (!total || !Number.isFinite(commune.localScore) || indicators.length !== commune.indicators.length || !Number.isFinite(commune.availableWeight) || Math.abs(total - commune.availableWeight) > 1e-6) return [];
  const rows = indicators.map(item => ({ labelKey: SECURITY_INDICATOR_LABELS[item.id] ?? "nearbyStations.neighborhoodScore.scoreHelp.detail.securityIndicator" as const,
    ...(SECURITY_INDICATOR_LABELS[item.id] ? {} : { label: item.label }), measurement: item.percentile * 100, measurementUnit: "percent" as const,
    value: 10 * (1 - item.percentile), weight: item.weight / total, points: 10 * (1 - item.percentile) * item.weight / total }));
  const sum = rows.reduce((result, row) => result + row.points, 0);
  const groups: NeighborhoodScoreDetailGroup[] = [{ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.securityLocal", method: "average", score: commune.localScore,
    rows: [...rows, ...(Math.abs(sum - commune.localScore) > 1e-9 ? [{ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.rounding" as const, points: commune.localScore - sum }] : [])] }];
  const trend = verdict.security?.trend;
  const external = verdict.categories.find(category => category.id === "security" && category.status === "available");
  if (external?.score !== undefined) {
    const adjustment = trend && typeof trend === "object" && Number.isFinite(trend.adjustment) ? trend.adjustment : 0;
    const raw = commune.localScore + adjustment;
    groups.push({ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.securityFinal", method: "sum", score: external.score, rows: [
      { labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.securityLocal", points: commune.localScore },
      { labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.securityTrend", ...(trend && typeof trend === "object" && Number.isFinite(trend.deltaPercent) ? { measurement: trend.deltaPercent, measurementUnit: "percent" as const } : { unavailable: true }), points: adjustment },
      ...(Math.abs(raw - external.score) > 1e-9 ? [{ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.cap" as const, points: external.score - raw }] : []),
    ] });
  }
  return groups;
}

/**
 * Local nature-leisure facts that must survive `mergePositiveFactsWithBackend`.
 * Preserve these local families when matching documentary facts are merged.
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
  const protectedLocalFacts = categoryId === "daily-life"
    ? localFacts.filter(fact => fact.family === "food-market")
    : categoryId === "nature-leisure"
    ? localFacts.filter((fact) => NATURE_LOCAL_PROTECTED_FACT_KINDS.has(fact.kind))
    : categoryId === "transport"
      ? localFacts.filter((fact) => fact.family === "chatelet-access" || fact.family.startsWith("major-station:"))
      : [];
  const protectedFamilies = new Set(protectedLocalFacts.map((fact) => fact.family));
  const selectableFacts = [...localFacts, ...externalFacts].filter(
    (fact) => !protectedFamilies.has(fact.family),
  );
  return [...protectedLocalFacts, ...selectFacts(selectableFacts, "positive", Number.POSITIVE_INFINITY)].sort(compareFacts);
}

function preserveSelectedFamilyFact(
  selected: NeighborhoodFact[],
  facts: readonly NeighborhoodFact[],
  polarity: NeighborhoodFact["polarity"],
  limit: number,
): NeighborhoodFact[] {
  const chatelet = facts.find((fact) => fact.family === "chatelet-access" && fact.polarity === polarity);
  if (chatelet && !selected.some((fact) => fact.family === "chatelet-access")) {
    if (selected.length >= limit) selected.pop();
    selected.push(chatelet);
  }
  return selected.sort(compareFacts);
}
