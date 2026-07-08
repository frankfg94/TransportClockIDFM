import {
  defineEventHandler,
  getQuery,
  setHeader,
} from "h3";
import {
  normalizeTrafficLineRef,
} from "../../src/features/traffic/trafficNormalization";
import type { TrafficResponse } from "../../src/features/traffic/types";
import { getServerIdfmApiKey } from "../services/idfm/resolveStopArea";
import { fetchIdfmTrafficLineReport } from "../services/idfm/traffic";

export default defineEventHandler(async (event): Promise<TrafficResponse> => {
  setHeader(event, "Cache-Control", "private, max-age=30");

  const lineRefs = parseLineRefs(getQuery(event).lineRefs);
  const apiKey = getServerIdfmApiKey(event);

  if (!apiKey) {
    return {
      configured: false,
      generatedAt: new Date().toISOString(),
      lines: lineRefs.map((lineRef) => ({
        disruptions: [],
        error: "IDFM_API_KEY or NUXT_IDFM_API_KEY is missing on the server.",
        lineRef,
        status: "error",
      })),
      source: "prim-line-reports",
    };
  }

  return {
    configured: true,
    generatedAt: new Date().toISOString(),
    lines: await Promise.all(
      lineRefs.map((lineRef) => fetchIdfmTrafficLineReport(lineRef, apiKey)),
    ),
    source: "prim-line-reports",
  };
});

function parseLineRefs(value: unknown): string[] {
  const rawValue = Array.isArray(value) ? value.join(",") : String(value ?? "");

  return Array.from(
    new Set(
      rawValue
        .split(",")
        .map((lineRef) => normalizeTrafficLineRef(decodeURIComponent(lineRef)))
        .filter(Boolean),
    ),
  );
}
