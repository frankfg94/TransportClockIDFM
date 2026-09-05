import type { CameraState } from "../transport-map/geo/camera";
import type {
  TransportMapRenderScene,
  TransportMapRendererMetrics,
} from "../transport-map/contracts/renderer";
import type { SelectedLineBasemapCoverDebugMetrics } from "../transport-map/basemap/selectedLineBasemapCover";
import type { BasemapCoverageResult } from "../transport-map/performance/basemapCoverage";
import type {
  TransportMapPerformanceReport,
} from "../transport-map/performance/transportMapPerformance";

export interface TransportMapBasemapDebugMetrics {
  desiredDefinitionChanges: number;
  committedDefinitionChanges: number;
  supersededDefinitions: number;
  commitsBeforeReady: number;
  visibleTileErrors: number;
  maxMountedTiles: number;
  committedSignature?: string;
  fallbackSignature?: string;
  pendingSignature?: string;
  committedSourceZoom?: number;
  fallbackSourceZoom?: number;
  fallbackTiles: number;
  pendingRequiredTiles: number;
  pendingDecodedRequiredTiles: number;
}

export type SelectedLineZoomMode = "performance" | "coverage";
export type SelectedLineZoomStatus = "idle" | "running" | "passed" | "failed" | "invalid";

export interface SelectedLineZoomGestureConfig {
  startZoom: number;
  endZoom: number;
  eventCount: number;
  durationMs: number;
}

export interface SelectedLineZoomScenarioFrameState {
  activeLineFrames: number;
  interactivePresentedFrames: number;
  interactivePathCacheCaptureCount: number;
  interactivePathCacheCapturedBytes: number;
  scenePathCountMin: number;
  sceneStationCountMin: number;
  inputEvents: number;
  minObservedZoom: number;
  maxObservedZoom: number;
  coverageSamples: BasemapCoverageResult[];
  combinedCoverageSamples: BasemapCoverageResult[];
  coverageGapFrames: number;
  combinedCoverageGapFrames: number;
  coverContributionFrames: number;
  minimumCoverageRatio: number;
  minimumCombinedCoverageRatio: number;
  coverReadyBeforeGesture: boolean;
  previousInteractiveFrameAtMs?: number;
  slowFrames: Array<{
    frame: number;
    durationMs: number;
    phase: string;
    zoom: number;
    wheelScrolling: boolean;
  }>;
  firstCoverageGap?: {
    zoom: number;
    signature?: string;
  };
  firstCombinedCoverageGap?: {
    zoom: number;
    liveSignature?: string;
    coverSignature?: string;
  };
}

export interface SelectedLineZoomScenarioReport {
  status: SelectedLineZoomStatus;
  scenario: {
    name: "selected-line-wheel";
    lineId: string;
    inputEvents: number;
    cycles: number;
    viewportWidth: number;
    viewportHeight: number;
    pixelRatio: number;
    initialCamera: CameraState;
    finalCamera: CameraState;
    minObservedZoom: number;
    maxObservedZoom: number;
    activeLineFrames: number;
    interactivePresentedFrames: number;
    scenePathCountMin: number;
    sceneStationCountMin: number;
    expectedGhostLineCount: number;
    renderableGhostLineCount: number;
    renderedGhostLineCount: number;
    missingGhostLineIds: string[];
    wheelEventsPerSecond?: number;
    zoomUnitsPerSecond?: number;
    framesOver20Ms: number;
    maximumFrameTimeMs: number;
    slowFrames: SelectedLineZoomScenarioFrameState["slowFrames"];
    sceneFingerprint: string;
    gesture?: SelectedLineZoomGestureConfig;
  };
  coverage?: {
    samples: BasemapCoverageResult[];
    combinedSamples: BasemapCoverageResult[];
    liveCoverageGapFrames: number;
    combinedCoverageGapFrames: number;
    coverContributionFrames: number;
    minimumLiveCoverageRatio: number;
    minimumCombinedCoverageRatio: number;
    coverReadyBeforeGesture: boolean;
    coverageGapFrames: number;
    minimumCoverageRatio: number;
    artificialReadinessDelayMs: number;
    firstGap?: SelectedLineZoomScenarioFrameState["firstCoverageGap"];
    firstCombinedGap?: SelectedLineZoomScenarioFrameState["firstCombinedCoverageGap"];
  };
  basemap?: TransportMapBasemapDebugMetrics;
  cover?: SelectedLineBasemapCoverDebugMetrics;
  performance?: TransportMapPerformanceReport;
  error?: string;
}

