import { computed, onBeforeUnmount, watch } from "vue";
import type { GlobalMapLine, GlobalMapMode } from "../transport-map/contracts/manifest";
import type {
  TransportMapRenderScene,
  TransportMapRendererMetrics,
} from "../transport-map/contracts/renderer";
import type { CameraState } from "../transport-map/geo/camera";
import type { TransportMapPerformanceReport } from "../transport-map/performance/transportMapPerformance";
import type { TransportMapPerformanceTrace } from "../transport-map/performance/transportMapPerformanceTrace";
import type { SelectedLineBasemapCoverDebugMetrics } from "../transport-map/basemap/selectedLineBasemapCover";
import type { GlobalTransportPerformanceController } from "./useGlobalTransportPerformance";
import { useChaosZoom, type ChaosZoomBasemapCoverage } from "./useChaosZoom";
import {
  useSelectedLineZoomScenario,
  type SelectedLineZoomGhostState,
  type SelectedLineZoomScenarioConfig,
  type SelectedLineZoomRuntimeState,
} from "./useSelectedLineZoomScenario";
import type {
  SelectedLineZoomGestureConfig,
  SelectedLineZoomMode,
  SelectedLineZoomScenarioReport,
  SelectedLineZoomStatus,
  TransportMapBasemapDebugMetrics,
} from "./selectedLineZoomScenario";

export const DEFAULT_SELECTED_LINE_ZOOM_TARGET = "line:IDFM:C01384";

export interface GlobalTransportPerformanceScenarioConfig {
  extremeChaosEnabled: boolean;
  selectedLineWheelEnabled: boolean;
  selectedLineZoomTarget: string;
  selectedLineZoomMode: SelectedLineZoomMode;
  selectedLineWheelCoverageDelayMs: number;
  selectedLineZoomRequestedCycles: number;
  selectedLineZoomGesture?: SelectedLineZoomGestureConfig;
  selectedLineZoomLowPauseMs: number;
  selectedLineCoverOverride?: boolean;
}

export interface UseGlobalTransportPerformanceScenarioConfigOptions {
  getQuery: () => Record<string, unknown>;
  isDebugPerformanceEnabled: () => boolean;
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string"
    ? value
    : Array.isArray(value) && typeof value[0] === "string"
      ? value[0]
      : undefined;
}

export function parseGlobalTransportPerformanceScenarioConfig(
  query: Record<string, unknown>,
  debugPerformanceEnabled: boolean,
): GlobalTransportPerformanceScenarioConfig {
  const extremeChaosEnabled =
    debugPerformanceEnabled && queryString(query.mapPerfScenario) === "chaos-zoom-extreme";
  const selectedLineWheelEnabled =
    debugPerformanceEnabled && queryString(query.mapPerfScenario) === "selected-line-wheel";
  const selectedLineZoomMode: SelectedLineZoomMode =
    queryString(query.mapPerfMode) === "coverage" ? "coverage" : "performance";
  const selectedLineWheelCoverageDelayMs = (() => {
    if (!selectedLineWheelEnabled || selectedLineZoomMode !== "coverage") return 0;
    const requested = Number(queryString(query.mapTileDebugDelayMs) ?? 150);
    return Number.isFinite(requested) ? Math.max(0, Math.min(1_000, Math.floor(requested))) : 150;
  })();
  const defaultCycles = selectedLineZoomMode === "coverage" ? 3 : 6;
  const selectedLineZoomRequestedCycles = (() => {
    if (!selectedLineWheelEnabled) return defaultCycles;
    const requested = Number(queryString(query.mapPerfCycles));
    return Number.isFinite(requested)
      ? Math.max(1, Math.min(20, Math.floor(requested)))
      : defaultCycles;
  })();
  const selectedLineZoomGesture = (() => {
    if (!selectedLineWheelEnabled) return undefined;
    const range = queryString(query.mapPerfRange)
      ?.split(":")
      .map((value) => Number(value));
    if (!range || range.length !== 2 || !range.every(Number.isFinite)) return undefined;
    const [startZoom, endZoom] = range;
    const eventCount = Number(queryString(query.mapPerfEvents));
    const durationMs = Number(queryString(query.mapPerfDurationMs));
    if (
      startZoom === undefined ||
      endZoom === undefined ||
      !Number.isFinite(startZoom) ||
      !Number.isFinite(endZoom) ||
      startZoom <= endZoom ||
      !Number.isFinite(eventCount) ||
      eventCount < 1 ||
      eventCount > 100 ||
      !Number.isInteger(eventCount) ||
      !Number.isFinite(durationMs) ||
      durationMs < 100 ||
      durationMs > 10_000
    ) {
      return undefined;
    }
    return { startZoom, endZoom, eventCount, durationMs };
  })();
  const selectedLineZoomLowPauseMs = (() => {
    if (!selectedLineWheelEnabled) return 0;
    const requested = Number(queryString(query.mapPerfPauseAtLowMs));
    return Number.isFinite(requested) ? Math.max(0, Math.min(5_000, Math.floor(requested))) : 0;
  })();
  const selectedLineCoverOverride = (() => {
    if (!debugPerformanceEnabled) return undefined;
    const value = queryString(query.mapLineCover);
    if (value === "0") return false;
    if (value === "1") return true;
    return undefined;
  })();

  return {
    extremeChaosEnabled,
    selectedLineWheelEnabled,
    selectedLineZoomTarget: queryString(query.line) ?? DEFAULT_SELECTED_LINE_ZOOM_TARGET,
    selectedLineZoomMode,
    selectedLineWheelCoverageDelayMs,
    selectedLineZoomRequestedCycles,
    selectedLineZoomGesture,
    selectedLineZoomLowPauseMs,
    selectedLineCoverOverride,
  };
}

