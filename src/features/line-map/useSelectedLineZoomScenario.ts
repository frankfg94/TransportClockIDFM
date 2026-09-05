import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../transport-map/config/globalTransportPlanConfig";
import {
  zoomCameraAroundScreenPoint,
  type CameraState,
} from "../transport-map/geo/camera";
import type { ScreenPoint } from "../transport-map/geo/coordinateKernel";
import type {
  TransportMapRenderScene,
  TransportMapRendererMetrics,
} from "../transport-map/contracts/renderer";
import type { BasemapCoverageResult } from "../transport-map/performance/basemapCoverage";
import type {
  TransportMapPerformanceProbe,
  TransportMapPerformanceReport,
} from "../transport-map/performance/transportMapPerformance";
import type { SelectedLineBasemapCoverDebugMetrics } from "../transport-map/basemap/selectedLineBasemapCover";
import type { ChaosZoomBasemapCoverage } from "./useChaosZoom";
import {
  buildSelectedLineZoomReport,
  createSelectedLineZoomFrameState,
  recordSelectedLineZoomFrame,
  sceneFingerprint,
  selectedLineZoomIdsMatch,
  type SelectedLineZoomGestureConfig,
  type SelectedLineZoomScenarioFrameState,
  type SelectedLineZoomScenarioReport,
  type SelectedLineZoomStatus,
  type SelectedLineZoomMode,
  type TransportMapBasemapDebugMetrics,
} from "./selectedLineZoomScenario";

export interface SelectedLineZoomScenarioConfig {
  lineId: string;
  mode: SelectedLineZoomMode;
  cycles: number;
  gesture?: SelectedLineZoomGestureConfig;
  lowPauseMs: number;
  coverageDelayMs: number;
}

export interface SelectedLineZoomRuntimeState {
  scene: TransportMapRenderScene;
  activeLineId?: string;
  stationConnectionRequestsPending: number;
  viewportPending: boolean;
  loading: boolean;
  trafficLoading: boolean;
  ghostSceneComplete: boolean;
}

export interface SelectedLineZoomGhostState {
  expected: number;
  renderable: number;
  rendered: number;
  missing: readonly string[];
}

export interface UseSelectedLineZoomScenarioOptions {
  isMounted: () => boolean;
  isEnabled: () => boolean;
  getConfig: () => SelectedLineZoomScenarioConfig;
  getRuntimeState: () => SelectedLineZoomRuntimeState;
  getCamera: () => CameraState;
  getCanvas: () => HTMLCanvasElement | undefined;
  getRendererMetrics: () => TransportMapRendererMetrics | undefined;
  isInteractionActive?: () => boolean;
  isScrolling: () => boolean;
  isWheelScrolling: () => boolean;
  getPhase: () => string;
  getGhostState: () => SelectedLineZoomGhostState;
  applyCamera: (camera: CameraState, query?: boolean, refresh?: boolean, render?: boolean) => void;
  draw: () => void;
  drawNow: () => void;
  refreshViewport: () => Promise<void>;
  cancelInteractions: () => void;
  setInteractionActive: (active: boolean) => void;
  isChaosRunning: () => boolean;
  isBasemapReady: () => boolean;
  isBasemapSettled: () => boolean;
  isCoverEnabled: () => boolean;
  isCoverReady: () => boolean;
  areBridgeCoversReady: () => boolean;
  readBasemapCoverage?: () => ChaosZoomBasemapCoverage | undefined;
  resetDiagnostics: () => void;
  startPerformanceMeasure?: () => void;
  stopPerformanceMeasure?: () => TransportMapPerformanceReport | undefined;
  getBasemapMetrics?: () => TransportMapBasemapDebugMetrics | undefined;
  getCoverMetrics?: () => SelectedLineBasemapCoverDebugMetrics | undefined;
  performanceMetadata?: () => Record<string, unknown>;
  publishReport?: (report: SelectedLineZoomScenarioReport) => void;
}

