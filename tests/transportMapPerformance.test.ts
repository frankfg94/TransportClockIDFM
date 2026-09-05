import { describe, expect, it } from "vitest";
import {
  createTransportMapPerformanceProbe,
  TRANSPORT_MAP_PERFORMANCE_THRESHOLDS,
} from "../src/features/transport-map/performance/transportMapPerformance";

describe("transport map performance probe", () => {
  it("computes delivered frames and percentiles after warmup", () => {
    let now = 0;
    let nextHandle = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    const probe = createTransportMapPerformanceProbe({
      now: () => now,
      warmupMs: 100,
      expectedHz: 60,
      observeLongTasks: false,
      requestFrame: (callback) => {
        const handle = nextHandle++;
        callbacks.set(handle, callback);
        return handle;
      },
      cancelFrame: (handle) => callbacks.delete(handle),
    });

    const tick = (durationMs: number) => {
      now += durationMs;
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback(now));
    };

    probe.start();
    for (let index = 0; index < 90; index += 1) {
      tick(1000 / 60);
      probe.recordPresentedFrame();
      probe.recordRendererMetrics({
        renderer: "canvas2d-main-thread",
        drawCalls: 2,
        visiblePathCount: 1,
        visibleStationCount: 2,
        renderMs: 4,
        cacheBytes: 100,
        focusedLineLiveRedraw: index > 30,
        pathCacheCaptureCount: index === 30 ? 1 : 0,
        pathCacheCaptureMs: index === 30 ? 1.5 : 0,
        pathCacheCapturedBytes: index === 30 ? 100 : 0,
      });
    }
    probe.recordPresentedFrame(false);
    probe.recordTiming("worker", 2.5);
    probe.recordTiming("decode", 4.5);
    probe.recordTiming("hitTest", 0.4);
    probe.recordBytes(1234);
    probe.recordCacheMetrics({ entries: 2, bytes: 456, hits: 8, misses: 3, evictions: 1 });
    const report = probe.stop({ scenario: "synthetic" });

    expect(report.frames).toBeGreaterThan(0);
    expect(report.deliveredFrameRatio).toBeGreaterThanOrEqual(0.98);
    expect(report.medianFrameTimeMs).toBeCloseTo(1000 / 60, 2);
    expect(report.p95FrameTimeMs).toBeCloseTo(1000 / 60, 2);
    expect(report.p99FrameTimeMs).toBeCloseTo(1000 / 60, 2);
    expect(report.framesOver50Ms).toBe(0);
    expect(report.presentedFrames).toBeGreaterThan(0);
    expect(report.presentedFrameRatio).toBeGreaterThanOrEqual(0.98);
    expect(report.presentedP95FrameTimeMs).toBeCloseTo(1000 / 60, 2);
    expect(report.workerTimeMs).toBe(2.5);
    expect(report.decodeTimeMs).toBe(4.5);
    expect(report.hitTestTimeMs).toBe(0.4);
    expect(report.bytesLoaded).toBe(1234);
    expect(report.cache).toEqual({ entries: 2, bytes: 456, hits: 8, misses: 3, evictions: 1 });
    expect(report.rendererAggregate).toEqual({
      frames: 90,
      totalRenderMs: 360,
      medianRenderMs: 4,
      p95RenderMs: 4,
      focusedLineLiveRedrawFrames: 59,
      pathCacheCaptureCount: 1,
      pathCacheCaptureMs: 1.5,
      pathCacheCapturedBytes: 100,
    });
    expect(TRANSPORT_MAP_PERFORMANCE_THRESHOLDS.p99FrameTimeMsMax).toBe(25);
  });

  it("counts a long frame without writing logs", () => {
    let now = 0;
    let callback: FrameRequestCallback | undefined;
    let nextHandle = 0;
    const probe = createTransportMapPerformanceProbe({
      now: () => now,
      warmupMs: 0,
      observeLongTasks: false,
      requestFrame: (next) => {
        callback = next;
        return ++nextHandle;
      },
      cancelFrame: () => undefined,
    });

    probe.start();
    now = 16;
    callback?.(now);
    now = 90;
    callback?.(now);
    const report = probe.stop();

    expect(report.framesOver50Ms).toBe(1);
    expect(report.p99FrameTimeMs).toBe(74);
  });
});