export function useGlobalTransportPerformanceScenarioConfig(
  options: UseGlobalTransportPerformanceScenarioConfigOptions,
) {
  const config = computed(() =>
    parseGlobalTransportPerformanceScenarioConfig(
      options.getQuery(),
      options.isDebugPerformanceEnabled(),
    ),
  );
  return {
    config,
    selectedLineWheelScenarioEnabled: computed(() => config.value.selectedLineWheelEnabled),
    selectedLineZoomTarget: computed(() => config.value.selectedLineZoomTarget),
    selectedLineZoomMode: computed(() => config.value.selectedLineZoomMode),
    selectedLineWheelCoverageDelayMs: computed(() => config.value.selectedLineWheelCoverageDelayMs),
    selectedLineZoomRequestedCycles: computed(() => config.value.selectedLineZoomRequestedCycles),
    selectedLineZoomGesture: computed(() => config.value.selectedLineZoomGesture),
    selectedLineZoomLowPauseMs: computed(() => config.value.selectedLineZoomLowPauseMs),
    selectedLineCoverOverride: computed(() => config.value.selectedLineCoverOverride),
  };
}

export interface GlobalTransportPerformanceScenarioPreparationPort {
  ensureSearchCatalog: () => Promise<void>;
  resolveLine14: () => GlobalMapLine | undefined;
  cancelInteractions: () => void;
  ensureModeVisible: (mode: GlobalMapMode) => void;
  resetTransientState: () => void;
  selectLine: (lineId: string) => void;
  clearActiveStation: () => void;
  zoomToLine: (lineId: string) => void;
  syncUrl: () => void;
  draw: () => void;
  refreshViewport: () => Promise<void>;
  cancelScheduledViewportRefresh: () => void;
  prepareExtremeState?: () => Promise<{
    availableModes: GlobalMapMode[];
    activeModes: GlobalMapMode[];
  }>;
  ensureExtremeFullNetworkState?: () => void;
  restoreExtremeState?: () => Promise<void> | void;
}

export interface GlobalTransportPerformanceScenarioRuntimePort {
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
  getSelectedLineRuntimeState: () => SelectedLineZoomRuntimeState;
  getSelectedLineGhostState: () => SelectedLineZoomGhostState;
  isInteractionActive: () => boolean;
  isWheelScrolling: () => boolean;
  isRendererReady?: () => boolean;
  isNetworkReady?: () => boolean;
  isViewportPending?: () => boolean;
}

