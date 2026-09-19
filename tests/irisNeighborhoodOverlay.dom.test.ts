import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import IrisNeighborhoodOverlay from "../src/features/transport-map/overlays/IrisNeighborhoodOverlay.vue";
import { createCamera } from "../src/features/transport-map/geo/camera";
import type { IrisNeighborhood } from "../src/features/transport-map/iris/irisApi";

const neighborhoods: IrisNeighborhood[] = [
  {
    id: "iris-a",
    codeIris: "920010001",
    communeCode: "92001",
    communeName: "Fixture",
    departmentCode: "92",
    name: "Quartier A",
    type: "D",
    centroid: [2.005, 48.005],
    geometry: {
      type: "Polygon",
      coordinates: [[[2, 48], [2.01, 48], [2.01, 48.01], [2, 48.01], [2, 48]]],
    },
  },
];

const numberedNeighborhoods: IrisNeighborhood[] = [
  {
    ...neighborhoods[0]!,
    id: "iris-a-1",
    codeIris: "920010001",
    name: "Quartier A 1",
  },
  {
    ...neighborhoods[0]!,
    id: "iris-a-2",
    codeIris: "920010002",
    name: "Quartier A 2",
    centroid: [2.015, 48.005],
    geometry: {
      type: "Polygon",
      coordinates: [[[2.01, 48], [2.02, 48], [2.02, 48.01], [2.01, 48.01], [2.01, 48]]],
    },
  },
];

const genericNumberedNeighborhoods = numberedNeighborhoods.map((neighborhood, index) => ({
  ...neighborhood,
  name: `Quartier ${index + 1}`,
}));

const neighborhoodsWithSeveralGroups: IrisNeighborhood[] = [
  ...numberedNeighborhoods,
  {
    ...neighborhoods[0]!,
    id: "iris-b",
    codeIris: "920010003",
    name: "Jardin de Bercy",
    centroid: [2.025, 48.005],
    geometry: {
      type: "Polygon",
      coordinates: [[[2.02, 48], [2.03, 48], [2.03, 48.01], [2.02, 48.01], [2.02, 48]]],
    },
  },
];

