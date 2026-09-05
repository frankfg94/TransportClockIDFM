import { mount, type VueWrapper } from "@vue/test-utils";
import { computed, defineComponent, h, nextTick, ref, type ComputedRef, type Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GlobalMapLine,
  GlobalMapMode,
} from "../src/features/transport-map/contracts/manifest";
import type {
  TransportMapRenderScene,
  TransportMapRendererMetrics,
} from "../src/features/transport-map/contracts/renderer";
import { createCamera } from "../src/features/transport-map/geo/camera";
import type { GlobalTransportPerformanceController } from "../src/features/line-map/useGlobalTransportPerformance";
import {
  useGlobalTransportPerformanceScenarios,
  type GlobalTransportPerformanceScenarioConfig,
} from "../src/features/line-map/useGlobalTransportPerformanceScenarios";

const mocks = vi.hoisted(() => ({
  useChaosZoom: vi.fn(),
  useSelectedLineZoomScenario: vi.fn(),
}));

vi.mock("../src/features/line-map/useChaosZoom", () => ({
  useChaosZoom: mocks.useChaosZoom,
}));
vi.mock("../src/features/line-map/useSelectedLineZoomScenario", () => ({
  useSelectedLineZoomScenario: mocks.useSelectedLineZoomScenario,
}));

const line = {
  id: "line:IDFM:C01384",
  label: "14",
  code: "14",
  mode: "METRO",
} as GlobalMapLine;
const scene = {
  paths: [{ id: "path:14" }],
  stations: [{ id: "station:1" }],
} as unknown as TransportMapRenderScene;
const metrics = {
  renderer: "canvas2d-main-thread",
  drawCalls: 1,
  visiblePathCount: 1,
  visibleStationCount: 1,
  renderMs: 1,
  cacheBytes: 10,
  focusedLineLiveRedraw: false,
  pathCacheCaptureCount: 0,
  pathCacheCaptureMs: 0,
  pathCacheCapturedBytes: 0,
} as TransportMapRendererMetrics;

function createConfig(enabled = false): GlobalTransportPerformanceScenarioConfig {
  return {
    extremeChaosEnabled: false,
    selectedLineWheelEnabled: enabled,
    selectedLineZoomTarget: line.id,
    selectedLineZoomMode: "performance",
    selectedLineWheelCoverageDelayMs: 0,
    selectedLineZoomRequestedCycles: 6,
    selectedLineZoomGesture: undefined,
    selectedLineZoomLowPauseMs: 0,
    selectedLineCoverOverride: undefined,
  };
}

