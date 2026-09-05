import type { TranslationKey, TranslationParams } from "../../i18n";
import type { GtfsLineFrequencyResponse } from "../../types/lineFrequency";
import type { GlobalMapLine, GlobalMapMode } from "../transport-map/contracts/manifest";
import type {
  NearbyHeavyTransportCandidate,
  NearbyJourney,
} from "./nearbyHeavyTransports";
import {
  getNearbyHeavyAccessTravelSeconds,
} from "./nearbyHeavyTransports";
import { NEARBY_HEAVY_TOTAL_MAX_SECONDS } from "./nearbyHeavyTransportRules";
import {
  analyzeNearbyJourneyTiming,
  isNearbyJourneyTransitSection,
  isNearbyJourneyWalkingSection,
} from "./nearbyJourneyTiming";
import type { NearbyPlace } from "./nearbyPlaces";
import type { NearbyStationEntry } from "./nearbyStations";
import type {
  PublicNeighborhoodVerdict,
  PublicGreenSpaceAccess,
  PublicFutureGpeStation,
  PublicVerdictEvidence,
  PublicVerdictSource,
} from "./neighborhoodVerdictApi";

export const NEIGHBORHOOD_MAX_SCORE = 10;
export const NEIGHBORHOOD_WALKING_LIMIT_MINUTES = 15;
export const NEIGHBORHOOD_FREQUENCY_LINE_LIMIT = 4;

export const NEIGHBORHOOD_CATEGORY_WEIGHTS = {
  transport: 0.27,
  "daily-life": 0.225,
  "nature-leisure": 0.135,
  health: 0.135,
  education: 0.09,
  "living-environment": 0.045,
  security: 0.10,
} as const;

export type NeighborhoodCategoryId = keyof typeof NEIGHBORHOOD_CATEGORY_WEIGHTS;
export type NeighborhoodFactPolarity = "positive" | "negative" | "neutral";
export type NeighborhoodFactProof = "direct" | "derived";

export interface NeighborhoodFactGeography {
  level: "point" | "commune" | "department" | "region";
  code?: string;
  name?: string;
}

export type NeighborhoodFactKind =
  | "external"
  | "structuringTransportNearby"
  | "structuringTransportDistance"
  | "transportLineNearby"
  | "transportLineAtAddress"
  | "transportLineAtFoot"
  | "transportLineDistance"
  | "transportOffer"
  | "transportLimited"
  | "transportHub"
  | "majorStationUnder40"
  | "noctilienAtNight"
  | "greenSpaceTransitNearby"
  | "chateletUnder30"
  | "chateletUnder45"
  | "chateletDirect"
  | "chateletOver60"
  | "frequencyVeryGood"
  | "frequencyLow"
  | "supermarketNearby"
  | "supermarketNearbyApprox"
  | "supermarketsNearby"
  | "dailyStores"
  | "dailyStoresApprox"
  | "richCommercialStreet"
  | "richCommercialStreetApprox"
  | "restaurantsNearby"
  | "restaurantsNearbyApprox"
  | "leisurePlaceNearby"
  | "leisurePlaceNearbyApprox"
  | "pharmacyNearby"
  | "pharmacyNearbyApprox"
  | "noSupermarket"
  | "noPharmacy";

export interface NeighborhoodFactEvidence {
  sourceKey?: TranslationKey;
  sourceName?: string;
  sourceUrl?: string;
  licence?: string;
  proof: NeighborhoodFactProof;
  ruleKey?: TranslationKey;
  ruleValues?: TranslationParams;
  rule?: string;
  value?: number | string;
  unit?: string;
  geography?: NeighborhoodFactGeography;
  referencePeriod?: string;
  observedAt: number;
}

export interface NeighborhoodFact {
  id: string;
  kind: NeighborhoodFactKind;
  category: NeighborhoodCategoryId;
  polarity: NeighborhoodFactPolarity;
  /** Used to avoid repeating the same signal in a category summary. */
  family: string;
  priority: number;
  labelKey?: TranslationKey;
  labelValues?: TranslationParams;
  tooltipKey?: TranslationKey;
  tooltipValues?: TranslationParams;
  label?: string;
  tooltip?: string;
  evidence: NeighborhoodFactEvidence;
}

export interface NeighborhoodCategoryResult {
  id: NeighborhoodCategoryId;
  labelKey: TranslationKey;
  weight: number;
  available: boolean;
  score?: number;
  displayScore?: number;
  unavailableReasonKey?: TranslationKey;
  positiveFacts: NeighborhoodFact[];
  negativeFacts: NeighborhoodFact[];
  neutralFacts: NeighborhoodFact[];
}

export type NeighborhoodScoreBand = "excellent" | "good" | "medium" | "weak" | "very-weak";

export interface NeighborhoodScoreResult {
  score?: number;
  displayScore?: number;
  band?: NeighborhoodScoreBand;
  categories: NeighborhoodCategoryResult[];
  positiveFacts: NeighborhoodFact[];
  negativeFacts: NeighborhoodFact[];
  neutralFacts: NeighborhoodFact[];
  availableCategoryCount: number;
  totalCategoryCount: number;
  generatedAt: number;
  coverageRatio: number;
  sources: PublicVerdictSource[];
  warnings: string[];
}

export interface NeighborhoodWalkingMetrics {
  provider?: string;
  distanceMeters?: number;
  durationSeconds?: number;
  fallback?: boolean;
}

export interface NeighborhoodJourneyBenchmark {
  id: string;
  label: string;
  journeys: readonly NearbyJourney[];
}

export interface NeighborhoodGreenSpaceJourney {
  greenSpace: PublicGreenSpaceAccess;
  journeys: readonly NearbyJourney[];
}

export interface NeighborhoodScoreInput {
  places: readonly NearbyPlace[];
  placesLoaded: boolean;
  walkingRoutes?: Readonly<Record<string, NeighborhoodWalkingMetrics | undefined>>;
  stations: readonly NearbyStationEntry[];
  stationsLoaded: boolean;
  heavyCandidates?: readonly NearbyHeavyTransportCandidate[];
  heavyCandidatesLoading?: boolean;
  chateletJourneys?: readonly NearbyJourney[];
  journeyBenchmarks?: readonly NeighborhoodJourneyBenchmark[];
  greenSpaceJourneys?: readonly NeighborhoodGreenSpaceJourney[];
  noctilienJourneys?: readonly NearbyJourney[];
  frequencyProfiles?: ReadonlyMap<string, GtfsLineFrequencyResponse | undefined>;
  generatedAt?: number;
  backendVerdict?: PublicNeighborhoodVerdict;
}

const CATEGORY_KEYS: Record<NeighborhoodCategoryId, TranslationKey> = {
  transport: "nearbyStations.neighborhoodScore.categories.transport",
  "daily-life": "nearbyStations.neighborhoodScore.categories.dailyLife",
  "nature-leisure": "nearbyStations.neighborhoodScore.categories.natureLeisure",
  health: "nearbyStations.neighborhoodScore.categories.health",
  education: "nearbyStations.neighborhoodScore.categories.education",
  "living-environment": "nearbyStations.neighborhoodScore.categories.livingEnvironment",
  security: "nearbyStations.neighborhoodScore.categories.security",
};

