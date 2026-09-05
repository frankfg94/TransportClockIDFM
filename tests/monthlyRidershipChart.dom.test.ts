import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MonthlyRidershipChart from "../src/features/ridership-monthly/MonthlyRidershipChart.vue";

describe("monthly ridership chart", () => {
  it("shows the month and year when a plotted point is hovered", async () => {
    const wrapper = mount(MonthlyRidershipChart, {
      props: {
        series: [
          { month: "2024-01", value: 100, status: "complete", coveredDays: 31 },
          { month: "2024-02", value: 120, status: "complete", coveredDays: 29 },
        ],
        color: "#4d8dca",
        label: "Ligne 13",
      },
    });

    const firstPoint = wrapper.find("circle");
    expect(firstPoint.attributes("aria-label")).toContain("2024");
    expect(firstPoint.get("title").text()).toContain("2024");
    expect(wrapper.find("[data-testid='monthly-chart-tooltip']").exists()).toBe(false);

    await firstPoint.trigger("mouseenter");
    expect(wrapper.get("[data-testid='monthly-chart-tooltip']").text()).toContain("2024");

    await firstPoint.trigger("mouseleave");
    expect(wrapper.find("[data-testid='monthly-chart-tooltip']").exists()).toBe(false);
  });
});
