import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import type { GlobalMapLine } from "../transport-map/contracts/manifest";
import type { CameraState } from "../transport-map/geo/camera";
import type { TransportMapRendererMetrics } from "../transport-map/contracts/renderer";
import type { TransportMapPerformanceTrace } from "../transport-map/performance/transportMapPerformanceTrace";
import { ChaosZoomDiagnostics } from "./chaosZoomDiagnostics";
import { summarizeChaosFrameTimes } from "./chaosZoom";

export const CHAOS_LINE_SELECTION_PROFILE = { version: 1, seed: 0x51ec710, cycles: 30 } as const;
export type SelectionChaosPhase = "select" | "animation" | "deselect";
export interface SelectionChaosFrame {
  startMs: number; endMs: number; durationMs: number;
  actionIndex: number; lineId: string; phase: SelectionChaosPhase;
}
/** Stable catalog order and seeded choices allow the same trace to be replayed. */
export function createChaosLineSelectionTrace(lines: readonly GlobalMapLine[], cycles: number = CHAOS_LINE_SELECTION_PROFILE.cycles, seed: number = CHAOS_LINE_SELECTION_PROFILE.seed): GlobalMapLine[] {
  const catalog = [...new Map(lines.filter(line => line.stationIds.length > 0).map(line => [line.id, line])).values()]
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!catalog.length) return [];
  let state = seed >>> 0;
  let previous = -1;
  return Array.from({ length: cycles }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    let index = Math.floor(state / 0x100000000 * (catalog.length - (previous >= 0 && catalog.length > 1 ? 1 : 0)));
    if (catalog.length > 1 && previous >= 0 && index >= previous) index += 1;
    previous = index;
    return catalog[index]!;
  });
}

/** RAF cadence is a scheduling proxy, not proof of GPU presentation. */
export function summarizeSelectionStutters(frames: readonly SelectionChaosFrame[], budgetMs: number) {
  const values = frames.map(frame => frame.durationMs);
  const thresholdMs = budgetMs + Math.max(2, budgetMs * 0.15);
  const stutters = frames.filter(frame => frame.durationMs > thresholdMs);
  const missed = (duration: number) => Math.max(0, Math.round(duration / budgetMs) - 1);
  let longestConsecutiveStutters = 0, consecutive = 0;
  for (const duration of values) {
    consecutive = duration > thresholdMs ? consecutive + 1 : 0;
    longestConsecutiveStutters = Math.max(longestConsecutiveStutters, consecutive);
  }
  return {
    ...summarizeChaosFrameTimes(values, values.reduce((sum, value) => sum + value, 0), 1000 / budgetMs),
    budgetMs, microStutterThresholdMs: thresholdMs,
    stutterCount: stutters.length,
    estimatedMissedVsyncs: values.reduce((sum, duration) => sum + missed(duration), 0),
    excessTimeMs: stutters.reduce((sum, frame) => sum + frame.durationMs - budgetMs, 0),
    longestConsecutiveStutters,
    worstIntervals: [...stutters].sort((a, b) => b.durationMs - a.durationMs).slice(0, 30),
  };
}

interface Options {
  isAvailable: () => boolean;
  getLines: () => readonly GlobalMapLine[];
  prepare: (assertActive: () => void) => Promise<void>;
  restore: () => Promise<void>;
  select: (line: GlobalMapLine, onAnimationComplete: () => void) => Promise<void>;
  deselect: () => void;
  cancelInteractions: () => void;
  getCamera: () => CameraState;
  getMetrics: () => TransportMapRendererMetrics | undefined;
  getMetadata: () => Record<string, unknown>;
  trace?: TransportMapPerformanceTrace;
}

