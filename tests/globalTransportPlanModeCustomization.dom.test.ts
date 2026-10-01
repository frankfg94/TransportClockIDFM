import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GlobalTransportPlanModeCustomization from "../src/features/line-map/GlobalTransportPlanModeCustomization.vue";

describe("GlobalTransportPlanModeCustomization", () => {
  it("keeps toggles controlled while emitting immediate selection changes", async () => {
    const modes = ["METRO", "BUS", "BIKE"] as const;
    const wrapper = mount(GlobalTransportPlanModeCustomization, {
      props: {
        modes: [...modes],
        selectedModes: ["METRO"],
        showGpeProjects: false,
        modeLabel: (mode: string) => mode,
        modeColor: () => "#7db1f5",
      },
    });

    const inputs = wrapper.findAll(
      ".global-transport-plan__customization-list input[type='checkbox']",
    );
    expect(inputs).toHaveLength(3);
    expect((inputs[0]!.element as HTMLInputElement).checked).toBe(true);
    expect((inputs[1]!.element as HTMLInputElement).checked).toBe(false);
    expect(inputs[1]!.attributes("aria-label")).toContain("BUS");
    const projectsToggle = wrapper.get("[data-global-map-customization-gpe-projects]");
    expect((projectsToggle.element as HTMLInputElement).checked).toBe(false);
    await projectsToggle.setValue(true);
    expect(wrapper.emitted("update:show-gpe-projects")).toEqual([[true]]);

    await inputs[1]!.setValue(true);
    const updateEvents = wrapper.emitted("update:selected-modes")!;
    expect(updateEvents.at(-1)).toEqual([["METRO", "BUS"]]);
    await wrapper.setProps({ selectedModes: ["METRO", "BUS"] });
    expect((inputs[1]!.element as HTMLInputElement).checked).toBe(true);

    await wrapper.get("[data-global-map-customization-select-none]").trigger("click");
    expect(wrapper.emitted("update:selected-modes")?.at(-1)).toEqual([[]]);

    await wrapper.get("[data-global-map-customization-select-all]").trigger("click");
    expect(wrapper.emitted("update:selected-modes")?.at(-1)).toEqual([["METRO", "BUS", "BIKE"]]);

    await wrapper.get("[data-global-map-customization-back]").trigger("click");
    await wrapper.get("[data-global-map-customization-finish]").trigger("click");
    expect(wrapper.emitted("back")).toHaveLength(1);
    expect(wrapper.emitted("finish")).toHaveLength(1);
    expect(wrapper.get("#global-map-customization").attributes("aria-label")).toBe("Personnaliser la carte");
  });
});
