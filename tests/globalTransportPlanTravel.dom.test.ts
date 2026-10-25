import { mount } from "@vue/test-utils";
import { toRaw } from "vue";
import { describe, expect, it, vi } from "vitest";
import { createLineOptimizerTimeline } from "../src/features/line-optimizer/lineOptimizerTimeline";
import {
  optimizerDestination,
  optimizerItineraryCandidate,
  optimizerOrigin,
} from "./fixtures/optimizerItinerary";

vi.mock("../src/features/line-map/GlobalTransportPlan.vue", () => ({
  default: {
    name: "GlobalTransportPlan",
    props: ["experience", "itinerary"],
    template: "<div data-direct-global-map />",
  },
}));
import GlobalTransportPlanTravel from "../src/features/line-map/GlobalTransportPlanTravel.vue";

describe("GlobalTransportPlanTravel", () => {
  it("loads GlobalTransportPlan directly with the owner's addresses and calculated route", () => {
    const timeline = createLineOptimizerTimeline(
      optimizerItineraryCandidate(),
      optimizerOrigin,
      optimizerDestination,
    );
    const itinerary = {
      ...timeline,
      origin: optimizerOrigin,
      destination: optimizerDestination,
      totalWaitSeconds: 150,
    };
    const wrapper = mount(GlobalTransportPlanTravel, { props: { itinerary } });
    const map = wrapper.getComponent({ name: "GlobalTransportPlan" });
    expect(toRaw(map.props("itinerary"))).toBe(itinerary);
    expect(map.props("experience")).toBe("next");
    expect(wrapper.text()).toContain(optimizerOrigin.label);
    expect(wrapper.text()).toContain(optimizerDestination.label);
    expect(wrapper.text()).toContain("41 min");
    expect(wrapper.text()).toContain("2,5 min");
    expect(wrapper.find("iframe").exists()).toBe(false);
    wrapper.unmount();
  });
});