const FACT_KEYS: Record<NeighborhoodFactKind, { label: TranslationKey; tooltip: TranslationKey }> = {
  external: {
    label: "nearbyStations.neighborhoodScore.external.label",
    tooltip: "nearbyStations.neighborhoodScore.external.tooltip",
  },
  structuringTransportNearby: {
    label: "nearbyStations.neighborhoodScore.facts.structuringTransportNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.structuringTransportNearby.tooltip",
  },
  structuringTransportDistance: {
    label: "nearbyStations.neighborhoodScore.facts.structuringTransportDistance.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.structuringTransportDistance.tooltip",
  },
  transportLineNearby: {
    label: "nearbyStations.neighborhoodScore.facts.transportLineNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.transportLineNearby.tooltip",
  },
  transportLineAtAddress: {
    label: "nearbyStations.neighborhoodScore.facts.transportLineAtAddress.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.transportLineAtAddress.tooltip",
  },
  transportLineAtFoot: {
    label: "nearbyStations.neighborhoodScore.facts.transportLineAtFoot.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.transportLineAtFoot.tooltip",
  },
  transportLineDistance: {
    label: "nearbyStations.neighborhoodScore.facts.transportLineDistance.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.transportLineDistance.tooltip",
  },
  transportOffer: {
    label: "nearbyStations.neighborhoodScore.facts.transportOffer.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.transportOffer.tooltip",
  },
  transportLimited: {
    label: "nearbyStations.neighborhoodScore.facts.transportLimited.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.transportLimited.tooltip",
  },
  transportHub: {
    label: "nearbyStations.neighborhoodScore.facts.transportHub.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.transportHub.tooltip",
  },
  majorStationUnder40: {
    label: "nearbyStations.neighborhoodScore.facts.majorStationUnder40.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.majorStationUnder40.tooltip",
  },
  noctilienAtNight: {
    label: "nearbyStations.neighborhoodScore.facts.noctilienAtNight.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.noctilienAtNight.tooltip",
  },
  greenSpaceTransitNearby: {
    label: "nearbyStations.neighborhoodScore.facts.greenSpaceTransitNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.greenSpaceTransitNearby.tooltip",
  },
  chateletUnder30: {
    label: "nearbyStations.neighborhoodScore.facts.chateletUnder30.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.chateletUnder30.tooltip",
  },
  chateletUnder45: {
    label: "nearbyStations.neighborhoodScore.facts.chateletUnder45.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.chateletUnder45.tooltip",
  },
  chateletDirect: {
    label: "nearbyStations.neighborhoodScore.facts.chateletDirect.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.chateletDirect.tooltip",
  },
  chateletOver60: {
    label: "nearbyStations.neighborhoodScore.facts.chateletOver60.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.chateletOver60.tooltip",
  },
  frequencyVeryGood: {
    label: "nearbyStations.neighborhoodScore.facts.frequencyVeryGood.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.frequencyVeryGood.tooltip",
  },
  frequencyLow: {
    label: "nearbyStations.neighborhoodScore.facts.frequencyLow.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.frequencyLow.tooltip",
  },
  supermarketNearby: {
    label: "nearbyStations.neighborhoodScore.facts.supermarketNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.supermarketNearby.tooltip",
  },
  supermarketNearbyApprox: {
    label: "nearbyStations.neighborhoodScore.facts.supermarketNearbyApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.supermarketNearbyApprox.tooltip",
  },
  supermarketsNearby: {
    label: "nearbyStations.neighborhoodScore.facts.supermarketsNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.supermarketsNearby.tooltip",
  },
  dailyStores: {
    label: "nearbyStations.neighborhoodScore.facts.dailyStores.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.dailyStores.tooltip",
  },
  dailyStoresApprox: {
    label: "nearbyStations.neighborhoodScore.facts.dailyStoresApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.dailyStoresApprox.tooltip",
  },
  richCommercialStreet: {
    label: "nearbyStations.neighborhoodScore.facts.richCommercialStreet.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.richCommercialStreet.tooltip",
  },
  richCommercialStreetApprox: {
    label: "nearbyStations.neighborhoodScore.facts.richCommercialStreetApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.richCommercialStreetApprox.tooltip",
  },
  restaurantsNearby: {
    label: "nearbyStations.neighborhoodScore.facts.restaurantsNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.restaurantsNearby.tooltip",
  },
  restaurantsNearbyApprox: {
    label: "nearbyStations.neighborhoodScore.facts.restaurantsNearbyApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.restaurantsNearbyApprox.tooltip",
  },
  leisurePlaceNearby: {
    label: "nearbyStations.neighborhoodScore.facts.leisurePlaceNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.leisurePlaceNearby.tooltip",
  },
  leisurePlaceNearbyApprox: {
    label: "nearbyStations.neighborhoodScore.facts.leisurePlaceNearbyApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.leisurePlaceNearbyApprox.tooltip",
  },
  pharmacyNearby: {
    label: "nearbyStations.neighborhoodScore.facts.pharmacyNearby.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.pharmacyNearby.tooltip",
  },
  pharmacyNearbyApprox: {
    label: "nearbyStations.neighborhoodScore.facts.pharmacyNearbyApprox.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.pharmacyNearbyApprox.tooltip",
  },
  noSupermarket: {
    label: "nearbyStations.neighborhoodScore.facts.noSupermarket.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.noSupermarket.tooltip",
  },
  noPharmacy: {
    label: "nearbyStations.neighborhoodScore.facts.noPharmacy.label",
    tooltip: "nearbyStations.neighborhoodScore.facts.noPharmacy.tooltip",
  },
};

const SOURCE_KEYS = {
  stations: "nearbyStations.neighborhoodScore.sources.stations",
  places: "nearbyStations.neighborhoodScore.sources.places",
  placesAndWalking: "nearbyStations.neighborhoodScore.sources.placesAndWalking",
  journeys: "nearbyStations.neighborhoodScore.sources.journeys",
  heavyRoutes: "nearbyStations.neighborhoodScore.sources.heavyRoutes",
  frequency: "nearbyStations.neighborhoodScore.sources.frequency",
} as const satisfies Record<string, TranslationKey>;

const RULE_KEYS = {
  transportProximity: "nearbyStations.neighborhoodScore.rules.transportProximity",
  transportDistance: "nearbyStations.neighborhoodScore.rules.transportDistance",
  transportDiversity: "nearbyStations.neighborhoodScore.rules.transportDiversity",
  transportHub: "nearbyStations.neighborhoodScore.rules.transportHub",
  chateletUnder30: "nearbyStations.neighborhoodScore.rules.chateletUnder30",
  chateletUnder45: "nearbyStations.neighborhoodScore.rules.chateletUnder45",
  chateletDirect: "nearbyStations.neighborhoodScore.rules.chateletDirect",
  chateletOver60: "nearbyStations.neighborhoodScore.rules.chateletOver60",
  majorStationUnder40: "nearbyStations.neighborhoodScore.rules.majorStationUnder40",
  noctilienAtNight: "nearbyStations.neighborhoodScore.rules.noctilienAtNight",
  frequencyHigh: "nearbyStations.neighborhoodScore.rules.frequencyHigh",
  frequencyLow: "nearbyStations.neighborhoodScore.rules.frequencyLow",
  placePresence: "nearbyStations.neighborhoodScore.rules.placePresence",
  placeSaturation: "nearbyStations.neighborhoodScore.rules.placeSaturation",
  commercialCluster: "nearbyStations.neighborhoodScore.rules.commercialCluster",
  pharmacyPresence: "nearbyStations.neighborhoodScore.rules.pharmacyPresence",
  leisurePresence: "nearbyStations.neighborhoodScore.rules.leisurePresence",
  greenSpaceTransit: "nearbyStations.neighborhoodScore.rules.greenSpaceTransit",
} as const satisfies Record<string, TranslationKey>;

const HEAVY_SCORE_MODES = new Set<GlobalMapMode>([
  "METRO",
  "RER",
  "TRAIN",
  "TRANSILIEN",
  "TRAM",
  "CABLE",
]);

const SUPERMARKET_KINDS = new Set(["supermarket", "hypermarket", "convenience", "grocery", "general"]);
const DAILY_STORE_KINDS = new Set([
  "supermarket",
  "hypermarket",
  "convenience",
  "bakery",
  "butcher",
  "greengrocer",
  "deli",
  "delicatessen",
  "caterer",
  "cheese",
  "cheesemonger",
  "marketplace",
  "organic",
  "farm",
  "seafood",
  "frozen_food",
  "kiosk",
]);
const RICH_COMMERCIAL_SPECIALTIES = [
  {
    id: "cheese",
    kinds: new Set(["cheese", "cheesemonger", "fromagerie"]),
    pattern: /(?:fromager(?:ie|ies)?|cheese(?:monger)?)/iu,
  },
  {
    id: "butcher",
    kinds: new Set(["butcher", "boucher", "charcuter", "charcuterie"]),
    pattern: /(?:boucher(?:ie|ies)?|charcut(?:erie|ier))/iu,
  },
  {
    id: "deli",
    kinds: new Set(["deli", "delicatessen", "caterer", "traiteur", "fine_food"]),
    pattern: /(?:traiteur|deli(?:catessen)?|caterer|epicerie\s+fine)/iu,
  },
  {
    id: "bakery",
    kinds: new Set(["bakery", "boulangerie", "bread", "patisserie", "pastry"]),
    pattern: /(?:boulanger(?:ie|ies)?|bakery|patisserie|pastry)/iu,
  },
] as const;
const RESTAURANT_KINDS = new Set([
  "restaurant",
  "cafe",
  "bar",
  "pub",
  "fast_food",
  "food_court",
  "ice_cream",
]);
const PHARMACY_KINDS = new Set(["pharmacy", "chemist", "medical_supply"]);

