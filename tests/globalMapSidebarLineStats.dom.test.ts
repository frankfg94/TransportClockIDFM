import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GlobalMapSidebarLineStats from "../src/features/line-map/GlobalMapSidebarLineStats.vue";

describe("GlobalMapSidebarLineStats", () => {
  it("renders the values and labels supplied by its parent", () => {
    const wrapper = mount(GlobalMapSidebarLineStats, {
      props: {
        sectionAriaLabel: "Line profile",
        lengthLabel: "12.4 km",
        lengthCaption: "Length",
        lineCount: 42,
        lineStatsCountLabel: "Stations",
        cityCount: 7,
        cityCountCaption: "Cities",
        connectionCount: 16,
        connectionCountCaption: "Connections",
      },
    });

    expect(wrapper.get(".global-map-picker-sidebar__line-stats").attributes("aria-label")).toBe(
      "Line profile",
    );
    expect(wrapper.findAll(".global-map-picker-sidebar__line-stat")).toHaveLength(4);
    expect(wrapper.findAll(".global-map-picker-sidebar__line-stat strong").map((node) => node.text())).toEqual([
      "12.4 km",
      "42",
      "7",
      "16",
    ]);
    expect(
      wrapper.findAll(".global-map-picker-sidebar__line-stat span").map((node) => node.text()),
    ).toEqual(["Length", "Stations", "Cities", "Connections"]);
  });
});
