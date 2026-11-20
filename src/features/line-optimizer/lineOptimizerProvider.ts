import { fetchNavitiaJourneys } from "../../services/idfm";
import { createTravelTurboProvider } from "../../services/travelRoutes/travelTurboProvider";
import { isTurboTransit, parisDateTime, turboJourneyKey, turboSignature, turboTime } from "../nearby-stations/travelTurbo";
import type { NearbyJourney, NearbyJourneyRequest } from "../nearby-stations/nearbyHeavyTransports";
import { isNearbyJourneyWalkingSection } from "../nearby-stations/nearbyHeavyTransports";
import { isNearbyJourneyWaitingSection } from "../nearby-stations/nearbyJourneyTiming";
import type { TravelRoute } from "../nearby-stations/useTravelRoutes";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import {
  enumerateOptimizerCandidates,
  isOptimizerRoute,
  optimizerBaselineCourses,
  rankOptimizerCandidates,
  type LineOptimizerCandidate,
  type LineOptimizerSettings,
  type OptimizerRouteProfile,
} from "./lineOptimizer";
import type { LineOptimizerConfig } from "./optimizerConfig";

export interface LineOptimizerResult {
  candidates: LineOptimizerCandidate[];
  complete: boolean;
  analyzedAt: number;
  courseCount: number;
}

type OptimizerRequest = {
  origin: GeocoderPoint;
  destination: GeocoderPoint;
  settings: LineOptimizerSettings;
  start: number;
  signal: AbortSignal;
};

type StationAccessRequest = OptimizerRequest & { maxTransfers?: number; onProgress?: (percent: number) => void };

const stationAccessProfile = "station-access";
const discoveryProgress = 50;

function discoveryOptions(origin: GeocoderPoint, destination: GeocoderPoint, datetime: string, realtime: boolean, maxTransfers?: number): NearbyJourneyRequest {
  return { origin, destination, datetime, count: 20, includeDisruptions: true, includeGeoJson: true,
    ...(maxTransfers === undefined ? {} : { maxTransfers }),
    dataFreshness: realtime ? "realtime" : "base_schedule" };
}

const withinTransferLimit = (route: TravelRoute, maxTransfers?: number) =>
  maxTransfers === undefined || route.transitSections.length - 1 <= maxTransfers;

const toRoutes = (items: NearbyJourney[], access: boolean, prefix: string): TravelRoute[] =>
  items.map((journey, index) => ({
    ...journey,
    id: journey.id ? `${prefix}${journey.id}` : `${prefix}optimizer-route:${index}`,
    transitSections: journey.sections.filter(access ? isTurboTransit : (s) => Boolean(s.lineMode)),
  }));

