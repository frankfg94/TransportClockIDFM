import { createError, defineEventHandler, getQuery, getRouterParam, setHeader } from "h3";
import { getGtfsLineFrequency } from "../../../services/gtfs/frequency";

export default defineEventHandler(async (event) => {
  const lineId = getRouterParam(event, "lineId")?.trim();
  if (!lineId || lineId.length > 200 || /[\x00-\x1f/\\]/u.test(lineId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid or missing line id." });
  }
  const query = getQuery(event);
  const serviceDate = query.serviceDate;
  if (serviceDate !== undefined && (typeof serviceDate !== "string" || !/^\d{8}$/u.test(serviceDate))) {
    throw createError({ statusCode: 400, statusMessage: "Invalid service date." });
  }
  const frequency = await getGtfsLineFrequency(event, lineId, undefined, {
    allowCoverageFallback: query.allowCoverageFallback === "1", serviceDate,
  });
  // Availability, dataset switches and the Paris Monday rollover must be
  // observable; expensive calculation is cached by version on the server.
  setHeader(event, "Cache-Control", "no-cache");
  return frequency;
});
