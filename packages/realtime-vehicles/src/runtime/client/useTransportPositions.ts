import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from "vue";
import type {
  TransitVehicleSnapshot,
  TransportPosition,
  TransportPositionsStatus,
} from "./transportPositions";
import { createTransportPositionEngine } from "./transportPositionEngine";
import {
  measureTransportPositionAccuracy,
  type TransportPositionAccuracyReport,
} from "./transportPositionAccuracy";
import { getTransportPositionLineProfile } from "./transportPositionLineProfiles";
import {
  TRANSPORT_POSITION_PARAMETER_DEFINITIONS,
  createDefaultTransportPositionParameterSettings,
  normalizeTransportPositionParameterSettings,
  type TransportPositionParameterSettings,
  type TransportPositionParameterState,
} from "./transportPositionParameters";

const DEFAULT_POLL_AFTER_MS = 60_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;
const MAX_POLL_JITTER_RATIO = 0.05;

export interface UseTransportPositionsOptions {
  active: MaybeRefOrGetter<boolean>;
  endpoint: MaybeRefOrGetter<string | undefined>;
  reduceMotion: MaybeRefOrGetter<boolean>;
  parameterSettings?: MaybeRefOrGetter<TransportPositionParameterSettings>;
}

export function useTransportPositions(options: UseTransportPositionsOptions) {
  const transportPositions = shallowRef<TransportPosition[]>([]);
  const status = ref<TransportPositionsStatus>("idle");
  const lastUpdatedAt = ref<string>();
  const latestSnapshot = shallowRef<TransitVehicleSnapshot>();
  const accuracy = shallowRef<TransportPositionAccuracyReport>();
  const normalizedParameterSettings = computed(() =>
    normalizeTransportPositionParameterSettings(
      options.parameterSettings
        ? toValue(options.parameterSettings)
        : createDefaultTransportPositionParameterSettings(),
    ),
  );
  const engine = createTransportPositionEngine(
    normalizedParameterSettings.value,
  );
  const parameters = computed<TransportPositionParameterState[]>(() =>
    TRANSPORT_POSITION_PARAMETER_DEFINITIONS.map((definition) => {
      const distanceAvailable = Boolean(
        latestSnapshot.value?.segmentMetrics?.length,
      );
      const runtimeAvailable =
        definition.availability === "available" &&
        (definition.id === "metro13Profile"
          ? Boolean(getTransportPositionLineProfile(latestSnapshot.value?.lineId))
          : !["trackDistance", "speed"].includes(definition.id) ||
            distanceAvailable);

      return {
        ...definition,
        enabled: normalizedParameterSettings.value[definition.id].enabled,
        runtimeAvailable,
        value: normalizedParameterSettings.value[definition.id],
      };
    }),
  );
  let requestSequence = 0;
  let consecutiveFailures = 0;
  let abortController: AbortController | undefined;
  let pollTimer: number | undefined;
  let animationFrame: number | undefined;
  let stopped = false;

  watch(
    normalizedParameterSettings,
    (value) => {
      engine.configure(value);
      publishPositions();
    },
    { deep: true },
  );

  watch(
    () => [
      Boolean(toValue(options.active)),
      normalizeEndpoint(toValue(options.endpoint)),
    ] as const,
    ([active, endpoint], previous) => {
      const endpointChanged = previous !== undefined && endpoint !== previous[1];

      if (!active || !endpoint) {
        deactivate();
        return;
      }

      if (endpointChanged) {
        engine.reset();
        transportPositions.value = [];
        lastUpdatedAt.value = undefined;
        consecutiveFailures = 0;
      }

      if (!isDocumentVisible()) {
        stopNetworkWork();
        status.value = lastUpdatedAt.value ? "stale" : "idle";
        return;
      }

      console.info("[transport-positions] activated", {
        endpoint,
        reduceMotion: Boolean(toValue(options.reduceMotion)),
      });
      startAnimation();
      void refresh();
    },
    { immediate: true },
  );

  watch(
    () => Boolean(toValue(options.reduceMotion)),
    (reduceMotion) => {
      publishPositions();

      if (reduceMotion) {
        stopAnimation();
      } else {
        startAnimation();
      }
    },
  );

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  onScopeDispose(() => {
    stopped = true;
    requestSequence += 1;
    stopNetworkWork();
    stopAnimation();

    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  });

  async function refresh(): Promise<void> {
    const endpoint = normalizeEndpoint(toValue(options.endpoint));

    if (!canRun(endpoint)) {
      return;
    }

    clearPollTimer();
    abortController?.abort();
    abortController =
      typeof AbortController === "undefined"
        ? undefined
        : new AbortController();
    const requestId = ++requestSequence;

    if (!lastUpdatedAt.value) {
      status.value = "loading";
    }

    try {
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        signal: abortController?.signal,
      });

      if (requestId !== requestSequence) {
        return;
      }

      if (response.status === 429) {
        consecutiveFailures += 1;
        status.value = "rate_limited";
        console.warn("[transport-positions] rate-limited", {
          endpoint,
          retryAfter: response.headers.get("Retry-After"),
          consecutiveFailures,
        });
        schedulePoll(
          parseRetryAfter(response.headers.get("Retry-After"), Date.now()) ??
            getTransportPositionRetryDelay(consecutiveFailures),
        );
        return;
      }

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const payload: unknown = await response.json();

      if (!isTransitVehicleSnapshot(payload)) {
        throw new Error("Invalid transport positions response");
      }

      if (requestId !== requestSequence) {
        return;
      }

      consecutiveFailures = 0;
      const refreshedAtMs = Date.now();
      const previousSnapshot = latestSnapshot.value;
      const simulatedBeforeRefresh = previousSnapshot
        ? engine.positionsAt(
            refreshedAtMs,
            Boolean(toValue(options.reduceMotion)),
          )
        : [];
      const accuracyReport = previousSnapshot
        ? measureTransportPositionAccuracy({
            previousSnapshot,
            freshSnapshot: payload,
            simulatedPositions: simulatedBeforeRefresh,
            parameters: normalizedParameterSettings.value,
            atMs: refreshedAtMs,
          })
        : undefined;

      accuracy.value = accuracyReport;

      if (accuracyReport) {
        console.info("[transport-positions] accuracy", accuracyReport);
        traceTransportPosition("accuracy", accuracyReport);
      } else if (previousSnapshot) {
        const unavailableAccuracyDetails = {
          lineId: payload.lineId,
          previousJourneyCount: previousSnapshot.journeys.length,
          freshJourneyCount: payload.journeys.length,
          simulatedPositionCount: simulatedBeforeRefresh.length,
          missing: [
            "stable_journey_match_or_common_target_time_between_T1_and_T2",
          ],
        };
        console.warn(
          "[transport-positions] accuracy-unavailable",
          unavailableAccuracyDetails,
        );
        traceTransportPosition(
          "accuracy-unavailable",
          unavailableAccuracyDetails,
        );
      }

      engine.reconcile(
        payload,
        refreshedAtMs,
        Boolean(toValue(options.reduceMotion)),
      );
      latestSnapshot.value = payload;
      publishPositions();
      lastUpdatedAt.value = payload.generatedAt;
      status.value = payload.available ? "live" : "unavailable";

      const snapshotSummary = summarizeTransportSnapshot(payload);
      const missingSegmentMetricPairs = findMissingSegmentMetricPairs(payload);

      if (payload.available && missingSegmentMetricPairs.length > 0) {
        const missingMetricDetails = {
          endpoint,
          missing: ["segment_distance_metric"],
          lineId: payload.lineId,
          lineTraceStatus: payload.diagnostics?.lineTraceStatus,
          availableMetricCount: payload.segmentMetrics?.length ?? 0,
          stationPairs: missingSegmentMetricPairs,
        };
        console.warn(
          "[transport-positions] segment-metrics-missing",
          missingMetricDetails,
        );
        traceTransportPosition("segment-metrics-missing", missingMetricDetails);
      }

      if (!payload.available) {
        console.warn("[transport-positions] snapshot-unavailable", {
          endpoint,
          ...snapshotSummary,
        });
      } else if (transportPositions.value.length === 0) {
        console.warn("[transport-positions] no-projectable-positions", {
          endpoint,
          missing: ["journey_covering_current_time_between_two_mapped_stations"],
          now: new Date().toISOString(),
          ...snapshotSummary,
        });
      } else {
        const appliedDetails = {
          endpoint,
          projectedPositionCount: transportPositions.value.length,
          movingPositionCount: transportPositions.value.filter(
            (position) => position.state === "moving",
          ).length,
          atStopPositionCount: transportPositions.value.filter(
            (position) => position.state === "at_stop",
          ).length,
          ...snapshotSummary,
        };
        console.info("[transport-positions] snapshot-applied", appliedDetails);
        traceTransportPosition("snapshot-applied", appliedDetails);
      }

      startAnimation();
      const clientPollAfterMs = getConfiguredTransportPositionPollAfterMs(
        payload.pollAfterMs,
        normalizedParameterSettings.value,
      );
      const pollDetails = {
        providerPollAfterMs: normalizePollAfterMs(payload.pollAfterMs),
        clientPollAfterMs,
        estimatedClientCallsPerDay: Math.round(86_400_000 / clientPollAfterMs),
      };
      console.info("[transport-positions] next-poll", pollDetails);
      traceTransportPosition("next-poll", pollDetails);
      schedulePoll(clientPollAfterMs);
    } catch (error) {
      if (requestId !== requestSequence || isAbortError(error)) {
        return;
      }

      consecutiveFailures += 1;
      status.value = lastUpdatedAt.value ? "stale" : "error";
      console.error("[transport-positions] refresh-failed", {
        endpoint,
        consecutiveFailures,
        retainedPositionCount: transportPositions.value.length,
        error: serializeTransportPositionError(error),
      });
      schedulePoll(getTransportPositionRetryDelay(consecutiveFailures));
    } finally {
      if (requestId === requestSequence) {
        abortController = undefined;
      }
    }
  }

  function handleVisibilityChange(): void {
    if (!isDocumentVisible()) {
      requestSequence += 1;
      stopNetworkWork();
      stopAnimation();

      if (lastUpdatedAt.value) {
        status.value = "stale";
      }
      return;
    }

    const endpoint = normalizeEndpoint(toValue(options.endpoint));

    if (canRun(endpoint)) {
      startAnimation();
      void refresh();
    }
  }

  function deactivate(): void {
    requestSequence += 1;
    stopNetworkWork();
    stopAnimation();
    engine.reset();
    transportPositions.value = [];
    lastUpdatedAt.value = undefined;
    latestSnapshot.value = undefined;
    accuracy.value = undefined;
    consecutiveFailures = 0;
    status.value = "idle";
  }

  function stopNetworkWork(): void {
    abortController?.abort();
    abortController = undefined;
    clearPollTimer();
  }

  function schedulePoll(delayMs: number): void {
    clearPollTimer();

    const endpoint = normalizeEndpoint(toValue(options.endpoint));

    if (!canRun(endpoint) || typeof window === "undefined") {
      return;
    }

    pollTimer = window.setTimeout(() => {
      pollTimer = undefined;
      void refresh();
    }, withPollingJitter(delayMs));
  }

  function clearPollTimer(): void {
    if (pollTimer !== undefined && typeof window !== "undefined") {
      window.clearTimeout(pollTimer);
      pollTimer = undefined;
    }
  }

  function startAnimation(): void {
    if (
      animationFrame !== undefined ||
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function" ||
      Boolean(toValue(options.reduceMotion)) ||
      !canRun(normalizeEndpoint(toValue(options.endpoint)))
    ) {
      return;
    }

    const tick = () => {
      animationFrame = undefined;

      if (!canRun(normalizeEndpoint(toValue(options.endpoint)))) {
        return;
      }

      publishPositions();
      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
  }

  function stopAnimation(): void {
    if (
      animationFrame !== undefined &&
      typeof window !== "undefined" &&
      typeof window.cancelAnimationFrame === "function"
    ) {
      window.cancelAnimationFrame(animationFrame);
    }

    animationFrame = undefined;
  }

  function publishPositions(): void {
    transportPositions.value = engine.positionsAt(
      Date.now(),
      Boolean(toValue(options.reduceMotion)),
    );
  }

  function canRun(endpoint: string | undefined): endpoint is string {
    return (
      !stopped &&
      Boolean(toValue(options.active)) &&
      Boolean(endpoint) &&
      typeof window !== "undefined" &&
      typeof document !== "undefined" &&
      isDocumentVisible()
    );
  }

  return {
    transportPositions,
    parameters,
    accuracy,
    status,
    lastUpdatedAt,
    snapshot: latestSnapshot,
    refresh,
  };
}

