import type { CameraState } from "../transport-map/geo/camera";
import type { TransportMapRendererMetrics } from "../transport-map/contracts/renderer";
import type { TransportMapTraceReport } from "../transport-map/performance/transportMapPerformanceTrace";
import { TimingDistribution } from "../transport-map/performance/timingDistribution";

interface FrameContext {
  phase: string;
  actionIndex: number;
  camera: CameraState;
  scrolling: boolean;
  metrics?: TransportMapRendererMetrics;
}

interface Group {
  frames: TimingDistribution;
  scrollingFrames: number;
  maxPaths: number;
  maxStations: number;
  maxVertices: number;
}

/** Bounded summaries, collected only during Chaos; no console monkey patching. */
export class ChaosZoomDiagnostics {
  private readonly groups = new Map<string, Group>();
  private readonly renderer = new TimingDistribution();
  private readonly worstFrames: Array<{
    offsetMs: number; durationMs: number; phase: string; actionIndex: number;
    zoom: number; scrolling: boolean; paths?: number; stations?: number; vertices?: number;
  }> = [];
  private readonly deckSamples: Array<{
    offsetMs: number; phase: string; actionIndex: number; zoom: number;
    cpuTimePerFrameMs: number; gpuTimePerFrameMs: number; windowFrames: number;
    updateAttributesMs: number; updateAttributesCount: number; layers: number;
    gpuMemoryBytes: number; textureMemoryBytes: number;
  }> = [];
  private deckSampleCount = 0;
  private totalFrames = 0;
  private oneSecondFrames = 0;
  private previousDeckSample?: number;
  private hiddenSince?: number;
  private hiddenMs = 0;
  private visibilityChanges = 0;
  private stoppedAtMs?: number;
  private readonly visibilityStart = typeof document === "undefined" ? "unavailable" : document.visibilityState;
  private readonly focusedAtStart = typeof document === "undefined" ? undefined : document.hasFocus();
  private readonly onVisibilityChange = () => {
    const timestamp = this.now();
    if (this.hiddenSince !== undefined) this.hiddenMs += Math.max(0, timestamp - this.hiddenSince);
    this.hiddenSince = document.visibilityState === "hidden" ? timestamp : undefined;
    this.visibilityChanges += 1;
  };

  constructor(private readonly startedAtMs: number, private readonly now: () => number) {
    if (typeof document !== "undefined") {
      if (document.visibilityState === "hidden") this.hiddenSince = startedAtMs;
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    }
  }

  recordFrame(durationMs: number, timestampMs: number, context: FrameContext): void {
    if (this.stoppedAtMs !== undefined) return;
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    this.totalFrames += 1;
    if (durationMs >= 950 && durationMs <= 1_100) this.oneSecondFrames += 1;
    const zoomBucket = Math.floor(context.camera.zoom);
    for (const key of [`phase:${context.phase}`, `action:${context.actionIndex}:${context.phase}`, `zoom:${zoomBucket}`]) {
      let group = this.groups.get(key);
      if (!group) {
        group = { frames: new TimingDistribution(), scrollingFrames: 0, maxPaths: 0, maxStations: 0, maxVertices: 0 };
        this.groups.set(key, group);
      }
      group.frames.add(durationMs);
      if (context.scrolling) group.scrollingFrames += 1;
      group.maxPaths = Math.max(group.maxPaths, context.metrics?.visiblePathCount ?? 0);
      group.maxStations = Math.max(group.maxStations, context.metrics?.visibleStationCount ?? 0);
      group.maxVertices = Math.max(group.maxVertices, context.metrics?.visibleVertexCount ?? 0);
    }
    if (durationMs > 33) {
      this.worstFrames.push({
        offsetMs: round(timestampMs - this.startedAtMs), durationMs: round(durationMs),
        phase: context.phase, actionIndex: context.actionIndex, zoom: round(context.camera.zoom), scrolling: context.scrolling,
        paths: context.metrics?.visiblePathCount, stations: context.metrics?.visibleStationCount,
        vertices: context.metrics?.visibleVertexCount,
      });
      this.worstFrames.sort((a, b) => b.durationMs - a.durationMs);
      this.worstFrames.length = Math.min(20, this.worstFrames.length);
    }
    const deck = context.metrics?.deck;
    if (deck && Number.isFinite(deck.sampledAtMs) && deck.sampledAtMs >= this.startedAtMs
      && deck.sampledAtMs !== this.previousDeckSample) {
      this.previousDeckSample = deck.sampledAtMs;
      this.deckSampleCount += 1;
      this.deckSamples.push({
        offsetMs: round(deck.sampledAtMs - this.startedAtMs), phase: context.phase,
        actionIndex: context.actionIndex, zoom: round(context.camera.zoom),
        cpuTimePerFrameMs: round(deck.cpuTimePerFrame), gpuTimePerFrameMs: round(deck.gpuTimePerFrame),
        windowFrames: deck.windowFrames, updateAttributesMs: round(deck.updateAttributesTime),
        updateAttributesCount: deck.updateAttributesCount, layers: deck.layersCount,
        gpuMemoryBytes: deck.gpuMemory, textureMemoryBytes: deck.textureMemory,
      });
      if (this.deckSamples.length > 120) this.deckSamples.shift();
    }
  }

