import { createError, defineEventHandler, readBody } from "h3";
import type { NearbyJourneyPoint } from "../../../src/features/nearby-stations/nearbyHeavyTransports";
import { routeWalkingWithPreferredProvider } from "../../services/walking/openRouteService";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ origin?: NearbyJourneyPoint; destination?: NearbyJourneyPoint; id?: string }>(event);
  const origin = validPoint(body?.origin);
  const destination = validPoint(body?.destination);
  if (!origin || !destination) {
    throw createError({ statusCode: 400, statusMessage: "origin and destination must be valid coordinates." });
  }
  return routeWalkingWithPreferredProvider(event, origin, destination, typeof body?.id === "string" ? body.id : undefined);
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
