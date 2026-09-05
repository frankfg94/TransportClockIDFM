import { describe, expect, it } from "vitest";

import {
  parseAndroidGfxinfoFrames,
  parseAndroidPssKb,
  summarizeAndroidGfxinfo,
} from "../scripts/transport-map/androidGfxinfo";

describe("Android gfxinfo parser", () => {
  it("extracts exact frame durations from PROFILEDATA", () => {
    const columns = [
      "Flags", "FrameTimelineVsyncId", "IntendedVsync", "Vsync", "InputEventId",
      "HandleInputStart", "AnimationStart", "PerformTraversalsStart", "DrawStart",
      "FrameDeadline", "FrameStartTime", "FrameInterval", "WorkloadTarget", "SyncQueued",
      "SyncStart", "IssueDrawCommandsStart", "SwapBuffers", "FrameCompleted",
      "DequeueBufferDuration", "QueueBufferDuration", "GpuCompleted", "SwapBuffersCompleted",
      "DisplayPresentTime", "CommandSubmissionCompleted",
    ];
    const row = (intended: number, completed: number, id: number) => {
      const values = new Array(columns.length).fill(0) as number[];
      values[0] = 0;
      values[1] = id;
      values[2] = intended;
      values[11] = 16_666_666;
      values[17] = completed;
      return values.join(",");
    };
    const raw = [
      "---PROFILEDATA---",
      `${columns.join(",")},`,
      row(0, 16_000_000, 1),
      row(16_666_666, 33_666_666, 2),
      "---PROFILEDATA---",
    ].join("\n");

    const frames = parseAndroidGfxinfoFrames(raw);
    const metrics = summarizeAndroidGfxinfo(frames);

    expect(frames).toHaveLength(2);
    expect(frames.map((frame) => frame.frameTimeMs)).toEqual([16, 17]);
    expect(metrics.deliveredFrameRatio).toBe(1);
    expect(metrics.medianFrameTimeMs).toBe(16);
    expect(metrics.p95FrameTimeMs).toBe(17);
    expect(metrics.p99FrameTimeMs).toBe(17);
    expect(metrics.framesOver50Ms).toBe(0);
  });

  it("parses Android's comma-grouped total PSS", () => {
    expect(parseAndroidPssKb("TOTAL PSS: 111,574\n")).toBe(111574);
    expect(parseAndroidPssKb("no total")).toBeUndefined();
  });
});
