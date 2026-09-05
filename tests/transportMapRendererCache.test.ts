import { describe, expect, it, vi } from "vitest";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { worldToScreen } from "../src/features/transport-map/geo/coordinateKernel";
import { Canvas2dRenderer } from "../src/features/transport-map/render/canvas2d/canvas2dRenderer";
import type { TransportMapRenderScene } from "../src/features/transport-map/contracts/renderer";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../src/features/transport-map/config/globalTransportPlanConfig";
import { GLOBAL_TRANSPORT_PLAN_STATION_DETAIL_ZOOM } from "../src/features/transport-map/render/stationNodeVisibility";

describe("transport map Canvas2D interaction cache", () => {
  it("draws hovered ghost-line nodes without adding station labels", () => {
    const context = createContext();
    const canvas = createCanvas(context);
    const renderer = new Canvas2dRenderer();
    renderer.mount(canvas);
    renderer.resize(200, 100, 1);

    const ghostStation = {
      id: "station:ghost",
      index: 1,
      name: "Station fantôme",
      normalizedName: "station fantome",
      aliases: [],
      rawRefs: [],
      lineIds: ["line:ghost"],
      ownerChunkId: "chunk:0:0",
      isHub: false,
      sourceCrs: "EPSG:2154" as const,
      sourceX: 0,
      sourceY: 0,
      lon: 2.35,
      lat: 48.85,
      worldX: 0.5001,
      worldY: 0.35,
      coordinateSource: "netex" as const,
      transformVersion: "lambert93-ntf-v1" as const,
    };
    const activeLine = {
      id: "line:active",
      index: 0,
      code: "1",
      label: "1",
      mode: "METRO" as const,
      color: "#111111",
      textColor: "#ffffff",
      aliases: [],
      stationIds: ["station:active"],
      geometryIds: [],
    };
    const ghostLine = {
      ...activeLine,
      id: "line:ghost",
      index: 1,
      code: "21",
      label: "21",
      mode: "BUS" as const,
      color: "#0f766e",
      stationIds: [ghostStation.id],
    };
    const ghostPath = {
      id: "path:ghost",
      lineId: ghostLine.id,
      geometrySource: "gtfs" as const,
      sourceVersion: "fixture",
      quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
      stationIds: [ghostStation.id],
      vertices: [
        { x: ghostStation.worldX - 0.01, y: ghostStation.worldY },
        { stationId: ghostStation.id, x: ghostStation.worldX, y: ghostStation.worldY },
      ],
      minX: ghostStation.worldX - 0.01,
      minY: ghostStation.worldY,
      maxX: ghostStation.worldX,
      maxY: ghostStation.worldY,
      chunkIds: ["chunk:0:0"],
    };

    const camera = createCamera({
      centerWorldX: 0.5,
      centerWorldY: 0.35,
      zoom: 8,
      viewportWidthCssPx: 200,
      viewportHeightCssPx: 100,
    });
    renderer.render(camera, {
      lines: [activeLine, ghostLine],
      paths: [ghostPath],
      stations: [ghostStation],
      activeLineId: activeLine.id,
      hoveredLineId: ghostLine.id,
      ghostLineIds: [ghostLine.id],
      selectedStationIds: [],
      visibleModeMask: (1 << 0) | (1 << 1),
    });

    expect(context.arc.mock.calls.some((call) =>
      call[2] === GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.detailStationRadius,
    )).toBe(true);
    expect(context.fillText.mock.calls.some((call) => call[0] === ghostStation.name)).toBe(false);
    renderer.dispose();
  });

  it("renders every station of the active line below the overview detail zoom", () => {
    const context = createContext();
    const station = {
      id: "station:active",
      index: 0,
      name: "Station active",
      normalizedName: "station active",
      aliases: [],
      rawRefs: [],
      lineIds: ["line:active"],
      ownerChunkId: "chunk:active",
      isHub: false,
      sourceCrs: "EPSG:2154" as const,
      sourceX: 0,
      sourceY: 0,
      lon: 2.35,
      lat: 48.85,
      worldX: 0.5,
      worldY: 0.35,
      coordinateSource: "netex" as const,
      transformVersion: "lambert93-ntf-v1" as const,
    };
    const line = {
      id: "line:active",
      index: 0,
      code: "T2",
      label: "T2",
      mode: "TRAM" as const,
      color: "#111111",
      textColor: "#ffffff",
      aliases: [],
      stationIds: [station.id],
      geometryIds: [],
    };
    const renderer = new Canvas2dRenderer();
    renderer.mount(createCanvas(context));
    renderer.resize(200, 100, 1);

    renderer.render(
      createCamera({
        centerWorldX: station.worldX,
        centerWorldY: station.worldY,
        zoom: GLOBAL_TRANSPORT_PLAN_STATION_DETAIL_ZOOM - 1,
        viewportWidthCssPx: 200,
        viewportHeightCssPx: 100,
      }),
      {
        lines: [line],
        paths: [],
        stations: [station],
        activeLineId: line.id,
        selectedStationIds: [],
        visibleModeMask: 1 << 4,
        ghostLineIds: [],
      },
    );

    expect(context.arc.mock.calls.some((call) =>
      call[2] === GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.detailStationRadius,
    )).toBe(true);
    renderer.dispose();
  });

  it("caps heavy overview strokes and restores their detailed width", () => {
    const context = createContext();
    const lineWidthWrites: number[] = [];
    let currentLineWidth = 1;
    Object.defineProperty(context, "lineWidth", {
      configurable: true,
      get: () => currentLineWidth,
      set: (value: number) => {
        currentLineWidth = value;
        lineWidthWrites.push(value);
      },
    });
    const canvas = createCanvas(context);
    const renderer = new Canvas2dRenderer();
    renderer.mount(canvas);
    renderer.resize(200, 100, 1);

    const line = {
      id: "line:rer",
      index: 0,
      code: "A",
      label: "RER A",
      mode: "RER" as const,
      color: "#cc0033",
      textColor: "#ffffff",
      aliases: [],
      stationIds: [],
      geometryIds: ["path:rer"],
    };
    const path = {
      id: "path:rer",
      lineId: line.id,
      geometrySource: "gtfs" as const,
      sourceVersion: "fixture",
      quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
      stationIds: [],
      vertices: [{ x: 0.49, y: 0.35 }, { x: 0.51, y: 0.35 }],
      minX: 0.49,
      minY: 0.35,
      maxX: 0.51,
      maxY: 0.35,
      chunkIds: ["chunk:0:0"],
    };
    const scene: TransportMapRenderScene = {
      lines: [line],
      paths: [path],
      stations: [],
      selectedStationIds: [],
      visibleModeMask: 1 << 2,
    };

    renderer.render(createCamera({ centerWorldX: 0.5, centerWorldY: 0.35, zoom: 8, viewportWidthCssPx: 200, viewportHeightCssPx: 100 }), scene);
    expect(lineWidthWrites).toContain(GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.overviewHeavyLineWidthMaxCssPx);

    const detailedWritesStart = lineWidthWrites.length;
    renderer.render(createCamera({ centerWorldX: 0.5, centerWorldY: 0.35, zoom: 15, viewportWidthCssPx: 200, viewportHeightCssPx: 100 }), scene);
    expect(lineWidthWrites.slice(detailedWritesStart)).toContain(
      GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.modeLineWidth.RER,
    );
    renderer.dispose();
  });

  it("renders a hovered normal line last with a stronger stroke", () => {
    const context = createContext();
    const strokeRecords: Array<{ color: string; width: number; alpha: number }> = [];
    context.stroke.mockImplementation(() => {
      strokeRecords.push({
        color: String(context.strokeStyle),
        width: context.lineWidth,
        alpha: context.globalAlpha,
      });
    });
    const canvas = createCanvas(context);
    const renderer = new Canvas2dRenderer();
    renderer.mount(canvas);
    renderer.resize(200, 100, 1);

    const firstLine = {
      id: "line:first",
      index: 0,
      code: "1",
      label: "1",
      mode: "METRO" as const,
      color: "#111111",
      textColor: "#ffffff",
      aliases: [],
      stationIds: [],
      geometryIds: ["path:first"],
    };
    const secondLine = {
      ...firstLine,
      id: "line:second",
      index: 1,
      code: "2",
      label: "2",
      color: "#222222",
      geometryIds: ["path:second"],
    };
    const firstPath = {
      id: "path:first",
      lineId: firstLine.id,
      geometrySource: "gtfs" as const,
      sourceVersion: "fixture",
      quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
      stationIds: [],
      vertices: [{ x: 0.49, y: 0.35 }, { x: 0.51, y: 0.35 }],
      minX: 0.49,
      minY: 0.35,
      maxX: 0.51,
      maxY: 0.35,
      chunkIds: ["chunk:0:0"],
    };
    const secondPath = { ...firstPath, id: "path:second", lineId: secondLine.id };
    renderer.render(createCamera({ centerWorldX: 0.5, centerWorldY: 0.35, zoom: 8, viewportWidthCssPx: 200, viewportHeightCssPx: 100 }), {
      lines: [firstLine, secondLine],
      paths: [firstPath, secondPath],
      stations: [],
      selectedStationIds: [],
      visibleModeMask: 1 << 1,
      hoveredLineId: firstLine.id,
    });

    expect(strokeRecords).toHaveLength(2);
    expect(strokeRecords[1]).toMatchObject({
      color: firstLine.color,
      width: Math.min(
        GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.modeLineWidth.METRO,
        GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.overviewHeavyLineWidthMaxCssPx,
      ) + GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.hoveredLineWidthBoostCssPx,
      alpha: GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.hoveredLineAlpha,
    });
    renderer.dispose();
  });

  it("blits only the bounded path cache while keeping station coordinates exact", () => {
    const mainContext = createContext();
    const alphaWrites: number[] = [];
    let currentAlpha = 1;
    Object.defineProperty(mainContext, "globalAlpha", {
      configurable: true,
      get: () => currentAlpha,
      set: (value: number) => {
        currentAlpha = value;
        alphaWrites.push(value);
      },
    });
    const cacheContext = createContext();
    const cacheCanvas = createCanvas(cacheContext);
    const ownerDocument = { createElement: vi.fn(() => cacheCanvas) };
    const canvas = createCanvas(mainContext, ownerDocument);
    const renderer = new Canvas2dRenderer();
    renderer.mount(canvas);
    expect(canvas.getContext).toHaveBeenCalledWith("2d");
    renderer.resize(200, 100, 2);

    const station = {
      id: "station:hub",
      index: 0,
      name: "Hub",
      normalizedName: "hub",
      aliases: [],
      rawRefs: [],
      lineIds: ["line:1", "line:2", "line:3"],
      ownerChunkId: "chunk:0:0",
      isHub: true,
      sourceCrs: "EPSG:2154" as const,
      sourceX: 0,
      sourceY: 0,
      lon: 2.35,
      lat: 48.85,
      worldX: 0.5,
      worldY: 0.35,
      coordinateSource: "netex" as const,
      transformVersion: "lambert93-ntf-v1" as const,
    };
    const line = {
      id: "line:1",
      index: 0,
      code: "1",
      label: "1",
      mode: "METRO" as const,
      color: "#111111",
      textColor: "#ffffff",
      aliases: [],
      stationIds: [station.id],
      geometryIds: ["path:1"],
    };
    const scene: TransportMapRenderScene = {
      lines: [line],
      paths: [{
        id: "path:1",
        lineId: line.id,
        geometrySource: "gtfs",
        sourceVersion: "fixture",
        quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
        stationIds: [station.id],
        vertices: [{ x: 0.49, y: 0.35 }, { x: 0.51, y: 0.35 }],
        minX: 0.49,
        minY: 0.35,
        maxX: 0.51,
        maxY: 0.35,
        chunkIds: ["chunk:0:0"],
      }],
      stations: [station],
      hoveredStationId: station.id,
      selectedStationIds: [],
      ghostLineIds: [line.id],
      visibleModeMask: 1 << 1,
    };
    const firstCamera = createCamera({ centerWorldX: 0.5, centerWorldY: 0.35, zoom: 8, viewportWidthCssPx: 200, viewportHeightCssPx: 100, pixelRatio: 2 });
    const secondCamera = createCamera({ ...firstCamera, centerWorldX: 0.5004, centerWorldY: 0.3498, zoom: 9 });

    renderer.render(firstCamera, scene);
    expect(alphaWrites).toContain(GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.ghostLineAlpha);
    const alphaWritesBeforeHover = alphaWrites.length;
    renderer.render(firstCamera, { ...scene, hoveredLineId: line.id });
    expect(alphaWrites.slice(alphaWritesBeforeHover)).not.toContain(
      GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.ghostLineAlpha,
    );
    expect(alphaWrites.slice(alphaWritesBeforeHover)).toContain(
      GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.hoveredGhostLineAlpha,
    );
    renderer.render(firstCamera, scene);
    expect(mainContext.setLineDash).not.toHaveBeenCalledWith([4, 3]);
    const mainDrawImageCallsBeforeInteraction = mainContext.drawImage.mock.calls.length;
    renderer.render(secondCamera, { ...scene, interactionActive: true });

    expect(mainContext.drawImage.mock.calls.length).toBe(mainDrawImageCallsBeforeInteraction + 1);
    const stationArc = [...mainContext.arc.mock.calls].at(-1);
    const expected = worldToScreen({ x: station.worldX, y: station.worldY }, secondCamera);
    expect(stationArc?.[0]).toBeCloseTo(expected.x, 10);
    expect(stationArc?.[1]).toBeCloseTo(expected.y, 10);
    expect(mainContext.arc.mock.calls.some((call) => call[2] === 9)).toBe(true);
    expect(cacheCanvas.width).toBe(200 * 1.5);
    expect(cacheCanvas.height).toBe(100 * 1.5);
    expect(renderer.getMetrics().cacheBytes).toBe(200 * 100 * 1.5 * 1.5 * 4);
    renderer.dispose();

    const focusedRenderer = new Canvas2dRenderer();
    focusedRenderer.mount(canvas);
    focusedRenderer.resize(200, 100, 2);
    const focusedScene = {
      ...scene,
      stations: [{ ...station, isHub: false }],
      activeLineId: line.id,
      ghostLineIds: [],
    };
    focusedRenderer.render(firstCamera, focusedScene);
    expect(mainContext.arc.mock.calls.length).toBeGreaterThan(0);
    const cacheDrawImageCallsBeforeFocusedInteraction = cacheContext.drawImage.mock.calls.length;
    const drawImageCallsBeforeFocusedInteraction = mainContext.drawImage.mock.calls.length;
    const strokeCallsBeforeFocusedInteraction = mainContext.stroke.mock.calls.length;
    const clearRectCallsBeforeFocusedInteraction = mainContext.clearRect.mock.calls.length;
    focusedRenderer.render(secondCamera, { ...focusedScene, interactionActive: true });

    // Every focused path remains exact during the gesture. In particular,
    // neither a main-canvas cache blit nor a full-canvas cache capture occurs.
    expect(mainContext.drawImage.mock.calls.length).toBe(drawImageCallsBeforeFocusedInteraction);
    expect(cacheContext.drawImage.mock.calls.length).toBe(cacheDrawImageCallsBeforeFocusedInteraction);
    expect(mainContext.stroke.mock.calls.length).toBeGreaterThan(strokeCallsBeforeFocusedInteraction);
    // The focused flight redraws after applying the CSS-space transform. The
    // clear must still cover the physical backing buffer at DPR 2, otherwise
    // each intermediate line position remains painted in the unused strip.
    expect(mainContext.clearRect.mock.calls.slice(clearRectCallsBeforeFocusedInteraction)).toContainEqual([
      0,
      0,
      400,
      200,
    ]);
    expect(focusedRenderer.getMetrics().focusedLineLiveRedraw).toBe(true);
    expect(focusedRenderer.getMetrics().pathCacheCaptureCount).toBe(0);
    expect(focusedRenderer.getMetrics().pathCacheCapturedBytes).toBe(0);

    focusedRenderer.render(secondCamera, focusedScene);
    expect(cacheContext.drawImage.mock.calls.length).toBe(cacheDrawImageCallsBeforeFocusedInteraction + 1);
    expect(focusedRenderer.getMetrics().focusedLineLiveRedraw).toBe(false);
    expect(focusedRenderer.getMetrics().pathCacheCaptureCount).toBe(1);
    expect(focusedRenderer.getMetrics().pathCacheCapturedBytes).toBeGreaterThan(0);
    focusedRenderer.dispose();
  });

  it("clears the previous line before redrawing the next line during a camera flight", () => {
    const context = createContext();
    const strokeColors: string[] = [];
    context.stroke.mockImplementation(() => {
      strokeColors.push(String(context.strokeStyle));
    });
    const canvas = createCanvas(context);
    const renderer = new Canvas2dRenderer();
    renderer.mount(canvas);
    renderer.resize(200, 100, 1);

    const firstLine = {
      id: "line:first",
      index: 0,
      code: "T2",
      label: "T2",
      mode: "TRAM" as const,
      color: "#111111",
      textColor: "#ffffff",
      aliases: [],
      stationIds: [],
      geometryIds: ["path:first"],
    };
    const secondLine = {
      ...firstLine,
      id: "line:second",
      code: "T10",
      label: "T10",
      color: "#e11d48",
      geometryIds: ["path:second"],
    };
    const firstPath = {
      id: "path:first",
      lineId: firstLine.id,
      geometrySource: "gtfs" as const,
      sourceVersion: "fixture",
      quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
      stationIds: [],
      vertices: [{ x: 0.49, y: 0.35 }, { x: 0.51, y: 0.35 }],
      minX: 0.49,
      minY: 0.35,
      maxX: 0.51,
      maxY: 0.35,
      chunkIds: ["chunk:first"],
    };
    const secondPath = {
      ...firstPath,
      id: "path:second",
      lineId: secondLine.id,
      vertices: [{ x: 0.5, y: 0.34 }, { x: 0.5, y: 0.36 }],
      minY: 0.34,
      maxY: 0.36,
      chunkIds: ["chunk:second"],
    };
    const camera = createCamera({
      centerWorldX: 0.5,
      centerWorldY: 0.35,
      zoom: 8,
      viewportWidthCssPx: 200,
      viewportHeightCssPx: 100,
    });
    const firstScene: TransportMapRenderScene = {
      lines: [firstLine, secondLine],
      paths: [firstPath],
      stations: [],
      activeLineId: firstLine.id,
      selectedStationIds: [],
      visibleModeMask: 1 << 4,
    };
    const secondScene: TransportMapRenderScene = {
      ...firstScene,
      paths: [secondPath],
      activeLineId: secondLine.id,
      interactionActive: true,
    };

    renderer.render(camera, firstScene);
    const clearCallsBeforeSwitch = context.clearRect.mock.calls.length;
    const strokesBeforeSwitch = strokeColors.length;
    renderer.render(camera, secondScene);

    expect(context.clearRect.mock.calls.slice(clearCallsBeforeSwitch)).toContainEqual([0, 0, 200, 100]);
    expect(strokeColors.slice(strokesBeforeSwitch)).toContain(secondLine.color);
    expect(renderer.getMetrics().focusedLineLiveRedraw).toBe(true);
    renderer.dispose();
  });

  it("renders coarse and exact traffic styles on existing geometry and stations", () => {
    const context = createContext();
    const strokes: Array<{ color: string; dash: number[] }> = [];
    let currentDash: number[] = [];
    context.setLineDash.mockImplementation((dash) => { currentDash = [...dash]; });
    context.stroke.mockImplementation(() => {
      strokes.push({ color: String(context.strokeStyle), dash: currentDash });
    });
    const fills: string[] = [];
    context.fill.mockImplementation(() => { fills.push(String(context.fillStyle)); });
    const renderer = new Canvas2dRenderer();
    renderer.mount(createCanvas(context));
    renderer.resize(600, 120, 1);
    const { line, path, stations } = createTrafficFixture();
    const camera = createCamera({
      centerWorldX: 0.5,
      centerWorldY: 0.35,
      zoom: GLOBAL_TRANSPORT_PLAN_STATION_DETAIL_ZOOM,
      viewportWidthCssPx: 600,
      viewportHeightCssPx: 120,
    });

    renderer.render(camera, {
      lines: [line],
      paths: [path],
      stations: [],
      selectedStationIds: [],
      visibleModeMask: 1 << 4,
      interruptionLineIds: [line.id],
    });
    expect(strokes.at(-1)).toEqual({ color: "#ef4444", dash: [10, 12] });

    strokes.length = 0;
    renderer.render(camera, {
      lines: [line],
      paths: [path],
      stations,
      activeLineId: line.id,
      selectedStationIds: [],
      visibleModeMask: 1 << 4,
      interruptedStationIds: [stations[1]!.id],
      disturbedStationIds: [stations[0]!.id],
      trafficPathSpans: [
        { pathId: path.id, startVertexIndex: 0, endVertexIndex: 2, kind: "disturbance", disruptionId: "orange" },
        { pathId: path.id, startVertexIndex: 2, endVertexIndex: 4, kind: "interruption", disruptionId: "red" },
      ],
    });

    expect(strokes.slice(0, 3)).toEqual([
      { color: "#f59e0b", dash: [] },
      { color: "#fee2e2", dash: [] },
      { color: "#ef4444", dash: [10, 12] },
    ]);
    expect(fills.filter((color) => color === "rgba(255, 255, 255, 0.96)")).toHaveLength(2);
    expect(strokes.filter((record) => record.color === "#ef4444").length).toBeGreaterThanOrEqual(2);
    renderer.dispose();
  });

  it("invalidates the interaction path cache only when traffic inputs change", () => {
    const mainContext = createContext();
    const cacheContext = createContext();
    const cacheCanvas = createCanvas(cacheContext);
    const renderer = new Canvas2dRenderer();
    renderer.mount(createCanvas(mainContext, { createElement: () => cacheCanvas }));
    renderer.resize(300, 120, 1);
    const { line, path } = createTrafficFixture();
    const camera = createCamera({
      centerWorldX: 0.5,
      centerWorldY: 0.35,
      zoom: 8,
      viewportWidthCssPx: 300,
      viewportHeightCssPx: 120,
    });
    const interruptionLineIds = [line.id];
    const scene: TransportMapRenderScene = {
      lines: [line],
      paths: [path],
      stations: [],
      selectedStationIds: [],
      visibleModeMask: 1 << 4,
      interruptionLineIds,
    };

    renderer.render(camera, scene);
    renderer.render(camera, { ...scene, interactionActive: true });
    expect(mainContext.drawImage).toHaveBeenCalledTimes(1);

    renderer.render(camera, {
      ...scene,
      interactionActive: true,
      interruptionLineIds: [],
      disturbanceLineIds: interruptionLineIds,
    });
    expect(mainContext.drawImage).toHaveBeenCalledTimes(1);
    expect(mainContext.stroke).toHaveBeenCalled();
    renderer.dispose();
  });
});

