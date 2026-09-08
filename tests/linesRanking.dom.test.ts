import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import LinesRanking from "../src/features/nearby-stations/LinesRanking.vue";
import type { PublicServiceQuality, ServiceQualityLineReliability } from "../src/features/nearby-stations/serviceQualityApi";

function line(overrides: Partial<ServiceQualityLineReliability>): ServiceQualityLineReliability {
  return {
    lineId: "line:test",
    lineName: "Test",
    mode: "METRO",
    aliases: ["TEST"],
    reliabilityScore: 80,
    labelKey: "reliable",
    scoreMethod: "threshold",
    trend: "stable",
    trendDelta: 0,
    yearsUsed: [2023, 2024, 2025],
    indicators: [],
    ...overrides,
  };
}

const data: PublicServiceQuality = {
  schemaVersion: "1.2",
  generatedAt: "2026-09-01T00:00:00.000Z",
  availableYears: [2023, 2024, 2025],
  lines: [
    line({ lineId: "metro:1", lineName: "1", mode: "METRO", reliabilityScore: 80 }),
    line({ lineId: "rer:a", lineName: "A", mode: "RER", reliabilityScore: 90 }),
    line({ lineId: "train:h", lineName: "H", mode: "TRAIN", reliabilityScore: 80 }),
    line({ lineId: "tram:t1", lineName: "T1", mode: "TRAM", reliabilityScore: 70 }),
  ],
  sources: [],
  warnings: [],
};

describe("LinesRanking", () => {
  it("sorts by score, then mode, and filters with accessible switches", async () => {
    const wrapper = mount(LinesRanking, { props: { data } });
    const rows = wrapper.findAll("[data-testid='lines-ranking-row']");

    expect(rows.map((row) => row.find("th").text().split("\n")[0]?.trim())).toEqual(["A", "1", "H", "T1"]);
    const metroToggle = wrapper.get("[data-testid='lines-ranking-mode-METRO']");
    expect(metroToggle.attributes("role")).toBe("switch");
    expect(metroToggle.attributes("aria-checked")).toBe("true");
    await metroToggle.trigger("click");
    expect(wrapper.findAll("[data-testid='lines-ranking-row']")).toHaveLength(3);
    expect(metroToggle.attributes("aria-checked")).toBe("false");
  });

  it("renders the empty state after all modes are disabled", async () => {
    const wrapper = mount(LinesRanking, { props: { data } });
    for (const mode of ["METRO", "RER", "TRAIN", "TRAM"]) {
      await wrapper.get(`[data-testid='lines-ranking-mode-${mode}']`).trigger("click");
    }
    expect(wrapper.text()).toContain("Aucune ligne ne correspond");
  });
});
