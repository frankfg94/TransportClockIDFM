import { createLinePresentation, transitFamilyToMode } from "../../services/linePresentation";
import type {
  Departure,
  DirectionDepartureGroup,
  TransitBoardConfig,
  TransitFamily,
} from "../../types/transit";
import {
  isNearbyJourneyWalkingSection,
  type NearbyJourneySection,
} from "./nearbyHeavyTransports";
import type { TravelRoute } from "./useTravelRoutes";

export interface TravelRouteAlarmContext {
  initialMinutesBefore: number;
  walkingMinutes: number;
  safetyMinutes: number;
  transportTypeLabel: string;
}

export interface TravelRouteAlarmTarget {
  board: TransitBoardConfig;
  directionGroup: DirectionDepartureGroup;
  departure: Departure;
  context: TravelRouteAlarmContext;
}

export interface TravelRouteAlarmLabels {
  origin: string;
  destination: string;
  departure: string;
  fallback: string;
  transportTypeLabel: string;
  safetyMinutes: number;
}

/**
 * Adapts a journey departure to the same alarm contract used by station boards.
 * When available, the scheduled moment is the first public transport departure;
 * the initial walking duration can then be used as the default warning.
 */
export function createTravelRouteAlarmTarget(
  route: TravelRoute,
  labels: TravelRouteAlarmLabels,
): TravelRouteAlarmTarget | undefined {
  const firstTransitSection = findFirstTransitSection(route);
  const walkingMinutes = initialWalkingMinutes(route);
  const safetyMinutes = normalizeSafetyMinutes(labels.safetyMinutes);
  const initialMinutesBefore = Math.min(120, walkingMinutes + safetyMinutes);
  const scheduledDepartureTime = toTravelAlarmIsoDateTime(
    firstTransitSection?.departureDateTime ?? route.departureDateTime,
  );
  if (!scheduledDepartureTime) return undefined;

  const family = nearbySectionFamily(firstTransitSection);
  const lineCode = firstTransitSection?.lineCode?.trim() || labels.fallback;
  const lineRef = firstTransitSection?.lineId?.trim()
    || firstTransitSection?.lineCode?.trim()
    || `travel-route:${route.id}:walk`;
  const linePresentation = createLinePresentation({
    id: lineRef,
    code: firstTransitSection?.lineCode ?? lineCode,
    family,
    mode: transitFamilyToMode(family),
    ref: lineRef,
    shortName: lineCode,
    color: firstTransitSection?.lineColor,
    textColor: firstTransitSection?.lineTextColor,
  });
  const origin = labels.origin.trim() || labels.fallback;
  const destination = labels.destination.trim() || labels.fallback;
  const direction = firstTransitSection?.direction?.trim() || destination;
  const boardId = `travel-route-board:${route.id}`;
  const departureId = `travel-route-departure:${route.id}`;
  const directionGroupId = `travel-route-direction:${route.id}`;

  const departure: Departure = {
    id: departureId,
    lineRef,
    monitoringRef: `travel-route:${route.id}:origin`,
    stopName: origin,
    destination,
    direction,
    monitoringLabel: labels.departure,
    expectedDepartureTime: scheduledDepartureTime,
    aimedDepartureTime: scheduledDepartureTime,
    vehicleAtStop: false,
    journeyName: `travel-route:${route.id}`,
  };

  return {
    board: {
      id: boardId,
      title: origin,
      city: "",
      line: {
        ref: lineRef,
        shortName: lineCode,
        longName: lineCode,
        mode: transitFamilyToMode(family),
        ...linePresentation,
      },
      monitoringPoints: [],
      directionGroups: [{
        id: directionGroupId,
        label: direction,
        match: {},
      }],
      maxDepartures: 1,
    },
    directionGroup: {
      id: directionGroupId,
      label: direction,
      departures: [departure],
      serviceEnded: false,
    },
    departure,
    context: {
      initialMinutesBefore,
      walkingMinutes,
      safetyMinutes,
      transportTypeLabel: labels.transportTypeLabel.trim() || labels.fallback,
    },
  };
}

export function toTravelAlarmIsoDateTime(value?: string): string | undefined {
  if (!value) return undefined;

  const compact = value.match(/^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})?$/u);
  if (compact) {
    const localIso = `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6] ?? "00"}`;
    return Number.isFinite(new Date(localIso).getTime()) ? localIso : undefined;
  }

  return Number.isFinite(new Date(value).getTime()) ? value : undefined;
}

function nearbySectionFamily(section?: NearbyJourneySection): TransitFamily {
  switch (section?.lineMode) {
    case "METRO": return "METRO";
    case "RER": return "RER";
    case "TRAM": return "TRAM";
    case "TRAIN":
    case "TRANSILIEN": return "TRANSILIEN";
    case "NOCTILIEN": return "NOCTILIEN";
    case "CABLE": return "CABLE";
    default: {
      const mode = `${section?.mode ?? ""}`.toLocaleLowerCase("fr-FR");
      if (mode.includes("metro")) return "METRO";
      if (mode.includes("rer")) return "RER";
      if (mode.includes("tram")) return "TRAM";
      if (mode.includes("train") || mode.includes("rail")) return "TRANSILIEN";
      if (mode.includes("noct")) return "NOCTILIEN";
      return "BUS";
    }
  }
}

function initialWalkingMinutes(route: TravelRoute): number {
  const firstTransitIndex = firstTransitSectionIndex(route);
  const walkingSeconds = route.sections
    .slice(0, firstTransitIndex)
    .filter(isNearbyJourneyWalkingSection)
    .reduce((total, section) => total + Math.max(0, section.durationSeconds), 0);

  if (walkingSeconds <= 0) return 5;

  return Math.max(1, Math.min(120, Math.round(walkingSeconds / 60)));
}

function normalizeSafetyMinutes(value: number): number {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.min(30, Math.round(value)));
}

function firstTransitSectionIndex(route: TravelRoute): number {
  const firstTransitIndex = route.sections.findIndex(isNearbyJourneyTransitSection);
  return firstTransitIndex >= 0 ? firstTransitIndex : route.sections.length;
}

function findFirstTransitSection(route: TravelRoute): NearbyJourneySection | undefined {
  return route.sections.find(isNearbyJourneyTransitSection)
    ?? route.transitSections.find(isNearbyJourneyTransitSection)
    ?? route.transitSections[0];
}

function isNearbyJourneyTransitSection(section: NearbyJourneySection): boolean {
  const value = `${section.type ?? ""} ${section.mode ?? ""}`.toLocaleLowerCase("fr-FR");
  if (
    isNearbyJourneyWalkingSection(section)
    || value.includes("waiting")
    || value.includes("wait")
    || value.includes("boarding")
    || value.includes("alighting")
  ) {
    return false;
  }

  return Boolean(section.lineId || section.lineCode || section.lineMode);
}
