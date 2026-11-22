import { nearbyOpeningHours } from "../../nearbyOpeningHours";
import type { NearbyJourney } from "../../nearbyHeavyTransports";
import { hasEstimatedNearbyJourney } from "../../nearbyJourneyTiming";
import type { NearbyPlace } from "../../nearbyPlaces";
import type { NearbyWalkingRouteProvider } from "../../nearbyWalkingRoutes";
import { DOCUMENTED_FOOD_MARKETS, type DocumentedFoodMarket } from "../foodMarketSources";
import type { MunicipalMarket } from "../municipalMarketInventory";
import { normalizeCityName, placeDistanceMeters } from "../../../../services/places/compiledPlaces";
import { makeFact } from "../facts";
import { directVenueTransitValues } from "../factPresentation";
import { SOURCE_KEYS } from "../i18nKeys";
import type { NeighborhoodQualification } from "../qualification";
import { FOOD_MARKET_RULES } from "./foodMarketRules";
export { FOOD_MARKET_RULES } from "./foodMarketRules";

const MARKET_SIZE = {
  mediumAreaM2: 1_000, largeAreaM2: 3_000, maximumLargeAreaM2: 8_000,
  smallTraders: 5, mediumTraders: 25, largeTraders: 75, maximumLargeTraders: 200,
} as const;

export function isMarketPlace(place: Pick<NearbyPlace, "kind" | "tags">): boolean {
  return place.kind === "marketplace" || place.tags?.amenity === "marketplace";
}