function clamp(value: number, minimum = 0, maximum = NEIGHBORHOOD_MAX_SCORE): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function saturatingNeighborhoodBonus(count: number, target: number, maximum: number): number {
  if (count <= 0 || target <= 0 || maximum <= 0) return 0;
  return maximum * Math.min(1, count / target);
}

export function getNeighborhoodScoreDisplay(score: number | undefined): number | undefined {
  return score === undefined || !Number.isFinite(score)
    ? undefined
    : Math.round(clamp(score));
}

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
    buildUnavailableCategory("education", "nearbyStations.neighborhoodScore.unavailable.education"),
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
    const positiveFacts = selectFacts([...local.positiveFacts, ...externalFacts], "positive", 2);
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

function externalFact(fact: PublicVerdictEvidence, sources: PublicVerdictSource[]): NeighborhoodFact {
  const source = sources.find((candidate) => fact.sourceIds.includes(candidate.id));
  return {
    id: `backend:${fact.id}`, kind: "external", category: fact.category, polarity: fact.polarity,
    family: fact.family, priority: fact.priority, label: fact.label, tooltip: fact.explanation,
    evidence: { proof: fact.proof, observedAt: Date.parse(fact.observedAt), rule: fact.rule, referencePeriod: fact.referencePeriod, value: fact.value, unit: fact.unit, geography: fact.geography, sourceName: source?.title ?? fact.sourceIds.join(", "), sourceUrl: source?.pageUrl, licence: source?.licence.label },
  };
}

function buildTransportCategory(input: NeighborhoodScoreInput): NeighborhoodCategoryResult {
  const base = category("transport");
  if (!input.stationsLoaded) {
    return {
      ...base,
      available: false,
      unavailableReasonKey: "nearbyStations.neighborhoodScore.unavailable.transport",
      positiveFacts: [],
      negativeFacts: [],
    };
  }

  const accessSignals = listTransportAccessSignals(input);
  const linesByKey = new Map<string, GlobalMapLine>();
  for (const entry of input.stations) {
    if (!entry.insideRadius) continue;
    for (const line of entry.lines) {
      if (!HEAVY_SCORE_MODES.has(line.mode)) continue;
      linesByKey.set(lineKey(line), line);
    }
  }
  for (const signal of accessSignals) {
    linesByKey.set(lineKey(signal.line), signal.line);
  }

  const accessibleSignals = accessSignals.filter((signal) => signal.travelSeconds <= NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS);
  const accessibleCurrentSignals = accessibleSignals.filter((signal) => !signal.futureProject);
  const accessibleLineKeys = new Set(accessibleCurrentSignals.map((signal) => lineKey(signal.line)));
  const accessibleModes = new Set(accessibleCurrentSignals.map((signal) => signal.line.mode));
  const futureProjects = input.backendVerdict?.futureProjects ?? [];
  // The verdict keeps nearby GPE stations with a real walking route even
  // when that walking leg exceeds 15 minutes. Such a station can still be a
  // valid future hub when it is co-located with an accessible current line.
  const routedFutureProjects = futureProjects.filter((project) =>
    Number.isFinite(project.walkingMinutes) && (project.walkingMinutes ?? Number.POSITIVE_INFINITY) >= 0);
  const accessibleFutureProjects = futureProjects.filter((project) =>
    Number.isFinite(project.walkingMinutes) && (project.walkingMinutes ?? Number.POSITIVE_INFINITY) <= 15);
  const resolverFutureProjects = accessibleSignals
    .filter((signal) => signal.source === "route" && signal.futureProject)
    .map((signal) => signal.futureProject!);
  const allRoutedFutureProjects = [...new Map([
    ...routedFutureProjects.map((project) => [project.id, project] as const),
    ...resolverFutureProjects.map((project) => [project.id, project] as const),
  ]).values()];
  const coLocatedFutureProjects = allRoutedFutureProjects.map((project) => ({
    project,
    currentLines: coLocatedCurrentLines(input, project, accessibleLineKeys),
  })).filter((candidate) => candidate.currentLines.length > 0);
  const effectiveFutureProjects = [...new Map([
    ...accessibleFutureProjects.map((project) => [project.id, project] as const),
    ...coLocatedFutureProjects.map(({ project }) => [project.id, project] as const),
  ]).values()];
  const futureLineKeys = new Set(effectiveFutureProjects.map((project) => `future:${normalizeScoreText(project.line)}`));
  const structuralLineCount = accessibleLineKeys.size + [...futureLineKeys].filter((key) =>
    ![...accessibleLineKeys].some((currentKey) => currentKey.endsWith(`:${key.slice("future:".length)}`))).length;
  const sharedHubEvidence = coLocatedFutureProjects.length > 0;
  const reliableConnectionEvidence = accessibleSignals.some((signal) => signal.source === "route" && Boolean(signal.via));

  const nearestAccess = accessSignals[0];
  const fastestJourney = chooseFastestJourney(input.chateletJourneys);
  const journeySummary = fastestJourney ? summarizeJourney(fastestJourney) : undefined;
  const readyFrequencies = getReadyFrequencies(input.frequencyProfiles);
  const scoreParts: Array<{ value: number; weight: number }> = [];

  if (nearestAccess) {
    scoreParts.push({
      value: nearestAccess.source === "route"
        ? clamp(10 * (1 - nearestAccess.minutes / 30))
        : clamp(10 * (1 - nearestAccess.distanceMeters / 2_000)),
      weight: 0.4,
    });
  }
  if (linesByKey.size > 0) {
    scoreParts.push({ value: saturatingNeighborhoodBonus(structuralLineCount, 4, 10), weight: 0.25 });
  }
  if (accessibleModes.size > 0) {
    scoreParts.push({ value: saturatingNeighborhoodBonus(accessibleModes.size, 3, 10), weight: 0.15 });
  }
  if (journeySummary) {
    scoreParts.push({
      value: clamp(10 * (1 - Math.max(0, journeySummary.durationMinutes - 15) / 75)),
      weight: 0.15,
    });
  }
  if (readyFrequencies.length > 0) {
    const frequencyScore = readyFrequencies.reduce(
      (sum, value) => sum + clamp(10 * (1 - Math.max(0, value - 2) / 13)),
      0,
    ) / readyFrequencies.length;
    scoreParts.push({ value: frequencyScore, weight: 0.05 });
  }

  const positiveFacts: NeighborhoodFact[] = [];
  const negativeFacts: NeighborhoodFact[] = [];
  for (const signal of accessSignals.slice(0, 4)) {
    positiveFacts.push(makeTransportAccessFact(signal));
  }

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

  for (const { project, currentLines } of coLocatedFutureProjects) {
    const currentLineNames = currentLines.map((line) => formatTransportLineName(line));
    if (currentLineNames.length === 0) continue;
    const matchingAccess = accessibleSignals.find((signal) =>
      currentLines.some((line) => lineKey(line) === lineKey(signal.line)));
    const futureAccess = accessibleSignals.find((signal) =>
      signal.futureProject?.id === project.id && signal.source === "route");
    const routeAccess = futureAccess ?? matchingAccess;
    const walkingMinutes = Number.isFinite(project.walkingMinutes)
      && (project.walkingMinutes ?? Number.POSITIVE_INFINITY) <= 15
      ? project.walkingMinutes
      : undefined;
    // A project beyond the walking threshold must be backed by a real route
    // to the current line; a map-distance estimate is not enough to create a
    // future transport hub.
    const transitMinutes = routeAccess?.source === "route"
      ? routeAccess.minutes
      : undefined;
    const minutes = walkingMinutes ?? transitMinutes;
    if (!minutes) continue;
    const via = routeAccess?.source === "route" && routeAccess.via
      ? routeAccess.via
      : walkingMinutes !== undefined
        ? "à pied"
        : currentLineNames[0];
    positiveFacts.push(makeFact({
      id: `transport-hub-${normalizeScoreText(project.line).replace(/[^a-z0-9]+/gu, "-")}`,
      kind: "transportHub",
      category: "transport",
      polarity: "positive",
      family: `transport-hub:${project.hubId ?? project.id}`,
      priority: 14,
      values: {
        currentLines: currentLineNames.join(" et "),
        futureLine: project.line,
        minutes,
        via,
        station: project.name,
      },
      sourceKey: SOURCE_KEYS.heavyRoutes,
      proof: "direct",
      ruleKey: RULE_KEYS.transportHub,
      ruleValues: { threshold: 15 },
    }));
  }

  const benchmarkFacts = buildJourneyBenchmarkFacts(input);
  positiveFacts.push(...benchmarkFacts.positiveFacts);
  negativeFacts.push(...benchmarkFacts.negativeFacts);
  positiveFacts.push(...buildNoctilienFacts(input.noctilienJourneys));

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
      }));
    }
  }

  if (readyFrequencies.length > 0) {
    const frequencyValues = readyFrequencies.map((value) => Math.round(value * 10) / 10);
    const frequencyLabels = getReadyFrequencyLabels(input.frequencyProfiles, input.stations, input.heavyCandidates);
    if (Math.min(...frequencyValues) <= 5) {
      positiveFacts.push(makeFact({
        id: "frequency-high",
        kind: "frequencyVeryGood",
        category: "transport",
        polarity: "positive",
        family: "frequency",
        priority: 7,
        values: { minutes: Math.min(...frequencyValues), lines: frequencyLabels },
        sourceKey: SOURCE_KEYS.frequency,
        proof: "direct",
        ruleKey: RULE_KEYS.frequencyHigh,
        ruleValues: { threshold: 5 },
      }));
    } else if (Math.min(...frequencyValues) >= 10) {
      negativeFacts.push(makeFact({
        id: "frequency-low",
        kind: "frequencyLow",
        category: "transport",
        polarity: "negative",
        family: "frequency",
        priority: 6,
        values: { minutes: Math.min(...frequencyValues), lines: frequencyLabels },
        sourceKey: SOURCE_KEYS.frequency,
        proof: "direct",
        ruleKey: RULE_KEYS.frequencyLow,
        ruleValues: { threshold: 10 },
      }));
    }
  }

  const weightedScore = scoreParts.length > 0 ? weightedAverage(scoreParts) : 1.5;
  const exceptionalTransport = structuralLineCount >= 3
    && (sharedHubEvidence || reliableConnectionEvidence || effectiveFutureProjects.length > 0);
  return withFacts({
    ...base,
    available: true,
    score: exceptionalTransport ? Math.max(9, weightedScore) : weightedScore,
    positiveFacts,
    negativeFacts,
  });
}

