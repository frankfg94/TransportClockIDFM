import type { H3Event } from "h3";
import { createNeighborhoodGtfsRouter } from "../../../shared/gtfs/routing";
import { createStraightLineWalkingRoute } from "../../../src/features/nearby-stations/nearbyWalkingRoutes";
import { matrixWalkingWithOpenRouteService } from "../walking/openRouteService";
import { getGtfsManifest, isGtfsEnabled, readGtfsJson, getGtfsRuntimeCacheEpoch } from "./runtime";
export { NEIGHBORHOOD_ROUTING_HORIZON_SECONDS } from "../../../shared/gtfs/routing";
export const routeNeighborhoodJourneys = createNeighborhoodGtfsRouter<H3Event | undefined>({
  getManifest: getGtfsManifest, isEnabled: isGtfsEnabled, cacheEpoch: getGtfsRuntimeCacheEpoch,
  readJson: async <T>(event: H3Event | undefined, path: string) => (await readGtfsJson<T>(event, path)).value,
  matrix: (event, origin, destinations, options) => event
    ? matrixWalkingWithOpenRouteService(event, origin, destinations, options)
    : Promise.resolve(destinations.map(destination => options?.reverse
      ? createStraightLineWalkingRoute(destination, origin, destination.id)
      : createStraightLineWalkingRoute(origin, destination, destination.id))),
});
