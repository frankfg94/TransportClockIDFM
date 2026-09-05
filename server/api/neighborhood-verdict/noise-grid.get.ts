import { createError, defineEventHandler, getQuery, setHeader } from "h3";
import { getCompiledNeighborhoodVerdictData } from "../../services/neighborhoodVerdict/dataStore";
import {
  buildNearbyNoiseGridResponse,
  NEARBY_NOISE_GRID_DEFAULT_RADIUS_METERS,
  NEARBY_NOISE_GRID_MAX_RADIUS_METERS,
  NEARBY_NOISE_GRID_MIN_RADIUS_METERS,
} from "../../services/neighborhoodVerdict/noiseGrid";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  const radius = Number(query.radius ?? NEARBY_NOISE_GRID_DEFAULT_RADIUS_METERS);
  if (
    !Number.isFinite(lat)
    || !Number.isFinite(lon)
    || !Number.isFinite(radius)
    || lat < -90
    || lat > 90
    || lon < -180
    || lon > 180
    || radius < NEARBY_NOISE_GRID_MIN_RADIUS_METERS
    || radius > NEARBY_NOISE_GRID_MAX_RADIUS_METERS
  ) {
    throw createError({ statusCode: 400, statusMessage: "Invalid noise grid query." });
  }

  let data;
  try {
    data = await getCompiledNeighborhoodVerdictData(event);
  } catch (cause) {
    throw createError({ statusCode: 503, statusMessage: "Compiled noise grid unavailable.", cause });
  }

  const result = buildNearbyNoiseGridResponse(data, { lat, lon }, radius);
  if (!result) {
    throw createError({ statusCode: 503, statusMessage: "Compiled noise grid unavailable." });
  }

  setHeader(event, "Cache-Control", "public, max-age=300, stale-while-revalidate=900");
  return result;
});
