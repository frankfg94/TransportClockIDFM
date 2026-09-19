import type { NeighborhoodCategoryResult, NeighborhoodFact, NeighborhoodScoreInput } from "../contracts";
import { HOSPITAL_KINDS, NEIGHBORHOOD_WALKING_LIMIT_MINUTES, PHARMACY_KINDS } from "../contracts";
import { category, makeFact, withFacts } from "../facts";
import { RULE_KEYS, SOURCE_KEYS } from "../i18nKeys";
import { chooseFastestJourney, summarizeJourney } from "../journeys";
import { makePlaceFact, placeKind, scorePlaces } from "../places";
import { clamp, saturatingNeighborhoodBonus } from "../primitives";

export function buildHealthCategory(input: NeighborhoodScoreInput): NeighborhoodCategoryResult {
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
  const hospitals = scorePlaces(input, (place) => HOSPITAL_KINDS.has(placeKind(place)), 30);
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

  const hospital = hospitals
    .map((candidate) => ({ candidate, journey: chooseFastestJourney(input.hospitalJourneys?.[candidate.place.id]) }))
    .filter(({ candidate, journey }) => candidate.minutes <= 30 || (journey && journey.durationSeconds <= 30 * 60))
    .sort((left, right) => (left.journey?.durationSeconds ?? left.candidate.minutes * 60)
      - (right.journey?.durationSeconds ?? right.candidate.minutes * 60))[0];
  if (hospital) {
    const journeySummary = hospital.journey ? summarizeJourney(hospital.journey) : undefined;
    const routedWalking = hospital.candidate.routed;
    const routed = Boolean(journeySummary) || routedWalking;
    const minutes = journeySummary?.durationMinutes ?? hospital.candidate.minutes;
    const via = journeySummary && journeySummary.transitSectionCount > 0
      ? journeySummary.lines
      : undefined;
    positiveFacts.push(makeFact({
      id: "hospital-nearby",
      kind: routed
        ? journeySummary?.transitSectionCount
          ? "hospitalNearby"
          : "hospitalNearbyWalking"
        : "hospitalNearbyApprox",
      category: "health",
      polarity: "positive",
      family: "hospital",
      priority: 9,
      values: { name: hospital.candidate.place.name, minutes, via },
      sourceKey: journeySummary ? SOURCE_KEYS.journeys : routedWalking ? SOURCE_KEYS.placesAndWalking : SOURCE_KEYS.places,
      proof: routed ? "direct" : "derived",
      ruleKey: RULE_KEYS.hospitalPresence,
      ruleValues: { threshold: 30 },
      travel: hospital.journey ? { journey: hospital.journey } : undefined,
    }));
  }
  return withFacts({
    ...base,
    available: true,
    score: pharmacies.length > 0 || hospital
      ? clamp(6 + saturatingNeighborhoodBonus(pharmacies.length + (hospital ? 1 : 0) - 1, 3, 2))
      : 2,
    positiveFacts,
    negativeFacts,
  });
}
