import type { GlobalTransportPlanItinerary, GlobalTransportItineraryStep } from "../line-map/globalTransportPlanItinerary";
import type { TravelRoute } from "../nearby-stations/useTravelRoutes";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import { DEFAULT_OPTIMIZER_SETTINGS, rankOptimizerByWait, type LineOptimizerCandidate } from "./lineOptimizer";
import type { LineOptimizerResult } from "./lineOptimizerProvider";
import { createLineOptimizerTimeline } from "./lineOptimizerTimeline";

export type StationAccessTiming = "realtime" | "schedule" | "mixed" | "estimated";
export type StationAccessDepartureMode = "now" | "zeroWait" | "ultimate";
export type StationAccessOptionKind = "fastest" | "recommended" | "lessWalking" | "fewerTransfers" | "direct" | "walkOnly" | "ultimate";

export interface StationAccessJourney {
  kind: StationAccessOptionKind;
  itinerary: GlobalTransportPlanItinerary;
  arrival: number;
  recommendedDeparture?: number;
  semiDirect?: boolean;
  walkingSeconds: number;
  transfers: number;
  timing: StationAccessTiming;
}

function walkingSeconds(candidate: LineOptimizerCandidate): number {
  const inVehicleSeconds = candidate.courses.reduce((total, course) =>
    total + (course.arrival - course.departure) / 1000, 0);
  return Math.max(0, (candidate.arriveAt - candidate.walkAt) / 1000 -
    inVehicleSeconds - candidate.totalWaitSeconds);
}

function timing(candidate: LineOptimizerCandidate): StationAccessTiming {
  const sources = new Set(candidate.courses.map((course) => course.source));
  if (sources.size > 1) return "mixed";
  return candidate.courses[0]!.source;
}

function createTransitItinerary(
  candidate: LineOptimizerCandidate,
  kind: StationAccessOptionKind,
  origin: GeocoderPoint,
  destination: GeocoderPoint,
  referenceStart: number,
  suggestDeparture: boolean,
): StationAccessJourney {
  return {
    kind, arrival: candidate.arriveAt, transfers: candidate.courses.length - 1,
    walkingSeconds: walkingSeconds(candidate), timing: timing(candidate),
    ...(suggestDeparture ? {
      recommendedDeparture: candidate.leaveAt,
      semiDirect: candidate.courses.some((course) => course.serviceType === "semi-direct"),
    } : {}),
    itinerary: {
      ...createLineOptimizerTimeline(candidate, origin, destination, referenceStart),
      origin, destination,
      totalWaitSeconds: candidate.totalWaitSeconds + (candidate.leaveAt - referenceStart) / 1000,
    },
  };
}

export function stationAccessUltimateJourney(
  candidate: LineOptimizerCandidate,
  origin: GeocoderPoint,
  destination: GeocoderPoint,
): StationAccessJourney {
  return createTransitItinerary(candidate, "ultimate", origin, destination, candidate.leaveAt, true);
}

function sameLineChanges(candidate: LineOptimizerCandidate): number {
  const legs = candidate.route.transitSections;
  return legs.slice(1).filter((leg, index) => {
    const previous = legs[index]!;
    if (previous.lineId && leg.lineId) return previous.lineId === leg.lineId;
    // Rail codes identify a line within its mode. Display numbers alone are
    // ambiguous for buses operated by different networks.
    return Boolean(leg.lineCode && previous.lineCode === leg.lineCode && previous.lineMode === leg.lineMode &&
      (leg.lineMode === "RER" || leg.lineMode === "METRO" || leg.lineMode === "TRANSILIEN" || leg.lineMode === "TRAM"));
  }).length;
}

export function stationAccessDirectLineKey(sections: TravelRoute["transitSections"]): string | undefined {
  if (sections.length !== 1) return undefined;
  const [leg] = sections;
  return leg!.lineId ?? (leg!.lineCode ? `${leg!.lineMode}:${leg!.lineCode}` : undefined);
}

