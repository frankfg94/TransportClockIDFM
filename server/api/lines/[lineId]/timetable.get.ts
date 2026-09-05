import {
  createError,
  defineEventHandler,
  getQuery,
  getRouterParam,
  setHeader,
  type H3Event,
} from "h3";
import type { GtfsLineTimetableResponse } from "../../../../src/types/lineFrequencyTimetable";
import { getGtfsFrequencyServiceDate } from "../../../services/gtfs/frequencyComputation";
import { mapFrequencyStops } from "../../../services/gtfs/frequencyTopology";
import { loadGtfsTimetableForDate } from "../../../services/gtfs/timetableRuntime";
import type { GtfsTimetableStop } from "../../../services/gtfs/timetableTypes";
import { loadGtfsLineArtifact } from "../../../services/gtfs/runtime";
import { attachGtfsMonitoringRefs } from "../../../services/topology/attachGtfsMonitoringRefs";
import { getLineTopology } from "../../../services/topology/getLineTopology";
import { getNetexRuntimeEnv } from "../../../services/topology/netexCache";

async function resolveTopologyStopIds(
  event: H3Event,
  lineId: string,
  stops: readonly GtfsTimetableStop[],
): Promise<Map<string, string>> {
  try {
    const [rawTopology, artifact] = await Promise.all([
      getLineTopology(lineId, getNetexRuntimeEnv(event)),
      loadGtfsLineArtifact(event, lineId),
    ]);
    const topology =
      rawTopology && artifact ? attachGtfsMonitoringRefs(rawTopology, artifact) : rawTopology;
    return topology ? mapFrequencyStops(stops, topology) : new Map<string, string>();
  } catch {
    // A timetable remains useful without the optional topology enrichment.
    return new Map<string, string>();
  }
}

export default defineEventHandler(async (event): Promise<GtfsLineTimetableResponse> => {
  const lineId = getRouterParam(event, "lineId")?.trim();
  if (!lineId || lineId.length > 200 || /[\x00-\x1f/\\]/u.test(lineId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid or missing line id." });
  }

  const query = getQuery(event);
  const requestedDate = typeof query.serviceDate === "string" ? query.serviceDate.trim() : "";
  const serviceDate = requestedDate || getGtfsFrequencyServiceDate();
  if (!/^\d{8}$/u.test(serviceDate)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid service date." });
  }

  const timetable = await loadGtfsTimetableForDate(event, lineId, serviceDate);
  const descriptor = timetable.index ?? timetable.manifest?.timetable;
  setHeader(event, "Cache-Control", "no-cache");
  const topologyStopIds =
    timetable.status === "ready" && timetable.index
      ? await resolveTopologyStopIds(event, lineId, timetable.index.stops)
      : new Map<string, string>();

  return {
    lineId,
    serviceDate,
    source: "gtfs",
    status: timetable.status,
    datasetVersion: timetable.manifest?.datasetVersion,
    sourceUpdatedAt: timetable.manifest?.sourceUpdatedAt,
    coverage: descriptor
      ? { startDate: descriptor.startDate, endDate: descriptor.endDate }
      : undefined,
    stops: (timetable.index?.stops ?? []).map(({ id, parentId, name }) => {
      const topologyId = topologyStopIds.get(id);
      return {
        id,
        parentId,
        name,
        ...(topologyId ? { topologyId } : {}),
      };
    }),
    trips: timetable.trips.map((trip) => ({
      id: trip.id,
      serviceDate: trip.serviceDate,
      directionId: trip.directionId,
      headsign: trip.headsign,
      calls: trip.calls.map((call) => ({ ...call })),
    })),
  };
});
