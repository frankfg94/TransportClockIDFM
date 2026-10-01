import { createError, defineEventHandler } from "h3";
import { getCompiledNeighborhoodVerdictData } from "../../services/neighborhoodVerdict/dataStore";

export default defineEventHandler(async (event) => {
  try {
    const data = await getCompiledNeighborhoodVerdictData(event);
    return data.gpeStations;
  } catch (cause) {
    throw createError({ statusCode: 503, statusMessage: "GPE station data unavailable", cause });
  }
});
