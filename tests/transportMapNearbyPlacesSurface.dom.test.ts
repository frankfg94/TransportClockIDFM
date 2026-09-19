import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import * as placesModule from "../src/features/transport-map/next/deckNearbyPlaces";
import TransportMapNextSurface from "../src/features/transport-map/next/TransportMapNextSurface.vue";
import { createCamera } from "../src/features/transport-map/geo/camera";
import type { TransportMapRenderer } from "../src/features/transport-map/contracts/renderer";
import type { NearbyPlace } from "../src/features/nearby-stations/nearbyPlaces";

const fixture = vi.hoisted(() => ({
  load: undefined as (() => void) | undefined,
  setProps: vi.fn(), pickObject: vi.fn(), finalize: vi.fn(),
}));
vi.mock("nuxt/app", () => ({ useRuntimeConfig: () => ({ public: {} }) }));
vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(),
  Map: class {
    painter = { transform: {} };
    on() {}
    off() {}
    once(_event: string, callback: () => void) { fixture.load = callback; }
    getCanvas() { return { getContext: () => ({}) }; }
    getStyle() { return { version: 8, sources: {}, layers: [] }; }
    isStyleLoaded() { return true; }
    addControl() {}
    removeControl() {}
    resize() {}
    triggerRepaint() {}
    remove() {}
  },
}));
vi.mock("@deck.gl/mapbox", () => ({
  MapboxOverlay: class {
    setProps = fixture.setProps;
    pickObject = fixture.pickObject;
    finalize = fixture.finalize;
  },
}));

afterEach(() => vi.restoreAllMocks());

it("prepares the GPU place layer only on place changes, not on camera updates", async () => {
  const prepare = vi.spyOn(placesModule, "prepareDeckNearbyPlaces");
  const place: NearbyPlace = { id: "a", name: "Shop", lon: 2.3, lat: 48.85, category: "shop", kind: "bakery", distanceMeters: 390 };
  const camera = createCamera({ zoom: 14 });
  const renderer = { attachHost: vi.fn(), detachHost: vi.fn() } as unknown as TransportMapRenderer;
  const wrapper = mount(TransportMapNextSurface, {
    props: { renderer, camera, nearbyPlaces: [place] },
    global: { stubs: { NuxtLink: true } },
  });
  try {
    fixture.load!();
    await flushPromises();
    expect(prepare).toHaveBeenCalledTimes(1);
    const layer = fixture.setProps.mock.calls.at(-1)![0].layers[0];
    fixture.setProps.mockClear();
    for (let i = 0; i < 30; i++) {
      await wrapper.setProps({ camera: { ...camera, centerWorldX: .5 + i / 1000, zoom: 14 + i / 100 } });
    }
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(fixture.setProps).not.toHaveBeenCalled();
    fixture.pickObject.mockReturnValue({ object: layer.props.data[0] });
    const api = wrapper.vm as unknown as { pickNearbyPlace: (x: number, y: number) => NearbyPlace | undefined };
    expect(api.pickNearbyPlace(20, 30)?.id).toBe("a");
    expect(fixture.pickObject).toHaveBeenCalledWith({ x: 20, y: 30, layerIds: [placesModule.NEARBY_PLACES_LAYER_ID] });
    await wrapper.setProps({ nearbyPlaces: [] });
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(fixture.setProps.mock.calls.at(-1)![0].layers).toEqual([]);
    expect(api.pickNearbyPlace(20, 30)).toBeUndefined();
  } finally { wrapper.unmount(); }
  expect(fixture.finalize).toHaveBeenCalledOnce();
  expect(renderer.detachHost).toHaveBeenCalledOnce();
});
