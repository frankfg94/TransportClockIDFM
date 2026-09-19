import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NearbyCityComparisonModal from "../src/features/nearby-stations/NearbyCityComparisonModal.vue";
import NearbyCityComparisonOverlay from "../src/features/nearby-stations/NearbyCityComparisonOverlay.vue";
import { isNearbyPlaceGreenSpace } from "../src/features/nearby-stations/nearbyPlacePresentation";
import {
  compareNearbyCityMetric,
  nearbyCityComparisonLineCode,
  nearbyCityComparisonLineDetail,
  nearbyCityComparisonLineLabel,
  nearbyCityComparisonTone,
  perThousandInhabitants,
  type NearbyCityComparisonCityOption,
  type NearbyCityComparisonMetric,
} from "../src/features/nearby-stations/nearbyCityComparison";
import { createCamera } from "../src/features/transport-map/geo/camera";

const CITY_OPTIONS: NearbyCityComparisonCityOption[] = [
  { code: "92001", name: "Ville actuelle", departmentCode: "92", population: 10_000, lat: 48.9, lon: 2.2 },
  { code: "92002", name: "Ville cible", departmentCode: "92", population: 12_000, lat: 48.91, lon: 2.21 },
  { code: "78646", name: "Versailles", departmentCode: "78", population: 85_000, lat: 48.8, lon: 2.13 },
];

const TRANSPORT_METRIC: NearbyCityComparisonMetric = {
  id: "transport-lines",
  label: "Lignes de transport",
  currentValue: "12",
  targetValue: "25",
  currentNumeric: 12,
  targetNumeric: 25,
  detail: {
    current: {
      count: 3,
      groups: [
        {
          mode: "METRO",
          count: 1,
          labels: ["13"],
          icons: [{ id: "line:metro:13", mode: "METRO", code: "13", label: "13", color: "#6ec4e8", textColor: "#111827" }],
        },
        { mode: "BUS", count: 18, labels: [], icons: [] },
      ],
    },
    target: {
      count: 2,
      groups: [
        {
          mode: "TRAIN",
          count: 1,
          labels: ["J"],
          icons: [{ id: "line:transilien:J", mode: "TRAIN", code: "J", label: "J", color: "#d6cd00", textColor: "#111827" }],
        },
        { mode: "NOCTILIEN", count: 7, labels: [], icons: [] },
      ],
    },
    networks: [
      {
        mode: "METRO",
        aggregated: false,
        current: {
          count: 1,
          labels: ["13"],
          lines: [{ id: "line:metro:13", mode: "METRO", code: "13", label: "13", color: "#6ec4e8", textColor: "#111827" }],
        },
        target: { count: 0, labels: [], lines: [] },
      },
      {
        mode: "TRAIN",
        aggregated: false,
        current: { count: 0, labels: [], lines: [] },
        target: {
          count: 1,
          labels: ["J"],
          lines: [{ id: "line:transilien:J", mode: "TRAIN", code: "J", label: "J", color: "#d6cd00", textColor: "#111827" }],
        },
      },
      {
        mode: "BUS",
        aggregated: true,
        current: { count: 18, labels: [], lines: [] },
        target: { count: 0, labels: [], lines: [] },
      },
      {
        mode: "NOCTILIEN",
        aggregated: true,
        current: { count: 0, labels: [], lines: [] },
        target: { count: 7, labels: [], lines: [] },
      },
    ],
  },
};