export interface GlobalTransportPerformanceScenarioCameraPort {
  applyCamera: (camera: CameraState, query?: boolean, refresh?: boolean, render?: boolean) => void;
  draw: () => void;
  drawNow: () => void;
  refreshViewport: () => Promise<void>;
  setInteractionActive: (active: boolean) => void;
}

export interface GlobalTransportPerformanceScenarioBasemapPort {
  beforeMeasure: () => Promise<void> | void;
  captureSnapshot: () => void;
  readCoverage: () => ChaosZoomBasemapCoverage | undefined;
  isBasemapReady: () => boolean;
  isBasemapSettled: () => boolean;
  isCoverEnabled: () => boolean;
  isCoverReady: () => boolean;
  areBridgeCoversReady: () => boolean;
  resetDiagnostics: () => void;
  getBasemapMetrics: () => TransportMapBasemapDebugMetrics | undefined;
  getCoverMetrics: () => SelectedLineBasemapCoverDebugMetrics | undefined;
}

export interface GlobalTransportPerformanceScenarioMetadataPort {
  getRoutePath: () => string;
  getExperience: () => string;
  getBasemap: () => string;
  getDataVersion: () => string | undefined;
  getRendererKind: () => string | undefined;
  getCamera: () => CameraState;
  getVisibleModes: () => readonly GlobalMapMode[];
  isTrafficEnabled: () => boolean;
  getChunkIds: () => readonly string[];
  getDataMetrics: () => {
    decodeTimeMs: number;
    workerTimeMs: number;
    workerCount: number;
  };
  getFullDataMetrics?: () => import("./useChaosZoom").ChaosZoomDataMetrics;
}

export interface UseGlobalTransportPerformanceScenariosOptions {
  getConfig: () => GlobalTransportPerformanceScenarioConfig;
  performance: {
    controller: GlobalTransportPerformanceController;
    getCacheMetrics: () => NonNullable<TransportMapPerformanceReport["cache"]>;
  };
  preparation: GlobalTransportPerformanceScenarioPreparationPort;
  runtime: GlobalTransportPerformanceScenarioRuntimePort;
  camera: GlobalTransportPerformanceScenarioCameraPort;
  basemap: GlobalTransportPerformanceScenarioBasemapPort;
  metadata: GlobalTransportPerformanceScenarioMetadataPort;
  trace?: TransportMapPerformanceTrace;
}

