import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";
import NeighborhoodComparison from "../src/features/nearby-stations/neighborhood-comparison/NeighborhoodComparison.vue";

const api = vi.hoisted(() => ({ geography: vi.fn(), places: vi.fn(), green: vi.fn() }));
vi.mock("../src/features/nearby-stations/neighborhood-comparison/api", () => ({ fetchComparisonGeography: api.geography, fetchComparisonGreen: api.green, fetchComparisonPlaces: api.places, fetchComparisonTransportMetadata: vi.fn(async () => ({ generatedAt: "2026-01-01" })), invalidateComparisonCaches: vi.fn() }));
vi.mock("../src/features/nearby-stations/neighborhood-comparison/ComparisonMap.vue", () => ({ default: defineComponent({ props: ["selectedCode"], emits: ["select"], setup(props, { emit }) { return () => h("button", { "data-testid": "map-stub", "data-selected": props.selectedCode, onClick: () => emit("select", "b") }, "map"); } }) }));

function geography(code = "A") {
  const item = (id: string, x: number) => ({ id, codeIris: id, communeCode: code, communeName: code, departmentCode: "78", name: id, type: "H", centroid: [x + .5, .5], areaM2: 1_000_000, geometry: { type: "Polygon", coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] }, green: { status: "unavailable" } });
  return { generatedAt: "2026-01-01", commune: { code, name: code }, selectedCode: "a", matchingCodes: ["a"], neighborhoods: [item("a", 0), item("b", 1)], irisSource: { title: "IRIS", producer: "INSEE", pageUrl: "https://example.com", licence: {} } };
}
const places = { manifest: { generatedAt: "2026-01-01" }, city: { places: [{ id: "1", name: "", lon: .5, lat: .5, category: "shop", kind: "bakery", tags: { shop: "bakery" } }] } };

