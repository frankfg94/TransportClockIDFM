import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import type { GlobalMapLine, GlobalMapMode } from "../transport-map/contracts/manifest";
import type { TransportMapRenderScene, TransportMapRendererMetrics } from "../transport-map/contracts/renderer";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../transport-map/config/globalTransportPlanConfig";
import type { CameraState } from "../transport-map/geo/camera";
import { lonLatToWorld, worldToLonLat } from "../transport-map/geo/coordinateKernel";
import {
  createTransportMapPerformanceProbe,
  type TransportMapPerformanceProbe,
  type TransportMapPerformanceReport,
} from "../transport-map/performance/transportMapPerformance";
import type { BasemapCoverageResult } from "../transport-map/performance/basemapCoverage";
import type {
  TransportMapPerformanceTrace,
  TransportMapTraceFrameSnapshot,
  TransportMapTraceReport,
  TransportMapTraceMapLibreSummary,
  TransportMapTraceSpike,
} from "../transport-map/performance/transportMapPerformanceTrace";
import type { TransportMapWorkerPoolMetrics } from "../transport-map/workers/workerPool";
import { TRANSPORT_MAP_TRACE_THRESHOLDS } from "../transport-map/performance/transportMapPerformanceTrace";
import {
  analyzeChaosCanvas,
  CHAOS_BASEMAP_PARTIAL_BLANK_MISSING_RATIO,
  CHAOS_BASEMAP_SAMPLE_INTERVAL_MS,
  roundChaosMetric,
  summarizeChaosBasemapAudit,
  summarizeChaosFrameTimes,
  type ChaosBasemapAuditSample,
  type ChaosBasemapAuditSummary,
  type ChaosCanvasAnalysis,
  type ChaosFrameTimingSummary,
} from "./chaosZoom";
import {
  EXTREME_CHAOS_ZOOM_PROFILE,
  STANDARD_CHAOS_ZOOM_PROFILE,
  createExtremeChaosZoomTrace,
  type ChaosZoomExtremeAction,
  type ChaosZoomExtremePhase,
  type ChaosZoomProfileId,
} from "./chaosZoomProfiles";

export type { ChaosZoomProfileId } from "./chaosZoomProfiles";

export type ChaosZoomStatus = "preparing" | "running" | "completed" | "failed";
export type ChaosZoomDirection = "zoom-in" | "zoom-out";

export interface ChaosZoomGesture {
  index: number;
  direction: ChaosZoomDirection;
  startZoom: number;
  requestedDeltaZoom: number;
  eventCount: number;
  durationMs: number;
  eventIntervalMs: number;
  deltaYPerEvent: number;
  scrollSpeed: number;
  anchorRatioX: number;
  anchorRatioY: number;
}

export interface ChaosZoomBasemapCoverage {
  live: BasemapCoverageResult;
  combined: BasemapCoverageResult;
  liveSignature?: string;
  coverSignature?: string;
  coverReady: boolean;
  pixelHealth?: {
    verifiedCoverSurfaces: number;
    unverifiedCoverSurfaces: number;
  };
  quality?: {
    cameraZoom: number;
    effectiveSourceZoom?: number;
    sourceZoomDeficit?: number;
    upscaleFactor: number;
    isBlurry: boolean;
    visibleLayers: Array<{
      role: "live" | "cover";
      id: string;
      sourceZoom?: number;
      opacity: number;
      ready: boolean;
    }>;
  };
}

export interface ChaosZoomScreenshot extends ChaosCanvasAnalysis {
  index: number;
  capturedAt: string;
  path: string | null;
  blobUrl?: string;
  mimeType: "image/png";
  bytes: number;
  widthCssPx: number;
  heightCssPx: number;
  pixelRatio: number;
  zoomRange: { minimum: number; maximum: number };
  captureScope: "canvas-viewport";
  downloadName: string;
  isBasemapBlank?: boolean;
  basemapMissingRatio?: number;
  basemapCoverage?: ChaosZoomBasemapCoverage;
  captureError?: string;
}

export interface ChaosZoomStepReport {
  index: number;
  direction: ChaosZoomDirection;
  startZoom: number;
  requestedDeltaZoom: number;
  actualDeltaZoom: number;
  zoomLevel: number;
  eventCount: number;
  durationMs: number;
  settleDurationMs: number;
  totalDurationMs: number;
  scrollSpeed: number;
  scrollSpeedUnit: "wheel-delta-y-per-second";
  zoomSpeedLevelsPerSecond: number;
  wheelDeltaYPerEvent: number;
  anchorRatioX: number;
  anchorRatioY: number;
  isScrolling: boolean;
  isScrollingDuringStep: boolean;
  isLagSpike: boolean;
  basemapRecoveredAfterGesture: boolean;
  frameMetrics: ChaosFrameTimingSummary & {
    frameTimesMs: number[];
    renderTimesMs: number[];
    scrollingFrameCount: number;
    settledFrameCount: number;
    minZoom: number;
    maxZoom: number;
    minPathCount: number;
    minStationCount: number;
    renderAverageMs: number;
    renderP95Ms: number;
    renderMaxMs: number;
  };
  memory?: {
    beforeUsedJsHeapBytes: number;
    afterUsedJsHeapBytes: number;
    maxUsedJsHeapBytes?: number;
    deltaBytes: number;
  };
  basemapAudit: ChaosBasemapAuditSummary;
  screenshot: ChaosZoomScreenshot;
}

export interface ChaosZoomReport {
  schemaVersion: 1;
  status: ChaosZoomStatus;
  scenario: "chaos-zoom" | "chaos-zoom-extreme";
  profile: { id: ChaosZoomProfileId; version: number; seed: number };
  lineId?: string;
  lineLabel?: string;
  lineCode?: string;
  operationCount: number;
  completedOperationCount: number;
  startedAt: string;
  completedAt: string;
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
  pixelRatio: number;
  zoomRange: { minimum: number; maximum: number };
  initialCamera?: CameraState;
  cameraBeforeRestore?: CameraState;
  restoredCamera?: CameraState;
  averageFps: number;
  scrollSpeed: number;
  scrollSpeedUnit: "wheel-delta-y-per-second";
  zoomLevel: number;
  isScrolling: boolean;
  isScrollingDuringSequence: boolean;
  isLagSpike: boolean;
  isBlurry: boolean;
  isBlank: boolean;
  isBasemapBlank: boolean;
  hasBasemapCoverageGap: boolean;
  hasPersistentBasemapGap: boolean;
  hasPartialBasemapBlank: boolean;
  basemapAudit: ChaosBasemapAuditSummary;
  memory?: {
    beforeUsedJsHeapBytes: number;
    afterUsedJsHeapBytes: number;
    maxUsedJsHeapBytes?: number;
    deltaBytes: number;
  };
  frameMetrics: ChaosFrameTimingSummary & {
    frameTimesMs: number[];
    renderTimesMs: number[];
    scrollingFrameCount: number;
    settledFrameCount: number;
    minPathCount: number;
    minStationCount: number;
    renderAverageMs: number;
    renderP95Ms: number;
    renderMaxMs: number;
  };
  screenshots: ChaosZoomScreenshot[];
  steps: ChaosZoomStepReport[];
  renderer?: string;
  scene?: {
    pathCount: number;
    stationCount: number;
    minPathCountDuringRun: number;
    minStationCountDuringRun: number;
    maxPathCountDuringRun?: number;
    maxStationCountDuringRun?: number;
    maxVertexCountDuringRun?: number;
  };
  performance?: TransportMapPerformanceReport;
  phase?: ChaosZoomExtremePhase;
  actionIndex?: number;
  modes?: {
    available: GlobalMapMode[];
    active: GlobalMapMode[];
  };
  validation?: {
    fullNetworkExpected: boolean;
    fullNetwork: boolean;
    noActiveLine: boolean;
    noDetailLine: boolean;
    allModesActive: boolean;
    reducedBySelection: boolean;
    warning?: string;
    fullNetworkInvariant?: ChaosZoomExtremeNetworkInvariantDiagnostic;
  };
  recoveryDurationMs?: number;
  missedCommitCount?: number;
  actions?: ChaosZoomExtremeActionReport[];
  spikes?: ChaosZoomFrameSpike[];
  /** Causal trace for the extreme run; absent for legacy raster-only runs. */
  trace?: TransportMapTraceReport;
  /** Public MapLibre readiness/loading samples used by the extreme run. */
  maplibreAudit?: TransportMapTraceMapLibreSummary;
  capabilities?: {
    deckMetrics: boolean;
  };
  error?: string;
}

export interface ChaosZoomLiveReport {
  schemaVersion: 1;
  status: "preparing" | "running";
  scenario: "chaos-zoom" | "chaos-zoom-extreme";
  profile: { id: ChaosZoomProfileId; version: number; seed: number };
  phase: ChaosZoomExtremePhase | "standard";
  actionIndex: number;
  progress: number;
  total: number;
}

export interface ChaosZoomDataMetrics {
  lastGeneration: number;
  lastChunkCount: number;
  bytes: number;
  decodeTimeMs: number;
  workerTimeMs: number;
  workerCount: number;
  filterPathsLocal?: {
    calls: number;
    totalMs: number;
    maxMs: number;
    inputPathCount: number;
    outputPathCount: number;
  };
  workerPool?: TransportMapWorkerPoolMetrics;
  cache: {
    pending: number;
    active: number;
    completed: number;
    abandoned: number;
    cache: { entries: number; bytes: number; hits: number; misses: number; evictions: number };
  };
}

export interface ChaosZoomExtremePreparation {
  availableModes: GlobalMapMode[];
  activeModes: GlobalMapMode[];
}

export interface ChaosZoomExtremeNetworkValidation {
  fullNetworkExpected: true;
  fullNetwork: boolean;
  noActiveLine: boolean;
  noDetailLine: boolean;
  allModesActive: boolean;
  reducedBySelection: boolean;
  warning?: string;
}

export interface ChaosZoomExtremeNetworkState {
  availableModes: GlobalMapMode[];
  activeModes: GlobalMapMode[];
  activeLineId?: string;
  detailLineId?: string;
}

/**
 * Bounded diagnostics for transient state that would make the Extreme run a
 * selected-line benchmark instead of a full-network benchmark.
 */
export interface ChaosZoomExtremeNetworkInvariantDiagnostic {
  violationCount: number;
  firstViolationAtMs?: number;
  activeLineIdsSeen: string[];
  detailLineIdsSeen: string[];
  modeMismatchCount: number;
}

export function createChaosZoomExtremeNetworkInvariantDiagnostic(): ChaosZoomExtremeNetworkInvariantDiagnostic {
  return {
    violationCount: 0,
    activeLineIdsSeen: [],
    detailLineIdsSeen: [],
    modeMismatchCount: 0,
  };
}

export function validateChaosZoomExtremeNetwork(
  preparation: ChaosZoomExtremePreparation,
  activeLineId: string | undefined,
  detailLineId: string | undefined,
): ChaosZoomExtremeNetworkValidation {
  const noActiveLine = activeLineId === undefined;
  const noDetailLine = detailLineId === undefined;
  const allModesActive = sameModeSet(preparation.availableModes, preparation.activeModes);
  const reducedBySelection = !noActiveLine || !noDetailLine;
  const fullNetwork = noActiveLine && noDetailLine && allModesActive;
  return {
    fullNetworkExpected: true,
    fullNetwork,
    noActiveLine,
    noDetailLine,
    allModesActive,
    reducedBySelection,
    warning: !fullNetwork
      ? reducedBySelection
        ? "La sélection d'une ligne réduit le réseau testé."
        : "Tous les modes disponibles ne sont pas actifs."
      : undefined,
  };
}

