import { nextTick, onBeforeUnmount, ref, shallowRef, version as vueVersion } from "vue";
import type { CameraState } from "../transport-map/geo/camera";
import {
  startNearbyChaosDiagnostics,
  type NearbyChaosDiagnosticsReport,
} from "./nearbyChaosDiagnostics";
import {
  NEARBY_RADIUS_MAX_METERS,
  NEARBY_RADIUS_MIN_METERS,
  NEARBY_RADIUS_STEP_METERS,
} from "./nearbyStations";

export const NEARBY_CHAOS_ZOOM_PROFILE = Object.freeze({
  id: "nearby-stations-chaos-zoom",
  version: 2,
  maximumFrameSamples: 1_800,
  lagFrameThresholdMs: 33.4,
});

export type NearbyChaosZoomActionKind =
  | "pan-short"
  | "pan-long"
  | "zoom-in-fast"
  | "zoom-out-fast"
  | "zoom-in-slow"
  | "zoom-out-slow"
  | "radius-change"
  | "combined-fast";

export interface NearbyChaosZoomAction {
  index: number;
  phase: "pan-sweep" | "zoom-sweep" | "radius-sweep" | "mixed-burst";
  kind: NearbyChaosZoomActionKind;
  durationMs: number;
  eventCount: number;
  panFromRatioX?: number;
  panFromRatioY?: number;
  panToRatioX?: number;
  panToRatioY?: number;
  zoomDelta?: number;
  radiusMeters?: number;
}

export interface NearbyChaosZoomActionResult extends NearbyChaosZoomAction {
  status: "completed" | "interrupted";
  startedOffsetMs: number;
  completedOffsetMs: number;
  actualDurationMs: number;
  radiusBeforeMeters: number;
  radiusAfterMeters: number;
  cameraBefore: NearbyChaosCameraSnapshot;
  cameraAfter: NearbyChaosCameraSnapshot;
  frameSummary: NearbyChaosFrameSummary;
  loadingAtStart: boolean;
  loadingAtEnd: boolean;
  domCounts: NearbyChaosDomCounts;
}

export interface NearbyChaosFrameSample {
  offsetMs: number;
  durationMs: number;
  actionIndex: number | null;
  overlappingActionIndices: number[];
  zoom: number;
  radiusMeters: number;
  contextObservedOffsetMs: number;
  callbackDelayMs: number;
}

export interface NearbyChaosFrameSummary {
  sampleCount: number;
  averageFps: number | null;
  meanIntervalMs: number | null;
  p50IntervalMs: number | null;
  p95IntervalMs: number | null;
  p99IntervalMs: number | null;
  maxIntervalMs: number | null;
  over16Ms: number;
  over33Ms: number;
  over50Ms: number;
  over100Ms: number;
}

export interface NearbyChaosCameraSnapshot {
  zoom: number;
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
  pixelRatio: number;
  generation: number;
}

export interface NearbyChaosDomCounts {
  stationMarkers: number;
  leavingStationMarkers: number;
  projectedStations: number;
  placeElements: number;
  canvasElements: number;
  svgElements: number;
}

export interface NearbyChaosLongTask {
  startOffsetMs: number;
  durationMs: number;
  overlappingActionIndices: number[];
}

export interface NearbyChaosZoomReport {
  schemaVersion: 3;
  diagnostics: NearbyChaosDiagnosticsReport;
  reportType: "nearby-stations-chaos-zoom";
  profile: {
    id: typeof NEARBY_CHAOS_ZOOM_PROFILE.id;
    version: typeof NEARBY_CHAOS_ZOOM_PROFILE.version;
  };
  status: "completed" | "failed" | "cancelled";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  error?: string;
  environment: {
    developmentBuild: boolean;
    vueVersion: string;
    documentFocusedAtStart: boolean;
    documentFocusedAtEnd: boolean;
    userAgent: string | null;
    hardwareConcurrency: number | null;
    deviceMemoryGiB: number | null;
    viewportWidthCssPx: number;
    viewportHeightCssPx: number;
    pixelRatio: number;
    visibilityStart: string;
    visibilityEnd: string;
    visibilityChanges: number;
    longTaskObserver: boolean;
    jsHeapMemory: {
      beforeBytes: number | null;
      afterBytes: number | null;
      deltaBytes: number | null;
    };
  };
  map: {
    contextAtStart: NearbyChaosMapContext;
    contextAtEnd: NearbyChaosMapContext;
    viewAtStart: "neighborhood" | "city";
    viewAtEnd: "neighborhood" | "city";
    basemapAtStart: string;
    basemapAtEnd: string;
    loadingAtStart: boolean;
    loadingAtEnd: boolean;
    stationInputCount: number;
    visibleStationCount: number;
    placeInputCount: number;
    activeModes: string[];
    stationInputCountAtEnd: number;
    visibleStationCountAtEnd: number;
    placeInputCountAtEnd: number;
    activeModesAtEnd: string[];
    initialDomCounts: NearbyChaosDomCounts;
    finalDomCounts: NearbyChaosDomCounts;
  };
  camera: {
    initial: NearbyChaosCameraSnapshot;
    beforeRestore: NearbyChaosCameraSnapshot;
    restored: NearbyChaosCameraSnapshot;
    zoomRange: { minimum: number; maximum: number };
    restorationDurationMs: number;
    restorationFrameObserved: boolean;
  };
  radius: {
    initialMeters: number;
    minimumMeters: number;
    maximumMeters: number;
    requestedChangesMeters: number[];
    observedTimeline: { offsetMs: number; meters: number }[];
    restoredMeters: number;
  };
  workload: {
    operationCount: number;
    completedOperationCount: number;
    recoveryActionIndex: number;
    frameSampler: "requestAnimationFrame-interval";
    frameIntervals: NearbyChaosFrameSummary;
    frameSampleLimit: number;
    frameSampleLimitReached: boolean;
    droppedFrameSamples: number;
    droppedLongTasks: number;
    longTaskLimit: number;
    measurementWarnings: string[];
    timing: {
      plannedGestureDurationMs: number;
      actualGestureDurationMs: number;
      gestureOverrunMs: number;
      recoveryStartedOffsetMs: number;
      restorationStartedOffsetMs: number;
      samplingEndedOffsetMs: number;
      sampledIntervalDurationMs: number;
    };
    plannedOperations: NearbyChaosZoomAction[];
    frameSamples: NearbyChaosFrameSample[];
    worstFrames: NearbyChaosFrameSample[];
    longTasks: NearbyChaosLongTask[];
    operations: NearbyChaosZoomActionResult[];
    caveats: string[];
  };
}

