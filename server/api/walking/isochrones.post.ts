import { createError, defineEventHandler, readBody } from "h3";
import { NEARBY_ISOCHRONES_NOT_CONFIGURED_CODE } from "../../../src/features/nearby-stations/nearbyIsochrones";
import { getNearbyIsochronesWithOpenRouteService } from "../../services/walking/openRouteService";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ origin?: unknown }>(event);
  const origin = validPoint(body?.origin);
  if (!origin) {
    throw createError({ statusCode: 400, statusMessage: "origin must be valid coordinates." });
  }

  try {
    return await getNearbyIsochronesWithOpenRouteService(event, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === NEARBY_ISOCHRONES_NOT_CONFIGURED_CODE) {
      throw createError({
        statusCode: 503,
        statusMessage: "An OpenRouteService API key is required to display walking zones.",
        data: { code: NEARBY_ISOCHRONES_NOT_CONFIGURED_CODE },
      });
    }
    if (
      message.includes("isochrones-408")
      || message.includes("isochrones-504")
      || (error instanceof Error && error.name === "AbortError")
    ) {
      throw createError({ statusCode: 504, statusMessage: "Walking isochrones timed out." });
    }
    throw createError({ statusCode: 502, statusMessage: "Walking isochrones are temporarily unavailable." });
  }
});

function validPoint(value: unknown): { lon: number; lat: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const point = value as { lon?: unknown; lat?: unknown };
  const lon = Number(point.lon);
  const lat = Number(point.lat);
  return Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90
    ? { lon, lat }
    : undefined;
}
