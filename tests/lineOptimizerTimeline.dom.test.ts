import { flushPromises, mount } from "@vue/test-utils";
import { shallowRef, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import {
  optimizerOrigin,
  optimizerDestination,
  optimizerItineraryCandidate,
} from "./fixtures/optimizerItinerary";
import {
  DEFAULT_OPTIMIZER_SETTINGS,
  type LineOptimizerCandidate,
} from "../src/features/line-optimizer/lineOptimizer";
import { resolveLineOptimizerConfig } from "../src/features/line-optimizer/optimizerConfig";
import type { GlobalTransportPlanItinerary } from "../src/features/line-map/globalTransportPlanItinerary";
import { itineraryStepAttributes } from "../src/features/line-map/globalTransportPlanItinerary";

const state = {
  originQuery: ref(optimizerOrigin.label),
  destinationQuery: ref(optimizerDestination.label),
  originPoint: shallowRef(optimizerOrigin),
  destinationPoint: shallowRef(optimizerDestination),
  settings: ref({ ...DEFAULT_OPTIMIZER_SETTINGS }),
  result: ref(),
  status: ref("ready"),
  errorPhase: ref("locations"),
  candidates: ref([]),
  winner: shallowRef<LineOptimizerCandidate | undefined>(optimizerItineraryCandidate()),
  now: ref(Date.parse("2026-10-22T07:00:00Z")),
  selectAddress: vi.fn(),
  refresh: vi.fn(),
};
vi.mock("../src/features/line-optimizer/useLineOptimizer", () => ({
  useLineOptimizer: () => state,
}));
vi.mock("../src/features/line-map/GlobalTransportPlanTravel.vue", () => ({
  default: { name: "GlobalTransportPlanTravel", props: ["itinerary"], template: "<div />" },
}));
import LineOptimizerPage from "../src/features/line-optimizer/LineOptimizerPage.vue";

describe("optimizer timeline owns the map snapshot", () => {
  it("passes the exact rendered steps and both addresses, then clears stale map data", async () => {
    const wrapper = mount(LineOptimizerPage, {
      props: { config: resolveLineOptimizerConfig("tram", "T10")! },
      global: {
        stubs: {
          AdressBook: true,
          GlobalTransportPlanTravel: {
            name: "GlobalTransportPlanTravel",
            props: ["itinerary"],
            template: "<div />",
          },
        },
      },
    });
    await flushPromises();
    const first = wrapper
      .findComponent({ name: "GlobalTransportPlanTravel" })
      .props("itinerary") as GlobalTransportPlanItinerary;
    expect(first.origin).toBe(optimizerOrigin);
    expect(first.destination).toBe(optimizerDestination);
    const leftSteps = wrapper.findAll(".line-optimizer__timeline [data-itinerary-step]");
    expect(leftSteps).toHaveLength(first.steps.length);
    leftSteps.forEach((element, i) => {
      const attrs = itineraryStepAttributes(first.steps[i]);
      for (const [key, value] of Object.entries(attrs))
        if (value !== undefined) expect(element.attributes(key)).toBe(String(value));
    });
    expect(wrapper.find(".line-optimizer__divider").exists()).toBe(true);
    state.originPoint.value = { ...optimizerOrigin, label: "Origine B", lon: 2.27 };
    state.destinationPoint.value = { ...optimizerDestination, label: "Destination B", lat: 48.88 };
    state.winner.value = { ...optimizerItineraryCandidate(), id: "selected-b" };
    await flushPromises();
    const updated = wrapper
      .findComponent({ name: "GlobalTransportPlanTravel" })
      .props("itinerary") as GlobalTransportPlanItinerary;
    expect(updated.origin.label).toBe("Origine B");
    expect(updated.destination.label).toBe("Destination B");
    expect(updated.steps[1]!.section.fromPoint).toBe(state.originPoint.value);
    expect(wrapper.get(".line-optimizer__journey").attributes("data-itinerary-id")).toBe(
      updated.route.id,
    );
    state.winner.value = undefined;
    await flushPromises();
    expect(wrapper.findComponent({ name: "GlobalTransportPlanTravel" }).exists()).toBe(false);
    expect(wrapper.find(".line-optimizer__journey").exists()).toBe(false);
    wrapper.unmount();
  });
});
