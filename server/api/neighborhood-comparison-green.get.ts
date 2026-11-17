import { createError, defineEventHandler, getQuery } from "h3";
import { buildComparisonGreen, ComparisonLocationError } from "../services/neighborhoodVerdict/comparison";
import { getCompiledNeighborhoodVerdictData } from "../services/neighborhoodVerdict/dataStore";

export default defineEventHandler(async event => {
  const code = getQuery(event).communeCode;
  if (typeof code !== "string" || !/^\d{5}$/u.test(code)) throw createError({ statusCode: 400, statusMessage: "Invalid commune code" });
  try {
    const data = await getCompiledNeighborhoodVerdictData(event);
    return { generatedAt: data.generatedAt, communeCode: code, neighborhoods: buildComparisonGreen(data, code) };
  } catch (cause) {
    if (cause instanceof ComparisonLocationError) throw createError({ statusCode: 404, statusMessage: "No neighborhoods" });
    throw createError({ statusCode: 503, statusMessage: "Green-space comparison unavailable", cause });
  }
});
