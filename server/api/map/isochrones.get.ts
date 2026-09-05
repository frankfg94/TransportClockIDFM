import { defineEventHandler, getQuery, setHeader, setResponseStatus } from "h3";
import { selectServerIsochrones } from "../../services/isochrones/radarService";
import { getNetexRuntimeEnv } from "../../services/topology/netexCache";
import { GlobalIsochroneError, parseGlobalIsochroneQuery } from "../../../src/features/transport-map/isochrones/protocol";

export default defineEventHandler(async (event) => {
  let request;
  try { request = parseGlobalIsochroneQuery(getQuery(event)); }
  catch {
    setResponseStatus(event, 400);
    setHeader(event, "Cache-Control", "no-store");
    return { code: "invalid" };
  }
  try {
    const result = await selectServerIsochrones(request.scopes, request.mapVersion, getNetexRuntimeEnv(event), request.reload);
    setHeader(event, "Cache-Control", request.reload ? "no-store" : "public, max-age=60, stale-while-revalidate=120");
    return { schemaVersion: 1, mapDataVersion: request.mapVersion, result };
  } catch (error) {
    const code = error instanceof GlobalIsochroneError ? error.code : "unavailable";
    setResponseStatus(event, code === "missing" ? 404 : code === "incompatible" ? 409 : code === "invalid" ? 422 : 503);
    setHeader(event, "Cache-Control", "no-store");
    // No filesystem paths, signed URLs or credentials in client-visible errors.
    return { code };
  }
});
