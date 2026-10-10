import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MiniTravelDisplay from "../src/features/nearby-stations/MiniTravelDisplay.vue";
import type { NearbyJourney } from "../src/features/nearby-stations/nearbyHeavyTransports";

describe("MiniTravelDisplay", () => {
  it("explains an actual change between two trains of the same line and preserves its waiting", async () => {
    const journey: NearbyJourney = { source: "gtfs", durationSeconds: 900, transferCount: 1, sections: [
      { type: "public_transport", lineId: "rail", lineCode: "B", vehicleJourneyId: "express", mission: "EXP", durationSeconds: 225,
        toName: "Branch Junction", toStopAreaId: "junction" },
      { type: "waiting", durationSeconds: 155 },
      { type: "public_transport", lineId: "rail", lineCode: "B", vehicleJourneyId: "local", mission: "LOC", durationSeconds: 520,
        fromName: "Branch Junction", fromStopAreaId: "junction" },
    ] };
    const wrapper = mount(MiniTravelDisplay, { props: { journey }, global: { stubs: { LineIconBadge: true } } });
    expect(wrapper.findAll(".mini-travel-display__leg")).toHaveLength(2);
    expect(wrapper.text()).toContain("Changement de train sur la ligne B à Branch Junction");
    expect(wrapper.text()).toContain("attente 2 min 35 s");
    expect(wrapper.text()).toContain("Missions : EXP → LOC");
    expect(wrapper.text()).toContain("1 correspondance(s)");
    await wrapper.setProps({ journey: { ...journey, sections: journey.sections.map(section => ({ ...section, vehicleJourneyId: "same-train" })) } });
    expect(wrapper.text()).not.toContain("Changement de train");
  });
  it("distinguishes a GTFS minimum transfer from measured walking", () => {
    const wrapper = mount(MiniTravelDisplay, { props: { journey: {
      source: "gtfs", durationSeconds: 1200, transferCount: 1, sections: [
        { type: "walking", durationSeconds: 120 },
        { type: "public_transport", lineCode: "T", durationSeconds: 300 },
        { type: "walking", durationSeconds: 211, transferDurationSource: "gtfs-minimum" },
        { type: "public_transport", lineCode: "R", durationSeconds: 569 },
      ],
    } }, global: { stubs: { LineIconBadge: true } } });
    expect(wrapper.text()).toContain("3 min 31 s");
    expect(wrapper.text()).toContain("marche 2 min");
    expect(wrapper.text()).toContain("ce n’est pas une mesure de marche seule");
    expect(wrapper.findAll(".mini-travel-display__leg")).toHaveLength(4);
  });
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
