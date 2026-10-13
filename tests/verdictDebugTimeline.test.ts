import { describe, expect, it } from "vitest";
import { createVerdictDebugTimeline } from "../src/services/verdictDebugTimeline";

describe("common verdict timeline", () => {
  it("records a later worker release while preserving the subscriber cancellation time and status", () => {
    let clock = 10;
    const timeline = createVerdictDebugTimeline(() => clock);
    const finish = timeline.begin("gtfs-worker", "routes");
    clock = 20; finish("cancelled");
    clock = 100; finish.annotate({ workerReleased: true, workerEndedMs: 100 });
    expect(timeline.tasks.value[0]).toMatchObject({ startMs: 10, endMs: 20, durationMs: 10, status: "cancelled",
      details: { workerReleased: true, workerEndedMs: 100 } });
  });
  it("retains overlapping task starts, finishes, durations and failures on the same clock", () => {
    let clock = 100;
    const timeline = createVerdictDebugTimeline(() => clock);
    const finishHeavy = timeline.begin("heavy", "resolve", { candidates: 30 });
    clock = 120; const finishGpe = timeline.begin("gpe", "catalogue");
    clock = 180; finishGpe("ready", { stations: 60 });
    clock = 220; finishHeavy("error"); finishHeavy("ready");
    expect(timeline.tasks.value).toEqual([
      { id: 1, system: "heavy", task: "resolve", startMs: 100, endMs: 220, durationMs: 120, status: "error", details: { candidates: 30 } },
      { id: 2, system: "gpe", task: "catalogue", startMs: 120, endMs: 180, durationMs: 60, status: "ready", details: { stations: 60 } },
    ]);
    timeline.clear(); expect(timeline.tasks.value).toEqual([]);
  });
  it("bounds debug history without discarding or completing actual work", () => {
    const timeline = createVerdictDebugTimeline(() => 0);
    const finish = timeline.begin("initial", "active");
    for (let i = 0; i < 2100; i++) timeline.begin("refresh", String(i))("ready");
    expect(timeline.tasks.value).toHaveLength(2000); expect(() => finish("cancelled")).not.toThrow();
  });
});
