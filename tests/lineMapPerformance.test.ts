import { describe, expect, it, vi } from "vitest";
import {
  createLineMapFrameProbe,
  getLineMapRuntimeMetrics,
  parseServerTimingDuration,
  recordLineMapRuntimeMetrics,
  resetLineMapRuntimeMetrics,
  summarizeLineMapFrames,
} from "../src/features/line-map/lineMapPerformance";

describe("line map performance probe", () => {
  it("parses server timing and exposes rounded runtime metrics", () => {
    resetLineMapRuntimeMetrics();
    expect(
      parseServerTimingDuration("db;dur=2.1, line-geometry;dur=86.27", "line-geometry"),
    ).toBe(86.27);
    expect(parseServerTimingDuration(null, "line-geometry")).toBeUndefined();

    recordLineMapRuntimeMetrics({
      lineGeometryServerMs: 86.27,
      ghostCloneMs: 4.24,
      ghostAbandonedGenerations: 2,
    });
    expect(getLineMapRuntimeMetrics()).toEqual({
      lineGeometryServerMs: 86.3,
      ghostCloneMs: 4.2,
      ghostAbandonedGenerations: 2,
    });
    resetLineMapRuntimeMetrics();
  });

  it("reports median FPS, p95 and long frames deterministically", () => {
    expect(summarizeLineMapFrames([16, 16, 17, 18, 24, 40])).toEqual({
      frames: 6,
      medianFps: 58.8,
      p95Ms: 40,
      longFrames: 2,
    });
  });

  it("samples only while active and cancels the pending animation frame", () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    const cancelFrame = vi.fn((handle: number) => frames.delete(handle));
    const probe = createLineMapFrameProbe(requestFrame, cancelFrame);

    probe.start();
    probe.start();
    expect(requestFrame).toHaveBeenCalledTimes(1);

    frames.get(1)?.(0);
    frames.get(2)?.(16);
    frames.get(3)?.(33);
    expect(probe.stop()).toEqual({
      frames: 2,
      medianFps: 62.5,
      p95Ms: 17,
      longFrames: 0,
    });
    expect(cancelFrame).toHaveBeenCalledWith(4);
    expect(probe.stop()).toBeUndefined();
  });
});
