import { describe, expect, it, vi } from "vitest";
import { createTransportMapExperience, createTransportMapRenderer } from "../src/features/transport-map/render/createRenderer";
import { createCamera } from "../src/features/transport-map/geo/camera";
import {
  lonLatToWorld,
  worldToScreen,
} from "../src/features/transport-map/geo/coordinateKernel";
import { TRANSPORT_MAP_PRECISION } from "../src/features/transport-map/geo/precisionContract";
import {
  cameraStateToMapLibreView,
  cameraZoomToMapLibreZoom,
  mapLibreZoomMatchesCamera,
} from "../src/features/transport-map/next/nextMapCamera";
import {
  DEFAULT_NEXT_VECTOR_STYLE_URL,
  diagnoseVectorStyle,
  resolveNextMapStyle,
} from "../src/features/transport-map/next/nextMapConfig";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../src/features/transport-map/config/globalTransportPlanConfig";
import { predictCameraAhead, predictCameraTarget } from "../src/features/transport-map/interaction/predictivePrefetch";
import { MapLibreDeckOverlayPresenter } from "../src/features/transport-map/next/deckMapPresenter";
import type { TransportMapRenderFrame, TransportMapRenderScene } from "../src/features/transport-map/contracts/renderer";
import { TransportMapRenderModelBuilder } from "../src/features/transport-map/render/transportMapRenderModel";

