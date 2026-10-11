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
  courses: TurboCourse[];
  waits: number[];
  totalWaitSeconds: number;
  corridorIndex: number;
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

export function optimizerCorridorIndex(route: TravelRoute, config: LineOptimizerConfig): number {
  const legs = route.sections.filter(isTurboTransit);
  return legs.findIndex((tram, index) => {
    const train = legs[index + 1];
    return (
      tram.lineMode === config.mode &&
      optimizerNameKey(tram.lineCode) === optimizerNameKey(config.lineCode) &&
      train?.lineMode === config.connectingMode &&
      optimizerNameKey(train.lineCode) === optimizerNameKey(config.connectingLineCode) &&
      optimizerNameKey(tram.toName) === optimizerNameKey(config.transferName) &&
      optimizerNameKey(train.fromName) === optimizerNameKey(config.transferName)
    );
  });
}

export function isOptimizerRoute(route: TravelRoute, config: LineOptimizerConfig): boolean {
  return optimizerCorridorIndex(route, config) >= 0;
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
  config?: LineOptimizerConfig,
): LineOptimizerCandidate[] {
  const indexes = route.sections.flatMap((section, index) =>
    isTurboTransit(section) ? [index] : [],
  );
  const corridorIndex = config
    ? optimizerCorridorIndex(route, config)
    : indexes.length === 2
      ? 0
      : -1;
  if (corridorIndex < 0 || batches.length !== indexes.length) return [];
  const first = indexes[0]!;
  const tramIndex = indexes[corridorIndex]!;
  const second = indexes[corridorIndex + 1]!;
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
  const providerTransferSeconds = movementSeconds(route.sections.slice(tramIndex + 1, second));
  const egressSeconds = movementSeconds(route.sections.slice(indexes.at(-1)! + 1));
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
  const valid = (course: TurboCourse) =>
    [course.departure, course.arrival].every(Number.isFinite) && course.arrival >= course.departure;
  const ordered = batches.map((batch) =>
    batch.filter(valid).sort((a, b) => a.departure - b.departure),
  );
  const transfers = indexes
    .slice(1)
    .map((index, i) =>
      i === corridorIndex
        ? transferSeconds
        : movementSeconds(route.sections.slice(indexes[i]! + 1, index)),
    );
  const result: LineOptimizerCandidate[] = [];
  for (const tram of ordered[corridorIndex]!) {
    // Latest reachable feeder chain maximizes time at home for this tram.
    const prefix: TurboCourse[] = [tram];
    for (let i = corridorIndex - 1; i >= 0; i--) {
      const next = prefix[0]!;
      const previous = ordered[i]!.filter(
        (c) => c.arrival + transfers[i]! * 1000 <= next.departure,
      ).sort((a, b) => b.departure - a.departure)[0];
      if (!previous) break;
      prefix.unshift(previous);
    }
    if (prefix.length !== corridorIndex + 1) continue;
    const walkAt = prefix[0]!.departure - walkSeconds * 1000;
    const leaveAt = walkAt - settings.exitSeconds * 1000;
    if (leaveAt < start || leaveAt > start + settings.departureWindowSeconds * 1000) continue;
    const platformAt = tram.arrival + transferSeconds * 1000;
    for (const train of ordered[corridorIndex + 1]!) {
      const waitSeconds = (train.departure - platformAt) / 1000;
      if (waitSeconds < settings.marginSeconds) continue;
      const chain = [...prefix, train];
      // Earliest reachable onward course minimizes final arrival for this RER.
      for (let i = corridorIndex + 2; i < ordered.length; i++) {
        const previous = chain.at(-1)!;
        const next = ordered[i]!.filter(
          (c) => c.departure >= previous.arrival + transfers[i - 1]! * 1000,
        ).sort((a, b) => a.arrival - b.arrival || a.departure - b.departure)[0];
        if (!next) break;
        chain.push(next);
      }
      if (chain.length !== indexes.length) continue;
      const waits = chain.map((c, i) =>
        i === 0 ? 0 : (c.departure - chain[i - 1]!.arrival) / 1000 - transfers[i - 1]!,
      );
      result.push({
        id: `${route.id}:${chain.map((c) => c.id).join(":")}`,
        route,
        courses: chain,
        waits,
        totalWaitSeconds: waits.reduce((a, b) => a + b, 0),
        corridorIndex,
        tram,
        train,
        leaveAt,
        walkAt,
        platformAt,
        arriveAt: chain.at(-1)!.arrival + egressSeconds * 1000,
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
        `${candidate.route.transitSections.map((s) => [s.lineId, s.fromStopPointId, s.toStopPointId].join(":"))}:${candidate.courses.map((c) => `${c.departure}:${c.arrival}`).join(":")}`,
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