describe("neighborhood comparison selection", () => {
  it("synchronizes chart, selector and map without per-neighborhood requests", async () => {
    api.geography.mockReset().mockResolvedValue(geography()); api.places.mockReset().mockResolvedValue(places);
    const wrapper = mount(NeighborhoodComparison, { props: { origin: { lat: .5, lon: .5 }, transportReady: false } });
    await flushPromises();
    expect(api.geography).toHaveBeenCalledTimes(1); expect(api.places).toHaveBeenCalledTimes(1);
    expect(wrapper.get("[data-testid=map-stub]").attributes("data-selected")).toBe("a");
    await wrapper.get("[data-testid=comparison-category]").setValue("food-shopping");
    expect(wrapper.get(".comparison__chart-label").text()).toMatch(/Alimentation|Food shopping/i);
    expect(wrapper.get(".comparison__detail").text()).toMatch(/Tous types confondus|All types combined/i);
    expect(wrapper.get("[data-code=a]").text()).toContain("1");
    expect(wrapper.get("[data-code=b]").text()).toContain("0");
    await wrapper.get("[data-code=b]").trigger("click");
    expect((wrapper.get("[data-testid=comparison-select]").element as HTMLSelectElement).value).toBe("b");
    expect(wrapper.get("[data-testid=map-stub]").attributes("data-selected")).toBe("b");
    await wrapper.get("[data-testid=comparison-select]").setValue("a");
    expect(wrapper.get("[data-code=a]").attributes("aria-pressed")).toBe("true");
    await wrapper.get("[data-testid=map-stub]").trigger("click");
    expect(wrapper.get("[data-code=b]").attributes("aria-pressed")).toBe("true");
    expect(wrapper.find("[data-testid=comparison-bars]").exists()).toBe(true);
    await wrapper.get("[data-testid=comparison-theme-transport]").trigger("click");
    expect(wrapper.find("[data-testid=comparison-bars]").exists()).toBe(true);
    expect(api.geography).toHaveBeenCalledTimes(1); expect(api.places).toHaveBeenCalledTimes(1);
    expect(wrapper.get("[data-code=a]").text()).toMatch(/chargement|loading/i);
    wrapper.unmount();
  });

  it("honors a valid IRIS selected from the city map", async () => {
    api.geography.mockReset().mockResolvedValue(geography()); api.places.mockReset().mockResolvedValue(places);
    const wrapper = mount(NeighborhoodComparison, { props: { origin: { lat: .5, lon: .5 }, initialCode: "b", transportReady: false } });
    await flushPromises();
    expect(wrapper.get("[data-code=b]").attributes("aria-pressed")).toBe("true");
    expect((wrapper.get("[data-testid=comparison-select]").element as HTMLSelectElement).value).toBe("b");
    wrapper.unmount();
  });

  it("keeps the chosen neighborhood and category on refresh, but resets them for a new address", async () => {
    api.geography.mockReset().mockResolvedValue(geography()); api.places.mockReset().mockResolvedValue(places);
    const wrapper = mount(NeighborhoodComparison, { props: { origin: { lat: .5, lon: .5 }, initialCode: "a", transportReady: false } });
    await flushPromises();
    await wrapper.get("[data-code=b]").trigger("click");
    await wrapper.get("[data-testid=comparison-category]").setValue("food-shopping");
    await wrapper.findAll("button").find(button => /actualiser les données|refresh data/i.test(button.text()))!.trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-code=b]").attributes("aria-pressed")).toBe("true");
    expect((wrapper.get("[data-testid=comparison-category]").element as HTMLSelectElement).value).toBe("food-shopping");
    await wrapper.setProps({ origin: { lat: .5, lon: 1.5 } }); await flushPromises();
    expect(wrapper.get("[data-code=a]").attributes("aria-pressed")).toBe("true");
    expect((wrapper.get("[data-testid=comparison-category]").element as HTMLSelectElement).value).toBe("all");
    wrapper.unmount();
  });

  it("ignores old commune responses after the origin changes", async () => {
    let resolveOld!: (value: unknown) => void;
    api.geography.mockReset().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce(geography("B"));
    api.places.mockReset().mockResolvedValue(places);
    const wrapper = mount(NeighborhoodComparison, { props: { origin: { lat: .5, lon: .5 }, transportReady: false } });
    await wrapper.setProps({ origin: { lat: .5, lon: 1.5 } }); await flushPromises();
    resolveOld(geography("A")); await flushPromises();
    expect(wrapper.text()).toContain("B (B)"); expect(wrapper.text()).not.toContain("A (A)");
    expect(api.places).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("loads green polygons only on demand and shows their partial coverage", async () => {
    const data = { ...geography(), greenSource: { title: "Greens", pageUrl: "https://example.com", licence: {} } };
    api.geography.mockReset().mockResolvedValue(data); api.places.mockReset().mockResolvedValue(places);
    api.green.mockReset().mockResolvedValue({ a: { status: "partial", areaM2: 600, sites: 1 }, b: { status: "unavailable" } });
    const wrapper = mount(NeighborhoodComparison, { props: { origin: { lat: .5, lon: .5 }, transportReady: false } });
    await flushPromises(); expect(api.green).not.toHaveBeenCalled();
    await wrapper.get("[data-testid=comparison-theme-green]").trigger("click"); await flushPromises();
    expect(api.green).toHaveBeenCalledTimes(1);
    expect(wrapper.get("[data-code=a]").text()).toMatch(/0[,.]1\s*ha/);
    expect(wrapper.text()).toMatch(/partielle|partial/i);
    wrapper.unmount();
  });

  it("does not publish an old green-space response after a municipality change", async () => {
    const source = { title: "Greens", pageUrl: "https://example.com", licence: {} };
    api.geography.mockReset().mockResolvedValueOnce({ ...geography("A"), greenSource: source }).mockResolvedValueOnce({ ...geography("B"), greenSource: source });
    api.places.mockReset().mockResolvedValue(places);
    let resolveOld!: (value: unknown) => void;
    api.green.mockReset().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce({ a: { status: "partial", areaM2: 20_000, sites: 1 } });
    const wrapper = mount(NeighborhoodComparison, { props: { origin: { lat: .5, lon: .5 }, transportReady: false } });
    await flushPromises(); await wrapper.get("[data-testid=comparison-theme-green]").trigger("click");
    await wrapper.setProps({ origin: { lat: .5, lon: 1.5 } }); await flushPromises();
    resolveOld({ a: { status: "partial", areaM2: 90_000, sites: 1 } }); await flushPromises();
    expect(wrapper.text()).toContain("B (B)");
    expect(wrapper.get("[data-code=a]").text()).toMatch(/2\s*ha/);
    expect(wrapper.get("[data-code=a]").text()).not.toMatch(/9\s*ha/);
    wrapper.unmount();
  });

  it("pages large rankings and brings the selected neighborhood into view", async () => {
    const base = geography();
    const neighborhoods = Array.from({ length: 82 }, (_, index) => ({ ...base.neighborhoods[0]!, id: `n${index}`, codeIris: `n${index}`, name: `N${index}` }));
    api.geography.mockReset().mockResolvedValue({ ...base, selectedCode: "n0", neighborhoods }); api.places.mockReset().mockResolvedValue({ ...places, city: { places: [] } });
    const wrapper = mount(NeighborhoodComparison, { props: { origin: { lat: .5, lon: .5 }, transportReady: false } });
    await flushPromises();
    expect(wrapper.findAll("[data-code]")).toHaveLength(40);
    await wrapper.get("[data-testid=comparison-search]").setValue("n81");
    expect(wrapper.get("[data-testid=comparison-select]").findAll("option")).toHaveLength(3);
    await wrapper.get("[data-testid=comparison-select]").setValue("n81");
    expect(wrapper.get("[data-code=n81]").attributes("aria-pressed")).toBe("true");
    expect(wrapper.text()).toMatch(/3\s*(sur|of)\s*3/i);
    wrapper.unmount();
  });

  it("keeps missing place and transport sources distinct from zero", async () => {
    api.geography.mockReset().mockResolvedValue(geography());
    api.places.mockReset().mockRejectedValue(new Error("missing city file"));
    const wrapper = mount(NeighborhoodComparison, { props: { origin: { lat: .5, lon: .5 }, transportReady: false, transportError: true } });
    await flushPromises();
    expect(wrapper.get("[data-code=a]").text()).toMatch(/disponible|available/i);
    await wrapper.get("[data-testid=comparison-theme-transport]").trigger("click");
    expect(wrapper.get("[data-code=a]").text()).toMatch(/disponible|available/i);
    await wrapper.get("[data-testid=comparison-theme-green]").trigger("click");
    expect(wrapper.text()).toMatch(/aucune couche|no comparable/i);
    wrapper.unmount();
  });
});
