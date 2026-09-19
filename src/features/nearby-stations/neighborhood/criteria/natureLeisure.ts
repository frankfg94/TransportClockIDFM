import type { TranslationParams } from "../../../../i18n";
import type { NearbyJourney } from "../../nearbyHeavyTransports";
import { analyzeNearbyJourneyTiming, isNearbyJourneyTransitSection } from "../../nearbyJourneyTiming";
import type { PublicGreenSpaceAccess } from "../../neighborhoodVerdictApi";
import type { NeighborhoodCategoryResult, NeighborhoodExceptionalGreenSpaceAccess, NeighborhoodFact, NeighborhoodGreenSpaceJourney, NeighborhoodScoreInput } from "../contracts";
import { NEIGHBORHOOD_EXCEPTIONAL_GREEN_SPACE_RULES, NEIGHBORHOOD_MANY_SPORTS_RULES, NEIGHBORHOOD_TENNIS_STACK_RULES, NEIGHBORHOOD_WALKING_LIMIT_MINUTES } from "../contracts";
import { category, makeFact, withFacts } from "../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../i18nKeys";
import { chooseFastestJourney } from "../journeys";
import type { ScoredPlace } from "../places";
import { isSportsPlace, isTennisPlace, makePlaceFact, scorePlaces } from "../places";
import { clamp, normalizeScoreText, saturatingNeighborhoodBonus } from "../primitives";

export function buildNatureLeisureCategory(input: NeighborhoodScoreInput): NeighborhoodCategoryResult {
  const base = category("nature-leisure");
  const greenSpaceFacts = [
    ...buildExceptionalGreenSpaceWalkingFacts(input.backendVerdict?.nearbyGreenSpaces),
    ...buildGreenSpaceTransitFacts(input.greenSpaceJourneys),
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
    ? scorePlaces(input, (place) => place.category === "culture" || place.category === "attraction")
    : [];
  if (leisure.length === 0 && greenSpaceFacts.length === 0 && sportsFacts.length === 0) {
    return {
      ...base,
      available: false,
      unavailableReasonKey: "nearbyStations.neighborhoodScore.unavailable.noRelevantLeisure",
      positiveFacts: [],
      negativeFacts: [],
    };
  }
  const nearest = leisure[0];
  const positiveFacts = [...greenSpaceFacts, ...sportsFacts];
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
    score: clamp(baseScore + Math.min(2, greenSpaceFacts.length + sportsFacts.length)),
    positiveFacts,
    negativeFacts: [],
  });
}

function buildExceptionalGreenSpaceWalkingFacts(
  spaces: readonly PublicGreenSpaceAccess[] | undefined,
): NeighborhoodFact[] {
  return (spaces ?? [])
    .map((space): NeighborhoodFact | undefined => {
      const walkingMinutes = space.walkingMinutes;
      if (!Number.isFinite(walkingMinutes) || walkingMinutes === undefined || walkingMinutes < 0) {
        return undefined;
      }
      const rule = findExceptionalGreenSpaceRule(space.surfaceM2, walkingMinutes, "walking");
      if (!rule) return undefined;
      const minutes = Math.max(1, Math.ceil(walkingMinutes));
      const area = formatGreenSpaceAreaLabel(space.surfaceM2);
      return makeFact({
        id: `green-space-exceptional-walking-${space.id}`,
        kind: "greenSpaceExceptional",
        category: "nature-leisure",
        polarity: "positive",
        family: `managed-green-space:${space.id}`,
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
      const rule = findExceptionalGreenSpaceRule(
        candidate.greenSpace.surfaceM2,
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
        ruleKey: RULE_KEYS.greenSpaceExceptional,
        ruleValues: exceptionalGreenSpaceRuleValues(rule),
        emphasis: "exceptional",
        travel: { journey },
      });
    })
    .filter((fact): fact is NeighborhoodFact => Boolean(fact))
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
}

function findExceptionalGreenSpaceRule(
  surfaceM2: number | undefined,
  minutes: number,
  access: NeighborhoodExceptionalGreenSpaceAccess,
): (typeof NEIGHBORHOOD_EXCEPTIONAL_GREEN_SPACE_RULES)[number] | undefined {
  if (!Number.isFinite(surfaceM2) || surfaceM2 === undefined || surfaceM2 <= 0 || !Number.isFinite(minutes)) {
    return undefined;
  }
  return NEIGHBORHOOD_EXCEPTIONAL_GREEN_SPACE_RULES.find((rule) =>
    rule.access === access
      && surfaceM2 >= rule.minSurfaceM2
      && minutes < rule.maxMinutesExclusive,
  );
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
  return references[0] ?? section.lineMode?.toString();
}

function formatGreenSpaceAreaLabel(surfaceM2: number | undefined): string | undefined {
  if (!(surfaceM2 && surfaceM2 > 0)) return undefined;
  return surfaceM2 >= 10_000
    ? `${Math.round(surfaceM2 / 10_000)} ha`
    : `${Math.round(surfaceM2)} m²`;
}
