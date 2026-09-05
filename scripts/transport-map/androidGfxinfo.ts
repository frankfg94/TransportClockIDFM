export interface AndroidGfxinfoFrame {
  flags: number;
  intendedVsyncNs: number;
  frameCompletedNs: number;
  frameIntervalNs: number;
  frameTimeMs: number;
}

export interface AndroidGfxinfoMetrics {
  frameCount: number;
  expectedFrameCount?: number;
  deliveredFrameRatio?: number;
  medianFrameTimeMs?: number;
  p95FrameTimeMs?: number;
  p99FrameTimeMs?: number;
  framesOver50Ms: number;
  firstIntendedVsyncNs?: number;
  lastFrameCompletedNs?: number;
}

const DEFAULT_FRAME_INTERVAL_NS = 16_666_666;

/**
 * Parse the stable PROFILEDATA table emitted by dumpsys gfxinfo framestats.
 * The Android summary percentiles are bucketed, so the gate uses the exact
 * intended-vsync to frame-completed durations from this table instead.
 */
export function parseAndroidGfxinfoFrames(raw: string): AndroidGfxinfoFrame[] {
  const frames: AndroidGfxinfoFrame[] = [];
  let inProfileData = false;
  let columns: string[] | undefined;
  let intendedIndex = -1;
  let completedIndex = -1;
  let intervalIndex = -1;

  for (const sourceLine of raw.split(/\r?\n/u)) {
    const line = sourceLine.trim();
    if (line === "---PROFILEDATA---") {
      inProfileData = !inProfileData;
      columns = undefined;
      continue;
    }
    if (!inProfileData) continue;

    if (line.startsWith("Flags,FrameTimelineVsyncId,")) {
      columns = line.split(",").map((column) => column.trim());
      intendedIndex = columns.indexOf("IntendedVsync");
      completedIndex = columns.indexOf("FrameCompleted");
      intervalIndex = columns.indexOf("FrameInterval");
      continue;
    }
    if (!columns || !/^[-+]?\d+(?:,\s*[-+]?\d+){3,}/u.test(line)) continue;

    const values = line.split(",").map((value) => Number(value.trim()));
    const flags = values[0];
    const intendedVsyncNs = values[intendedIndex];
    const frameCompletedNs = values[completedIndex];
    const frameIntervalNs = values[intervalIndex] || DEFAULT_FRAME_INTERVAL_NS;
    if (
      !Number.isFinite(flags) ||
      !Number.isFinite(intendedVsyncNs) ||
      !Number.isFinite(frameCompletedNs) ||
      frameCompletedNs <= 0 ||
      frameCompletedNs < intendedVsyncNs
    ) {
      continue;
    }

    frames.push({
      flags,
      intendedVsyncNs,
      frameCompletedNs,
      frameIntervalNs,
      frameTimeMs: (frameCompletedNs - intendedVsyncNs) / 1_000_000,
    });
  }

  return frames;
}

export function summarizeAndroidGfxinfo(frames: AndroidGfxinfoFrame[]): AndroidGfxinfoMetrics {
  if (!frames.length) return { frameCount: 0, framesOver50Ms: 0 };

  const durations = frames.map((frame) => frame.frameTimeMs).sort((left, right) => left - right);
  const medianFrameTimeMs = percentile(durations, 0.5);
  const p95FrameTimeMs = percentile(durations, 0.95);
  const p99FrameTimeMs = percentile(durations, 0.99);
  const meanIntervalNs = frames.reduce((sum, frame) => sum + frame.frameIntervalNs, 0) / frames.length;
  const firstIntendedVsyncNs = Math.min(...frames.map((frame) => frame.intendedVsyncNs));
  const lastIntendedVsyncNs = Math.max(...frames.map((frame) => frame.intendedVsyncNs));
  const lastFrameCompletedNs = Math.max(...frames.map((frame) => frame.frameCompletedNs));
  // Count expected display slots from intended vsyncs, not completion time:
  // a late completion must affect frame time/jank, not create a phantom slot.
  const elapsedNs = Math.max(meanIntervalNs, lastIntendedVsyncNs - firstIntendedVsyncNs + meanIntervalNs);
  const expectedFrameCount = Math.max(frames.length, Math.ceil(elapsedNs / meanIntervalNs));

  return {
    frameCount: frames.length,
    expectedFrameCount,
    deliveredFrameRatio: Math.min(1, frames.length / expectedFrameCount),
    medianFrameTimeMs,
    p95FrameTimeMs,
    p99FrameTimeMs,
    framesOver50Ms: durations.filter((duration) => duration > 50).length,
    firstIntendedVsyncNs,
    lastFrameCompletedNs,
  };
}

export function parseAndroidPssKb(raw: string): number | undefined {
  const match = raw.match(/TOTAL\s+PSS:\s*([\d,]+)/iu);
  if (!match) return undefined;
  const pss = Number(match[1]!.replace(/,/gu, ""));
  return Number.isFinite(pss) ? pss : undefined;
}

function percentile(sortedValues: number[], quantile: number): number | undefined {
  if (!sortedValues.length) return undefined;
  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * quantile) - 1);
  return sortedValues[index];
}