export function parseRetryAfter(
  value: string | null | undefined,
  nowMs = Date.now(),
): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return undefined;
  }

  const seconds = Number(normalizedValue);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const retryAt = Date.parse(normalizedValue);

  return Number.isFinite(retryAt) ? Math.max(0, retryAt - nowMs) : undefined;
}

export function withPollingJitter(
  delayMs: number,
  random = Math.random(),
): number {
  const normalizedDelayMs = Number.isFinite(delayMs)
    ? Math.max(0, delayMs)
    : DEFAULT_POLL_AFTER_MS;
  const normalizedRandom = Number.isFinite(random)
    ? Math.min(1, Math.max(0, random))
    : 0;

  return Math.round(
    normalizedDelayMs *
      (1 + MAX_POLL_JITTER_RATIO * normalizedRandom),
  );
}

export function getTransportPositionRetryDelay(
  consecutiveFailures: number,
): number {
  return Math.min(
    MAX_RETRY_DELAY_MS,
    DEFAULT_POLL_AFTER_MS * 2 ** Math.max(0, consecutiveFailures - 1),
  );
}

export function getConfiguredTransportPositionPollAfterMs(
  providerPollAfterMs: number,
  parameters: TransportPositionParameterSettings,
): number {
  return parameters.polling.enabled
    ? Math.round(parameters.polling.intervalSeconds * 1_000)
    : normalizePollAfterMs(providerPollAfterMs);
}

