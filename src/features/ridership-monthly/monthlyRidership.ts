import type { MonthlySeriesPoint } from "../../types/ridership";

export type MonthlySelection = number | "all";
export const ROLLING_WINDOW_MONTHS = [1, 3, 6, 12] as const;

export function chartHorizonYears(stepMonths: number): number {
  switch (normalizeStepMonths(stepMonths)) {
    case 1:
      return 2;
    case 3:
    case 6:
      return 5;
    case 12:
      return 12;
    default:
      return 1;
  }
}

export function chartBucketCount(stepMonths: number): number {
  const step = normalizeStepMonths(stepMonths);
  return Math.max(1, Math.ceil((chartHorizonYears(step) * 12) / step));
}

export function selectMonthlyChartSourceSeries(
  series: MonthlySeriesPoint[],
  stepMonths: number,
): MonthlySeriesPoint[] {
  const ordered = [...series].sort((left, right) => left.month.localeCompare(right.month));
  return ordered.slice(-(chartHorizonYears(stepMonths) * 12));
}

export function selectMonthlyChartSeries(
  series: MonthlySeriesPoint[],
  stepMonths: number,
): MonthlySeriesPoint[] {
  return aggregateMonthlySeries(series, stepMonths).slice(-chartBucketCount(stepMonths));
}

export interface MonthlySeriesSummary {
  total: number;
  coveredDays: number;
  averagePerCoveredDay: number | null;
  latest?: MonthlySeriesPoint;
  record?: MonthlySeriesPoint;
  yearOverYear: number | null;
  totalProgression: number | null;
}

export function availableYears(series: MonthlySeriesPoint[]): number[] {
  return [...new Set(series.map((point) => Number(point.month.slice(0, 4))))]
    .filter(Number.isInteger)
    .sort((left, right) => left - right);
}

export function latestYearWithTwelveCompleteMonths(series: MonthlySeriesPoint[]): number | undefined {
  return availableYears(series).reverse().find((year) => {
    const months = series.filter((point) => point.month.startsWith(`${year}-`));
    return months.length === 12 && months.every((point) => point.status === "complete" && point.value !== null);
  });
}

export function defaultMonthlySelection(series: MonthlySeriesPoint[]): MonthlySelection {
  return latestYearWithTwelveCompleteMonths(series) ?? availableYears(series).at(-1) ?? "all";
}

export function selectMonthlySeries(
  series: MonthlySeriesPoint[],
  selection: MonthlySelection,
): MonthlySeriesPoint[] {
  return selection === "all"
    ? series
    : series.filter((point) => point.month.startsWith(`${selection}-`));
}

export function summarizeMonthlySeries(series: MonthlySeriesPoint[]): MonthlySeriesSummary {
  const observed = series.filter((point) => point.value !== null && Number.isFinite(point.value));
  const total = observed.reduce((sum, point) => sum + (point.value ?? 0), 0);
  const coveredDays = observed.reduce((sum, point) => sum + point.coveredDays, 0);
  const latest = observed.at(-1);
  const first = observed[0];
  const record = observed.reduce<MonthlySeriesPoint | undefined>(
    (best, point) => !best || (point.value ?? -Infinity) > (best.value ?? -Infinity) ? point : best,
    undefined,
  );
  return {
    total,
    coveredDays,
    averagePerCoveredDay: coveredDays > 0 ? total / coveredDays : null,
    ...(latest ? { latest } : {}),
    ...(record ? { record } : {}),
    yearOverYear: latest ? comparableChange(latest, findMonth(series, shiftMonth(latest.month, -12))) : null,
    totalProgression: first && latest && first.month !== latest.month
      ? percentageChange(latest.value, first.value)
      : null,
  };
}

/**
 * Compresses a monthly series into calendar-aligned buckets. A bucket with a
 * missing month stays null; partial observations remain visible and carry
 * their covered-day count. This is used only for the chart display.
 */
export function aggregateMonthlySeries(
  series: MonthlySeriesPoint[],
  stepMonths = 1,
): MonthlySeriesPoint[] {
  const ordered = [...series].sort((left, right) => left.month.localeCompare(right.month));
  const size = normalizeStepMonths(stepMonths);
  if (ordered.length === 0) return [];

  const pointsByMonth = new Map(ordered.map((point) => [point.month, point]));
  const firstBucket = bucketStart(ordered[0]!.month, size);
  const lastBucket = bucketStart(ordered.at(-1)!.month, size);
  const buckets: MonthlySeriesPoint[] = [];

  for (let bucket = firstBucket; bucket <= lastBucket; bucket = shiftMonth(bucket, size)) {
    const bucketMonths = Array.from({ length: size }, (_, index) => shiftMonth(bucket, index));
    const points = bucketMonths.map((month) => pointsByMonth.get(month));
    const observed = points.filter((point): point is MonthlySeriesPoint => Boolean(point && point.value !== null));
    const coveredDays = observed.reduce((sum, point) => sum + point.coveredDays, 0);
    const hasMissingMonth = points.some((point) => !point || point.value === null);
    const status: MonthlySeriesPoint["status"] = hasMissingMonth
      ? "missing"
      : points.every((point) => point?.status === "complete")
        ? "complete"
        : "partial";
    const value = hasMissingMonth
      ? null
      : observed.reduce((sum, point) => sum + (point.value ?? 0), 0);
    buckets.push({
      month: shiftMonth(bucket, size - 1),
      value,
      status,
      coveredDays,
      ...(points.some((point) => point?.censored) ? { censored: true } : {}),
    });
  }
  return buckets;
}

export function comparableChange(
  current: MonthlySeriesPoint | undefined,
  previous: MonthlySeriesPoint | undefined,
): number | null {
  if (!current || !previous || current.value === null || previous.value === null) return null;
  if (current.status === "missing" || previous.status === "missing" || current.status !== previous.status) return null;
  if (previous.value === 0) return current.value === 0 ? 0 : null;
  return ((current.value - previous.value) / Math.abs(previous.value)) * 100;
}

export function movingAverage(
  series: MonthlySeriesPoint[],
  windowSize = 3,
): Array<{ month: string; value: number | null }> {
  return series.map((point, index) => {
    if (point.value === null || index < windowSize - 1) return { month: point.month, value: null };
    const window = series.slice(index - windowSize + 1, index + 1);
    if (window.some((candidate) => candidate.value === null)) return { month: point.month, value: null };
    return {
      month: point.month,
      value: window.reduce((sum, candidate) => sum + (candidate.value ?? 0), 0) / windowSize,
    };
  });
}

function findMonth(series: MonthlySeriesPoint[], month: string): MonthlySeriesPoint | undefined {
  return series.find((point) => point.month === month);
}

function shiftMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function bucketStart(month: string, stepMonths: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstMonth = Math.floor((monthNumber - 1) / stepMonths) * stepMonths + 1;
  return `${year}-${String(firstMonth).padStart(2, "0")}`;
}

function percentageChange(current: number | null, initial: number | null): number | null {
  if (current === null || initial === null || initial === 0) return null;
  return ((current - initial) / Math.abs(initial)) * 100;
}

function normalizeStepMonths(stepMonths: number): number {
  return Number.isFinite(stepMonths) ? Math.max(1, Math.floor(stepMonths)) : 1;
}