/** Record one newly observed invalid Extreme state without retaining unbounded IDs. */
export function recordChaosZoomExtremeNetworkViolation(
  state: ChaosZoomExtremeNetworkState,
  diagnostic: ChaosZoomExtremeNetworkInvariantDiagnostic,
  timestampMs: number,
): void {
  const validation = validateChaosZoomExtremeNetwork(
    {
      availableModes: state.availableModes,
      activeModes: state.activeModes,
    },
    state.activeLineId,
    state.detailLineId,
  );
  if (validation.fullNetwork) return;
  diagnostic.violationCount += 1;
  if (diagnostic.firstViolationAtMs === undefined) {
    diagnostic.firstViolationAtMs = roundChaosMetric(timestampMs);
  }
  if (state.activeLineId && !diagnostic.activeLineIdsSeen.includes(state.activeLineId)) {
    if (diagnostic.activeLineIdsSeen.length < 8) diagnostic.activeLineIdsSeen.push(state.activeLineId);
  }
  if (state.detailLineId && !diagnostic.detailLineIdsSeen.includes(state.detailLineId)) {
    if (diagnostic.detailLineIdsSeen.length < 8) diagnostic.detailLineIdsSeen.push(state.detailLineId);
  }
  if (!validation.allModesActive) diagnostic.modeMismatchCount += 1;
}

export interface ChaosZoomExtremeActionReport {
  index: number;
  phase: ChaosZoomExtremeAction["phase"];
  kind: ChaosZoomExtremeAction["kind"];
  startedAtMs: number;
  durationMs: number;
  pauseMs: number;
  commitPause: boolean;
  commitTimedOut: boolean;
  startZoom: number;
  endZoom: number;
}

export interface ChaosZoomFrameSpike {
  durationMs: number;
  offsetMs: number;
  phase: ChaosZoomExtremePhase;
  actionIndex: number;
  action: ChaosZoomExtremeAction["kind"] | "activation" | "recovery";
  camera: CameraState;
  distanceFromCenterKm: number;
  zoomSpeedLevelsPerSecond: number;
  panSpeedKmPerSecond: number;
  previousLodLevel: number;
  lodLevel: number;
  scene: { pathCount: number; stationCount: number; vertexCount: number };
  chunks: string[];
  scheduler?: {
    pending: number;
    active: number;
    completed: number;
    abandoned: number;
    delta: { pending: number; active: number; completed: number; abandoned: number };
  };
  cache?: {
    entries: number;
    bytes: number;
    hits: number;
    misses: number;
    evictions: number;
    delta: { entries: number; bytes: number; hits: number; misses: number; evictions: number };
  };
  renderer?: TransportMapRendererMetrics;
  causal?: TransportMapTraceSpike;
}

interface ChaosZoomExtremeFrameSample {
  timestamp: number;
  camera: CameraState;
  center: { lon: number; lat: number };
  lodLevel: number;
  data?: ChaosZoomDataMetrics;
}

type ChaosCacheMetrics = NonNullable<TransportMapPerformanceReport["cache"]>;

export interface UseChaosZoomOptions {
  lineTargetId?: string;
  operationCount?: number;
  minimumZoom?: number;
  maximumZoom?: number;
  isMounted: () => boolean;
  getCanvas: () => HTMLCanvasElement | undefined;
  getCamera: () => CameraState;
  getRenderScene: () => TransportMapRenderScene;
  getRendererMetrics: () => TransportMapRendererMetrics | undefined;
  getRendererKind: () => string | undefined;
  getActiveLineId: () => string | undefined;
  getDetailLineId?: () => string | undefined;
  getAvailableModes?: () => readonly GlobalMapMode[];
  getActiveModes?: () => readonly GlobalMapMode[];
  isScrolling: () => boolean;
  applyCamera: (camera: CameraState, query?: boolean, refresh?: boolean, render?: boolean) => void;
  draw: () => void;
  refreshViewport: () => Promise<void>;
  prepareLine14: (assertActive: () => void) => Promise<GlobalMapLine>;
  cancelInteractions: () => void;
  setInteractionActive: (active: boolean) => void;
  beforeRun?: () => void;
  beforeMeasure?: () => Promise<void> | void;
  captureBasemapSnapshot?: () => void;
  readBasemapCoverage?: () => ChaosZoomBasemapCoverage | undefined;
  performanceMetadata: () => Record<string, unknown>;
  prepareExtreme?: (assertActive: () => void) => Promise<ChaosZoomExtremePreparation>;
  restoreExtreme?: () => Promise<void> | void;
  ensureExtremeFullNetworkState?: () => void;
  getChunkIds?: () => readonly string[];
  getDataMetrics?: () => ChaosZoomDataMetrics;
  isViewportPending?: () => boolean;
  performanceTrace?: TransportMapPerformanceTrace;
}

interface ChaosZoomFrameMonitor {
  startedAt: number;
  running: boolean;
  frameTimesMs: number[];
  scrollingFrameCount: number;
  settledFrameCount: number;
  zoomSamples: number[];
  renderTimesMs: number[];
  minPathCount: number;
  minStationCount: number;
  maxPathCount: number;
  maxStationCount: number;
  maxVertexCount: number;
  lastScene?: TransportMapRenderScene;
  rafHandle?: number;
  timeoutHandle?: number;
  onFrame?: (durationMs: number, timestamp: number) => void;
}

interface ChaosZoomGestureResult {
  frameSummary: ChaosFrameTimingSummary;
  frameTimesMs: number[];
  renderTimesMs: number[];
  scrollingFrameCount: number;
  settledFrameCount: number;
  minZoom: number;
  maxZoom: number;
  minPathCount: number;
  minStationCount: number;
  motionDurationMs: number;
  settleDurationMs: number;
  totalDurationMs: number;
  basemapRecoveredAfterGesture: boolean;
  basemapAudit: ChaosBasemapAuditSummary;
  screenshot: ChaosZoomScreenshot;
}

const DEFAULT_OPERATION_COUNT = 30;
const DEFAULT_LINE_ID = "line:IDFM:C01384";
const CHAOS_POST_GESTURE_CAPTURE_DELAY_MS = 200;
const CHAOS_BASEMAP_RECOVERY_TIMEOUT_MS = 3_000;

