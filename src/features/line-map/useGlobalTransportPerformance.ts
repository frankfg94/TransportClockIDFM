import { computed, ref } from "vue";
import {
  createTransportMapPerformanceProbe,
  type TransportMapPerformanceProbe,
  type TransportMapPerformanceReport,
} from "../transport-map/performance/transportMapPerformance";
import type { TransportMapPerformanceTrace } from "../transport-map/performance/transportMapPerformanceTrace";

export interface UseGlobalTransportPerformanceOptions {
  getMetadata: () => Record<string, unknown>;
  getCacheMetrics: () => NonNullable<TransportMapPerformanceReport["cache"]>;
  trace?: TransportMapPerformanceTrace;
}

export function useGlobalTransportPerformance(options: UseGlobalTransportPerformanceOptions) {
  const debugReport = ref<TransportMapPerformanceReport>();
  const debugProbeRunning = ref(false);
  let performanceProbe: TransportMapPerformanceProbe | undefined;
  let lastPerformanceCacheSampleAt = Number.NEGATIVE_INFINITY;

  const debugReportJson = computed(() =>
    debugReport.value ? JSON.stringify(debugReport.value, null, 2) : "",
  );

  function createDebugProbe(): TransportMapPerformanceProbe {
    return createTransportMapPerformanceProbe({
      expectedHz: 60,
      warmupMs: 1_000,
      trace: options.trace,
    });
  }

  function startDebugPerformance(): void {
    performanceProbe?.dispose();
    performanceProbe = createDebugProbe();
    options.trace?.start({ source: "global-map-performance" });
    performanceProbe.start();
    debugProbeRunning.value = true;
    debugReport.value = undefined;
  }

  function stopDebugPerformance(): TransportMapPerformanceReport | undefined {
    if (!performanceProbe) return undefined;
    const metadata = options.getMetadata();
    debugReport.value = performanceProbe.stop(metadata);
    if (options.trace?.isRunning) {
      debugReport.value.trace = options.trace.stop(metadata);
    }
    debugProbeRunning.value = false;
    return debugReport.value;
  }

  function exportDebugReport(): void {
    if (!performanceProbe) return;
    if (debugProbeRunning.value) stopDebugPerformance();
    const report = debugReport.value ?? performanceProbe.snapshot(options.getMetadata());
    if (options.trace?.isRunning) report.trace = options.trace.snapshot(options.getMetadata());
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `global-map-${Date.now()}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function hasProbe(): boolean {
    return performanceProbe !== undefined;
  }

  function recordPresentedFrame(interactive?: boolean): void {
    performanceProbe?.recordPresentedFrame(interactive);
  }

  function recordRendererMetrics(metrics: TransportMapPerformanceReport["lastRenderer"]): void {
    performanceProbe?.recordRendererMetrics(metrics);
  }

  function recordCacheMetricsIfDue(shouldSample: boolean): void {
    if (!hasProbe() && !shouldSample) return;
    const sampleAt = typeof performance === "undefined" ? Date.now() : performance.now();
    if (sampleAt - lastPerformanceCacheSampleAt < 100) return;
    lastPerformanceCacheSampleAt = sampleAt;
    performanceProbe?.recordCacheMetrics(options.getCacheMetrics());
  }

  function recordTiming(kind: "decode" | "worker" | "hitTest", durationMs: number): void {
    performanceProbe?.recordTiming(kind, durationMs);
  }

  function dispose(): void {
    performanceProbe?.dispose();
    performanceProbe = undefined;
    options.trace?.dispose();
    debugProbeRunning.value = false;
  }

  return {
    debugReport,
    debugProbeRunning,
    debugReportJson,
    startDebugPerformance,
    stopDebugPerformance,
    exportDebugReport,
    hasProbe,
    recordPresentedFrame,
    recordRendererMetrics,
    recordCacheMetricsIfDue,
    recordTiming,
    dispose,
  };
}

export type GlobalTransportPerformanceController = ReturnType<typeof useGlobalTransportPerformance>;