export function createNearbyChaosZoomPlan(baseRadiusMeters: number): NearbyChaosZoomAction[] {
  const base = normalizeRadius(baseRadiusMeters);
  const lower = NEARBY_RADIUS_MIN_METERS;
  const upper = NEARBY_RADIUS_MAX_METERS;
  const middle = normalizeRadius((lower + upper) / 2);
  const radiusValues = [
    upper,
    lower,
    upper - NEARBY_RADIUS_STEP_METERS,
    lower + NEARBY_RADIUS_STEP_METERS,
    middle,
    base,
  ];
  const step = (
    phase: NearbyChaosZoomAction["phase"],
    kind: NearbyChaosZoomActionKind,
    durationMs: number,
    eventCount: number,
    values: Partial<
      Pick<
        NearbyChaosZoomAction,
        | "panFromRatioX"
        | "panFromRatioY"
        | "panToRatioX"
        | "panToRatioY"
        | "zoomDelta"
        | "radiusMeters"
      >
    > = {},
  ): Omit<NearbyChaosZoomAction, "index"> => ({ phase, kind, durationMs, eventCount, ...values });
  const plan = [
    step("pan-sweep", "pan-short", 150, 6, {
      panFromRatioX: 0.44,
      panFromRatioY: 0.48,
      panToRatioX: 0.55,
      panToRatioY: 0.53,
    }),
    step("pan-sweep", "pan-long", 420, 18, {
      panFromRatioX: 0.18,
      panFromRatioY: 0.28,
      panToRatioX: 0.84,
      panToRatioY: 0.74,
    }),
    step("zoom-sweep", "zoom-in-fast", 200, 16, { zoomDelta: 1.5 }),
    step("radius-sweep", "radius-change", 140, 1, { radiusMeters: radiusValues[0] }),
    step("pan-sweep", "pan-short", 110, 5, {
      panFromRatioX: 0.54,
      panFromRatioY: 0.52,
      panToRatioX: 0.46,
      panToRatioY: 0.47,
    }),
    step("zoom-sweep", "zoom-out-slow", 900, 18, { zoomDelta: -1.25 }),
    step("radius-sweep", "radius-change", 140, 1, { radiusMeters: radiusValues[1] }),
    step("pan-sweep", "pan-long", 520, 22, {
      panFromRatioX: 0.82,
      panFromRatioY: 0.7,
      panToRatioX: 0.14,
      panToRatioY: 0.3,
    }),
    step("zoom-sweep", "zoom-in-slow", 850, 17, { zoomDelta: 1.1 }),
    step("zoom-sweep", "zoom-out-fast", 180, 18, { zoomDelta: -1.6 }),
    step("radius-sweep", "radius-change", 140, 1, { radiusMeters: radiusValues[2] }),
    step("mixed-burst", "combined-fast", 300, 12, {
      panFromRatioX: 0.22,
      panFromRatioY: 0.76,
      panToRatioX: 0.77,
      panToRatioY: 0.24,
      zoomDelta: 1.05,
      radiusMeters: radiusValues[0],
    }),
    step("pan-sweep", "pan-short", 100, 5, {
      panFromRatioX: 0.5,
      panFromRatioY: 0.5,
      panToRatioX: 0.57,
      panToRatioY: 0.45,
    }),
    step("mixed-burst", "combined-fast", 260, 10, {
      panFromRatioX: 0.77,
      panFromRatioY: 0.28,
      panToRatioX: 0.24,
      panToRatioY: 0.72,
      zoomDelta: -1.2,
      radiusMeters: radiusValues[1],
    }),
    step("zoom-sweep", "zoom-in-fast", 160, 14, { zoomDelta: 1.35 }),
    step("radius-sweep", "radius-change", 140, 1, { radiusMeters: radiusValues[3] }),
    step("pan-sweep", "pan-long", 460, 20, {
      panFromRatioX: 0.16,
      panFromRatioY: 0.2,
      panToRatioX: 0.85,
      panToRatioY: 0.8,
    }),
    step("mixed-burst", "combined-fast", 280, 11, {
      panFromRatioX: 0.2,
      panFromRatioY: 0.5,
      panToRatioX: 0.8,
      panToRatioY: 0.48,
      zoomDelta: 1.15,
      radiusMeters: radiusValues[2],
    }),
    step("zoom-sweep", "zoom-out-slow", 700, 14, { zoomDelta: -1.05 }),
    step("radius-sweep", "radius-change", 140, 1, { radiusMeters: radiusValues[4] }),
    step("mixed-burst", "combined-fast", 300, 12, {
      panFromRatioX: 0.8,
      panFromRatioY: 0.25,
      panToRatioX: 0.2,
      panToRatioY: 0.75,
      zoomDelta: -1.25,
      radiusMeters: radiusValues[5],
    }),
  ];

  return plan.map((action, index) => ({ ...action, index }));
}