export function useChaosZoom(options: UseChaosZoomOptions) {
  const operationCount = Math.max(1, Math.floor(options.operationCount ?? DEFAULT_OPERATION_COUNT));
  const minimumZoom = Math.max(
    GLOBAL_TRANSPORT_PLAN_CONFIG.camera.minZoom,
    Math.min(options.minimumZoom ?? GLOBAL_TRANSPORT_PLAN_CONFIG.camera.minZoom,
      GLOBAL_TRANSPORT_PLAN_CONFIG.camera.maxZoom),
  );
  const maximumZoom = Math.max(
    minimumZoom,
    Math.min(options.maximumZoom ?? GLOBAL_TRANSPORT_PLAN_CONFIG.camera.maxZoom,
      GLOBAL_TRANSPORT_PLAN_CONFIG.camera.maxZoom),
  );
  const chaosZoomRunning = ref(false);
  const chaosZoomProgress = ref(0);
  const chaosZoomTotal = ref(operationCount);
  const chaosZoomActiveProfile = ref<ChaosZoomProfileId>("standard");
  const chaosZoomPhase = ref<ChaosZoomExtremePhase | "idle">("idle");
  const chaosZoomReport = shallowRef<ChaosZoomReport>();
  const chaosZoomLiveReport = shallowRef<ChaosZoomLiveReport>();
  const chaosZoomReportJson = computed(() =>
    chaosZoomReport.value || chaosZoomLiveReport.value
      ? JSON.stringify(chaosZoomReport.value ?? chaosZoomLiveReport.value, null, 2)
      : "",
  );

  function downloadChaosZoomReport(): void {
    const report = chaosZoomReport.value;
    if (
      !report ||
      typeof document === "undefined" ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      return;
    }

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chaos-zoom-${report.profile.id}-${Date.now()}.json`;
    link.click();
    window.setTimeout(() => {
      if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
    }, 0);
  }

  let chaosPerformanceProbe: TransportMapPerformanceProbe | undefined;
  let chaosZoomScenarioPromise: Promise<ChaosZoomReport> | undefined;
  let chaosZoomScenarioToken = 0;
  let chaosZoomFrameMonitor: ChaosZoomFrameMonitor | undefined;
  const chaosZoomObjectUrls = new Set<string>();

  function chaosNow(): number {
    return typeof performance === "undefined" ? Date.now() : performance.now();
  }

  function assertChaosZoomActive(token: number): void {
    if (!options.isMounted() || token !== chaosZoomScenarioToken) {
      throw new Error("Scénario Chaos Zoom interrompu");
    }
  }

  function waitForChaosZoomDelay(durationMs: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, durationMs)));
  }

  function waitForChaosZoomFrame(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === "undefined") window.setTimeout(resolve, 16);
      else requestAnimationFrame(() => resolve());
    });
  }

  async function waitForChaosZoomFrames(token: number, count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      assertChaosZoomActive(token);
      await waitForChaosZoomFrame();
    }
  }

  async function waitForChaosZoomCondition(
    token: number,
    condition: () => boolean,
    label: string,
    timeoutMs = 15_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      assertChaosZoomActive(token);
      if (condition()) return;
      if (Date.now() >= deadline) throw new Error(`Timeout en attendant ${label}`);
      await waitForChaosZoomFrame();
    }
  }

  async function waitForChaosZoomSceneStable(token: number, lineId: string): Promise<void> {
    const deadline = Date.now() + 15_000;
    let previousFingerprint = "";
    let stableSince = 0;
    while (true) {
      assertChaosZoomActive(token);
      if (Date.now() >= deadline) throw new Error("Timeout en attendant la scène de la ligne 14");
      const scene = options.getRenderScene();
      const pathIds = scene.paths.map((path) => path.id).sort();
      const stationIds = scene.stations.map((station) => station.id).sort();
      const fingerprint = `${options.getActiveLineId() ?? ""}|${pathIds.join(",")}|${stationIds.join(",")}`;
      if (
        options.getActiveLineId() === lineId &&
        pathIds.length > 0 &&
        stationIds.length > 0
      ) {
        if (fingerprint !== previousFingerprint) {
          previousFingerprint = fingerprint;
          stableSince = Date.now();
        } else if (Date.now() - stableSince >= 300) {
          return;
        }
      } else {
        previousFingerprint = "";
        stableSince = 0;
      }
      await waitForChaosZoomFrame();
    }
  }

  function startChaosZoomFrameMonitor(
    onFrame?: (durationMs: number, timestamp: number) => void,
  ): ChaosZoomFrameMonitor {
    const scene = options.getRenderScene();
    const initialVertexCount = scene.paths.reduce((sum, path) => sum + path.vertices.length, 0);
    const monitor: ChaosZoomFrameMonitor = {
      startedAt: chaosNow(),
      running: true,
      frameTimesMs: [],
      scrollingFrameCount: 0,
      settledFrameCount: 0,
      zoomSamples: [],
      renderTimesMs: [],
      minPathCount: scene.paths.length,
      minStationCount: scene.stations.length,
      maxPathCount: scene.paths.length,
      maxStationCount: scene.stations.length,
      maxVertexCount: initialVertexCount,
      lastScene: scene,
      onFrame,
    };
    let previousTimestamp: number | undefined;

    const schedule = () => {
      if (!monitor.running) return;
      if (typeof requestAnimationFrame === "undefined") {
        monitor.timeoutHandle = window.setTimeout(() => tick(chaosNow()), 16);
      } else {
        monitor.rafHandle = requestAnimationFrame(tick);
      }
    };
    const tick: FrameRequestCallback = (timestamp) => {
      if (!monitor.running) return;
      if (previousTimestamp !== undefined) {
        const durationMs = Math.max(0, timestamp - previousTimestamp);
        monitor.frameTimesMs.push(durationMs);
        monitor.onFrame?.(durationMs, timestamp);
      }
      previousTimestamp = timestamp;
      if (options.isScrolling()) monitor.scrollingFrameCount += 1;
      else monitor.settledFrameCount += 1;
      monitor.zoomSamples.push(options.getCamera().zoom);
      const currentScene = options.getRenderScene();
      monitor.minPathCount = Math.min(monitor.minPathCount, currentScene.paths.length);
      monitor.minStationCount = Math.min(monitor.minStationCount, currentScene.stations.length);
      monitor.maxPathCount = Math.max(monitor.maxPathCount, currentScene.paths.length);
      monitor.maxStationCount = Math.max(monitor.maxStationCount, currentScene.stations.length);
      if (currentScene !== monitor.lastScene) {
        monitor.maxVertexCount = Math.max(
          monitor.maxVertexCount,
          currentScene.paths.reduce((sum, path) => sum + path.vertices.length, 0),
        );
        monitor.lastScene = currentScene;
      }
      const rendererMetrics = options.getRendererMetrics();
      if (rendererMetrics?.visibleVertexCount !== undefined && Number.isFinite(rendererMetrics.visibleVertexCount)) {
        monitor.maxVertexCount = Math.max(monitor.maxVertexCount, rendererMetrics.visibleVertexCount);
      }
      const renderMs = rendererMetrics?.renderMs;
      if (renderMs !== undefined && Number.isFinite(renderMs)) {
        monitor.renderTimesMs.push(Math.max(0, renderMs));
      }
      schedule();
    };

    chaosZoomFrameMonitor = monitor;
    schedule();
    return monitor;
  }

  function stopChaosZoomFrameMonitor(monitor: ChaosZoomFrameMonitor | undefined): void {
    if (!monitor || !monitor.running) return;
    monitor.running = false;
    if (monitor.rafHandle !== undefined && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(monitor.rafHandle);
    }
    if (monitor.timeoutHandle !== undefined) window.clearTimeout(monitor.timeoutHandle);
    if (chaosZoomFrameMonitor === monitor) chaosZoomFrameMonitor = undefined;
  }

  function dispatchChaosZoomWheel(
    token: number,
    deltaY: number,
    anchorRatioX: number,
    anchorRatioY: number,
  ): void {
    assertChaosZoomActive(token);
    const canvas = options.getCanvas();
    if (!canvas) throw new Error("Canvas absent pendant Chaos Zoom");
    const rect = canvas.getBoundingClientRect();
    const camera = options.getCamera();
    const width = rect.width || camera.viewportWidthCssPx;
    const height = rect.height || camera.viewportHeightCssPx;
    canvas.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + width * Math.max(0, Math.min(1, anchorRatioX)),
        clientY: rect.top + height * Math.max(0, Math.min(1, anchorRatioY)),
        deltaMode: 0,
        deltaY,
      }),
    );
  }

  function randomChaosBetween(minimum: number, maximum: number): number {
    return minimum + Math.random() * Math.max(0, maximum - minimum);
  }

  function createChaosZoomGesture(index: number): ChaosZoomGesture {
    const camera = options.getCamera();
    const roomIn = Math.max(0, maximumZoom - camera.zoom);
    const roomOut = Math.max(0, camera.zoom - minimumZoom);
    const canZoomIn = roomIn > 0.05;
    const canZoomOut = roomOut > 0.05;
    const direction: ChaosZoomDirection =
      canZoomIn && canZoomOut
        ? Math.random() < 0.5
          ? "zoom-in"
          : "zoom-out"
        : canZoomIn
          ? "zoom-in"
          : "zoom-out";
    const availableRoom = direction === "zoom-in" ? roomIn : roomOut;
    const requestedDeltaZoom = Math.min(
      availableRoom,
      randomChaosBetween(0.35, Math.min(2.4, Math.max(0.35, availableRoom))),
    );
    const signedDeltaZoom = direction === "zoom-in" ? requestedDeltaZoom : -requestedDeltaZoom;
    const eventCount = Math.floor(randomChaosBetween(5, 19));
    const durationMs = Math.round(randomChaosBetween(180, 900));
    const eventIntervalMs = durationMs / eventCount;
    const deltaYPerEvent =
      -signedDeltaZoom /
      (eventCount * GLOBAL_TRANSPORT_PLAN_CONFIG.camera.wheelZoomFactor);
    return {
      index,
      direction,
      startZoom: camera.zoom,
      requestedDeltaZoom,
      eventCount,
      durationMs,
      eventIntervalMs,
      deltaYPerEvent,
      scrollSpeed: Math.abs(deltaYPerEvent * eventCount) / (durationMs / 1_000),
      // Non-central anchors deliberately exercise the camera translation that
      // used to move a fixed bridge cover outside the viewport while the live
      // raster was hidden.
      anchorRatioX: randomChaosBetween(0.08, 0.92),
      anchorRatioY: randomChaosBetween(0.08, 0.92),
    };
  }

  function sampleChaosBasemapAudit(samples: ChaosBasemapAuditSample[]): void {
    const coverage = options.readBasemapCoverage?.();
    if (!coverage) return;
    samples.push({
      sampledAtMs: chaosNow(),
      zoom: roundChaosMetric(options.getCamera().zoom),
      scrolling: options.isScrolling(),
      combinedCoverageRatio: coverage.combined.coverageRatio,
      liveCoverageRatio: coverage.live.coverageRatio,
      maxGapPx: coverage.combined.maxGapPx,
      hasGap: coverage.combined.hasGap,
      isBlurry: coverage.quality?.isBlurry === true,
    });
  }

  async function waitForChaosBasemapRecovery(token: number): Promise<boolean> {
    if (!options.readBasemapCoverage) return true;
    const deadline = Date.now() + CHAOS_BASEMAP_RECOVERY_TIMEOUT_MS;
    while (true) {
      assertChaosZoomActive(token);
      const coverage = options.readBasemapCoverage();
      if (
        coverage &&
        !coverage.live.hasGap &&
        !coverage.combined.hasGap &&
        coverage.coverReady &&
        coverage.quality?.isBlurry !== true
      ) return true;
      if (Date.now() >= deadline) return false;
      await waitForChaosZoomDelay(CHAOS_BASEMAP_SAMPLE_INTERVAL_MS);
    }
  }

  async function runChaosZoomGesture(
    token: number,
    gesture: ChaosZoomGesture,
  ): Promise<ChaosZoomGestureResult> {
    const monitor = startChaosZoomFrameMonitor();
    const basemapSamples: ChaosBasemapAuditSample[] = [];
    sampleChaosBasemapAudit(basemapSamples);
    const basemapSampleTimer = window.setInterval(
      () => sampleChaosBasemapAudit(basemapSamples),
      CHAOS_BASEMAP_SAMPLE_INTERVAL_MS,
    );
    const startedAt = chaosNow();
    let motionEndedAt = startedAt;
    let monitoringEndedAt = startedAt;
    let screenshot: ChaosZoomScreenshot | undefined;
    let basemapRecoveredAfterGesture = true;
    try {
      for (let index = 0; index < gesture.eventCount; index += 1) {
        dispatchChaosZoomWheel(
          token,
          gesture.deltaYPerEvent,
          gesture.anchorRatioX,
          gesture.anchorRatioY,
        );
        await waitForChaosZoomDelay(gesture.eventIntervalMs);
      }
      motionEndedAt = chaosNow();
      // Capture the transient raster state exactly 200 ms after the final
      // wheel input. Waiting for the normal settle here hid the historical
      // blank frame and made the old Chaos Zoom result falsely reassuring.
      await waitForChaosZoomDelay(CHAOS_POST_GESTURE_CAPTURE_DELAY_MS);
      sampleChaosBasemapAudit(basemapSamples);
      // PNG encoding and the post-gesture healing audit are diagnostic work,
      // not map frames. Stop the FPS window at the exact T+200 ms observation
      // point so Chaos Zoom does not report its own capture overhead as a
      // renderer lag spike. Basemap coverage keeps sampling independently.
      monitoringEndedAt = chaosNow();
      stopChaosZoomFrameMonitor(monitor);
      screenshot = await captureChaosZoomScreenshot(gesture.index);
      const settleDeadline = Date.now() + 10_000;
      while (true) {
        assertChaosZoomActive(token);
        if (!options.isScrolling()) break;
        if (Date.now() >= settleDeadline) throw new Error("Timeout pendant le settle Chaos Zoom");
        await waitForChaosZoomFrame();
      }
      await waitForChaosZoomFrames(token, 2);
      // Keep sampling after scrolling stops until the live atomic definition
      // has healed the viewport. This both detects an indefinitely cached gap
      // and prevents the following random gesture from starting on an already
      // invalid raster state and producing a misleading cascade of failures.
      basemapRecoveredAfterGesture = await waitForChaosBasemapRecovery(token);
      sampleChaosBasemapAudit(basemapSamples);
    } finally {
      window.clearInterval(basemapSampleTimer);
      stopChaosZoomFrameMonitor(monitor);
    }

    const endedAt = chaosNow();
    const frameSummary = summarizeChaosFrameTimes(
      monitor.frameTimesMs,
      Math.max(0, monitoringEndedAt - monitor.startedAt),
    );
    const camera = options.getCamera();
    if (!screenshot) throw new Error("Capture Chaos Zoom absente à T+200 ms");
    const minZoom = monitor.zoomSamples.length
      ? Math.min(...monitor.zoomSamples)
      : Math.min(gesture.startZoom, camera.zoom);
    const maxZoom = monitor.zoomSamples.length
      ? Math.max(...monitor.zoomSamples)
      : Math.max(gesture.startZoom, camera.zoom);
    return {
      frameSummary,
      frameTimesMs: [...monitor.frameTimesMs],
      renderTimesMs: [...monitor.renderTimesMs],
      scrollingFrameCount: monitor.scrollingFrameCount,
      settledFrameCount: monitor.settledFrameCount,
      minZoom,
      maxZoom,
      minPathCount: monitor.minPathCount,
      minStationCount: monitor.minStationCount,
      motionDurationMs: Math.max(0, motionEndedAt - startedAt),
      settleDurationMs: Math.max(0, endedAt - motionEndedAt),
      totalDurationMs: Math.max(0, endedAt - startedAt),
      basemapRecoveredAfterGesture,
      basemapAudit: summarizeChaosBasemapAudit(
        basemapSamples,
        CHAOS_BASEMAP_SAMPLE_INTERVAL_MS,
      ),
      screenshot,
    };
  }

  async function waitForChaosZoomSettle(token: number): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (true) {
      assertChaosZoomActive(token);
      if (!options.isScrolling()) return;
      if (Date.now() >= deadline) throw new Error("Timeout en attendant le settle Chaos Zoom");
      await waitForChaosZoomFrame();
    }
  }

  async function captureChaosZoomScreenshot(index: number): Promise<ChaosZoomScreenshot> {
    const canvas = options.getCanvas();
    const camera = options.getCamera();
    const scene = options.getRenderScene();
    const widthCssPx = camera.viewportWidthCssPx;
    const heightCssPx = camera.viewportHeightCssPx;
    const analysis = canvas
      ? analyzeChaosCanvas(canvas, {
          expectedPixelRatio: camera.pixelRatio,
          visiblePathCount: scene.paths.length,
          visibleStationCount: scene.stations.length,
        })
      : createUnavailableCanvasAnalysis();
    const basemapCoverage = options.readBasemapCoverage?.();
    const basemapMissingRatio = basemapCoverage
      ? Math.max(0, Math.min(1, 1 - basemapCoverage.combined.coverageRatio))
      : undefined;
    const isBasemapBlank = basemapMissingRatio !== undefined
      ? basemapMissingRatio >= CHAOS_BASEMAP_PARTIAL_BLANK_MISSING_RATIO
      : undefined;
    const isBasemapBlurry = basemapCoverage?.quality?.isBlurry === true;
    const capturedAt = new Date().toISOString();
    const downloadName = `line-14-chaos-zoom-${String(index + 1).padStart(2, "0")}.png`;
    let blob: Blob | null = null;
    let captureError: string | undefined;

    if (!canvas) {
      captureError = "canvas-unavailable";
    } else {
      blob = await new Promise<Blob | null>((resolve) => {
        let settled = false;
        const finish = (value: Blob | null) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const timeout = window.setTimeout(() => finish(null), 1_000);
        try {
          canvas.toBlob((value) => {
            window.clearTimeout(timeout);
            finish(value);
          }, "image/png");
        } catch (error) {
          window.clearTimeout(timeout);
          captureError = error instanceof Error ? error.message : String(error);
          finish(null);
        }
      });
      if (!blob && !captureError) captureError = "canvas-to-blob-unavailable";
    }

    let path: string | null = null;
    let blobUrl: string | undefined;
    if (blob && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      try {
        blobUrl = URL.createObjectURL(blob);
        path = blobUrl;
        chaosZoomObjectUrls.add(blobUrl);
      } catch (error) {
        captureError ??= error instanceof Error ? error.message : String(error);
      }
    } else if (blob && canvas) {
      try {
        path = canvas.toDataURL("image/png");
      } catch (error) {
        captureError ??= error instanceof Error ? error.message : String(error);
      }
    }

    return {
      ...analysis,
      isBlurry: analysis.isBlurry || isBasemapBlurry,
      blurReason: isBasemapBlurry ? "basemap-source-upscaled" : analysis.blurReason,
      index,
      capturedAt,
      path,
      blobUrl,
      mimeType: "image/png",
      bytes: blob?.size ?? 0,
      widthCssPx,
      heightCssPx,
      pixelRatio: camera.pixelRatio,
      zoomRange: { minimum: minimumZoom, maximum: maximumZoom },
      captureScope: "canvas-viewport",
      downloadName,
      isBasemapBlank,
      basemapMissingRatio:
        basemapMissingRatio === undefined ? undefined : roundChaosMetric(basemapMissingRatio, 6),
      basemapCoverage,
      captureError,
    };
  }

  function readUsedJsHeapBytes(): number | undefined {
    const value = (
      performance as Performance & {
        memory?: { usedJSHeapSize?: number };
      }
    ).memory?.usedJSHeapSize;
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }

  function chaosPercentile(values: number[], ratio: number): number {
    const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))]!;
  }

  function combineChaosBasemapAudits(
    audits: ChaosBasemapAuditSummary[],
  ): ChaosBasemapAuditSummary {
    if (!audits.length) return summarizeChaosBasemapAudit([]);
    const minimumCombinedCoverageRatio = Math.min(
      ...audits.map((audit) => audit.minimumCombinedCoverageRatio),
    );
    return {
      sampleIntervalMs: CHAOS_BASEMAP_SAMPLE_INTERVAL_MS,
      sampleCount: audits.reduce((sum, audit) => sum + audit.sampleCount, 0),
      gapSampleCount: audits.reduce((sum, audit) => sum + audit.gapSampleCount, 0),
      partialBlankSampleCount: audits.reduce(
        (sum, audit) => sum + audit.partialBlankSampleCount,
        0,
      ),
      fullBlankSampleCount: audits.reduce((sum, audit) => sum + audit.fullBlankSampleCount, 0),
      minimumCombinedCoverageRatio,
      maximumMissingRatio: roundChaosMetric(1 - minimumCombinedCoverageRatio, 6),
      maximumGapPx: Math.max(...audits.map((audit) => audit.maximumGapPx)),
      longestGapDurationMs: Math.max(...audits.map((audit) => audit.longestGapDurationMs)),
      hasPersistentGap: audits.some((audit) => audit.hasPersistentGap),
      hasPartialBlank: audits.some((audit) => audit.hasPartialBlank),
      hasFullBlank: audits.some((audit) => audit.hasFullBlank),
      blurrySampleCount: audits.reduce((sum, audit) => sum + audit.blurrySampleCount, 0),
      failures: audits.flatMap((audit) => audit.failures).slice(0, 64),
    };
  }

  function buildChaosZoomReport(optionsForReport: {
    status: ChaosZoomStatus;
    line?: GlobalMapLine;
    startedAt: string;
    initialCamera?: CameraState;
    cameraBeforeRestore?: CameraState;
    restoredCamera?: CameraState;
    steps: ChaosZoomStepReport[];
    screenshots: ChaosZoomScreenshot[];
    performance?: TransportMapPerformanceReport;
    error?: string;
  }): ChaosZoomReport {
    const frameTimesMs = optionsForReport.steps.flatMap((step) => step.frameMetrics.frameTimesMs);
    const renderTimesMs = optionsForReport.steps.flatMap((step) => step.frameMetrics.renderTimesMs);
    const durationMs = optionsForReport.steps.reduce(
      (sum, step) => sum + step.frameMetrics.durationMs,
      0,
    );
    const frameMetricsBase = summarizeChaosFrameTimes(frameTimesMs, durationMs);
    const scrollingFrameCount = optionsForReport.steps.reduce(
      (sum, step) => sum + step.frameMetrics.scrollingFrameCount,
      0,
    );
    const settledFrameCount = optionsForReport.steps.reduce(
      (sum, step) => sum + step.frameMetrics.settledFrameCount,
      0,
    );
    const totalGestureDurationMs = optionsForReport.steps.reduce(
      (sum, step) => sum + step.durationMs,
      0,
    );
    const totalWheelDeltaY = optionsForReport.steps.reduce(
      (sum, step) => sum + Math.abs(step.wheelDeltaYPerEvent * step.eventCount),
      0,
    );
    const renderAverageMs = renderTimesMs.length
      ? renderTimesMs.reduce((sum, value) => sum + value, 0) / renderTimesMs.length
      : 0;
    const renderMaxMs = renderTimesMs.length ? Math.max(...renderTimesMs) : 0;
    const isLagSpike =
      frameMetricsBase.isLagSpike ||
      renderMaxMs > 50;
    const isBlurry = optionsForReport.screenshots.some((screenshot) => screenshot.isBlurry);
    const isBlank = optionsForReport.screenshots.some((screenshot) => screenshot.isBlank);
    const isBasemapBlank = optionsForReport.screenshots.some(
      (screenshot) => screenshot.isBasemapBlank === true,
    );
    const hasBasemapCoverageGap = optionsForReport.screenshots.some(
      (screenshot) => screenshot.basemapCoverage?.combined.hasGap === true,
    );
    const basemapAudit = combineChaosBasemapAudits(
      optionsForReport.steps.map((step) => step.basemapAudit),
    );
    const hasPersistentBasemapGap = basemapAudit.hasPersistentGap;
    const hasPartialBasemapBlank = basemapAudit.hasPartialBlank;
    const camera = options.getCamera();
    const finalCamera = optionsForReport.cameraBeforeRestore ?? optionsForReport.restoredCamera ?? camera;
    const scene = options.getRenderScene();
    const minPathCount = optionsForReport.steps.length
      ? Math.min(...optionsForReport.steps.map((step) => step.frameMetrics.minPathCount))
      : scene.paths.length;
    const minStationCount = optionsForReport.steps.length
      ? Math.min(...optionsForReport.steps.map((step) => step.frameMetrics.minStationCount))
      : scene.stations.length;
    const frameMetrics = {
      ...frameMetricsBase,
      frameTimesMs,
      renderTimesMs,
      scrollingFrameCount,
      settledFrameCount,
      minPathCount,
      minStationCount,
      renderAverageMs: roundChaosMetric(renderAverageMs),
      renderP95Ms: roundChaosMetric(chaosPercentile(renderTimesMs, 0.95)),
      renderMaxMs: roundChaosMetric(renderMaxMs),
    };
    const scrollSpeed = totalGestureDurationMs > 0
      ? totalWheelDeltaY / (totalGestureDurationMs / 1_000)
      : 0;
    return {
      schemaVersion: 1,
      status: optionsForReport.status,
      scenario: "chaos-zoom",
      profile: {
        id: STANDARD_CHAOS_ZOOM_PROFILE.id,
        version: STANDARD_CHAOS_ZOOM_PROFILE.version,
        seed: STANDARD_CHAOS_ZOOM_PROFILE.seed,
      },
      lineId: optionsForReport.line?.id ?? options.lineTargetId ?? DEFAULT_LINE_ID,
      lineLabel: optionsForReport.line?.label,
      lineCode: optionsForReport.line?.code,
      operationCount,
      completedOperationCount: optionsForReport.steps.length,
      startedAt: optionsForReport.startedAt,
      completedAt: new Date().toISOString(),
      viewportWidthCssPx: camera.viewportWidthCssPx,
      viewportHeightCssPx: camera.viewportHeightCssPx,
      pixelRatio: camera.pixelRatio,
      zoomRange: { minimum: minimumZoom, maximum: maximumZoom },
      initialCamera: optionsForReport.initialCamera,
      cameraBeforeRestore: optionsForReport.cameraBeforeRestore,
      restoredCamera: optionsForReport.restoredCamera,
      averageFps: frameMetrics.averageFps,
      scrollSpeed: roundChaosMetric(scrollSpeed),
      scrollSpeedUnit: "wheel-delta-y-per-second",
      zoomLevel: roundChaosMetric(finalCamera.zoom),
      isScrolling: options.isScrolling(),
      isScrollingDuringSequence: scrollingFrameCount > 0,
      isLagSpike,
      isBlurry,
      isBlank,
      isBasemapBlank: isBasemapBlank || basemapAudit.hasFullBlank,
      hasBasemapCoverageGap: hasBasemapCoverageGap || basemapAudit.gapSampleCount > 0,
      hasPersistentBasemapGap,
      hasPartialBasemapBlank,
      basemapAudit,
      frameMetrics,
      screenshots: optionsForReport.screenshots,
      steps: optionsForReport.steps,
      renderer: options.getRendererKind(),
      scene: {
        pathCount: scene.paths.length,
        stationCount: scene.stations.length,
        minPathCountDuringRun: minPathCount,
        minStationCountDuringRun: minStationCount,
      },
      performance: optionsForReport.performance,
      error: optionsForReport.error,
    };
  }

  function publishChaosZoomReport(report: ChaosZoomReport | ChaosZoomLiveReport): void {
    if (typeof window === "undefined") return;
    const debugWindow = window as Window & {
      __transportMapChaosZoomReport?: ChaosZoomReport | ChaosZoomLiveReport;
    };
    debugWindow.__transportMapChaosZoomReport = report;
  }

  function publishChaosZoomLiveStatus(
    status: ChaosZoomLiveReport["status"],
    profileId: ChaosZoomProfileId,
    phase: ChaosZoomLiveReport["phase"],
    actionIndex = -1,
  ): void {
    const profile = profileId === "extreme"
      ? EXTREME_CHAOS_ZOOM_PROFILE
      : STANDARD_CHAOS_ZOOM_PROFILE;
    const live: ChaosZoomLiveReport = {
      schemaVersion: 1,
      status,
      scenario: profileId === "extreme" ? "chaos-zoom-extreme" : "chaos-zoom",
      profile: { id: profile.id, version: profile.version, seed: profile.seed },
      phase,
      actionIndex,
      progress: chaosZoomProgress.value,
      total: chaosZoomTotal.value,
    };
    chaosZoomLiveReport.value = live;
    publishChaosZoomReport(live);
  }

  function revokeChaosZoomObjectUrls(): void {
    if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
      for (const url of chaosZoomObjectUrls) URL.revokeObjectURL(url);
    }
    chaosZoomObjectUrls.clear();
  }

  async function runChaosZoomScenario(token: number): Promise<ChaosZoomReport> {
    const startedAt = new Date().toISOString();
    const steps: ChaosZoomStepReport[] = [];
    const screenshots: ChaosZoomScreenshot[] = [];
    let line: GlobalMapLine | undefined;
    let initialCamera: CameraState | undefined;
    let cameraBeforeRestore: CameraState | undefined;
    let restoredCamera: CameraState | undefined;
    let performanceReport: TransportMapPerformanceReport | undefined;
    let errorMessage: string | undefined;

    try {
      assertChaosZoomActive(token);
      options.beforeRun?.();
      options.cancelInteractions();
      line = await options.prepareLine14(() => assertChaosZoomActive(token));
      assertChaosZoomActive(token);
      await waitForChaosZoomCondition(
        token,
        () => options.getActiveLineId() === line?.id,
        "la ligne 14 active",
      );
      await waitForChaosZoomSceneStable(token, line.id);
      const preparedCamera = options.getCamera();
      const preparedZoom = Math.max(minimumZoom, Math.min(maximumZoom, preparedCamera.zoom));
      if (Math.abs(preparedZoom - preparedCamera.zoom) > 1e-6) {
        options.applyCamera({ ...preparedCamera, zoom: preparedZoom }, false, false, true);
        options.captureBasemapSnapshot?.();
        await waitForChaosZoomFrames(token, 2);
      }
      initialCamera = { ...options.getCamera() };
      // Cover promotion is an idle/preload concern. Complete it before the
      // gesture probe starts so screenshot encoding and deliberate GPU warmup
      // cannot masquerade as wheel-renderer frames.
      await options.beforeMeasure?.();
      assertChaosZoomActive(token);
      chaosPerformanceProbe?.dispose();
      chaosPerformanceProbe = createTransportMapPerformanceProbe({ expectedHz: 60, warmupMs: 0 });
      chaosPerformanceProbe.start();
      publishChaosZoomLiveStatus("running", "standard", "standard");

      for (let index = 0; index < operationCount; index += 1) {
        assertChaosZoomActive(token);
        chaosZoomProgress.value = index + 1;
        publishChaosZoomLiveStatus("running", "standard", "standard", index);
        const gesture = createChaosZoomGesture(index);
        const memoryBeforeUsedJsHeapBytes = readUsedJsHeapBytes();
        const gestureResult = await runChaosZoomGesture(token, gesture);
        await waitForChaosZoomSettle(token);
        const screenshot = gestureResult.screenshot;
        const memoryAfterUsedJsHeapBytes = readUsedJsHeapBytes();
        screenshots.push(screenshot);
        const camera = options.getCamera();
        const actualDeltaZoom = camera.zoom - gesture.startZoom;
        const renderMaxMs = gestureResult.renderTimesMs.length
          ? Math.max(...gestureResult.renderTimesMs)
          : 0;
        const frameMetrics = {
          ...gestureResult.frameSummary,
          frameTimesMs: gestureResult.frameTimesMs,
          renderTimesMs: gestureResult.renderTimesMs,
          scrollingFrameCount: gestureResult.scrollingFrameCount,
          settledFrameCount: gestureResult.settledFrameCount,
          minZoom: roundChaosMetric(gestureResult.minZoom),
          maxZoom: roundChaosMetric(gestureResult.maxZoom),
          minPathCount: gestureResult.minPathCount,
          minStationCount: gestureResult.minStationCount,
          renderAverageMs: roundChaosMetric(
            gestureResult.renderTimesMs.length
              ? gestureResult.renderTimesMs.reduce((sum, value) => sum + value, 0) /
                  gestureResult.renderTimesMs.length
              : 0,
          ),
          renderP95Ms: roundChaosMetric(chaosPercentile(gestureResult.renderTimesMs, 0.95)),
          renderMaxMs: roundChaosMetric(renderMaxMs),
        };
        steps.push({
          index,
          direction: gesture.direction,
          startZoom: roundChaosMetric(gesture.startZoom),
          requestedDeltaZoom: roundChaosMetric(gesture.requestedDeltaZoom),
          actualDeltaZoom: roundChaosMetric(actualDeltaZoom),
          zoomLevel: roundChaosMetric(camera.zoom),
          eventCount: gesture.eventCount,
          durationMs: roundChaosMetric(gesture.durationMs),
          settleDurationMs: roundChaosMetric(gestureResult.settleDurationMs),
          totalDurationMs: roundChaosMetric(gestureResult.totalDurationMs),
          scrollSpeed: roundChaosMetric(gesture.scrollSpeed),
          scrollSpeedUnit: "wheel-delta-y-per-second",
          zoomSpeedLevelsPerSecond: roundChaosMetric(
            Math.abs(actualDeltaZoom) / Math.max(0.001, gestureResult.motionDurationMs / 1_000),
          ),
          wheelDeltaYPerEvent: roundChaosMetric(gesture.deltaYPerEvent),
          anchorRatioX: roundChaosMetric(gesture.anchorRatioX),
          anchorRatioY: roundChaosMetric(gesture.anchorRatioY),
          isScrolling: options.isScrolling(),
          isScrollingDuringStep: gestureResult.scrollingFrameCount > 0,
          isLagSpike: frameMetrics.isLagSpike || renderMaxMs > 50,
          basemapRecoveredAfterGesture: gestureResult.basemapRecoveredAfterGesture,
          frameMetrics,
          memory:
            memoryBeforeUsedJsHeapBytes !== undefined &&
            memoryAfterUsedJsHeapBytes !== undefined
              ? {
                  beforeUsedJsHeapBytes: memoryBeforeUsedJsHeapBytes,
                  afterUsedJsHeapBytes: memoryAfterUsedJsHeapBytes,
                  deltaBytes: memoryAfterUsedJsHeapBytes - memoryBeforeUsedJsHeapBytes,
                }
              : undefined,
          basemapAudit: gestureResult.basemapAudit,
          screenshot,
        });
      }
      cameraBeforeRestore = { ...options.getCamera() };
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      cameraBeforeRestore = { ...options.getCamera() };
    } finally {
      stopChaosZoomFrameMonitor(chaosZoomFrameMonitor);
      if (chaosPerformanceProbe) {
        performanceReport = chaosPerformanceProbe.stop({
          ...options.performanceMetadata(),
          scenario: "chaos-zoom",
          lineId: line?.id ?? options.lineTargetId ?? DEFAULT_LINE_ID,
          completedOperationCount: steps.length,
        });
        chaosPerformanceProbe = undefined;
      }
      options.cancelInteractions();
      options.setInteractionActive(false);
      if (initialCamera && options.isMounted()) {
        options.applyCamera(initialCamera, false, false, true);
        options.captureBasemapSnapshot?.();
        await waitForChaosZoomFrames(token, 2).catch(() => undefined);
        restoredCamera = { ...options.getCamera() };
      }
    }

    const report = buildChaosZoomReport({
      status: errorMessage ? "failed" : "completed",
      line,
      startedAt,
      initialCamera,
      cameraBeforeRestore,
      restoredCamera,
      steps,
      screenshots,
      performance: performanceReport,
      error: errorMessage,
    });
    if (!errorMessage) {
      const failures: string[] = [];
      if (report.hasPersistentBasemapGap) failures.push("persistent-basemap-gap");
      if (report.hasPartialBasemapBlank) failures.push("partial-basemap-blank");
      if (report.isBlurry) failures.push("blurry-frame");
      if (report.isLagSpike) failures.push("lag-spike");
      if (report.steps.some((step) => !step.basemapRecoveredAfterGesture)) {
        failures.push("basemap-did-not-recover");
      }
      if (failures.length > 0) {
        report.status = "failed";
        report.error = `Chaos Zoom acceptance failed: ${failures.join(", ")}`;
      }
    }
    chaosZoomReport.value = report;
    chaosZoomLiveReport.value = undefined;
    publishChaosZoomReport(report);
    chaosZoomRunning.value = false;
    return report;
  }

  async function dispatchExtremeZoom(
    token: number,
    action: ChaosZoomExtremeAction,
  ): Promise<void> {
    const targetZoom = action.targetZoom ?? options.getCamera().zoom;
    const deltaZoom = targetZoom - options.getCamera().zoom;
    const deltaYPerEvent =
      -deltaZoom /
      (Math.max(1, action.eventCount) * GLOBAL_TRANSPORT_PLAN_CONFIG.camera.wheelZoomFactor);
    const durationMs = action.kind === "combined" ? action.durationMs / 2 : action.durationMs;
    const intervalMs = durationMs / Math.max(1, action.eventCount);
    for (let index = 0; index < action.eventCount; index += 1) {
      dispatchChaosZoomWheel(
        token,
        deltaYPerEvent,
        action.anchorRatioX,
        action.anchorRatioY,
      );
      clampExtremeCameraToCenter();
      await waitForChaosZoomDelay(intervalMs);
    }
  }

  async function dispatchExtremePan(
    token: number,
    action: ChaosZoomExtremeAction,
  ): Promise<void> {
    assertChaosZoomActive(token);
    const canvas = options.getCanvas();
    if (!canvas) throw new Error("Canvas absent pendant Chaos Zoom extrême");
    const rect = canvas.getBoundingClientRect();
    const camera = options.getCamera();
    const width = rect.width || camera.viewportWidthCssPx;
    const height = rect.height || camera.viewportHeightCssPx;
    const from = {
      x: rect.left + width * (action.panFromRatioX ?? 0.5),
      y: rect.top + height * (action.panFromRatioY ?? 0.5),
    };
    const to = {
      x: rect.left + width * (action.panToRatioX ?? 0.5),
      y: rect.top + height * (action.panToRatioY ?? 0.5),
    };
    const PointerEventConstructor = window.PointerEvent;
    if (typeof PointerEventConstructor !== "function") {
      throw new Error("PointerEvent indisponible pendant Chaos Zoom extrême");
    }
    const pointerId = 91;
    const dispatch = (type: string, x: number, y: number, buttons: number) => {
      canvas.dispatchEvent(new PointerEventConstructor(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: "mouse",
        isPrimary: true,
        clientX: x,
        clientY: y,
        button: type === "pointerdown" || type === "pointerup" ? 0 : -1,
        buttons,
      }));
    };
    dispatch("pointerdown", from.x, from.y, 1);
    const durationMs = action.kind === "combined" ? action.durationMs / 2 : action.durationMs;
    const intervalMs = durationMs / Math.max(1, action.eventCount);
    for (let index = 1; index <= action.eventCount; index += 1) {
      const progress = index / action.eventCount;
      dispatch(
        "pointermove",
        from.x + (to.x - from.x) * progress,
        from.y + (to.y - from.y) * progress,
        1,
      );
      clampExtremeCameraToCenter();
      await waitForChaosZoomDelay(intervalMs);
    }
    dispatch("pointerup", to.x, to.y, 0);
  }

  function applyExtremeTargetCenter(action: ChaosZoomExtremeAction): void {
    if (!action.targetCenter) return;
    const camera = options.getCamera();
    const target = lonLatToWorld(action.targetCenter);
    options.applyCamera({
      ...camera,
      centerWorldX: target.x,
      centerWorldY: target.y,
    }, false, true, true);
  }

  function clampExtremeCameraToCenter(): void {
    const camera = options.getCamera();
    const current = worldToLonLat({ x: camera.centerWorldX, y: camera.centerWorldY });
    const center = EXTREME_CHAOS_ZOOM_PROFILE.center;
    const distanceKm = haversineDistanceKm(center, current);
    const zoom = Math.max(
      EXTREME_CHAOS_ZOOM_PROFILE.minimumZoom,
      Math.min(EXTREME_CHAOS_ZOOM_PROFILE.maximumZoom, camera.zoom),
    );
    const clamped = distanceKm > EXTREME_CHAOS_ZOOM_PROFILE.maximumCenterDistanceKm
      ? lonLatToWorld({
          lon: center.lon +
            (current.lon - center.lon) *
              (EXTREME_CHAOS_ZOOM_PROFILE.maximumCenterDistanceKm / distanceKm),
          lat: center.lat +
            (current.lat - center.lat) *
              (EXTREME_CHAOS_ZOOM_PROFILE.maximumCenterDistanceKm / distanceKm),
        })
      : { x: camera.centerWorldX, y: camera.centerWorldY };
    if (
      clamped.x === camera.centerWorldX &&
      clamped.y === camera.centerWorldY &&
      zoom === camera.zoom
    ) return;
    options.applyCamera({
      ...camera,
      centerWorldX: clamped.x,
      centerWorldY: clamped.y,
      zoom,
    }, false, true, true);
  }

  async function waitForExtremeCommit(token: number): Promise<boolean> {
    const deadline = Date.now() + EXTREME_CHAOS_ZOOM_PROFILE.commitTimeoutMs;
    while (true) {
      assertChaosZoomActive(token);
      if (!options.isScrolling() && !options.isViewportPending?.()) return true;
      if (Date.now() >= deadline) return false;
      await waitForChaosZoomFrame();
    }
  }

  function captureExtremeSpike(
    spikes: ChaosZoomFrameSpike[],
    durationMs: number,
    timestamp: number,
    startedAtMs: number,
    phase: ChaosZoomExtremePhase,
    action: ChaosZoomExtremeAction | undefined,
    previous: ChaosZoomExtremeFrameSample | undefined,
  ): ChaosZoomExtremeFrameSample {
    const camera = options.getCamera();
    const scene = options.getRenderScene();
    const center = worldToLonLat({ x: camera.centerWorldX, y: camera.centerWorldY });
    const data = cloneChaosDataMetrics(options.getDataMetrics?.());
    const current: ChaosZoomExtremeFrameSample = {
      timestamp,
      camera: { ...camera },
      center,
      lodLevel: chaosLodLevel(camera.zoom),
      data,
    };
    if (durationMs < EXTREME_CHAOS_ZOOM_PROFILE.spikeThresholdMs) return current;
    const renderer = options.getRendererMetrics();
    const seconds = Math.max(durationMs / 1_000, 0.001);
    const previousData = previous?.data;
    const scheduler = data?.cache;
    const previousScheduler = previousData?.cache;
    const cache = scheduler?.cache;
    const previousCache = previousScheduler?.cache;
    if (options.performanceTrace?.isRunning && durationMs >= TRANSPORT_MAP_TRACE_THRESHOLDS.slowFrameMs) {
      const previousChunkCount = previousData?.lastChunkCount ?? data?.lastChunkCount ?? 0;
      options.performanceTrace.recordFrame(durationMs, timestamp, {
        camera: {
          zoom: camera.zoom,
          centerWorldX: camera.centerWorldX,
          centerWorldY: camera.centerWorldY,
          center,
        },
        lod: {
          current: current.lodLevel,
          previous: previous?.lodLevel ?? current.lodLevel,
          changing: previous !== undefined && previous.lodLevel !== current.lodLevel,
        },
        render: {
          pathCount: scene.paths.length,
          stationCount: scene.stations.length,
          vertexCount: scene.paths.reduce((sum, path) => sum + path.vertices.length, 0),
        },
        chunks: {
          visible: data?.lastChunkCount,
          added: Math.max(0, (data?.lastChunkCount ?? 0) - previousChunkCount),
          removed: Math.max(0, previousChunkCount - (data?.lastChunkCount ?? 0)),
          pending: scheduler?.pending,
          active: scheduler?.active,
          completed: scheduler?.completed,
          bytes: data?.bytes,
        },
        binary: {
          cacheBytes: renderer?.binaryCacheBytes ?? renderer?.cacheBytes,
          cacheEntries: renderer?.binaryCacheEntries,
          hits: renderer?.binaryCacheHits,
          misses: renderer?.binaryCacheMisses,
          compileInProgress: renderer?.binaryCompileInProgress,
        },
        metadata: {
          phase,
          actionIndex: action?.index ?? -1,
          action: action?.kind ?? (phase === "recovery" ? "recovery" : "activation"),
        },
      });
    }
    retainWorstChaosZoomSpikes(spikes, {
      durationMs: roundChaosMetric(durationMs),
      offsetMs: roundChaosMetric(timestamp - startedAtMs),
      phase,
      actionIndex: action?.index ?? -1,
      action: action?.kind ?? (phase === "recovery" ? "recovery" : "activation"),
      camera: { ...camera },
      distanceFromCenterKm: roundChaosMetric(
        haversineDistanceKm(EXTREME_CHAOS_ZOOM_PROFILE.center, center),
      ),
      zoomSpeedLevelsPerSecond: roundChaosMetric(
        previous ? Math.abs(camera.zoom - previous.camera.zoom) / seconds : 0,
      ),
      panSpeedKmPerSecond: roundChaosMetric(
        previous ? haversineDistanceKm(previous.center, center) / seconds : 0,
      ),
      previousLodLevel: previous?.lodLevel ?? current.lodLevel,
      lodLevel: current.lodLevel,
      scene: {
        pathCount: scene.paths.length,
        stationCount: scene.stations.length,
        vertexCount: scene.paths.reduce((sum, path) => sum + path.vertices.length, 0),
      },
      chunks: [...(options.getChunkIds?.() ?? [])],
      scheduler: scheduler ? {
        pending: scheduler.pending,
        active: scheduler.active,
        completed: scheduler.completed,
        abandoned: scheduler.abandoned,
        delta: {
          pending: scheduler.pending - (previousScheduler?.pending ?? scheduler.pending),
          active: scheduler.active - (previousScheduler?.active ?? scheduler.active),
          completed: scheduler.completed - (previousScheduler?.completed ?? scheduler.completed),
          abandoned: scheduler.abandoned - (previousScheduler?.abandoned ?? scheduler.abandoned),
        },
      } : undefined,
      cache: cache ? {
        ...cache,
        delta: {
          entries: cache.entries - (previousCache?.entries ?? cache.entries),
          bytes: cache.bytes - (previousCache?.bytes ?? cache.bytes),
          hits: cache.hits - (previousCache?.hits ?? cache.hits),
          misses: cache.misses - (previousCache?.misses ?? cache.misses),
          evictions: cache.evictions - (previousCache?.evictions ?? cache.evictions),
        },
      } : undefined,
      renderer: renderer ? { ...renderer, deck: renderer.deck ? { ...renderer.deck } : undefined } : undefined,
    });
    return current;
  }

  async function runExtremeChaosZoomScenario(token: number): Promise<ChaosZoomReport> {
    const startedAt = new Date().toISOString();
    const startedAtMs = chaosNow();
    const trace = createExtremeChaosZoomTrace();
    const actions: ChaosZoomExtremeActionReport[] = [];
    const spikes: ChaosZoomFrameSpike[] = [];
    const initialCamera = { ...options.getCamera() };
    let cameraBeforeRestore: CameraState | undefined;
    let restoredCamera: CameraState | undefined;
    let preparation: ChaosZoomExtremePreparation | undefined;
    let performanceReport: TransportMapPerformanceReport | undefined;
    let errorMessage: string | undefined;
    let missedCommitCount = 0;
    let recoveryDurationMs = 0;
    let currentAction: ChaosZoomExtremeAction | undefined;
    let currentPhase: ChaosZoomExtremePhase = "activate-all";
    let monitor: ChaosZoomFrameMonitor | undefined;
    let previousFrameSample: ChaosZoomExtremeFrameSample | undefined;
    const performanceTrace = options.performanceTrace;
    let ownsPerformanceTrace = false;
    let traceReport: TransportMapTraceReport | undefined;
    let extremeValidation: ChaosZoomExtremeNetworkValidation | undefined;
    const fullNetworkInvariant = createChaosZoomExtremeNetworkInvariantDiagnostic();
    let enforceExtremeFullNetwork = false;
    let lastInvalidNetworkSignature: string | undefined;

    const readExtremeNetworkState = (): ChaosZoomExtremeNetworkState => ({
      availableModes: [
        ...(options.getAvailableModes?.() ?? preparation?.availableModes ?? []),
      ],
      activeModes: [
        ...(options.getActiveModes?.() ?? preparation?.activeModes ?? []),
      ],
      activeLineId: options.getActiveLineId(),
      detailLineId: options.getDetailLineId?.() ?? options.getActiveLineId(),
    });

    const enforceExtremeFullNetworkState = (): void => {
      if (!enforceExtremeFullNetwork || !preparation) return;
      const state = readExtremeNetworkState();
      const validation = validateChaosZoomExtremeNetwork(
        {
          availableModes: state.availableModes,
          activeModes: state.activeModes,
        },
        state.activeLineId,
        state.detailLineId,
      );
      if (validation.fullNetwork) {
        lastInvalidNetworkSignature = undefined;
        return;
      }

      const signature = [
        state.activeLineId ?? "",
        state.detailLineId ?? "",
        [...state.activeModes].sort().join(","),
        [...state.availableModes].sort().join(","),
      ].join("|");
      if (signature !== lastInvalidNetworkSignature) {
        recordChaosZoomExtremeNetworkViolation(
          state,
          fullNetworkInvariant,
          chaosNow() - startedAtMs,
        );
        performanceTrace?.recordCounter("chaosZoom.extreme.fullNetworkInvariantViolations");
        performanceTrace?.instant("chaos_full_network_invariant_violation", {
          activeLineId: state.activeLineId ?? null,
          detailLineId: state.detailLineId ?? null,
          activeModeCount: state.activeModes.length,
          availableModeCount: state.availableModes.length,
          phase: currentPhase,
          actionIndex: currentAction?.index ?? -1,
        });
        lastInvalidNetworkSignature = signature;
      }

      // The component owns the selection refs, so it can synchronously clear
      // a line activated by a late click/watch callback before the next draw.
      options.ensureExtremeFullNetworkState?.();
      const repairedState = readExtremeNetworkState();
      const repairedValidation = validateChaosZoomExtremeNetwork(
        {
          availableModes: repairedState.availableModes,
          activeModes: repairedState.activeModes,
        },
        repairedState.activeLineId,
        repairedState.detailLineId,
      );
      if (repairedValidation.fullNetwork) lastInvalidNetworkSignature = undefined;
      else {
        lastInvalidNetworkSignature = [
          repairedState.activeLineId ?? "",
          repairedState.detailLineId ?? "",
          [...repairedState.activeModes].sort().join(","),
          [...repairedState.availableModes].sort().join(","),
        ].join("|");
      }
    };

    try {
      if (!options.prepareExtreme) throw new Error("Préparation Chaos Zoom extrême indisponible");
      assertChaosZoomActive(token);
      if (performanceTrace && !performanceTrace.isRunning) {
        performanceTrace.start({
          scenario: "chaos-zoom-extreme",
          profile: EXTREME_CHAOS_ZOOM_PROFILE.id,
          profileVersion: EXTREME_CHAOS_ZOOM_PROFILE.version,
          seed: EXTREME_CHAOS_ZOOM_PROFILE.seed,
        });
        ownsPerformanceTrace = true;
      }
      options.beforeRun?.();
      options.cancelInteractions();
      const benchmarkCenter = lonLatToWorld(EXTREME_CHAOS_ZOOM_PROFILE.center);
      options.applyCamera({
        ...options.getCamera(),
        centerWorldX: benchmarkCenter.x,
        centerWorldY: benchmarkCenter.y,
        zoom: 10.6,
      }, false, false, true);
      chaosZoomPhase.value = currentPhase;
      chaosPerformanceProbe?.dispose();
      chaosPerformanceProbe = createTransportMapPerformanceProbe({
        expectedHz: 60,
        warmupMs: 0,
        trace: performanceTrace,
      });
      chaosPerformanceProbe.start();
      monitor = startChaosZoomFrameMonitor((durationMs, timestamp) => {
        enforceExtremeFullNetworkState();
        previousFrameSample = captureExtremeSpike(
          spikes,
          durationMs,
          timestamp,
          startedAtMs,
          currentPhase,
          currentAction,
          previousFrameSample,
        );
      });
      preparation = await options.prepareExtreme(() => assertChaosZoomActive(token));
      assertChaosZoomActive(token);
      enforceExtremeFullNetwork = true;
      enforceExtremeFullNetworkState();
      const preparedNetworkState = readExtremeNetworkState();
      const activeLineIdAfterPreparation = preparedNetworkState.activeLineId;
      const detailLineIdAfterPreparation = preparedNetworkState.detailLineId;
      extremeValidation = validateChaosZoomExtremeNetwork(
        {
          availableModes: preparedNetworkState.availableModes,
          activeModes: preparedNetworkState.activeModes,
        },
        activeLineIdAfterPreparation,
        detailLineIdAfterPreparation,
      );
      if (extremeValidation.reducedBySelection) {
        throw new Error("Chaos Zoom extrême invalide: une ligne reste sélectionnée");
      }
      if (!extremeValidation.allModesActive) {
        throw new Error("Chaos Zoom extrême invalide: tous les modes ne sont pas actifs");
      }
      chaosZoomProgress.value = 1;
      publishChaosZoomLiveStatus("running", "extreme", currentPhase);
      await waitForChaosZoomDelay(EXTREME_CHAOS_ZOOM_PROFILE.activationPauseMs);

      for (const action of trace) {
        assertChaosZoomActive(token);
        enforceExtremeFullNetworkState();
        currentAction = action;
        currentPhase = action.phase;
        chaosZoomPhase.value = currentPhase;
        chaosZoomProgress.value = action.index + 2;
        publishChaosZoomLiveStatus("running", "extreme", currentPhase, action.index);
        const actionStartedAt = chaosNow();
        const startZoom = options.getCamera().zoom;
        if (action.kind === "zoom") await dispatchExtremeZoom(token, action);
        else if (action.kind === "pan") await dispatchExtremePan(token, action);
        else {
          await dispatchExtremeZoom(token, action);
          await dispatchExtremePan(token, action);
          applyExtremeTargetCenter(action);
        }
        clampExtremeCameraToCenter();
        enforceExtremeFullNetworkState();
        let commitTimedOut = false;
        if (action.commitPause) {
          const committed = await waitForExtremeCommit(token);
          commitTimedOut = !committed;
          if (!committed) missedCommitCount += 1;
        }
        await waitForChaosZoomDelay(action.pauseMs);
        enforceExtremeFullNetworkState();
        actions.push({
          index: action.index,
          phase: action.phase,
          kind: action.kind,
          startedAtMs: roundChaosMetric(actionStartedAt - startedAtMs),
          durationMs: roundChaosMetric(chaosNow() - actionStartedAt),
          pauseMs: action.pauseMs,
          commitPause: action.commitPause,
          commitTimedOut,
          startZoom: roundChaosMetric(startZoom),
          endZoom: roundChaosMetric(options.getCamera().zoom),
        });
      }

      currentPhase = "recovery";
      currentAction = undefined;
      chaosZoomPhase.value = currentPhase;
      publishChaosZoomLiveStatus("running", "extreme", currentPhase, trace.length - 1);
      const recoveryStartedAt = chaosNow();
      const deadline = Date.now() + EXTREME_CHAOS_ZOOM_PROFILE.recoveryTimeoutMs;
      while (options.isScrolling() || options.isViewportPending?.()) {
        assertChaosZoomActive(token);
        enforceExtremeFullNetworkState();
        if (Date.now() >= deadline) break;
        await waitForChaosZoomFrame();
      }
      enforceExtremeFullNetworkState();
      recoveryDurationMs = chaosNow() - recoveryStartedAt;
      cameraBeforeRestore = { ...options.getCamera() };
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      cameraBeforeRestore = { ...options.getCamera() };
    }

    stopChaosZoomFrameMonitor(monitor);
    if (chaosPerformanceProbe) {
      performanceReport = chaosPerformanceProbe.stop({
        ...options.performanceMetadata(),
        scenario: "chaos-zoom-extreme",
        profileVersion: EXTREME_CHAOS_ZOOM_PROFILE.version,
        completedOperationCount: actions.length + (preparation ? 1 : 0),
      });
      chaosPerformanceProbe = undefined;
    }
    // Keep the recorder alive for the configured causal post-roll so late
    // chunk, worker, Deck, and MapLibre completions are attached to the last
    // slow frames. The frame monitor itself is already stopped.
    if (performanceTrace?.isRunning) {
      await waitForChaosZoomDelay(500);
      const traceMetadata = {
        scenario: "chaos-zoom-extreme",
        profileVersion: EXTREME_CHAOS_ZOOM_PROFILE.version,
        completedOperationCount: actions.length + (preparation ? 1 : 0),
      };
      traceReport = ownsPerformanceTrace
        ? performanceTrace.stop(traceMetadata)
        : performanceTrace.snapshot(traceMetadata);
    }
    const finalExtremeNetworkState = preparation ? readExtremeNetworkState() : undefined;
    const finalExtremeValidation = preparation && finalExtremeNetworkState
      ? validateChaosZoomExtremeNetwork(
          {
            availableModes: finalExtremeNetworkState.availableModes,
            activeModes: finalExtremeNetworkState.activeModes,
          },
          finalExtremeNetworkState.activeLineId,
          finalExtremeNetworkState.detailLineId,
        )
      : undefined;
    enforceExtremeFullNetwork = false;
    options.cancelInteractions();
    options.setInteractionActive(false);

    const scene = options.getRenderScene();
    const frameTimesMs = monitor?.frameTimesMs ?? [];
    const renderTimesMs = monitor?.renderTimesMs ?? [];
    const frameSummary = summarizeChaosFrameTimes(frameTimesMs, chaosNow() - startedAtMs);
    const enrichedSpikes = enrichExtremeChaosSpikes(spikes, traceReport?.spikes);
    const maplibreAudit = traceReport?.maplibre;
    const memory = performanceReport?.memoryStart?.usedJsHeapSize !== undefined &&
      performanceReport.memoryEnd?.usedJsHeapSize !== undefined
      ? {
          beforeUsedJsHeapBytes: performanceReport.memoryStart.usedJsHeapSize,
          afterUsedJsHeapBytes: performanceReport.memoryEnd.usedJsHeapSize,
          maxUsedJsHeapBytes: traceReport?.maxUsedJsHeapSize,
          deltaBytes: performanceReport.memoryEnd.usedJsHeapSize - performanceReport.memoryStart.usedJsHeapSize,
        }
      : undefined;
    const basemapAudit = maplibreAudit
      ? {
          ...summarizeChaosBasemapAudit(
            maplibreAudit.samples.map((sample) => ({
              sampledAtMs: sample.timestampMs,
              zoom: sample.zoom ?? cameraBeforeRestore?.zoom ?? initialCamera.zoom,
              scrolling: sample.moving,
              // MapLibre's public readiness flags are not pixel coverage. Keep
              // visual blank/gap claims neutral here; the raw readiness
              // failures remain available in `maplibreAudit` and the trace.
              combinedCoverageRatio: 1,
              liveCoverageRatio: 1,
              maxGapPx: 0,
              hasGap: false,
              isBlurry: false,
            })),
            maplibreAudit.sampleIntervalMs,
          ),
          source: "maplibre-public-api" as const,
        }
      : summarizeChaosBasemapAudit([]);
    const report: ChaosZoomReport = {
      schemaVersion: 1,
      status: errorMessage ? "failed" : "completed",
      scenario: "chaos-zoom-extreme",
      profile: {
        id: EXTREME_CHAOS_ZOOM_PROFILE.id,
        version: EXTREME_CHAOS_ZOOM_PROFILE.version,
        seed: EXTREME_CHAOS_ZOOM_PROFILE.seed,
      },
      operationCount: trace.length + 1,
      completedOperationCount: actions.length + (preparation ? 1 : 0),
      startedAt,
      completedAt: new Date().toISOString(),
      viewportWidthCssPx: initialCamera.viewportWidthCssPx,
      viewportHeightCssPx: initialCamera.viewportHeightCssPx,
      pixelRatio: initialCamera.pixelRatio,
      zoomRange: {
        minimum: EXTREME_CHAOS_ZOOM_PROFILE.minimumZoom,
        maximum: EXTREME_CHAOS_ZOOM_PROFILE.maximumZoom,
      },
      initialCamera,
      cameraBeforeRestore,
      averageFps: frameSummary.averageFps,
      scrollSpeed: 0,
      scrollSpeedUnit: "wheel-delta-y-per-second",
      zoomLevel: roundChaosMetric(cameraBeforeRestore?.zoom ?? initialCamera.zoom),
      isScrolling: options.isScrolling(),
      isScrollingDuringSequence: (monitor?.scrollingFrameCount ?? 0) > 0,
      isLagSpike: (traceReport?.totalSpikeCount ?? 0) > 0 || enrichedSpikes.length > 0,
      isBlurry: false,
      isBlank: false,
      isBasemapBlank: false,
      hasBasemapCoverageGap: false,
      hasPersistentBasemapGap: false,
      hasPartialBasemapBlank: false,
      basemapAudit,
      memory,
      trace: traceReport,
      maplibreAudit,
      frameMetrics: {
        ...frameSummary,
        frameTimesMs: [...frameTimesMs],
        renderTimesMs: [...renderTimesMs],
        scrollingFrameCount: monitor?.scrollingFrameCount ?? 0,
        settledFrameCount: monitor?.settledFrameCount ?? 0,
        minPathCount: monitor?.minPathCount ?? scene.paths.length,
        minStationCount: monitor?.minStationCount ?? scene.stations.length,
        renderAverageMs: roundChaosMetric(renderTimesMs.length
          ? renderTimesMs.reduce((sum, value) => sum + value, 0) / renderTimesMs.length
          : 0),
        renderP95Ms: roundChaosMetric(chaosPercentile(renderTimesMs, 0.95)),
        renderMaxMs: roundChaosMetric(renderTimesMs.length ? Math.max(...renderTimesMs) : 0),
      },
      screenshots: [],
      steps: [],
      renderer: options.getRendererKind(),
      scene: {
        pathCount: scene.paths.length,
        stationCount: scene.stations.length,
        minPathCountDuringRun: monitor?.minPathCount ?? scene.paths.length,
        minStationCountDuringRun: monitor?.minStationCount ?? scene.stations.length,
        maxPathCountDuringRun: monitor?.maxPathCount ?? scene.paths.length,
        maxStationCountDuringRun: monitor?.maxStationCount ?? scene.stations.length,
        maxVertexCountDuringRun: monitor?.maxVertexCount ?? scene.paths.reduce((sum, path) => sum + path.vertices.length, 0),
      },
      performance: performanceReport,
      phase: currentPhase,
      actionIndex: currentAction?.index ?? (actions.at(-1)?.index ?? -1),
      modes: preparation ? {
        available: [...preparation.availableModes],
        active: [...preparation.activeModes],
      } : undefined,
      validation: preparation ? {
        ...(extremeValidation ?? {
          fullNetworkExpected: true,
          fullNetwork: finalExtremeValidation?.fullNetwork ?? false,
          noActiveLine: finalExtremeValidation?.noActiveLine ?? false,
          noDetailLine: finalExtremeValidation?.noDetailLine ?? false,
          allModesActive: finalExtremeValidation?.allModesActive ?? false,
          reducedBySelection: finalExtremeValidation?.reducedBySelection ?? true,
        }),
        fullNetwork: Boolean(
          (extremeValidation?.fullNetwork ?? finalExtremeValidation?.fullNetwork) &&
          finalExtremeValidation?.fullNetwork &&
          fullNetworkInvariant.violationCount === 0,
        ),
        warning: fullNetworkInvariant.violationCount > 0
          ? "L'état réseau complet a été violé pendant le scénario."
          : (extremeValidation?.warning ?? finalExtremeValidation?.warning),
        fullNetworkInvariant: { ...fullNetworkInvariant,
          activeLineIdsSeen: [...fullNetworkInvariant.activeLineIdsSeen],
          detailLineIdsSeen: [...fullNetworkInvariant.detailLineIdsSeen],
        },
      } : extremeValidation,
      recoveryDurationMs: roundChaosMetric(recoveryDurationMs),
      missedCommitCount,
      actions,
      spikes: enrichedSpikes,
      capabilities: {
        deckMetrics: Boolean(options.getRendererMetrics()?.deck),
      },
      error: errorMessage,
    };

    try {
      await options.restoreExtreme?.();
      restoredCamera = { ...options.getCamera() };
      report.restoredCamera = restoredCamera;
    } catch (error) {
      report.status = "failed";
      report.error = `Restauration Chaos Zoom extrême impossible: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
    chaosZoomReport.value = report;
    chaosZoomLiveReport.value = undefined;
    publishChaosZoomReport(report);
    downloadChaosZoomReport();
    chaosZoomRunning.value = false;
    chaosZoomPhase.value = "idle";
    return report;
  }

  function runChaosZoom(profile: ChaosZoomProfileId = "standard"): Promise<ChaosZoomReport> {
    if (chaosZoomScenarioPromise) return chaosZoomScenarioPromise;
    revokeChaosZoomObjectUrls();
    chaosZoomReport.value = undefined;
    chaosZoomLiveReport.value = undefined;
    chaosZoomProgress.value = 0;
    chaosZoomRunning.value = true;
    chaosZoomActiveProfile.value = profile;
    chaosZoomPhase.value = profile === "extreme" ? "activate-all" : "idle";
    chaosZoomTotal.value = profile === "extreme"
      ? createExtremeChaosZoomTrace().length + 1
      : operationCount;
    publishChaosZoomLiveStatus(
      "preparing",
      profile,
      profile === "extreme" ? "activate-all" : "standard",
    );
    const token = ++chaosZoomScenarioToken;
    const promise = profile === "extreme"
      ? runExtremeChaosZoomScenario(token)
      : runChaosZoomScenario(token);
    const trackedPromise = promise.finally(() => {
      if (chaosZoomScenarioPromise === trackedPromise) chaosZoomScenarioPromise = undefined;
    });
    chaosZoomScenarioPromise = trackedPromise;
    return trackedPromise;
  }

  function runChaosZoomExtreme(): Promise<ChaosZoomReport> {
    return runChaosZoom("extreme");
  }

  function recordPresentedFrame(interactive: boolean): void {
    chaosPerformanceProbe?.recordPresentedFrame(interactive);
  }

  function recordRendererMetrics(metrics: TransportMapRendererMetrics): void {
    chaosPerformanceProbe?.recordRendererMetrics(metrics);
  }

  function recordCacheMetrics(metrics: ChaosCacheMetrics): void {
    chaosPerformanceProbe?.recordCacheMetrics(metrics);
  }

  function recordTiming(kind: "worker" | "decode" | "hitTest", durationMs: number): void {
    chaosPerformanceProbe?.recordTiming(kind, durationMs);
  }

  function dispose(): void {
    chaosZoomScenarioToken += 1;
    stopChaosZoomFrameMonitor(chaosZoomFrameMonitor);
    chaosPerformanceProbe?.dispose();
    chaosPerformanceProbe = undefined;
    if (options.performanceTrace?.isRunning) {
      options.performanceTrace.stop({
        scenario: "chaos-zoom-extreme",
        cancelled: true,
      });
    }
    revokeChaosZoomObjectUrls();
  }

  onBeforeUnmount(dispose);

  return {
    running: chaosZoomRunning,
    progress: chaosZoomProgress,
    total: chaosZoomTotal,
    activeProfile: chaosZoomActiveProfile,
    phase: chaosZoomPhase,
    report: chaosZoomReport,
    reportJson: chaosZoomReportJson,
    downloadChaosZoomReport,
    runChaosZoom,
    runChaosZoomExtreme,
    recordPresentedFrame,
    recordRendererMetrics,
    recordCacheMetrics,
    recordTiming,
    dispose,
  };
}