function normalizePollAfterMs(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_POLL_AFTER_MS;
}

function normalizeEndpoint(value: string | undefined): string | undefined {
  const endpoint = value?.trim();
  return endpoint || undefined;
}

function isDocumentVisible(): boolean {
  return typeof document !== "undefined" && !document.hidden;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.message === "AbortError")
  );
}

function isTransitVehicleSnapshot(
  value: unknown,
): value is TransitVehicleSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<TransitVehicleSnapshot>;

  return (
    typeof snapshot.available === "boolean" &&
    typeof snapshot.generatedAt === "string" &&
    typeof snapshot.complete === "boolean" &&
    typeof snapshot.pollAfterMs === "number" &&
    Array.isArray(snapshot.journeys)
  );
}

function summarizeTransportSnapshot(snapshot: TransitVehicleSnapshot): {
  available: boolean;
  reason: TransitVehicleSnapshot["reason"];
  lineId: string;
  complete: boolean;
  generatedAt: string;
  journeyCount: number;
  callCount: number;
  timedCallCount: number;
  earliestCallTime?: string;
  latestCallTime?: string;
  diagnostics: TransitVehicleSnapshot["diagnostics"];
  segmentMetricCount: number;
  gtfsShapeMetricCount: number;
  fallbackMetricCount: number;
} {
  const calls = snapshot.journeys.flatMap((journey) => journey.calls);
  const timestamps = calls
    .flatMap((call) => [
      call.arrivalAt,
      call.departureAt,
      call.aimedArrivalAt,
      call.aimedDepartureAt,
    ])
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, timestamp: Date.parse(value) }))
    .filter(({ timestamp }) => Number.isFinite(timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);

  return {
    available: snapshot.available,
    reason: snapshot.reason,
    lineId: snapshot.lineId,
    complete: snapshot.complete,
    generatedAt: snapshot.generatedAt,
    journeyCount: snapshot.journeys.length,
    callCount: calls.length,
    timedCallCount: calls.filter((call) =>
      Boolean(
        call.arrivalAt ||
          call.departureAt ||
          call.aimedArrivalAt ||
          call.aimedDepartureAt,
      ),
    ).length,
    earliestCallTime: timestamps[0]?.value,
    latestCallTime: timestamps.at(-1)?.value,
    segmentMetricCount: snapshot.segmentMetrics?.length ?? 0,
    gtfsShapeMetricCount:
      snapshot.segmentMetrics?.filter(
        (metric) => metric.distanceSource === "gtfs_shape",
      ).length ?? 0,
    fallbackMetricCount:
      snapshot.segmentMetrics?.filter(
        (metric) => metric.distanceSource === "geodesic_fallback",
      ).length ?? 0,
    diagnostics: snapshot.diagnostics,
  };
}

