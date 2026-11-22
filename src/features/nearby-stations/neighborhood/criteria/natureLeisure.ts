import { REMARKABLE_GARDENS_SOURCE } from "../../remarkableGardens";
import { classifyParkWalking, findExceptionalGreenSpaceRule, NATURE_LEISURE_SCORE_RULES, NEIGHBORHOOD_EXCEPTIONAL_GREEN_SPACE_RULES, PARK_FACT_POINTS, remarkableGardenLevel, WOODLAND_ACCESS_RULE } from "./greenSpaceFactRules";
import { culturalPlacesWithinGreenSpace, greenParkSubsiteId } from "../../greenSpaceMapData";
import type { TranslationParams } from "../../../../i18n";
import type { NearbyJourney } from "../../nearbyHeavyTransports";
import { analyzeNearbyJourneyTiming, isNearbyJourneyTransitSection } from "../../nearbyJourneyTiming";
import type { PublicGreenSpaceAccess } from "../../neighborhoodVerdictApi";
import type { NeighborhoodCategoryResult, NeighborhoodFact, NeighborhoodGreenSpaceJourney, NeighborhoodScoreInput } from "../contracts";
import { NEIGHBORHOOD_MANY_SPORTS_RULES, NEIGHBORHOOD_TENNIS_STACK_RULES, NEIGHBORHOOD_WALKING_LIMIT_MINUTES } from "../contracts";
import { category, makeFact, withFacts } from "../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../i18nKeys";
import { chooseFastestJourney } from "../journeys";
import type { ScoredPlace } from "../places";
import { isSportsPlace, isTennisPlace, makePlaceFact, scorePlaces } from "../places";
import { clamp, normalizeScoreText, saturatingNeighborhoodBonus } from "../primitives";
import { DEFAULT_NEIGHBORHOOD_DAY_DEPARTURE_TIME } from "../departureTimes";
import { isCinema, scoreCinemas } from "./cinemas";
import { greenSpaceIdentity } from "../../../../../shared/greenSpaceIdentity";
import { haversineMeters } from "../../nearbyWalkingRoutes";

