import type { TranslationKey, TranslationParams } from "../../../i18n";
import type { NearbyPlace } from "../nearbyPlaces";
import type { EducationFactGroupId, NeighborhoodCategoryId, NeighborhoodFact, NeighborhoodFactKind, NeighborhoodScoreInput, NeighborhoodWalkingMetrics } from "./contracts";
import { EDUCATION_KINDS, NEIGHBORHOOD_WALKING_LIMIT_MINUTES, RICH_COMMERCIAL_SPECIALTIES, SPORTS_KINDS, SUPERMARKET_KINDS } from "./contracts";
import { makeFact } from "./facts";
import { RULE_KEYS, SOURCE_KEYS } from "./i18nKeys";
import { finiteNonNegative, finitePositive, normalizeScoreText } from "./primitives";

export interface ScoredPlace {
  place: NearbyPlace;
  minutes: number;
  distanceMeters: number;
  routed: boolean;
}

export function formatSupermarketLabel(place: ScoredPlace): string {
  const name = place.place.name.trim() || place.place.brand?.trim() || place.place.operator?.trim() || "Supermarché";
  return `${name} (${place.routed ? "" : "≈"}${place.minutes} min${place.routed ? " à pied" : ""})`;
}

export function formatEducationPlaceLabel(place: ScoredPlace): string {
  const name = place.place.name.trim()
    || place.place.brand?.trim()
    || place.place.operator?.trim()
    || "Établissement éducatif";
  return `${name} (${place.routed ? "" : "≈"}${place.minutes} min${place.routed ? " à pied" : ""})`;
}

export function scorePlaces(
  input: NeighborhoodScoreInput,
  predicate: (place: NearbyPlace) => boolean,
  limitMinutes = NEIGHBORHOOD_WALKING_LIMIT_MINUTES,
): ScoredPlace[] {
  return input.places
    .filter(predicate)
    .map((place) => scorePlace(place, input.walkingRoutes?.[place.id]))
    .filter((place) => place.minutes <= limitMinutes)
    .sort((left, right) => left.minutes - right.minutes
      || left.distanceMeters - right.distanceMeters
      || left.place.name.localeCompare(right.place.name, "fr"));
}

export function isSportsPlace(place: NearbyPlace): boolean {
  const kind = placeKind(place);
  const identity = normalizeScoreText([place.kind, place.name, place.brand, place.operator]
    .filter(Boolean)
    .join(" "));
  return SPORTS_KINDS.has(kind)
    || /(?:gymnase|stade|terrain\s+(?:de\s+)?sport|centre\s+sportif|equipement\s+sportif|complexe\s+sportif|club\s+sportif|tennis|city\s+stade|archers?)/iu.test(identity);
}

export function isEducationPlace(place: NearbyPlace): boolean {
  return EDUCATION_KINDS.has(placeKind(place));
}

export function classifyEducationPlace(place: NearbyPlace): EducationFactGroupId {
  const kind = placeKind(place);
  const identity = normalizeScoreText([
    place.kind,
    place.name,
    place.brand,
    place.operator,
    place.tags?.amenity,
    place.tags?.["school:level"],
  ].filter(Boolean).join(" "));

  if (kind === "kindergarten" || kind === "nursery" || kind === "childcare"
    || /\b(?:creche|micro\s+creche|multi\s+accueil|halte\s+garderie|nursery|childcare)\b/iu.test(identity)) {
    return "nursery";
  }
  if (kind === "college" || /\bcollege\b/iu.test(identity)) return "college";
  if (kind === "high_school" || kind === "lycee"
    || /\b(?:lycee|high\s+school|secondary\s+school)\b/iu.test(identity)) {
    return "high-school";
  }
  if (/\b(?:ecole\s+(?:elementaire|primaire)|elementary\s+school|primary\s+school)\b/iu.test(identity)) {
    return "elementary";
  }
  if (/\b(?:ecole\s+)?maternelle\b/iu.test(identity)) return "maternelle";
  return "other";
}

export function isTennisPlace(place: NearbyPlace): boolean {
  const identity = normalizeScoreText([place.kind, place.name, place.brand, place.operator]
    .filter(Boolean)
    .join(" "));
  return placeKind(place) === "tennis" || /\btennis\b/iu.test(identity);
}

export function isSupermarketLike(place: NearbyPlace): boolean {
  const kind = placeKind(place);
  if (SUPERMARKET_KINDS.has(kind)) return true;
  const identity = normalizeScoreText([place.name, place.brand, place.operator].filter(Boolean).join(" "));
  return /\b(?:u\s*express|express\s+u|intermarche|carrefour\s+(?:city|market|contact|express)|monoprix|franprix|casino\s+shop|g20|coccimarket|utile|village\s+du\s+bio)\b/iu.test(identity);
}

export function findRichCommercialStreetCluster(input: NeighborhoodScoreInput): ScoredPlace[] | undefined {
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

export function collapseCommercialLocations(places: ScoredPlace[]): ScoredPlace[] {
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

export function commercialDistanceMeters(left: Pick<NearbyPlace, "lat" | "lon">, right: Pick<NearbyPlace, "lat" | "lon">): number {
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

export function makePlaceFact(options: {
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

export function makePlaceCountFact(options: {
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

export function placeKind(place: NearbyPlace): string {
  return (place.kind || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_|_$/gu, "");
}
