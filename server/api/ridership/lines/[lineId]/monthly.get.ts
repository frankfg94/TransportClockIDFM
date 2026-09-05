import { createError, defineEventHandler, getRouterParam, setHeader } from "h3";
import { getRidershipMonthlyLine } from "../../../../services/ridership/ridershipCache";
import { getNetexRuntimeEnv } from "../../../../services/topology/netexCache";

export default defineEventHandler(async (event) => {
  const lineId = getRouterParam(event, "lineId");
  if (!lineId) throw createError({ statusCode: 400, statusMessage: "Missing line id." });

  try {
    const line = await getRidershipMonthlyLine(lineId, getNetexRuntimeEnv(event));
    setHeader(event, "Cache-Control", "no-store");
    return line;
  } catch (error) {
    throw createError({
      cause: error,
      statusCode: 404,
      statusMessage: `No monthly ridership data found for line ${lineId}.`,
    });
  }
});