export function buildNatureLeisureCategory(input: NeighborhoodScoreInput): NeighborhoodCategoryResult {
  const base = category("nature-leisure");
  const cinemas = scoreCinemas(input.cinemas ?? input.places.filter(isCinema).map(place => ({ place })));
  const woodlandFacts = buildWoodlandFacts(input);
  const regionalParks = input.backendVerdict?.nearbyGreenSpaces?.filter(space => space.parkMap) ?? [];
  const gardenFacts = (input.greenSpaceJourneys ?? []).flatMap(({ garden, greenSpace, parkWalking }) => {
    const seconds = garden?.entranceWalkSeconds;
    if (garden?.publicAccess !== "open" || seconds === undefined || !Number.isFinite(seconds) || seconds < 0 || !greenSpace.parkMap) return [];
    const level = remarkableGardenLevel(garden);
    const area = formatGreenSpaceAreaLabel(greenSpace.surfaceM2);
    const fact = makeFact({
      id: `remarkable-garden:${greenSpace.id}`, family: `managed-green-space:${greenSpace.id}`,
      kind: "remarkableGarden", category: "nature-leisure", polarity: level ? "positive" : "neutral", priority: 15,
      greenMap: greenSpace.parkMap,
      values: { name: greenSpace.name, minutes: Math.ceil(seconds / 60), areaLabel: area ? ` · ${area}` : "",
        ...(parkWalking?.profile ? { km: Math.round(parkWalking.profile.meters / 100) / 10,
          loops: parkWalking.profile.loops, longest: Math.round(parkWalking.profile.longestLoopMeters) } : {}) },
      sourceKey: SOURCE_KEYS.placesAndWalking, proof: "direct",
      ruleKey: "nearbyStations.neighborhoodScore.facts.remarkableGarden.tooltip", ruleValues: {},
    });
    return [{ ...fact, evidence: { ...fact.evidence, sourceUrl: REMARKABLE_GARDENS_SOURCE } }];
  });
  const walkingFacts = (input.greenSpaceJourneys ?? []).flatMap(candidate => {
    const { greenSpace, parkWalking } = candidate;
    const profile = parkWalking?.profile;
    if (!parkWalking || !profile || !greenSpace.parkMap) return [];
    const level = classifyParkWalking(profile);
    const accessFact = buildExceptionalGreenSpaceWalkingFacts([greenSpace])[0]
      ?? buildGreenSpaceTransitFacts([candidate], input.journeyDepartureTime)[0];
    const fact = makeFact({
      id: `park-walking:${greenSpace.id}`, family: `park-walking:${greenSpace.id}`,
      kind: "parkWalking", category: "nature-leisure", polarity: level ? "positive" : "neutral",
      priority: 16, greenMap: greenSpace.parkMap,
      emphasis: level === 3 ? "exceptional" : undefined, markerEmphasis: level === 2 ? "strong" : undefined,
      values: { name: greenSpace.name, km: Math.round(profile.meters / 100) / 10, loops: profile.loops, features: profile.features,
        longest: Math.round(profile.longestLoopMeters), density: Math.round(profile.featuresPerHectare * 100) / 100, kinds: profile.featureKinds,
        picnic: profile.picnic ? 1 : 0, minutes: Math.ceil(parkWalking.accessMinutes) },
      sourceKey: SOURCE_KEYS.places, proof: "derived",
      ruleKey: "nearbyStations.neighborhoodScore.facts.parkWalking.tooltip", ruleValues: {},
    });
    return [accessFact ? { ...fact, labelKey: accessFact.labelKey, labelValues: accessFact.labelValues } : fact];
  });
  // A measured promenade level takes precedence. An unclassified network keeps the surface-based rule.
  const promotedParks = new Set(walkingFacts.filter(fact => fact.polarity === "positive").flatMap(fact =>
    fact.greenMap?.scope === "park" ? [fact.greenMap.id] : []));
  const gardenIds = new Set(gardenFacts.filter(fact => fact.polarity === "positive")
    .map(fact => fact.greenMap && "id" in fact.greenMap ? fact.greenMap.id : ""));
  const neutralGardens = gardenFacts.filter(fact => fact.polarity === "neutral");
  const documentedGardens = new Set(gardenFacts.map(fact => fact.greenMap && "id" in fact.greenMap ? fact.greenMap.id : ""));
  const unconfirmedPublicIds = new Set(input.greenSpaceJourneys?.filter(item =>
    item.garden && item.garden.publicAccess !== "open").map(item => item.greenSpace.id));
  base.neutralFacts = [...neutralGardens, ...walkingFacts.filter(fact => fact.polarity === "neutral"), ...[
    ...buildParkSubsiteFacts(input, regionalParks),
    ...buildParkCultureFacts(input, regionalParks),
    ...woodlandFacts.filter(fact => fact.polarity === "neutral"),
    ...cinemas.facts.filter(fact => fact.polarity === "neutral"),
    ...(input.greenSpaceFootprints ?? []).filter(space => !regionalParks.some(park =>
      greenSpaceIdentity(park.name) === greenSpaceIdentity(space.name) && Math.abs(park.distanceMeters - space.distanceMeters) <= 1200))
      .map((space) => makeFact({
      id: `osm-green-space-${space.id}`,
      kind: "greenSpaceFootprint",
      category: "nature-leisure",
      polarity: "neutral",
      family: `osm-green-space:${space.id}`,
      priority: 12,
      values: { name: space.name, meters: space.distanceMeters },
      greenMap: { scope: "park", id: space.id },
      sourceKey: "nearbyStations.neighborhoodScore.datasets.osm-green-space-footprints",
      proof: "direct",
      ruleKey: "nearbyStations.neighborhoodScore.rules.greenSpaceFootprint",
      ruleValues: {},
    })),
  ].filter(fact => fact.greenMap?.scope !== "park" || !documentedGardens.has(fact.greenMap.id))];
  const walkingSpaces = new Map(input.backendVerdict?.nearbyGreenSpaces?.map(space => [space.id, space]));
  for (const { greenSpace } of input.greenSpaceJourneys ?? []) {
    if (!greenSpace.id.includes("#")) walkingSpaces.set(greenSpace.id, greenSpace);
  }
  const greenSpaceFacts = [
    ...gardenFacts.filter(fact => fact.polarity === "positive"),
    ...walkingFacts.filter(fact => fact.polarity === "positive"),
    ...woodlandFacts.filter(fact => fact.polarity === "positive"),
    ...buildExceptionalGreenSpaceWalkingFacts([...walkingSpaces.values()].filter(space =>
      !space.woodlandMap && !unconfirmedPublicIds.has(space.id) && !gardenIds.has(space.id) && !promotedParks.has(space.id))),
    ...buildGreenSpaceTransitFacts(input.greenSpaceJourneys?.filter(({ greenSpace }) =>
      !greenSpace.woodlandMap && !greenSpace.id.includes("#") && !unconfirmedPublicIds.has(greenSpace.id)
      && !gardenIds.has(greenSpace.id) && !promotedParks.has(greenSpace.id)), input.journeyDepartureTime),
  ];
  const sports = input.placesLoaded ? scorePlaces(input, isSportsPlace) : [];
  const sportsFacts = buildSportsFacts(sports);
  if (!input.placesLoaded && greenSpaceFacts.length === 0 && sportsFacts.length === 0) {
    return {
      ...base,
      available: false,
      unavailableReasonKey: "nearbyStations.neighborhoodScore.unavailable.places",
      positiveFacts: [],
      negativeFacts: [],
    };
  }
  const leisure = input.placesLoaded
    ? scorePlaces(input, (place) => !isCinema(place) && (place.category === "culture" || place.category === "attraction"))
    : [];
  if (leisure.length === 0 && greenSpaceFacts.length === 0 && sportsFacts.length === 0 && cinemas.points === 0) {
    return {
      ...base,
      available: false,
      unavailableReasonKey: "nearbyStations.neighborhoodScore.unavailable.noRelevantLeisure",
      positiveFacts: [],
      negativeFacts: [],
    };
  }
  const nearest = leisure[0];
  const positiveFacts = [...greenSpaceFacts, ...sportsFacts, ...cinemas.facts.filter(fact => fact.polarity === "positive")];
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
    ? NATURE_LEISURE_SCORE_RULES.base + saturatingNeighborhoodBonus(leisure.length, NATURE_LEISURE_SCORE_RULES.target, NATURE_LEISURE_SCORE_RULES.maximumBonus)
    : greenSpaceFacts.length || sportsFacts.length ? NATURE_LEISURE_SCORE_RULES.factsOnlyBase : NATURE_LEISURE_SCORE_RULES.base;
  const scoredGroups = new Map<string, number>();
  for (const fact of greenSpaceFacts) {
    const group = fact.greenMap?.scope === "park" ? fact.greenMap.id.split("#", 1)[0]! : fact.id;
    const points = fact.kind === "parkWalking" ? (fact.emphasis === "exceptional" ? PARK_FACT_POINTS.exceptional : PARK_FACT_POINTS.significant) : PARK_FACT_POINTS.standard;
    scoredGroups.set(group, Math.max(scoredGroups.get(group) ?? 0, points));
  }
  const factCount = scoredGroups.size + sportsFacts.length;
  const factBonus = Math.min(NATURE_LEISURE_SCORE_RULES.factsMaximum,
    [...scoredGroups.values()].reduce((sum, points) => sum + points, sportsFacts.length));
  const rawScore = baseScore + factBonus + cinemas.points;
  const score = clamp(rawScore);
  return withFacts({
    ...base,
    available: true,
    score,
    scoreDetails: [{ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.local", method: "sum", score, rows: [
      { labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.leisure", measurement: leisure.length, measurementUnit: "count", points: baseScore },
      { labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.natureFacts", measurement: factCount, measurementUnit: "count", points: factBonus },
      ...(input.cinemas !== undefined ? [{ labelKey: "nearbyStations.neighborhoodScore.datasets.cinema-access" as const, points: cinemas.points }] : []),
      ...(score < rawScore ? [{ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.cap" as const, points: score - rawScore }] : []),
    ] }],
    positiveFacts,
    negativeFacts: [],
  });
}

function buildParkSubsiteFacts(input: NeighborhoodScoreInput, parks: readonly PublicGreenSpaceAccess[]): NeighborhoodFact[] {
  return parks.flatMap(park => (input.greenSpaceSubsites?.get(park.id) ?? []).map(site => {
    const id = greenParkSubsiteId(park.id, site.name);
    const area = formatGreenSpaceAreaLabel(site.surfaceM2);
    return makeFact({
      id, family: id, kind: "greenSpaceSubsite", category: "nature-leisure", polarity: "neutral", priority: 14,
      greenMap: { ...park.parkMap!, id },
      values: { name: site.name, park: park.name, areaLabel: area ? ` · ${area}` : "" },
      sourceKey: "nearbyStations.neighborhoodScore.datasets.ipr-public-parks", proof: "derived",
      ruleKey: "nearbyStations.neighborhoodScore.facts.greenSpaceSubsite.tooltip", ruleValues: {},
    });
  }));
}

function buildParkCultureFacts(input: NeighborhoodScoreInput, parks: readonly PublicGreenSpaceAccess[]): NeighborhoodFact[] {
  const assigned = new Set<string>();
  return parks.flatMap(park => {
    const boundary = input.greenSpaceSiteBoundaries?.get(park.id);
    if (!boundary) return [];
    return culturalPlacesWithinGreenSpace(input.places, boundary).flatMap(place => {
      if (assigned.has(place.id)) return [];
      assigned.add(place.id);
      const fact = makeFact({
        id: `park-culture:${place.id}`, family: `park-culture:${place.id}`, kind: "greenSpaceCulturalSite",
        category: "nature-leisure", polarity: "neutral", priority: 14, proof: "derived",
        values: { name: place.name, park: park.name }, sourceKey: SOURCE_KEYS.places,
        ruleKey: "nearbyStations.neighborhoodScore.facts.greenSpaceCulturalSite.tooltip", ruleValues: {},
      });
      const osm = /^(node|way|relation):(\d+)$/u.exec(place.id);
      return [{ ...fact, evidence: { ...fact.evidence,
        ...(osm ? { sourceUrl: `https://www.openstreetmap.org/${osm[1]}/${osm[2]}` } : {}) } }];
    });
  });
}

function buildWoodlandFacts(input: NeighborhoodScoreInput): NeighborhoodFact[] {
  const journeysBySite = new Map(input.greenSpaceJourneys?.map(candidate => [candidate.greenSpace.id, candidate]));
  const mappedEvidence = new Set(input.backendVerdict?.categories.find(category => category.id === "nature-leisure")?.positiveFacts
    .flatMap(fact => fact.greenMap?.scope === "park" ? [fact.greenMap.id] : []));
  return (input.backendVerdict?.nearbyGreenSpaces ?? []).flatMap(space => {
    if (space.parkMap && (mappedEvidence.has(space.parkMap.id)
      || (space.walkingMinutes !== undefined && space.walkingMinutes >= 0
        && findExceptionalGreenSpaceRule(space.mainSurfaceM2 ?? space.surfaceM2, space.walkingMinutes, "walking")))) return [];
    if (space.parkMap) return [makeFact({
      id: space.id, family: space.id, kind: "greenSpaceFootprint", category: "nature-leisure",
      polarity: "neutral", priority: 12, greenMap: space.parkMap,
      values: { name: regionalParkLabel(space, input.places), meters: space.distanceMeters },
      sourceKey: "nearbyStations.neighborhoodScore.datasets.ipr-public-parks", proof: "derived",
      ruleKey: "nearbyStations.neighborhoodScore.facts.greenSpaceFootprint.tooltip", ruleValues: {},
    })];
    if (!space.woodlandMap) return [];
    const candidate = journeysBySite.get(space.id);
    const mainTransit = candidate?.woodlandMainTransit === true;
    const route = (candidate?.journeys ?? []).filter(journey => mainTransit
      ? (journey.transferCount ?? 0) === 0 && journey.sections.filter(isNearbyJourneyTransitSection).length === 1
      : isEligibleGreenSpaceJourney(journey))
      .sort((a, b) => analyzeNearbyJourneyTiming(a).elapsedSeconds - analyzeNearbyJourneyTiming(b).elapsedSeconds)[0];
    const lines = route ? [...new Set(route.sections.filter(isNearbyJourneyTransitSection).map(formatGreenSpaceJourneyLine).filter(Boolean))].join(" · ") : "";
    const transitSeconds = route ? analyzeNearbyJourneyTiming(route).elapsedSeconds : undefined;
    const minutes = transitSeconds === undefined ? undefined : Math.ceil(transitSeconds / 60);
    const base = {
      category: "nature-leisure", polarity: "neutral", priority: 12,
      greenMap: space.woodlandMap, ruleKey: RULE_KEYS.woodlandEdge, ruleValues: {},
    } as const;
    const main = space.mainWalkingMinutes ?? candidate?.greenSpace.mainWalkingMinutes;
    const hasMain = main !== undefined && Number.isFinite(main) && main >= 0;
    const { strongWalkingBelowMinutes, walkingMaxMinutes, largeMainAreaM2, largeAccessMaxMinutes } = WOODLAND_ACCESS_RULE;
    const largeMain = (space.mainSurfaceM2 ?? 0) >= largeMainAreaM2;
    const walkingPositive = hasMain && main <= (largeMain ? largeAccessMaxMinutes : walkingMaxMinutes);
    const largeRule = {
      ruleKey: "nearbyStations.neighborhoodScore.rules.woodlandLargeMain",
      ruleValues: { hectares: largeMainAreaM2 / 10_000, minutes: largeAccessMaxMinutes, strongMinutes: strongWalkingBelowMinutes },
    } as const;
    const walking = makeFact({
      ...base,
      greenMap: space.woodlandMap.mainAccess ? space.woodlandMap : candidate?.greenSpace.woodlandMap ?? space.woodlandMap,
      ...(hasMain ? largeMain ? largeRule : {
        ruleKey: "nearbyStations.neighborhoodScore.rules.woodlandMain" as const,
        ruleValues: { minutes: walkingMaxMinutes, strongMinutes: strongWalkingBelowMinutes },
      } : {}),
      polarity: walkingPositive ? "positive" : "neutral",
      markerEmphasis: walkingPositive && main < strongWalkingBelowMinutes ? "strong" : "standard",
      id: `${space.id}:walking`, family: `${space.id}:walking`,
      kind: hasMain ? "woodlandMainWalking" : space.walkingMinutes !== undefined ? "woodlandWalking" : "woodlandNearby",
      values: { name: space.name, minutes: hasMain ? Math.ceil(main) : space.walkingMinutes ?? "",
        edgeMinutes: space.walkingMinutes ?? main ?? "", meters: space.distanceMeters },
      sourceKey: hasMain || space.walkingMinutes !== undefined ? SOURCE_KEYS.placesAndWalking : "nearbyStations.neighborhoodScore.datasets.ipr-public-parks",
      proof: "derived",
    });
    const walkingFacts = [walking];
    if (!route || !lines || transitSeconds === undefined || minutes === undefined || minutes > 60) return walkingFacts;
    const transitPositive = !walkingPositive && largeMain && mainTransit
      && transitSeconds > 0 && transitSeconds <= largeAccessMaxMinutes * 60;
    return [...walkingFacts, makeFact({
      ...base,
      ...(largeMain && mainTransit ? largeRule : {}),
      polarity: transitPositive ? "positive" : "neutral",
      id: `${space.id}:transit`, family: `${space.id}:transit`, kind: mainTransit ? "woodlandMainTransit" : "woodlandTransit",
      values: { name: space.name, lines, minutes, hour: input.journeyDepartureTime ?? DEFAULT_NEIGHBORHOOD_DAY_DEPARTURE_TIME },
      sourceKey: SOURCE_KEYS.journeys, proof: "derived", travel: { journey: route },
    })];
  });
}

function regionalParkLabel(space: PublicGreenSpaceAccess, places: NeighborhoodScoreInput["places"]): string {
  const prefix = normalizeScoreText(space.name);
  const matchingRadius = 150 + Math.min(150, Math.sqrt((space.surfaceM2 ?? 0) / Math.PI));
  const candidate = places
    .filter(place => (place.kind === "park" || place.kind === "garden") && !/\s[–—/-]\s/u.test(place.name)
      && normalizeScoreText(place.name).startsWith(`${prefix} `) && haversineMeters(place, space) <= matchingRadius)
    .sort((a, b) => haversineMeters(a, space) - haversineMeters(b, space))[0];
  return candidate?.name ?? space.name;
}

function buildExceptionalGreenSpaceWalkingFacts(
  spaces: readonly PublicGreenSpaceAccess[] | undefined,
): NeighborhoodFact[] {
  return (spaces ?? [])
    .filter(space => !isWoodlandName(space.name))
    .map((space): NeighborhoodFact | undefined => {
      const walkingMinutes = space.walkingMinutes;
      if (!Number.isFinite(walkingMinutes) || walkingMinutes === undefined || walkingMinutes < 0) {
        return undefined;
      }
      const surface = space.mainSurfaceM2 ?? space.surfaceM2;
      const rule = findExceptionalGreenSpaceRule(surface, walkingMinutes, "walking");
      if (!rule) return undefined;
      const minutes = Math.max(1, Math.ceil(walkingMinutes));
      const area = formatGreenSpaceAreaLabel(surface);
      return makeFact({
        id: `green-space-exceptional-walking-${space.id}`,
        kind: "greenSpaceExceptional",
        category: "nature-leisure",
        polarity: "positive",
        family: `managed-green-space:${space.id}`,
        greenMap: space.parkMap ?? { scope: "park", id: space.id },
        priority: 14,
        values: {
          name: space.name,
          minutes,
          access: "à pied",
          via: "",
          area: area ?? "surface non renseignée",
          areaLabel: area ? ` · ${area}` : "",
        },
        sourceKey: SOURCE_KEYS.placesAndWalking,
        proof: "direct",
        ruleKey: RULE_KEYS.greenSpaceExceptional,
        ruleValues: exceptionalGreenSpaceRuleValues(rule),
        emphasis: "exceptional",
      });
    })
    .filter((fact): fact is NeighborhoodFact => Boolean(fact))
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
}

function isWoodlandName(name: string): boolean {
  return /^(?:foret|bois)\s/u.test(normalizeScoreText(name));
}

function buildGreenSpaceTransitFacts(
  greenSpaceJourneys: readonly NeighborhoodGreenSpaceJourney[] | undefined,
  departureTime = DEFAULT_NEIGHBORHOOD_DAY_DEPARTURE_TIME,
): NeighborhoodFact[] {
  return (greenSpaceJourneys ?? [])
    .filter(candidate => !isWoodlandName(candidate.greenSpace.name))
    .map((candidate): NeighborhoodFact | undefined => {
      const walkingMinutes = candidate.greenSpace.walkingMinutes
        ?? candidate.greenSpace.estimatedWalkingMinutes;
      if (candidate.greenSpace.walkingMinutes !== undefined && findExceptionalGreenSpaceRule(
        candidate.greenSpace.mainSurfaceM2 ?? candidate.greenSpace.surfaceM2, candidate.greenSpace.walkingMinutes, "walking",
      )) return undefined;
      const journey = chooseFastestJourney(
        candidate.journeys.filter((item) => isEligibleGreenSpaceJourney(item)),
      );
      if (!journey) return undefined;
      const timing = analyzeNearbyJourneyTiming(journey);
      const rule = findExceptionalGreenSpaceRule(
        candidate.greenSpace.mainSurfaceM2 ?? candidate.greenSpace.surfaceM2,
        timing.scoreSeconds / 60,
        "transit",
      );
      if (!rule) return undefined;
      const transitSections = journey.sections.filter(isNearbyJourneyTransitSection);
      const lines = [...new Set(
        transitSections
          .map(formatGreenSpaceJourneyLine)
          .filter((value): value is string => Boolean(value)),
      )].join(" · ");
      if (!lines) return undefined;
      const area = formatGreenSpaceAreaLabel(candidate.greenSpace.mainSurfaceM2 ?? candidate.greenSpace.surfaceM2);
      return makeFact({
        id: `green-space-transit-${candidate.greenSpace.id}`,
        kind: "greenSpaceTransitNearby",
        category: "nature-leisure",
        polarity: "positive",
        family: `managed-green-space:${candidate.greenSpace.id}`,
        greenMap: candidate.greenSpace.parkMap ?? { scope: "park", id: candidate.greenSpace.id },
        priority: 13,
        values: {
          name: candidate.greenSpace.name,
          hour: departureTime,
          minutes: Math.max(1, Math.ceil(timing.scoreSeconds / 60)),
          lines,
          area: area ?? "surface non renseignée",
          areaLabel: area ? ` · ${area}` : "",
          walking: Number.isFinite(walkingMinutes) ? walkingMinutes : "—",
          elapsed: Math.max(1, Math.ceil(timing.elapsedSeconds / 60)),
          initialWait: Math.max(0, Math.ceil(timing.initialWaitSeconds / 60)),
        },
        sourceKey: SOURCE_KEYS.journeys,
        proof: "direct",
        ruleKey: RULE_KEYS.greenSpaceExceptional,
        ruleValues: exceptionalGreenSpaceRuleValues(rule),
        emphasis: "exceptional",
        travel: { journey },
      });
    })
    .filter((fact): fact is NeighborhoodFact => Boolean(fact))
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
}

function exceptionalGreenSpaceRuleValues(
  rule: (typeof NEIGHBORHOOD_EXCEPTIONAL_GREEN_SPACE_RULES)[number],
): TranslationParams {
  return {
    surface: formatGreenSpaceAreaLabel(rule.minSurfaceM2) ?? `${rule.minSurfaceM2} m²`,
    threshold: rule.maxMinutesExclusive,
    access: rule.access === "walking" ? "à pied" : "en transports",
  };
}

function buildSportsFacts(sports: readonly ScoredPlace[]): NeighborhoodFact[] {
  const facts: NeighborhoodFact[] = [];
  for (const rule of NEIGHBORHOOD_MANY_SPORTS_RULES) {
    const qualifying = sports.filter((candidate) => candidate.routed && candidate.minutes <= rule.maxMinutesInclusive);
    if (qualifying.length < rule.minimumCount) continue;
    facts.push(makeFact({
      id: `sports-facilities-${rule.maxMinutesInclusive}`,
      kind: "sportsFacilitiesNearby",
      category: "nature-leisure",
      polarity: "positive",
      family: "sports-facilities",
      priority: 13,
      values: {
        count: qualifying.length,
        threshold: rule.minimumCount,
        minutes: rule.maxMinutesInclusive,
      },
      sourceKey: SOURCE_KEYS.placesAndWalking,
      proof: "direct",
      ruleKey: RULE_KEYS.sportsFacilities,
      ruleValues: {
        threshold: rule.minimumCount,
        minutes: rule.maxMinutesInclusive,
      },
    }));
    break;
  }

  const tennis = sports.filter((candidate) => candidate.routed && isTennisPlace(candidate.place));
  const nearestTennis = tennis.find((candidate) => candidate.minutes < 10);
  if (nearestTennis) {
    // A club or a municipal complex is the common case: reporting the whole set
    // says more than the distance to one of its courts. `sports` is already
    // ordered from the closest to the farthest, which keeps both the stack and
    // its tooltip list in walking order.
    const stack = tennis.filter((candidate) =>
      candidate.minutes <= nearestTennis.minutes + NEIGHBORHOOD_TENNIS_STACK_RULES.maxMinutesFromNearest);
    if (stack.length >= NEIGHBORHOOD_TENNIS_STACK_RULES.minimumCount) {
      facts.push(makeFact({
        id: `tennis-courts-${nearestTennis.place.id}`,
        kind: "tennisCourtsStack",
        category: "nature-leisure",
        polarity: "positive",
        family: "tennis-court",
        priority: 12,
        values: {
          count: stack.length,
          minutes: nearestTennis.minutes,
        },
        places: stack.map((candidate) => ({
          name: tennisCourtName(candidate),
          minutes: candidate.minutes,
          distanceMeters: candidate.distanceMeters,
        })),
        sourceKey: SOURCE_KEYS.placesAndWalking,
        proof: "direct",
        ruleKey: RULE_KEYS.tennisStack,
        ruleValues: {
          threshold: NEIGHBORHOOD_TENNIS_STACK_RULES.minimumCount,
          spread: NEIGHBORHOOD_TENNIS_STACK_RULES.maxMinutesFromNearest,
        },
      }));
    } else {
      facts.push(makeFact({
        id: `tennis-court-${nearestTennis.place.id}`,
        kind: "tennisCourtNearby",
        category: "nature-leisure",
        polarity: "positive",
        family: "tennis-court",
        priority: 12,
        values: {
          name: tennisCourtName(nearestTennis),
          minutes: nearestTennis.minutes,
          meters: nearestTennis.distanceMeters,
        },
        sourceKey: SOURCE_KEYS.placesAndWalking,
        proof: "direct",
        ruleKey: RULE_KEYS.tennisPresence,
        ruleValues: { threshold: 10 },
      }));
    }
  }
  return facts;
}

function tennisCourtName(candidate: ScoredPlace): string {
  return candidate.place.name.trim() || "Terrain de tennis";
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
  const line = references[0];
  if (!line) return undefined;

  if (/^(?:métro|metro|rer|train|transilien|tram|tramway|câble|cable|bus|noctilien)\b/iu.test(line)) {
    return line;
  }

  const modeLabel = section.lineMode === "METRO" ? "Métro"
    : section.lineMode === "RER" ? "RER"
      : section.lineMode === "TRAIN" ? "Train"
        : section.lineMode === "TRANSILIEN" ? "Transilien"
          : section.lineMode === "TRAM" ? "Tramway"
            : section.lineMode === "CABLE" ? "Câble"
              : section.lineMode === "BUS" ? "Bus"
                : section.lineMode === "NOCTILIEN" ? "Noctilien"
                  : undefined;
  return modeLabel ? `${modeLabel} ${line}` : line;
}

function formatGreenSpaceAreaLabel(surfaceM2: number | undefined): string | undefined {
  if (!(surfaceM2 && surfaceM2 > 0)) return undefined;
  return surfaceM2 >= 10_000
    ? `${Math.round(surfaceM2 / 10_000)} ha`
    : `${Math.round(surfaceM2)} m²`;
}
