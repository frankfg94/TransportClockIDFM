import type { Layer } from "@deck.gl/core";
import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { createCamera } from "../src/features/transport-map/geo/camera";
import type { TransportMapRenderScene } from "../src/features/transport-map/contracts/renderer";
import type {
  TransportMapLabelRenderRecord,
  TransportMapPreparedRenderModel,
} from "../src/features/transport-map/render/transportMapRenderModel";
import { MapLibreDeckOverlayPresenter, type DeckOverlayLike } from "../src/features/transport-map/next/deckMapPresenter";

describe("MapLibre Deck presenter", () => {
  it("updates only the label layer within a boundary style bucket", () => {
    const scene: TransportMapRenderScene = {
      lines: [], paths: [], stations: [], selectedStationIds: [], visibleModeMask: 0,
    };
    const camera = createCamera({
      centerWorldX: 0.5,
      centerWorldY: 0.5,
      zoom: 13,
      viewportWidthCssPx: 800,
      viewportHeightCssPx: 600,
    });
    const firstLabels: readonly TransportMapLabelRenderRecord[] = [{
      id: "station:alpha", text: "Alpha", position: [2, 48], sizeCssPx: 12,
      color: [15, 23, 42, 255], priority: 1,
    }];
    const nextLabels: readonly TransportMapLabelRenderRecord[] = [{
      id: "station:alpha", text: "Alpha", position: [2.001, 48], sizeCssPx: 12,
      color: [15, 23, 42, 255], priority: 1,
    }];
    const sharedModelData: Omit<TransportMapPreparedRenderModel, "labels"> = {
      sceneVersion: 1,
      pathCount: 0,
      vertexCount: 0,
      basePaths: [],
      trafficPaths: [],
      highlightPaths: [],
      stations: [],
      quays: [],
      entrances: [],
    };
    const firstModel: TransportMapPreparedRenderModel = { ...sharedModelData, labels: firstLabels };
    const nextModel: TransportMapPreparedRenderModel = { ...sharedModelData, labels: nextLabels };

    let currentCenter = { lng: 0, lat: 0 };
    let currentZoom = 0;
    const map = {
      getCenter: () => currentCenter,
      getZoom: () => currentZoom,
      jumpTo: (view: { center: [number, number]; zoom: number }) => {
        currentCenter = { lng: view.center[0], lat: view.center[1] };
        currentZoom = view.zoom;
      },
      getStyle: () => ({ layers: [] }),
      triggerRepaint: () => undefined,
    } as unknown as MapLibreMap;
    const publishedLayers: Layer[][] = [];
    const overlay = {
      setProps: (props: { layers?: Layer[] }) => publishedLayers.push(props.layers ?? []),
    } as unknown as DeckOverlayLike;
    const presenter = new MapLibreDeckOverlayPresenter(map, overlay);

    presenter.present({ camera, scene, model: firstModel });
    const firstTransportLabel = publishedLayers[0]?.find((layer) => layer.id === "transport-labels");
    presenter.present({
      camera: { ...camera, zoom: 13.07, generation: camera.generation + 1 },
      scene,
      model: nextModel,
    });
    const nextTransportLabel = publishedLayers[1]?.find((layer) => layer.id === "transport-labels");

    expect(firstTransportLabel).toBeDefined();
    expect(nextTransportLabel).toBeDefined();
    expect(nextTransportLabel).not.toBe(firstTransportLabel);
    expect(presenter.getPresentationMetrics()).toMatchObject({ layerRebuilds: 1, setPropsCount: 2 });
    presenter.dispose();
  });
});
