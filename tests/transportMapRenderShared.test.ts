import { describe, expect, it } from "vitest";
import {
  GLOBAL_MAP_TRANSFORM_VERSION,
  type GlobalMapLine,
  type GlobalMapPath,
  type GlobalMapStation,
} from "../src/features/transport-map/contracts/manifest";
import type { TransportMapRenderScene } from "../src/features/transport-map/contracts/renderer";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";
import { createCamera } from "../src/features/transport-map/geo/camera";
import {
  PreparedWorldPathGeometryCache,
} from "../src/features/transport-map/render/preparedPathGeometry";
import { resolveTransportMapPathStyle } from "../src/features/transport-map/render/pathRenderStyle";
import { TransportMapRenderSceneIndex } from "../src/features/transport-map/render/renderSceneIndex";
import {
  createStationNodeVisibilityContext,
  isStationNodeVisible,
} from "../src/features/transport-map/render/stationNodeVisibility";
import {
  createSubpathTrafficRanges,
  TransportMapTrafficRangeIndex,
} from "../src/features/transport-map/render/trafficRanges";
import {
  createSelectedLineZoomFrameState,
  recordSelectedLineZoomFrame,
  buildSelectedLineZoomReport,
} from "../src/features/line-map/selectedLineZoomScenario";
import { useGlobalTransportRouteState } from "../src/features/line-map/useGlobalTransportRouteState";
import { useGlobalTransportViewport } from "../src/features/line-map/useGlobalTransportViewport";

const station = (id: string, lineIds: string[], worldX: number, worldY: number, isHub = false): GlobalMapStation => ({
  id,
  index: Number(id.replace(/\D/gu, "")) || 0,
  name: id,
  normalizedName: id,
  aliases: [],
  rawRefs: [],
  lineIds,
  ownerChunkId: "chunk:fixture",
  isHub,
  sourceCrs: "EPSG:2154",
  sourceX: 0,
  sourceY: 0,
  lon: 2.35,
  lat: 48.85,
  worldX,
  worldY,
  coordinateSource: "gtfs",
  transformVersion: GLOBAL_MAP_TRANSFORM_VERSION,
});

const line = (id: string, mode: GlobalMapLine["mode"], stationIds: string[]): GlobalMapLine => ({
  id,
  index: 0,
  code: id,
  label: id,
  mode,
  color: "#123456",
  textColor: "#ffffff",
  aliases: [],
  stationIds,
  geometryIds: [`path:${id}`],
});

const path = (id: string, lineId: string, vertices: GlobalMapPath["vertices"], subpathStarts?: number[]): GlobalMapPath => ({
  id,
  lineId,
  geometrySource: "gtfs",
  sourceVersion: "fixture",
  quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
  stationIds: vertices.flatMap((vertex) => vertex.stationId ? [vertex.stationId] : []),
  vertices,
  subpathStarts,
  minX: Math.min(...vertices.map((vertex) => vertex.x)),
  minY: Math.min(...vertices.map((vertex) => vertex.y)),
  maxX: Math.max(...vertices.map((vertex) => vertex.x)),
  maxY: Math.max(...vertices.map((vertex) => vertex.y)),
  chunkIds: ["chunk:fixture"],
});