export function summarizeNearbyChaosFrames(
  samples: readonly NearbyChaosFrameSample[],
  durationMs: number,
): NearbyChaosFrameSummary {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      averageFps: null,
      meanIntervalMs: null,
      p50IntervalMs: null,
      p95IntervalMs: null,
      p99IntervalMs: null,
      maxIntervalMs: null,
      over16Ms: 0,
      over33Ms: 0,
      over50Ms: 0,
      over100Ms: 0,
    };
  }

  const intervals = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
  const meanIntervalMs = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const percentile = (ratio: number) =>
    intervals[Math.min(intervals.length - 1, Math.ceil(ratio * intervals.length) - 1)]!;
  const elapsedMs = Math.max(
    durationMs,
    intervals.reduce((sum, value) => sum + value, 0),
  );

  return {
    sampleCount: intervals.length,
    averageFps: elapsedMs > 0 ? (intervals.length * 1_000) / elapsedMs : null,
    meanIntervalMs,
    p50IntervalMs: percentile(0.5),
    p95IntervalMs: percentile(0.95),
    p99IntervalMs: percentile(0.99),
    maxIntervalMs: intervals.at(-1) ?? null,
    over16Ms: intervals.filter((value) => value > 16.7).length,
    over33Ms: intervals.filter((value) => value > 33.4).length,
    over50Ms: intervals.filter((value) => value > 50).length,
    over100Ms: intervals.filter((value) => value > 100).length,
  };
}

function attributeNearbyChaosIntervals(
  frameSamples: NearbyChaosFrameSample[],
  longTasks: NearbyChaosLongTask[],
  operations: readonly NearbyChaosZoomActionResult[],
  recoveryActionIndex: number,
  recoveryStartedOffsetMs: number,
): void {
  for (const sample of frameSamples) {
    const intervalStartMs = sample.offsetMs - sample.durationMs;
    const midpointMs = intervalStartMs + sample.durationMs / 2;
    sample.overlappingActionIndices = operations
      .filter(
        (operation) =>
          intervalStartMs < operation.completedOffsetMs &&
          sample.offsetMs > operation.startedOffsetMs,
      )
      .map((operation) => operation.index);
    const midpointOperation = operations.find(
      (operation) =>
        midpointMs >= operation.startedOffsetMs && midpointMs < operation.completedOffsetMs,
    );
    sample.actionIndex =
      midpointOperation?.index ??
      (midpointMs >= recoveryStartedOffsetMs ? recoveryActionIndex : null);
    if (sample.offsetMs > recoveryStartedOffsetMs)
      sample.overlappingActionIndices.push(recoveryActionIndex);
  }

  for (const task of longTasks) {
    const taskEndMs = task.startOffsetMs + task.durationMs;
    task.overlappingActionIndices = operations
      .filter(
        (operation) =>
          task.startOffsetMs < operation.completedOffsetMs && taskEndMs > operation.startedOffsetMs,
      )
      .map((operation) => operation.index);
    if (taskEndMs > recoveryStartedOffsetMs)
      task.overlappingActionIndices.push(recoveryActionIndex);
  }
}

function normalizeRadius(value: number): number {
  const rounded = Math.round(value / NEARBY_RADIUS_STEP_METERS) * NEARBY_RADIUS_STEP_METERS;
  return Math.min(NEARBY_RADIUS_MAX_METERS, Math.max(NEARBY_RADIUS_MIN_METERS, rounded));
}

export interface NearbyChaosMapContext {
  view: "neighborhood" | "city";
  radiusMeters: number;
  basemap: string;
  loading: boolean;
  stationInputCount: number;
  visibleStationCount: number;
  placeInputCount: number;
  activeModes: string[];
  sidebarTab: "summary" | "schedule";
  layers: {
    isochrone: boolean;
    noise: boolean;
    airQuality: boolean;
    realEstate: boolean;
    optionalPlaces: Record<string, boolean>;
  };
}

