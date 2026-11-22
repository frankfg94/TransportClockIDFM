import type { NearbyJourney } from "../../nearbyHeavyTransports";
import { directNearbyJourneySection } from "../../nearbyJourneyTiming";

export const HOSPITAL_ACCESS_RULE = { walkingMinutes: 30, directTransitBelowSeconds: 30 * 60, maxTransfers: 0, searchRadiusMeters: 5000 } as const;

export function qualifiesHospitalTransit(journey: NearbyJourney): boolean {
  return journey.durationSeconds > 0 && journey.durationSeconds < HOSPITAL_ACCESS_RULE.directTransitBelowSeconds
    && Boolean(directNearbyJourneySection(journey));
}
