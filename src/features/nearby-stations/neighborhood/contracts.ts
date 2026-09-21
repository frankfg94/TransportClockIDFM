import type { TranslationKey, TranslationParams } from "../../../i18n";
import type { GtfsLineFrequencyResponse } from "../../../types/lineFrequency";
import type { GtfsLastService } from "../../line-map/useLineFrequencyTimetable";
import type { GlobalMapMode } from "../../transport-map/contracts/manifest";
import type { NearbyHeavyTransportCandidate, NearbyJourney } from "../nearbyHeavyTransports";
import type { NearbyPlace } from "../nearbyPlaces";
import type { NearbyStationEntry } from "../nearbyStations";
import type { PublicGreenSpaceAccess, PublicNeighborhoodVerdict, PublicVerdictSource } from "../neighborhoodVerdictApi";
import type { PublicServiceQuality, ServiceQualityLineReliability } from "../serviceQualityApi";

export const NEIGHBORHOOD_MAX_SCORE = 10;
export const NEIGHBORHOOD_WALKING_LIMIT_MINUTES = 15;
export const NEIGHBORHOOD_FREQUENCY_CONTEXT_MAX_SECONDS = 25 * 60;

export type NeighborhoodExceptionalGreenSpaceAccess = "walking" | "transit";

/**
 * Explicit barème for the exceptional green-space signal. Keeping the
 * thresholds together makes the surface/access rule inspectable and avoids
 * scattering park-specific exceptions through the score builder.
 */
export const NEIGHBORHOOD_EXCEPTIONAL_GREEN_SPACE_RULES = [
  { access: "walking", minSurfaceM2: 100_000, maxMinutesExclusive: 10 },
  { access: "walking", minSurfaceM2: 200_000, maxMinutesExclusive: 15 },
  { access: "transit", minSurfaceM2: 200_000, maxMinutesExclusive: 15 },
  { access: "walking", minSurfaceM2: 50_000, maxMinutesExclusive: 5 },
  { access: "walking", minSurfaceM2: 30_000, maxMinutesExclusive: 5 },
] as const satisfies ReadonlyArray<{
  access: NeighborhoodExceptionalGreenSpaceAccess;
  minSurfaceM2: number;
  maxMinutesExclusive: number;
}>;

/** At least 5 courts/fields at 5 min, or at least 7 at 7 min. */
export const NEIGHBORHOOD_MANY_SPORTS_RULES = [
  { minimumCount: 7, maxMinutesInclusive: 7 },
  { minimumCount: 5, maxMinutesInclusive: 5 },
] as const;

/**
 * A neighbourhood rarely offers a single isolated tennis court: it offers a
 * club, a municipal complex or a set of courts spread over a park. From two
 * courts onwards the count itself is the signal, so it replaces the
 * single-court advantage. The stack stays local to its nearest court: the
 * closest court must still satisfy the single-court rule, and the others may
 * extend up to `maxMinutesFromNearest` beyond it.
 */
export const NEIGHBORHOOD_TENNIS_STACK_RULES = {
  minimumCount: 2,
  maxMinutesFromNearest: 10,
} as const;

/**
 * A theoretical frequency only describes the daily experience when the line
 * is itself reasonably reachable from the address. The weight deliberately
 * fades before the context-only threshold so a remote rail line cannot drive
 * the transport score or create a misleading weakness.
 */
export function getNeighborhoodFrequencyRelevanceWeight(accessSeconds: number): number {
  if (!Number.isFinite(accessSeconds) || accessSeconds < 0) return 0;
  const minutes = accessSeconds / 60;
  if (minutes <= 5) return 1;
  if (minutes <= 10) return 0.9;
  if (minutes <= 15) return 0.7;
  if (minutes <= 20) return 0.3;
  if (accessSeconds <= NEIGHBORHOOD_FREQUENCY_CONTEXT_MAX_SECONDS) return 0.1;
  return 0;
}

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
  | "transportServiceQuality"
  | "majorStationUnder40"
  | "noctilienAtNight"
  | "greenSpaceExceptional"
  | "greenSpaceTransitNearby"
  | "chateletUnder30"
  | "chateletUnder45"
  | "chateletContext"
  | "chateletDirect"
  | "chateletOver60"
  | "frequencyVeryGood"
  | "frequencyLow"
  | "frequencyContext"
  | "frequencyRemote"
  | "lastServiceEarly"
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
  | "educationPlaceNearby"
  | "educationPlaceNearbyApprox"
  | "educationElementaryNearby"
  | "educationElementaryApprox"
  | "educationMaternelleNearby"
  | "educationMaternelleApprox"
  | "educationNurseriesNearby"
  | "educationNurseriesApprox"
  | "educationCollegesNearby"
  | "educationCollegesApprox"
  | "educationHighSchoolsNearby"
  | "educationHighSchoolsApprox"
  | "educationOtherNearby"
  | "educationOtherApprox"
  | "sportsFacilitiesNearby"
  | "tennisCourtNearby"
  | "tennisCourtsStack"
  | "pharmacyNearby"
  | "pharmacyNearbyApprox"
  | "hospitalNearby"
  | "hospitalNearbyWalking"
  | "hospitalNearbyApprox"
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

export interface NeighborhoodFactAction {
  labelKey: TranslationKey;
  href: string;
}

export interface NeighborhoodFactTravel {
  journey: NearbyJourney;
}

/**
 * One member of a stacked signal. Names and per-place distances stay raw so the
 * component renders them through i18n instead of baking unit words into the
 * scoring layer.
 */
