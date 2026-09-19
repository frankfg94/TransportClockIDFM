import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import NearbyCityCityPicker from "../src/features/nearby-stations/NearbyCityCityPicker.vue";
import type { NearbyCityComparisonCityOption } from "../src/features/nearby-stations/nearbyCityComparison";

const CITIES: NearbyCityComparisonCityOption[] = [
  { code: "92050", name: "Nanterre", departmentCode: "92", departmentName: "Hauts-de-Seine", population: 97_000, lat: 48.892, lon: 2.207 },
  { code: "94028", name: "Créteil", departmentCode: "94", departmentName: "Val-de-Marne", population: 92_000, lat: 48.79, lon: 2.455 },
  { code: "78646", name: "Versailles", departmentCode: "78", departmentName: "Yvelines", population: 85_000, lat: 48.801, lon: 2.13 },
];

describe("nearby city picker", () => {
  it("filters accent-insensitively on name, department and INSEE code", async () => {
    const wrapper = mount(NearbyCityCityPicker, {
      props: {
        title: "Choisir la ville ciblée",
        description: "Description",
        searchLabel: "Rechercher une commune",
        searchPlaceholder: "Nom, département ou code INSEE",
        emptyLabel: "Aucune commune",
        options: CITIES,
      },
    });

    expect(wrapper.findAll("[data-city-option]")).toHaveLength(3);
    await wrapper.get("[data-testid='nearby-city-picker-search']").setValue("cret");
    expect(wrapper.findAll("[data-city-option]").map((node) => node.attributes("data-city-option"))).toEqual(["94028"]);
    await wrapper.get("[data-testid='nearby-city-picker-search']").setValue("yvelines");
    expect(wrapper.findAll("[data-city-option]").map((node) => node.attributes("data-city-option"))).toEqual(["78646"]);
    await wrapper.get("[data-testid='nearby-city-picker-search']").setValue("92050");
    expect(wrapper.findAll("[data-city-option]").map((node) => node.attributes("data-city-option"))).toEqual(["92050"]);
    await wrapper.get("[data-testid='nearby-city-picker-search']").setValue("zzz");
    expect(wrapper.text()).toContain("Aucune commune");
  });

  it("emits the selected commune code and the close request", async () => {
    const wrapper = mount(NearbyCityCityPicker, {
      props: {
        title: "Choisir la ville ciblée",
        description: "Description",
        searchLabel: "Rechercher une commune",
        searchPlaceholder: "Nom, département ou code INSEE",
        emptyLabel: "Aucune commune",
        options: CITIES,
        selectedCode: "92050",
      },
    });

    await wrapper.get("[data-city-option='94028']").trigger("click");
    await wrapper.get("[data-testid='nearby-city-picker-close']").trigger("click");
    expect(wrapper.emitted("select")).toEqual([["94028"]]);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
