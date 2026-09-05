import { describe, expect, it, vi } from "vitest";
import type { GlobalMapLine, GlobalMapPath } from "../src/features/transport-map/contracts/manifest";
import type { TransportMapRenderScene } from "../src/features/transport-map/contracts/renderer";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { worldToScreen } from "../src/features/transport-map/geo/coordinateKernel";
import { Canvas2dRenderer } from "../src/features/transport-map/render/canvas2d/canvas2dRenderer";
import { hitTestTransportMap } from "../src/features/transport-map/spatial/hitTest";
import { PackedSpatialIndex, buildPathSpatialIndex } from "../src/features/transport-map/spatial/packedIndex";

const line: GlobalMapLine = {
  id: "line:fragment-fixture",
  index: 0,
  code: "F",
  label: "Fragment fixture",
  mode: "METRO",
  color: "#4338ca",
  textColor: "#ffffff",
  aliases: ["F"],
  stationIds: [],
  geometryIds: ["path:fragment-fixture"],
};

const path: GlobalMapPath = {
  id: "path:fragment-fixture",
  lineId: line.id,
  geometrySource: "gtfs",
  sourceVersion: "fixture",
  quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
  stationIds: [],
  vertices: [
    { x: 0.49, y: 0.5 },
    { x: 0.495, y: 0.5 },
    { x: 0.505, y: 0.5 },
    { x: 0.51, y: 0.5 },
  ],
  subpathStarts: [0, 2],
  minX: 0.49,
  minY: 0.5,
  maxX: 0.51,
  maxY: 0.5,
  chunkIds: ["chunk:fragment-fixture"],
};

describe("global transport map clipped subpaths", () => {
  it("does not hit-test the artificial gap between two clipped fragments", () => {
    const camera = createCamera({
      centerWorldX: 0.5,
      centerWorldY: 0.5,
      zoom: 15,
      viewportWidthCssPx: 600,
      viewportHeightCssPx: 400,
    });
    const pathIndex = buildPathSpatialIndex([path]);
    const emptyIndex = new PackedSpatialIndex([]);

    const gapResult = hitTestTransportMap(
      worldToScreen({ x: 0.5, y: 0.5 }, camera),
      camera,
      [],
      [line],
      [path],
      emptyIndex,
      pathIndex,
      { modeMask: 1 << 1 },
    );
    expect(gapResult).toBeUndefined();

    const lineResult = hitTestTransportMap(
      worldToScreen({ x: 0.4925, y: 0.5 }, camera),
      camera,
      [],
      [line],
      [path],
      emptyIndex,
      pathIndex,
      { modeMask: 1 << 1 },
    );
    expect(lineResult).toMatchObject({ type: "line", id: line.id });
  });

  it("strokes each clipped fragment as its own Canvas2D path", () => {
    const context = createContext();
    const cacheContext = createContext();
    const cacheCanvas = createCanvas(cacheContext);
    const canvas = createCanvas(context, { createElement: vi.fn(() => cacheCanvas) });
    const renderer = new Canvas2dRenderer();
    renderer.mount(canvas);
    renderer.resize(600, 400, 1);

    const scene: TransportMapRenderScene = {
      lines: [line],
      paths: [path],
      stations: [],
      selectedStationIds: [],
      visibleModeMask: 1 << 1,
    };
    const camera = createCamera({
      centerWorldX: 0.5,
      centerWorldY: 0.5,
      zoom: 15,
      viewportWidthCssPx: 600,
      viewportHeightCssPx: 400,
    });

    renderer.render(camera, scene);

    expect(context.beginPath).toHaveBeenCalledTimes(2);
    expect(context.stroke).toHaveBeenCalledTimes(2);
    expect(renderer.getMetrics()).toMatchObject({ drawCalls: 2, visiblePathCount: 1 });
    renderer.dispose();
  });
});

function createContext() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    setLineDash: vi.fn(),
    lineCap: "round",
    lineJoin: "round",
    globalAlpha: 1,
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
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
