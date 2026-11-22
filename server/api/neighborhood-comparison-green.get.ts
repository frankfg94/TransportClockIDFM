import { createError, defineEventHandler, getQuery } from "h3";
import { buildComparisonGreen, ComparisonLocationError } from "../services/neighborhoodVerdict/comparison";
import { getCompiledNeighborhoodVerdictData } from "../services/neighborhoodVerdict/dataStore";
import { natureCommuneCode, readNatureManifest, readPublicParkAreas } from "../services/neighborhoodVerdict/natureInCity";
import { getNetexRuntimeEnv } from "../services/topology/netexCache";

export default defineEventHandler(async event => {
  const code = getQuery(event).communeCode;
  if (typeof code !== "string" || !/^\d{5}$/u.test(code)) throw createError({ statusCode: 400, statusMessage: "Invalid commune code" });
  try {
    const env = getNetexRuntimeEnv(event);
    const [data, nature] = await Promise.all([
      getCompiledNeighborhoodVerdictData(event),
      readNatureManifest(env).catch(() => undefined),
    ]);
    const neighborhoods = { ...buildComparisonGreen(data, code) };
    const canopy = nature?.communes[natureCommuneCode(code)]?.iris;
    const parks = nature ? await readPublicParkAreas(env, nature, code).catch(() => undefined) : undefined;
    for (const iris of Object.keys(neighborhoods)) {
      neighborhoods[iris] = { ...neighborhoods[iris]!, canopy: canopy?.[iris], publicParkAreaM2: parks?.[iris] };
    }
    return { generatedAt: data.generatedAt, communeCode: code, neighborhoods };
  } catch (cause) {
    if (cause instanceof ComparisonLocationError) throw createError({ statusCode: 404, statusMessage: "No neighborhoods" });
    throw createError({ statusCode: 503, statusMessage: "Green-space comparison unavailable", cause });
  }
});
