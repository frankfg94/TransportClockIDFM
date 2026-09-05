import { createError, defineEventHandler, getQuery } from "h3";
import type { NearbyJourneyPoint } from "../../src/features/nearby-stations/nearbyHeavyTransports";
import { routeWalkingWithPreferredProvider } from "../services/walking/openRouteService";
import { resolveAdministrativeLocation } from "../services/neighborhoodVerdict/geoApi";
import { getCompiledNeighborhoodVerdictData } from "../services/neighborhoodVerdict/dataStore";
import { buildNeighborhoodVerdict } from "../services/neighborhoodVerdict/score";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw createError({ statusCode: 400, statusMessage: "Invalid coordinates" });
  }
  try {
    const [data, administrativeLocation] = await Promise.all([
      getCompiledNeighborhoodVerdictData(event),
      resolveAdministrativeLocation(lat, lon),
    ]);
    const routeWalking = async (
      from: [number, number],
      to: [number, number],
    ) => {
      const origin: NearbyJourneyPoint = { lon: from[0]!, lat: from[1]! };
      const destination: NearbyJourneyPoint = { lon: to[0]!, lat: to[1]! };
      const route = await routeWalkingWithPreferredProvider(event, origin, destination);
      if (route.provider === "straight-line") return undefined;
      return {
        durationSeconds: route.durationSeconds,
        distanceMeters: route.distanceMeters,
      };
    };
    return await buildNeighborhoodVerdict(
      data,
      { lat, lon },
      administrativeLocation,
      routeWalking,
    );
  } catch (cause) {
    throw createError({ statusCode: 503, statusMessage: "Neighborhood verdict data unavailable", cause });
  }
});
