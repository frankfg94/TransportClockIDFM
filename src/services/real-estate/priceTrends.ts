import { DVF_MIN_PUBLIC_SAMPLE_SIZE, type DvfYearlyPrice } from "./compiledRealEstate";

export type DvfPriceTrendPeriod = 1 | 3 | 5;

export interface DvfPriceTrendChange {
  period: DvfPriceTrendPeriod;
  fromYear: number;
  toYear: number;
  percent: number;
}

/**
 * Compare like-for-like annual aggregates. The five-year label means five
 * published calendar vintages (for example 2021–2025); the returned years make
 * that exact coverage visible wherever the change is rendered.
 */
export function calculateDvfPriceChanges(
  series: readonly DvfYearlyPrice[] | undefined,
  measure: "mean" | "median" = "median",
): DvfPriceTrendChange[] {
  if (!series?.length) return [];
  const points = new Map(series
    .filter((point) => Number.isInteger(point.year)
      && point.transactionCount >= DVF_MIN_PUBLIC_SAMPLE_SIZE
      && Number.isFinite(point[measure === "mean" ? "meanPriceM2" : "medianPriceM2"])
      && point[measure === "mean" ? "meanPriceM2" : "medianPriceM2"] > 0)
    .map((point) => [point.year, point] as const));
  const toYear = Math.max(...points.keys());
  if (!Number.isFinite(toYear)) return [];

  const changes: DvfPriceTrendChange[] = [];
  for (const period of [1, 3, 5] as const) {
    // Five source vintages span 2021, 2022, 2023, 2024, 2025.
    const fromYear = toYear - (period === 5 ? 4 : period);
    const start = points.get(fromYear);
    const end = points.get(toYear);
    if (!start || !end) continue;
    const startPrice = start[measure === "mean" ? "meanPriceM2" : "medianPriceM2"];
    const endPrice = end[measure === "mean" ? "meanPriceM2" : "medianPriceM2"];
    changes.push({ period, fromYear, toYear, percent: (endPrice / startPrice - 1) * 100 });
  }
  return changes;
}

export function formatDvfPriceChange(value: number, format: (value: number, maximumFractionDigits: number) => string): string {
  const rounded = Math.round(value * 10) / 10;
  const fractionDigits = Math.abs(rounded % 1) > 0 ? 1 : 0;
  const magnitude = format(Math.abs(rounded), fractionDigits);
  if (rounded > 0) return `+${magnitude} %`;
  if (rounded < 0) return `−${magnitude} %`;
  return `0 %`;
}
