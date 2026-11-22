import type { NeighborhoodCategoryResult, NeighborhoodFact, NeighborhoodScoreInput } from "../contracts";
import { HOSPITAL_KINDS, NEIGHBORHOOD_WALKING_LIMIT_MINUTES, PHARMACY_KINDS } from "../contracts";
import { category, makeFact, withFacts } from "../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../i18nKeys";
import { chooseFastestJourney, summarizeJourney } from "../journeys";
import { formatPharmacyLabel, makePlaceFact, placeKind, scorePlaces } from "../places";
import { clamp, saturatingNeighborhoodBonus } from "../primitives";
import { HOSPITAL_ACCESS_RULE, qualifiesHospitalTransit } from "./hospitalAccessRules";

const PHARMACY_LIST_MAX_WALKING_MINUTES = 10;
export const HEALTH_SCORE_RULES = { missing: 2, base: 6, extraTarget: 3, extraMaximum: 2, hospitalMinutes: HOSPITAL_ACCESS_RULE.walkingMinutes } as const;

export function buildHealthCategory(input: NeighborhoodScoreInput): NeighborhoodCategoryResult {
  const base = category("health");
  const accessibleHospitals = scorePlaces({ ...input, places: input.hospitalPlaces ?? input.places },
    (place) => HOSPITAL_KINDS.has(placeKind(place)), Infinity)
    .map((candidate) => {
      const journey = chooseFastestJourney(input.hospitalJourneys?.[candidate.place.id]?.filter(qualifiesHospitalTransit));
      return { candidate, journey: journey && (!candidate.routed || journey.durationSeconds < candidate.minutes * 60) ? journey : undefined };
    })
    .filter(({ candidate, journey }) => candidate.minutes <= HEALTH_SCORE_RULES.hospitalMinutes || journey);
  if (!input.placesLoaded && !accessibleHospitals.length) {
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
  const pharmaciesUnderTenMinutes = pharmacies.filter((pharmacy) =>
    pharmacy.minutes < PHARMACY_LIST_MAX_WALKING_MINUTES);
  if (pharmaciesUnderTenMinutes.length > 0) {
    const allRoutesAvailable = pharmaciesUnderTenMinutes.every((pharmacy) => pharmacy.routed);
    positiveFacts.push(makeFact({
      id: "pharmacy-nearby",
      kind: allRoutesAvailable ? "pharmaciesNearby" : "pharmaciesNearbyApprox",
      category: "health",
      polarity: "positive",
      family: "pharmacy",
      priority: 8,
      values: {
        pharmacies: pharmaciesUnderTenMinutes.map(formatPharmacyLabel).join(" · "),
        count: pharmaciesUnderTenMinutes.length,
        minutes: PHARMACY_LIST_MAX_WALKING_MINUTES,
      },
      sourceKey: allRoutesAvailable ? SOURCE_KEYS.placesAndWalking : SOURCE_KEYS.places,
      proof: allRoutesAvailable ? "direct" : "derived",
      ruleKey: RULE_KEYS.pharmacyPresence,
      ruleValues: { threshold: PHARMACY_LIST_MAX_WALKING_MINUTES },
    }));
  } else if (nearest) {
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
  } else if (input.placesLoaded) {
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

  for (const hospital of accessibleHospitals) {
    const factId = `hospital:${hospital.candidate.place.id}`;
    const journeySummary = hospital.journey ? summarizeJourney(hospital.journey) : undefined;
    const routedWalking = hospital.candidate.routed;
    const routed = Boolean(journeySummary) || routedWalking;
    const minutes = journeySummary?.durationMinutes ?? hospital.candidate.minutes;
    const via = journeySummary && journeySummary.transitSectionCount > 0
      ? journeySummary.lines
      : undefined;
    positiveFacts.push(makeFact({
      id: factId,
      kind: routed
        ? journeySummary?.transitSectionCount
          ? "hospitalNearby"
          : "hospitalNearbyWalking"
        : "hospitalNearbyApprox",
      category: "health",
      polarity: "positive",
      family: factId,
      priority: 9,
      values: { name: hospital.candidate.place.name, minutes, via },
      sourceKey: journeySummary ? SOURCE_KEYS.journeys : routedWalking ? SOURCE_KEYS.placesAndWalking : SOURCE_KEYS.places,
      proof: routed ? "direct" : "derived",
      ruleKey: RULE_KEYS.hospitalPresence,
      ruleValues: { threshold: HOSPITAL_ACCESS_RULE.walkingMinutes },
      travel: hospital.journey ? { journey: hospital.journey } : undefined,
    }));
  }
  const serviceCount = pharmacies.length + Number(accessibleHospitals.length > 0);
  const baseScore = serviceCount ? HEALTH_SCORE_RULES.base : HEALTH_SCORE_RULES.missing;
  const bonus = serviceCount ? saturatingNeighborhoodBonus(serviceCount - 1, HEALTH_SCORE_RULES.extraTarget, HEALTH_SCORE_RULES.extraMaximum) : 0;
  const score = clamp(baseScore + bonus);
  return withFacts({
    ...base,
    available: true,
    score,
    scoreDetails: [{ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.local", method: "sum", score, rows: [
      { labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.base", points: baseScore },
      { labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.healthServices", measurement: serviceCount, measurementUnit: "count", points: bonus },
    ] }],
    positiveFacts,
    negativeFacts,
  });
}
