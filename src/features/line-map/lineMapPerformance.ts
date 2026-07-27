export interface LineMapFrameSummary {
  frames: number;
  medianFps: number;
  p95Ms: number;
  longFrames: number;
}

export interface LineMapFrameProbe {
  start: () => void;
  stop: () => LineMapFrameSummary | undefined;
  dispose: () => void;
}

export interface LineMapRuntimeMetrics {
  lineGeometryServerMs?: number;
  lineGeometryRoundTripMs?: number;
  ghostCloneMs?: number;
  ghostWorkerMs?: number;
  ghostWorkerRoundTripMs?: number;
  ghostMainSwapMs?: number;
  ghostAbandonedGenerations?: number;
}

const runtimeMetrics: LineMapRuntimeMetrics = {};

export function recordLineMapRuntimeMetrics(metrics: LineMapRuntimeMetrics): void {
  Object.entries(metrics).forEach(([key, value]) => {
    if (value === undefined || !Number.isFinite(value)) return;
    runtimeMetrics[key as keyof LineMapRuntimeMetrics] = Number(value.toFixed(1));
  });
}

export function getLineMapRuntimeMetrics(): LineMapRuntimeMetrics {
  return { ...runtimeMetrics };
}

export function resetLineMapRuntimeMetrics(): void {
  Object.keys(runtimeMetrics).forEach((key) => {
    delete runtimeMetrics[key as keyof LineMapRuntimeMetrics];
  });
}

export function parseServerTimingDuration(
  header: string | null,
  metricName: string,
): number | undefined {
  const metric = header
    ?.split(",")
    .map((value) => value.trim())
    .find((value) => value.split(";")[0]?.trim() === metricName);
  const duration = metric?.match(/(?:^|;)\s*dur=([0-9]+(?:\.[0-9]+)?)/u)?.[1];
  return duration === undefined ? undefined : Number(duration);
}

export function summarizeLineMapFrames(durations: number[]): LineMapFrameSummary {
  const sorted = durations.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return { frames: 0, medianFps: 0, p95Ms: 0, longFrames: 0 };
  }

  const medianMs = percentile(sorted, 0.5);
  return {
    frames: sorted.length,
    medianFps: Number((1_000 / Math.max(medianMs, 0.001)).toFixed(1)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(1)),
    longFrames: sorted.filter((duration) => duration > 20).length,
  };
}

export function createLineMapFrameProbe(
  requestFrame: (callback: FrameRequestCallback) => number,
  cancelFrame: (handle: number) => void,
): LineMapFrameProbe {
  const durations: number[] = [];
  let frame: number | undefined;
  let previousTimestamp: number | undefined;

  const step: FrameRequestCallback = (timestamp) => {
    if (previousTimestamp !== undefined) durations.push(timestamp - previousTimestamp);
    previousTimestamp = timestamp;
    frame = requestFrame(step);
  };

  return {
    start() {
      if (frame !== undefined) return;
      durations.length = 0;
      previousTimestamp = undefined;
      frame = requestFrame(step);
    },
    stop() {
      if (frame === undefined) return undefined;
      cancelFrame(frame);
      frame = undefined;
      previousTimestamp = undefined;
      return summarizeLineMapFrames(durations);
    },
    dispose() {
      if (frame !== undefined) cancelFrame(frame);
      frame = undefined;
      previousTimestamp = undefined;
      durations.length = 0;
    },
  };
}

function percentile(sorted: number[], ratio: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}