describe("useGlobalTransportPerformanceScenarios", () => {
  let wrapper: VueWrapper | undefined;
  let api: ReturnType<typeof useGlobalTransportPerformanceScenarios> | undefined;
  let config: Ref<GlobalTransportPerformanceScenarioConfig>;
  let chaosController: {
    running: Ref<boolean>;
    progress: Ref<number>;
    total: Ref<number>;
    activeProfile: Ref<"standard" | "extreme">;
    phase: Ref<string>;
    report: Ref<unknown>;
    reportJson: ComputedRef<string>;
    runChaosZoom: ReturnType<typeof vi.fn>;
    runChaosZoomExtreme: ReturnType<typeof vi.fn>;
    recordPresentedFrame: ReturnType<typeof vi.fn>;
    recordRendererMetrics: ReturnType<typeof vi.fn>;
    recordCacheMetrics: ReturnType<typeof vi.fn>;
    recordTiming: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
  let selectedController: {
    status: Ref<string>;
    phase: Ref<string>;
    report: Ref<unknown>;
    reportJson: ComputedRef<string>;
    run: ReturnType<typeof vi.fn>;
    schedule: ReturnType<typeof vi.fn>;
    recordFrame: ReturnType<typeof vi.fn>;
    invalidate: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
  let performanceController: GlobalTransportPerformanceController;

  beforeEach(() => {
    config = ref(createConfig());
    chaosController = {
      running: ref(false),
      progress: ref(0),
      total: ref(30),
      activeProfile: ref("standard"),
      phase: ref("idle"),
      report: ref(),
      reportJson: computed(() => ""),
      runChaosZoom: vi.fn(() => Promise.resolve({ status: "completed" })),
      runChaosZoomExtreme: vi.fn(() => Promise.resolve({ status: "completed" })),
      recordPresentedFrame: vi.fn(),
      recordRendererMetrics: vi.fn(),
      recordCacheMetrics: vi.fn(),
      recordTiming: vi.fn(),
      dispose: vi.fn(),
    };
    selectedController = {
      status: ref("idle"),
      phase: ref("idle"),
      report: ref(),
      reportJson: computed(() => ""),
      run: vi.fn(() => Promise.resolve()),
      schedule: vi.fn(),
      recordFrame: vi.fn(),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };
    mocks.useChaosZoom.mockReset();
    mocks.useSelectedLineZoomScenario.mockReset();
    mocks.useChaosZoom.mockReturnValue(chaosController);
    mocks.useSelectedLineZoomScenario.mockReturnValue(selectedController);
    performanceController = {
      recordPresentedFrame: vi.fn(),
      recordRendererMetrics: vi.fn(),
      recordCacheMetricsIfDue: vi.fn(),
      recordTiming: vi.fn(),
      startDebugPerformance: vi.fn(),
      stopDebugPerformance: vi.fn(),
    } as unknown as GlobalTransportPerformanceController;

    const host = defineComponent({
      setup() {
        api = useGlobalTransportPerformanceScenarios({
          getConfig: () => config.value,
          performance: {
            controller: performanceController,
            getCacheMetrics: () => ({
              entries: 1,
              bytes: 10,
              hits: 2,
              misses: 1,
              evictions: 0,
            }),
          },
          preparation: {
            ensureSearchCatalog: vi.fn(async () => undefined),
            resolveLine14: vi.fn(() => line),
            cancelInteractions: vi.fn(),
            ensureModeVisible: vi.fn(),
            resetTransientState: vi.fn(),
            selectLine: vi.fn(),
            clearActiveStation: vi.fn(),
            zoomToLine: vi.fn(),
            syncUrl: vi.fn(),
            draw: vi.fn(),
            refreshViewport: vi.fn(async () => undefined),
            cancelScheduledViewportRefresh: vi.fn(),
            prepareExtremeState: vi.fn(async () => ({
              availableModes: ["METRO"] as GlobalMapMode[],
              activeModes: ["METRO"] as GlobalMapMode[],
            })),
            restoreExtremeState: vi.fn(),
          },
          runtime: {
            isMounted: () => true,
            getCanvas: () => undefined,
            getCamera: () => createCamera(),
            getRenderScene: () => scene,
            getRendererMetrics: () => metrics,
            getRendererKind: () => "canvas2d-main-thread",
            getActiveLineId: () => line.id,
            isScrolling: () => false,
            getSelectedLineRuntimeState: () => ({
              scene,
              activeLineId: line.id,
              stationConnectionRequestsPending: 0,
              viewportPending: false,
              loading: false,
              trafficLoading: false,
              ghostSceneComplete: true,
            }),
            getSelectedLineGhostState: () => ({
              expected: 1,
              renderable: 1,
              rendered: 1,
              missing: [],
            }),
            isInteractionActive: () => true,
            isWheelScrolling: () => false,
            isNetworkReady: () => true,
            isRendererReady: () => true,
            isViewportPending: () => false,
          },
          camera: {
            applyCamera: vi.fn(),
            draw: vi.fn(),
            drawNow: vi.fn(),
            refreshViewport: vi.fn(async () => undefined),
            setInteractionActive: vi.fn(),
          },
          basemap: {
            beforeMeasure: vi.fn(),
            captureSnapshot: vi.fn(),
            readCoverage: vi.fn(),
            isBasemapReady: () => true,
            isBasemapSettled: () => true,
            isCoverEnabled: () => false,
            isCoverReady: () => false,
            areBridgeCoversReady: () => false,
            resetDiagnostics: vi.fn(),
            getBasemapMetrics: vi.fn(),
            getCoverMetrics: vi.fn(),
          },
          metadata: {
            getRoutePath: () => "/map",
            getExperience: () => "legacy",
            getBasemap: () => "legacy-raster",
            getDataVersion: () => "fixture-v1",
            getRendererKind: () => "canvas2d-main-thread",
            getCamera: () => createCamera(),
            getVisibleModes: () => ["METRO"] as GlobalMapMode[],
            isTrafficEnabled: () => true,
            getChunkIds: () => ["chunk:0:0"],
            getDataMetrics: () => ({ decodeTimeMs: 1, workerTimeMs: 2, workerCount: 1 }),
            getFullDataMetrics: () => ({
              lastGeneration: 1,
              lastChunkCount: 1,
              bytes: 10,
              decodeTimeMs: 1,
              workerTimeMs: 2,
              workerCount: 1,
              cache: {
                pending: 0,
                active: 0,
                completed: 1,
                abandoned: 0,
                cache: { entries: 1, bytes: 10, hits: 2, misses: 1, evictions: 0 },
              },
            }),
          },
        });
        return () => h("div");
      },
    });
    wrapper = mount(host);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    api = undefined;
  });

  it("keeps scheduling disabled until enabled, then delegates both scenario triggers", async () => {
    if (!api) throw new Error("scenario harness was not created");
    api.scheduleSelectedLineZoomScenario();
    expect(selectedController.schedule).not.toHaveBeenCalled();

    config.value = createConfig(true);
    await nextTick();
    api.scheduleSelectedLineZoomScenario();
    expect(selectedController.schedule).toHaveBeenCalled();

    await api.runChaosZoom();
    expect(chaosController.runChaosZoom).toHaveBeenCalledTimes(1);
  });

  it("starts the extreme URL scenario only once after renderer readiness", async () => {
    if (!api) throw new Error("scenario harness was not created");
    config.value = { ...createConfig(), extremeChaosEnabled: true };
    await nextTick();
    api.scheduleExtremeChaosZoomScenario();
    api.scheduleExtremeChaosZoomScenario();
    expect(chaosController.runChaosZoomExtreme).toHaveBeenCalledTimes(1);
  });

  it("centralizes frame/timing probes, readiness ports and metadata", () => {
    if (!api) throw new Error("scenario harness was not created");
    api.recordFrame(metrics);
    expect(performanceController.recordPresentedFrame).toHaveBeenCalledWith(true);
    expect(performanceController.recordRendererMetrics).toHaveBeenCalledWith(metrics);
    expect(selectedController.recordFrame).toHaveBeenCalledWith(metrics);

    chaosController.running.value = true;
    api.recordFrame(metrics);
    expect(chaosController.recordRendererMetrics).toHaveBeenCalledWith(metrics);
    expect(chaosController.recordCacheMetrics).toHaveBeenCalledWith({
      entries: 1,
      bytes: 10,
      hits: 2,
      misses: 1,
      evictions: 0,
    });
    api.recordTiming("worker", 4);
    expect(performanceController.recordTiming).toHaveBeenCalledWith("worker", 4);
    expect(chaosController.recordTiming).toHaveBeenCalledWith("worker", 4);

    expect(api.getPerformanceMetadata()).toMatchObject({
      route: "/map",
      experience: "legacy",
      basemap: "legacy-raster",
      dataVersion: "fixture-v1",
      renderer: "canvas2d-main-thread",
      visibleModes: ["METRO"],
      traffic: true,
      chunks: ["chunk:0:0"],
      data: { decodeTimeMs: 1, workerTimeMs: 2, workerCount: 1 },
    });

    const selectedOptions = mocks.useSelectedLineZoomScenario.mock.calls[0]?.[0] as {
      isBasemapReady: () => boolean;
      isBasemapSettled: () => boolean;
      getConfig: () => { lineId: string };
    };
    expect(selectedOptions.isBasemapReady()).toBe(true);
    expect(selectedOptions.isBasemapSettled()).toBe(true);
    expect(selectedOptions.getConfig().lineId).toBe(line.id);
  });

  it("disposes both scenario controllers with the harness lifecycle", () => {
    if (!api) throw new Error("scenario harness was not created");
    api.dispose();
    expect(selectedController.dispose).toHaveBeenCalledTimes(1);
    expect(chaosController.dispose).toHaveBeenCalledTimes(1);
  });
});
