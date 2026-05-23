import {
  createError,
  defineEventHandler,
  getQuery,
  getRouterParam,
  setHeader,
} from "h3";
import { buildLinePatternView } from "../../../../services/servicePattern/buildLinePatternView";

export default defineEventHandler(async (event) => {
  const transportType = getRouterParam(event, "transportType");
  const lineId = getRouterParam(event, "lineId");
  const query = getQuery(event);

  if (!transportType || !lineId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing transport type or line id.",
    });
  }

  try {
    const startStation = firstQueryValue(query.startStation);
    const request = {
      transportType,
      lineId,
      directionId: firstQueryValue(query.direction),
      startStationId: startStation,
      startStationCandidates: startStation ? [startStation] : [],
    };
    const response = await buildLinePatternView(request);

    setHeader(
      event,
      "Cache-Control",
      "public, max-age=21600, stale-while-revalidate=86400",
    );

    return response;
  } catch (error) {
    throw createError({
      cause: error,
      statusCode: 404,
      statusMessage: `No pattern view found for ${transportType}/${lineId}.`,
    });
  }
});

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }

  return typeof value === "string" ? value : undefined;
}
