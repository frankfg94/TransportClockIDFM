import type { NearbyJourney } from "../../nearbyHeavyTransports";
import { directNearbyJourneySection, hasEstimatedNearbyJourney } from "../../nearbyJourneyTiming";
import type { NearbyPlace } from "../../nearbyPlaces";
import type { NearbyWalkingRouteProvider } from "../../nearbyWalkingRoutes";
import { makeFact } from "../facts";
import { directVenueTransitValues } from "../factPresentation";
import { SOURCE_KEYS } from "../i18nKeys";
import type { NeighborhoodQualification } from "../qualification";

export const CINEMA_RULES = { walkingMinutes: 10, transitMinutes: 5, directTransitContextMinutes: 30, bonus: 1 } as const;
const CINEMA_AREAS = { mediumFromM2: 750, largeFromM2: 1_500 } as const;

export function isCinema(place: NearbyPlace): boolean {
  return place.kind === "cinema" || place.tags?.amenity === "cinema";
}

export interface CinemaAccess {
  place: NearbyPlace;
  walkSeconds?: number;
  walkProvider?: NearbyWalkingRouteProvider;
  footprintAreaM2?: number;
  transit?: NearbyJourney;
  transitUnavailable?: boolean;
}

function isDocumentedCinemaBonusJourney(journey: NearbyJourney): boolean {
  return journey.durationSeconds <= CINEMA_RULES.transitMinutes * 60 && !hasEstimatedNearbyJourney(journey);
}

export function fastestCinemaTransit(journeys: readonly NearbyJourney[]): NearbyJourney | undefined {
  return journeys.filter(journey => Number.isFinite(journey.durationSeconds) && journey.durationSeconds > 0
    && journey.durationSeconds < CINEMA_RULES.directTransitContextMinutes * 60 && directNearbyJourneySection(journey))
    .sort((a, b) => Number(isDocumentedCinemaBonusJourney(b)) - Number(isDocumentedCinemaBonusJourney(a))
      || a.durationSeconds - b.durationSeconds)[0];
}

export function assessCinema(access: CinemaAccess) {
  const walk = access.walkSeconds;
  const journey = access.transit && directNearbyJourneySection(access.transit) ? access.transit : undefined;
  const transit = journey?.durationSeconds;
  const area = [access.place.areaM2, access.footprintAreaM2].find(value => typeof value === "number" && Number.isFinite(value) && value > 0);
  const size = area === undefined ? undefined : area >= CINEMA_AREAS.largeFromM2 ? "large"
    : area >= CINEMA_AREAS.mediumFromM2 ? "medium" : "small";
  const walkEligible = walk !== undefined && walk <= CINEMA_RULES.walkingMinutes * 60;
  const transitEligible = journey !== undefined && journey.durationSeconds > 0
    && (size ? journey.durationSeconds < CINEMA_RULES.transitMinutes * 60 : isDocumentedCinemaBonusJourney(journey));
  const points = walkEligible ? CINEMA_RULES.bonus : transitEligible ? (size === "small" ? 0.5 : CINEMA_RULES.bonus) : 0;
  const qualification: NeighborhoodQualification = points ? { kind: points === 0.5 ? "half-bonus" : "bonus" }
    : access.transitUnavailable || walk === undefined ? { kind: "not-evaluated", reason: "insufficient-data" }
    : { kind: "neutral" };
  const mode = transit !== undefined && (walk === undefined || transit < walk) ? "transit" : "walk";
  const seconds = mode === "transit" ? transit : walk;
  return { qualification, mode, seconds, area, size, points };
}

export function scoreCinemas(cinemas: readonly CinemaAccess[] = []) {
  const ranked = cinemas.map(access => ({ access, ...assessCinema(access) }))
    .sort((a, b) => b.points - a.points
      || (a.seconds ?? Infinity) - (b.seconds ?? Infinity) || a.access.place.distanceMeters - b.access.place.distanceMeters);
  const best = ranked[0];
  if (!best) return { points: 0, facts: [] };
  const { access, mode, seconds, area, size, points } = best;
  const journey = mode === "transit" ? access.transit : undefined;
  const fact = makeFact({
    id: `cinema:${access.place.id}`, kind: seconds === undefined ? "cinemaAccessUnknown" : mode === "transit" ? "cinemaTransit" : "cinemaWalking",
    category: "nature-leisure", polarity: points ? "positive" : "neutral", family: "cinema", priority: 13,
    ...(points === 0.5 ? { contributionWeight: 0.5 } : {}),
    values: {
      name: access.place.name, minutes: seconds === undefined ? "—" : Math.max(1, Math.ceil(seconds / 60)),
      ...(area === undefined ? {} : { area, size }),
      ...(journey ? directVenueTransitValues(journey) : {}),
      ...(access.walkSeconds === undefined ? {} : { walkMinutes: Math.max(1, Math.ceil(access.walkSeconds / 60)) }),
    },
    sourceKey: mode === "transit" ? SOURCE_KEYS.journeys : SOURCE_KEYS.placesAndWalking,
    proof: seconds === undefined || (journey && hasEstimatedNearbyJourney(journey)) ? "derived" : "direct",
    ruleKey: "nearbyStations.neighborhoodScore.scoreHelp.cinemas",
    ruleValues: { walking: CINEMA_RULES.walkingMinutes, transit: CINEMA_RULES.transitMinutes, bonus: CINEMA_RULES.bonus },
    ...(journey ? { travel: { journey } } : {}),
  });
  return { points, facts: [fact] };
}