function buildJourneyBenchmarkFacts(input: NeighborhoodScoreInput): {
  positiveFacts: NeighborhoodFact[];
  negativeFacts: NeighborhoodFact[];
} {
  const positiveFacts: NeighborhoodFact[] = [];
  const negativeFacts: NeighborhoodFact[] = [];
  const benchmarks = input.journeyBenchmarks ?? [];
  for (const benchmark of benchmarks) {
    if (benchmark.id === "chatelet") continue;
    const journey = chooseFastestJourney(benchmark.journeys);
    if (!journey) continue;
    const summary = summarizeJourney(journey);
    const timing = analyzeNearbyJourneyTiming(journey);
    if (timing.scoreSeconds >= 40 * 60) continue;
    positiveFacts.push(makeFact({
      id: `major-station-${benchmark.id}`,
      kind: "majorStationUnder40",
      category: "transport",
      polarity: "positive",
      family: `major-station:${benchmark.id}`,
      priority: 9,
      values: {
        destination: benchmark.label,
        duration: summary.durationMinutes,
        elapsed: summary.elapsedMinutes,
        walking: summary.walkingMinutes,
        transfers: summary.transfers,
        lines: summary.lines,
        initialWait: Math.round(timing.initialWaitSeconds / 60),
      },
      sourceKey: SOURCE_KEYS.journeys,
      proof: "direct",
      ruleKey: RULE_KEYS.majorStationUnder40,
      ruleValues: { threshold: 40 },
    }));
  }
  return { positiveFacts, negativeFacts };
}

function buildNoctilienFacts(journeys: readonly NearbyJourney[] | undefined): NeighborhoodFact[] {
  const factsByLine = new Map<string, { line: string; minutes: number }>();
  for (const journey of journeys ?? []) {
    const noctilienSections = journey.sections.filter((section) =>
      isNearbyJourneyTransitSection(section)
      && (section.lineMode === "NOCTILIEN" || [section.lineCode, ...(section.lineAliases ?? [])]
        .filter((value): value is string => Boolean(value?.trim()))
        .some((value) => /^n\s*\d+$/iu.test(value.trim()))));
    if (noctilienSections.length === 0) continue;
    const timing = analyzeNearbyJourneyTiming(journey);
    const line = [...new Set(noctilienSections.map((section) => section.lineCode || section.lineId).filter(Boolean))].join(" · ") || "Noctilien";
    const key = normalizeScoreText(line);
    const current = factsByLine.get(key);
    const minutes = Math.max(1, Math.ceil(timing.scoreSeconds / 60));
    if (!current || minutes < current.minutes) factsByLine.set(key, { line, minutes });
  }
  return [...factsByLine.values()].map((value) => makeFact({
    id: `noctilien-${normalizeScoreText(value.line).replace(/[^a-z0-9]+/gu, "-")}`,
    kind: "noctilienAtNight",
    category: "transport",
    polarity: "positive",
    family: `noctilien:${normalizeScoreText(value.line)}`,
    priority: 8,
    values: { line: value.line, minutes: value.minutes },
    sourceKey: SOURCE_KEYS.journeys,
    proof: "direct",
    ruleKey: RULE_KEYS.noctilienAtNight,
    ruleValues: { hour: "03:00" },
  }));
}

function buildDailyLifeCategory(input: NeighborhoodScoreInput): NeighborhoodCategoryResult {
  const base = category("daily-life");
  if (!input.placesLoaded) {
    return {
      ...base,
      available: false,
      unavailableReasonKey: "nearbyStations.neighborhoodScore.unavailable.places",
      positiveFacts: [],
      negativeFacts: [],
    };
  }

  const nearby = collapseCommercialLocations(scorePlaces(input, (place) =>
    DAILY_STORE_KINDS.has(placeKind(place)) || place.category === "shop"));
  const richCommercialCluster = findRichCommercialStreetCluster(input);
  const supermarkets = scorePlaces(input, isSupermarketLike);
  const restaurants = scorePlaces(input, (place) => RESTAURANT_KINDS.has(placeKind(place)) || place.category === "food");
  const score = clamp(
    2
      + saturatingNeighborhoodBonus(supermarkets.length, 2, 3)
      + saturatingNeighborhoodBonus(nearby.length, 6, 3)
      + saturatingNeighborhoodBonus(restaurants.length, 5, 2),
  );
  const positiveFacts: NeighborhoodFact[] = [];
  const negativeFacts: NeighborhoodFact[] = [];
  if (richCommercialCluster) {
    const exactWalking = richCommercialCluster.every((place) => place.routed);
    positiveFacts.push(makeFact({
      id: exactWalking ? "rich-commercial-street" : "rich-commercial-street-approx",
      kind: exactWalking ? "richCommercialStreet" : "richCommercialStreetApprox",
      category: "daily-life",
      polarity: "positive",
      family: "rich-commercial-street",
      priority: 12,
      values: {
        count: richCommercialCluster.length,
        minutes: 10,
      },
      sourceKey: exactWalking ? SOURCE_KEYS.placesAndWalking : SOURCE_KEYS.places,
      proof: exactWalking ? "direct" : "derived",
      ruleKey: RULE_KEYS.commercialCluster,
      ruleValues: { threshold: 10, categories: 4 },
    }));
  }
  const nearestSupermarket = supermarkets[0];
  const supermarketsUnderTenMinutes = supermarkets.filter((supermarket) => supermarket.minutes < 10);
  if (supermarketsUnderTenMinutes.length > 0) {
    const allRoutesAvailable = supermarketsUnderTenMinutes.every((supermarket) => supermarket.routed);
    positiveFacts.push(makeFact({
      id: "supermarkets-nearby",
      kind: "supermarketsNearby",
      category: "daily-life",
      polarity: "positive",
      family: "supermarket",
      priority: 11,
      values: {
        supermarkets: supermarketsUnderTenMinutes
          .map((supermarket) => formatSupermarketLabel(supermarket))
          .join(" · "),
        count: supermarketsUnderTenMinutes.length,
        minutes: 10,
      },
      sourceKey: allRoutesAvailable ? SOURCE_KEYS.placesAndWalking : SOURCE_KEYS.places,
      proof: allRoutesAvailable ? "direct" : "derived",
      ruleKey: RULE_KEYS.placePresence,
      ruleValues: { threshold: 10 },
    }));
  } else if (nearestSupermarket) {
    positiveFacts.push(makePlaceFact({
      id: "supermarket-nearby",
      category: "daily-life",
      family: "supermarket",
      priority: 10,
      positive: true,
      place: nearestSupermarket,
      routedKind: "supermarketNearby",
      approximateKind: "supermarketNearbyApprox",
      ruleKey: RULE_KEYS.placePresence,
      ruleValues: { threshold: NEIGHBORHOOD_WALKING_LIMIT_MINUTES },
    }));
  } else {
    negativeFacts.push(makeFact({
      id: "no-supermarket",
      kind: "noSupermarket",
      category: "daily-life",
      polarity: "negative",
      family: "supermarket",
      priority: 7,
      values: { minutes: NEIGHBORHOOD_WALKING_LIMIT_MINUTES },
      sourceKey: SOURCE_KEYS.places,
      proof: "direct",
      ruleKey: RULE_KEYS.placePresence,
      ruleValues: { threshold: NEIGHBORHOOD_WALKING_LIMIT_MINUTES },
    }));
  }
  if (nearby.length >= 2) {
    positiveFacts.push(makePlaceCountFact({
      id: "daily-stores",
      category: "daily-life",
      family: "daily-store-count",
      priority: 8,
      count: nearby.length,
      routed: nearby.some((place) => place.routed),
      exactKind: "dailyStores",
      approximateKind: "dailyStoresApprox",
    }));
  }
  if (restaurants.length >= 2) {
    positiveFacts.push(makePlaceCountFact({
      id: "restaurants-nearby",
      category: "daily-life",
      family: "restaurants",
      priority: 6,
      count: restaurants.length,
      routed: restaurants.some((place) => place.routed),
      exactKind: "restaurantsNearby",
      approximateKind: "restaurantsNearbyApprox",
    }));
  }

  return withFacts({
    ...base,
    available: true,
    score,
    positiveFacts,
    negativeFacts,
  });
}

