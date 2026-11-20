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
  minimizeBusTransfers: boolean;
  limitConnections: boolean;
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
  minimizeBusTransfers: false,
  limitConnections: false,
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

export interface LineOptimizerConnectionStep {
  kind: "walk" | "wait";
  startAt: number;
  endAt: number;
  durationSeconds: number;
}

/** Split each connection at platform arrival. Provider waits have already been
 * removed from movement time; use the selected courses, not discovery timings. */
export function optimizerConnectionSteps(
  candidate: LineOptimizerCandidate,
  courseIndex: number,
): LineOptimizerConnectionStep[] {
  const previous = candidate.courses[courseIndex - 1];
  const course = candidate.courses[courseIndex];
  const waitSeconds = candidate.waits[courseIndex];
  if (!previous || !course || waitSeconds === undefined) return [];
  const platformAt = course.departure - waitSeconds * 1000;
  const steps: LineOptimizerConnectionStep[] = [
    {
      kind: "walk",
      startAt: previous.arrival,
      endAt: platformAt,
      durationSeconds: (platformAt - previous.arrival) / 1000,
    },
    {
      kind: "wait",
      startAt: platformAt,
      endAt: course.departure,
      durationSeconds: waitSeconds,
    },
  ];
  return steps.filter((step) => step.durationSeconds > 0);
}

export type OptimizerRouteProfile = LineOptimizerConfig | "station-access";

