import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";
import RestOfCityComparison from "../src/features/nearby-stations/neighborhood-comparison/RestOfCityComparison.vue";
import type { NeighborhoodComparisonGeography } from "../src/features/nearby-stations/neighborhood-comparison/types";

vi.mock("../src/features/nearby-stations/neighborhood-comparison/ComparisonMap.vue", () => ({
  default: defineComponent({ props: ["canopy", "selectedCode", "metric"], emits: ["select"], setup(props) {
    return () => h("div", { "data-testid": "comparison-canopy-map", "data-selected": props.selectedCode,
      "data-canopy": props.canopy, "data-value-a": props.metric?.values?.a ?? "missing", "data-value-c": props.metric?.values?.c ?? "missing" });
  } }),
}));

function makeGeography(): NeighborhoodComparisonGeography {
  const item = (codeIris: string, x: number): NeighborhoodComparisonGeography["neighborhoods"][number] => ({
    id: codeIris, codeIris, communeCode: "92020", communeName: "Montrouge", departmentCode: "92", name: codeIris,
    type: "H", centroid: [x + .5, .5], areaM2: 1_000_000,
    geometry: { type: "Polygon", coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] },
    green: { status: "unavailable" },
  });
  return {
    generatedAt: "2026-11-20T00:00:00Z", commune: { code: "92020", name: "Montrouge" }, selectedCode: "a", matchingCodes: ["a"],
    neighborhoods: [item("a", 0), item("b", 1), item("c", 2)],
    irisSource: { title: "IRIS", producer: "INSEE", pageUrl: "https://example.test/iris", licence: {} },
  } as unknown as NeighborhoodComparisonGeography;
}

describe("rest of city comparison sections", () => {
  it("renders all four sections and keeps each theme's measure control independent", async () => {
    const wrapper = mount(RestOfCityComparison, { props: {
      origin: { lat: .5, lon: .5, code: "92020" }, geography: makeGeography(),
      placesStatus: "ready", places: { counts: {}, assigned: 0, outside: 0, ambiguous: 0, sample: 0 },
      greenStatus: "ready", green: {
        a: { status: "partial", canopy: { areaM2: 100, canopyM2: 0, period: "2021–2023" } },
        b: { status: "partial", canopy: { areaM2: 100, canopyM2: 30, period: "2021–2023" } },
        c: { status: "unavailable" },
      }, greenMap: { scope: "commune", code: "92020", version: "0123456789abcdef01234567" },
      canopyCoverage: { period: "2021–2023", coveredIris: 2, totalIris: 3 }, transportReady: false,
    }, global: { stubs: { NuxtLink: defineComponent({ props: ["to"], setup(props, { slots }) { return () => h("a", { href: props.to }, slots.default?.()); } }) } } });
    expect(wrapper.findAll("[data-testid^=rest-section-]").map(section => section.attributes("data-testid")))
      .toEqual(["rest-section-commerce", "rest-section-economic", "rest-section-green", "rest-section-transport"]);
    expect(wrapper.findAll("[data-testid^=comparison-theme-]")).toHaveLength(0);
    await wrapper.get("[data-testid=rest-measure-commerce]").setValue("density");
    expect((wrapper.get("[data-testid=rest-measure-green]").element as HTMLSelectElement).value).toBe("canopy");
    expect((wrapper.get("[data-testid=rest-measure-economic]").element as HTMLSelectElement).value).toBe("count");
    expect((wrapper.get("[data-testid=rest-measure-transport]").element as HTMLSelectElement).value).toBe("lines");
    expect(wrapper.get("[data-testid=comparison-canopy-map]").element.tagName).toBe("DIV");
    expect(wrapper.get("[data-testid=open-green-focus]").attributes("href")).toContain("/map?focus=nature%3Acommune%3A92020");
    wrapper.unmount();
  });

  it("shows measured zero canopy separately from an IRIS with no canopy data", () => {
    const wrapper = mount(RestOfCityComparison, { props: {
      geography: makeGeography(), placesStatus: "error", greenStatus: "ready",
      green: {
        a: { status: "partial", canopy: { areaM2: 100, canopyM2: 0, period: "2021–2023" } },
        b: { status: "partial", canopy: { areaM2: 100, canopyM2: 30, period: "2021–2023" } },
        c: { status: "unavailable" },
      }, transportReady: false,
    }, global: { stubs: { NuxtLink: true } } });
    expect(wrapper.get("[data-testid=rest-section-green] [data-code=a]").text()).toMatch(/0\s*%/u);
    expect(wrapper.get("[data-testid=rest-section-green] [data-code=c]").text()).toMatch(/aucune donnée|no data/iu);
    expect(wrapper.get("[data-testid=comparison-canopy-map]").attributes("data-value-a")).toBe("0");
    expect(wrapper.get("[data-testid=comparison-canopy-map]").attributes("data-value-c")).toBe("missing");
    wrapper.unmount();
  });
});