function buildNatureLeisureCategory(input: NeighborhoodScoreInput): NeighborhoodCategoryResult {
  const base = category("nature-leisure");
  const greenSpaceFacts = buildGreenSpaceTransitFacts(input.greenSpaceJourneys);
  if (!input.placesLoaded && greenSpaceFacts.length === 0) {
    return {
      ...base,
      available: false,
      unavailableReasonKey: "nearbyStations.neighborhoodScore.unavailable.places",
      positiveFacts: [],
      negativeFacts: [],
    };
  }
  const leisure = input.placesLoaded
    ? scorePlaces(input, (place) => place.category === "culture" || place.category === "attraction")
    : [];
  if (leisure.length === 0 && greenSpaceFacts.length === 0) {
    return {
      ...base,
      available: false,
      unavailableReasonKey: "nearbyStations.neighborhoodScore.unavailable.noRelevantLeisure",
      positiveFacts: [],
      negativeFacts: [],
    };
  }
  const nearest = leisure[0];
  const positiveFacts = [...greenSpaceFacts];
  if (nearest) {
    positiveFacts.push(makePlaceFact({
      id: "leisure-nearby",
      category: "nature-leisure",
      family: "leisure",
      priority: 7,
      positive: true,
      place: nearest,
      routedKind: "leisurePlaceNearby",
      approximateKind: "leisurePlaceNearbyApprox",
      ruleKey: RULE_KEYS.leisurePresence,
      ruleValues: { threshold: NEIGHBORHOOD_WALKING_LIMIT_MINUTES },
    }));
  }
  const baseScore = leisure.length > 0
    ? 4 + saturatingNeighborhoodBonus(leisure.length, 3, 6)
    : 7;
  return withFacts({
    ...base,
    available: true,
    score: clamp(baseScore + Math.min(2, greenSpaceFacts.length)),
    positiveFacts,
    negativeFacts: [],
  });
}

function buildGreenSpaceTransitFacts(
  greenSpaceJourneys: readonly NeighborhoodGreenSpaceJourney[] | undefined,
): NeighborhoodFact[] {
  return (greenSpaceJourneys ?? [])
    .map((candidate): NeighborhoodFact | undefined => {
      const walkingMinutes = candidate.greenSpace.walkingMinutes
        ?? candidate.greenSpace.estimatedWalkingMinutes;
      if (!(walkingMinutes > NEIGHBORHOOD_WALKING_LIMIT_MINUTES)) return undefined;
      const journey = chooseFastestJourney(
        candidate.journeys.filter((item) => isEligibleGreenSpaceJourney(item)),
      );
      if (!journey) return undefined;
      const timing = analyzeNearbyJourneyTiming(journey);
      if (timing.scoreSeconds > NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS) return undefined;
      const transitSections = journey.sections.filter(isNearbyJourneyTransitSection);
      const lines = [...new Set(
        transitSections
          .map(formatGreenSpaceJourneyLine)
          .filter((value): value is string => Boolean(value)),
      )].join(" · ");
      if (!lines) return undefined;
      const area = formatGreenSpaceAreaLabel(candidate.greenSpace.surfaceM2);
      return makeFact({
        id: `green-space-transit-${candidate.greenSpace.id}`,
        kind: "greenSpaceTransitNearby",
        category: "nature-leisure",
        polarity: "positive",
        family: `managed-green-space:${candidate.greenSpace.id}`,
        priority: 13,
        values: {
          name: candidate.greenSpace.name,
          minutes: Math.max(1, Math.ceil(timing.scoreSeconds / 60)),
          lines,
          area: area ?? "surface non renseignée",
          areaLabel: area ? ` · ${area}` : "",
          walking: walkingMinutes,
          elapsed: Math.max(1, Math.ceil(timing.elapsedSeconds / 60)),
          initialWait: Math.max(0, Math.ceil(timing.initialWaitSeconds / 60)),
        },
        sourceKey: SOURCE_KEYS.journeys,
        proof: "direct",
        ruleKey: RULE_KEYS.greenSpaceTransit,
        ruleValues: { threshold: 15 },
      });
    })
    .filter((fact): fact is NeighborhoodFact => Boolean(fact))
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
}

function isEligibleGreenSpaceJourney(journey: NearbyJourney): boolean {
  const transitSections = journey.sections.filter(isNearbyJourneyTransitSection);
  return transitSections.length > 0 && transitSections.every((section) => !isBusLikeGreenSpaceSection(section));
}

function isBusLikeGreenSpaceSection(section: NearbyJourney["sections"][number]): boolean {
  if (section.lineMode === "BUS" || section.lineMode === "NOCTILIEN") return true;
  const references = [section.lineCode, section.lineId, ...(section.lineAliases ?? []), section.mode]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => normalizeScoreText(value).replace(/[^a-z0-9]+/gu, ""));
  return references.some((value) => value === "bus" || value === "noctilien" || /^n\d+$/u.test(value));
}

function formatGreenSpaceJourneyLine(section: NearbyJourney["sections"][number]): string | undefined {
  const references = [section.lineCode, ...(section.lineAliases ?? []), section.lineId]
    .map((value) => value?.trim())
    .filter((value): value is string => typeof value === "string"
      && !/^line:|^idfm:c\d+$/iu.test(value)
      && !/^c\d{5}$/iu.test(value));
  return references[0] ?? section.lineMode?.toString();
}

function formatGreenSpaceAreaLabel(surfaceM2: number | undefined): string | undefined {
  if (!(surfaceM2 && surfaceM2 > 0)) return undefined;
  return surfaceM2 >= 10_000
    ? `${Math.round(surfaceM2 / 10_000)} ha`
    : `${Math.round(surfaceM2)} m²`;
}

function buildHealthCategory(input: NeighborhoodScoreInput): NeighborhoodCategoryResult {
  const base = category("health");
  if (!input.placesLoaded) {
    return {
      ...base,
      available: false,
      unavailableReasonKey: "nearbyStations.neighborhoodScore.unavailable.places",
      positiveFacts: [],
      negativeFacts: [],
    };
  }
  const pharmacies = scorePlaces(input, (place) => PHARMACY_KINDS.has(placeKind(place)));
  const positiveFacts: NeighborhoodFact[] = [];
  const negativeFacts: NeighborhoodFact[] = [];
  const nearest = pharmacies[0];
  if (nearest) {
    positiveFacts.push(makePlaceFact({
      id: "pharmacy-nearby",
      category: "health",
      family: "pharmacy",
      priority: 8,
      positive: true,
      place: nearest,
      routedKind: "pharmacyNearby",
      approximateKind: "pharmacyNearbyApprox",
      ruleKey: RULE_KEYS.pharmacyPresence,
      ruleValues: { threshold: NEIGHBORHOOD_WALKING_LIMIT_MINUTES },
    }));
  } else {
    negativeFacts.push(makeFact({
      id: "no-pharmacy",
      kind: "noPharmacy",
      category: "health",
      polarity: "negative",
      family: "pharmacy",
      priority: 8,
      values: { minutes: NEIGHBORHOOD_WALKING_LIMIT_MINUTES },
      sourceKey: SOURCE_KEYS.places,
      proof: "direct",
      ruleKey: RULE_KEYS.pharmacyPresence,
      ruleValues: { threshold: NEIGHBORHOOD_WALKING_LIMIT_MINUTES },
    }));
  }
  return withFacts({
    ...base,
    available: true,
    score: pharmacies.length > 0
      ? clamp(6 + saturatingNeighborhoodBonus(pharmacies.length - 1, 3, 2))
      : 2,
    positiveFacts,
    negativeFacts,
  });
}