export function useChaosLineSelection(options: Options) {
  const running = ref(false), progress = ref(0);
  const total = CHAOS_LINE_SELECTION_PROFILE.cycles;
  const stage = ref("preparing");
  const report = shallowRef<Record<string, unknown>>();
  const reportJson = computed(() => JSON.stringify(report.value ?? { status: running.value ? "running" : "idle", progress: progress.value, total, stage: stage.value }, null, 2));
  let abort: AbortController | undefined;
  let diagnostics: ChaosZoomDiagnostics | undefined;
  let raf: number | undefined;
  let disposed = false;
  const now = () => performance.now();

  function cancel() { abort?.abort(); options.cancelInteractions(); }
  function recordRender(durationMs: number) { diagnostics?.recordRender(durationMs); }

  async function run() {
    if (running.value || !options.isAvailable() || disposed) return;
    running.value = true; stage.value = "preparing"; progress.value = 0; report.value = undefined;
    const controller = new AbortController(); abort = controller;
    const frames: SelectionChaosFrame[] = [];
    const actions: Array<Record<string, unknown>> = [];
    const calibration: number[] = [];
    let status = "completed", error: string | undefined;
    let phase: SelectionChaosPhase = "select", actionIndex = -1, lineId = "";
    let startedAtMs = 0, finishedAtMs = 0, budgetMs = 1000 / 60;
    let previousFrame: number | undefined, ownsTrace = false, prepared = false;
    let configurationStart: Record<string, unknown> = {};
    let traceReport: ReturnType<TransportMapPerformanceTrace["stop"]> | undefined;
    let diagnosticReport: ReturnType<ChaosZoomDiagnostics["stop"]> | undefined;
    const calibrationVisibility = document.visibilityState;
    const check = () => { if (controller.signal.aborted || disposed) throw new Error("cancelled"); };
    // Each wait removes its timeout and abort listener on every exit path.
    function wait<T>(start: (resolve: (value: T) => void, reject: (reason: unknown) => void) => void, timeoutMs = 15000): Promise<T> {
      check();
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (success: boolean, value: unknown) => {
          if (settled) return; settled = true;
          clearTimeout(timer); controller.signal.removeEventListener("abort", cancelled);
          if (success) resolve(value as T); else reject(value);
        };
        const cancelled = () => finish(false, new Error("cancelled"));
        const timer = setTimeout(() => finish(false, new Error("animation-timeout")), timeoutMs);
        controller.signal.addEventListener("abort", cancelled, { once: true });
        try { start(value => finish(true, value), reason => finish(false, reason)); } catch (reason) { finish(false, reason); }
      });
    }
    let waitFrame: (() => void) | undefined;
    const nextFrame = () => wait<void>(resolve => { waitFrame = resolve; });
    const sample = (timestamp: number) => {
      if (previousFrame !== undefined) {
        const durationMs = timestamp - previousFrame;
        if (!startedAtMs) calibration.push(durationMs);
        else {
          frames.push({ startMs: previousFrame - startedAtMs, endMs: timestamp - startedAtMs, durationMs, actionIndex, lineId, phase });
          diagnostics?.recordFrame(durationMs, timestamp, { phase, actionIndex, camera: options.getCamera(), scrolling: false, metrics: options.getMetrics() });
          options.trace?.recordFrame(durationMs, timestamp, { camera: { ...options.getCamera() }, metadata: { phase, actionIndex, lineId, scenario: "chaos-line-selection" } });
        }
      }
      previousFrame = timestamp;
      const resolve = waitFrame; waitFrame = undefined; resolve?.();
      raf = requestAnimationFrame(sample);
    };
    try {
      await wait<void>((resolve, reject) => { void options.prepare(check).then(resolve, reject); }, 30000);
      prepared = true;
      check();
      const sequence = createChaosLineSelectionTrace(options.getLines());
      if (!sequence.length) throw new Error("no-selectable-lines");
      stage.value = "calibrating";
      raf = requestAnimationFrame(sample);
      for (let index = 0; index < 60; index++) await nextFrame();
      const sorted = [...calibration].sort((a, b) => a - b);
      // A lower quantile avoids treating occasional idle work as the display period.
      budgetMs = sorted[Math.floor(sorted.length * 0.2)] ?? budgetMs;
      stage.value = "running";
      configurationStart = options.getMetadata();
      startedAtMs = now(); previousFrame = startedAtMs;
      diagnostics = new ChaosZoomDiagnostics(startedAtMs, now);
      if (options.trace && !options.trace.isRunning) { options.trace.start({ scenario: "chaos-line-selection", ...configurationStart }); ownsTrace = true; }
      for (const [index, line] of sequence.entries()) {
        check(); actionIndex = index; lineId = line.id; progress.value = index + 1; phase = "select";
        const start = now();
        const action: Record<string, unknown> = { index, lineId: line.id, code: line.code, mode: line.mode,
          startMs: start - startedAtMs, frameStartIndex: frames.length, status: "interrupted" };
        actions.push(action);
        let selectionReturnedAtMs = start, animationCompleteAtMs = start;
        let deselectStartedAtMs = start, deselectReturnedAtMs = start;
        await wait<void>((resolve, reject) => {
          const selectionPromise = options.select(line, () => {
            try {
              check(); animationCompleteAtMs = now(); phase = "deselect";
              deselectStartedAtMs = now();
              // Clear within the completion callback, before queued Vue microtasks can delay it.
              options.deselect(); deselectReturnedAtMs = now();
              Object.assign(action, { animationCompleteAtMs: animationCompleteAtMs - startedAtMs,
                deselectStartedAtMs: deselectStartedAtMs - startedAtMs,
                deselectionDelayMs: deselectStartedAtMs - animationCompleteAtMs,
                deselectionCallMs: deselectReturnedAtMs - deselectStartedAtMs });
              resolve();
            } catch (reason) { reject(reason); }
          });
          selectionReturnedAtMs = now();
          if (phase !== "deselect") phase = "animation";
          action.selectionReturnedAtMs = selectionReturnedAtMs - startedAtMs;
          action.selectionCallMs = selectionReturnedAtMs - start;
          void selectionPromise.catch(reject);
        });
        check();
        // One frame lets Vue/rendering commit the cleared scene. No idle pause or data-settle delay.
        await nextFrame(); check();
        Object.assign(action, { status: "completed", selectionReturnedAtMs: selectionReturnedAtMs - startedAtMs,
          animationCompleteAtMs: animationCompleteAtMs - startedAtMs,
          deselectStartedAtMs: deselectStartedAtMs - startedAtMs,
          deselectionDelayMs: deselectStartedAtMs - animationCompleteAtMs,
          selectionCallMs: selectionReturnedAtMs - start, deselectionCallMs: deselectReturnedAtMs - deselectStartedAtMs,
          endMs: now() - startedAtMs,
          frameEndIndex: frames.length });
      }
    } catch (reason) {
      status = controller.signal.aborted || disposed ? "cancelled" : "failed";
      error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      finishedAtMs = now();
      if (raf !== undefined) cancelAnimationFrame(raf); raf = undefined;
      waitFrame = undefined;
      if (ownsTrace) traceReport = options.trace?.stop({ scenario: "chaos-line-selection", status });
      diagnosticReport = diagnostics?.stop(configurationStart, options.getMetadata(), traceReport); diagnostics = undefined;
      options.cancelInteractions();
      stage.value = "restoring";
      try { if (!disposed) { if (prepared) options.deselect(); await options.restore(); } }
      catch (reason) { status = "failed"; error = `restore: ${String(reason)}`; }
      const calibrationSorted = [...calibration].sort((a, b) => a - b);
      const calibrationSpread = (calibrationSorted[Math.floor(calibration.length * 0.9)] ?? budgetMs) / budgetMs;
      // A slow or highly variable baseline cannot distinguish missed display frames from RAF throttling.
      const cadenceReliable = calibration.length >= 30 && budgetMs < 50 && calibrationSpread < 1.5;
      report.value = { schemaVersion: 1, scenario: "chaos-line-selection", status, error,
        profile: CHAOS_LINE_SELECTION_PROFILE, completedOperationCount: actions.filter(action => action.status === "completed").length, operationCount: total,
        durationMs: startedAtMs ? finishedAtMs - startedAtMs : 0,
        calibration: { visibility: calibrationVisibility, frameTimesMs: calibration, frameBudgetMs: budgetMs, method: "p20-idle-raf-60-frames",
          spreadP90P20: calibrationSpread, cadenceReliable },
        measurement: { clock: "performance.now/requestAnimationFrame", units: "milliseconds",
          attribution: "phase-at-interval-end; intervals-can-overlap-phase-boundaries; use-action-timestamps",
          limitation: "RAF scheduling proxy; GPU presentation and sub-frame stalls are not directly measured", rawPrecision: true,
          foregroundComparable: cadenceReliable && calibrationVisibility !== "hidden" && diagnosticReport?.measurement.foregroundComparable === true,
          cadenceReliable, estimatesRequireReliableCadence: true },
        frameMetrics: summarizeSelectionStutters(frames, budgetMs), frames,
        byPhase: Object.fromEntries((["select", "animation", "deselect"] as const).map(value =>
          [value, summarizeSelectionStutters(frames.filter(frame => frame.phase === value), budgetMs)])),
        // Analyze only after stopping clocks: percentile sorting must not create measured stutters.
        actions: actions.map(({ frameStartIndex, frameEndIndex, ...action }) => ({ ...action,
          frames: summarizeSelectionStutters(frames.slice(Number(frameStartIndex), frameEndIndex === undefined ? frames.length : Number(frameEndIndex)), budgetMs) })),
        diagnostics: diagnosticReport, trace: traceReport };
      abort = undefined; running.value = false;
    }
  }
  function download() {
    if (!report.value) return;
    const url = URL.createObjectURL(new Blob([reportJson.value], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url;
    anchor.download = `chaos-line-selection-${Date.now()}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  onBeforeUnmount(() => { disposed = true; cancel(); });
  return { running, progress, total, report, reportJson, run, cancel, download, recordRender };
}
