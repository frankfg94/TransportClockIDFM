import { createError, defineEventHandler, getQuery } from "h3";
import { buildComparisonGeography, ComparisonLocationError } from "../services/neighborhoodVerdict/comparison";
import { getCompiledNeighborhoodVerdictData } from "../services/neighborhoodVerdict/dataStore";

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const lat = Number(query.lat), lon = Number(query.lon);
  if (typeof query.lat !== "string" || typeof query.lon !== "string" || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw createError({ statusCode: 400, statusMessage: "Invalid coordinates" });
  }
  try {
    const data = await getCompiledNeighborhoodVerdictData(event);
    return buildComparisonGeography(data, { lat, lon }, typeof query.communeCode === "string" ? query.communeCode : undefined);
  } catch (cause) {
    if (cause instanceof ComparisonLocationError) throw createError({ statusCode: cause.reason === "outside" ? 404 : cause.reason === "context" ? 422 : 409, statusMessage: cause.reason });
    throw createError({ statusCode: 503, statusMessage: "Comparison geography unavailable", cause });
  }
});