export interface BuildSelectedLineZoomReportOptions {
  status: SelectedLineZoomStatus;
  mode: SelectedLineZoomMode;
  lineId: string;
  cycles: number;
  coverageDelayMs: number;
  initialCamera: CameraState;
  finalCamera: CameraState;
  initialPathIds: readonly string[];
  initialStationIds: readonly string[];
  activeLineId?: string;
  expectedGhostLineCount: number;
  renderableGhostLineCount: number;
  renderedGhostLineCount: number;
  missingGhostLineIds: readonly string[];
  gesture?: SelectedLineZoomGestureConfig;
  frame?: SelectedLineZoomScenarioFrameState;
  basemap?: TransportMapBasemapDebugMetrics;
  cover?: SelectedLineBasemapCoverDebugMetrics;
  performance?: TransportMapPerformanceReport;
  error?: string;
}

export function createSelectedLineZoomFrameState(initialZoom: number): SelectedLineZoomScenarioFrameState {
  return {
    activeLineFrames: 0,
    interactivePresentedFrames: 0,
    interactivePathCacheCaptureCount: 0,
    interactivePathCacheCapturedBytes: 0,
    scenePathCountMin: Number.POSITIVE_INFINITY,
    sceneStationCountMin: Number.POSITIVE_INFINITY,
    inputEvents: 0,
    minObservedZoom: initialZoom,
    maxObservedZoom: initialZoom,
    coverageSamples: [],
    combinedCoverageSamples: [],
    coverageGapFrames: 0,
    combinedCoverageGapFrames: 0,
    coverContributionFrames: 0,
    minimumCoverageRatio: 1,
    minimumCombinedCoverageRatio: 1,
    coverReadyBeforeGesture: false,
    slowFrames: [],
  };
}

export function roundSelectedLineZoom(value: number): number {
  return Number(value.toFixed(4));
}

export function selectedLineZoomFingerprint(
  activeLineId: string | undefined,
  pathIds: readonly string[],
  stationIds: readonly string[],
  initialCamera: Pick<CameraState, "viewportWidthCssPx" | "viewportHeightCssPx" | "pixelRatio">,
): string {
  return JSON.stringify({
    activeLineId,
    pathIds: [...pathIds].sort(),
    stationIds: [...stationIds].sort(),
    viewportWidth: initialCamera.viewportWidthCssPx,
    viewportHeight: initialCamera.viewportHeightCssPx,
    pixelRatio: initialCamera.pixelRatio,
  });
}

export function selectedLineZoomIdsMatch(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((id, index) => id === sortedRight[index]);
}

export function buildSelectedLineZoomReport(
  options: BuildSelectedLineZoomReportOptions,
): SelectedLineZoomScenarioReport {
  const frame = options.frame;
  const initialZoom = options.initialCamera.zoom;
  const scenePathCountMin = frame && Number.isFinite(frame.scenePathCountMin)
    ? frame.scenePathCountMin
    : 0;
  const sceneStationCountMin = frame && Number.isFinite(frame.sceneStationCountMin)
    ? frame.sceneStationCountMin
    : 0;
  const report: SelectedLineZoomScenarioReport = {
    status: options.status,
    scenario: {
      name: "selected-line-wheel",
      lineId: options.lineId,
      inputEvents: frame?.inputEvents ?? 0,
      cycles: options.cycles,
      viewportWidth: options.initialCamera.viewportWidthCssPx,
      viewportHeight: options.initialCamera.viewportHeightCssPx,
      pixelRatio: options.initialCamera.pixelRatio,
      initialCamera: { ...options.initialCamera },
      finalCamera: { ...options.finalCamera },
      minObservedZoom: frame?.minObservedZoom ?? initialZoom,
      maxObservedZoom: frame?.maxObservedZoom ?? initialZoom,
      activeLineFrames: frame?.activeLineFrames ?? 0,
      interactivePresentedFrames: frame?.interactivePresentedFrames ?? 0,
      scenePathCountMin,
      sceneStationCountMin,
      expectedGhostLineCount: options.expectedGhostLineCount,
      renderableGhostLineCount: options.renderableGhostLineCount,
      renderedGhostLineCount: options.renderedGhostLineCount,
      missingGhostLineIds: [...options.missingGhostLineIds],
      wheelEventsPerSecond: options.gesture
        ? roundSelectedLineZoom((options.gesture.eventCount * 1_000) / options.gesture.durationMs)
        : undefined,
      zoomUnitsPerSecond: options.gesture
        ? roundSelectedLineZoom(
            ((options.gesture.startZoom - options.gesture.endZoom) * 1_000) /
              options.gesture.durationMs,
          )
        : undefined,
      framesOver20Ms: frame?.slowFrames.length ?? 0,
      maximumFrameTimeMs: frame?.slowFrames.reduce(
        (maximum, sample) => Math.max(maximum, sample.durationMs),
        0,
      ) ?? 0,
      slowFrames: [...(frame?.slowFrames ?? [])],
      sceneFingerprint: selectedLineZoomFingerprint(
        options.activeLineId,
        options.initialPathIds,
        options.initialStationIds,
        options.initialCamera,
      ),
      gesture: options.gesture,
    },
    basemap: options.basemap,
    cover: options.cover,
    performance: options.performance,
    error: options.error,
  };

  if (options.mode === "coverage") {
    report.coverage = {
      samples: frame?.coverageSamples ?? [],
      combinedSamples: frame?.combinedCoverageSamples ?? [],
      liveCoverageGapFrames: frame?.coverageGapFrames ?? 0,
      combinedCoverageGapFrames: frame?.combinedCoverageGapFrames ?? 0,
      coverContributionFrames: frame?.coverContributionFrames ?? 0,
      minimumLiveCoverageRatio: frame?.minimumCoverageRatio ?? 0,
      minimumCombinedCoverageRatio: frame?.minimumCombinedCoverageRatio ?? 0,
      coverReadyBeforeGesture: frame?.coverReadyBeforeGesture ?? false,
      coverageGapFrames: frame?.coverageGapFrames ?? 0,
      minimumCoverageRatio: frame?.minimumCoverageRatio ?? 0,
      artificialReadinessDelayMs: options.coverageDelayMs,
      firstGap: frame?.firstCoverageGap,
      firstCombinedGap: frame?.firstCombinedCoverageGap,
    };
  }
  return report;
}

