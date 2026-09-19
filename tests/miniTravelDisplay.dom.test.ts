import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MiniTravelDisplay from "../src/features/nearby-stations/MiniTravelDisplay.vue";
import type { NearbyJourney } from "../src/features/nearby-stations/nearbyHeavyTransports";

describe("MiniTravelDisplay", () => {
  it("keeps colored transit legs and walking durations while hiding waits", () => {
    const journey: NearbyJourney = {
      durationSeconds: 1_200,
      sections: [
        { type: "street_network", mode: "walking", durationSeconds: 120 },
        { type: "waiting", mode: "waiting", durationSeconds: 480 },
        {
          type: "public_transport",
          mode: "tram",
          durationSeconds: 420,
          lineCode: "T10",
          lineMode: "TRAM",
          lineColor: "#7c3aed",
        },
        { type: "street_network", mode: "walking", durationSeconds: 60 },
        {
          type: "public_transport",
          mode: "train",
          durationSeconds: 300,
          lineCode: "ORLYVAL",
          lineMode: "TRAIN",
          lineColor: "#0f766e",
        },
      ],
    };
    const wrapper = mount(MiniTravelDisplay, {
      props: { journey },
      global: {
        stubs: {
          LineIconBadge: {
            props: ["line"],
            template: "<span class='test-line-badge'>{{ line.label }}</span>",
          },
        },
      },
    });

    expect(wrapper.find(".mini-travel-display").exists()).toBe(true);
    expect(wrapper.find(".mini-travel-display").attributes("aria-label")).toContain("T10");
    expect(wrapper.find(".mini-travel-display").attributes("aria-label")).toContain("ORLYVAL");
    expect(wrapper.findAll(".test-line-badge").map((item) => item.text())).toEqual(["T10", "ORLYVAL"]);
    expect(wrapper.findAll(".mini-travel-display__leg")).toHaveLength(4);
    expect(wrapper.findAll(".mini-travel-display__separator")).toHaveLength(3);
    expect(wrapper.text()).not.toContain("Attente");
    expect(wrapper.text()).toContain("2 min");
    expect(wrapper.text()).toContain("7 min");
  });
});