describe("transport map next factory and projection strategy", () => {
  it("keeps legacy as the default and selects Deck only for the next experience", () => {
    const legacy = createTransportMapExperience();
    const next = createTransportMapExperience("next");

    expect(legacy.kind).toBe("legacy");
    expect(legacy.basemap).toBe("legacy-raster");
    expect(legacy.rendererKind).toBe("canvas2d-main-thread");
    expect(legacy.createRenderer().kind).toBe("canvas2d-main-thread");

    expect(next.kind).toBe("next");
    expect(next.basemap).toBe("maplibre-vector");
    expect(next.rendererKind).toBe("deckgl-webgl2");
    expect(next.createRenderer().kind).toBe("webgl2");
    expect(createTransportMapRenderer().kind).toBe("canvas2d-main-thread");
    expect(createTransportMapRenderer().getMetrics().deck).toBeUndefined();
  });

  it("matches the 256px legacy world to MapLibre's 512px vector world", () => {
    for (const zoom of [8, 10, 12.5, 14, 16, 17, 19, 20]) {
      for (const [width, height, pixelRatio] of [[360, 800, 1], [1280, 720, 2], [412, 915, 3]] as const) {
        const camera = createCamera({
          centerWorldX: 0.008,
          centerWorldY: 0.149,
          zoom,
          viewportWidthCssPx: width,
          viewportHeightCssPx: height,
          pixelRatio,
        });
        const view = cameraStateToMapLibreView(camera);
        expect(cameraZoomToMapLibreZoom(zoom)).toBeCloseTo(zoom - 1, 12);
        expect(mapLibreZoomMatchesCamera(zoom, view.zoom)).toBe(true);

        for (const point of [
          { x: camera.centerWorldX, y: camera.centerWorldY },
          { x: camera.centerWorldX - 0.0005, y: camera.centerWorldY - 0.0004 },
          { x: camera.centerWorldX + 0.0007, y: camera.centerWorldY + 0.0006 },
          lonLatToWorld({ lon: 2.3522, lat: 48.8566 }),
          lonLatToWorld({ lon: 2.7, lat: 48.9 }),
        ]) {
          const expected = worldToScreen(point, camera);
          const pointLonLat = {
            lon: point.x * 360 - 180,
            lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * point.y))) * 180) / Math.PI,
          };
          const projectedWorld = lonLatToWorld(pointLonLat);
          const actual = {
            x: (projectedWorld.x - camera.centerWorldX) * 512 * 2 ** view.zoom + width / 2,
            y: (projectedWorld.y - camera.centerWorldY) * 512 * 2 ** view.zoom + height / 2,
          };
          expect(Math.hypot(actual.x - expected.x, actual.y - expected.y)).toBeLessThanOrEqual(
            TRANSPORT_MAP_PRECISION.webglAnchorCssPx,
          );
        }
      }
    }
  });

  it("accepts injected vector styles and rejects raster-only production styles", () => {
    const localStyle = {
      version: 8,
      sources: {},
      layers: [{ id: "background", type: "background" }],
    };
    expect(resolveNextMapStyle(undefined)).toBe(DEFAULT_NEXT_VECTOR_STYLE_URL);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.nextMap.vectorStyleUrl).toBe(DEFAULT_NEXT_VECTOR_STYLE_URL);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.nextMap.prefetch.enabled).toBe(false);
    expect(diagnoseVectorStyle(localStyle).valid).toBe(true);
    expect(diagnoseVectorStyle({
      version: 8,
      sources: { imagery: { type: "raster" } },
      layers: [{ id: "imagery", type: "raster", source: "imagery" }],
    }).valid).toBe(false);
    expect(diagnoseVectorStyle({
      version: 8,
      sources: { transport: { type: "vector" } },
      layers: [{ id: "roads", type: "line", source: "transport" }],
    }).vectorSourceIds).toEqual(["transport"]);
  });

  it("keeps prediction hints side-effect free and bounded to a short horizon", () => {
    const camera = createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 12, generation: 9 });
    const predicted = predictCameraAhead(camera, { x: 1, y: -0.5 }, { horizonMs: 280 });
    expect(predicted.generation).toBe(camera.generation);
    expect(predicted.centerWorldX).toBeLessThan(camera.centerWorldX);
    expect(predicted.centerWorldY).toBeGreaterThan(camera.centerWorldY);
    expect(camera.centerWorldX).toBe(0.5);

    const target = predictCameraTarget(camera, {
      centerWorldX: 0.8,
      centerWorldY: 0.2,
      zoom: 19,
    }, { maxZoomDelta: 2 });
    expect(target.centerWorldX).toBe(0.8);
    expect(target.centerWorldY).toBe(0.2);
    expect(target.zoom).toBe(14);
  });

  it("does not call Deck setProps again for camera-only frames", () => {
    let center = { lng: 0, lat: 0 };
    let zoom = 11;
    const map = {
      getCenter: () => center,
      getZoom: () => zoom,
      jumpTo: vi.fn((view: { center: [number, number]; zoom: number }) => {
        center = { lng: view.center[0], lat: view.center[1] };
        zoom = view.zoom;
      }),
      getStyle: () => ({ layers: [] }),
      triggerRepaint: vi.fn(),
      setPixelRatio: vi.fn(),
      resize: vi.fn(),
    };
    const overlay = { setProps: vi.fn() };
    const presenter = new MapLibreDeckOverlayPresenter(map as never, overlay);
    const camera = createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 12 });
    const model = {
      sceneVersion: 1,
      pathCount: 0,
      vertexCount: 0,
      basePaths: [],
      trafficPaths: [],
      highlightPaths: [],
      stations: [],
      quays: [],
      entrances: [],
      labels: [],
    } as const;
    const frame: TransportMapRenderFrame = {
      camera,
      scene: {} as TransportMapRenderScene,
      model,
    };

    presenter.present(frame);
    presenter.present({
      ...frame,
      camera: { ...camera, centerWorldX: camera.centerWorldX + 0.001 },
    });

    expect(overlay.setProps).toHaveBeenCalledTimes(1);
    expect(presenter.getPresentationMetrics().setPropsCount).toBe(1);
    expect(map.jumpTo).toHaveBeenCalledTimes(1);

    presenter.present({
      ...frame,
      model: { ...model, sceneVersion: 2, labels: [{
        id: "label:1",
        text: "Station",
        position: [2.35, 48.85],
        sizeCssPx: 13,
        color: [15, 23, 42, 255],
        priority: 1,
      }] },
    });
    expect(overlay.setProps).toHaveBeenCalledTimes(2);
    expect(presenter.getPresentationMetrics().layerRebuilds).toBe(2);

    const sampledAtMs = performance.now();
    presenter.recordDeckMetrics({
      fps: 58,
      setPropsTime: 2,
      layersCount: 7,
      drawLayersCount: 6,
      updateLayersCount: 3,
      updateAttributesTime: 48,
      updateAttributesCount: 4,
      framesRedrawn: 59,
      gpuTime: 8,
      gpuTimePerFrame: 0.14,
      cpuTime: 61,
      cpuTimePerFrame: 1.03,
      bufferMemory: 1024,
      textureMemory: 2048,
      renderbufferMemory: 512,
      gpuMemory: 3584,
      sampledAtMs,
      windowFrames: 59,
    });
    expect(presenter.getPresentationMetrics().deck).toMatchObject({
      fps: 58,
      cpuTime: 61,
      gpuTime: 8,
      updateAttributesTime: 48,
      sampledAtMs,
      windowFrames: 59,
    });
    expect(presenter.getPresentationMetrics().deck?.sampleAgeMs).toBeGreaterThanOrEqual(0);

    presenter.refresh();
    expect(overlay.setProps).toHaveBeenCalledTimes(3);
    presenter.dispose();
  });

  it("keeps the suppressed itinerary model stable while its camera changes", () => {
    const builder = new TransportMapRenderModelBuilder();
    const scene: TransportMapRenderScene = {
      lines: [],
      paths: [],
      stations: [],
      quays: [],
      entrances: [],
      selectedStationIds: [],
      visibleModeMask: 0,
      trafficPathSpans: [],
      interactionActive: true,
    };
    const first = builder.build(createCamera({ zoom: 12 }), scene);
    const second = builder.build(createCamera({ zoom: 13.5 }), {
      ...scene,
      interactionActive: false,
    });

    expect(second).toBe(first);
    builder.dispose();
  });
});
