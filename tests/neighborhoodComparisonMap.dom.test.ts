import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import ComparisonMap from "../src/features/nearby-stations/neighborhood-comparison/ComparisonMap.vue";
import type { ComparisonNeighborhood } from "../src/features/nearby-stations/neighborhood-comparison/types";

const mapMock = vi.hoisted(() => ({
  fail: true,
  events: {} as Record<string, () => void>,
  sources: new Map<string, { setData: ReturnType<typeof vi.fn> }>(),
}));
vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(),
  Map: class {
    constructor() { if (mapMock.fail) throw new Error("WebGL2 unavailable"); }
    getCanvas() { return { getContext: () => ({}) }; }
    isStyleLoaded() { return false; }
    on(event: string, listener: () => void) { mapMock.events[event] = listener; }
    getSource(id: string) { return mapMock.sources.get(id); }
    addSource(id: string) { mapMock.sources.set(id, { setData: vi.fn() }); }
    addLayer() {}
    fitBounds() {}
    remove() {}
  },
}));
vi.mock("nuxt/app", () => ({ useRuntimeConfig: () => ({ public: { nextMap: {} } }) }));

describe("comparison map fallback", () => {
  it("exposes an explicit map-unavailable status when WebGL2 cannot initialize", async () => {
    mapMock.fail = true;
    const wrapper = mount(ComparisonMap, { props: { neighborhoods: [] } });
    await nextTick();
    expect(wrapper.get("[data-testid=comparison-map]").attributes("data-status")).toBe("unsupported");
    expect(wrapper.get("[role=status]").text()).toMatch(/WebGL2/);
    wrapper.unmount();
  });

  it("installs polygons when the style is parsed and keeps fast selections during tile loading", async () => {
    mapMock.fail = false; mapMock.events = {}; mapMock.sources.clear();
    const neighborhood = (code: string, x: number): ComparisonNeighborhood => ({
      id: code, codeIris: code, communeCode: "92001", communeName: "Fixture", departmentCode: "92", name: code, type: "H", centroid: [x + .5, .5], areaM2: 1,
      geometry: { type: "Polygon", coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] }, green: { status: "unavailable" },
    });
    const wrapper = mount(ComparisonMap, { props: { neighborhoods: [neighborhood("a", 0), neighborhood("b", 1)], selectedCode: "a" } });
    mapMock.events["style.load"]!();
    await nextTick();
    expect(wrapper.get("[data-testid=comparison-map]").attributes("data-status")).toBe("ready");
    const source = mapMock.sources.get("comparison-neighborhoods")!;
    await wrapper.setProps({ selectedCode: "b" });
    expect(source.setData).toHaveBeenLastCalledWith(expect.objectContaining({ features: [expect.objectContaining({ properties: expect.objectContaining({ code: "a", selected: false }) }), expect.objectContaining({ properties: expect.objectContaining({ code: "b", selected: true }) })] }));
    wrapper.unmount();
  });
});
