import { createError, defineEventHandler, getRouterParam, setHeader } from "h3";
import { getLineTopology } from "../../../services/topology/getLineTopology";
import { getNetexRuntimeEnv } from "../../../services/topology/netexCache";

export default defineEventHandler(async (event) => {
  const lineId = getRouterParam(event, "lineId");

  if (!lineId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing line id.",
    });
  }

  try {
    const topology = await getLineTopology(lineId, getNetexRuntimeEnv(event));
    setHeader(event, "Cache-Control", "public, max-age=21600");

    return topology;
  } catch (error) {
    throw createError({
      cause: error,
      statusCode: 404,
      statusMessage: `No topology fixture found for line ${lineId}.`,
    });
  }
});
