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
import { createDeckTransportLayers } from "../src/features/transport-map/next/deckMapLayers";
import type { TransportMapRenderFrame } from "../src/features/transport-map/contracts/renderer";

describe("MapLibre Deck presenter", () => {
  it("does not resurrect initialized administrative layers after crossing zoom buckets", () => {
    const frame: TransportMapRenderFrame = {
      camera: createCamera({ centerWorldX: 0.5, centerWorldY: 0.5, zoom: 13, viewportWidthCssPx: 800, viewportHeightCssPx: 600 }),
      scene: { lines: [], paths: [], stations: [], selectedStationIds: [], visibleModeMask: 0 },
      model: {
        sceneVersion: 1, pathCount: 0, vertexCount: 0, basePaths: [], trafficPaths: [], highlightPaths: [],
        stations: [], quays: [], entrances: [], labels: [],
        servedCityZones: [{
          id: "department", name: "Department", boundaryEmphasis: true, showLabel: false,
          geometry: { type: "Polygon", coordinates: [[[2, 48], [3, 48], [3, 49], [2, 48]]] },
          boundaryPaths: [], innerBoundaryPaths: [[[2, 48], [3, 49]]],
          centroid: [2.5, 48.5], labelPixelOffset: [0, 0], fillColor: [0, 0, 0, 0], borderColor: [0, 0, 0, 255], labelColor: [0, 0, 0, 255],
        }],
      },
    };
    const original = createDeckTransportLayers(frame, undefined);
    for (const layer of original) (layer as unknown as { internalState: unknown }).internalState = {};
    createDeckTransportLayers({ ...frame, camera: { ...frame.camera, zoom: 9 } }, undefined);
    const revisited = createDeckTransportLayers(frame, undefined);
    expect(revisited.map((layer) => layer.id)).toEqual(original.map((layer) => layer.id));
    revisited.forEach((layer, index) => {
      expect(layer).not.toBe(original[index]);
      expect(layer.props.data).toBe(original[index]!.props.data);
      expect(layer.internalState).toBeNull();
    });
  });
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
      id: "station-label:alpha", text: "Alpha", position: [2, 48], sizeCssPx: 12,
      color: [15, 23, 42, 255], priority: 1,
    }];
    const nextLabels: readonly TransportMapLabelRenderRecord[] = [{
      id: "station-label:alpha", text: "Alpha", position: [2.001, 48], sizeCssPx: 12,
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