describe("nearby city comparison", () => {
  it("marks higher, lower, equal and missing values deterministically", () => {
    expect(compareNearbyCityMetric(10, 12)).toBe("better");
    expect(compareNearbyCityMetric(10, 12, false)).toBe("worse");
    expect(compareNearbyCityMetric(10, 8)).toBe("worse");
    expect(compareNearbyCityMetric(10, 10)).toBe("equal");
    expect(compareNearbyCityMetric(10, undefined)).toBe("unavailable");
    expect(nearbyCityComparisonTone({ currentNumeric: 4, targetNumeric: 3 })).toBe("worse");
    expect(perThousandInhabitants(25, 10_000)).toBe(2.5);
    expect(perThousandInhabitants(25, 0)).toBeUndefined();
    expect(isNearbyPlaceGreenSpace({ name: "Parc municipal", kind: "park", category: "attraction" })).toBe(true);
    expect(isNearbyPlaceGreenSpace({ name: "Fontaine", kind: "fountain", category: "service" })).toBe(false);
    expect(isNearbyPlaceGreenSpace({ name: "Table de pique-nique", kind: "picnic_table", category: "attraction" })).toBe(false);
  });

  it("emits a selected neighboring commune from both pointer and keyboard input", async () => {
    const neighborhood = {
      id: "iris-neighbor",
      codeIris: "920020001",
      communeCode: "92002",
      communeName: "Autre ville",
      departmentCode: "92",
      name: "Centre",
      type: "D",
      centroid: [2.36, 48.85] as [number, number],
      geometry: {
        type: "Polygon" as const,
        coordinates: [[[2.355, 48.845], [2.365, 48.845], [2.365, 48.855], [2.355, 48.855], [2.355, 48.845]]],
      },
    };
    const wrapper = mount(NearbyCityComparisonOverlay, {
      props: {
        neighborhoods: [neighborhood],
        camera: createCamera({ zoom: 14, viewportWidthCssPx: 720, viewportHeightCssPx: 380 }),
      },
    });
    const shape = wrapper.get("[data-city-code='92002']");
    await shape.trigger("click");
    await shape.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("select")).toEqual([["92002"], ["92002"]]);
  });

  it("renders git-like row colors and closes the modal", async () => {
    const rows: NearbyCityComparisonMetric[] = [
      { id: "population", label: "Habitants", currentValue: "10", targetValue: "12", currentNumeric: 10, targetNumeric: 12 },
      { id: "air", label: "Air", currentValue: "8/10", targetValue: "6/10", currentNumeric: 8, targetNumeric: 6 },
      { id: "commerce", label: "Commerces", currentValue: "10", targetValue: "—" },
    ];
    const wrapper = mount(NearbyCityComparisonModal, {
      props: {
        open: true,
        current: { code: "92001", name: "Ville actuelle", departmentCode: "92" },
        target: { code: "92002", name: "Ville cible", departmentCode: "92" },
        rows,
      },
    });
    expect(wrapper.get("[role='dialog']").text()).toContain("Comparer les communes");
    expect(wrapper.get("[data-comparison-tone='better']").text()).toContain("Supérieure");
    expect(wrapper.get("[data-comparison-tone='worse']").text()).toContain("Inférieure");
    expect(wrapper.get("[data-comparison-tone='unavailable']").text()).toContain("Indisponible");
    // Every row carries its two dots on a scale of its own.
    expect(wrapper.findAll(".comparison-dumbbell__track").length).toBeGreaterThan(0);
    await wrapper.get("[data-testid='nearby-city-comparison-close']").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("collects each transport line once and groups it by mode in network order", () => {
    const detail = nearbyCityComparisonLineDetail([
      { lineIds: ["bus-38", "metro-12"], lines: [{ id: "bus-38", mode: "BUS", label: "38" }, { id: "metro-12", mode: "METRO", label: "12" }] },
      { lineIds: ["metro-12", "tram-t6"], lines: [{ id: "metro-12", mode: "METRO", label: "12" }, { id: "tram-t6", mode: "TRAM", label: "T6" }] },
      { lineIds: ["noctilien-n01"], lines: [{ id: "noctilien-n01", mode: "NOCTILIEN", label: "N01" }] },
    ]);

    // Rail modes come first, then surface modes, and Noctilien never merges
    // into the bus group.
    expect(detail.groups.map((group) => group.mode)).toEqual(["METRO", "TRAM", "BUS", "NOCTILIEN"]);
    expect(detail.lines.map((line) => line.id)).toEqual(["metro-12", "tram-t6", "bus-38", "noctilien-n01"]);
  });

  it("falls back to a readable line code without inventing a label", () => {
    expect(nearbyCityComparisonLineLabel({ id: "IDFM:C01742", mode: "BUS", code: "N01" })).toBe("N01");
    expect(nearbyCityComparisonLineCode({ id: "IDFM:C01742", mode: "BUS" })).toBe("C01742");
    expect(nearbyCityComparisonLineCode({ id: "line:long-opaque-identifier", mode: "BUS" })).toBeUndefined();
    expect(nearbyCityComparisonLineLabel({ id: "line:opaque", mode: "BUS", label: "Métro 14" })).toBe("Métro 14");
  });

  it("keeps the numeric value visible even when its data is still loading", () => {
    const rows: NearbyCityComparisonMetric[] = [
      { id: "commerce", label: "Commerces", currentValue: "5,6", targetValue: "—", currentNumeric: 5.6, targetLoading: true },
      { id: "air", label: "Air", currentValue: "—", targetValue: "—", currentLoading: true },
    ];
    const wrapper = mount(NearbyCityComparisonModal, {
      props: {
        open: true,
        current: { code: "92001", name: "Ville actuelle", departmentCode: "92" },
        target: { code: "92002", name: "Ville cible", departmentCode: "92" },
        rows,
        targetLoading: true,
        currentLoading: true,
      },
    });

    const commerce = wrapper.get("[data-comparison-metric='commerce']");
    expect(commerce.text()).toContain("5,6");
    // A pending value shows the missing dash, never "undefined" or "NaN".
    expect(commerce.text()).toContain("—");
    expect(wrapper.text()).not.toContain("undefined");
    expect(wrapper.text()).not.toContain("NaN");
  });

  it("expands the transport row into one network table for both cities", async () => {
    const wrapper = mount(NearbyCityComparisonModal, {
      props: {
        open: true,
        current: { code: "92001", name: "Ville actuelle", departmentCode: "92" },
        target: { code: "92002", name: "Ville cible", departmentCode: "92" },
        rows: [TRANSPORT_METRIC],
      },
    });

    const detailNode = wrapper.get("[data-testid='nearby-city-comparison-detail']");
    const toggle = wrapper.get("[data-testid='nearby-city-comparison-toggle-transport-lines']");
    expect(detailNode.attributes("aria-hidden")).toBe("true");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(detailNode.classes()).toContain("comparison-networks--open");

    // One row per network, in network order, covering both cities.
    expect(detailNode.findAll("[data-network-mode]").map((row) => row.attributes("data-network-mode")))
      .toEqual(["METRO", "TRAIN", "BUS", "NOCTILIEN"]);
    // Rail lines reuse the shared badge; one city can show a dash.
    expect(detailNode.findAll("[data-network-mode='METRO'] .line-icon-badge")).toHaveLength(1);
    expect(detailNode.findAll("[data-network-mode='TRAIN'] .line-icon-badge")).toHaveLength(1);
    expect(detailNode.findAll("[data-network-mode='METRO']")[0]!.text()).toContain("—");
    // Dense networks only expose how many lines they add.
    expect(detailNode.findAll("[data-network-mode='BUS'] .line-icon-badge")).toHaveLength(0);
    expect(detailNode.findAll("[data-network-mode='BUS']")[0]!.text()).toContain("18 lignes");
    expect(detailNode.findAll("[data-network-mode='NOCTILIEN'] .line-icon-badge")).toHaveLength(0);
    expect(detailNode.findAll("[data-network-mode='NOCTILIEN']")[0]!.text()).toContain("7 lignes");
  });

  it("swaps both cities from the comparator", async () => {
    const wrapper = mount(NearbyCityComparisonModal, {
      props: {
        open: true,
        current: { code: "92001", name: "Ville actuelle", departmentCode: "92" },
        target: { code: "92002", name: "Ville cible", departmentCode: "92" },
        rows: [TRANSPORT_METRIC],
      },
    });

    await wrapper.get("[data-testid='nearby-city-comparison-swap']").trigger("click");
    expect(wrapper.emitted("swapCities")).toHaveLength(1);
  });

  it("opens a searchable Île-de-France city picker from both city headings", async () => {
    const wrapper = mount(NearbyCityComparisonModal, {
      props: {
        open: true,
        current: { code: "92001", name: "Ville actuelle", departmentCode: "92" },
        target: { code: "92002", name: "Ville cible", departmentCode: "92" },
        rows: [TRANSPORT_METRIC],
        cityOptions: CITY_OPTIONS,
      },
    });

    await wrapper.get("[data-testid='nearby-city-comparison-target-city']").trigger("click");
    expect(wrapper.get("[data-testid='nearby-city-picker']").text()).toContain("Choisir la ville ciblée");
    // The picker never offers the city already displayed on the other side.
    expect(wrapper.find("[data-city-option='92001']").exists()).toBe(false);
    await wrapper.get("[data-city-option='78646']").trigger("click");
    expect(wrapper.emitted("selectTargetCity")).toEqual([["78646"]]);
    expect(wrapper.find("[data-testid='nearby-city-picker']").exists()).toBe(false);

    await wrapper.get("[data-testid='nearby-city-comparison-current-city']").trigger("click");
    expect(wrapper.get("[data-testid='nearby-city-picker']").text()).toContain("Changer la ville actuelle");
    await wrapper.get("[data-city-option='92001']").trigger("click");
    expect(wrapper.emitted("selectBaseCity")).toEqual([["92001"]]);
  });

  it("keeps map gestures out of the dialog while still closing on the backdrop", async () => {
    const wrapper = mount(NearbyCityComparisonModal, {
      props: {
        open: true,
        current: { code: "92001", name: "Ville actuelle", departmentCode: "92" },
        target: { code: "92002", name: "Ville cible", departmentCode: "92" },
        rows: [TRANSPORT_METRIC],
      },
    });

    const overlay = wrapper.get("[data-testid='nearby-city-comparison-modal']");
    await overlay.trigger("pointerdown");
    await overlay.trigger("click");
    // A backdrop click closes the comparison locally and never reaches the
    // map pointer handlers that own the pan gesture.
    expect(wrapper.emitted("close")).toHaveLength(1);

    await wrapper.get("[data-testid='nearby-city-comparison-current-city']").trigger("click");
    expect(wrapper.find("[data-testid='nearby-city-picker']").exists()).toBe(true);
    // A click that bubbles up from inside the dialog must not close it.
    await wrapper.get("[data-testid='nearby-city-picker-search']").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
