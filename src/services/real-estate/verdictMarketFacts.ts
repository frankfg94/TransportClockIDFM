import { DVF_MIN_PUBLIC_SAMPLE_SIZE, type DvfYearlyPrice } from "./compiledRealEstate";

/** Descriptive only: these figures never enter the neighborhood score. */
export const VERDICT_MARKET_SCORE_EFFECT = "descriptive" as const;

export interface VerdictMarketChange {
  fromYear: number;
  toYear: number;
  pricePercent: number;
  salesPercent: number;
  fromSales: number;
  toSales: number;
}

/** Require every published annual vintage and the actual last year of the pack. */
export function verdictMarketChange(
  series: readonly DvfYearlyPrice[] | undefined,
  referencePeriod: string | undefined,
  vintages: number,
): VerdictMarketChange | undefined {
  const years = referencePeriod?.match(/\d{4}/g)?.map(Number);
  const endYear = years?.at(-1);
  if (!endYear || !Number.isInteger(vintages) || vintages < 2) return undefined;
  const points = new Map((series ?? []).filter(point => Number.isInteger(point.year)
    && Number.isFinite(point.medianPriceM2) && point.medianPriceM2 > 0
    && Number.isInteger(point.transactionCount) && point.transactionCount >= DVF_MIN_PUBLIC_SAMPLE_SIZE)
    .map(point => [point.year, point] as const));
  const fromYear = endYear - vintages + 1;
  for (let year = fromYear; year <= endYear; year++) if (!points.has(year)) return undefined;
  const first = points.get(fromYear)!;
  const last = points.get(endYear)!;
  return { fromYear, toYear: endYear, fromSales: first.transactionCount, toSales: last.transactionCount,
    pricePercent: (last.medianPriceM2 / first.medianPriceM2 - 1) * 100,
    salesPercent: (last.transactionCount / first.transactionCount - 1) * 100 };
}
