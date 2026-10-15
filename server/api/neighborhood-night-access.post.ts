import { createError, defineEventHandler, readBody } from "h3";
import { resolveNightAccess, type NightAccessRequest } from "../../shared/gtfs/nightAccess";
import { parisCivilEpoch } from "../../shared/gtfs/routingTime";
import { loadGtfsTimetableForDate } from "../services/gtfs/timetableRuntime";
import { matrixWalkingForGtfs } from "../services/walking/openRouteService";

export default defineEventHandler(async event => {
  const body = await readBody<NightAccessRequest>(event);
  if (!body?.origin || !Number.isFinite(body.origin.lon) || !Number.isFinite(body.origin.lat)
    || Math.abs(body.origin.lon) > 180 || Math.abs(body.origin.lat) > 90
    || !Array.isArray(body.lines) || body.lines.length > 64 || body.lines.some(line => typeof line.id !== "string"
      || !line.id.trim() || line.id.length > 500 || typeof line.code !== "string" || !/^N\d+$/iu.test(line.code))) {
    throw createError({ statusCode: 400, statusMessage: "Invalid night access request" });
  }
  try { parisCivilEpoch(body.datetime); } catch { throw createError({ statusCode: 400, statusMessage: "Invalid night datetime" }); }
  return resolveNightAccess(body, {
    loadLine: (lineId, date) => loadGtfsTimetableForDate(event, lineId, date),
    matrix: (origin, destinations) => matrixWalkingForGtfs(event, origin, destinations),
    assertCurrent: () => {},
  });
});
