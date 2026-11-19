import { nearbyOpeningHours } from "../../nearbyOpeningHours";
import type { NearbyPlace } from "../../nearbyPlaces";
import type { NearbyWalkingRouteProvider } from "../../nearbyWalkingRoutes";
import { DOCUMENTED_FOOD_MARKETS } from "../foodMarketSources";
import { makeFact } from "../facts";
import { SOURCE_KEYS } from "../i18nKeys";
import type { NeighborhoodQualification } from "../qualification";

export const FOOD_MARKET_RULES = {
  walkingMinutes: 15, bonus: 0.5, exceptionalBonus: 1.25,
  mediumAreaM2: 300, largeAreaM2: 1_000, exceptionalAreaM2: 2_500,
  mediumTraders: 20, largeTraders: 60, exceptionalTraders: 100, exceptionalSessions: 3,
} as const;

export function isMarketPlace(place: Pick<NearbyPlace, "kind" | "tags">): boolean {
  return place.kind === "marketplace" || place.tags?.amenity === "marketplace";
}

export function foodMarketCandidates(places: readonly NearbyPlace[]) {
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
    });
  }
  return [...byMarket.values()];
}

interface FoodMarketCandidate {
  id: string;
  place: NearbyPlace;
  food: boolean;
  record?: (typeof DOCUMENTED_FOOD_MARKETS)[number];
  openingHours?: string;
  areaM2?: number;
}

export interface FoodMarketAccess extends FoodMarketCandidate { walkSeconds?: number; walkProvider?: NearbyWalkingRouteProvider }

export function assessFoodMarket(market: FoodMarketAccess) {
  const r = FOOD_MARKET_RULES;
  const hours = market.openingHours ? nearbyOpeningHours(market.openingHours) : undefined;
  const sessions = hours?.reduce((sum, day) => sum + (day.state === "all-day" ? 1 : day.intervals.length), 0);
  const area = market.areaM2 ?? 0;
  const traders = market.record?.traders ?? 0;
  const size = area >= r.exceptionalAreaM2 || traders >= r.exceptionalTraders ? "exceptional"
    : area >= r.largeAreaM2 || traders >= r.largeTraders ? "large"
    : area >= r.mediumAreaM2 || traders >= r.mediumTraders ? "medium"
    : area > 0 || traders > 0 ? "small" : "unknown";
  const premium = market.food && size === "exceptional" && (sessions ?? 0) >= r.exceptionalSessions;
  const qualification: NeighborhoodQualification = !market.food || market.walkSeconds === undefined
    ? { kind: "not-evaluated", reason: "insufficient-data" }
    : market.walkSeconds > r.walkingMinutes * 60 ? { kind: "neutral" }
    : { kind: premium ? "exceptional-bonus" : "bonus" };
  return { hours, sessions, size, premium, qualification };
}

export function scoreFoodMarkets(markets: readonly FoodMarketAccess[] = []) {
  const ranked = markets.map(market => {
    const assessment = assessFoodMarket(market);
    const level = assessment.qualification.kind;
    const points = level === "exceptional-bonus" ? FOOD_MARKET_RULES.exceptionalBonus : level === "bonus" ? FOOD_MARKET_RULES.bonus : 0;
    return { market, ...assessment, points };
  }).sort((a, b) => b.points - a.points || Number(b.premium) - Number(a.premium)
    || Number(b.market.food) - Number(a.market.food) || a.market.place.distanceMeters - b.market.place.distanceMeters);
  const best = ranked[0];
  if (!best) return { points: 0, facts: [] };
  const { market, points } = best;
  const dayKeys = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const hours = best.hours?.filter(day => day.state === "hours" || day.state === "all-day")
    .map(day => `${dayKeys[day.day]} ${day.intervals.join(", ") || "24 h"}`).join(" · ");
  const fact = makeFact({
    id: `food-market:${market.id}`, kind: points ? best.premium ? "foodMarketPremium" : "foodMarketNearby"
      : best.premium ? "foodMarketPremiumContext" : "foodMarketContext",
    category: "daily-life", polarity: points ? "positive" : "neutral", family: "food-market", priority: 13,
    ...(points && best.premium ? { emphasis: "exceptional" as const } : {}),
    values: {
      name: market.record?.name ?? market.place.name,
      minutes: market.walkSeconds === undefined ? "—" : Math.max(1, Math.ceil(market.walkSeconds / 60)),
      area: market.areaM2 === undefined ? "—" : `${market.areaM2} m²`, traders: market.record?.traders ?? "—",
      size: best.size, sessions: best.sessions ?? "—", hours: hours || market.openingHours || "—",
    },
    sourceKey: SOURCE_KEYS.placesAndWalking, proof: points ? "direct" : "derived",
    ruleKey: "nearbyStations.neighborhoodScore.scoreHelp.foodMarkets",
    ruleValues: { minutes: FOOD_MARKET_RULES.walkingMinutes, bonus: FOOD_MARKET_RULES.bonus,
      premium: FOOD_MARKET_RULES.exceptionalBonus, area: FOOD_MARKET_RULES.exceptionalAreaM2,
      traders: FOOD_MARKET_RULES.exceptionalTraders, sessions: FOOD_MARKET_RULES.exceptionalSessions },
  });
  if (market.record) {
    fact.evidence.sourceUrl = market.record.sourceUrl;
    fact.evidence.sourceName = market.record.sourceName;
  }
  return { points, facts: [fact] };
}