describe("shared transport-map renderer state", () => {
  it("keeps scene index identities stable and invalidates changed sources only", () => {
    const active = line("line:active", "METRO", ["station:0", "station:1"]);
    const ghost = line("line:ghost", "BUS", ["station:2"]);
    const stations = [
      station("station:0", [active.id], 0.49, 0.5),
      station("station:1", [active.id], 0.5, 0.5),
      station("station:2", [ghost.id], 0.51, 0.5),
    ];
    const activePath = path("path:active", active.id, [
      { stationId: "station:0", x: 0.49, y: 0.5 },
      { stationId: "station:1", x: 0.5, y: 0.5 },
    ]);
    const scene: TransportMapRenderScene = {
      lines: [active, ghost],
      paths: [activePath],
      stations,
      activeLineId: active.id,
      hoveredLineId: ghost.id,
      ghostLineIds: [ghost.id],
      selectedStationIds: ["station:1"],
      visibleModeMask: 0,
      trafficPathSpans: [],
    };
    const index = new TransportMapRenderSceneIndex();
    index.update(scene);

    expect(index.visibleLineIds.has(active.id)).toBe(true);
    expect(index.ghostLineIds.has(ghost.id)).toBe(true);
    expect(index.activeLineStationIds).toEqual(new Set(["station:0", "station:1"]));
    expect(index.hoveredGhostStationIds).toEqual(new Set(["station:2"]));
    expect(index.selectedStationIds).toEqual(new Set(["station:1"]));

    const linesById = index.linesById;
    const pathsByLineId = index.pathsByLineId;
    const stationVisibility = index.stationVisibility;
    const version = index.version;
    index.update(scene);
    expect(index.linesById).toBe(linesById);
    expect(index.pathsByLineId).toBe(pathsByLineId);
    expect(index.stationVisibility).toBe(stationVisibility);
    expect(index.version).toBe(version);

    const nextTraffic = [{
      pathId: activePath.id,
      startVertexIndex: 0,
      endVertexIndex: 1,
      kind: "interruption" as const,
      disruptionId: "disruption:1",
    }];
    index.update({ ...scene, trafficPathSpans: nextTraffic });
    expect(index.trafficRanges.getGrouped(activePath.id)).toEqual(nextTraffic);
  });

  it("reuses visibility context sets for active-line and hub rules", () => {
    const active = line("line:active", "METRO", ["station:active"]);
    const other = line("line:other", "RER", []);
    const hub = station("station:hub", [active.id, other.id], 0.5, 0.5, true);
    const activeStation = station("station:active", [active.id], 0.51, 0.5);
    const scene: TransportMapRenderScene = {
      lines: [active, other],
      paths: [],
      stations: [hub, activeStation],
      activeLineId: active.id,
      selectedStationIds: [],
      visibleModeMask: 0,
    };
    const context = createStationNodeVisibilityContext(scene);
    const camera = { zoom: 0 };
    expect(isStationNodeVisible(camera, scene, activeStation, context)).toBe(true);
    expect(isStationNodeVisible(camera, scene, hub, context)).toBe(true);
    expect(context.majorOverviewHubIndexReady).toBe(true);
  });

  it("prepares world anchors and subpaths once per path identity", () => {
    const active = line("line:active", "METRO", ["station:0"]);
    const stations = [station("station:0", [active.id], 0.75, 0.25)];
    const sourcePath = path("path:active", active.id, [
      { x: 0.1, y: 0.1 },
      { stationId: "station:0", x: 0.2, y: 0.2 },
      { x: 0.3, y: 0.3 },
      { x: 0.8, y: 0.8 },
      { x: 0.9, y: 0.9 },
    ], [0, 3]);
    const stationsById = new Map(stations.map((entry) => [entry.id, entry]));
    const cache = new PreparedWorldPathGeometryCache();
    cache.setStationsSource(stations);
    const first = cache.get(sourcePath, active.mode, stationsById);
    expect(first.subpaths).toHaveLength(2);
    expect(first.subpaths[0]?.worldPoints[1]).toEqual({ x: 0.75, y: 0.25 });
    expect(first.subpaths[0]?.protectedPointIndices).toEqual([1]);
    expect(cache.get(sourcePath, active.mode, stationsById)).toBe(first);

    const changedStations = [station("station:0", [active.id], 0.7, 0.2)];
    cache.setStationsSource(changedStations);
    const second = cache.get(sourcePath, active.mode, new Map(changedStations.map((entry) => [entry.id, entry])));
    expect(second).not.toBe(first);
    expect(second.subpaths[0]?.worldPoints[1]).toEqual({ x: 0.7, y: 0.2 });
  });

  it("groups and clips traffic ranges without recreating them on lookup", () => {
    const spans = [
      {
        pathId: "path:active",
        startVertexIndex: 1,
        endVertexIndex: 3,
        kind: "interruption" as const,
        disruptionId: "disruption:1",
      },
    ];
    const ranges = createSubpathTrafficRanges(0, 4, spans);
    expect(ranges).toEqual([
      { startVertexIndex: 0, endVertexIndex: 1, kind: undefined },
      { startVertexIndex: 1, endVertexIndex: 3, kind: "interruption" },
    ]);

    const rangeIndex = new TransportMapTrafficRangeIndex();
    rangeIndex.update(spans);
    const subpathKey = {};
    const first = rangeIndex.getForSubpath(subpathKey, 0, 4, "path:active");
    expect(rangeIndex.getForSubpath(subpathKey, 0, 4, "path:active")).toBe(first);
  });

  it("resolves active, ghost, hover and interruption styles into a caller-owned object", () => {
    const active = line("line:active", "METRO", []);
    const output = {
      visible: false,
      active: false,
      ghost: false,
      hovered: false,
      trafficKind: undefined,
      alpha: 0,
      lineWidthCssPx: 0,
      nativeColor: "",
      dash: "solid" as const,
      order: 0,
    };
    const scene = {
      activeLineId: active.id,
      hoveredLineId: active.id,
    };
    const visible = resolveTransportMapPathStyle({
      line: active,
      scene,
      highlighted: true,
      ghostLineIds: new Set<string>(),
      interruptionLines: new Set([active.id]),
      disturbanceLines: new Set<string>(),
      visibleLineIds: new Set([active.id]),
      zoom: 14,
    }, output);
    expect(visible).toBe(true);
    expect(output.active).toBe(true);
    expect(output.hovered).toBe(true);
    expect(output.trafficKind).toBe("interruption");
    expect(output.dash).toBe("traffic-interruption");
  });

  it("keeps the selected-line scenario counters pure and report-compatible", () => {
    const camera = createCamera({ zoom: 12, viewportWidthCssPx: 320, viewportHeightCssPx: 180 });
    const active = line("line:active", "METRO", []);
    const scene: TransportMapRenderScene = {
      lines: [active],
      paths: [],
      stations: [],
      activeLineId: active.id,
      selectedStationIds: [],
      visibleModeMask: 0,
    };
    const frame = createSelectedLineZoomFrameState(camera.zoom);
    recordSelectedLineZoomFrame(frame, {
      renderer: "canvas2d-main-thread",
      drawCalls: 1,
      visiblePathCount: 1,
      visibleStationCount: 1,
      renderMs: 4,
      cacheBytes: 0,
      focusedLineLiveRedraw: true,
      pathCacheCaptureCount: 0,
      pathCacheCaptureMs: 0,
      pathCacheCapturedBytes: 0,
    }, {
      interactionActive: true,
      phase: "zoom-out",
      zoom: 11.5,
      wheelScrolling: true,
      scene,
    }, 100);
    expect(frame.activeLineFrames).toBe(1);
    const report = buildSelectedLineZoomReport({
      status: "passed",
      mode: "performance",
      lineId: active.id,
      cycles: 1,
      coverageDelayMs: 0,
      initialCamera: camera,
      finalCamera: camera,
      initialPathIds: [],
      initialStationIds: [],
      activeLineId: active.id,
      expectedGhostLineCount: 0,
      renderableGhostLineCount: 0,
      renderedGhostLineCount: 0,
      missingGhostLineIds: [],
      frame,
    });
    expect(report.scenario.name).toBe("selected-line-wheel");
    expect(report.scenario.activeLineFrames).toBe(1);
  });

  it("publishes only the newest viewport response", async () => {
    const camera = createCamera({ generation: 0 });
    const network = {} as TransportMapNetwork;
    const pending: Array<(result: {
      generation: number;
      chunkIds: string[];
      paths: GlobalMapPath[];
      stations: GlobalMapStation[];
      bytes: number;
      fromCache: boolean;
    }) => void> = [];
    const published: number[] = [];
    const controller = useGlobalTransportViewport({
      isMounted: () => true,
      getNetwork: () => network,
      getCamera: () => camera,
      getVisibleModeMask: () => 0,
      getActiveLineId: () => undefined,
      getForcedLineIds: () => [],
      queryViewport: () => new Promise((resolve) => pending.push(resolve)),
      getNetworkAfterQuery: () => network,
      publishNetwork: () => undefined,
      publishViewport: (result) => published.push(result.generation),
      setLoading: () => undefined,
      clearError: () => undefined,
      setError: () => undefined,
      debounceMs: 0,
    });

    const first = controller.refreshViewport();
    camera.generation = 1;
    const second = controller.refreshViewport();
    pending[1]?.({ generation: 1, chunkIds: [], paths: [], stations: [], bytes: 0, fromCache: false });
    await second;
    pending[0]?.({ generation: 0, chunkIds: [], paths: [], stations: [], bytes: 0, fromCache: false });
    await first;

    expect(published).toEqual([1]);
    controller.dispose();
  });

  it("ignores a focused viewport response invalidated when the selection is cleared", async () => {
    const camera = createCamera({ generation: 0 });
    const network = {} as TransportMapNetwork;
    let activeLineId: string | undefined = "line:focused";
    const pending: Array<(result: {
      generation: number;
      chunkIds: string[];
      paths: GlobalMapPath[];
      stations: GlobalMapStation[];
      bytes: number;
      fromCache: boolean;
    }) => void> = [];
    const published: number[] = [];
    const requestedLineIds: Array<string | undefined> = [];
    const controller = useGlobalTransportViewport({
      isMounted: () => true,
      getNetwork: () => network,
      getCamera: () => camera,
      getVisibleModeMask: () => 0,
      getActiveLineId: () => activeLineId,
      getForcedLineIds: () => [],
      queryViewport: (_camera, _modeMask, _generation, requestedActiveLineId) => {
        requestedLineIds.push(requestedActiveLineId);
        return new Promise((resolve) => pending.push(resolve));
      },
      getNetworkAfterQuery: () => network,
      publishNetwork: () => undefined,
      publishViewport: (result) => published.push(result.generation),
      setLoading: () => undefined,
      clearError: () => undefined,
      setError: () => undefined,
      debounceMs: 0,
    });

    const focused = controller.refreshViewport();
    activeLineId = undefined;
    controller.invalidatePendingRequests();
    const overview = controller.refreshViewport();

    expect(requestedLineIds).toEqual(["line:focused", undefined]);
    pending[1]?.({ generation: 0, chunkIds: [], paths: [], stations: [], bytes: 0, fromCache: false });
    await overview;
    pending[0]?.({ generation: 0, chunkIds: [], paths: [], stations: [], bytes: 0, fromCache: false });
    await focused;

    expect(published).toEqual([0]);
    controller.dispose();
  });

  it("measures the synchronous viewport result application boundary", async () => {
    let now = 0;
    const timings: Array<{ kind: string; durationMs: number }> = [];
    const camera = createCamera({ generation: 2 });
    const network = {} as TransportMapNetwork;
    const controller = useGlobalTransportViewport({
      isMounted: () => true,
      getNetwork: () => network,
      getCamera: () => camera,
      getVisibleModeMask: () => 0,
      getActiveLineId: () => undefined,
      getForcedLineIds: () => [],
      queryViewport: async () => ({
        generation: 2,
        chunkIds: ["chunk:test"],
        paths: [],
        stations: [],
        bytes: 0,
        fromCache: false,
      }),
      getNetworkAfterQuery: () => network,
      publishNetwork: () => { now += 2; },
      publishViewport: () => { now += 3; },
      setLoading: () => undefined,
      clearError: () => undefined,
      setError: () => undefined,
      afterRefresh: () => { now += 5; },
      recordTiming: (kind, durationMs) => timings.push({ kind, durationMs }),
      debounceMs: 0,
    });

    await controller.refreshViewport();

    expect(timings.find((timing) => timing.kind === "viewport_result_apply")?.durationMs).toBeGreaterThanOrEqual(0);
    controller.dispose();
  });

  it("marks same-object viewport refreshes as unchanged until the network version moves", async () => {
    const camera = createCamera({ generation: 0 });
    const network = {} as TransportMapNetwork;
    let networkVersion = 1;
    const pending: Array<(result: {
      generation: number;
      chunkIds: string[];
      paths: GlobalMapPath[];
      stations: GlobalMapStation[];
      bytes: number;
      fromCache: boolean;
    }) => void> = [];
    const published: boolean[] = [];
    const controller = useGlobalTransportViewport({
      isMounted: () => true,
      getNetwork: () => network,
      getNetworkVersion: () => networkVersion,
      getCamera: () => camera,
      getVisibleModeMask: () => 0,
      getActiveLineId: () => undefined,
      getForcedLineIds: () => [],
      queryViewport: () => new Promise((resolve) => pending.push(resolve)),
      getNetworkAfterQuery: () => network,
      publishNetwork: (_next, _sameObject, dataChanged) => published.push(dataChanged === true),
      publishViewport: () => undefined,
      setLoading: () => undefined,
      clearError: () => undefined,
      setError: () => undefined,
      debounceMs: 0,
    });

    const first = controller.refreshViewport();
    pending[0]?.({ generation: 0, chunkIds: [], paths: [], stations: [], bytes: 0, fromCache: true });
    await first;
    networkVersion = 2;
    const second = controller.refreshViewport();
    networkVersion = 3;
    pending[1]?.({ generation: 0, chunkIds: [], paths: [], stations: [], bytes: 0, fromCache: true });
    await second;

    expect(published).toEqual([false, true]);
    controller.dispose();
  });

  it("serializes direction and shared route state through one callback", () => {
    const camera = createCamera({ viewportWidthCssPx: 320, viewportHeightCssPx: 180 });
    const active = line("line:active", "METRO", []);
    const query: Record<string, unknown> = {};
    const replacements: Array<Record<string, string | undefined>> = [];
    const directionState = {
      filterRequested: true,
      selectedDirectionId: "direction:west" as string | undefined,
      mergeEnabled: false,
      ready: true,
    };
    const controller = useGlobalTransportRouteState({
      getQuery: () => query,
      router: {
        replace: ({ query: nextQuery }) => {
          replacements.push(nextQuery);
        },
      },
      isMounted: () => true,
      getCamera: () => camera,
      applyCamera: () => undefined,
      captureSelectedLineBasemapCoverSnapshot: () => undefined,
      getSharedViewportSignature: () => undefined,
      setSharedViewportSignature: () => undefined,
      getSelection: () => ({ activeLineId: active.id }),
      getActiveLine: () => active,
      getDirectionState: () => directionState,
      getNetwork: () => ({ lines: [active], linesById: new Map([[active.id, active]]) }),
      supportsLineDirections: () => true,
      defaultDirectionMerge: () => true,
      ensureSearchCatalog: async () => undefined,
      selectLineFromSearch: async () => undefined,
      getStation: async () => undefined,
      refreshNetwork: () => undefined,
      selectStation: () => undefined,
      loadStationConnections: async () => undefined,
      refreshViewport: async () => undefined,
      resolveDebugLine: () => undefined,
      getDebugLineQuery: () => undefined,
      ensureModeVisible: () => undefined,
      resetDirections: () => undefined,
      selectLine: () => undefined,
      clearActiveStation: () => undefined,
      clearActiveStationGroup: () => undefined,
      clearConnectedStations: () => undefined,
      getStationById: () => undefined,
      zoomToLine: () => undefined,
      hasDebugWithZoom: () => false,
    });

    controller.syncUrl();

    expect(replacements).toEqual([{
      line: active.id,
      direction: "direction:west",
      mergeDirections: "0",
    }]);

    query.line = active.id;
    delete query.mergeDirections;
    directionState.filterRequested = false;
    directionState.selectedDirectionId = undefined;
    directionState.mergeEnabled = false;
    directionState.ready = false;
    controller.syncUrl();

    expect(replacements.at(-1)).toEqual({ line: active.id });
  });
});