export function createLineOptimizerProvider(
  dependencies: {
    journeys?: (request: NearbyJourneyRequest, signal: AbortSignal) => Promise<NearbyJourney[]>;
    courses?: ReturnType<typeof createTravelTurboProvider>["loadCourses"];
    now?: () => number;
  } = {},
) {
  const journeys =
    dependencies.journeys ?? ((request, signal) => fetchNavitiaJourneys(request, { signal }));
  const timetableProvider = createTravelTurboProvider();
  const courses = dependencies.courses ?? timetableProvider.loadCourses;
  const dailyCourses = dependencies.courses ?? timetableProvider.createCourseSession({ limitRequests: true });
  const now = dependencies.now ?? Date.now;
  async function analyze(
    request: StationAccessRequest & { config: OptimizerRouteProfile },
    loadCourses = courses,
    realtime = true,
  ): Promise<LineOptimizerResult & { walkingRoutes: TravelRoute[] }> {
    const { config, origin, destination, settings, start, signal, onProgress } = request;
    const access = config === stationAccessProfile;
    const maxTransfers = access ? request.maxTransfers : undefined;
    const discoveryRequest = discoveryOptions(origin, destination, parisDateTime(start + settings.exitSeconds * 1000), realtime, maxTransfers);
    const discovered = toRoutes(await journeys(discoveryRequest, signal), access, "");
    const walkingRoutes = access ? discovered.filter((route) => !route.transitSections.length && route.sections.length > 0 &&
      route.sections.every(isNearbyJourneyWalkingSection)) : [];
    const eligible = (routes: TravelRoute[]) => routes.filter((route) =>
      isOptimizerRoute(route, config) && withinTransferLimit(route, maxTransfers));
    const routes = eligible(discovered);
    signal.throwIfAborted();
    let discoveryComplete = true;
    const discoverDirect = access && maxTransfers !== 0 && destination.id?.startsWith("stop_area:");
    onProgress?.(discoverDirect ? discoveryProgress / 2 : discoveryProgress);
    if (discoverDirect) {
      try {
        const direct = await journeys({ ...discoveryRequest, maxTransfers: 0 }, signal);
        signal.throwIfAborted();
        const seen = new Set(routes.map(turboJourneyKey));
        // The regular search can favor connections and omit an entire direct line.
        for (const route of toRoutes(direct, access, "optimizer-direct:")) {
          if (route.transitSections.length !== 1) continue;
          const key = turboJourneyKey(route);
          if (seen.has(key)) continue;
          seen.add(key);
          routes.push(route);
        }
      } catch {
        signal.throwIfAborted();
        discoveryComplete = false;
      }
      onProgress?.(discoveryProgress);
    }
    if (!access && config.destinationOptimizer && settings.limitConnections) {
      try {
        const simpler = await journeys({ ...discoveryRequest, maxTransfers: 1 }, signal);
        signal.throwIfAborted();
        routes.push(...eligible(toRoutes(simpler, access, "")));
      } catch {
        signal.throwIfAborted();
        discoveryComplete = false;
      }
    }
    if (!routes.length && !access && !config.destinationOptimizer) {
      // A general search may prefer faster metros and omit the corridor.
      // Retry the corridor modes without restricting the number of legs.
      routes.push(...eligible(toRoutes(
        await journeys(
          {
            ...discoveryRequest,
            allowedModes: [config.mode, config.connectingMode],
          },
          signal,
        ), access, "",
      )));
      signal.throwIfAborted();
    }
    const groups = new Map<string, TravelRoute[]>();
    for (const route of routes) {
      const key = access ? turboJourneyKey(route) : turboSignature(route);
      groups.set(key, [...(groups.get(key) ?? []), route]);
    }
    let complete = groups.size > 0 && discoveryComplete;
    let courseCount = 0;
    let compared = 0;
    const candidates: LineOptimizerCandidate[] = [];
    for (const group of groups.values()) {
      signal.throwIfAborted();
      const route = group[0]!;
      let covered = false;
      try {
        const search = await loadCourses({ route, start, signal, horizonSeconds: 3 * 3600, ...(access ? { realtime } : {}) });
        signal.throwIfAborted();
        complete &&= search.complete;
        courseCount += search.batches.reduce((n, batch) => n + batch.length, 0);
        if (search.batches.length === route.transitSections.length) {
          const enhanced = (access ? group : [route]).flatMap((variant) =>
            enumerateOptimizerCandidates(variant, search.batches, settings, start, config));
          candidates.push(...enhanced);
          // A completed course lookup can also establish that a service was cancelled.
          covered = true;
        }
      } catch {
        signal.throwIfAborted();
      }
      // Preserve independently returned real itineraries if timetable coverage
      // is absent. No departure frequency or missing course is invented.
      if (!covered) {
        complete = false;
        for (const baseline of group) {
          candidates.push(...enumerateOptimizerCandidates(
            baseline, optimizerBaselineCourses(baseline), settings, start, config,
          ));
        }
      }
      onProgress?.(Math.floor(discoveryProgress + (100 - discoveryProgress) * ++compared / groups.size));
    }
    if (!groups.size) onProgress?.(100);
    return {
      candidates: access
        ? candidates.sort((a, b) => a.arriveAt - b.arriveAt || a.totalWaitSeconds - b.totalWaitSeconds || a.id.localeCompare(b.id))
        : rankOptimizerCandidates(candidates, settings, config.destinationOptimizer),
      complete,
      analyzedAt: now(),
      courseCount,
      walkingRoutes,
    };
  }

  async function analyzeUltimateStationAccess(request: StationAccessRequest) {
    const { origin, destination, start, signal, maxTransfers, onProgress } = request;
    const date = parisDateTime(start).slice(0, 8);
    const dayStart = turboTime(`${date}T000000`)!;
    const tomorrow = parisDateTime(dayStart + 36 * 3600_000).slice(0, 8);
    const dayEnd = turboTime(`${tomorrow}T000000`)!;
    // Station journeys already include the scheduled walk between platforms.
    const settings = { ...request.settings, marginSeconds: 0 };
    const times = new Set([parisDateTime(start),
      ...["00", "03", "06", "09", "12", "15", "18", "21", "23"].map((hour) => `${date}T${hour}0000`)]);
    const discoveryTasks = [...times].flatMap((time) => {
      const options = discoveryOptions(origin, destination, time, false, maxTransfers);
      const tasks = [journeys(options, signal).then((items) => toRoutes(items, true, `ultimate:${time}:`))];
      if (maxTransfers !== 0 && destination.id?.startsWith("stop_area:")) {
        tasks.push(journeys({ ...options, maxTransfers: 0 }, signal)
          .then((items) => toRoutes(items, true, `ultimate:${time}:direct:`))
          .then((routes) => routes.filter((route) => route.transitSections.length === 1)));
      }
      return tasks;
    });
    // The number of timetable comparisons is only known once discovery ends.
    let discovered = 0;
    const discoveries = await Promise.allSettled(discoveryTasks.map((task) => task.finally(() => {
      if (!signal.aborted) onProgress?.(Math.floor(discoveryProgress * ++discovered / discoveryTasks.length));
    })));
    signal.throwIfAborted();
    if (discoveries.every(({ status }) => status === "rejected")) {
      throw new Error("No daily journey searches succeeded");
    }
    let complete = discoveries.every(({ status }) => status === "fulfilled");
    const variants = new Map<string, TravelRoute>();
    let candidate: LineOptimizerCandidate | undefined;
    let bestVariantOrder = -1;
    const departureOrder = (departure: number) => departure >= start ? departure - start : dayEnd - departure;
    function consider(route: TravelRoute, batches: Parameters<typeof enumerateOptimizerCandidates>[1], variantOrder = -1) {
      for (const option of enumerateOptimizerCandidates(route, batches, settings, dayStart, stationAccessProfile, dayEnd)) {
        const duration = option.arriveAt - option.leaveAt;
        const bestDuration = candidate ? candidate.arriveAt - candidate.leaveAt : Infinity;
        // Equal durations prefer the next departure, then the most recent if all have passed.
        const departureDifference = candidate ? departureOrder(option.leaveAt) - departureOrder(candidate.leaveAt) : 0;
        if (!candidate || (duration - bestDuration || departureDifference || variantOrder - bestVariantOrder) < 0) {
          candidate = option;
          bestVariantOrder = variantOrder;
        }
      }
    }
    for (const discovery of discoveries) {
      if (discovery.status !== "fulfilled") continue;
      for (const route of discovery.value) {
        if (!route.transitSections.length || !withinTransferLimit(route, maxTransfers)) continue;
        // Keep dated plans as evidence for patterns with incomplete GTFS coverage.
        consider(route, optimizerBaselineCourses(route));
        const movement = route.sections.filter((section) => !isNearbyJourneyWaitingSection(section))
          .map((section) => isTurboTransit(section) ? null : section.durationSeconds);
        const key = JSON.stringify([turboSignature(route), movement]);
        if (!variants.has(key)) variants.set(key, route);
      }
    }
    // Compare variants with the same set of lines together to reuse their tables.
    // Keep discovery order as the final tie-breaker.
    const orderedVariants = [...variants.values()].map((route, order) => ({
      route, order,
      lines: JSON.stringify([...new Set(route.transitSections.map(({ lineId }) => lineId ?? ""))].sort()),
    })).sort((left, right) => left.lines.localeCompare(right.lines) || left.order - right.order);
    let compared = 0;
    for (const { route, order } of orderedVariants) {
      signal.throwIfAborted();
      try {
        const search = await dailyCourses({
          route, start: dayStart, signal, realtime: false,
          // Include connections and arrivals after midnight for late departures.
          horizonSeconds: (dayEnd - dayStart) / 1000 + 4 * 3600,
        });
        signal.throwIfAborted();
        complete &&= search.complete && search.batches.length === route.transitSections.length;
        consider(route, search.batches, order);
      } catch {
        signal.throwIfAborted();
        complete = false;
      }
      onProgress?.(Math.floor(discoveryProgress + (100 - discoveryProgress) * ++compared / variants.size));
    }
    if (!variants.size) onProgress?.(100);
    return { candidate, complete };
  }

  return {
    async analyze(request: OptimizerRequest & { config: LineOptimizerConfig }): Promise<LineOptimizerResult> {
      const { walkingRoutes: _walkingRoutes, ...result } = await analyze(request);
      return result;
    },
    createStationAccessSession(realtime: boolean) {
      const loadCourses = dependencies.courses ?? timetableProvider.createCourseSession({ limitRequests: true });
      return (request: StationAccessRequest) =>
        analyze({ ...request, config: stationAccessProfile }, loadCourses, realtime);
    },
    analyzeUltimateStationAccess,
  };
}