function findMissingSegmentMetricPairs(
  snapshot: TransitVehicleSnapshot,
): string[] {
  const metricKeys = new Set(
    (snapshot.segmentMetrics ?? []).map((metric) =>
      [metric.sourceStationId, metric.targetStationId].sort().join("\u0000"),
    ),
  );
  const missing = new Set<string>();

  for (const journey of snapshot.journeys) {
    const calls = journey.patternStationIds?.length
      ? journey.patternStationIds.map((stationId, order) => ({
          stationId,
          order,
          cancelled: false,
        }))
      : [...journey.calls]
          .filter((call) => !call.cancelled)
          .sort((left, right) => left.order - right.order);

    for (let index = 0; index < calls.length - 1; index += 1) {
      const pair = [calls[index].stationId, calls[index + 1].stationId];
      const key = [...pair].sort().join("\u0000");

      if (!metricKeys.has(key)) {
        missing.add(pair.join(" -> "));
      }
    }
  }

  return [...missing].slice(0, 12);
}

function traceTransportPosition(event: string, details: unknown): void {
  try {
    console.debug(
      `[transport-positions] trace ${event} ${JSON.stringify(details)}`,
    );
  } catch {
    console.debug(`[transport-positions] trace ${event} serialization_failed`);
  }
}

function serializeTransportPositionError(error: unknown): {
  message: string;
  name?: string;
} {
  return error instanceof Error
    ? { message: error.message, name: error.name }
    : { message: String(error) };
}