export function useGlobalTransportPerformanceScenarios(
  options: UseGlobalTransportPerformanceScenariosOptions,
) {
  let selectedLineZoomController: ReturnType<typeof useSelectedLineZoomScenario> | undefined;

  function getPerformanceMetadata(): Record<string, unknown> {
    return {
      route: options.metadata.getRoutePath(),
      experience: options.metadata.getExperience(),
      basemap: options.metadata.getBasemap(),
      dataVersion: options.metadata.getDataVersion(),
      renderer: options.metadata.getRendererKind(),
      camera: { ...options.metadata.getCamera() },
      visibleModes: [...options.metadata.getVisibleModes()],
      traffic: options.metadata.isTrafficEnabled(),
      chunks: [...options.metadata.getChunkIds()],
      data: { ...options.metadata.getDataMetrics() },
    };
  }

  async function prepareChaosZoomLine14(assertActive: () => void): Promise<GlobalMapLine> {
    await options.preparation.ensureSearchCatalog();
    const line = options.preparation.resolveLine14();
    if (!line) throw new Error("Ligne 14 introuvable dans le réseau chargé");
    assertActive();

    options.preparation.cancelInteractions();
    options.preparation.ensureModeVisible(line.mode);
    options.preparation.resetTransientState();
    options.preparation.selectLine(line.id);
    options.preparation.clearActiveStation();
    options.preparation.zoomToLine(line.id);
    options.preparation.syncUrl();
    options.preparation.draw();
    await options.preparation.refreshViewport();
    options.preparation.cancelScheduledViewportRefresh();
    assertActive();
    return line;
  }

  const chaosZoomController = useChaosZoom({
    minimumZoom: 12.1,
    maximumZoom: 16.7,
    isMounted: options.runtime.isMounted,
    getCanvas: options.runtime.getCanvas,
    getCamera: options.runtime.getCamera,
    getRenderScene: options.runtime.getRenderScene,
    getRendererMetrics: options.runtime.getRendererMetrics,
    getRendererKind: options.runtime.getRendererKind,
    getActiveLineId: options.runtime.getActiveLineId,
    getDetailLineId: options.runtime.getDetailLineId,
    getAvailableModes: options.runtime.getAvailableModes,
    getActiveModes: options.runtime.getActiveModes,
    isScrolling: options.runtime.isScrolling,
    applyCamera: options.camera.applyCamera,
    draw: options.camera.draw,
    refreshViewport: options.camera.refreshViewport,
    prepareLine14: prepareChaosZoomLine14,
    cancelInteractions: options.preparation.cancelInteractions,
    setInteractionActive: options.camera.setInteractionActive,
    beforeRun: () => {
      selectedLineZoomController?.invalidate();
    },
    beforeMeasure: options.basemap.beforeMeasure,
    captureBasemapSnapshot: options.basemap.captureSnapshot,
    readBasemapCoverage: options.basemap.readCoverage,
    performanceMetadata: getPerformanceMetadata,
    prepareExtreme: options.preparation.prepareExtremeState,
    ensureExtremeFullNetworkState: options.preparation.ensureExtremeFullNetworkState,
    restoreExtreme: options.preparation.restoreExtremeState,
    getChunkIds: options.metadata.getChunkIds,
    getDataMetrics: options.metadata.getFullDataMetrics,
    isViewportPending: options.runtime.isViewportPending,
    performanceTrace: options.trace,
  });

  selectedLineZoomController = useSelectedLineZoomScenario({
    isMounted: options.runtime.isMounted,
    isEnabled: () => options.getConfig().selectedLineWheelEnabled,
    getConfig: (): SelectedLineZoomScenarioConfig => {
      const config = options.getConfig();
      return {
        lineId: config.selectedLineZoomTarget,
        mode: config.selectedLineZoomMode,
        cycles: config.selectedLineZoomRequestedCycles,
        gesture: config.selectedLineZoomGesture,
        lowPauseMs: config.selectedLineZoomLowPauseMs,
        coverageDelayMs: config.selectedLineWheelCoverageDelayMs,
      };
    },
    getRuntimeState: options.runtime.getSelectedLineRuntimeState,
    getCamera: options.runtime.getCamera,
    getCanvas: options.runtime.getCanvas,
    getRendererMetrics: options.runtime.getRendererMetrics,
    isInteractionActive: options.runtime.isInteractionActive,
    isScrolling: options.runtime.isScrolling,
    isWheelScrolling: options.runtime.isWheelScrolling,
    getPhase: () => selectedLineZoomController?.phase.value ?? "idle",
    getGhostState: options.runtime.getSelectedLineGhostState,
    applyCamera: options.camera.applyCamera,
    draw: options.camera.draw,
    drawNow: options.camera.drawNow,
    refreshViewport: options.camera.refreshViewport,
    cancelInteractions: options.preparation.cancelInteractions,
    setInteractionActive: options.camera.setInteractionActive,
    isChaosRunning: () => chaosZoomController.running.value,
    isBasemapReady: options.basemap.isBasemapReady,
    isBasemapSettled: options.basemap.isBasemapSettled,
    isCoverEnabled: options.basemap.isCoverEnabled,
    isCoverReady: options.basemap.isCoverReady,
    areBridgeCoversReady: options.basemap.areBridgeCoversReady,
    readBasemapCoverage: options.basemap.readCoverage,
    resetDiagnostics: options.basemap.resetDiagnostics,
    startPerformanceMeasure: options.performance.controller.startDebugPerformance,
    stopPerformanceMeasure: options.performance.controller.stopDebugPerformance,
    getBasemapMetrics: options.basemap.getBasemapMetrics,
    getCoverMetrics: options.basemap.getCoverMetrics,
    performanceMetadata: getPerformanceMetadata,
  });

  const selectedLineWheelScenarioEnabled = computed(
    () => options.getConfig().selectedLineWheelEnabled,
  );
  const selectedLineWheelCoverageDelayMs = computed(
    () => options.getConfig().selectedLineWheelCoverageDelayMs,
  );
  const selectedLineCoverOverride = computed(() => options.getConfig().selectedLineCoverOverride);
  const selectedLineZoomStatus = computed<SelectedLineZoomStatus>(
    () => selectedLineZoomController?.status.value ?? "idle",
  );
  const selectedLineZoomReport = computed<SelectedLineZoomScenarioReport | undefined>(
    () => selectedLineZoomController?.report.value,
  );
  const selectedLineZoomPhase = computed(() => selectedLineZoomController?.phase.value ?? "idle");
  const selectedLineZoomReportJson = computed(() =>
    JSON.stringify(
      selectedLineZoomReport.value ?? { status: selectedLineZoomStatus.value },
      null,
      2,
    ),
  );

  function scheduleSelectedLineZoomScenario(): void {
    if (!options.runtime.isMounted() || !options.getConfig().selectedLineWheelEnabled) return;
    selectedLineZoomController?.schedule();
  }

  let extremeAutoStarted = false;
  function scheduleExtremeChaosZoomScenario(): void {
    if (
      extremeAutoStarted ||
      !options.runtime.isMounted() ||
      !options.getConfig().extremeChaosEnabled ||
      options.runtime.isNetworkReady?.() === false ||
      options.runtime.isRendererReady?.() === false
    ) return;
    extremeAutoStarted = true;
    void chaosZoomController.runChaosZoomExtreme();
  }

  function recordFrame(metrics: TransportMapRendererMetrics): void {
    const interactive = options.runtime.isInteractionActive();
    const chaosRunning = chaosZoomController.running.value;
    options.performance.controller.recordPresentedFrame(interactive);
    options.performance.controller.recordRendererMetrics(metrics);
    options.performance.controller.recordCacheMetricsIfDue(chaosRunning);
    chaosZoomController.recordPresentedFrame(interactive);
    if (chaosRunning) {
      chaosZoomController.recordRendererMetrics(metrics);
      chaosZoomController.recordCacheMetrics(options.performance.getCacheMetrics());
    }
    selectedLineZoomController?.recordFrame(metrics);
  }

  function recordTiming(kind: "decode" | "worker" | "hitTest", durationMs: number): void {
    options.performance.controller.recordTiming(kind, durationMs);
    chaosZoomController.recordTiming(kind, durationMs);
  }

  function dispose(): void {
    selectedLineZoomController?.dispose();
    chaosZoomController.dispose();
  }

  watch(
    [() => options.getConfig().selectedLineWheelEnabled, options.runtime.getActiveLineId],
    () => {
      if (options.getConfig().selectedLineWheelEnabled) scheduleSelectedLineZoomScenario();
    },
    { flush: "post" },
  );
  watch(
    [
      () => options.getConfig().extremeChaosEnabled,
      () => options.runtime.isNetworkReady?.() ?? true,
      () => options.runtime.isRendererReady?.() ?? true,
    ],
    () => scheduleExtremeChaosZoomScenario(),
    { flush: "post" },
  );
  onBeforeUnmount(dispose);

  return {
    selectedLineWheelScenarioEnabled,
    selectedLineWheelCoverageDelayMs,
    selectedLineCoverOverride,
    selectedLineZoomStatus,
    selectedLineZoomReport,
    selectedLineZoomPhase,
    selectedLineZoomReportJson,
    chaosZoomRunning: chaosZoomController.running,
    chaosZoomProgress: chaosZoomController.progress,
    chaosZoomTotal: chaosZoomController.total,
    chaosZoomActiveProfile: chaosZoomController.activeProfile,
    chaosZoomPhase: chaosZoomController.phase,
    chaosZoomReport: chaosZoomController.report,
    chaosZoomReportJson: chaosZoomController.reportJson,
    downloadChaosZoomReport: chaosZoomController.downloadChaosZoomReport,
    runChaosZoom: chaosZoomController.runChaosZoom,
    runChaosZoomExtreme: chaosZoomController.runChaosZoomExtreme,
    scheduleExtremeChaosZoomScenario,
    scheduleSelectedLineZoomScenario,
    prepareChaosZoomLine14,
    recordFrame,
    recordTiming,
    getPerformanceMetadata,
    dispose,
  };
}
