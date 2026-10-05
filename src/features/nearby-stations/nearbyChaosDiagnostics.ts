import { watch } from "vue";
import type { NearbyChaosMapContext, NearbyChaosZoomActionResult } from "./nearbyChaosZoom";

interface ScriptTiming extends PerformanceEntry {
  executionStart: number;
  forcedStyleAndLayoutDuration: number;
  pauseDuration: number;
  sourceURL: string;
  sourceFunctionName: string;
  sourceCharPosition: number;
  invoker: string;
  invokerType: string;
}

interface LongFrameTiming extends PerformanceEntry {
  blockingDuration: number;
  renderStart: number;
  styleAndLayoutStart: number;
  scripts: readonly ScriptTiming[];
}

export interface NearbyChaosLongFrame {
  startOffsetMs: number;
  durationMs: number;
  blockingDurationMs: number;
  workDurationMs: number;
  renderDurationMs: number;
  styleAndLayoutDurationMs: number;
  overlappingActionIndices: number[];
  scripts: {
    startOffsetMs: number;
    durationMs: number;
    forcedStyleAndLayoutDurationMs: number;
    pauseDurationMs: number;
    sourcePath: string | null;
    sourceFunctionName: string;
    sourceCharPosition: number;
    invoker: string;
    invokerType: string;
  }[];
}

/** Source paths only: neither the page URL nor resource query strings leave the browser. */
export function nearbyChaosScriptPath(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, "https://diagnostics.invalid");
    return url.protocol === "http:" || url.protocol === "https:" ? url.pathname : null;
  } catch {
    return null;
  }
}

const round = (value: number) => Math.round(value * 100) / 100;
const LIMIT = 200;