function buildUnavailableCategory(
  id: NeighborhoodCategoryId,
  unavailableReasonKey: TranslationKey,
): NeighborhoodCategoryResult {
  return {
    ...category(id),
    available: false,
    unavailableReasonKey,
    positiveFacts: [],
    negativeFacts: [],
  };
}

function category(id: NeighborhoodCategoryId): Pick<NeighborhoodCategoryResult, "id" | "labelKey" | "weight" | "neutralFacts"> & {
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

function withFacts(
  value: NeighborhoodCategoryResult & { score?: number },
): NeighborhoodCategoryResult {
  if (value.score === undefined) return value;
  return { ...value, displayScore: getNeighborhoodScoreDisplay(value.score) };
}

function makeFact(options: {
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
}): NeighborhoodFact {
  const keys = FACT_KEYS[options.kind];
  return {
    id: options.id,
    kind: options.kind,
    category: options.category,
    polarity: options.polarity,
    family: options.family,
    priority: options.priority,
    labelKey: keys.label,
    labelValues: options.values,
    tooltipKey: keys.tooltip,
    tooltipValues: options.values,
    evidence: {
      sourceKey: options.sourceKey,
      proof: options.proof,
      ruleKey: options.ruleKey,
      ruleValues: options.ruleValues,
      observedAt: Date.now(),
    },
  };
}

interface ScoredPlace {
  place: NearbyPlace;
  minutes: number;
  distanceMeters: number;
  routed: boolean;
}

function formatSupermarketLabel(place: ScoredPlace): string {
  const name = place.place.name.trim() || place.place.brand?.trim() || place.place.operator?.trim() || "Supermarché";
  return `${name} (${place.routed ? "" : "≈"}${place.minutes} min${place.routed ? " à pied" : ""})`;
}

function scorePlaces(
  input: NeighborhoodScoreInput,
  predicate: (place: NearbyPlace) => boolean,
): ScoredPlace[] {
  return input.places
    .filter(predicate)
    .map((place) => scorePlace(place, input.walkingRoutes?.[place.id]))
    .filter((place) => place.minutes <= NEIGHBORHOOD_WALKING_LIMIT_MINUTES)
    .sort((left, right) => left.minutes - right.minutes
      || left.distanceMeters - right.distanceMeters
      || left.place.name.localeCompare(right.place.name, "fr"));
}

function isSupermarketLike(place: NearbyPlace): boolean {
  const kind = placeKind(place);
  if (SUPERMARKET_KINDS.has(kind)) return true;
  const identity = normalizeScoreText([place.name, place.brand, place.operator].filter(Boolean).join(" "));
  return /\b(?:u\s*express|express\s+u|intermarche|carrefour\s+(?:city|market|contact|express)|monoprix|franprix|casino\s+shop|g20|coccimarket|utile|village\s+du\s+bio)\b/iu.test(identity);
}

function findRichCommercialStreetCluster(input: NeighborhoodScoreInput): ScoredPlace[] | undefined {
  const candidatesBySpecialty = new Map<string, ScoredPlace>();
  for (const candidate of scorePlaces(input, isRichCommercialSpecialty)) {
    if (candidate.minutes >= 10) continue;
    const specialty = richCommercialSpecialty(candidate.place);
    if (!specialty || candidatesBySpecialty.has(specialty)) continue;
    candidatesBySpecialty.set(specialty, candidate);
  }

  const cluster = RICH_COMMERCIAL_SPECIALTIES
    .map(({ id }) => candidatesBySpecialty.get(id))
    .filter((candidate): candidate is ScoredPlace => Boolean(candidate));
  return cluster.length === RICH_COMMERCIAL_SPECIALTIES.length ? cluster : undefined;
}

function isRichCommercialSpecialty(place: NearbyPlace): boolean {
  return richCommercialSpecialty(place) !== undefined;
}

function richCommercialSpecialty(place: NearbyPlace): string | undefined {
  const kind = placeKind(place);
  const identity = normalizeScoreText([place.kind, place.name, place.brand, place.operator]
    .filter(Boolean)
    .join(" "));
  return RICH_COMMERCIAL_SPECIALTIES.find((specialty) =>
    specialty.kinds.has(kind) || specialty.pattern.test(identity))?.id;
}

const COMMERCIAL_SPECIALIST_KINDS = new Set([
  "butcher",
  "boucher",
  "deli",
  "delicatessen",
  "caterer",
  "traiteur",
  "cheese",
  "cheesemonger",
  "fromagerie",
]);

function collapseCommercialLocations(places: ScoredPlace[]): ScoredPlace[] {
  const kept: ScoredPlace[] = [];
  for (const candidate of places) {
    const candidateKind = placeKind(candidate.place);
    if (!COMMERCIAL_SPECIALIST_KINDS.has(candidateKind)) {
      kept.push(candidate);
      continue;
    }
    const duplicate = kept.some((existing) => {
      const existingKind = placeKind(existing.place);
      if (!COMMERCIAL_SPECIALIST_KINDS.has(existingKind)) return false;
      const sameAddress = normalizeCommercialAddress(existing.place.address) !== ""
        && normalizeCommercialAddress(existing.place.address) === normalizeCommercialAddress(candidate.place.address);
      return sameAddress || commercialDistanceMeters(existing.place, candidate.place) <= 25;
    });
    if (!duplicate) kept.push(candidate);
  }
  return kept;
}

function normalizeCommercialAddress(value: string | undefined): string {
  return normalizeScoreText(value ?? "").replace(/[^a-z0-9]+/gu, " ").trim();
}

function commercialDistanceMeters(left: Pick<NearbyPlace, "lat" | "lon">, right: Pick<NearbyPlace, "lat" | "lon">): number {
  const latMeters = (right.lat - left.lat) * 111_320;
  const lonMeters = (right.lon - left.lon) * 111_320 * Math.cos((left.lat * Math.PI) / 180);
  return Math.sqrt(latMeters ** 2 + lonMeters ** 2);
}

function scorePlace(place: NearbyPlace, route?: NeighborhoodWalkingMetrics): ScoredPlace {
  const routeDistance = finiteNonNegative(route?.distanceMeters);
  const routeDuration = finitePositive(route?.durationSeconds);
  const routed = routeDuration !== undefined
    && route?.provider !== undefined
    && route.provider !== "straight-line"
    && route.fallback !== true;
  const distanceMeters = Math.round(routeDistance ?? Math.max(0, place.distanceMeters));
  const minutes = routeDuration !== undefined && routed
    ? Math.max(1, Math.ceil(routeDuration / 60))
    : Math.max(1, Math.ceil(distanceMeters / 80));
  return { place, minutes, distanceMeters, routed };
}

function makePlaceFact(options: {
  id: string;
  category: NeighborhoodCategoryId;
  family: string;
  priority: number;
  positive: boolean;
  place: ScoredPlace;
  routedKind: NeighborhoodFactKind;
  approximateKind: NeighborhoodFactKind;
  ruleKey: TranslationKey;
  ruleValues: TranslationParams;
}): NeighborhoodFact {
  const kind = options.place.routed ? options.routedKind : options.approximateKind;
  return makeFact({
    id: options.id,
    kind,
    category: options.category,
    polarity: options.positive ? "positive" : "negative",
    family: options.family,
    priority: options.priority,
    values: {
      name: options.place.place.name,
      minutes: options.place.minutes,
      meters: options.place.distanceMeters,
    },
    sourceKey: options.place.routed ? SOURCE_KEYS.placesAndWalking : SOURCE_KEYS.places,
    proof: options.place.routed ? "direct" : "derived",
    ruleKey: options.ruleKey,
    ruleValues: options.ruleValues,
  });
}

function makePlaceCountFact(options: {
  id: string;
  category: NeighborhoodCategoryId;
  family: string;
  priority: number;
  count: number;
  routed: boolean;
  exactKind: NeighborhoodFactKind;
  approximateKind: NeighborhoodFactKind;
}): NeighborhoodFact {
  return makeFact({
    id: options.id,
    kind: options.routed ? options.exactKind : options.approximateKind,
    category: options.category,
    polarity: "positive",
    family: options.family,
    priority: options.priority,
    values: { count: options.count, minutes: NEIGHBORHOOD_WALKING_LIMIT_MINUTES },
    sourceKey: options.routed ? SOURCE_KEYS.placesAndWalking : SOURCE_KEYS.places,
    proof: options.routed ? "direct" : "derived",
    ruleKey: RULE_KEYS.placeSaturation,
    ruleValues: { target: options.id === "restaurants-nearby" ? 5 : 6, maximum: 3 },
  });
}

interface NeighborhoodTransportAccessSignal {
  line: GlobalMapLine;
  lineName: string;
  /** Present when this line came from a GPE target resolved by the heavy router. */
  futureProject?: PublicFutureGpeStation;
  source: "route" | "map";
  accessKind: "walking" | "connection" | "map";
  /** Elapsed route duration, retained for eligibility and provenance. */
  totalSeconds: number;
  /** Display duration: walking and riding sections, excluding waits. */
  travelSeconds: number;
  minutes: number;
  distanceMeters: number;
  via?: string;
}

// Keep the verdict aligned with the resolver used by NearbyStationsMap. The
// resolver has already rejected routes beyond this limit; applying the same
// limit here prevents a valid projected station (for example RER B via T10)
// from disappearing merely because it is outside the 600 m map radius.
const NEIGHBORHOOD_ROUTED_TRANSPORT_LIMIT_SECONDS = NEARBY_HEAVY_TOTAL_MAX_SECONDS;
const NEIGHBORHOOD_TRANSPORT_ACCESS_LIMIT_SECONDS = 15 * 60;
const NEIGHBORHOOD_TRANSPORT_AT_FOOT_METERS = 400;
const KNOWN_LINE_LABELS_BY_CODE: Readonly<Record<string, string>> = {
  C01728: "D",
  C01729: "E",
  C01730: "P",
  C01731: "R",
  C01736: "N",
  C01737: "H",
  C01738: "K",
  C01739: "J",
  C01740: "L",
  C01741: "U",
  C01742: "A",
  C01743: "B",
  C02528: "T10",
  C02711: "V",
};

function listTransportAccessSignals(input: NeighborhoodScoreInput): NeighborhoodTransportAccessSignal[] {
  const byLine = new Map<string, NeighborhoodTransportAccessSignal>();

  for (const entry of input.stations) {
    if (!entry.insideRadius) continue;
    for (const line of entry.lines) {
      if (!HEAVY_SCORE_MODES.has(line.mode)) continue;
      const distanceMeters = entry.lineDistanceMeters?.[line.id] ?? entry.distanceMeters;
      if (!Number.isFinite(distanceMeters) || distanceMeters < 0) continue;
      const signal: NeighborhoodTransportAccessSignal = {
        line,
        lineName: formatTransportLineName(line),
        source: "map",
        accessKind: distanceMeters <= NEIGHBORHOOD_TRANSPORT_AT_FOOT_METERS ? "walking" : "map",
        totalSeconds: Math.max(60, Math.round(distanceMeters / 80) * 60),
        travelSeconds: Math.max(60, Math.round(distanceMeters / 80) * 60),
        distanceMeters: Math.round(distanceMeters),
        minutes: Math.max(1, Math.round(distanceMeters / 80)),
      };
      keepBestTransportSignal(byLine, signal);
    }
  }

  for (const candidate of input.heavyCandidates ?? []) {
    for (const line of candidate.lines) {
      if (!HEAVY_SCORE_MODES.has(line.mode)) continue;
      const access = accessForHeavyLine(candidate, line);
      if (!Number.isFinite(access.totalSeconds) || access.totalSeconds < 0) continue;
      if (access.totalSeconds > NEIGHBORHOOD_ROUTED_TRANSPORT_LIMIT_SECONDS) continue;
      const signal: NeighborhoodTransportAccessSignal = {
        line,
        lineName: formatTransportLineName(line),
        futureProject: candidate.futureProjectsByLine?.[line.id],
        source: "route",
        accessKind: access.kind === "direct" ? "walking" : "connection",
        totalSeconds: access.totalSeconds,
        travelSeconds: getNearbyHeavyAccessTravelSeconds(access),
        minutes: formatTransportMinutes(
          getNearbyHeavyAccessTravelSeconds(access),
          access.kind === "direct",
        ),
        distanceMeters: Math.max(0, Math.round(candidate.distanceMeters)),
        via: access.kind === "connection" ? formatFeederLineName(input, access) : undefined,
      };
      keepBestTransportSignal(byLine, signal);
    }
  }

  return [...byLine.values()].sort(compareTransportAccessSignalsForDisplay);
}

function keepBestTransportSignal(
  byLine: Map<string, NeighborhoodTransportAccessSignal>,
  signal: NeighborhoodTransportAccessSignal,
): void {
  const key = lineKey(signal.line);
  const current = byLine.get(key);
  if (!current || compareTransportAccessSignals(signal, current) < 0) byLine.set(key, signal);
}

function compareTransportAccessSignals(
  left: NeighborhoodTransportAccessSignal,
  right: NeighborhoodTransportAccessSignal,
): number {
  return Number(right.source === "route") - Number(left.source === "route")
    || left.travelSeconds - right.travelSeconds
    || left.totalSeconds - right.totalSeconds
    || left.minutes - right.minutes
    || left.distanceMeters - right.distanceMeters
    || left.lineName.localeCompare(right.lineName, "fr-FR");
}

function compareTransportAccessSignalsForDisplay(
  left: NeighborhoodTransportAccessSignal,
  right: NeighborhoodTransportAccessSignal,
): number {
  return left.minutes - right.minutes
    || Number(right.source === "route") - Number(left.source === "route")
    || left.travelSeconds - right.travelSeconds
    || left.distanceMeters - right.distanceMeters
    || left.lineName.localeCompare(right.lineName, "fr-FR");
}

function accessForHeavyLine(
  candidate: NearbyHeavyTransportCandidate,
  line: GlobalMapLine,
): NearbyHeavyTransportCandidate["access"] {
  return candidate.accessAlternativesByLine?.[line.id]?.[0]
    ?? candidate.accessByLine[line.id]
    ?? candidate.access;
}

function formatTransportLineName(line: Pick<GlobalMapLine, "id" | "code" | "label" | "mode" | "sourceLineId" | "aliases">): string {
  const directLabel = line.label.trim();
  const knownLabel = [line.code, line.sourceLineId ?? "", line.id, ...line.aliases]
    .map(lineIdentityCode)
    .filter((code): code is string => Boolean(code))
    .map((code) => KNOWN_LINE_LABELS_BY_CODE[code])
    .find((label): label is string => Boolean(label));
  const lineLabel = !isOpaqueTransportLineLabel(directLabel)
    ? directLabel
    : (knownLabel ?? (directLabel || line.code.trim()));
  if (!lineLabel) return transportModeLabel(line.mode);
  return /^(?:métro|metro|rer|train|transilien|tram|tramway|cable|câble)\b/iu.test(lineLabel)
    ? lineLabel
    : `${transportModeLabel(line.mode)} ${lineLabel}`;
}

function formatFeederLineName(
  input: NeighborhoodScoreInput,
  access: NearbyHeavyTransportCandidate["access"],
): string | undefined {
  const references = [access.feederLineId, access.feederLineCode]
    .map((reference) => reference?.trim())
    .filter((reference): reference is string => Boolean(reference));
  const reference = references[0];
  if (!reference) return undefined;
  const feederLines = input.stations.flatMap((entry) => entry.lines);
  const exactFeeder = feederLines.find((line) => references.some((candidateReference) => [
    line.id,
    line.code,
    line.label,
    line.sourceLineId ?? "",
    ...line.aliases,
  ].some((value) => value.trim() === candidateReference)));
  const feeder = exactFeeder ?? feederLines.find((line) => [
    line.id,
    line.code,
    line.label,
    line.sourceLineId ?? "",
    ...line.aliases,
  ].some((value) => transportLineReferencesMatch(value, reference)));
  if (feeder) return formatTransportLineName(feeder);
  const mode = access.feederMode ? transportModeLabel(access.feederMode) : "transport";
  return `${mode} ${reference}`;
}

function formatTransportMinutes(seconds: number, directWalking: boolean): number {
  const rounded = directWalking ? Math.round(seconds / 60) : Math.ceil(seconds / 60);
  return Math.max(1, rounded);
}

function coLocatedCurrentLines(
  input: NeighborhoodScoreInput,
  project: { lon: number; lat: number; coLocatedCurrentLineCodes?: readonly string[] },
  accessibleLineKeys: ReadonlySet<string>,
): GlobalMapLine[] {
  const linesByKey = new Map<string, GlobalMapLine>();
  const declaredCodes = project.coLocatedCurrentLineCodes ?? [];
  const addLine = (line: GlobalMapLine, nearProject: boolean): void => {
    if (!HEAVY_SCORE_MODES.has(line.mode)) return;
    const declared = declaredCodes.some((code) => transportLineReferencesMatch(line.code || line.label, code));
    if (!declared && (!nearProject || !accessibleLineKeys.has(lineKey(line)))) return;
    if (!declared && !accessibleLineKeys.has(lineKey(line))) return;
    linesByKey.set(lineKey(line), line);
  };
  for (const entry of input.stations) {
    const members = entry.memberStations.length > 0 ? entry.memberStations : [entry.station];
    const nearProject = members.some((station) => commercialDistanceMeters(station, project) <= 100);
    if (!nearProject) continue;
    for (const line of entry.lines) addLine(line, true);
  }
  for (const candidate of input.heavyCandidates ?? []) {
    if (commercialDistanceMeters(candidate.station, project) > 100) continue;
    for (const line of candidate.lines) addLine(line, true);
  }
  return [...linesByKey.values()];
}

function transportLineReferencesMatch(left: string, right: string): boolean {
  const normalize = (value: string) => normalizeScoreText(value).replace(/[^a-z0-9]+/gu, "");
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight
    || normalizedLeft.endsWith(normalizedRight)
    || normalizedRight.endsWith(normalizedLeft);
}

function lineIdentityCode(value: string): string | undefined {
  const match = value.match(/C\d{5}/iu);
  return match?.[0]?.toUpperCase();
}

function isOpaqueTransportLineLabel(value: string): boolean {
  return /^(?:line:)?(?:IDFM:)?C\d{5}$/iu.test(value);
}

function normalizeScoreText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr-FR");
}

