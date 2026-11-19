import type { NearbyJourney } from "../../nearbyHeavyTransports";
import { isNearbyJourneyTransitSection } from "../../nearbyJourneyTiming";
import type { NearbyPlace } from "../../nearbyPlaces";
import type { NearbyWalkingRouteProvider } from "../../nearbyWalkingRoutes";
import { makeFact } from "../facts";
import { SOURCE_KEYS } from "../i18nKeys";
import type { NeighborhoodQualification } from "../qualification";

export const CINEMA_RULES = { walkingMinutes: 10, transitMinutes: 5, bonus: 1 } as const;

export function isCinema(place: NearbyPlace): boolean {
  return place.kind === "cinema" || place.tags?.amenity === "cinema";
}

export interface CinemaAccess {
  place: NearbyPlace;
  walkSeconds?: number;
  walkProvider?: NearbyWalkingRouteProvider;
  transit?: NearbyJourney;
  transitUnavailable?: boolean;
}

export function fastestCinemaTransit(journeys: readonly NearbyJourney[]): NearbyJourney | undefined {
  return journeys.filter(journey => Number.isFinite(journey.durationSeconds) && journey.durationSeconds > 0
    && journey.sections.some(isNearbyJourneyTransitSection)
    && !journey.sections.some(section => section.timingSource === "estimated" || section.walkingProvider === "straight-line"))
    .sort((a, b) => a.durationSeconds - b.durationSeconds)[0];
}

export function assessCinema(access: CinemaAccess) {
  const walk = access.walkSeconds;
  const transit = access.transit?.durationSeconds;
  const walkEligible = walk !== undefined && walk <= CINEMA_RULES.walkingMinutes * 60;
  const transitEligible = transit !== undefined && transit <= CINEMA_RULES.transitMinutes * 60;
  const qualification: NeighborhoodQualification = walkEligible || transitEligible ? { kind: "bonus" }
    : access.transitUnavailable || walk === undefined ? { kind: "not-evaluated", reason: "insufficient-data" }
    : { kind: "neutral" };
  const mode = transit !== undefined && (!walkEligible || transitEligible) && (walk === undefined || transit < walk) ? "transit" : "walk";
  const seconds = mode === "transit" ? transit : walk;
  return { qualification, mode, seconds };
}

export function scoreCinemas(cinemas: readonly CinemaAccess[] = []) {
  const ranked = cinemas.map(access => ({ access, ...assessCinema(access) }))
    .sort((a, b) => Number(b.qualification.kind === "bonus") - Number(a.qualification.kind === "bonus")
      || (a.seconds ?? Infinity) - (b.seconds ?? Infinity) || a.access.place.distanceMeters - b.access.place.distanceMeters);
  const best = ranked[0];
  if (!best) return { points: 0, facts: [] };
  const { access, mode, seconds } = best;
  const bonus = best.qualification.kind === "bonus";
  const fact = makeFact({
    id: `cinema:${access.place.id}`, kind: seconds === undefined ? "cinemaAccessUnknown" : mode === "transit" ? "cinemaTransit" : "cinemaWalking",
    category: "nature-leisure", polarity: bonus ? "positive" : "neutral", family: "cinema", priority: 13,
    values: { name: access.place.name, minutes: seconds === undefined ? "—" : Math.max(1, Math.ceil(seconds / 60)) },
    sourceKey: mode === "transit" ? SOURCE_KEYS.journeys : SOURCE_KEYS.placesAndWalking,
    proof: seconds === undefined ? "derived" : "direct",
    ruleKey: "nearbyStations.neighborhoodScore.scoreHelp.cinemas",
    ruleValues: { walking: CINEMA_RULES.walkingMinutes, transit: CINEMA_RULES.transitMinutes, bonus: CINEMA_RULES.bonus },
    ...(mode === "transit" && access.transit ? { travel: { journey: access.transit } } : {}),
  });
  return { points: bonus ? CINEMA_RULES.bonus : 0, facts: [fact] };
}
