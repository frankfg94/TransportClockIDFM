import { createError, defineEventHandler, readBody } from "h3";
import type { NearbyJourneyPoint } from "../../../src/features/nearby-stations/nearbyHeavyTransports";
import {
  matrixWalkingWithPreferredProvider,
  OPEN_ROUTE_SERVICE_MAX_MATRIX_DESTINATIONS,
} from "../../services/walking/openRouteService";
import type { NearbyWalkingMatrixDestination } from "../../../src/features/nearby-stations/nearbyWalkingRoutes";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ origin?: NearbyJourneyPoint; destinations?: NearbyWalkingMatrixDestination[] }>(event);
  const origin = validPoint(body?.origin);
  const destinations = Array.isArray(body?.destinations)
    ? body.destinations.slice(0, OPEN_ROUTE_SERVICE_MAX_MATRIX_DESTINATIONS).map((destination) => {
      const point = validPoint(destination);
      return point && typeof destination.id === "string" && destination.id.trim()
        ? { ...point, id: destination.id.trim() }
        : undefined;
    }).filter((destination): destination is NearbyWalkingMatrixDestination => Boolean(destination))
    : [];
  if (!origin || destinations.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "origin and destinations must be valid coordinates." });
  }
  return { routes: await matrixWalkingWithPreferredProvider(event, origin, destinations) };
});

function validPoint(value: unknown): NearbyJourneyPoint | undefined {
  if (!value || typeof value !== "object") return undefined;
  const point = value as Partial<NearbyJourneyPoint>;
  const lon = Number(point.lon);
  const lat = Number(point.lat);
  return Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90
    ? { lon, lat }
    : undefined;
}
