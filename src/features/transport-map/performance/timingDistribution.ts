/** Whole-run histogram: bounded memory, including samples whose trace was evicted. */
const BOUNDS = [
  ...Array.from({ length: 101 }, (_, index) => index),
  ...Array.from({ length: 64 }, (_, index) => 100 * 2 ** ((index + 1) / 4)),
];

export class TimingDistribution {
  private bins = new Uint32Array(BOUNDS.length + 1);
  count = 0;
  totalMs = 0;
  maxMs = 0;
  over50Ms = 0;
  over100Ms = 0;
  over16_7Ms = 0;
  over33Ms = 0;

  add(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    let low = 0;
    let high = BOUNDS.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (BOUNDS[mid]! < durationMs) low = mid + 1;
      else high = mid;
    }
    this.bins[low]! += 1;
    this.count += 1;
    this.totalMs += durationMs;
    this.maxMs = Math.max(this.maxMs, durationMs);
    if (durationMs > 50) this.over50Ms += 1;
    if (durationMs > 100) this.over100Ms += 1;
    if (durationMs > 16.7) this.over16_7Ms += 1;
    if (durationMs > 33) this.over33Ms += 1;
  }

  snapshot() {
    const range = (percentile: number): [number, number] => {
      if (!this.count) return [0, 0];
      const target = Math.ceil(this.count * percentile);
      let count = 0;
      for (let index = 0; index < this.bins.length; index += 1) {
        count += this.bins[index]!;
        if (count >= target) return [round(BOUNDS[index - 1] ?? 0), round(Math.min(BOUNDS[index] ?? this.maxMs, this.maxMs))];
      }
      return [this.maxMs, this.maxMs];
    };
    return {
      count: this.count,
      totalMs: round(this.totalMs),
      averageMs: round(this.count ? this.totalMs / this.count : 0),
      maxMs: round(this.maxMs),
      over50Ms: this.over50Ms,
      over100Ms: this.over100Ms,
      over16_7Ms: this.over16_7Ms,
      over33Ms: this.over33Ms,
      percentileMethod: "whole-run-histogram-range" as const,
      p50RangeMs: range(0.5),
      p95RangeMs: range(0.95),
      p99RangeMs: range(0.99),
    };
  }
}

function round(value: number): number { return Number(value.toFixed(3)); }