describe("IrisNeighborhoodOverlay", () => {
  it("renders labels and exposes transport counts on hover", async () => {
    const wrapper = mount(IrisNeighborhoodOverlay, {
      props: {
        neighborhoods,
        camera: createCamera({ viewportWidthCssPx: 640, viewportHeightCssPx: 360 }),
        transportStations: [{
          lon: 2.005,
          lat: 48.005,
          lineIds: ["metro-1", "bus-1"],
          lines: [{ id: "metro-1", mode: "METRO" }, { id: "bus-1", mode: "BUS" }],
        }],
        airNoiseSource: {
          id: "air-noise-statistics",
          title: "Air/noise fixture",
          producer: "fixture",
          pageUrl: "https://example.test/air-noise",
          referencePeriod: "2024",
          licence: { label: "Fixture", attribution: "Fixture" },
          limitations: [],
        },
        airNoiseCommunes: {
          "92001": {
            inseeCode: "92001",
            name: "Fixture",
            departmentCode: "92",
            population: 1234,
            score: 7.1,
            airScore: 8.2,
            noiseScore: 6.4,
            dominantClass: "22",
          },
        },
        scope: "city",
      },
    });

    expect(wrapper.findAll("path[data-iris-code='920010001']")).toHaveLength(1);
    expect(wrapper.findAll("text").map((text) => text.text())).toEqual(["Quartier A"]);

    await wrapper.get("path[data-iris-code='920010001']").trigger("pointerenter");

    expect(wrapper.get("[role='tooltip']").text()).toMatch(/Quartier A/);
    expect(wrapper.get("[role='tooltip']").text()).toMatch(/1/);
    const tooltip = wrapper.get("[role='tooltip']");
    expect(tooltip.text()).toContain("Qualité de l’air");
    expect(tooltip.text()).toContain("Calme sonore");
    expect(tooltip.text()).toMatch(/8[,.]2/);
    expect(tooltip.text()).toMatch(/6[,.]4/);
    expect(tooltip.text()).not.toMatch(/2024|Classe dominante|Statistiques communales/);
    expect(tooltip.get(".iris-neighborhood-overlay__source-link").attributes("href")).toBe("https://example.test/air-noise");
    expect(tooltip.findAll(".iris-neighborhood-overlay__environment-face--selected")).toHaveLength(2);
    expect(tooltip.findAll(".iris-neighborhood-overlay__environment-face")).toHaveLength(6);
    expect(tooltip.findAll("svg")).toHaveLength(10);
  });

  it("follows the pointer in city view and locks the tooltip until an outside press", async () => {
    const wrapper = mount(IrisNeighborhoodOverlay, {
      props: {
        neighborhoods,
        camera: createCamera({ viewportWidthCssPx: 640, viewportHeightCssPx: 360 }),
        scope: "city",
      },
    });
    const path = wrapper.get("path[data-iris-code='920010001']");

    await path.trigger("pointerenter", { clientX: 180, clientY: 96 });
    const tooltipElement = wrapper.get("[role='tooltip']").element;
    expect(wrapper.get("[role='tooltip']").attributes("style")).toContain("left: 180px");
    expect(wrapper.get("[role='tooltip']").attributes("style")).toContain("top: 96px");

    await path.trigger("pointermove", { clientX: 280, clientY: 164 });
    expect(wrapper.get("[role='tooltip']").element).toBe(tooltipElement);
    expect(wrapper.get("[role='tooltip']").attributes("style")).toContain("left: 280px");
    expect(wrapper.get("[role='tooltip']").attributes("style")).toContain("top: 164px");

    await path.trigger("click", { clientX: 340, clientY: 212 });
    expect(wrapper.get("[role='tooltip']").attributes("data-tooltip-locked")).toBe("true");
    expect(wrapper.get("[role='tooltip']").attributes("style")).toContain("left: 340px");
    expect(wrapper.get("[role='tooltip']").attributes("style")).toContain("top: 212px");

    await path.trigger("pointermove", { clientX: 460, clientY: 300 });
    await path.trigger("pointerleave");
    expect(wrapper.get("[role='tooltip']").element).toBe(tooltipElement);
    expect(wrapper.get("[role='tooltip']").attributes("data-tooltip-locked")).toBe("true");
    expect(wrapper.get("[role='tooltip']").attributes("style")).toContain("left: 340px");
    expect(wrapper.get("[role='tooltip']").attributes("style")).toContain("top: 212px");

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find("[role='tooltip']").exists()).toBe(false);

    await path.trigger("pointerenter", { clientX: 420, clientY: 240 });
    expect(wrapper.get("[role='tooltip']").attributes("data-tooltip-locked")).toBe("false");
    expect(wrapper.get("[role='tooltip']").attributes("style")).toContain("left: 420px");
    expect(wrapper.get("[role='tooltip']").attributes("style")).toContain("top: 240px");
    wrapper.unmount();
  });

  it("uses the per-neighborhood grid aggregate instead of the communal fallback", async () => {
    const wrapper = mount(IrisNeighborhoodOverlay, {
      props: {
        neighborhoods,
        camera: createCamera({ viewportWidthCssPx: 640, viewportHeightCssPx: 360 }),
        airNoiseNeighborhoods: new Map([
          ["iris-a", {
            airScore: 10,
            noiseScore: 0,
            dominantClass: "31",
            cellCount: 4,
          }],
        ]),
        airNoiseCommunes: {
          "92001": {
            inseeCode: "92001",
            name: "Fixture",
            departmentCode: "92",
            population: 1234,
            score: 7.1,
            airScore: 8.2,
            noiseScore: 6.4,
            dominantClass: "22",
          },
        },
        scope: "city",
      },
    });

    try {
      await wrapper.get("path[data-iris-code='920010001']").trigger("pointerenter");
      const tooltip = wrapper.get("[role='tooltip']");
      expect(tooltip.text()).toMatch(/10\/10/);
      expect(tooltip.text()).toMatch(/0\/10/);
      expect(tooltip.text()).toContain("4");
      expect(tooltip.get(".iris-neighborhood-overlay__environment-item--noise .iris-neighborhood-overlay__environment-face--3")
        .classes()).toContain("iris-neighborhood-overlay__environment-face--selected");
      expect(tooltip.get(".iris-neighborhood-overlay__environment-item--air .iris-neighborhood-overlay__environment-face--1")
        .classes()).toContain("iris-neighborhood-overlay__environment-face--selected");
    } finally {
      wrapper.unmount();
    }
  });

  it("groups numbered IRIS labels while several groups remain and restores subdivisions on demand", async () => {
    const baseProps = {
      neighborhoods: neighborhoodsWithSeveralGroups,
      camera: createCamera({ viewportWidthCssPx: 640, viewportHeightCssPx: 360 }),
      scope: "city" as const,
    };
    const wrapper = mount(IrisNeighborhoodOverlay, { props: baseProps });

    expect(wrapper.findAll("text").map((text) => text.text())).toEqual(["Quartier A", "Jardin de Bercy"]);
    expect(wrapper.findAll(".iris-neighborhood-overlay__group-boundary")).toHaveLength(2);
    expect(wrapper.findAll(".iris-neighborhood-overlay__shape")).toHaveLength(3);

    await wrapper.setProps({ showSubdivisions: true });

    expect(wrapper.findAll("text").map((text) => text.text())).toEqual(["Quartier A 1", "Quartier A 2", "Jardin de Bercy"]);
    expect(wrapper.findAll(".iris-neighborhood-overlay__group-boundary")).toHaveLength(0);
    wrapper.unmount();
  });

  it("shows subdivisions when grouping leaves only one city group", () => {
    const wrapper = mount(IrisNeighborhoodOverlay, {
      props: {
        neighborhoods: genericNumberedNeighborhoods,
        camera: createCamera({ viewportWidthCssPx: 640, viewportHeightCssPx: 360 }),
        scope: "city",
      },
    });

    expect(wrapper.findAll("text").map((text) => text.text())).toEqual(["Quartier 1", "Quartier 2"]);
    expect(wrapper.findAll(".iris-neighborhood-overlay__group-boundary")).toHaveLength(0);
    expect(wrapper.findAll(".iris-neighborhood-overlay__shape")).toHaveLength(2);
    wrapper.unmount();
  });

  it("keeps IRIS boundaries while hiding the neighborhood fill", () => {
    const wrapper = mount(IrisNeighborhoodOverlay, {
      props: {
        neighborhoods: neighborhoodsWithSeveralGroups,
        camera: createCamera({ viewportWidthCssPx: 640, viewportHeightCssPx: 360 }),
        scope: "city",
        showFill: false,
      },
    });

    expect(wrapper.findAll(".iris-neighborhood-overlay__shape")).toHaveLength(3);
    expect(wrapper.findAll(".iris-neighborhood-overlay__shape").every((shape) =>
      shape.attributes("style")?.includes("fill: none")
      && shape.attributes("style")?.includes("fill-opacity: 0"),
    )).toBe(true);
    expect(wrapper.findAll(".iris-neighborhood-overlay__group-boundary")).toHaveLength(2);
    wrapper.unmount();
  });

  it("shows compiled commerce counts and a density legend", async () => {
    const wrapper = mount(IrisNeighborhoodOverlay, {
      props: {
        neighborhoods,
        camera: createCamera({ viewportWidthCssPx: 640, viewportHeightCssPx: 360 }),
        scope: "city",
        commerceCounts: { "920010001": 7 },
        commerceDataAvailable: true,
        commerceHighlight: true,
      },
    });
    expect(wrapper.find(".iris-neighborhood-overlay__commerce-legend").exists()).toBe(true);
    await wrapper.get("path[data-iris-code='920010001']").trigger("pointerenter");
    expect(wrapper.get("[role='tooltip']").text()).toContain("7");
    expect(wrapper.get("path[data-iris-code='920010001']").attributes("style")).toContain("fill");
    wrapper.unmount();
  });

  it("draws neighborhoods progressively according to the supplied reveal order", async () => {
    const wrapper = mount(IrisNeighborhoodOverlay, {
      props: {
        neighborhoods: numberedNeighborhoods,
        camera: createCamera({ viewportWidthCssPx: 640, viewportHeightCssPx: 360 }),
        scope: "city",
        showSubdivisions: true,
        revealOrder: ["iris-a-1", "iris-a-2"],
        revealProgress: 0.5,
      },
    });

    const paths = wrapper.findAll("path[data-iris-code]");
    expect(paths[0]?.attributes("style")).toContain("stroke-dashoffset");
    expect(paths[0]?.attributes("style")).not.toContain("stroke-dashoffset: 1;");
    expect(paths[1]?.attributes("style")).toContain("stroke-dashoffset: 1;");
    expect(wrapper.findAll("text")[1]?.attributes("style")).toContain("opacity: 0");

    await wrapper.setProps({ revealProgress: 1 });
    expect(paths[1]?.attributes("style")).toBeUndefined();
    wrapper.unmount();
  });
});