export function useSelectedLineZoomScenario(options: UseSelectedLineZoomScenarioOptions) {
  const status = ref<SelectedLineZoomStatus>("idle");
  const phase = ref("idle");
  const report = shallowRef<SelectedLineZoomScenarioReport>();
  let frameState: SelectedLineZoomScenarioFrameState | undefined;
  let scenarioPromise: Promise<void> | undefined;
  let scenarioToken = 0;

  function publish(nextReport: SelectedLineZoomScenarioReport): void {
    report.value = nextReport;
    options.publishReport?.(nextReport);
    if (typeof window !== "undefined") {
      const debugWindow = window as Window & {
        __transportMapSelectedLineZoomReport?: SelectedLineZoomScenarioReport;
      };
      debugWindow.__transportMapSelectedLineZoomReport = nextReport;
    }
  }

  function getConfig(): SelectedLineZoomScenarioConfig {
    const config = options.getConfig();
    return {
      ...config,
      cycles: Math.max(1, Math.floor(config.cycles)),
      lowPauseMs: Math.max(0, config.lowPauseMs),
      coverageDelayMs: Math.max(0, config.coverageDelayMs),
    };
  }

  function assertActive(token: number): void {
    if (!options.isMounted() || token !== scenarioToken) {
      throw new Error("Scénario selected-line-wheel interrompu avant sa fin");
    }
  }

  async function waitForCondition(
    token: number,
    condition: () => boolean,
    label: string,
    timeoutMs = 30_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      assertActive(token);
      if (condition()) return;
      if (Date.now() >= deadline) throw new Error(`Timeout en attendant ${label}`);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
    }
  }

  async function waitForFrames(token: number, count = 2): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      assertActive(token);
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === "undefined") window.setTimeout(resolve, 16);
        else requestAnimationFrame(() => resolve());
      });
    }
  }

  async function waitForSceneStable(token: number): Promise<void> {
    const deadline = Date.now() + 15_000;
    let previousFingerprint = "";
    let stableSince = 0;
    while (true) {
      assertActive(token);
      if (Date.now() >= deadline) throw new Error("Timeout en attendant une scène de ligne stable");
      const runtime = options.getRuntimeState();
      const fingerprint = sceneFingerprint(runtime.scene);
      if (
        runtime.activeLineId === getConfig().lineId &&
        runtime.scene.paths.length > 0 &&
        runtime.scene.stations.length > 0
      ) {
        if (fingerprint !== previousFingerprint) {
          previousFingerprint = fingerprint;
          stableSince = Date.now();
        } else if (Date.now() - stableSince >= 1_500) {
          return;
        }
      } else {
        previousFingerprint = "";
        stableSince = 0;
      }
      await waitForFrames(token, 1);
    }
  }

  async function waitUntilReady(token: number): Promise<void> {
    const config = getConfig();
    await waitForCondition(token, () => options.getRuntimeState().activeLineId === config.lineId, `la ligne active ${config.lineId}`);
    await waitForCondition(
      token,
      () => {
        const scene = options.getRuntimeState().scene;
        return scene.paths.length > 0 && scene.stations.length > 0;
      },
      "la scène path/station",
    );
    await waitForCondition(
      token,
      () => {
        const runtime = options.getRuntimeState();
        return runtime.stationConnectionRequestsPending === 0 &&
          !runtime.viewportPending &&
          !runtime.loading &&
          runtime.ghostSceneComplete;
      },
      "l'hydratation complète des correspondances et du viewport",
    );
    await waitForCondition(
      token,
      () => !options.getRuntimeState().trafficLoading,
      "la stabilisation du snapshot trafic",
    );
    await waitForSceneStable(token);
    await waitForCondition(token, options.isBasemapReady, "les tuiles visibles prêtes");
    if (options.isCoverEnabled()) {
      await waitForCondition(token, options.isCoverReady, "le cover borné de la ligne prêt");
      await waitForCondition(token, options.areBridgeCoversReady, "les covers intermédiaires de la ligne prêts");
    }
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    if (fonts?.ready) {
      await Promise.race([
        fonts.ready,
        new Promise<void>((resolve) => window.setTimeout(resolve, 5_000)),
      ]);
    }
    await waitForFrames(token, 2);
    await waitForSceneStable(token);
  }

  function wheelClientPoint(canvas: HTMLCanvasElement): ScreenPoint {
    const rect = canvas.getBoundingClientRect();
    const camera = options.getCamera();
    return {
      x: rect.left + (rect.width || camera.viewportWidthCssPx) / 2,
      y: rect.top + (rect.height || camera.viewportHeightCssPx) / 2,
    };
  }

  function dispatchWheel(token: number, deltaY: number, clientPoint: ScreenPoint): void {
    assertActive(token);
    const canvas = options.getCanvas();
    if (!canvas) throw new Error("Canvas absent pendant le scénario selected-line-wheel");
    canvas.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: clientPoint.x,
      clientY: clientPoint.y,
      deltaMode: 0,
      deltaY,
    }));
    if (frameState) frameState.inputEvents += 1;
  }

  async function positionStart(token: number, gesture: SelectedLineZoomGestureConfig): Promise<void> {
    assertActive(token);
    const camera = options.getCamera();
    if (Math.abs(camera.zoom - gesture.startZoom) <= 0.01) return;
    const point = {
      x: camera.viewportWidthCssPx / 2,
      y: camera.viewportHeightCssPx / 2,
    };
    options.setInteractionActive(false);
    options.applyCamera(
      zoomCameraAroundScreenPoint(
        camera,
        Math.max(
          GLOBAL_TRANSPORT_PLAN_CONFIG.camera.minZoom,
          Math.min(GLOBAL_TRANSPORT_PLAN_CONFIG.camera.maxZoom, gesture.startZoom),
        ),
        point,
      ),
      false,
      false,
      false,
    );
    options.draw();
    await options.refreshViewport();
    await waitForSceneStable(token);
    await waitForCondition(token, options.isBasemapSettled, "le zoom de départ prêt");
  }

  async function waitForSettle(token: number): Promise<void> {
    await waitForCondition(
      token,
      () => !options.isScrolling(),
      "le settle de la caméra",
      15_000,
    );
    await waitForFrames(token, 2);
  }

  async function runCycle(token: number, config: SelectedLineZoomScenarioConfig): Promise<void> {
    const gesture = config.gesture;
    const eventCount = gesture?.eventCount ?? 10;
    const eventIntervalMs = gesture ? gesture.durationMs / eventCount : 16;
    const deltaY = gesture
      ? (gesture.startZoom - gesture.endZoom) /
        (eventCount * GLOBAL_TRANSPORT_PLAN_CONFIG.camera.wheelZoomFactor)
      : 167;
    const canvas = options.getCanvas();
    if (!canvas) throw new Error("Canvas absent pendant le scénario selected-line-wheel");
    const zoomOutPoint = wheelClientPoint(canvas);
    for (let index = 0; index < eventCount; index += 1) {
      dispatchWheel(token, deltaY, zoomOutPoint);
      await new Promise<void>((resolve) => window.setTimeout(resolve, eventIntervalMs));
    }
    await waitForSettle(token);
    phase.value = "low-settled";
    if (config.lowPauseMs > 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, config.lowPauseMs));
      assertActive(token);
    }
    phase.value = "zoom-in";
    const zoomInPoint = wheelClientPoint(canvas);
    for (let index = 0; index < eventCount; index += 1) {
      dispatchWheel(token, -deltaY, zoomInPoint);
      await new Promise<void>((resolve) => window.setTimeout(resolve, eventIntervalMs));
    }
    await waitForSettle(token);
    phase.value = "high-settled";
  }

  function recordFrame(metrics: TransportMapRendererMetrics): void {
    if (!frameState) return;
    const coverage = getConfig().mode === "coverage" ? options.readBasemapCoverage?.() : undefined;
    recordSelectedLineZoomFrame(frameState, metrics, {
      interactionActive: options.isInteractionActive?.() ?? options.isScrolling(),
      phase: phase.value,
      zoom: options.getCamera().zoom,
      wheelScrolling: options.isWheelScrolling(),
      scene: options.getRuntimeState().scene,
      coverage: coverage
        ? {
            live: coverage.live,
            combined: coverage.combined,
            liveSignature: coverage.liveSignature,
            coverSignature: coverage.coverSignature,
          }
        : undefined,
    });
  }

  async function run(): Promise<void> {
    if (!options.isMounted() || !options.isEnabled() || scenarioPromise || options.isChaosRunning()) return;
    const config = getConfig();
    const token = ++scenarioToken;
    let initialCamera = { ...options.getCamera() };
    let finalCamera = { ...options.getCamera() };
    let initialPathIds: string[] = [];
    let initialStationIds: string[] = [];
    let performanceReport: TransportMapPerformanceReport | undefined;
    status.value = "running";
    phase.value = "preparing";
    const runningGhosts = options.getGhostState();
    publish(buildSelectedLineZoomReport({
      status: "running",
      mode: config.mode,
      lineId: config.lineId,
      cycles: config.cycles,
      coverageDelayMs: config.coverageDelayMs,
      initialCamera,
      finalCamera,
      initialPathIds,
      initialStationIds,
      activeLineId: options.getRuntimeState().activeLineId,
      expectedGhostLineCount: runningGhosts.expected,
      renderableGhostLineCount: runningGhosts.renderable,
      renderedGhostLineCount: runningGhosts.rendered,
      missingGhostLineIds: runningGhosts.missing,
      gesture: config.gesture,
    }));

    const runPromise = (async () => {
      try {
        await waitUntilReady(token);
        assertActive(token);
        if (config.gesture) await positionStart(token, config.gesture);
        initialCamera = { ...options.getCamera() };
        initialPathIds = options.getRuntimeState().scene.paths.map((path) => path.id).sort();
        initialStationIds = options.getRuntimeState().scene.stations.map((station) => station.id).sort();
        frameState = undefined;
        options.resetDiagnostics();

        const warmupCycles = config.mode === "performance" ? 2 : 0;
        for (let index = 0; index < warmupCycles; index += 1) {
          await runCycle(token, config);
        }
        await waitForCondition(
          token,
          () => {
            const runtime = options.getRuntimeState();
            return runtime.stationConnectionRequestsPending === 0 &&
              !runtime.viewportPending &&
              !runtime.loading &&
              !runtime.trafficLoading;
          },
          "le calme runtime après préchauffage",
        );
        await waitForSceneStable(token);
        options.setInteractionActive(false);
        options.drawNow();
        await waitForFrames(token, 2);

        frameState = createSelectedLineZoomFrameState(initialCamera.zoom);
        frameState.coverReadyBeforeGesture = options.isCoverReady();
        if (config.mode === "performance") {
          options.startPerformanceMeasure?.();
          await new Promise<void>((resolve) => window.setTimeout(resolve, 1_100));
        }
        for (let index = 0; index < config.cycles; index += 1) {
          phase.value = "zoom-out";
          await runCycle(token, config);
        }
        await waitForCondition(token, options.isBasemapSettled, "le settle final du basemap live", 15_000);
        finalCamera = { ...options.getCamera() };
        performanceReport = options.stopPerformanceMeasure?.();
        const frame = frameState;
        const errors: string[] = [];
        const runtime = options.getRuntimeState();
        const ghostState = options.getGhostState();
        if (runtime.activeLineId !== config.lineId) errors.push("la ligne active a changé");
        if (!selectedLineZoomIdsMatch(initialPathIds, runtime.scene.paths.map((path) => path.id))) {
          errors.push("le fingerprint des paths a changé");
        }
        if (!selectedLineZoomIdsMatch(initialStationIds, runtime.scene.stations.map((station) => station.id))) {
          errors.push("le fingerprint des stations a changé");
        }
        const expectedInputEvents = config.cycles * (config.gesture?.eventCount ?? 10) * 2;
        if ((frame?.inputEvents ?? 0) !== expectedInputEvents) {
          errors.push(`nombre d'événements inattendu: ${frame?.inputEvents ?? 0}/${expectedInputEvents}`);
        }
        const activeLineRatio = frame && frame.interactivePresentedFrames > 0
          ? frame.activeLineFrames / frame.interactivePresentedFrames
          : 0;
        if (activeLineRatio < 0.95) errors.push(`redraw focalisé insuffisant: ${activeLineRatio.toFixed(3)}`);
        if ((frame?.scenePathCountMin ?? 0) < 1 || (frame?.sceneStationCountMin ?? 0) < 1) {
          errors.push("une frame mesurée ne contient pas de path et de station");
        }
        if (!runtime.ghostSceneComplete) errors.push(`correspondances non rendues: ${ghostState.missing.join(",")}`);
        if (Math.abs(finalCamera.zoom - initialCamera.zoom) > 0.02) {
          errors.push(`zoom non revenu à l'état initial: ${finalCamera.zoom - initialCamera.zoom}`);
        }
        if (options.isScrolling()) errors.push("l'interaction n'est pas terminée");
        if (frame && (frame.interactivePathCacheCaptureCount !== 0 || frame.interactivePathCacheCapturedBytes !== 0)) {
          errors.push("capture du cache détectée pendant un redraw focalisé interactif");
        }
        if (config.gesture && performanceReport) {
          if (performanceReport.presentedFrameRatio < 0.98) errors.push(`cadence présentée insuffisante: ${performanceReport.presentedFrameRatio.toFixed(3)}`);
          if (performanceReport.presentedP95FrameTimeMs > 20) errors.push(`p95 présenté sous 50 FPS: ${performanceReport.presentedP95FrameTimeMs.toFixed(2)} ms`);
          if (performanceReport.presentedP99FrameTimeMs > 25) errors.push(`p99 présenté au-dessus du budget anti-spike: ${performanceReport.presentedP99FrameTimeMs.toFixed(2)} ms`);
          if (performanceReport.presentedFramesOver50Ms > 0) errors.push(`frames présentées au-dessus de 50 ms: ${performanceReport.presentedFramesOver50Ms}`);
        }
        const basemapMetrics = options.getBasemapMetrics?.();
        if (basemapMetrics) {
          if (basemapMetrics.commitsBeforeReady !== 0) errors.push("commit basemap avant ready");
          if (basemapMetrics.maxMountedTiles > 256) errors.push("plus de 256 tuiles montées");
          if (basemapMetrics.pendingSignature) errors.push("une définition basemap reste pending après settle");
          if (config.mode === "performance" && basemapMetrics.visibleTileErrors > 0) errors.push(`erreur de tuile visible: ${basemapMetrics.visibleTileErrors}`);
        }
        let finalStatus: SelectedLineZoomStatus = errors.length > 0 ? "failed" : "passed";
        if (config.mode === "coverage") {
          const liveGapFrames = frame?.coverageGapFrames ?? 0;
          const combinedGapFrames = frame?.combinedCoverageGapFrames ?? 0;
          const coverEnabled = options.isCoverEnabled();
          if (liveGapFrames === 0) {
            finalStatus = "invalid";
            errors.push("scénario invalide: le délai live n'a reproduit aucun gap de couverture");
          } else if (!coverEnabled) {
            if (combinedGapFrames !== liveGapFrames) errors.push(`référence sans cover incohérente: live=${liveGapFrames}, combiné=${combinedGapFrames}`);
          } else {
            if (!frame?.coverReadyBeforeGesture) errors.push("cover non prêt avant le premier geste");
            if (combinedGapFrames > 0) errors.push(`couverture combinée incomplète (${combinedGapFrames} frames)`);
            if ((frame?.coverContributionFrames ?? 0) === 0) errors.push("le cover n'a contribué à aucune frame où le live était en gap");
            if ((frame?.minimumCombinedCoverageRatio ?? 0) < 0.999) errors.push(`ratio combiné insuffisant: ${(frame?.minimumCombinedCoverageRatio ?? 0).toFixed(4)}`);
          }
        }
        if (finalStatus === "passed" && errors.length > 0) finalStatus = "failed";
        const finalGhosts = options.getGhostState();
        const finalReport = buildSelectedLineZoomReport({
          status: finalStatus,
          mode: config.mode,
          lineId: config.lineId,
          cycles: config.cycles,
          coverageDelayMs: config.coverageDelayMs,
          initialCamera,
          finalCamera,
          initialPathIds,
          initialStationIds,
          activeLineId: runtime.activeLineId,
          expectedGhostLineCount: finalGhosts.expected,
          renderableGhostLineCount: finalGhosts.renderable,
          renderedGhostLineCount: finalGhosts.rendered,
          missingGhostLineIds: finalGhosts.missing,
          gesture: config.gesture,
          frame,
          basemap: basemapMetrics,
          cover: options.getCoverMetrics?.(),
          performance: performanceReport,
          error: errors.length > 0 ? errors.join("; ") : undefined,
        });
        status.value = finalStatus;
        phase.value = "completed";
        publish(finalReport);
      } catch (error) {
        if (!options.isMounted() || token !== scenarioToken) return;
        performanceReport = options.stopPerformanceMeasure?.();
        const runtime = options.getRuntimeState();
        const ghosts = options.getGhostState();
        const message = error instanceof Error ? error.message : String(error);
        const failedReport = buildSelectedLineZoomReport({
          status: "failed",
          mode: config.mode,
          lineId: config.lineId,
          cycles: config.cycles,
          coverageDelayMs: config.coverageDelayMs,
          initialCamera,
          finalCamera: { ...options.getCamera() },
          initialPathIds,
          initialStationIds,
          activeLineId: runtime.activeLineId,
          expectedGhostLineCount: ghosts.expected,
          renderableGhostLineCount: ghosts.renderable,
          renderedGhostLineCount: ghosts.rendered,
          missingGhostLineIds: ghosts.missing,
          gesture: config.gesture,
          frame: frameState,
          basemap: options.getBasemapMetrics?.(),
          cover: options.getCoverMetrics?.(),
          performance: performanceReport,
          error: message,
        });
        status.value = "failed";
        phase.value = "failed";
        publish(failedReport);
      } finally {
        frameState = undefined;
      }
    })();
    const trackedPromise = runPromise.finally(() => {
      if (scenarioPromise === trackedPromise) scenarioPromise = undefined;
    });
    scenarioPromise = trackedPromise;
    await trackedPromise;
  }

  function schedule(): void {
    if (!options.isMounted() || !options.isEnabled() || scenarioPromise || options.isChaosRunning()) return;
    void run();
  }

  function invalidate(): void {
    scenarioToken += 1;
    frameState = undefined;
  }

  function dispose(): void {
    invalidate();
    options.cancelInteractions();
  }

  const result = {
    status,
    phase,
    report,
    reportJson: computed(() =>
      JSON.stringify(report.value ?? { status: status.value }, null, 2),
    ),
    run,
    schedule,
    recordFrame,
    invalidate,
    dispose,
  };
  onBeforeUnmount(dispose);
  return result;
}
