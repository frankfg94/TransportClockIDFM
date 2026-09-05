import type { TransportMapPerformanceTrace, TransportMapTraceReport } from "./transportMapPerformanceTrace";

/**
 * The performance gate is intentionally stricter than “the average looks
 * smooth”. A 60 Hz frame has 16.7 ms; p95/p99 and long-task counts reveal the
 * occasional hitch that users feel during a slow zoom or a fast pan.
 */
export const TRANSPORT_MAP_PERFORMANCE_THRESHOLDS = {
  deliveredFrameRatioMin: 0.98,
  medianFrameTimeMsMax: 16.7,
  p95FrameTimeMsMax: 18,
  p99FrameTimeMsMax: 25,
  longFrameMsMax: 50,
} as const;

export interface TransportMapPerformanceMemory {
  usedJsHeapSize?: number;
  totalJsHeapSize?: number;
  jsHeapSizeLimit?: number;
}

export interface TransportMapRendererAggregate {
  frames: number;
  totalRenderMs: number;
  medianRenderMs: number;
  p95RenderMs: number;
  focusedLineLiveRedrawFrames: number;
  pathCacheCaptureCount: number;
  pathCacheCaptureMs: number;
  pathCacheCapturedBytes: number;
}

export interface TransportMapPerformanceReport {
  startedAt: string;
  stoppedAt: string;
  durationMs: number;
  warmupMs: number;
  expectedHz: number;
  frames: number;
  expectedFrames: number;
  deliveredFrameRatio: number;
  medianFrameTimeMs: number;
  p95FrameTimeMs: number;
  p99FrameTimeMs: number;
  framesOver50Ms: number;
  /** Browser RAF cadence, including idle frames while the probe is running. */
  presentedFrames: number;
  /** Cadence of frames rendered while the map was actively moving. */
  presentedFrameRatio: number;
  presentedMedianFrameTimeMs: number;
  presentedP95FrameTimeMs: number;
  presentedP99FrameTimeMs: number;
  presentedFramesOver50Ms: number;
  longTasksOver50Ms: number;
  workerTimeMs: number;
  decodeTimeMs: number;
  hitTestTimeMs: number;
  bytesLoaded: number;
  lastRenderer?: TransportMapRendererMetrics;
  rendererAggregate: TransportMapRendererAggregate;
  cache?: {
    entries: number;
    bytes: number;
    hits: number;
    misses: number;
    evictions: number;
  };
  memoryStart?: TransportMapPerformanceMemory;
  memoryEnd?: TransportMapPerformanceMemory;
  memoryDeltaBytes?: number;
  thresholds: typeof TRANSPORT_MAP_PERFORMANCE_THRESHOLDS;
  metadata?: Record<string, unknown>;
  trace?: TransportMapTraceReport;
}

export interface TransportMapPerformanceProbe {
  start(): void;
  stop(metadata?: Record<string, unknown>): TransportMapPerformanceReport;
  snapshot(metadata?: Record<string, unknown>): TransportMapPerformanceReport;
  recordRendererMetrics(metrics: TransportMapPerformanceReport["lastRenderer"]): void;
  /** Marks a frame that reached the map renderer, not just the browser RAF. */
  recordPresentedFrame(interactive?: boolean): void;
  recordTiming(kind: "worker" | "decode" | "hitTest", durationMs: number): void;
  recordBytes(bytes: number): void;
  recordCacheMetrics(metrics: NonNullable<TransportMapPerformanceReport["cache"]>): void;
  dispose(): void;
}

