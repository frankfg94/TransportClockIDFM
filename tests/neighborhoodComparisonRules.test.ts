import { describe, expect, it } from "vitest";
import { summarizeComparisonGreen } from "../src/features/nearby-stations/neighborhood-comparison/neighborhoodComparisonRules";

describe("comparison canopy summaries", () => {
  it("weights measured areas, keeps a measured zero, and reports partial IRIS coverage", () => {
    const summary = summarizeComparisonGreen([
      { status: "partial", canopy: { areaM2: 100, canopyM2: 0, period: "2021–2023" } },
      { status: "unavailable" },
      { status: "partial", canopy: { areaM2: 300, canopyM2: 90, period: "2021–2023" } },
    ]);
    expect(summary?.canopy).toBeCloseTo(22.5);
    expect(summary?.canopyCoveredIris).toBe(2);
    expect(summary?.canopyTotalIris).toBe(3);
  });

  it("does not turn missing canopy into a measured zero", () => {
    const summary = summarizeComparisonGreen([{ status: "unavailable" }]);
    expect(summary?.canopy).toBeUndefined();
    expect(summary?.canopyCoveredIris).toBe(0);
    expect(summary?.canopyTotalIris).toBe(1);
  });
});
