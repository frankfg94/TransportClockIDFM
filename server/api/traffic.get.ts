import {
  defineEventHandler,
  getQuery,
  setHeader,
  type H3Event,
} from "h3";
import {
  getTrafficLineStatus,
  normalizeNavitiaLineReportPayload,
  normalizeTrafficLineRef,
} from "../../src/features/traffic/trafficNormalization";
import type {
  TrafficLineReport,
  TrafficResponse,
} from "../../src/features/traffic/types";
import { getServerIdfmApiKey } from "../services/idfm/resolveStopArea";

const MARKETPLACE_ROOT =
  "https://prim.iledefrance-mobilites.fr/marketplace";
const TRAFFIC_TIMEOUT_MS = 4_000;
const TRAFFIC_CACHE_TTL_MS = 60_000;

const lineReportCache = new Map<
  string,
  {
    expiresAt: number;
    promise: Promise<TrafficLineReport>;
  }
>();

export default defineEventHandler(async (event): Promise<TrafficResponse> => {
  setHeader(event, "Cache-Control", "private, max-age=30");

  const lineRefs = parseLineRefs(getQuery(event).lineRefs);
  const apiKey = getServerIdfmApiKey(event);

  if (!apiKey) {
    return {
      generatedAt: new Date().toISOString(),
      source: "prim-line-reports",
      configured: false,
      lines: lineRefs.map((lineRef) => ({
        lineRef,
        status: "error",
        disruptions: [],
        error: "IDFM_API_KEY ou NUXT_IDFM_API_KEY absent côté serveur.",
      })),
    };
  }

  const lines = await Promise.all(
    lineRefs.map((lineRef) => getCachedLineReport(event, lineRef, apiKey)),
  );

  return {
    generatedAt: new Date().toISOString(),
    source: "prim-line-reports",
    configured: true,
    lines,
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

function getCachedLineReport(
  event: H3Event,
  lineRef: string,
  apiKey: string,
): Promise<TrafficLineReport> {
  const now = Date.now();
  const cached = lineReportCache.get(lineRef);

  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = fetchLineReport(event, lineRef, apiKey);
  lineReportCache.set(lineRef, {
    expiresAt: now + TRAFFIC_CACHE_TTL_MS,
    promise,
  });

  promise.catch(() => {
    lineReportCache.delete(lineRef);
  });

  return promise;
}

async function fetchLineReport(
  event: H3Event,
  lineRef: string,
  apiKey: string,
): Promise<TrafficLineReport> {
  try {
    const url = createLineReportUrl(lineRef);
    const response = await fetchWithTimeout(event, url, {
      headers: {
        accept: "application/json",
        apikey: apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    const disruptions = normalizeNavitiaLineReportPayload(payload, lineRef);

    return {
      lineRef,
      status: getTrafficLineStatus(disruptions),
      disruptions,
    };
  } catch (error) {
    return {
      lineRef,
      status: "error",
      disruptions: [],
      error:
        error instanceof Error
          ? error.message
          : "Impossible de charger l'information trafic.",
    };
  }
}

function createLineReportUrl(lineRef: string): string {
  const searchParams = new URLSearchParams({
    count: "100",
    disable_geojson: "true",
  });

  return `${MARKETPLACE_ROOT}/v2/navitia/line_reports/lines/${encodeURIComponent(
    lineRef,
  )}/line_reports?${searchParams}`;
}

async function fetchWithTimeout(
  event: H3Event,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRAFFIC_TIMEOUT_MS);

  try {
    const request = event.node.req as Partial<{
      on: (eventName: "close", listener: () => void) => void;
    }>;

    request.on?.("close", () => controller.abort());
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