export function optimizerCorridorIndex(route: TravelRoute, config: OptimizerRouteProfile): number {
  const legs = route.sections.filter(isTurboTransit);
  if (config === "station-access" || config.destinationOptimizer) return legs.length >= 1 ? 0 : -1;
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

export function isOptimizerRoute(route: TravelRoute, config: OptimizerRouteProfile): boolean {
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

function earliestCourseAfter(ordered: TurboCourse[]) {
  const best = ordered.slice();
  for (let i = best.length - 2; i >= 0; i--) {
    if (best[i + 1]!.arrival < best[i]!.arrival) best[i] = best[i + 1]!;
  }
  return (departure: number) => {
    let low = 0;
    let high = ordered.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (ordered[mid]!.departure < departure) low = mid + 1;
      else high = mid;
    }
    return best[low];
  };
}

/** Enumerate real fixed-leg courses; never infer frequency or manufacture times. */
export function enumerateOptimizerCandidates(
  route: TravelRoute,
  batches: TurboCourse[][],
  settings: LineOptimizerSettings,
  start: number,
  config?: OptimizerRouteProfile,
  dayEnd?: number,
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
  const second = indexes[corridorIndex + 1];
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
  const providerTransferSeconds = second === undefined ? 0 : movementSeconds(route.sections.slice(tramIndex + 1, second));
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
  const latestLeaveAt = config === "station-access" ? Infinity : start + settings.departureWindowSeconds * 1000;
  const inWindow = (leaveAt: number) => leaveAt >= start && leaveAt <= latestLeaveAt &&
    (dayEnd === undefined || leaveAt < dayEnd);
  if (indexes.length === 1 && (config === "station-access" || config?.destinationOptimizer)) {
    for (const trip of ordered[0]!) {
      const walkAt = trip.departure - walkSeconds * 1000;
      const leaveAt = walkAt - settings.exitSeconds * 1000;
      if (!inWindow(leaveAt)) continue;
      result.push({ id: `${route.id}:${trip.id}`, route, courses: [trip], waits: [0],
        totalWaitSeconds: 0, corridorIndex: 0, tram: trip, train: trip, leaveAt, walkAt,
        platformAt: trip.departure, arriveAt: trip.arrival + egressSeconds * 1000,
        walkSeconds, transferSeconds: 0, providerWalkSeconds, providerTransferSeconds: 0,
        waitSeconds: 0, serviceType: trip.serviceType });
    }
    return result;
  }
  // For a fixed first departure and route, reaching any intermediate stop
  // earlier preserves every feasible connection, even if an express overtakes.
  const onward = dayEnd === undefined ? undefined : ordered.map(earliestCourseAfter);
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
    if (!inWindow(leaveAt)) continue;
    const platformAt = tram.arrival + transferSeconds * 1000;
    const next = onward?.[corridorIndex + 1]!(platformAt + settings.marginSeconds * 1000);
    const connecting = onward ? (next ? [next] : []) : ordered[corridorIndex + 1]!;
    for (const train of connecting) {
      const waitSeconds = (train.departure - platformAt) / 1000;
      if (waitSeconds < settings.marginSeconds) continue;
      const chain = [...prefix, train];
      // Earliest reachable onward course minimizes final arrival for this RER.
      for (let i = corridorIndex + 2; i < ordered.length; i++) {
        const previous = chain.at(-1)!;
        const readyAt = previous.arrival + transfers[i - 1]! * 1000;
        const next = onward ? onward[i]!(readyAt) :
          ordered[i]!.filter((c) => c.departure >= readyAt)
            .sort((a, b) => a.arrival - b.arrival || a.departure - b.departure)[0];
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

export function rankOptimizerCandidates(
  candidates: LineOptimizerCandidate[],
  settings: LineOptimizerSettings,
  destinationOptimizer = false,
) {
  const unique = [
    ...new Map(
      candidates.map((candidate) => [
        `${candidate.route.transitSections.map((s) => [s.lineId, s.fromStopPointId, s.toStopPointId].join(":"))}:${candidate.courses.map((c) => `${c.departure}:${c.arrival}`).join(":")}`,
        candidate,
      ]),
    ).values(),
  ];
  if (destinationOptimizer) {
    const busCount = (candidate: LineOptimizerCandidate) =>
      candidate.route.transitSections.filter((section) => section.lineMode === "BUS").length;
    const earliestArrival = Math.min(...unique.map((candidate) => candidate.arriveAt));
    const preferredConnection = (candidate: LineOptimizerCandidate) =>
      candidate.route.transitSections.length <= 2 &&
      candidate.arriveAt <= earliestArrival + 10 * 60_000;
    return unique.sort((a, b) => {
      const connectionPreference = settings.limitConnections
        ? Number(preferredConnection(b)) - Number(preferredConnection(a))
        : 0;
      // Prefer at most one bus, without imposing a bus when a tram-only route exists.
      const busPreference = settings.minimizeBusTransfers
        ? Math.max(0, busCount(a) - 1) - Math.max(0, busCount(b) - 1)
        : 0;
      return connectionPreference || busPreference || a.arriveAt - b.arriveAt ||
        a.totalWaitSeconds - b.totalWaitSeconds || b.leaveAt - a.leaveAt;
    });
  }
  return rankOptimizerByWait(unique, settings, (candidate) => candidate.waitSeconds,
    (candidate) => candidate.serviceType === "semi-direct");
}

/** Prefer low waiting time within the arrival ceiling, then favor a confirmed
 * semi-direct service within the allowed additional wait. */
export function rankOptimizerByWait<T extends { arriveAt: number; leaveAt: number }>(
  candidates: readonly T[],
  settings: Pick<LineOptimizerSettings, "maxArrivalDelaySeconds" | "preferSemiDirect" | "semiDirectWaitToleranceSeconds">,
  waitSeconds: (candidate: T) => number,
  isSemiDirect: (candidate: T) => boolean,
): T[] {
  const earliestArrival = Math.min(...candidates.map((candidate) => candidate.arriveAt));
  const eligible = candidates.filter(
    (candidate) => candidate.arriveAt <= earliestArrival + settings.maxArrivalDelaySeconds * 1000,
  );
  eligible.sort(
    (a, b) => waitSeconds(a) - waitSeconds(b) || a.arriveAt - b.arriveAt || b.leaveAt - a.leaveAt,
  );
  if (settings.preferSemiDirect && eligible.length) {
    const express = eligible.find(
      (candidate) =>
        isSemiDirect(candidate) &&
        waitSeconds(candidate) <= waitSeconds(eligible[0]!) + settings.semiDirectWaitToleranceSeconds,
    );
    if (express) return [express, ...eligible.filter((candidate) => candidate !== express)];
  }
  return eligible;
}
