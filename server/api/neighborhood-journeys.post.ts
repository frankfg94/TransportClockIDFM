import { createError, defineEventHandler, readBody } from "h3";
import type { NeighborhoodJourneysRequest } from "../../src/features/nearby-stations/neighborhoodJourneys";
import { GLOBAL_MAP_MODE_ORDER } from "../../src/features/transport-map/contracts/manifest";
import { routeNeighborhoodJourneys } from "../services/gtfs/routing";
import { parisCivilEpoch } from "../services/gtfs/routingTime";

export default defineEventHandler(async event => {
  const body = await readBody<NeighborhoodJourneysRequest>(event);
  const validPoint = (p: { lon: number; lat: number } | undefined) => p && Number.isFinite(p.lon) && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
  if (!validPoint(body?.origin) || !Array.isArray(body.destinations) || !body.destinations.length || body.destinations.length > 64 || body.destinations.some(d => !validPoint(d) || typeof d.id !== "string" || !d.id || d.id.length > 200 || d.destinationRef !== undefined && (typeof d.destinationRef !== "string" || d.destinationRef.length > 500)) || (body.allowedModes && (!Array.isArray(body.allowedModes) || body.allowedModes.some(m => !GLOBAL_MAP_MODE_ORDER.includes(m))))) throw createError({ statusCode: 400, statusMessage: "Invalid neighborhood journey request" });
  try { parisCivilEpoch(body.datetime); } catch { throw createError({ statusCode: 400, statusMessage: "Invalid departure datetime" }); }
  if (body.destinations.some(destination => destination.arrivalAtPlatform !== undefined && typeof destination.arrivalAtPlatform !== "boolean")) {
    throw createError({ statusCode: 400, statusMessage: "Invalid station arrival policy" });
  }
  try { return await routeNeighborhoodJourneys(event, body); }
  catch (cause) { throw createError({ statusCode: 503, statusMessage: "GTFS routing unavailable", cause }); }
});
