import { createError, defineEventHandler, getQuery, setHeader } from "h3";
import { resolveCityBoundary } from "../services/geography/cityBoundary";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const lat = typeof query.lat === "string" && query.lat.trim() ? Number(query.lat) : NaN;
  const lon = typeof query.lon === "string" && query.lon.trim() ? Number(query.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw createError({ statusCode: 400, statusMessage: "Valid station coordinates are required" });
  }
  try {
    const boundary = await resolveCityBoundary(lat, lon);
    setHeader(event, "Cache-Control", "public, max-age=86400");
    return boundary;
  } catch (cause) {
    throw createError({ statusCode: 503, statusMessage: "Official commune boundary unavailable", cause });
  }
});