export interface NeighborhoodFactPlace {
  name: string;
  minutes: number;
  distanceMeters: number;
}

/**
 * Compact line-level detail used by the nearby transport reliability fact.
 * Keeping only presentation data here avoids exposing the full indicator
 * payload in every score card.
 */
export type NeighborhoodFactTransportReliabilityLine = Pick<
  ServiceQualityLineReliability,
  "lineId" | "lineName" | "mode" | "reliabilityScore" | "labelKey"
>;

export interface NeighborhoodFact {
  id: string;
  kind: NeighborhoodFactKind;
  category: NeighborhoodCategoryId;
  polarity: NeighborhoodFactPolarity;
  /** Used to avoid repeating the same signal in a category summary. */
  family: string;
  priority: number;
  /** Exceptional signals are promoted above ordinary strengths. */
  emphasis?: "exceptional";
  labelKey?: TranslationKey;
  labelValues?: TranslationParams;
  tooltipKey?: TranslationKey;
  tooltipValues?: TranslationParams;
  label?: string;
  tooltip?: string;
  action?: NeighborhoodFactAction;
  travel?: NeighborhoodFactTravel;
  /** Members of a stacked signal, ordered from the closest to the farthest. */
  places?: readonly NeighborhoodFactPlace[];
  /** Nearby service-quality lines, ordered by decreasing reliability. */
  transportReliabilityLines?: readonly NeighborhoodFactTransportReliabilityLine[];
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
  lastServiceByLine?: ReadonlyMap<string, GtfsLastService | undefined>;
  hospitalJourneys?: Readonly<Record<string, readonly NearbyJourney[] | undefined>>;
  serviceQuality?: PublicServiceQuality;
  generatedAt?: number;
  backendVerdict?: PublicNeighborhoodVerdict;
}

export const HEAVY_SCORE_MODES = new Set<GlobalMapMode>([
  "METRO",
  "RER",
  "TRAIN",
  "TRANSILIEN",
  "TRAM",
  "CABLE",
]);

export const SUPERMARKET_KINDS = new Set(["supermarket", "hypermarket", "convenience", "grocery", "general"]);
export const DAILY_STORE_KINDS = new Set([
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
export const EDUCATION_KINDS = new Set([
  "school",
  "kindergarten",
  "nursery",
  "childcare",
  "college",
  "university",
  "language_school",
  "music_school",
  "driving_school",
  "educational_institution",
]);
export const EDUCATION_WALKING_LIMIT_MINUTES = 20;
export type EducationFactGroupId = "elementary" | "maternelle" | "nursery" | "college" | "high-school" | "other";

export const EDUCATION_FACT_GROUPS: readonly {
  id: EducationFactGroupId;
  exactKind: NeighborhoodFactKind;
  approximateKind: NeighborhoodFactKind;
  priority: number;
}[] = [
  { id: "elementary", exactKind: "educationElementaryNearby", approximateKind: "educationElementaryApprox", priority: 10 },
  { id: "maternelle", exactKind: "educationMaternelleNearby", approximateKind: "educationMaternelleApprox", priority: 9 },
  { id: "nursery", exactKind: "educationNurseriesNearby", approximateKind: "educationNurseriesApprox", priority: 9 },
  { id: "college", exactKind: "educationCollegesNearby", approximateKind: "educationCollegesApprox", priority: 9 },
  { id: "high-school", exactKind: "educationHighSchoolsNearby", approximateKind: "educationHighSchoolsApprox", priority: 8 },
  { id: "other", exactKind: "educationOtherNearby", approximateKind: "educationOtherApprox", priority: 7 },
];
export const RICH_COMMERCIAL_SPECIALTIES = [
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
export const RESTAURANT_KINDS = new Set([
  "restaurant",
  "cafe",
  "bar",
  "pub",
  "fast_food",
  "food_court",
  "ice_cream",
]);
export const PHARMACY_KINDS = new Set(["pharmacy", "chemist", "medical_supply"]);
export const HOSPITAL_KINDS = new Set(["hospital"]);
// Keep this semantic set aligned with the normalized OSM sports kinds used by
// nearbyPlacePresentation.ts. It is intentionally broader than tennis: the
// score counts distinct nearby sports facilities, not only named clubs.
export const SPORTS_KINDS = new Set([
  "sports",
  "sport",
  "tennis",
  "soccer",
  "football",
  "futsal",
  "rugby",
  "basketball",
  "volleyball",
  "handball",
  "baseball",
  "cricket",
  "badminton",
  "table_tennis",
  "archery",
  "athletics",
  "running",
  "cycling",
  "climbing",
  "martial_arts",
  "boxing",
  "wrestling",
  "gymnastics",
  "hockey",
  "skateboarding",
  "swimming",
  "fitness",
  "sports_centre",
  "sports_hall",
  "pitch",
  "stadium",
  "fitness_centre",
  "swimming_pool",
  "track",
  "golf_course",
  "miniature_golf",
  "disc_golf",
  "water_park",
  "ice_rink",
  "horse_riding",
  "recreation_ground",
  "playground",
]);
export const EARLY_LAST_SERVICE_CUTOFF_SECONDS = 21 * 60 * 60;

const NEIGHBORHOOD_FREQUENCY_LOW_THRESHOLDS: Readonly<Partial<Record<GlobalMapMode, number>>> = {
  TRANSILIEN: 15,
};

export function getNeighborhoodFrequencyLowThreshold(mode: GlobalMapMode): number {
  return NEIGHBORHOOD_FREQUENCY_LOW_THRESHOLDS[mode] ?? 10;
}
