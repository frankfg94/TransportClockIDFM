import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import NeighborhoodJourneyPreview from "../src/features/nearby-stations/NeighborhoodJourneyPreview.vue";
import type { JourneyPreviewRun } from "../src/features/nearby-stations/neighborhood/journeyPreview";

describe("Verdict journey map selection", () => {
  it("keeps the selected journey while other destinations finish and restores its alternative on return", async () => {
    const origin = { lat: 48.84, lon: 2.3 };
    const destinations = [
      { id: "a", label: "Châtelet", lat: 48.86, lon: 2.35 },
      { id: "b", label: "Gare du Nord", lat: 48.88, lon: 2.36 },
    ];
    const journeys = [300, 900].map(durationSeconds => ({
      durationSeconds, sections: [{ type: "walking", durationSeconds, geometry: [origin, destinations[0]!] }],
    }));
    const run: JourneyPreviewRun = { token: 1, origin, destinations, benchmarks: [
      { ...destinations[0]!, journeys, status: "ready" },
      { ...destinations[1]!, journeys: [], status: "loading" },
    ] };
    const wrapper = mount(NeighborhoodJourneyPreview, {
      props: { run, originLabel: "Rue de Paris", loadPaths: vi.fn().mockResolvedValue([]) },
      global: { stubs: { NeighborhoodJourneyMap: { name: "NeighborhoodJourneyMap", props: ["journeys"], template: "<div />" } } },
    });
    const select = () => wrapper.get('[data-testid="journey-destination"]');
    const alternative = () => wrapper.get('[data-testid="journey-alternative"]');
    const metrics = () => wrapper.get(".journey-preview__metrics strong").text();
    expect(wrapper.find("details").attributes("open")).toBeUndefined();
    await alternative().setValue("1");
    expect(metrics()).toBe("15 min");
    await select().setValue("b");
    expect(wrapper.get(".journey-preview__result").attributes("data-status")).toBe("loading");
    await wrapper.setProps({ run: { ...run, benchmarks: [run.benchmarks[0]!, { ...run.benchmarks[1]!, journeys: [journeys[0]!], status: "ready" }] } });
    expect(metrics()).toBe("5 min");
    expect(wrapper.find('[data-testid="journey-alternative"]').exists()).toBe(false);
    await select().setValue("a");
    expect(metrics()).toBe("15 min");
    const map = wrapper.getComponent({ name: "NeighborhoodJourneyMap" });
    expect(map.props("journeys")[0].row.selectedIndex).toBe(1);
    await select().setValue("");
    expect(map.props("journeys")).toHaveLength(2);
    expect(wrapper.find("details").exists()).toBe(false);
    map.vm.$emit("select", "b");
    await wrapper.vm.$nextTick();
    expect(metrics()).toBe("5 min");
    wrapper.unmount();
  });
});
