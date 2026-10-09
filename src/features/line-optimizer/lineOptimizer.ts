import type {
  NearbyJourneySection,
  NearbyJourneyServiceType,
} from "../nearby-stations/nearbyHeavyTransports";
import { isNearbyJourneyWaitingSection } from "../nearby-stations/nearbyJourneyTiming";
import { isTurboTransit, turboTime, type TurboCourse } from "../nearby-stations/travelTurbo";
import type { TravelRoute } from "../nearby-stations/useTravelRoutes";
import { optimizerNameKey, type LineOptimizerConfig } from "./optimizerConfig";

export interface LineOptimizerSettings {
  exitSeconds: number;
  walkSeconds?: number;
  transferSeconds?: number;
  marginSeconds: number;
  preferSemiDirect: boolean;
  semiDirectWaitToleranceSeconds: number;
  maxArrivalDelaySeconds: number;
  departureWindowSeconds: number;
}
export const DEFAULT_OPTIMIZER_SETTINGS: LineOptimizerSettings = {
  exitSeconds: 60,
  walkSeconds: 90,
  transferSeconds: 180,
  marginSeconds: 30,
  preferSemiDirect: true,
  semiDirectWaitToleranceSeconds: 120,
  maxArrivalDelaySeconds: 600,
  departureWindowSeconds: 3600,
};

export interface LineOptimizerCandidate {
  id: string;
  route: TravelRoute;
  tram: TurboCourse;
  train: TurboCourse;
  leaveAt: number;
  walkAt: number;
  platformAt: number;
  arriveAt: number;
  walkSeconds: number;
  transferSeconds: number;
  providerWalkSeconds: number;
  providerTransferSeconds: number;
  waitSeconds: number;
  serviceType?: NearbyJourneyServiceType;
}

export function isOptimizerRoute(route: TravelRoute, config: LineOptimizerConfig): boolean {
  const legs = route.sections.filter(isTurboTransit);
  if (legs.length !== 2) return false;
  const [tram, train] = legs;
  return (
    tram?.lineMode === config.mode &&
    optimizerNameKey(tram.lineCode) === optimizerNameKey(config.lineCode) &&
    train?.lineMode === config.connectingMode &&
    optimizerNameKey(train.lineCode) === optimizerNameKey(config.connectingLineCode) &&
    optimizerNameKey(tram.toName) === optimizerNameKey(config.transferName) &&
    optimizerNameKey(train.fromName) === optimizerNameKey(config.transferName)
  );
}

/** Only dated provider evidence is eligible as the degraded baseline. */
export function optimizerBaselineCourses(route: TravelRoute): TurboCourse[][] {
  return route.sections.filter(isTurboTransit).map((section, index) => {
    const departure = turboTime(section.departureDateTime);
    const arrival = turboTime(section.arrivalDateTime);
    if (departure === undefined || arrival === undefined || arrival < departure) return [];
    return [
      {
        id: section.vehicleJourneyId ?? `${route.id}:${index}`,
        vehicleJourneyId: section.vehicleJourneyId,
        departure,
        arrival,
        baseDeparture: departure,
        baseArrival: arrival,
        source: section.timingSource ?? "schedule",
        mission: section.mission,
        direction: section.direction,
        stopNames: section.stopNames,
        serviceType: section.serviceType,
      },
    ];
  });
}

const movementSeconds = (sections: NearbyJourneySection[]) =>
  sections
    .filter((section) => !isNearbyJourneyWaitingSection(section))
    .reduce((total, section) => total + section.durationSeconds, 0);

