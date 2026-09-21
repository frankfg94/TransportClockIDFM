import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import GlobalMapNearbyPlacesOverlay from "../src/features/line-map/GlobalMapNearbyPlacesOverlay.vue";
import { createCamera } from "../src/features/transport-map/geo/camera";
import type { NearbyPlace } from "../src/features/nearby-stations/nearbyPlaces";
import { createDeckNearbyPlacesLayer, prepareDeckNearbyPlaces } from "../src/features/transport-map/next/deckNearbyPlaces";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("shares one raster icon description for all places of the same kind", () => {
  const data = prepareDeckNearbyPlaces([
    { id: "a", name: "A", lon: 2.3, lat: 48.85, category: "shop", kind: "bakery", distanceMeters: 20 },
    { id: "b", name: "B", lon: 2.4, lat: 48.85, category: "shop", kind: "bakery", distanceMeters: 390 },
  ]);
  const layer = createDeckNearbyPlacesLayer(data);
  const icon = layer.props.getIcon as unknown as (record: typeof data[number]) => { url: string };
  expect(icon(data[0]!)).toBe(icon(data[1]!));
  expect(decodeURIComponent(icon(data[0]!).url)).toContain("<svg");
});

describe("GPU place interaction overlay", () => {
  it("keeps one DOM target for 1500 places, picks once per frame and never picks during camera motion", async () => {
    const frames = new Map<number, FrameRequestCallback>();
    let id = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { frames.set(++id, cb); return id; });
    vi.stubGlobal("cancelAnimationFrame", (key: number) => frames.delete(key));
    const tick = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb(0)); };
    const places: NearbyPlace[] = Array.from({ length: 1500 }, (_, i) => ({
      id: `shop:${i}`, name: `Shop ${i}`, lon: 2.3, lat: 48.85,
      category: "shop", kind: "bakery", distanceMeters: 390,
    }));
    const camera = createCamera({ zoom: 14 });
    const pickPlace = vi.fn(() => places[1499]);
    const wrapper = mount(GlobalMapNearbyPlacesOverlay, { props: { places, camera, gpu: true, pickPlace } });
    const api = wrapper.vm as unknown as { onPointerMove: (e: PointerEvent) => void; clearHover: () => void };
    const canvas = document.createElement("canvas");
    const event = { target: canvas, currentTarget: canvas, clientX: 30, clientY: 40, buttons: 0 } as unknown as PointerEvent;
    try {
      expect(wrapper.findAll("button")).toHaveLength(1);
      expect(wrapper.findAll("svg")).toHaveLength(0);
      for (let i = 0; i < 10; i++) api.onPointerMove(event);
      tick();
      await wrapper.vm.$nextTick();
      expect(pickPlace).toHaveBeenCalledTimes(1);
      expect(wrapper.get("[role=tooltip]").text()).toContain("Shop 1499");
      for (let i = 0; i < 20; i++) await wrapper.setProps({ camera: { ...camera, centerWorldX: .5 + i / 1000 } });
      expect(pickPlace).toHaveBeenCalledTimes(1);
      expect(wrapper.find("[role=tooltip]").exists()).toBe(false);
      api.onPointerMove({ ...event, buttons: 1 }); tick();
      expect(pickPlace).toHaveBeenCalledTimes(1);
      await wrapper.get("button").trigger("focus");
      await wrapper.get("button").trigger("keydown", { key: "End" });
      expect(wrapper.get("[role=tooltip]").text()).toContain("Shop 1499");
      await wrapper.get("button").trigger("blur");
      api.onPointerMove(event);
      wrapper.unmount(); tick();
      expect(pickPlace).toHaveBeenCalledTimes(1);
    } finally { wrapper.unmount(); }
  });
});
