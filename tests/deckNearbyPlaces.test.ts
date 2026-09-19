import { describe, expect, it, vi } from "vitest";
import { IconLayer } from "@deck.gl/layers";
import { createDeckNearbyPlacesLayer, prepareDeckNearbyPlaces } from "../src/features/transport-map/next/deckNearbyPlaces";
import { MapLibreDeckOverlayPresenter } from "../src/features/transport-map/next/deckMapPresenter";
import { createCamera } from "../src/features/transport-map/geo/camera";
import type { NearbyPlace } from "../src/features/nearby-stations/nearbyPlaces";
import type { TransportMapRenderFrame } from "../src/features/transport-map/contracts/renderer";

describe("Deck nearby places", () => {
  it("retains every eligible place and reuses the exact layer and data through pan, zoom and transport updates", () => {
    const places: NearbyPlace[] = Array.from({ length: 10_000 }, (_, i) => ({
      id: `shop:${i}`, name: `Shop ${i}`, lon: 2.3 + i / 100_000, lat: 48.85,
      category: "shop", kind: "bakery", distanceMeters: i % 400,
    }));
    const data = prepareDeckNearbyPlaces([...places, { ...places[0]!, id: "invalid", lon: NaN }]);
    expect(data).toHaveLength(10_000);
    const layer = createDeckNearbyPlacesLayer(data);
    expect(layer).toBeInstanceOf(IconLayer);
    expect(layer.props.data).toBe(data);
    expect(layer.props.pickable).toBe(true);
    const overlay = { setProps: vi.fn() };
    let center = { lng: 0, lat: 0 };
    let zoom = 12;
    const map = {
      getCenter: () => center, getZoom: () => zoom,
      jumpTo: vi.fn((view: { center: [number, number]; zoom: number }) => {
        center = { lng: view.center[0], lat: view.center[1] }; zoom = view.zoom;
      }),
      getStyle: () => ({ layers: [] }), triggerRepaint: vi.fn(),
    };
    const presenter = new MapLibreDeckOverlayPresenter(map as never, overlay);
    const layers = [layer];
    const frame: TransportMapRenderFrame = {
      camera: createCamera({ zoom: 12 }),
      scene: { lines: [], paths: [], stations: [], selectedStationIds: [], visibleModeMask: 0 },
      model: { sceneVersion: 1, pathCount: 0, vertexCount: 0, basePaths: [], trafficPaths: [], highlightPaths: [], stations: [], quays: [], entrances: [], labels: [] },
    };
    presenter.setNearbyPlaceLayers(layers);
    presenter.present(frame);
    overlay.setProps.mockClear();
    for (let i = 0; i < 100; i++) {
      presenter.setNearbyPlaceLayers(layers);
      presenter.present({ ...frame, camera: { ...frame.camera, centerWorldX: .5 + i / 100_000, zoom: 12 + i / 100 } });
    }
    expect(overlay.setProps).not.toHaveBeenCalled();
    presenter.present({ ...frame, model: { ...frame.model, sceneVersion: 2 } });
    expect(overlay.setProps.mock.calls.at(-1)![0].layers.at(-1)).toBe(layer);
    expect(layer.props.data).toBe(data);
    presenter.refresh();
    expect(overlay.setProps.mock.calls.at(-1)![0].layers.at(-1)).toBe(layer);
    presenter.setNearbyPlaceLayers([]);
    expect(overlay.setProps.mock.calls.at(-1)![0].layers).not.toContain(layer);
    presenter.dispose();
  });
});
