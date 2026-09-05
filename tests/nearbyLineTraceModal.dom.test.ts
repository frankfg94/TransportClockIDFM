import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NearbyLineTraceModal from "../src/features/nearby-stations/NearbyLineTraceModal.vue";
import type { GlobalMapLine } from "../src/features/transport-map/contracts/manifest";
import type { CitiesLinePatternCity } from "../src/features/line-map/citiesLinePattern";

const line: GlobalMapLine = {
  id: "line:bus:42",
  index: 1,
  code: "42",
  label: "42",
  mode: "BUS",
  color: "#5146ff",
  textColor: "#ffffff",
  aliases: [],
  stationIds: [],
  geometryIds: [],
};

const cities: CitiesLinePatternCity[] = [
  { name: "Ville A" },
  { name: "Ville B" },
  { name: "Ville C" },
  { name: "Ville D" },
];

describe("NearbyLineTraceModal", () => {
  it("shows only the direction from the current city to the terminus", async () => {
    const wrapper = mount(NearbyLineTraceModal, {
      props: {
        open: true,
        line,
        direction: "Terminus D",
        currentCity: "Ville C",
        cities,
      },
    });

    expect(wrapper.get('[role="dialog"]').attributes("aria-label")).toContain("42");
    expect(wrapper.findAll(".cities-line-pattern__item--muted")).toHaveLength(2);
    expect(wrapper.findAll(".cities-line-pattern__connector--muted")).toHaveLength(2);
    expect(wrapper.findAll(".cities-line-pattern__connector--active")).toHaveLength(1);
    expect(document.body.style.overflow).toBe("hidden");

    await wrapper.get(".nearby-line-trace-modal__close").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
    await wrapper.setProps({ open: false });
    expect(document.body.style.overflow).toBe("");
  });
});