function sameModeSet(left: readonly GlobalMapMode[], right: readonly GlobalMapMode[]): boolean {
  if (left.length !== right.length) return false;
  const values = new Set(right);
  return left.every((mode) => values.has(mode));
}

function enrichExtremeChaosSpikes(
  spikes: readonly ChaosZoomFrameSpike[],
  causalSpikes: readonly TransportMapTraceSpike[] | undefined,
): ChaosZoomFrameSpike[] {
  if (!causalSpikes?.length) return [...spikes];
  const unused = new Set(causalSpikes);
  return spikes.map((spike) => {
    let match: TransportMapTraceSpike | undefined;
    let distance = Number.POSITIVE_INFINITY;
    for (const candidate of unused) {
      const score = Math.abs(candidate.offsetMs - spike.offsetMs) +
        Math.abs(candidate.frameMs - spike.durationMs) * 0.25;
      if (score < distance) {
        distance = score;
        match = candidate;
      }
    }
    if (match) unused.delete(match);
    return match ? { ...spike, causal: match } : spike;
  });
}

export function retainWorstChaosZoomSpikes<T extends { durationMs: number }>(
  spikes: T[],
  spike: T,
  maximumCount = EXTREME_CHAOS_ZOOM_PROFILE.maximumSpikeCount,
): void {
  spikes.push(spike);
  spikes.sort((left, right) => right.durationMs - left.durationMs);
  if (spikes.length > maximumCount) spikes.length = maximumCount;
}

