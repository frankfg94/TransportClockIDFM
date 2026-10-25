import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MaterialCombobox from "../src/components/MaterialCombobox.vue";
import NewsFilters from "../src/features/transport-news/NewsFilters.vue";
import NearbyRealEstateControls from "../src/features/nearby-stations/NearbyRealEstateControls.vue";
import { normalizeNewsPreferences } from "../src/features/transport-news/types";

describe("harmonised choice adapters", () => {
  it("keeps news filter values, empty all-choice ids and source preferences", async () => {
    const values = { query: "", mode: "", topic: "", sourceId: "", lineKey: "", period: "90" };
    const wrapper = mount(NewsFilters, { props: { modelValue: values, sources: [], lines: [{ mode: "metro", code: "4" }], preferences: normalizeNewsPreferences({ modes: ["metro"], topics: ["works"] }) } });
    expect(wrapper.findAllComponents(MaterialCombobox)).toHaveLength(5);
    const mode = wrapper.getComponent<typeof MaterialCombobox>('[data-news-filter=mode]');
    expect(mode.props("options").map((option: { id: string }) => option.id)).toEqual(["", "metro"]);
    mode.vm.$emit("update:modelValue", "metro");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([{ ...values, mode: "metro" }]);
    await wrapper.get("input").setValue("gare");
    expect(wrapper.emitted("update:modelValue")?.[1]).toEqual([{ ...values, query: "gare" }]);
    wrapper.unmount();
  });
  it("preserves comparison/measure events and hides measure in liquidity mode", async () => {
    const wrapper = mount(NearbyRealEstateControls, { props: { enabled: true, mode: "prices", reference: "city", measure: "median", referenceLabel: "City" } });
    const controls = wrapper.findAllComponents(MaterialCombobox);
    controls[0].vm.$emit("update:modelValue", "petite-couronne");
    controls[1].vm.$emit("update:modelValue", "mean");
    expect(wrapper.emitted("update:reference")).toEqual([["petite-couronne"]]);
    expect(wrapper.emitted("update:measure")).toEqual([["mean"]]);
    await wrapper.setProps({ mode: "liquidity" });
    expect(wrapper.findAllComponents(MaterialCombobox)).toHaveLength(1);
    wrapper.unmount();
  });
});