function transportModeLabel(mode: GlobalMapMode): string {
  switch (mode) {
    case "METRO": return "Métro";
    case "RER": return "RER";
    case "TRAIN": return "Train";
    case "TRANSILIEN": return "Transilien";
    case "TRAM": return "Tramway";
    case "CABLE": return "Câble";
    default: return mode;
  }
}

function makeTransportAccessFact(signal: NeighborhoodTransportAccessSignal): NeighborhoodFact {
  const atAddress = signal.accessKind === "walking" && signal.minutes <= 2;
  const kind: NeighborhoodFactKind = atAddress
    ? "transportLineAtAddress"
    : signal.source === "route"
      ? "transportLineNearby"
      : signal.distanceMeters <= NEIGHBORHOOD_TRANSPORT_AT_FOOT_METERS
        ? "transportLineAtFoot"
        : "transportLineDistance";
  const values = {
    line: signal.lineName,
    minutes: signal.minutes,
    meters: signal.distanceMeters,
    via: signal.accessKind === "walking"
      ? " à pied"
      : signal.via ? ` via ${signal.via}` : "",
  };
  return makeFact({
    id: `transport-line-${lineKey(signal.line).replace(/[^a-z0-9]+/giu, "-")}`,
    kind,
    category: "transport",
    polarity: "positive",
    family: `transport-proximity:${lineKey(signal.line)}`,
    priority: atAddress
      ? 13
      : signal.source === "route" ? 12 : signal.distanceMeters <= NEIGHBORHOOD_TRANSPORT_AT_FOOT_METERS ? 11 : 10,
    values,
    sourceKey: signal.source === "route" ? SOURCE_KEYS.heavyRoutes : SOURCE_KEYS.stations,
    proof: signal.source === "route" ? "direct" : "derived",
    ruleKey: signal.source === "route" ? RULE_KEYS.transportProximity : RULE_KEYS.transportDistance,
    ruleValues: { threshold: signal.source === "route" ? 15 : 1_500 },
  });
}

