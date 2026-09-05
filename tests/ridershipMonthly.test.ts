import { describe, expect, it } from "vitest";
import type { MonthlySeriesPoint } from "../src/types/ridership";
import {
  aggregateMonthlySeries,
  chartBucketCount,
  chartHorizonYears,
  comparableChange,
  defaultMonthlySelection,
  latestYearWithTwelveCompleteMonths,
  movingAverage,
  ROLLING_WINDOW_MONTHS,
  selectMonthlyChartSeries,
  selectMonthlyChartSourceSeries,
  selectMonthlySeries,
  summarizeMonthlySeries,
} from "../src/features/ridership-monthly/monthlyRidership";

function point(month: string, value: number | null, status: MonthlySeriesPoint["status"] = value === null ? "missing" : "complete"): MonthlySeriesPoint {
  return { month, value, status, coveredDays: value === null ? 0 : 30 };
}

describe("monthly ridership calculations", () => {
  it("defaults to the latest year with twelve complete months", () => {
    const series = [
      ...Array.from({ length: 12 }, (_, index) => point(`2023-${String(index + 1).padStart(2, "0")}`, index + 1)),
      ...Array.from({ length: 11 }, (_, index) => point(`2024-${String(index + 1).padStart(2, "0")}`, index + 1)),
    ];
    expect(latestYearWithTwelveCompleteMonths(series)).toBe(2023);
    expect(defaultMonthlySelection(series)).toBe(2023);
    expect(selectMonthlySeries(series, 2023)).toHaveLength(12);
  });

  it("does not invent a zero and only compares compatible statuses", () => {
    expect(comparableChange(point("2024-02", 100), point("2024-01", 0))).toBeNull();
    expect(comparableChange(point("2024-02", 100, "partial"), point("2024-01", 100))).toBeNull();
    const summary = summarizeMonthlySeries([point("2024-01", 0), point("2024-02", null), point("2024-03", 120)]);
    expect(summary.total).toBe(120);
    expect(summary.coveredDays).toBe(60);
    expect(summary.latest?.month).toBe("2024-03");
    expect(summary.totalProgression).toBeNull();
    expect(summarizeMonthlySeries([point("2024-01", 100), point("2024-02", 120)]).totalProgression).toBe(20);
    expect(summarizeMonthlySeries([
      point("2024-01", 100, "partial"),
      point("2025-12", 120),
    ]).totalProgression).toBe(20);
  });

  it("keeps moving averages broken across a missing month", () => {
    expect(movingAverage([
      point("2024-01", 1),
      point("2024-02", 2),
      point("2024-03", null),
      point("2024-04", 4),
    ])).toEqual([
      { month: "2024-01", value: null },
      { month: "2024-02", value: null },
      { month: "2024-03", value: null },
      { month: "2024-04", value: null },
    ]);
  });

  it("compresses the chart into calendar buckets without filling gaps", () => {
    const series = [
      point("2024-01", 100),
      point("2024-02", null),
      point("2024-03", 300),
      point("2024-04", 400),
      point("2024-05", 0),
      point("2024-06", 600),
    ];
    expect(ROLLING_WINDOW_MONTHS).toEqual([1, 3, 6, 12]);
    expect(aggregateMonthlySeries(series, 1)).toEqual(series);
    expect(aggregateMonthlySeries(series, 3)).toEqual([
      expect.objectContaining({ month: "2024-03", value: null, status: "missing", coveredDays: 60 }),
      expect.objectContaining({ month: "2024-06", value: 1000, status: "complete", coveredDays: 90 }),
    ]);
    expect(aggregateMonthlySeries(series, 6)[0]).toMatchObject({ value: null, status: "missing" });
    expect(aggregateMonthlySeries(series, 12)[0]).toMatchObject({ value: null, status: "missing" });
  });

  it("keeps a partial compressed bucket visible", () => {
    const buckets = aggregateMonthlySeries([
      point("2024-01", 100),
      point("2024-02", 110),
      point("2024-03", 120, "partial"),
    ], 3);
    expect(buckets[0]).toMatchObject({ month: "2024-03", value: 330, status: "partial", coveredDays: 90 });
  });

  it("uses the recent horizon that belongs to each chart step", () => {
    const series = Array.from({ length: 180 }, (_, index) => {
      const date = new Date(Date.UTC(2012, index, 1));
      const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      return point(month, index + 1);
    });

    expect([1, 3, 6, 12].map(chartHorizonYears)).toEqual([2, 5, 5, 12]);
    expect([1, 3, 6, 12].map(chartBucketCount)).toEqual([24, 20, 10, 12]);
    expect([1, 3, 6, 12].map((step) => selectMonthlyChartSourceSeries(series, step).length)).toEqual([24, 60, 60, 144]);
    expect([1, 3, 6, 12].map((step) => selectMonthlyChartSeries(series, step).length)).toEqual([24, 20, 10, 12]);
  });
});