  recordRender(durationMs: number): void {
    if (this.stoppedAtMs === undefined) this.renderer.add(durationMs);
  }

  finish(): void {
    if (this.stoppedAtMs !== undefined) return;
    this.stoppedAtMs = this.now();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  stop(configurationStart: Record<string, unknown>, configurationEnd: Record<string, unknown>, trace?: TransportMapTraceReport) {
    this.finish();
    const hiddenDurationMs = this.hiddenMs + (this.hiddenSince === undefined ? 0 : Math.max(0, this.stoppedAtMs! - this.hiddenSince));
    const possibleRafThrottling = hiddenDurationMs > 0 || (this.totalFrames >= 10 && this.oneSecondFrames / this.totalFrames > 0.8);
    return {
      schemaVersion: 1 as const,
      environment: {
        userAgent: typeof navigator === "undefined" ? undefined : navigator.userAgent,
        hardwareConcurrency: typeof navigator === "undefined" ? undefined : navigator.hardwareConcurrency,
        deviceMemoryGiB: typeof navigator === "undefined" ? undefined : (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
        visibilityStart: this.visibilityStart, focusedAtStart: this.focusedAtStart,
      },
      measurement: {
        hiddenDurationMs: round(hiddenDurationMs), visibilityChanges: this.visibilityChanges,
        foregroundComparable: this.visibilityStart !== "hidden" && !possibleRafThrottling,
        possibleRafThrottling,
        nearOneSecondFrames: this.oneSecondFrames,
        frameClock: "requestAnimationFrame" as const,
        rendererSampling: "actual-render-calls" as const,
        legacyRenderTimesSampling: "new-render-sequence-at-raf" as const,
        deckSampling: "rolling-windows-do-not-sum-or-attribute-to-one-frame" as const,
        eventTiming: "inclusive-overlapping-spans-do-not-sum" as const,
      },
      configurationStart, configurationEnd,
      byPhase: this.summarize("phase:"), byAction: this.summarize("action:"), byZoom: this.summarize("zoom:"),
      renderer: this.renderer.snapshot(),
      deck: { sampleCount: this.deckSampleCount, retainedSamples: this.deckSamples.length,
        gpuTimerObserved: this.deckSamples.some((sample) => sample.gpuTimePerFrameMs > 0), samples: [...this.deckSamples] },
      worstFrames: [...this.worstFrames],
      bottlenecks: Object.entries(trace?.eventAggregates ?? {}).map(([operation, metrics]) => ({ operation, ...metrics }))
        .sort((a, b) => b.maxMs - a.maxMs).slice(0, 20),
      errors: {
        deck: trace?.eventAggregates?.deck_error?.count ?? 0,
        maplibre: trace?.eventAggregates?.maplibre_error?.count ?? 0,
        traceDroppedEvents: trace?.droppedEventCount ?? 0,
      },
    };
  }

  private summarize(prefix: string) {
    return Object.fromEntries([...this.groups].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), {
      ...value.frames.snapshot(), scrollingFrames: value.scrollingFrames,
      maxPaths: value.maxPaths, maxStations: value.maxStations, maxVertices: value.maxVertices,
    }]));
  }
}

export type ChaosZoomDiagnosticReport = ReturnType<ChaosZoomDiagnostics["stop"]>;
function round(value: number): number { return Number(value.toFixed(3)); }
