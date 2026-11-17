import { createError, defineEventHandler, getRouterParam, setHeader } from "h3";
import { loadGtfsLineArtifact } from "../../../services/gtfs/runtime";
import { attachGtfsMonitoringRefs } from "../../../services/topology/attachGtfsMonitoringRefs";
import { getLineTopology } from "../../../services/topology/getLineTopology";
import { getNetexRuntimeEnv, NetexLineNotFoundError } from "../../../services/topology/netexCache";

export default defineEventHandler(async (event) => {
  const lineId = getRouterParam(event, "lineId");

  if (!lineId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing line id.",
    });
  }

  try {
    const [topology, gtfsArtifact] = await Promise.all([
      getLineTopology(lineId, getNetexRuntimeEnv(event)),
      loadGtfsLineArtifact(event, lineId).catch(() => undefined),
    ]);
    setHeader(event, "Cache-Control", "public, max-age=21600");

    return gtfsArtifact ? attachGtfsMonitoringRefs(topology, gtfsArtifact) : topology;
  } catch (error) {
    const missing = error instanceof NetexLineNotFoundError;
    throw createError({
      cause: error,
      statusCode: missing ? 404 : 503,
      statusMessage: missing ? "Line not found in the topology catalogue." : "Line topology temporarily unavailable.",
    });
  }
});
