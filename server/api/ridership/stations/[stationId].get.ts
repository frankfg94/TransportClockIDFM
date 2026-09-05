import { createError, defineEventHandler, getQuery, getRouterParam, setHeader } from "h3";
import { getRidershipStation } from "../../../services/ridership/ridershipCache";
import { getNetexRuntimeEnv } from "../../../services/topology/netexCache";

export default defineEventHandler(async (event) => {
  const stationId = getRouterParam(event, "stationId");
  if (!stationId) {
    throw createError({ statusCode: 400, statusMessage: "Missing station id." });
  }

  const query = getQuery(event);
  const lineId = typeof query.lineId === "string" ? query.lineId : undefined;

  try {
    const station = await getRidershipStation(
      stationId,
      lineId,
      getNetexRuntimeEnv(event),
    );
    setHeader(event, "Cache-Control", "no-store");
    return station;
  } catch (error) {
    throw createError({
      cause: error,
      statusCode: 404,
      statusMessage: `No annual ridership data found for station ${stationId}.`,
    });
  }
});
