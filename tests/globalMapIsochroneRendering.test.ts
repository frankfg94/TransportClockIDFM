import { afterEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";
import { createCamera } from "../src/features/transport-map/geo/camera";
import * as kernel from "../src/features/transport-map/geo/coordinateKernel";
import { GlobalIsochroneCanvasLayer } from "../src/features/transport-map/isochrones/canvasLayer";
import type { GlobalIsochroneSurface } from "../src/features/transport-map/isochrones/contracts";
import { Canvas2dRenderer } from "../src/features/transport-map/render/canvas2d/canvas2dRenderer";
import { TransportMapRenderModelBuilder } from "../src/features/transport-map/render/transportMapRenderModel";
import { createDeckTransportLayers } from "../src/features/transport-map/next/deckMapLayers";
import { MapLibreDeckOverlayPresenter } from "../src/features/transport-map/next/deckMapPresenter";
import type { TransportMapRenderScene } from "../src/features/transport-map/contracts/renderer";
import { useGlobalTransportScene, type UseGlobalTransportSceneOptions } from "../src/features/line-map/useGlobalTransportScene";
import { walkingPolygon, walkingRing } from "./fixtures/walkingIsochrones";

afterEach(() => vi.restoreAllMocks());

function fixture() {
  const center = kernel.lonLatToWorld({ lon: 2.35, lat: 48.85 });
  const camera = createCamera({ centerWorldX: center.x, centerWorldY: center.y, zoom: 13, viewportWidthCssPx: 1000, viewportHeightCssPx: 700 });
  const surfaces: GlobalIsochroneSurface[] = [{ id: "metro-10", mode: "METRO", minutes: 10, geometry: walkingPolygon(2.35, 48.85, true) }];
  const scene: TransportMapRenderScene = {
    lines: [{ id: "line:1", index: 0, code: "1", label: "1", mode: "METRO", color: "#112233", textColor: "#fff", aliases: [], stationIds: [], geometryIds: ["path:1"] }],
    paths: [{ id: "path:1", lineId: "line:1", stationIds: [], vertices: [{ x: center.x - 0.00001, y: center.y }, { x: center.x + 0.00001, y: center.y }], geometrySource: "gtfs", sourceVersion: "test", quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 }, minX: center.x - 0.00001, maxX: center.x + 0.00001, minY: center.y, maxY: center.y, chunkIds: [] }],
    stations: [], selectedStationIds: [], visibleModeMask: 0xffff, walkingIsochrones: surfaces,
  };
  return { camera, surfaces, scene };
}

function context() {
  return { save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(), setLineDash: vi.fn(), arc: vi.fn(), fillText: vi.fn(), measureText: vi.fn(() => ({ width: 10 })), globalAlpha: 1, fillStyle: "", strokeStyle: "", lineWidth: 1 };
}