function chooseFastestJourney(journeys: readonly NearbyJourney[] | undefined): NearbyJourney | undefined {
  return [...(journeys ?? [])]
    .filter((journey) => finiteNonNegative(analyzeNearbyJourneyTiming(journey).scoreSeconds) !== undefined)
    .sort((left, right) => analyzeNearbyJourneyTiming(left).scoreSeconds - analyzeNearbyJourneyTiming(right).scoreSeconds
      || (left.transferCount ?? Number.POSITIVE_INFINITY) - (right.transferCount ?? Number.POSITIVE_INFINITY)
      || (left.id ?? "").localeCompare(right.id ?? ""))[0];
}

interface JourneySummary {
  durationMinutes: number;
  elapsedMinutes: number;
  initialWaitMinutes: number;
  walkingMinutes: number;
  transfers: number;
  transitSectionCount: number;
  lines: string;
}

function summarizeJourney(journey: NearbyJourney): JourneySummary {
  const timing = analyzeNearbyJourneyTiming(journey);
  const transitSections = journey.sections.filter(isNearbyJourneyTransitSection);
  const walkingSeconds = journey.sections
    .filter(isNearbyJourneyWalkingSection)
    .reduce((sum, section) => sum + (finiteNonNegative(section.durationSeconds) ?? 0), 0);
  const lineLabels = [...new Set(transitSections
    .map((section) => section.lineCode || section.lineId)
    .filter((value): value is string => Boolean(value)))].slice(0, 5);
  return {
    durationMinutes: Math.max(1, Math.ceil(timing.scoreSeconds / 60)),
    elapsedMinutes: Math.max(1, Math.ceil(timing.elapsedSeconds / 60)),
    initialWaitMinutes: Math.max(0, Math.ceil(timing.initialWaitSeconds / 60)),
    // Walking is a human-facing aggregate: round the total instead of
    // rounding each leg up, so a route such as 4m44 + 3m40 is displayed as
    // the approximately 8 minutes shown by journey planners.
    walkingMinutes: Math.max(0, Math.round(walkingSeconds / 60)),
    transfers: Number.isFinite(journey.transferCount)
      ? Math.max(0, journey.transferCount ?? 0)
      : Math.max(0, transitSections.length - 1),
    transitSectionCount: transitSections.length,
    lines: lineLabels.join(" · ") || "—",
  };
}

function getReadyFrequencies(
  profiles: ReadonlyMap<string, GtfsLineFrequencyResponse | undefined> | undefined,
): number[] {
  return [...(profiles?.values() ?? [])]
    .filter((profile): profile is GtfsLineFrequencyResponse =>
      profile?.status === "ready" && finitePositive(profile.average.peakMinutes) !== undefined)
    .map((profile) => profile.average.peakMinutes!)
    .filter((value): value is number => Number.isFinite(value));
}

function getReadyFrequencyLabels(
  profiles: ReadonlyMap<string, GtfsLineFrequencyResponse | undefined> | undefined,
  stations: readonly NearbyStationEntry[],
  candidates: readonly NearbyHeavyTransportCandidate[] | undefined,
): string {
  const lines = [...stations.flatMap((entry) => entry.lines), ...(candidates ?? []).flatMap((candidate) => candidate.lines)];
  const labelsById = new Map(lines.map((line) => [line.id, line.code || line.label]));
  return [...(profiles?.keys() ?? [])]
    .map((lineId) => labelsById.get(lineId) || lineId)
    .slice(0, 4)
    .join(" · ");
}

function lineKey(line: Pick<GlobalMapLine, "id" | "code">): string {
  return line.code.trim()
    ? `code:${line.code.trim().toLocaleLowerCase("fr-FR")}`
    : `id:${line.id}`;
}

function placeKind(place: NearbyPlace): string {
  return (place.kind || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_|_$/gu, "");
}

function finitePositive(value: number | undefined): number | undefined {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value : undefined;
}

function finiteNonNegative(value: number | undefined): number | undefined {
  return Number.isFinite(value) && (value ?? -1) >= 0 ? value : undefined;
}

function weightedAverage(parts: readonly { value: number; weight: number }[]): number {
  const available = parts.filter((part) => Number.isFinite(part.value) && part.weight > 0);
  const totalWeight = available.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight <= 0) return 0;
  return clamp(available.reduce((sum, part) => sum + part.value * part.weight, 0) / totalWeight);
}

function selectFacts(
  facts: readonly NeighborhoodFact[],
  polarity: NeighborhoodFactPolarity,
  limit: number,
): NeighborhoodFact[] {
  const families = new Set<string>();
  return [...facts]
    .filter((fact) => fact.polarity === polarity)
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
    .filter((fact) => {
      if (families.has(fact.family)) return false;
      families.add(fact.family);
      return true;
    })
    .slice(0, limit);
}
