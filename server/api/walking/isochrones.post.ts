import { createError, defineEventHandler, readBody } from "h3";
import { NEARBY_ISOCHRONES_NOT_CONFIGURED_CODE } from "../../../src/features/nearby-stations/nearbyIsochrones";
import { getNearbyIsochronesWithOpenRouteService } from "../../services/walking/openRouteService";
import { selectServerStationIsochrones } from "../../services/isochrones/radarService";
import { setHeader } from "h3";
import { getNetexRuntimeEnv } from "../../services/topology/netexCache";
import {
  GLOBAL_ISOCHRONE_MINUTES,
  isGlobalIsochroneMinutes,
  type GlobalIsochroneMinutes,
} from "../../../src/features/transport-map/isochrones/contracts";
import { NEARBY_WALKING_MINUTES } from "../../../src/features/nearby-stations/nearbyWalkingMinutes";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ origin?: unknown; minutes?: unknown }>(event);
  const origin = validPoint(body?.origin);
  if (!origin) {
    throw createError({ statusCode: 400, statusMessage: "origin must be valid coordinates." });
  }
  const minutes = requestedMinutes(body?.minutes);
  if (!minutes) {
    throw createError({ statusCode: 400, statusMessage: "minutes must contain supported walking thresholds." });
  }

  try {
    const env = getNetexRuntimeEnv(event);
    const precompiled = await selectServerStationIsochrones(origin, env, minutes).catch(() => undefined);
    if (precompiled) {
      setHeader(event, "X-Isochrone-Source", "archive");
      return precompiled;
    }
    setHeader(event, "X-Isochrone-Source", "ors");
    return await getNearbyIsochronesWithOpenRouteService(event, origin, minutes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "openrouteservice-isochrones-quota") {
      throw createError({ statusCode: 429, statusMessage: "Walking isochrones quota exceeded.", data: { code: "quota" } });
    }
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

function requestedMinutes(value: unknown): GlobalIsochroneMinutes[] | undefined {
  if (value === undefined) return [...NEARBY_WALKING_MINUTES];
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const requested = new Set<GlobalIsochroneMinutes>();
  for (const candidate of value) {
    if (!isGlobalIsochroneMinutes(candidate) || requested.has(candidate)) return undefined;
    requested.add(candidate);
  }
  return GLOBAL_ISOCHRONE_MINUTES.filter((minutes) => requested.has(minutes));
}