describe("walking areas in both map engines", () => {
  it("projects Canvas contours like stations, draws holes, and prepares geometry only once across pan/zoom", () => {
    const { camera, surfaces } = fixture();
    surfaces[0]!.geometry = { type: "MultiPolygon", coordinates: [[walkingRing(), walkingRing(2.35, 48.85, 0.0005)], [walkingRing(2.36, 48.85)]] };
    const expected = kernel.worldToScreen(kernel.lonLatToWorld({ lon: 2.348, lat: 48.848 }), camera);
    const projection = vi.spyOn(kernel, "lonLatToWorld");
    const layer = new GlobalIsochroneCanvasLayer();
    const ctx = context();
    expect(layer.draw(ctx as unknown as CanvasRenderingContext2D, camera, surfaces)).toBe(4);
    expect(ctx.moveTo.mock.calls[0]?.[0]).toBeCloseTo(expected.x, 8);
    expect(ctx.moveTo.mock.calls[0]?.[1]).toBeCloseTo(expected.y, 8);
    expect(ctx.closePath).toHaveBeenCalledTimes(3);
    expect(ctx.fill.mock.calls).toEqual([["evenodd"], ["evenodd"]]);
    expect(projection).toHaveBeenCalledTimes(15);
    for (let i = 0; i < 20; i += 1) layer.draw(ctx as unknown as CanvasRenderingContext2D, { ...camera, zoom: 13 + i / 20, centerWorldX: camera.centerWorldX + i / 1_000_000 }, surfaces);
    expect(projection).toHaveBeenCalledTimes(15);
    layer.clear();
  });

  it("emphasizes the border of the hovered walking area", () => {
    const { camera, surfaces } = fixture();
    const ctx = context();
    const layer = new GlobalIsochroneCanvasLayer();

    layer.draw(ctx as unknown as CanvasRenderingContext2D, camera, surfaces, [surfaces[0]!.id]);

    expect(ctx.strokeStyle).toBe("rgba(29, 78, 216, 0.92)");
    expect(ctx.lineWidth).toBe(2);
  });

  it("draws Canvas areas below paths and invalidates its snapshot when radar is disabled", () => {
    const { scene, camera } = fixture();
    const ctx = context();
    const cache = context();
    const colors: string[] = [];
    ctx.fill.mockImplementation(() => { colors.push(ctx.fillStyle); });
    ctx.stroke.mockImplementation(() => { colors.push(ctx.strokeStyle); });
    const cacheCanvas = { width: 0, height: 0, style: {}, getContext: () => cache };
    const canvas = { width: 0, height: 0, style: {}, ownerDocument: { createElement: () => cacheCanvas }, getContext: () => ctx };
    const renderer = new Canvas2dRenderer();
    renderer.mount(canvas as unknown as HTMLCanvasElement);
    renderer.resize(1000, 700, 1);
    renderer.render(camera, scene);
    expect(colors[0]).toBe("rgba(59, 130, 246, 0.14)");
    expect(colors.indexOf("#112233")).toBeGreaterThan(0);
    renderer.render(camera, { ...scene, interactionActive: true });
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    ctx.fill.mockClear();
    renderer.render(camera, { ...scene, walkingIsochrones: [], interactionActive: true });
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.fill).not.toHaveBeenCalled();
    renderer.dispose();
  });

  it("uses the same WGS84 polygons in Deck, below lines and with picking disabled", () => {
    const { scene, camera, surfaces } = fixture();
    const builder = new TransportMapRenderModelBuilder();
    const model = builder.build(camera, scene);
    const frame = { camera, scene, model };
    const layers = createDeckTransportLayers(frame, "labels");
    expect(layers[0]?.id).toBe("transport-walking-isochrones");
    expect(layers[1]?.id).toContain("transport-base");
    const props = layers[0]!.props as unknown as { data: { features: Array<{ geometry: unknown }> }; pickable: boolean; beforeId: string; getLineWidth: number };
    expect(props.data.features[0]?.geometry).toBe(surfaces[0]?.geometry);
    expect(props.pickable).toBe(false);
    expect(props.beforeId).toBe("labels");
    expect(props.getLineWidth).toBe(1);
    const hoveredScene = { ...scene, hoveredIsochroneIds: [surfaces[0]!.id] };
    const hoveredModel = builder.build(camera, hoveredScene);
    const hoveredProps = createDeckTransportLayers({ camera, scene: hoveredScene, model: hoveredModel }, "labels")[0]!.props as unknown as {
      getLineColor: (feature: { properties?: { surfaceId?: string } }) => number[];
      getLineWidth: (feature: { properties?: { surfaceId?: string } }) => number;
    };
    const hoveredFeature = { properties: { surfaceId: surfaces[0]!.id } };
    expect(hoveredProps.getLineColor(hoveredFeature)).toEqual([29, 78, 216, 235]);
    expect(hoveredProps.getLineWidth(hoveredFeature)).toBe(2);
    const hovering = builder.build(camera, { ...scene, hoveredLineId: "line:1" });
    expect(createDeckTransportLayers({ ...frame, model: hovering }, "labels")[0]!.props.data).toBe(props.data);
    const off = builder.build(camera, { ...scene, walkingIsochrones: [] });
    expect(off).not.toBe(model);
    expect(off.basePaths).toBe(model.basePaths); // no path recompilation for radar-only changes
    expect(createDeckTransportLayers({ ...frame, model: off }, "labels").some((layer) => layer.id === "transport-walking-isochrones")).toBe(false);
    builder.dispose();
  });

  it("does not rebuild Deck layers on camera-only frames with radar active", () => {
    const { scene, camera } = fixture();
    const builder = new TransportMapRenderModelBuilder();
    const model = builder.build(camera, scene);
    const overlay = { setProps: vi.fn() };
    const map = { getCenter: () => ({ lng: 2.35, lat: 48.85 }), getZoom: () => 12, jumpTo: vi.fn(), getStyle: () => ({ layers: [] }), triggerRepaint: vi.fn(), resize: vi.fn(), setPixelRatio: vi.fn() };
    const presenter = new MapLibreDeckOverlayPresenter(map as never, overlay);
    presenter.present({ scene, camera, model });
    for (let i = 1; i <= 10; i += 1) presenter.present({ scene, camera: { ...camera, zoom: 13 + i / 10, centerWorldX: camera.centerWorldX + i / 1_000_000 }, model });
    expect(overlay.setProps).toHaveBeenCalledTimes(1);
    presenter.dispose();
    builder.dispose();
  });

  it("updates radar over a selected-line interaction snapshot and suppresses it for itineraries", () => {
    const { scene, surfaces } = fixture();
    const current = shallowRef(surfaces);
    const preview = ref(false);
    const options = {
      getSelectedLineInteractionScene: () => scene,
      getItineraryPreviewActive: () => preview.value,
      getInteractionActive: () => true,
      getWalkingIsochrones: () => current.value,
    } as unknown as UseGlobalTransportSceneOptions;
    const state = useGlobalTransportScene(options);
    expect(state.renderScene.value.walkingIsochrones).toBe(surfaces);
    current.value = [];
    expect(state.renderScene.value.walkingIsochrones).toEqual([]);
    current.value = surfaces;
    preview.value = true;
    expect(state.renderScene.value.walkingIsochrones).toBeUndefined();
    expect(state.renderScene.value.paths).toEqual([]);
    preview.value = false;
    expect(state.renderScene.value.walkingIsochrones).toBe(surfaces);
  });
});
