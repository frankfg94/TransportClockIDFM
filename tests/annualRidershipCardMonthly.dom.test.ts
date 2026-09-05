import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnnualRidershipLineResponse } from "../src/types/ridership";

describe("annual ridership monthly link", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("opens the shareable monthly page in a protected new tab only when history exists", async () => {
    const { default: AnnualRidershipCard } = await import("../src/features/line-map/AnnualRidershipCard.vue");
    const line: AnnualRidershipLineResponse = {
      id: "line:IDFM:C01371",
      code: "C01371",
      label: "1",
      mode: "METRO",
      generatedAt: "2026-01-01T00:00:00.000Z",
      requestedYear: 2024,
      primary: { value: 123, unit: "entries", status: "official", sourceIds: [], sourceRecordIds: [] },
      measures: [],
      stations: [],
      sources: [],
      monthlyAvailability: {
        hasMonthlyHistory: true,
        historyYears: [2024],
        retainedStationCount: 12,
        excludedStationCount: 2,
        stationDetail: "available",
      },
    };
    const wrapper = mount(AnnualRidershipCard, { props: { line } });
    const link = wrapper.get(".annual-ridership-card__monthly-link");
    expect(link.attributes("href")).toBe("/ridership/line/line%3AIDFM%3AC01371");
    expect(link.attributes("target")).toBe("_blank");
    expect(link.attributes("rel")).toBe("noopener noreferrer");
    wrapper.unmount();
  });
});