function createWalkingItinerary(
  route: TravelRoute,
  origin: GeocoderPoint,
  destination: GeocoderPoint,
  start: number,
  preparationSeconds: number,
): StationAccessJourney {
  const id = `optimizer:walk:${route.id}`;
  const steps: GlobalTransportItineraryStep[] = [];
  let at = start;
  function add(kind: "preparation" | "walk", section: TravelRoute["sections"][number]) {
    const endAt = at + section.durationSeconds * 1000;
    steps.push({
      id: `${id}:${steps.length}`, kind, startAt: at, endAt, durationSeconds: section.durationSeconds,
      section: { ...section, departureDateTime: new Date(at).toISOString(), arrivalDateTime: new Date(endAt).toISOString() },
    });
    at = endAt;
  }
  if (preparationSeconds > 0) {
    add("preparation", { type: "preparation", fromPoint: origin, toPoint: origin, durationSeconds: preparationSeconds });
  }
  for (const section of route.sections) add("walk", section);
  return {
    kind: "walkOnly",
    arrival: at,
    transfers: 0,
    walkingSeconds: (at - start) / 1000 - preparationSeconds,
    timing: "estimated",
    itinerary: {
      origin, destination, steps, totalWaitSeconds: 0,
      route: {
        ...route, id, departureDateTime: new Date(start).toISOString(), arrivalDateTime: new Date(at).toISOString(),
        sections: steps.map((step) => step.section), durationSeconds: (at - start) / 1000,
      },
    },
  };
}

export function stationAccessJourneys(
  result: Pick<LineOptimizerResult, "candidates"> & { walkingRoutes: TravelRoute[] },
  origin: GeocoderPoint,
  destination: GeocoderPoint,
  start: number,
  preparationSeconds: number,
  departureMode: Exclude<StationAccessDepartureMode, "ultimate"> = "now",
): StationAccessJourney[] {
  const options: StationAccessJourney[] = [];
  const zeroWait = departureMode === "zeroWait";
  const isSemiDirect = (candidate: LineOptimizerCandidate) =>
    candidate.courses.some((course) => course.serviceType === "semi-direct");
  const rankByWait = (candidates: readonly LineOptimizerCandidate[]) => rankOptimizerByWait(
    candidates,
    DEFAULT_OPTIMIZER_SETTINGS,
    (candidate) => candidate.totalWaitSeconds,
    isSemiDirect,
  );
  const available = zeroWait
    ? result.candidates.filter(({ leaveAt }) => leaveAt <= start + DEFAULT_OPTIMIZER_SETTINGS.departureWindowSeconds * 1000)
    : result.candidates;
  const ranked = zeroWait ? rankByWait(available) : available;
  const candidates = ranked.map((candidate) => ({
    candidate,
    walking: walkingSeconds(candidate),
    transfers: candidate.courses.length - 1,
    sameLineChanges: sameLineChanges(candidate),
  }));
  const first = candidates[0];
  let best = first;
  if (first?.sameLineChanges) {
    const simpler = candidates.filter((choice) => choice.sameLineChanges < first.sameLineChanges &&
      (zeroWait
        ? choice.candidate.totalWaitSeconds <= first.candidate.totalWaitSeconds + DEFAULT_OPTIMIZER_SETTINGS.semiDirectWaitToleranceSeconds
        : choice.candidate.arriveAt === first.candidate.arriveAt));
    const preferred = zeroWait ? rankByWait(simpler.map(({ candidate }) => candidate))[0] : simpler[0]?.candidate;
    best = candidates.find(({ candidate }) => candidate === preferred) ?? first;
  }
  if (best) {
    const add = (candidate: LineOptimizerCandidate, kind: StationAccessOptionKind) => {
      options.push(createTransitItinerary(candidate, kind, origin, destination, zeroWait ? candidate.leaveAt : start, zeroWait));
    };
    add(best.candidate, zeroWait ? "recommended" : "fastest");
    const lessWalking = candidates.find((choice) => choice.walking < best.walking);
    if (lessWalking) add(lessWalking.candidate, "lessWalking");
    const fewerTransfers = candidates.find((choice) => choice.transfers < best.transfers);
    if (fewerTransfers && fewerTransfers !== lessWalking) add(fewerTransfers.candidate, "fewerTransfers");

    // Keep distinct direct lines even when a slightly slower arrival leaves
    // them outside the recommendation's arrival ceiling in Zero wait mode.
    const shown = new Set(options.map(({ itinerary }) => stationAccessDirectLineKey(itinerary.route.transitSections)));
    for (const candidate of available) {
      const line = stationAccessDirectLineKey(candidate.route.transitSections);
      if (!line || shown.has(line)) continue;
      shown.add(line);
      add(candidate, "direct");
    }
  }
  const walking = result.walkingRoutes.filter(({ sections }) =>
    sections.every(({ durationSeconds }) => Number.isFinite(durationSeconds) && durationSeconds >= 0))
    .map((route) => createWalkingItinerary(route, origin, destination, start, preparationSeconds))
    .sort((a, b) => a.arrival - b.arrival)[0];
  if (walking) options.push(walking);
  return options;
}
