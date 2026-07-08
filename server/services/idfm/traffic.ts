import {
  getTrafficLineStatus,
  normalizeNavitiaLineReportPayload,
} from "../../../src/features/traffic/trafficNormalization";
import type { TrafficLineReport } from "../../../src/features/traffic/types";

const IDFM_MARKETPLACE_BASE =
  "https://prim.iledefrance-mobilites.fr/marketplace";
const TRAFFIC_CACHE_TTL_MS = 60_000;
const TRAFFIC_TIMEOUT_MS = 4_000;

const lineReportCache = new Map<
  string,
  {
    expiresAt: number;
    promise: Promise<TrafficLineReport>;
  }
>();

export function fetchIdfmTrafficLineReport(
  lineRef: string,
  apiKey: string,
): Promise<TrafficLineReport> {
  const cacheKey = `${apiKey}:${lineRef}`;
  const now = Date.now();
  const cached = lineReportCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = fetchLineReport(lineRef, apiKey);
  lineReportCache.set(cacheKey, {
    expiresAt: now + TRAFFIC_CACHE_TTL_MS,
    promise,
  });
  promise.catch(() => lineReportCache.delete(cacheKey));

  return promise;
}

async function fetchLineReport(
  lineRef: string,
  apiKey: string,
): Promise<TrafficLineReport> {
  try {
    const searchParams = new URLSearchParams({
      count: "100",
      disable_geojson: "true",
    });
    const url =
      `${IDFM_MARKETPLACE_BASE}/v2/navitia/line_reports/lines/` +
      `${encodeURIComponent(lineRef)}/line_reports?${searchParams}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRAFFIC_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          accept: "application/json",
          apikey: apiKey,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const disruptions = normalizeNavitiaLineReportPayload(
      await response.json(),
      lineRef,
    );

    return {
      disruptions,
      lineRef,
      status: getTrafficLineStatus(disruptions),
    };
  } catch (error) {
    return {
      disruptions: [],
      error:
        error instanceof Error
          ? error.message
          : "Unable to load traffic information.",
      lineRef,
      status: "error",
    };
  }
}