/** Enumerate real fixed-leg courses; never infer frequency or manufacture times. */
export function enumerateOptimizerCandidates(
  route: TravelRoute,
  batches: TurboCourse[][],
  settings: LineOptimizerSettings,
  start: number,
): LineOptimizerCandidate[] {
  const indexes = route.sections.flatMap((section, index) =>
    isTurboTransit(section) ? [index] : [],
  );
  if (indexes.length !== 2 || batches.length !== 2) return [];
  const first = indexes[0]!;
  const second = indexes[1]!;
  const movement = route.sections.filter(
    (section) => !isTurboTransit(section) && !isNearbyJourneyWaitingSection(section),
  );
  if (
    movement.some(
      (section) => !Number.isFinite(section.durationSeconds) || section.durationSeconds < 0,
    )
  )
    return [];
  const providerWalkSeconds = movementSeconds(route.sections.slice(0, first));
  const providerTransferSeconds = movementSeconds(route.sections.slice(first + 1, second));
  const egressSeconds = movementSeconds(route.sections.slice(second + 1));
  const walkSeconds = settings.walkSeconds ?? providerWalkSeconds;
  const transferSeconds = settings.transferSeconds ?? providerTransferSeconds;
  if (
    ![
      start,
      walkSeconds,
      transferSeconds,
      settings.exitSeconds,
      settings.marginSeconds,
      settings.departureWindowSeconds,
      settings.maxArrivalDelaySeconds,
      settings.semiDirectWaitToleranceSeconds,
    ].every((value) => Number.isFinite(value) && value >= 0)
  )
    return [];
  const result: LineOptimizerCandidate[] = [];
  for (const tram of batches[0]!) {
    if (![tram.departure, tram.arrival].every(Number.isFinite) || tram.arrival < tram.departure)
      continue;
    const walkAt = tram.departure - walkSeconds * 1000;
    const leaveAt = walkAt - settings.exitSeconds * 1000;
    if (leaveAt < start || leaveAt > start + settings.departureWindowSeconds * 1000) continue;
    const platformAt = tram.arrival + transferSeconds * 1000;
    for (const train of batches[1]!) {
      if (
        ![train.departure, train.arrival].every(Number.isFinite) ||
        train.arrival < train.departure
      )
        continue;
      const waitSeconds = (train.departure - platformAt) / 1000;
      if (waitSeconds < settings.marginSeconds) continue;
      result.push({
        id: `${route.id}:${tram.id}:${train.id}`,
        route,
        tram,
        train,
        leaveAt,
        walkAt,
        platformAt,
        arriveAt: train.arrival + egressSeconds * 1000,
        walkSeconds,
        transferSeconds,
        providerWalkSeconds,
        providerTransferSeconds,
        waitSeconds,
        serviceType: train.serviceType,
      });
    }
  }
  return result;
}

/** Waiting is primary, bounded by an explicit arrival ceiling. Express service
 * can win only within the user's small allowed additional platform wait. */
export function rankOptimizerCandidates(
  candidates: LineOptimizerCandidate[],
  settings: LineOptimizerSettings,
) {
  const unique = [
    ...new Map(
      candidates.map((candidate) => [
        `${candidate.route.transitSections.map((s) => [s.lineId, s.fromStopPointId, s.toStopPointId].join(":"))}:${candidate.tram.departure}:${candidate.train.departure}:${candidate.train.arrival}`,
        candidate,
      ]),
    ).values(),
  ];
  const earliestArrival = Math.min(...unique.map((candidate) => candidate.arriveAt));
  const eligible = unique.filter(
    (candidate) => candidate.arriveAt <= earliestArrival + settings.maxArrivalDelaySeconds * 1000,
  );
  eligible.sort(
    (a, b) => a.waitSeconds - b.waitSeconds || a.arriveAt - b.arriveAt || b.leaveAt - a.leaveAt,
  );
  if (settings.preferSemiDirect && eligible.length) {
    const express = eligible.filter(
      (candidate) =>
        candidate.serviceType === "semi-direct" &&
        candidate.waitSeconds <= eligible[0]!.waitSeconds + settings.semiDirectWaitToleranceSeconds,
    );
    if (express.length) {
      const winner = express[0]!;
      return [winner, ...eligible.filter((candidate) => candidate !== winner)];
    }
  }
  return eligible;
}
