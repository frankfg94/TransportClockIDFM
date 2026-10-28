import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import OptimizerAnimatedValue from "../src/features/line-optimizer/OptimizerAnimatedValue.vue";
describe("optimizer value animation", () => {
  it("animates changes on the same itinerary but not when the itinerary changes", async () => {
    const wrapper = mount(OptimizerAnimatedValue, { props: { value: "10:00", itinerary: "one" } });
    expect(wrapper.find(".optimizer-value-update").exists()).toBe(false);
    await wrapper.setProps({ value: "10:01", itinerary: "two" });
    expect(wrapper.find(".optimizer-value-update").exists()).toBe(false);
    await wrapper.setProps({ value: "10:02" });
    expect(wrapper.find(".optimizer-value-update").text()).toBe("10:02");
    wrapper.unmount();
  });
});
