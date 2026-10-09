import { fetchNavitiaJourneys } from "../../services/idfm";
import { createTravelTurboProvider } from "../../services/travelRoutes/travelTurboProvider";
import { parisDateTime, turboSignature } from "../nearby-stations/travelTurbo";
import type { NearbyJourney, NearbyJourneyRequest } from "../nearby-stations/nearbyHeavyTransports";
import type { TravelRoute } from "../nearby-stations/useTravelRoutes";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import {
  enumerateOptimizerCandidates,
  isOptimizerRoute,
  optimizerBaselineCourses,
  rankOptimizerCandidates,
  type LineOptimizerCandidate,
  type LineOptimizerSettings,
} from "./lineOptimizer";
import type { LineOptimizerConfig } from "./optimizerConfig";

export interface LineOptimizerResult {
  candidates: LineOptimizerCandidate[];
  complete: boolean;
  analyzedAt: number;
  courseCount: number;
}

export function createLineOptimizerProvider(
  dependencies: {
    journeys?: (request: NearbyJourneyRequest, signal: AbortSignal) => Promise<NearbyJourney[]>;
    courses?: ReturnType<typeof createTravelTurboProvider>["loadCourses"];
    now?: () => number;
  } = {},
) {
  const journeys =
    dependencies.journeys ?? ((request, signal) => fetchNavitiaJourneys(request, { signal }));
  const courses = dependencies.courses ?? createTravelTurboProvider().loadCourses;
  const now = dependencies.now ?? Date.now;
  return {
    async analyze(request: {
      config: LineOptimizerConfig;
      origin: GeocoderPoint;
      destination: GeocoderPoint;
      settings: LineOptimizerSettings;
      start: number;
      signal: AbortSignal;
    }): Promise<LineOptimizerResult> {
      const { config, origin, destination, settings, start, signal } = request;
      const realJourneys = await journeys(
        {
          origin,
          destination,
          datetime: parisDateTime(start + settings.exitSeconds * 1000),
          count: 20,
          includeDisruptions: true,
          dataFreshness: "realtime",
          allowedModes: [config.mode, config.connectingMode],
        },
        signal,
      );
      signal.throwIfAborted();
      const routes = realJourneys
        .map((journey, index): TravelRoute => ({
          ...journey,
          id: journey.id ?? `optimizer-route:${index}`,
          transitSections: journey.sections.filter((s) => s.lineMode),
        }))
        .filter((route) => isOptimizerRoute(route, config));
      const groups = new Map<string, TravelRoute[]>();
      for (const route of routes) {
        const key = turboSignature(route);
        groups.set(key, [...(groups.get(key) ?? []), route]);
      }
      let complete = groups.size > 0;
      let courseCount = 0;
      const candidates: LineOptimizerCandidate[] = [];
      for (const group of groups.values()) {
        signal.throwIfAborted();
        const route = group[0]!;
        try {
          const search = await courses({ route, start, signal, horizonSeconds: 3 * 3600 });
          signal.throwIfAborted();
          complete &&= search.complete;
          courseCount += search.batches.reduce((n, batch) => n + batch.length, 0);
          if (search.batches.length === 2) {
            candidates.push(
              ...enumerateOptimizerCandidates(route, search.batches, settings, start),
            );
            continue;
          }
        } catch {
          signal.throwIfAborted();
          complete = false;
        }
        // Preserve independently returned real itineraries if timetable coverage
        // is absent. No departure frequency or missing course is invented.
        complete = false;
        for (const baseline of group)
          candidates.push(
            ...enumerateOptimizerCandidates(
              baseline,
              optimizerBaselineCourses(baseline),
              settings,
              start,
            ),
          );
      }
      return {
        candidates: rankOptimizerCandidates(candidates, settings),
        complete,
        analyzedAt: now(),
        courseCount,
      };
    },
  };
}
