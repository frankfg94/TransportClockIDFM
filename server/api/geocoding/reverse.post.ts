import { createError, defineEventHandler, readBody } from "h3";
import { reverseIgnAddress } from "../../services/geocoding/ign";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ lon?: unknown; lat?: unknown }>(event);
  const lon = Number(body?.lon);
  const lat = Number(body?.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    throw createError({ statusCode: 400, statusMessage: "Valid longitude and latitude are required." });
  }
  return { provider: "ign-geoplateforme", results: await reverseIgnAddress(lon, lat) };
});