export function foodMarketCandidates(places: readonly NearbyPlace[],
  municipalMarkets: readonly { place: MunicipalMarket; distanceMeters: number }[] = [],
  footprints?: ReadonlyMap<string, number>) {
  const byMarket = new Map<string, FoodMarketCandidate>();
  for (const place of places) {
    if (!isMarketPlace(place)) continue;
    const record = DOCUMENTED_FOOD_MARKETS.find(market => market.placeIds.includes(place.id));
    const food = Boolean(record) || /^(food|farmers_market|produce)$/iu.test(place.tags?.marketplace ?? "")
      || /\b(?:alimentaire|fermier|fermière|farmers[’']? market)\b/iu.test(place.name);
    const id = record?.placeIds[0] ?? place.id;
    const previous = byMarket.get(id);
    if (previous && previous.place.distanceMeters <= place.distanceMeters) continue;
    byMarket.set(id, {
      id, place, food, record, openingHours: record?.openingHours ?? place.tags?.opening_hours,
      // A partial hall cannot represent the area of a documented multi-part market.
      areaM2: record ? record.areaM2 : place.areaM2,
      footprintAreaM2: record && record.placeIds.length > 1 ? undefined : footprints?.get(place.id),
    });
  }
  for (const { place, distanceMeters } of municipalMarkets) {
    // Deduplicate a named OSM market at the same location or a verified
    // municipal record that is already enriching an OSM market.
    const duplicate = place.osmPlaceId ? byMarket.get(place.osmPlaceId) : [...byMarket.values()].find(candidate =>
      candidate.record?.sourceUrl === place.sourceUrl ||
      (normalizeCityName(candidate.place.name) === normalizeCityName(place.name) && placeDistanceMeters(candidate.place, place) <= 150));
    if (duplicate?.record) continue;
    if (duplicate) byMarket.delete(duplicate.id);
    const id = place.osmPlaceId ?? place.id;
    byMarket.set(id, {
      id, place: place.osmPlaceId && duplicate ? duplicate.place : { ...place, kind: "marketplace", category: "food", distanceMeters },
      food: true, openingHours: place.openingHours ?? duplicate?.openingHours,
      areaM2: place.areaM2 ?? duplicate?.areaM2, sessionsPerWeek: place.sessionsPerWeek,
      footprintAreaM2: duplicate?.footprintAreaM2,
      listedTraders: place.listedTraders,
      record: { placeIds: [id], openingHours: place.openingHours ?? duplicate?.openingHours ?? "",
        sourceName: place.sourceName ?? place.city, sourceUrl: place.sourceUrl },
    });
  }
  return [...byMarket.values()];
}

export interface FoodMarketCandidate {
  id: string;
  place: NearbyPlace;
  food: boolean;
  record?: DocumentedFoodMarket;
  openingHours?: string;
  sessionsPerWeek?: number;
  listedTraders?: number;
  areaM2?: number;
  footprintAreaM2?: number;
}

export interface FoodMarketAccess extends FoodMarketCandidate { walkSeconds?: number; walkProvider?: NearbyWalkingRouteProvider }

export interface FoodMarketTransit {
  market: FoodMarketCandidate;
  journey: NearbyJourney;
}

export function isRegularMarket(market: FoodMarketCandidate): boolean {
  if (market.food) return true;
  const name = normalizeCityName(market.place.name);
  if (!name || /\b(?:amap|ancien|ancienne|brocante|noel)\b/u.test(`${name} ${normalizeCityName(market.place.operator ?? "")}`)) return false;
  return /\b(?:marche|halles?)\b/u.test(name)
    || Boolean(market.openingHours && nearbyOpeningHours(market.openingHours)?.some(day => day.intervals.length > 0));
}

export function assessFoodMarket(market: FoodMarketAccess, journey?: NearbyJourney) {
  const r = FOOD_MARKET_RULES;
  const hours = market.openingHours ? nearbyOpeningHours(market.openingHours) : undefined;
  const sessions = market.sessionsPerWeek ?? hours?.reduce((sum, day) => sum + (day.state === "all-day" ? 1 : day.intervals.length), 0);
  const area = market.areaM2 ?? market.footprintAreaM2 ?? 0;
  const traders = market.record?.traders ?? 0;
  const sizeTraders = Math.max(traders, market.listedTraders ?? 0);
  const size = area > MARKET_SIZE.maximumLargeAreaM2 || sizeTraders > MARKET_SIZE.maximumLargeTraders ? "exceptional"
    : area >= MARKET_SIZE.largeAreaM2 || sizeTraders >= MARKET_SIZE.largeTraders ? "large"
    : area >= MARKET_SIZE.mediumAreaM2 || sizeTraders >= MARKET_SIZE.mediumTraders ? "medium"
    : area > 0 || sizeTraders >= MARKET_SIZE.smallTraders ? "small" : "unknown";
  const premium = market.food && (area >= r.premiumAreaM2 || traders >= r.premiumTraders)
    && (sessions ?? 0) >= r.exceptionalSessions;
  const estimated = Boolean(journey && hasEstimatedNearbyJourney(journey));
  const verifiedSeconds = Math.min(market.walkSeconds ?? Infinity, estimated ? Infinity : journey?.durationSeconds ?? Infinity);
  const extendedAccess = [market.walkSeconds, journey?.durationSeconds].some(seconds =>
    seconds !== undefined && seconds > r.advantageMinutes * 60 && seconds < r.contextMinutes * 60);
  let qualification: NeighborhoodQualification = { kind: "neutral" };
  if (verifiedSeconds <= r.advantageMinutes * 60) qualification = { kind: premium ? "exceptional-bonus" : "bonus" };
  else if (premium && extendedAccess) qualification = { kind: "half-bonus" };
  else if (market.walkSeconds === undefined && !journey) qualification = { kind: "not-evaluated", reason: "insufficient-data" };
  return { hours, sessions, size, premium, qualification, estimated };
}

export function scoreFoodMarkets(markets: readonly FoodMarketAccess[] = [], transit: readonly FoodMarketTransit[] = []) {
  const accesses = new Map<string, { market: FoodMarketAccess; journey?: NearbyJourney }>();
  for (const market of markets) accesses.set(market.id, { market });
  for (const { market, journey } of transit) accesses.set(market.id, { market: accesses.get(market.id)?.market ?? market, journey });
  const durationLimit = FOOD_MARKET_RULES.contextMinutes * 60;
  const visible = [...accesses.values()].flatMap(({ market, journey: route }) => {
    const walkLimit = market.record ? FOOD_MARKET_RULES.documentedWalkingContextMinutes * 60 : durationLimit;
    const walkSeconds = (market.walkSeconds ?? Infinity) < walkLimit ? market.walkSeconds : undefined;
    const journey = route && route.durationSeconds < Math.min(walkSeconds ?? Infinity, durationLimit) ? route : undefined;
    if (walkSeconds === undefined && !journey) return [];
    const assessment = assessFoodMarket({ ...market, walkSeconds }, journey);
    const level = assessment.qualification.kind;
    const points = level === "exceptional-bonus" ? FOOD_MARKET_RULES.exceptionalBonus
      : level === "half-bonus" ? FOOD_MARKET_RULES.extendedBonus : level === "bonus" ? FOOD_MARKET_RULES.bonus : 0;
    return [{ market, ...assessment, points, walkSeconds, journey }];
  });
  return {
    points: visible.reduce((best, access) => Math.max(best, access.points), 0),
    facts: visible.map(marketAccessFact),
  };
}

function marketAccessFact(access: ReturnType<typeof assessFoodMarket> & {
  market: FoodMarketAccess; points: number; walkSeconds?: number; journey?: NearbyJourney;
}) {
  const { market, points, walkSeconds, journey } = access;
  const dayKeys = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const hours = access.hours?.filter(day => day.state === "hours" || day.state === "all-day")
    .map(day => `${dayKeys[day.day]} ${day.intervals.join(", ") || "24 h"}`).join(" · ");
  const name = market.record?.name ?? market.place.name;
  const area = market.areaM2 ?? market.footprintAreaM2;
  const city = market.place.city;
  const includeCity = city && /^(?:marché(?: couvert)?|halles?|halle de marché)$/iu.test(name);
  const fact = makeFact({
    id: `food-market:${market.id}`, kind: walkSeconds === undefined
      ? access.premium ? "foodMarketPremiumTransit" : "foodMarketDirectTransit"
      : access.premium ? "foodMarketPremium" : "foodMarketNearby",
    category: "daily-life", polarity: points ? "positive" : "neutral", family: "food-market", priority: 13,
    ...(access.qualification.kind === "exceptional-bonus" ? { emphasis: "exceptional" as const } : {}),
    ...(access.qualification.kind === "half-bonus" ? { contributionWeight: 0.5 } : {}),
    values: {
      name: includeCity ? `${name} (${city})` : name,
      minutes: walkSeconds === undefined ? "—" : Math.max(1, Math.ceil(walkSeconds / 60)),
      area: area ?? "—", traders: market.record?.traders ?? "—",
      ...(market.areaM2 === undefined && area !== undefined ? { areaFromFootprint: 1 } : {}),
      size: access.size, sessions: access.sessions ?? "—", hours: hours || market.openingHours || "—",
      ...(market.listedTraders ? { listedTraders: market.listedTraders } : {}),
      ...(journey ? directVenueTransitValues(journey) : {}),
    },
    sourceKey: journey ? SOURCE_KEYS.journeys : SOURCE_KEYS.placesAndWalking, proof: access.estimated ? "derived" : "direct",
    ruleKey: "nearbyStations.neighborhoodScore.rules.foodMarketAccess",
    ruleValues: { minutes: FOOD_MARKET_RULES.advantageMinutes, contextMinutes: FOOD_MARKET_RULES.contextMinutes,
      bonus: FOOD_MARKET_RULES.bonus, extended: FOOD_MARKET_RULES.extendedBonus,
      premium: FOOD_MARKET_RULES.exceptionalBonus },
    ...(journey ? { travel: { journey } } : {}),
  });
  if (market.record) {
    fact.evidence.sourceUrl = market.record.sourceUrl;
    fact.evidence.sourceName = market.record.sourceName;
  }
  return fact;
}
