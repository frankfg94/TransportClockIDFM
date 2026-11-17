import { describe, expect, it } from "vitest";
import { verdictMarketChange } from "../src/services/real-estate/verdictMarketFacts";

const series = Array.from({ length: 5 }, (_, i) => ({ year: 2021 + i, meanPriceM2: 1000 + i * 100, medianPriceM2: 1000 + i * 100, transactionCount: 10 + i }));

describe("verdict market history", () => {
  it("compares five published vintages with exact years and observed counts", () => {
    expect(verdictMarketChange(series, "2021–2025", 5)).toMatchObject({ fromYear: 2021, toYear: 2025, fromSales: 10, toSales: 14, salesPercent: expect.closeTo(40) });
  });
  it("does not infer missing, suppressed or stale endpoint years", () => {
    expect(verdictMarketChange(series.slice(1), "2021–2025", 5)).toBeUndefined();
    expect(verdictMarketChange(series.map(p => p.year === 2023 ? { ...p, transactionCount: 4 } : p), "2021–2025", 5)).toBeUndefined();
    expect(verdictMarketChange(series, "2021–2026", 5)).toBeUndefined();
    expect(verdictMarketChange(series, "2021–2025", 11)).toBeUndefined();
  });
});