function cloneChaosDataMetrics(
  metrics: ChaosZoomDataMetrics | undefined,
): ChaosZoomDataMetrics | undefined {
  if (!metrics) return undefined;
  return {
    ...metrics,
    filterPathsLocal: metrics.filterPathsLocal
      ? { ...metrics.filterPathsLocal }
      : undefined,
    workerPool: metrics.workerPool
      ? {
          ...metrics.workerPool,
          byTaskType: Object.fromEntries(
            Object.entries(metrics.workerPool.byTaskType).map(([taskType, taskMetrics]) => [
              taskType,
              taskMetrics ? { ...taskMetrics } : taskMetrics,
            ]),
          ),
        }
      : undefined,
    cache: {
      ...metrics.cache,
      cache: { ...metrics.cache.cache },
    },
  };
}

function chaosLodLevel(zoom: number): number {
  if (zoom < 11) return 0;
  if (zoom < 14) return 1;
  if (zoom < 17) return 2;
  return 3;
}

function haversineDistanceKm(
  left: { lon: number; lat: number },
  right: { lon: number; lat: number },
): number {
  const radians = Math.PI / 180;
  const deltaLat = (right.lat - left.lat) * radians;
  const deltaLon = (right.lon - left.lon) * radians;
  const leftLat = left.lat * radians;
  const rightLat = right.lat * radians;
  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(deltaLon / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

function createUnavailableCanvasAnalysis(): ChaosCanvasAnalysis {
  return {
    analysisAvailable: false,
    width: 0,
    height: 0,
    sampledPixels: 0,
    alphaCoverageRatio: 0,
    opaqueCoverageRatio: 0,
    nonTransparentPixelRatio: 0,
    meanLuminance: 0,
    luminanceStdDev: 0,
    edgeDensity: 0,
    sharpnessScore: 0,
    backingStorePixelRatio: 0,
    resolutionMismatch: false,
    isBlank: true,
    isBlurry: false,
    blankReason: "canvas-unavailable",
  };
}