export interface TransportMapPerformanceProbeOptions {
  expectedHz?: number;
  warmupMs?: number;
  now?: () => number;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
  observeLongTasks?: boolean;
  /** Optional causal recorder; it remains independent from this probe. */
  trace?: TransportMapPerformanceTrace;
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

export function createTransportMapPerformanceProbe(
  options: TransportMapPerformanceProbeOptions = {},
): TransportMapPerformanceProbe {
  const expectedHz = options.expectedHz ?? 60;
  const warmupMs = Math.max(0, options.warmupMs ?? 1_000);
  const now = options.now ?? (() => (typeof performance === "undefined" ? Date.now() : performance.now()));
  const requestFrame = options.requestFrame ?? ((callback) => {
    if (typeof requestAnimationFrame === "undefined") throw new Error("requestAnimationFrame is unavailable");
    return requestAnimationFrame(callback);
  });
  const cancelFrame = options.cancelFrame ?? ((handle) => {
    if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(handle);
  });
  // `frameTimes` measures the browser's ability to deliver callbacks. The
  // second series is fed by GlobalTransportPlan after Canvas2D render and is
  // the useful signal for a map gesture: a page can deliver RAF callbacks
  // while the map itself is not being presented.
  const frameTimes: number[] = [];
  const presentedFrameTimes: number[] = [];
  const rendererRenderTimes: number[] = [];
  let running = false;
  let frameHandle: number | undefined;
  let startedAtMs = 0;
  let stoppedAtMs = 0;
  let previousFrameAtMs: number | undefined;
  let previousPresentedFrameAtMs: number | undefined;
  let interactionStartedAtMs: number | undefined;
  let interactionDurationMs = 0;
  let presentedStreamActive = false;
  let frameCount = 0;
  let longTasksOver50Ms = 0;
  let workerTimeMs = 0;
  let decodeTimeMs = 0;
  let hitTestTimeMs = 0;
  let bytesLoaded = 0;
  let lastRenderer: TransportMapPerformanceReport["lastRenderer"];
  let focusedLineLiveRedrawFrames = 0;
  let pathCacheCaptureCount = 0;
  let pathCacheCaptureMs = 0;
  let pathCacheCapturedBytes = 0;
  let cache: TransportMapPerformanceReport["cache"];
  let memoryStart: TransportMapPerformanceMemory | undefined;
  let memoryEnd: TransportMapPerformanceMemory | undefined;
  let observer: PerformanceObserver | undefined;
  let lastMetadata: Record<string, unknown> | undefined;

  const onFrame: FrameRequestCallback = (timestamp) => {
    if (!running) return;
    frameCount += 1;
    if (previousFrameAtMs !== undefined) {
      const duration = Math.max(0, timestamp - previousFrameAtMs);
      if (options.trace?.isRunning) options.trace.recordFrame(duration, timestamp);
      if (timestamp - startedAtMs >= warmupMs) frameTimes.push(duration);
    }
    previousFrameAtMs = timestamp;
    frameHandle = requestFrame(onFrame);
  };

  function startLongTaskObserver(): void {
    if (options.observeLongTasks === false || typeof PerformanceObserver === "undefined") return;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > TRANSPORT_MAP_PERFORMANCE_THRESHOLDS.longFrameMsMax) longTasksOver50Ms += 1;
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      observer = undefined;
    }
  }

  function stopLongTaskObserver(): void {
    observer?.disconnect();
    observer = undefined;
  }

  function reset(): void {
    frameTimes.length = 0;
    presentedFrameTimes.length = 0;
    rendererRenderTimes.length = 0;
    frameCount = 0;
    longTasksOver50Ms = 0;
    workerTimeMs = 0;
    decodeTimeMs = 0;
    hitTestTimeMs = 0;
    bytesLoaded = 0;
    lastRenderer = undefined;
    focusedLineLiveRedrawFrames = 0;
    pathCacheCaptureCount = 0;
    pathCacheCaptureMs = 0;
    pathCacheCapturedBytes = 0;
    cache = undefined;
    memoryStart = readMemory();
    memoryEnd = undefined;
    lastMetadata = undefined;
  }

  function start(): void {
    if (running) return;
    reset();
    running = true;
    startedAtMs = now();
    stoppedAtMs = startedAtMs;
    previousFrameAtMs = undefined;
    previousPresentedFrameAtMs = undefined;
    interactionStartedAtMs = undefined;
    interactionDurationMs = 0;
    presentedStreamActive = false;
    startLongTaskObserver();
    frameHandle = requestFrame(onFrame);
  }

  function snapshot(metadata?: Record<string, unknown>): TransportMapPerformanceReport {
    const end = running ? now() : stoppedAtMs || now();
    const durationMs = Math.max(0, end - startedAtMs);
    const measuredDurationMs = Math.max(0, durationMs - warmupMs);
    const expectedFrames = measuredDurationMs * expectedHz / 1_000;
    const measuredInteractionDurationMs = interactionDurationMs + (
      presentedStreamActive && interactionStartedAtMs !== undefined
        ? Math.max(0, end - interactionStartedAtMs)
        : 0
    );
    const expectedPresentedFrames = measuredInteractionDurationMs * expectedHz / 1_000;
    const sorted = [...frameTimes].sort((left, right) => left - right);
    const presentedSorted = [...presentedFrameTimes].sort((left, right) => left - right);
    const sortedRendererTimes = [...rendererRenderTimes].sort((left, right) => left - right);
    const report: TransportMapPerformanceReport = {
      startedAt: new Date(Date.now() - Math.max(0, now() - startedAtMs)).toISOString(),
      stoppedAt: new Date().toISOString(),
      durationMs: round(durationMs),
      warmupMs,
      expectedHz,
      frames: sorted.length,
      expectedFrames: round(expectedFrames),
      deliveredFrameRatio: round(cappedRatio(sorted.length, expectedFrames)),
      medianFrameTimeMs: round(percentile(sorted, 0.5)),
      p95FrameTimeMs: round(percentile(sorted, 0.95)),
      p99FrameTimeMs: round(percentile(sorted, 0.99)),
      framesOver50Ms: sorted.filter((duration) => duration > TRANSPORT_MAP_PERFORMANCE_THRESHOLDS.longFrameMsMax).length,
      presentedFrames: presentedSorted.length,
      presentedFrameRatio: round(cappedRatio(presentedSorted.length, expectedPresentedFrames)),
      presentedMedianFrameTimeMs: round(percentile(presentedSorted, 0.5)),
      presentedP95FrameTimeMs: round(percentile(presentedSorted, 0.95)),
      presentedP99FrameTimeMs: round(percentile(presentedSorted, 0.99)),
      presentedFramesOver50Ms: presentedSorted.filter((duration) => duration > TRANSPORT_MAP_PERFORMANCE_THRESHOLDS.longFrameMsMax).length,
      longTasksOver50Ms,
      workerTimeMs: round(workerTimeMs),
      decodeTimeMs: round(decodeTimeMs),
      hitTestTimeMs: round(hitTestTimeMs),
      bytesLoaded,
      lastRenderer,
      rendererAggregate: {
        frames: sortedRendererTimes.length,
        totalRenderMs: round(rendererRenderTimes.reduce((sum, value) => sum + value, 0)),
        medianRenderMs: round(percentile(sortedRendererTimes, 0.5)),
        p95RenderMs: round(percentile(sortedRendererTimes, 0.95)),
        focusedLineLiveRedrawFrames,
        pathCacheCaptureCount,
        pathCacheCaptureMs: round(pathCacheCaptureMs),
        pathCacheCapturedBytes,
      },
      cache,
      memoryStart,
      memoryEnd,
      memoryDeltaBytes: memoryStart?.usedJsHeapSize !== undefined && memoryEnd?.usedJsHeapSize !== undefined
        ? memoryEnd.usedJsHeapSize - memoryStart.usedJsHeapSize
        : undefined,
      thresholds: TRANSPORT_MAP_PERFORMANCE_THRESHOLDS,
      metadata: metadata ?? lastMetadata,
    };
    return omitUndefined(report);
  }

  return {
    start,
    stop(metadata) {
      if (running) {
        running = false;
        if (frameHandle !== undefined) cancelFrame(frameHandle);
        frameHandle = undefined;
        stoppedAtMs = now();
        memoryEnd = readMemory();
        stopLongTaskObserver();
      }
      lastMetadata = metadata;
      return snapshot(metadata);
    },
    snapshot,
    recordRendererMetrics(metrics) {
      lastRenderer = metrics ? { ...metrics } : undefined;
      if (!metrics) return;
      rendererRenderTimes.push(Math.max(0, metrics.renderMs));
      if (metrics.focusedLineLiveRedraw) focusedLineLiveRedrawFrames += 1;
      pathCacheCaptureCount += metrics.pathCacheCaptureCount;
      pathCacheCaptureMs += Math.max(0, metrics.pathCacheCaptureMs);
      pathCacheCapturedBytes += Math.max(0, metrics.pathCacheCapturedBytes);
    },
    recordPresentedFrame(interactive = true) {
      if (!running) return;
      const timestamp = now();
      if (!interactive) {
        if (presentedStreamActive && interactionStartedAtMs !== undefined) {
          interactionDurationMs += Math.max(0, timestamp - interactionStartedAtMs);
        }
        presentedStreamActive = false;
        interactionStartedAtMs = undefined;
        previousPresentedFrameAtMs = undefined;
        return;
      }
      if (!presentedStreamActive) {
        presentedStreamActive = true;
        interactionStartedAtMs = timestamp;
        previousPresentedFrameAtMs = timestamp;
        return;
      }
      if (previousPresentedFrameAtMs !== undefined) {
        presentedFrameTimes.push(Math.max(0, timestamp - previousPresentedFrameAtMs));
      }
      previousPresentedFrameAtMs = timestamp;
    },
    recordTiming(kind, durationMs) {
      if (!Number.isFinite(durationMs) || durationMs < 0) return;
      if (kind === "worker") workerTimeMs += durationMs;
      else if (kind === "decode") decodeTimeMs += durationMs;
      else hitTestTimeMs += durationMs;
    },
    recordBytes(bytes) {
      if (Number.isFinite(bytes) && bytes >= 0) bytesLoaded += bytes;
    },
    recordCacheMetrics(metrics) {
      cache = { ...metrics };
    },
    dispose() {
      if (running) {
        running = false;
        if (frameHandle !== undefined) cancelFrame(frameHandle);
      }
      frameHandle = undefined;
      stopLongTaskObserver();
      frameTimes.length = 0;
      presentedFrameTimes.length = 0;
      rendererRenderTimes.length = 0;
      interactionStartedAtMs = undefined;
      interactionDurationMs = 0;
      presentedStreamActive = false;
    },
  };
}

function readMemory(): TransportMapPerformanceMemory | undefined {
  if (typeof performance === "undefined") return undefined;
  const memory = (performance as PerformanceWithMemory).memory;
  if (!memory) return undefined;
  return {
    usedJsHeapSize: memory.usedJSHeapSize,
    totalJsHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
  };
}

function percentile(sorted: number[], ratio: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))]!;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function cappedRatio(samples: number, expectedSamples: number): number {
  return expectedSamples > 0 ? Math.min(1, samples / expectedSamples) : 0;
}

function omitUndefined<T extends object>(value: T): T {
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (record[key] === undefined) delete record[key];
  }
  return value;
}
import type { TransportMapRendererMetrics } from "../contracts/renderer";
