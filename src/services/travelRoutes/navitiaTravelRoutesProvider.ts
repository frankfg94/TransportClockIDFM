import { fetchNavitiaJourneys } from "../idfm";
import type {
  NearbyJourney,
  NearbyJourneyRequest,
  TravelRoutesProvider,
} from "../../features/nearby-stations/nearbyHeavyTransports";

/**
 * Current route adapter. Navitia-specific request construction and response
 * normalization stay in idfm.ts; feature code depends only on this port.
 */
export function createNavitiaTravelRoutesProvider(): TravelRoutesProvider {
  const journeyCache = new Map<string, Promise<NearbyJourney[]>>();

  return {
    findJourneys(request: NearbyJourneyRequest): Promise<NearbyJourney[]> {
      const key = JSON.stringify({
        origin: [request.origin.lon, request.origin.lat],
        destination: [request.destination.lon, request.destination.lat],
        destinationRef: request.destinationRef ?? "",
        datetime: request.datetime ?? "now",
        count: request.count ?? 16,
        includeDisruptions: request.includeDisruptions ?? false,
        includeGeoJson: request.includeGeoJson ?? false,
      });
      const cached = journeyCache.get(key);
      if (cached) return cached;

      const promise = fetchNavitiaJourneys(request);
      journeyCache.set(key, promise);
      void promise.catch(() => {
        if (journeyCache.get(key) === promise) journeyCache.delete(key);
      });
      return promise;
    },
  };
}
