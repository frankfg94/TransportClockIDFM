import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GlobalTransportPlanModeFilter from "../src/features/line-map/GlobalTransportPlanModeFilter.vue";

describe("GlobalTransportPlanModeFilter optional bike preset", () => {
  it("keeps a missing Bike preset accessible and emits an install request", async () => {
    const wrapper = mount(GlobalTransportPlanModeFilter, {
      props: {
        primaryModes: ["METRO", "BIKE"],
        availableModes: ["METRO"],
        activePreset: "METRO",
        customSummary: "Metro",
        modeLabel: (mode: string) => mode,
        modeColor: () => "#15803d",
      },
    });

    const bikeButton = wrapper.get('[data-global-map-preset="BIKE"] .global-transport-plan__mode-preset-select');
    expect(bikeButton.attributes("aria-disabled")).toBe("true");
    expect(bikeButton.attributes("disabled")).toBeUndefined();
    expect(bikeButton.classes()).toContain("global-transport-plan__mode-preset-select");
    expect(wrapper.get('[data-global-map-preset="BIKE"]').classes()).toContain(
      "global-transport-plan__mode-preset-row--disabled",
    );

    await bikeButton.trigger("click");
    expect(wrapper.emitted("request-preset-install")).toEqual([["BIKE"]]);
    expect(wrapper.emitted("select-preset")).toBeUndefined();

    await wrapper.setProps({ availableModes: ["METRO", "BIKE"] });
    await wrapper.get('[data-global-map-preset="BIKE"] .global-transport-plan__mode-preset-select').trigger("click");
    expect(wrapper.emitted("select-preset")?.at(-1)).toEqual(["BIKE"]);
  });
});