export interface UseNearbyChaosZoomOptions {
  getElement: () => HTMLElement | undefined;
  getCamera: () => CameraState;
  getRadius: () => number;
  getZoomRange: () => { min: number; max: number };
  getZoomReference: () => number;
  getMapContext: () => NearbyChaosMapContext;
  updateRadius: (value: number) => void;
  beforeRun: () => void;
  flushCamera: () => void;
  restore: (
    camera: CameraState,
    zoomRange: { min: number; max: number },
    zoomReference: number,
  ) => void;
}

/** Installs frame and long-task probes only for the user-started run. */
export function useNearbyChaosZoom(options: UseNearbyChaosZoomOptions) {
  const running = ref(false);
  const progress = ref(0);
  const total = ref(0);
  const report = shallowRef<NearbyChaosZoomReport>();
  let controller: AbortController | undefined;
  let runToken = 0;
  let unmounted = false;

  onBeforeUnmount(() => {
    unmounted = true;
    controller?.abort();
  });

  function cancel(): void {
    controller?.abort();
  }

  function downloadReport(): void {
    if (
      !report.value ||
      typeof document === "undefined" ||
      typeof URL.createObjectURL !== "function"
    )
      return;
    const blob = new Blob([JSON.stringify(report.value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nearby-chaos-zoom-${report.value.completedAt.replace(/[:.]/g, "-")}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function run(): Promise<void> {
    if (running.value || unmounted) return;
    const element = options.getElement();
    if (!element) return;

    options.beforeRun();
    const actions = createNearbyChaosZoomPlan(options.getRadius());
    const initialCamera = { ...options.getCamera() };
    const initialRadius = options.getRadius();
    const initialZoomRange = { ...options.getZoomRange() };
    const initialZoomReference = options.getZoomReference();
    const initialContext = options.getMapContext();
    const initialDomCounts = readDomCounts(element);
    const initialMemoryBytes = readUsedJsHeapBytes();
    const startedAt = new Date().toISOString();
    const startedAtMs = now();
    const documentFocusedAtStart = document.hasFocus();
    const runId = ++runToken;
    const runController = new AbortController();
    controller = runController;
    const { signal } = runController;
    const frameSamples: NearbyChaosFrameSample[] = [];
    const longTasks: NearbyChaosLongTask[] = [];
    const operationResults: NearbyChaosZoomActionResult[] = [];
    const requestedRadiusChanges = actions.flatMap((action) =>
      action.radiusMeters === undefined ? [] : [action.radiusMeters],
    );
    let frameSampleLimitReached = false;
    let droppedFrameSamples = 0;
    let droppedLongTasks = 0;
    let previousFrameTimestamp: number | undefined;
    let frameHandle = 0;
    let frameTimeout: number | undefined;
    let frameSampling = true;
    let observer: PerformanceObserver | undefined;
    let longTaskObserver = false;
    let visibilityChanges = 0;
    const visibilityStart =
      typeof document === "undefined" ? "unavailable" : document.visibilityState;
    const onVisibilityChange = () => {
      visibilityChanges += 1;
    };
    let finalStatus: NearbyChaosZoomReport["status"] = "completed";
    let errorMessage: string | undefined;
    let beforeRestoreCamera = { ...initialCamera };
    let restoredCamera = { ...initialCamera };
    let restorationDurationMs = 0;
    let restorationFrameObserved = false;
    const diagnostics = startNearbyChaosDiagnostics(startedAtMs, options.getMapContext);

    function scheduleFrame(): void {
      if (!frameSampling) return;
      if (typeof requestAnimationFrame === "function") {
        frameHandle = requestAnimationFrame(onFrame);
      } else {
        frameTimeout = window.setTimeout(() => onFrame(now()), 16);
      }
    }

    function onFrame(timestamp: number): void {
      if (!frameSampling) return;
      const observedAtMs = now();
      if (previousFrameTimestamp !== undefined) {
        if (frameSamples.length < NEARBY_CHAOS_ZOOM_PROFILE.maximumFrameSamples) {
          frameSamples.push({
            offsetMs: roundMetric(timestamp - startedAtMs),
            durationMs: roundMetric(Math.max(0, timestamp - previousFrameTimestamp)),
            actionIndex: null,
            overlappingActionIndices: [],
            zoom: roundMetric(options.getCamera().zoom),
            radiusMeters: options.getRadius(),
            contextObservedOffsetMs: roundMetric(observedAtMs - startedAtMs),
            callbackDelayMs: roundMetric(Math.max(0, observedAtMs - timestamp)),
          });
        } else {
          frameSampleLimitReached = true;
          droppedFrameSamples += 1;
        }
      }
      previousFrameTimestamp = timestamp;
      scheduleFrame();
    }

    function stopFrameSampling(): void {
      frameSampling = false;
      if (frameHandle) cancelAnimationFrame(frameHandle);
      if (frameTimeout !== undefined) window.clearTimeout(frameTimeout);
    }

    function recordLongTasks(list: PerformanceObserverEntryList): void {
      recordLongTaskEntries(list.getEntries());
    }

    function recordLongTaskEntries(entries: readonly PerformanceEntry[]): void {
      for (const entry of entries) {
        if (entry.startTime < startedAtMs) continue;
        if (longTasks.length >= 100) {
          droppedLongTasks += 1;
          continue;
        }
        longTasks.push({
          startOffsetMs: roundMetric(entry.startTime - startedAtMs),
          durationMs: roundMetric(entry.duration),
          overlappingActionIndices: [],
        });
      }
    }

    function assertActive(): void {
      if (signal.aborted || runId !== runToken || unmounted) throw createAbortError();
    }

    async function performAction(
      action: NearbyChaosZoomAction,
    ): Promise<NearbyChaosZoomActionResult> {
      const mapElement = options.getElement();
      if (!mapElement) throw new Error("Nearby map element is unavailable");
      progress.value = action.index + 1;
      const actionStartedAtMs = now();
      const radiusBeforeMeters = options.getRadius();
      const cameraBefore = readCameraSnapshot(options.getCamera());
      const loadingAtStart = options.getMapContext().loading;
      const rect = mapElement.getBoundingClientRect();
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

      let status: NearbyChaosZoomActionResult["status"] = "interrupted";
      try {
        if (action.kind === "pan-short" || action.kind === "pan-long") {
          await runPanGesture(mapElement, action, signal);
        } else if (
          action.kind === "zoom-in-fast" ||
          action.kind === "zoom-out-fast" ||
          action.kind === "zoom-in-slow" ||
          action.kind === "zoom-out-slow"
        ) {
          await runZoomGesture(mapElement, center, action, signal);
        } else if (action.kind === "combined-fast") {
          await runCombinedGesture(mapElement, center, action, signal);
        } else if (action.kind === "radius-change") {
          if (action.radiusMeters !== undefined && action.radiusMeters !== radiusBeforeMeters) {
            options.updateRadius(action.radiusMeters);
            await nextTick();
          }
          await waitForDelay(action.durationMs, signal);
        }

        assertActive();
        options.flushCamera();
        await nextTick();
        status = "completed";
      } finally {
        const completedAtMs = now();
        const result: NearbyChaosZoomActionResult = {
          ...action,
          status,
          startedOffsetMs: roundMetric(actionStartedAtMs - startedAtMs),
          completedOffsetMs: roundMetric(completedAtMs - startedAtMs),
          actualDurationMs: roundMetric(completedAtMs - actionStartedAtMs),
          radiusBeforeMeters,
          radiusAfterMeters: options.getRadius(),
          cameraBefore,
          cameraAfter: readCameraSnapshot(options.getCamera()),
          frameSummary: summarizeNearbyChaosFrames([], 0),
          loadingAtStart,
          loadingAtEnd: options.getMapContext().loading,
          domCounts: readDomCounts(mapElement),
        };
        operationResults.push(result);
      }
      return operationResults.at(-1)!;
    }

    running.value = true;
    progress.value = 0;
    total.value = actions.length;
    report.value = undefined;
    document.addEventListener("visibilitychange", onVisibilityChange);
    scheduleFrame();
    try {
      if (
        typeof PerformanceObserver !== "undefined" &&
        PerformanceObserver.supportedEntryTypes?.includes("longtask")
      ) {
        observer = new PerformanceObserver(recordLongTasks);
        observer.observe({ type: "longtask", buffered: false });
        longTaskObserver = true;
      }
    } catch {
      observer?.disconnect();
      observer = undefined;
    }

    try {
      for (const action of actions) {
        assertActive();
        await performAction(action);
      }
      await waitForDelay(240, signal);
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        finalStatus = "cancelled";
      } else {
        finalStatus = "failed";
        errorMessage = error instanceof Error ? error.message : String(error);
      }
    }

    const recoveryStartedOffsetMs =
      operationResults.at(-1)?.completedOffsetMs ?? roundMetric(now() - startedAtMs);
    beforeRestoreCamera = { ...options.getCamera() };
    const restoreStartedAtMs = now();
    try {
      if (!unmounted) {
        options.updateRadius(initialRadius);
        await nextTick();
      }
      if (!unmounted) {
        options.restore(initialCamera, initialZoomRange, initialZoomReference);
        await nextTick();
        options.flushCamera();
        restoredCamera = { ...options.getCamera() };
      }
    } catch (restoreError) {
      finalStatus = "failed";
      const message = restoreError instanceof Error ? restoreError.message : String(restoreError);
      errorMessage = errorMessage
        ? `${errorMessage}; restore failed: ${message}`
        : `Restore failed: ${message}`;
    }
    restorationDurationMs = roundMetric(now() - restoreStartedAtMs);
    if (!unmounted) {
      restorationFrameObserved = await nextFrameOrDelay();
      // Let the rendering task finish so its performance entries can be
      // drained before disconnecting observers. No abortable gesture remains.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }

    stopFrameSampling();
    if (observer) recordLongTaskEntries(observer.takeRecords());
    observer?.disconnect();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    if (controller === runController) controller = undefined;
    const diagnosticReport = diagnostics.stop(
      operationResults,
      recoveryStartedOffsetMs,
      actions.length,
    );
    if (unmounted || runId !== runToken) {
      running.value = false;
      return;
    }

    const completedAt = new Date().toISOString();
    const completedAtMs = now();
    const finalContext = options.getMapContext();
    const finalElement = options.getElement();

    attributeNearbyChaosIntervals(
      frameSamples,
      longTasks,
      operationResults,
      actions.length,
      recoveryStartedOffsetMs,
    );
    for (const operation of operationResults) {
      const operationFrames = frameSamples.filter((sample) =>
        sample.overlappingActionIndices.includes(operation.index),
      );
      operation.frameSummary = summarizeNearbyChaosFrames(
        operationFrames,
        operation.actualDurationMs,
      );
    }

    const frameSummary = summarizeNearbyChaosFrames(frameSamples, completedAtMs - startedAtMs);
    const worstFrames = frameSamples
      .filter((sample) => sample.durationMs > NEARBY_CHAOS_ZOOM_PROFILE.lagFrameThresholdMs)
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, 30);
    const memoryAfterBytes = readUsedJsHeapBytes();
    const reportValue: NearbyChaosZoomReport = {
      schemaVersion: 3,
      diagnostics: diagnosticReport,
      reportType: "nearby-stations-chaos-zoom",
      profile: { id: NEARBY_CHAOS_ZOOM_PROFILE.id, version: NEARBY_CHAOS_ZOOM_PROFILE.version },
      status: finalStatus,
      startedAt,
      completedAt,
      durationMs: roundMetric(completedAtMs - startedAtMs),
      error: errorMessage,
      environment: {
        developmentBuild: import.meta.dev === true,
        vueVersion,
        documentFocusedAtStart,
        documentFocusedAtEnd: document.hasFocus(),
        userAgent: typeof navigator === "undefined" ? null : navigator.userAgent,
        hardwareConcurrency:
          typeof navigator === "undefined" || !Number.isFinite(navigator.hardwareConcurrency)
            ? null
            : navigator.hardwareConcurrency,
        deviceMemoryGiB: readDeviceMemoryGiB(),
        viewportWidthCssPx: finalElement?.clientWidth ?? element.clientWidth,
        viewportHeightCssPx: finalElement?.clientHeight ?? element.clientHeight,
        pixelRatio: typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
        visibilityStart,
        visibilityEnd: typeof document === "undefined" ? "unavailable" : document.visibilityState,
        visibilityChanges,
        longTaskObserver,
        jsHeapMemory: {
          beforeBytes: initialMemoryBytes,
          afterBytes: memoryAfterBytes,
          deltaBytes:
            initialMemoryBytes === null || memoryAfterBytes === null
              ? null
              : memoryAfterBytes - initialMemoryBytes,
        },
      },
      map: {
        contextAtStart: initialContext,
        contextAtEnd: finalContext,
        viewAtStart: initialContext.view,
        viewAtEnd: finalContext.view,
        basemapAtStart: initialContext.basemap,
        basemapAtEnd: finalContext.basemap,
        loadingAtStart: initialContext.loading,
        loadingAtEnd: finalContext.loading,
        stationInputCount: initialContext.stationInputCount,
        visibleStationCount: initialContext.visibleStationCount,
        placeInputCount: initialContext.placeInputCount,
        activeModes: initialContext.activeModes,
        stationInputCountAtEnd: finalContext.stationInputCount,
        visibleStationCountAtEnd: finalContext.visibleStationCount,
        placeInputCountAtEnd: finalContext.placeInputCount,
        activeModesAtEnd: finalContext.activeModes,
        initialDomCounts,
        finalDomCounts: finalElement ? readDomCounts(finalElement) : emptyDomCounts(),
      },
      camera: {
        initial: readCameraSnapshot(initialCamera),
        beforeRestore: readCameraSnapshot(beforeRestoreCamera),
        restored: readCameraSnapshot(restoredCamera),
        zoomRange: { minimum: initialZoomRange.min, maximum: initialZoomRange.max },
        restorationDurationMs,
        restorationFrameObserved,
      },
      radius: {
        initialMeters: initialRadius,
        minimumMeters: NEARBY_RADIUS_MIN_METERS,
        maximumMeters: NEARBY_RADIUS_MAX_METERS,
        requestedChangesMeters: requestedRadiusChanges,
        observedTimeline: diagnosticReport.contextTimeline
          .filter(
            (context, index, timeline) =>
              index === 0 || context.radiusMeters !== timeline[index - 1]!.radiusMeters,
          )
          .map((context) => ({ offsetMs: context.offsetMs, meters: context.radiusMeters })),
        restoredMeters: options.getRadius(),
      },
      workload: {
        operationCount: actions.length,
        completedOperationCount: operationResults.filter(
          (operation) => operation.status === "completed",
        ).length,
        recoveryActionIndex: actions.length,
        frameSampler: "requestAnimationFrame-interval",
        frameIntervals: frameSummary,
        frameSampleLimit: NEARBY_CHAOS_ZOOM_PROFILE.maximumFrameSamples,
        frameSampleLimitReached,
        droppedFrameSamples,
        droppedLongTasks,
        longTaskLimit: 100,
        measurementWarnings: [
          ...(visibilityChanges > 0 ||
          visibilityStart !== "visible" ||
          document.visibilityState !== "visible"
            ? [
                "Page visibility changed or was hidden; presentation cadence is not comparable to a continuously visible run.",
              ]
            : []),
          ...(frameSamples.filter((sample) => sample.durationMs >= 900).length >= 3
            ? [
                "Repeated RAF gaps of at least 900ms: inspect script blocking and possible browser occlusion/throttling before interpreting FPS; visible does not guarantee normal presentation.",
              ]
            : []),
          ...(frameSampleLimitReached ||
          droppedLongTasks > 0 ||
          diagnosticReport.limits.droppedLongAnimationFrames > 0
            ? [
                "Some metrics were dropped at collection limits; inspect coverage before comparing runs.",
              ]
            : []),
          ...(import.meta.dev
            ? [
                "Development build: timings include framework development overhead and are not production measurements.",
              ]
            : []),
        ],
        timing: {
          plannedGestureDurationMs: actions.reduce((sum, action) => sum + action.durationMs, 0),
          actualGestureDurationMs: roundMetric(
            operationResults.reduce((sum, op) => sum + op.actualDurationMs, 0),
          ),
          gestureOverrunMs: roundMetric(
            operationResults.reduce(
              (sum, op) => sum + Math.max(0, op.actualDurationMs - op.durationMs),
              0,
            ),
          ),
          recoveryStartedOffsetMs,
          restorationStartedOffsetMs: roundMetric(restoreStartedAtMs - startedAtMs),
          samplingEndedOffsetMs: roundMetric(completedAtMs - startedAtMs),
          sampledIntervalDurationMs: roundMetric(
            frameSamples.reduce((sum, sample) => sum + sample.durationMs, 0),
          ),
        },
        plannedOperations: actions,
        frameSamples,
        worstFrames,
        longTasks,
        operations: operationResults,
        caveats: [
          "Frame intervals measure browser presentation cadence, not isolated map-renderer CPU time.",
          "Frame actionIndex uses the interval midpoint; overlappingActionIndices lists every intersected operation window.",
          "Frame zoom/radius describe callback execution time (contextObservedOffsetMs), not the RAF timestamp; callbackDelayMs exposes this difference.",
          "Interrupted operations are retained with their actual interval; completedOperationCount excludes them.",
          "Operation frame intervals can overlap adjacent operations; their counts and FPS must not be added together.",
          "Recovery includes restoration but does not wait for all asynchronous network requests to settle.",
          "DOM stationMarkers includes exiting transitions; leavingStationMarkers separates those from retained markers.",
          "Long tasks are tab-wide main-thread tasks; overlappingActionIndices are time overlaps, not causal attribution.",
          "Radius changes use the parent map state and may start or cancel nearby-station scans.",
          "Camera snapshots omit world-center coordinates; station inputs are counts and active modes only.",
        ],
      },
    };

    report.value = reportValue;
    downloadReport();
    progress.value = reportValue.workload.completedOperationCount;
    total.value = actions.length;
    running.value = false;
  }

  async function runPanGesture(
    element: HTMLElement,
    action: NearbyChaosZoomAction,
    signal: AbortSignal,
  ): Promise<void> {
    const rect = element.getBoundingClientRect();
    const from = pointFromRatio(rect, action.panFromRatioX ?? 0.45, action.panFromRatioY ?? 0.45);
    const to = pointFromRatio(rect, action.panToRatioX ?? 0.55, action.panToRatioY ?? 0.55);
    const pointerId = 90_000 + action.index;
    element.dispatchEvent(createPointerEvent("pointerdown", pointerId, from, 1));
    try {
      for (let step = 1; step <= action.eventCount; step += 1) {
        assertSignal(signal);
        const ratio = step / action.eventCount;
        const point = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
        element.dispatchEvent(createPointerEvent("pointermove", pointerId, point, 1));
        await waitForDelay(action.durationMs / action.eventCount, signal);
      }
    } finally {
      element.dispatchEvent(createPointerEvent("pointerup", pointerId, to, 0));
    }
  }

  async function runZoomGesture(
    element: HTMLElement,
    center: { x: number; y: number },
    action: NearbyChaosZoomAction,
    signal: AbortSignal,
  ): Promise<void> {
    const deltaY = -((action.zoomDelta ?? 0) * 600) / Math.max(1, action.eventCount);
    for (let index = 0; index < action.eventCount; index += 1) {
      assertSignal(signal);
      element.dispatchEvent(createWheelEvent(deltaY, center));
      await waitForDelay(action.durationMs / action.eventCount, signal);
    }
  }

  async function runCombinedGesture(
    element: HTMLElement,
    center: { x: number; y: number },
    action: NearbyChaosZoomAction,
    signal: AbortSignal,
  ): Promise<void> {
    const rect = element.getBoundingClientRect();
    const from = pointFromRatio(rect, action.panFromRatioX ?? 0.2, action.panFromRatioY ?? 0.2);
    const to = pointFromRatio(rect, action.panToRatioX ?? 0.8, action.panToRatioY ?? 0.8);
    const pointerId = 95_000 + action.index;
    const deltaY = -((action.zoomDelta ?? 0) * 600) / Math.max(1, action.eventCount);
    element.dispatchEvent(createPointerEvent("pointerdown", pointerId, from, 1));
    try {
      for (let step = 1; step <= action.eventCount; step += 1) {
        assertSignal(signal);
        if (step === 1 && action.radiusMeters !== undefined)
          options.updateRadius(action.radiusMeters);
        const ratio = step / action.eventCount;
        const point = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
        element.dispatchEvent(createPointerEvent("pointermove", pointerId, point, 1));
        element.dispatchEvent(createWheelEvent(deltaY, center));
        await waitForDelay(action.durationMs / action.eventCount, signal);
      }
    } finally {
      element.dispatchEvent(createPointerEvent("pointerup", pointerId, to, 0));
    }
  }

  return { running, progress, total, report, run, cancel, downloadReport };
}

function createPointerEvent(
  type: string,
  pointerId: number,
  point: { x: number; y: number },
  buttons: number,
): PointerEvent {
  const init = {
    bubbles: true,
    cancelable: true,
    clientX: point.x,
    clientY: point.y,
    button: 0,
    buttons,
    pointerId,
    pointerType: "mouse",
    isPrimary: true,
  };
  if (typeof PointerEvent !== "undefined") return new PointerEvent(type, init);
  const fallback = new MouseEvent(type, init) as PointerEvent;
  Object.defineProperties(fallback, {
    pointerId: { value: pointerId },
    pointerType: { value: "mouse" },
    isPrimary: { value: true },
  });
  return fallback;
}

function createWheelEvent(deltaY: number, point: { x: number; y: number }): WheelEvent {
  const init = {
    bubbles: true,
    cancelable: true,
    clientX: point.x,
    clientY: point.y,
    deltaMode: typeof WheelEvent === "undefined" ? 0 : WheelEvent.DOM_DELTA_PIXEL,
    deltaY,
  };
  if (typeof WheelEvent !== "undefined") return new WheelEvent("wheel", init);
  const fallback = new Event("wheel", { bubbles: true, cancelable: true }) as WheelEvent;
  Object.defineProperties(fallback, {
    clientX: { value: point.x },
    clientY: { value: point.y },
    deltaMode: { value: 0 },
    deltaY: { value: deltaY },
  });
  return fallback;
}

function pointFromRatio(rect: DOMRect, xRatio: number, yRatio: number): { x: number; y: number } {
  return { x: rect.left + rect.width * xRatio, y: rect.top + rect.height * yRatio };
}

function readDomCounts(element: HTMLElement): NearbyChaosDomCounts {
  return {
    stationMarkers: element.querySelectorAll(".nearby-map__marker").length,
    leavingStationMarkers: element.querySelectorAll(
      ".nearby-map-item-leave-active .nearby-map__marker",
    ).length,
    projectedStations: element.querySelectorAll('.nearby-map__marker-anchor[class*="projection-"]')
      .length,
    placeElements: element.querySelectorAll(".nearby-map__place").length,
    canvasElements: element.querySelectorAll("canvas").length,
    svgElements: element.querySelectorAll("svg").length,
  };
}

function readCameraSnapshot(camera: CameraState): NearbyChaosCameraSnapshot {
  return {
    zoom: roundMetric(camera.zoom),
    viewportWidthCssPx: roundMetric(camera.viewportWidthCssPx),
    viewportHeightCssPx: roundMetric(camera.viewportHeightCssPx),
    pixelRatio: roundMetric(camera.pixelRatio),
    generation: camera.generation,
  };
}

function emptyDomCounts(): NearbyChaosDomCounts {
  return {
    stationMarkers: 0,
    leavingStationMarkers: 0,
    projectedStations: 0,
    placeElements: 0,
    canvasElements: 0,
    svgElements: 0,
  };
}

function readUsedJsHeapBytes(): number | null {
  if (typeof performance === "undefined") return null;
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  return typeof memory?.usedJSHeapSize === "number" && Number.isFinite(memory.usedJSHeapSize)
    ? memory.usedJSHeapSize
    : null;
}

function readDeviceMemoryGiB(): number | null {
  if (typeof navigator === "undefined") return null;
  const value = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function assertSignal(signal: AbortSignal): void {
  if (signal.aborted) throw createAbortError();
}

function waitForDelay(durationMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }
    const timeout = window.setTimeout(
      () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      },
      Math.max(0, durationMs),
    );
    const onAbort = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function nextFrameOrDelay(): Promise<boolean> {
  return new Promise((resolve) => {
    let frameId: number | undefined;
    const timer = window.setTimeout(() => {
      if (frameId !== undefined) cancelAnimationFrame(frameId);
      resolve(false);
    }, 250);
    if (typeof requestAnimationFrame === "function") {
      frameId = requestAnimationFrame(() => {
        window.clearTimeout(timer);
        resolve(true);
      });
    }
  });
}

function createAbortError(): Error {
  const error = new Error("Chaos zoom cancelled");
  error.name = "AbortError";
  return error;
}

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function roundMetric(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}