export function sceneFingerprint(scene: TransportMapRenderScene): string {
  return JSON.stringify({
    lineId: scene.activeLineId,
    pathIds: scene.paths.map((path) => path.id).sort(),
    stationIds: scene.stations.map((station) => station.id).sort(),
    ghostLineIds: [...(scene.ghostLineIds ?? [])].sort(),
    interruptionLineIds: [...(scene.interruptionLineIds ?? [])].sort(),
    disturbanceLineIds: [...(scene.disturbanceLineIds ?? [])].sort(),
    trafficPathSpans: (scene.trafficPathSpans ?? []).map((span) => [
      span.pathId,
      span.startVertexIndex,
      span.endVertexIndex,
      span.kind,
    ]),
  });
}

export function recordSelectedLineZoomFrame(
  frame: SelectedLineZoomScenarioFrameState,
  metrics: TransportMapRendererMetrics,
  state: {
    interactionActive: boolean;
    phase: string;
    zoom: number;
    wheelScrolling: boolean;
    scene: TransportMapRenderScene;
    coverage?: {
      live: BasemapCoverageResult;
      combined: BasemapCoverageResult;
      liveSignature?: string;
      coverSignature?: string;
    };
  },
  now = typeof performance === "undefined" ? Date.now() : performance.now(),
): void {
  if (!state.interactionActive) {
    frame.previousInteractiveFrameAtMs = undefined;
    return;
  }

  if (frame.previousInteractiveFrameAtMs !== undefined) {
    const durationMs = now - frame.previousInteractiveFrameAtMs;
    if (durationMs > 20 && frame.slowFrames.length < 64) {
      frame.slowFrames.push({
        frame: frame.interactivePresentedFrames + 1,
        durationMs: roundSelectedLineZoom(durationMs),
        phase: state.phase,
        zoom: roundSelectedLineZoom(state.zoom),
        wheelScrolling: state.wheelScrolling,
      });
    }
  }
  frame.previousInteractiveFrameAtMs = now;
  frame.interactivePresentedFrames += 1;
  if (metrics.focusedLineLiveRedraw) frame.activeLineFrames += 1;
  frame.interactivePathCacheCaptureCount += metrics.pathCacheCaptureCount;
  frame.interactivePathCacheCapturedBytes += metrics.pathCacheCapturedBytes;
  frame.scenePathCountMin = Math.min(frame.scenePathCountMin, state.scene.paths.length);
  frame.sceneStationCountMin = Math.min(frame.sceneStationCountMin, state.scene.stations.length);
  frame.minObservedZoom = Math.min(frame.minObservedZoom, state.zoom);
  frame.maxObservedZoom = Math.max(frame.maxObservedZoom, state.zoom);

  if (!state.coverage) return;
  frame.coverageSamples.push(state.coverage.live);
  frame.combinedCoverageSamples.push(state.coverage.combined);
  frame.minimumCoverageRatio = Math.min(frame.minimumCoverageRatio, state.coverage.live.coverageRatio);
  frame.minimumCombinedCoverageRatio = Math.min(
    frame.minimumCombinedCoverageRatio,
    state.coverage.combined.coverageRatio,
  );
  if (state.coverage.live.hasGap) {
    frame.coverageGapFrames += 1;
    frame.firstCoverageGap ??= {
      zoom: state.zoom,
      signature: state.coverage.liveSignature,
    };
  }
  if (state.coverage.combined.hasGap) {
    frame.combinedCoverageGapFrames += 1;
    frame.firstCombinedCoverageGap ??= {
      zoom: state.zoom,
      liveSignature: state.coverage.liveSignature,
      coverSignature: state.coverage.coverSignature,
    };
  }
  if (state.coverage.live.hasGap && !state.coverage.combined.hasGap) {
    frame.coverContributionFrames += 1;
  }
}
