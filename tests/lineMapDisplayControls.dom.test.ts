import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import LineMapDisplayControls from "../src/features/line-map/LineMapDisplayControls.vue";

describe("LineMapDisplayControls global variant", () => {
  it("uses the global mode order, omits the ghost master toggle and emits filter updates", async () => {
    const wrapper = mount(LineMapDisplayControls, {
      props: {
        variant: "global",
        availableModes: ["NOCTILIEN", "RER", "BUS", "METRO"],
        selectedModes: ["RER"],
      },
    });

    expect(wrapper.find(".line-map-display-panel__main-toggle").exists()).toBe(false);
    expect(wrapper.findAll("label").map((label) => label.text())).toEqual([
      "Bus",
      "Metro",
      "RER",
      "Noctilien",
    ]);
    expect(wrapper.findAll("input")[0]!.element.checked).toBe(false);
    expect(wrapper.findAll("input")[2]!.element.checked).toBe(true);

    await wrapper.findAll("input")[0]!.setValue(true);
    expect(wrapper.emitted("update:selectedModes")?.at(-1)?.[0]).toEqual([
      "BUS",
      "RER",
    ]);

  });

  it("exposes nearby-map visibility options as controlled v-model inputs", async () => {
    const wrapper = mount(LineMapDisplayControls, {
      props: {
        variant: "global",
        availableModes: ["BUS"],
        selectedModes: ["BUS"],
        nearbyOptions: true,
        hideLongWaitTransports: true,
        showNearbyPlaces: true,
        showNearbyPlaceNames: false,
      },
    });

    const longWaitToggle = wrapper.get("[data-hide-long-wait-transports]");
    const placesToggle = wrapper.get("[data-show-nearby-places]");
    const placeNamesToggle = wrapper.get("[data-show-nearby-place-names]");
    expect((longWaitToggle.element as HTMLInputElement).checked).toBe(true);
    expect((placesToggle.element as HTMLInputElement).checked).toBe(true);
    expect((placeNamesToggle.element as HTMLInputElement).checked).toBe(false);
    expect((placeNamesToggle.element as HTMLInputElement).disabled).toBe(false);

    await longWaitToggle.setValue(false);
    await placesToggle.setValue(false);
    await placeNamesToggle.setValue(true);

    expect(wrapper.emitted("update:hideLongWaitTransports")).toEqual([[false]]);
    expect(wrapper.emitted("update:showNearbyPlaces")).toEqual([[false]]);
    expect(wrapper.emitted("update:showNearbyPlaceNames")).toEqual([[true]]);

    await wrapper.setProps({ showNearbyPlaces: false });
    expect((placeNamesToggle.element as HTMLInputElement).disabled).toBe(true);
    expect(placeNamesToggle.element.parentElement?.classList.contains("line-map-display-panel__nearby-option--disabled")).toBe(true);
  });
});
