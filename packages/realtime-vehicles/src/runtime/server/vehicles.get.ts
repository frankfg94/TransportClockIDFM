import {
  createError,
  defineEventHandler,
  getRouterParam,
  setHeader,
  setResponseHeaders,
} from "h3";
import {
  getNetexRuntimeEnv,
  getServerIdfmApiKey,
  loadNetexLineCache,
  resolveKnownLineAlias,
} from "#transport-clock/plugin-server";
import {
  createUnavailableVehicleSnapshot,
  isGuidedRealtimeTransportType,
  RealtimeVehicleUpstreamError,
} from "./vehicleSnapshot";
import { getRealtimeVehicleProvider } from "./vehicleProvider";
import { loadIdfmLineTraceSegmentMetrics } from "./lineTraceMetrics";

export default defineEventHandler(async (event) => {
  const transportType = getRouterParam(event, "transportType");
  const lineId = getRouterParam(event, "lineId");

  if (!transportType || !lineId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing transport type or line id.",
    });
  }

  setHeader(
    event,
    "Cache-Control",
    "public, max-age=0, s-maxage=60, stale-while-revalidate=120",
  );

  if (!isGuidedRealtimeTransportType(transportType)) {
    const snapshot = createUnavailableVehicleSnapshot(
      lineId,
      "unsupported_mode",
      new Date(),
      true,
      {
        stage: "topology",
        missing: ["supported_guided_transport_type"],
        cacheTransportMode: transportType,
      },
    );
    logVehicleSnapshot(transportType, lineId, snapshot);
    return snapshot;
  }

  const runtimeEnv = getNetexRuntimeEnv(event);
  let lineCache;

  try {
    lineCache = await loadNetexLineCache(
      resolveKnownLineAlias(transportType, lineId),
      runtimeEnv,
    );
  } catch (error) {
    console.error("[realtime-vehicles:server] topology-load-failed", {
      transportType,
      requestedLineId: lineId,
      error: serializeVehicleError(error),
    });
    throw createError({
      cause: error,
      statusCode: 404,
      statusMessage: `No topology found for ${transportType}/${lineId}.`,
    });
  }

  const apiKey = getServerIdfmApiKey(event);

  if (!apiKey) {
    console.error("[realtime-vehicles:server] configuration-missing", {
      transportType,
      requestedLineId: lineId,
      missing: ["IDFM_API_KEY"],
    });
    throw createError({
      statusCode: 500,
      statusMessage: "IDFM_API_KEY is not configured on this deployment.",
    });
  }

  try {
    const provider = getRealtimeVehicleProvider();
    const [snapshot, segmentMetricResult] = await Promise.all([
      provider.loadSnapshot({
        apiKey,
        lineCache,
      }),
      loadIdfmLineTraceSegmentMetrics({ lineCache }),
    ]);
    const enrichedSnapshot = {
      ...snapshot,
      segmentMetrics: segmentMetricResult.metrics,
      diagnostics: {
        ...snapshot.diagnostics,
        segmentMetricCount: segmentMetricResult.metrics.length,
        gtfsShapeMetricCount: segmentMetricResult.metrics.filter(
          (metric) => metric.distanceSource === "gtfs_shape",
        ).length,
        segmentMetricFallbackCount: segmentMetricResult.metrics.filter(
          (metric) => metric.distanceSource === "geodesic_fallback",
        ).length,
        lineTraceStatus: segmentMetricResult.status,
        providerId: provider.id,
        providerExactCoordinates: provider.capabilities.exactCoordinates,
      },
    };

    if (segmentMetricResult.missing.length > 0) {
      console.warn("[realtime-vehicles:server] segment-metrics-degraded", {
        transportType,
        requestedLineId: lineId,
        routeId: segmentMetricResult.routeId,
        status: segmentMetricResult.status,
        metricCount: segmentMetricResult.metrics.length,
        missing: segmentMetricResult.missing,
      });
    }
    logVehicleSnapshot(transportType, lineId, enrichedSnapshot);
    return enrichedSnapshot;
  } catch (error) {
    console.error("[realtime-vehicles:server] snapshot-failed", {
      transportType,
      requestedLineId: lineId,
      error: serializeVehicleError(error),
    });

    if (error instanceof RealtimeVehicleUpstreamError) {
      if (error.retryAfter) {
        setResponseHeaders(event, { "Retry-After": error.retryAfter });
      }

      throw createError({
        cause: error,
        statusCode: error.statusCode,
        statusMessage:
          error.statusCode === 429
            ? "IDFM realtime quota exceeded."
            : "IDFM realtime service is temporarily unavailable.",
      });
    }

    const statusCode = getErrorStatusCode(error);

    throw createError({
      cause: error,
      statusCode,
      statusMessage: "Unable to build the realtime vehicle snapshot.",
    });
  }
});

function logVehicleSnapshot(
  transportType: string,
  requestedLineId: string,
  snapshot: {
    available: boolean;
    complete: boolean;
    diagnostics?: unknown;
    generatedAt: string;
    journeys: unknown[];
    lineId: string;
    reason?: string;
  },
): void {
  const details = {
    transportType,
    requestedLineId,
    resolvedLineId: snapshot.lineId,
    available: snapshot.available,
    reason: snapshot.reason,
    complete: snapshot.complete,
    generatedAt: snapshot.generatedAt,
    journeyCount: snapshot.journeys.length,
    diagnostics: snapshot.diagnostics,
  };

  if (snapshot.available) {
    console.info("[realtime-vehicles:server] snapshot-ready", details);
  } else {
    console.warn("[realtime-vehicles:server] snapshot-unavailable", details);
  }
}

function serializeVehicleError(error: unknown): {
  message: string;
  name?: string;
  statusCode?: number;
  upstreamStatus?: number;
} {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const details = error as Error & {
    statusCode?: number;
    upstreamStatus?: number;
  };

  return {
    message: error.message,
    name: error.name,
    statusCode: details.statusCode,
    upstreamStatus: details.upstreamStatus,
  };
}

function getErrorStatusCode(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }

  return 503;
}
