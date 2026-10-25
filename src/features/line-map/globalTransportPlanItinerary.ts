import type { NearbyJourneySection } from "../nearby-stations/nearbyHeavyTransports";
import type { TravelRoute } from "../nearby-stations/useTravelRoutes";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";

/** A calculated step supplied by the itinerary owner. The map only projects it. */
export interface GlobalTransportItineraryStep {
  id: string;
  kind: "preparation" | "walk" | "wait" | "transit";
  startAt: number;
  endAt: number;
  durationSeconds: number;
  courseIndex?: number;
  section: NearbyJourneySection;
}

/** Controlled itinerary: never geocode, plan, retime, or resolve exits in the map. */
export interface GlobalTransportPlanItinerary {
  origin: GeocoderPoint;
  destination: GeocoderPoint;
  route: TravelRoute;
  steps: readonly GlobalTransportItineraryStep[];
  totalWaitSeconds: number;
}

/** Shared DOM evidence for the owner timeline and its supplementary map. */
export function itineraryStepAttributes(step?: GlobalTransportItineraryStep) {
  if (!step) return {};
  return {
    "data-itinerary-step": step.id,
    "data-step-kind": step.kind,
    "data-start-at": step.startAt,
    "data-end-at": step.endAt,
    "data-duration-seconds": step.durationSeconds,
    "data-line-code": step.section.lineCode,
    "data-from": step.section.fromName,
    "data-to": step.section.toName,
    "data-stops": JSON.stringify(step.section.stopNames ?? []),
  };
}