/** Everything, including the Vue watcher, is created on Run and disposed before export. */
export function startNearbyChaosDiagnostics(
  startedAtMs: number,
  getContext: () => NearbyChaosMapContext,
) {
  const longAnimationFrames: NearbyChaosLongFrame[] = [];
  const contextTimeline: (NearbyChaosMapContext & { offsetMs: number })[] = [];
  let droppedLongAnimationFrames = 0;
  let droppedContextSamples = 0;
  let observer: PerformanceObserver | undefined;
  let supported = false;
  let callbackTotalMs = 0;
  let callbackMaxMs = 0;
  const timeCallback = (start: number) => {
    const duration = performance.now() - start;
    callbackTotalMs += duration;
    callbackMaxMs = Math.max(callbackMaxMs, duration);
  };

  function record(entries: readonly PerformanceEntry[]) {
    const callbackStart = performance.now();
    for (const raw of entries) {
      if (raw.startTime < startedAtMs) continue;
      if (longAnimationFrames.length >= LIMIT) {
        droppedLongAnimationFrames += 1;
        continue;
      }
      const entry = raw as LongFrameTiming;
      const end = entry.startTime + entry.duration;
      longAnimationFrames.push({
        startOffsetMs: round(entry.startTime - startedAtMs),
        durationMs: round(entry.duration),
        blockingDurationMs: round(entry.blockingDuration),
        workDurationMs: round(
          entry.renderStart ? entry.renderStart - entry.startTime : entry.duration,
        ),
        renderDurationMs: round(entry.renderStart ? end - entry.renderStart : 0),
        styleAndLayoutDurationMs: round(
          entry.styleAndLayoutStart ? end - entry.styleAndLayoutStart : 0,
        ),
        overlappingActionIndices: [],
        scripts: entry.scripts.map((script) => ({
          startOffsetMs: round(script.startTime - startedAtMs),
          durationMs: round(script.duration),
          forcedStyleAndLayoutDurationMs: round(script.forcedStyleAndLayoutDuration),
          pauseDurationMs: round(script.pauseDuration),
          sourcePath: nearbyChaosScriptPath(script.sourceURL),
          sourceFunctionName: script.sourceFunctionName,
          sourceCharPosition: script.sourceCharPosition,
          invoker: script.invoker,
          invokerType: script.invokerType,
        })),
      });
    }
    timeCallback(callbackStart);
  }

  try {
    if (
      typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame")
    ) {
      observer = new PerformanceObserver((list) => record(list.getEntries()));
      observer.observe({ type: "long-animation-frame", buffered: false });
      supported = true;
    }
  } catch {
    observer?.disconnect();
    observer = undefined;
  }

  // Read only counts and loading state; never traverse the DOM or sample the camera here.
  const stopWatch = watch(
    () => {
      const context = getContext();
      return JSON.stringify(context);
    },
    (serialized) => {
      const callbackStart = performance.now();
      if (contextTimeline.length < LIMIT) {
        contextTimeline.push({
          ...(JSON.parse(serialized) as NearbyChaosMapContext),
          offsetMs: round(callbackStart - startedAtMs),
        });
      } else {
        droppedContextSamples += 1;
      }
      timeCallback(callbackStart);
    },
    { immediate: true, flush: "post" },
  );

  return {
    stop(
      operations: readonly NearbyChaosZoomActionResult[],
      recoveryStartedOffsetMs: number,
      recoveryActionIndex: number,
    ) {
      stopWatch();
      if (observer) {
        record(observer.takeRecords());
        observer.disconnect();
      }
      for (const frame of longAnimationFrames) {
        const end = frame.startOffsetMs + frame.durationMs;
        frame.overlappingActionIndices = operations
          .filter((op) => frame.startOffsetMs < op.completedOffsetMs && end > op.startedOffsetMs)
          .map((op) => op.index);
        if (end > recoveryStartedOffsetMs) frame.overlappingActionIndices.push(recoveryActionIndex);
      }

      const scriptTotals = new Map<
        string,
        {
          sourcePath: string | null;
          sourceFunctionName: string;
          invokerType: string;
          occurrences: number;
          totalDurationMs: number;
          maxDurationMs: number;
          forcedStyleAndLayoutDurationMs: number;
        }
      >();
      for (const frame of longAnimationFrames)
        for (const script of frame.scripts) {
          const key = JSON.stringify([
            script.sourcePath,
            script.sourceFunctionName,
            script.invokerType,
          ]);
          const total = scriptTotals.get(key) ?? {
            sourcePath: script.sourcePath,
            sourceFunctionName: script.sourceFunctionName,
            invokerType: script.invokerType,
            occurrences: 0,
            totalDurationMs: 0,
            maxDurationMs: 0,
            forcedStyleAndLayoutDurationMs: 0,
          };
          total.occurrences += 1;
          total.totalDurationMs = round(total.totalDurationMs + script.durationMs);
          total.maxDurationMs = Math.max(total.maxDurationMs, script.durationMs);
          total.forcedStyleAndLayoutDurationMs = round(
            total.forcedStyleAndLayoutDurationMs + script.forcedStyleAndLayoutDurationMs,
          );
          scriptTotals.set(key, total);
        }

      return {
        longAnimationFrameObserver: supported,
        longAnimationFrames,
        longAnimationFrameSummary: {
          count: longAnimationFrames.length,
          totalBlockingDurationMs: round(
            longAnimationFrames.reduce((n, frame) => n + frame.blockingDurationMs, 0),
          ),
          totalRenderDurationMs: round(
            longAnimationFrames.reduce((n, frame) => n + frame.renderDurationMs, 0),
          ),
          totalStyleAndLayoutDurationMs: round(
            longAnimationFrames.reduce((n, frame) => n + frame.styleAndLayoutDurationMs, 0),
          ),
          scriptsByTotalDuration: [...scriptTotals.values()].sort(
            (a, b) => b.totalDurationMs - a.totalDurationMs,
          ),
        },
        contextTimeline,
        limits: {
          longAnimationFrames: LIMIT,
          contextTimeline: LIMIT,
          droppedLongAnimationFrames,
          droppedContextSamples,
        },
        observerCallbacks: {
          totalDurationMs: round(callbackTotalMs),
          maxDurationMs: round(callbackMaxMs),
        },
        caveats: [
          "Script attribution identifies entry points and includes their microtasks, not a complete CPU call stack.",
          "Style/layout duration extends to frame end and includes subsequent rendering work; it is not pure layout CPU time.",
          "Only scripts over the browser attribution threshold are reported; workers and isolated extensions are not attributed.",
          "Context changes use Vue post-flush snapshots; several synchronous mutations may be coalesced.",
          "Aggregates describe retained entries; inspect dropped counts before comparing runs.",
          "Observer callback timings exclude Vue dependency collection, browser instrumentation, RAF and export costs.",
          "Chaos driver timer entry points include gesture handlers and subsequent Vue microtasks; their script duration is not probe overhead.",
        ],
      };
    },
  };
}

export type NearbyChaosDiagnosticsReport = ReturnType<
  ReturnType<typeof startNearbyChaosDiagnostics>["stop"]
>;
