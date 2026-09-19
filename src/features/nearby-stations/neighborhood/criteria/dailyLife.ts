import type { NeighborhoodCategoryResult, NeighborhoodFact, NeighborhoodScoreInput } from "../contracts";
import { DAILY_STORE_KINDS, NEIGHBORHOOD_WALKING_LIMIT_MINUTES, RESTAURANT_KINDS } from "../contracts";
import { category, makeFact, withFacts } from "../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../i18nKeys";
import { collapseCommercialLocations, findRichCommercialStreetCluster, formatSupermarketLabel, isSupermarketLike, makePlaceCountFact, makePlaceFact, placeKind, scorePlaces } from "../places";
import { clamp, saturatingNeighborhoodBonus } from "../primitives";

export function buildDailyLifeCategory(input: NeighborhoodScoreInput): NeighborhoodCategoryResult {
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