function createTrafficFixture() {
  const line = {
    id: "line:IDFM:C01730",
    index: 0,
    code: "P",
    label: "Transilien P",
    mode: "TRANSILIEN" as const,
    color: "#7b1791",
    textColor: "#ffffff",
    aliases: [],
    stationIds: ["station:a", "station:b", "station:c"],
    geometryIds: ["path:p"],
  };
  const stations = [
    createTrafficStation("station:a", 0, 0.49995),
    createTrafficStation("station:b", 1, 0.5),
    createTrafficStation("station:c", 2, 0.50005),
  ];
  const path = {
    id: "path:p",
    lineId: line.id,
    geometrySource: "gtfs" as const,
    sourceVersion: "fixture",
    quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
    stationIds: stations.map(({ id }) => id),
    vertices: [
      { stationId: stations[0]!.id, x: 0.49995, y: 0.35 },
      { x: 0.499975, y: 0.35 },
      { stationId: stations[1]!.id, x: 0.5, y: 0.35 },
      { x: 0.500025, y: 0.35 },
      { stationId: stations[2]!.id, x: 0.50005, y: 0.35 },
    ],
    minX: 0.49995,
    minY: 0.35,
    maxX: 0.50005,
    maxY: 0.35,
    chunkIds: ["chunk:p"],
  };
  return { line, path, stations };
}

function createTrafficStation(id: string, index: number, worldX: number) {
  return {
    id,
    index,
    name: id,
    normalizedName: id,
    aliases: [],
    rawRefs: [],
    lineIds: ["line:IDFM:C01730"],
    ownerChunkId: "chunk:p",
    isHub: false,
    sourceCrs: "EPSG:2154" as const,
    sourceX: index,
    sourceY: 0,
    lon: 2.35,
    lat: 48.85,
    worldX,
    worldY: 0.35,
    coordinateSource: "netex" as const,
    transformVersion: "lambert93-ntf-v1" as const,
  };
}

function createContext() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    setLineDash: vi.fn(),
    lineCap: "round",
    lineJoin: "round",
    globalAlpha: 1,
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D & {
    clearRect: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
    arc: ReturnType<typeof vi.fn>;
    stroke: ReturnType<typeof vi.fn>;
    fill: ReturnType<typeof vi.fn>;
    fillText: ReturnType<typeof vi.fn>;
    setLineDash: ReturnType<typeof vi.fn>;
  };
}

function createCanvas(
  context: CanvasRenderingContext2D,
  ownerDocument?: { createElement: () => HTMLCanvasElement },
): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    style: {},
    ownerDocument,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;
}
