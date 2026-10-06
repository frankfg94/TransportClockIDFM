import type { NeighborhoodCategoryResult, NeighborhoodFact, NeighborhoodScoreInput } from "../contracts";
import { DAILY_STORE_KINDS, NEIGHBORHOOD_WALKING_LIMIT_MINUTES, RESTAURANT_KINDS } from "../contracts";
import { category, makeFact, withFacts } from "../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../i18nKeys";
import { collapseCommercialLocations, commercialDistanceMeters, findRichCommercialStreetCluster, formatSupermarketLabel, isSupermarketLike, makePlaceCountFact, makePlaceFact, placeKind, scorePlaces } from "../places";
import { clamp, saturatingNeighborhoodBonus } from "../primitives";
import { isNearbyJourneyTransitSection } from "../../nearbyJourneyTiming";
import type { NearbyJourney } from "../../nearbyHeavyTransports";
import { MAJOR_SHOPPING_CENTRE_ACCESS_RULES, MAJOR_SHOPPING_CENTRE_DETECTION_RULES, type NeighborhoodShoppingCentreAccess } from "../shoppingCentres";
import { MEDIUM_SUPERMARKET_ACCESS_RULES } from "../supermarkets";
import { getSupermarketSizeAssumption } from "../supermarketSizeAssumptions";

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
  const shoppingCentreCandidates = (input.shoppingCentres ?? []).filter((centre) => {
    if (centre.areaM2 === undefined || centre.areaM2 >= MAJOR_SHOPPING_CENTRE_DETECTION_RULES.minimumMallSurfaceM2) return true;
    const supportingPlaces = input.places.filter((place) =>
      commercialDistanceMeters(centre, place) <= MAJOR_SHOPPING_CENTRE_DETECTION_RULES.supportRadiusMeters);
    const nearbyShopCount = new Set(supportingPlaces.filter((place) => Boolean(place.tags?.shop)).map((place) => place.id)).size;
    const nearbyCinemaCount = supportingPlaces.filter((place) => place.tags?.amenity === "cinema").length;
    return nearbyShopCount >= MAJOR_SHOPPING_CENTRE_DETECTION_RULES.minimumNearbyShopCount || nearbyCinemaCount > 0;
  });
  const shoppingCentre = selectAccessibleShoppingCentre(shoppingCentreCandidates);
  const score = clamp(
    2
      + saturatingNeighborhoodBonus(supermarkets.length, 2, 3)
      + saturatingNeighborhoodBonus(nearby.length, 6, 3)
      + saturatingNeighborhoodBonus(restaurants.length, 5, 2)
      + (shoppingCentre ? MAJOR_SHOPPING_CENTRE_ACCESS_RULES.scoreBonus * (shoppingCentre.mode === "walking-approx" ? 0.5 : 1) : 0),
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
  if (shoppingCentre) {
    const { centre, minutes, mode, journey } = shoppingCentre;
    const exact = mode === "walking";
    const transit = mode === "transit";
    const kind = transit
      ? "shoppingCentreNearbyTransit"
      : exact
        ? "shoppingCentreNearby"
        : "shoppingCentreNearbyApprox";
    positiveFacts.push(makeFact({
      id: "major-shopping-centre-nearby",
      kind,
      category: "daily-life",
      polarity: "positive",
      family: "major-shopping-centre",
      priority: 9,
      values: { name: centre.name, minutes },
      sourceKey: transit
        ? SOURCE_KEYS.journeys
        : exact
          ? SOURCE_KEYS.placesAndWalking
          : SOURCE_KEYS.shoppingCentres,
      proof: exact || transit ? "direct" : "derived",
      ruleKey: RULE_KEYS.shoppingCentreAccess,
      ruleValues: {
        mallArea: MAJOR_SHOPPING_CENTRE_DETECTION_RULES.minimumMallSurfaceM2,
        shopCount: MAJOR_SHOPPING_CENTRE_DETECTION_RULES.minimumNearbyShopCount,
        supportDistance: MAJOR_SHOPPING_CENTRE_DETECTION_RULES.supportRadiusMeters,
        walkingMinutes: MAJOR_SHOPPING_CENTRE_ACCESS_RULES.maximumWalkingMinutes,
        transitMinutes: MAJOR_SHOPPING_CENTRE_ACCESS_RULES.maximumTransitMinutes,
        area: centre.areaM2 ?? "—",
      },
      ...(journey ? { travel: { journey } } : {}),
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
  const supermarketFootprintsById = new Map((input.supermarketFootprints ?? [])
    .map((footprint) => [footprint.placeId, footprint.surfaceM2] as const));
  const measuredSupermarketCandidates = scorePlaces(input, (place) =>
    place.tags?.shop === "supermarket" || place.tags?.shop === "hypermarket");
  const mediumSupermarkets = measuredSupermarketCandidates.map((supermarket) => {
    const footprintSurfaceM2 = supermarketFootprintsById.get(supermarket.place.id);
    const compiledSurfaceM2 = supermarket.place.areaM2;
    const surfaceM2 = Number.isFinite(footprintSurfaceM2) && (footprintSurfaceM2 ?? 0) > 0
      ? footprintSurfaceM2
      : Number.isFinite(compiledSurfaceM2) && (compiledSurfaceM2 ?? 0) > 0
        ? compiledSurfaceM2
        : undefined;
    return {
      supermarket,
      surfaceM2,
      assumption: surfaceM2 === undefined ? getSupermarketSizeAssumption(supermarket.place) : undefined,
    };
  }).filter(({ supermarket, surfaceM2, assumption }) => {
    const walkingDurationSeconds = input.walkingRoutes?.[supermarket.place.id]?.durationSeconds;
    const isUnderWalkingLimit = typeof walkingDurationSeconds === "number"
      && Number.isFinite(walkingDurationSeconds)
      && walkingDurationSeconds >= 0
      ? walkingDurationSeconds < MEDIUM_SUPERMARKET_ACCESS_RULES.maximumWalkingMinutes * 60
      : supermarket.minutes < MEDIUM_SUPERMARKET_ACCESS_RULES.maximumWalkingMinutes;
    const sizeQualifies = surfaceM2 !== undefined
      ? surfaceM2 >= MEDIUM_SUPERMARKET_ACCESS_RULES.minimumSurfaceM2
      : (assumption?.minimumSurfaceM2Exclusive ?? 0) >= MEDIUM_SUPERMARKET_ACCESS_RULES.minimumSurfaceM2;
    return isUnderWalkingLimit
      && sizeQualifies;
  }).filter((candidate, index, candidates) => {
    const candidateSize = candidate.surfaceM2 ?? candidate.assumption?.minimumSurfaceM2Exclusive;
    return !candidates.slice(0, index).some((existing) =>
      (existing.surfaceM2 ?? existing.assumption?.minimumSurfaceM2Exclusive) === candidateSize
        && commercialDistanceMeters(existing.supermarket.place, candidate.supermarket.place) <= 25);
  });
  if (mediumSupermarkets.length > 0) {
    positiveFacts.push(makeFact({
      id: "medium-supermarkets-nearby",
      kind: "mediumSupermarketsNearby",
      category: "daily-life",
      polarity: "positive",
      family: "medium-supermarkets",
      priority: 12,
      values: {
        supermarkets: mediumSupermarkets.map(({ supermarket, surfaceM2, assumption }) => {
          const area = surfaceM2 !== undefined
            ? `${new Intl.NumberFormat("fr-FR").format(Math.round(surfaceM2))} m²`
            : `> ${new Intl.NumberFormat("fr-FR").format(assumption!.minimumSurfaceM2Exclusive)} m² (estimé)`;
          return `${formatSupermarketLabel(supermarket)} · ${area}`;
        }).join(" · "),
        minutes: MEDIUM_SUPERMARKET_ACCESS_RULES.maximumWalkingMinutes,
        count: mediumSupermarkets.length,
        minimumSurface: MEDIUM_SUPERMARKET_ACCESS_RULES.minimumSurfaceM2,
      },
      sourceKey: mediumSupermarkets.some(({ assumption }) => assumption)
        ? SOURCE_KEYS.supermarketSizeRules
        : SOURCE_KEYS.supermarketFootprints,
      proof: mediumSupermarkets.every(({ supermarket, assumption }) => supermarket.routed && !assumption) ? "direct" : "derived",
      ruleKey: RULE_KEYS.mediumSupermarketAccess,
      ruleValues: {
        minimumSurface: MEDIUM_SUPERMARKET_ACCESS_RULES.minimumSurfaceM2,
        maximumWalkingMinutes: MEDIUM_SUPERMARKET_ACCESS_RULES.maximumWalkingMinutes,
      },
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

function selectAccessibleShoppingCentre(
  centres: readonly NeighborhoodShoppingCentreAccess[],
): { centre: NeighborhoodShoppingCentreAccess; minutes: number; mode: "walking" | "walking-approx" | "transit"; journey?: NearbyJourney } | undefined {
  const walking = centres.flatMap((centre) => {
    if (!centre.walking) return [];
    const minutes = Math.max(1, Math.ceil(centre.walking.durationSeconds / 60));
    if (minutes > MAJOR_SHOPPING_CENTRE_ACCESS_RULES.maximumWalkingMinutes) return [];
    return [{
      centre,
      minutes,
      mode: centre.walking.fallback ? "walking-approx" as const : "walking" as const,
    }];
  });
  const transit = centres.flatMap((centre) => (centre.journeys ?? []).flatMap((journey) => {
    if (!journey.sections.some(isNearbyJourneyTransitSection)) return [];
    const minutes = Math.max(1, Math.ceil(journey.durationSeconds / 60));
    if (minutes > MAJOR_SHOPPING_CENTRE_ACCESS_RULES.maximumTransitMinutes) return [];
    return [{ centre, minutes, mode: "transit" as const, journey }];
  })).sort(compareShoppingCentreAccessCandidates);
  const exactWalking = walking
    .filter((candidate) => candidate.mode === "walking")
    .sort(compareShoppingCentreAccessCandidates)[0];
  if (exactWalking) return exactWalking;
  if (transit[0]) return transit[0];
  return walking
    .filter((candidate) => candidate.mode === "walking-approx")
    .sort(compareShoppingCentreAccessCandidates)[0];
}

function compareShoppingCentreAccessCandidates(
  left: { centre: NeighborhoodShoppingCentreAccess; minutes: number },
  right: { centre: NeighborhoodShoppingCentreAccess; minutes: number },
): number {
  return (right.centre.areaM2 ?? 0) - (left.centre.areaM2 ?? 0)
    || left.minutes - right.minutes
    || left.centre.distanceMeters - right.centre.distanceMeters;
}
