import type {
  TransportMapPerformanceTrace,
  TransportMapPerformanceTraceProbe,
  TransportMapTraceMapLibreSample,
} from "./transportMapPerformanceTrace";

/** The public MapLibre surface needed by the diagnostic probe. */
export interface TransportMapMapLibreTraceMap {
  on(type: string, listener: (event: any) => void): void;
  off(type: string, listener: (event: any) => void): void;
  isStyleLoaded(): boolean;
  areTilesLoaded(): boolean;
  isMoving(): boolean;
  getZoom(): number;
  getCenter(): { lng: number; lat: number };
}

export interface TransportMapMapLibreTraceProbeOptions {
  sampleIntervalMs?: number;
}

/**
 * Samples MapLibre's public readiness/state APIs and turns structural loading
 * transitions into trace spans. Render callbacks remain a counter: recording
 * one event per MapLibre frame would obscure the actual causal spans.
 */
export class TransportMapMapLibreTraceProbe implements TransportMapPerformanceTraceProbe {
  private readonly sampleIntervalMs: number;
  private readonly sourceSpans = new Map<string, string | undefined>();
  private readonly samplesRing: Array<TransportMapTraceMapLibreSample | undefined> = new Array(10_000);
  private samplesWriteIndex = 0;
  private samplesCount = 0;
  private lastSampleAtMs?: number;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private errorCount = 0;
  private idleCount = 0;
  private idleObservedSinceSample = false;
  private renderCount = 0;

  constructor(
    private readonly map: TransportMapMapLibreTraceMap,
    private readonly trace: TransportMapPerformanceTrace,
    options: TransportMapMapLibreTraceProbeOptions = {},
  ) {
    this.sampleIntervalMs = Math.max(50, options.sampleIntervalMs ?? 250);
  }

  start(): void {
    if (this.running || !this.trace.isRunning) return;
    this.samplesRing.fill(undefined);
    this.samplesWriteIndex = 0;
    this.samplesCount = 0;
    this.lastSampleAtMs = undefined;
    this.errorCount = 0;
    this.idleCount = 0;
    this.idleObservedSinceSample = false;
    this.renderCount = 0;
    this.running = true;
    this.map.on("render", this.onRender);
    this.map.on("idle", this.onIdle);
    this.map.on("sourcedataloading", this.onSourceDataLoading);
    this.map.on("sourcedata", this.onSourceData);
    this.map.on("styledata", this.onStyleData);
    this.map.on("load", this.onLoad);
    this.map.on("error", this.onError);
    this.map.on("movestart", this.onMoveStateChanged);
    this.map.on("moveend", this.onMoveStateChanged);
    this.sampleNow(true);
    this.timer = setInterval(() => this.sampleNow(), this.sampleIntervalMs);
  }

  stop(): void {
    if (!this.running) return;
    this.sampleNow(true);
    this.running = false;
    this.map.off("render", this.onRender);
    this.map.off("idle", this.onIdle);
    this.map.off("sourcedataloading", this.onSourceDataLoading);
    this.map.off("sourcedata", this.onSourceData);
    this.map.off("styledata", this.onStyleData);
    this.map.off("load", this.onLoad);
    this.map.off("error", this.onError);
    this.map.off("movestart", this.onMoveStateChanged);
    this.map.off("moveend", this.onMoveStateChanged);
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    for (const [sourceId, spanId] of this.sourceSpans) {
      this.trace.end(spanId, { sourceId, probeStopped: true });
    }
    this.sourceSpans.clear();
    this.publishSummary();
  }

  dispose(): void {
    this.stop();
    this.samplesRing.fill(undefined);
    this.samplesWriteIndex = 0;
    this.samplesCount = 0;
    this.lastSampleAtMs = undefined;
  }

  private readonly onRender = (): void => {
    if (!this.running || !this.trace.isRunning) return;
    this.renderCount += 1;
    this.trace.recordRendererFrame();
    this.trace.recordCounter("maplibreRenderCount");
    if (this.renderCount === 1) {
      this.trace.instant("maplibre_render", { renderCount: this.renderCount });
    }
  };

  private readonly onIdle = (): void => {
    if (!this.running || !this.trace.isRunning) return;
    this.idleCount += 1;
    this.idleObservedSinceSample = true;
    this.trace.recordCounter("maplibreIdleCount");
    this.trace.instant("maplibre_idle", { idleCount: this.idleCount });
    this.sampleNow(true);
  };

  private readonly onSourceDataLoading = (event: any): void => {
    if (!this.running || !this.trace.isRunning) return;
    const sourceId = sourceIdFromEvent(event);
    if (this.sourceSpans.has(sourceId)) return;
    const spanId = this.trace.begin("maplibre_source_loading", {
      sourceId,
      sourceDataType: event?.sourceDataType,
    });
    this.sourceSpans.set(sourceId, spanId);
    this.sampleNow();
  };

  private readonly onSourceData = (event: any): void => {
    if (!this.running || !this.trace.isRunning) return;
    const sourceId = sourceIdFromEvent(event);
    const spanId = this.sourceSpans.get(sourceId);
    if (spanId !== undefined || this.sourceSpans.has(sourceId)) {
      this.trace.end(spanId, {
        sourceId,
        sourceDataType: event?.sourceDataType,
        isSourceLoaded: event?.isSourceLoaded,
      });
      this.sourceSpans.delete(sourceId);
    }
    this.trace.instant("maplibre_source_loaded", {
      sourceId,
      sourceDataType: event?.sourceDataType,
      isSourceLoaded: event?.isSourceLoaded,
    });
    this.sampleNow();
  };

  private readonly onStyleData = (): void => {
    if (!this.running || !this.trace.isRunning) return;
    this.trace.instant("maplibre_source_loaded", { sourceDataType: "style" });
    this.sampleNow(true);
  };

  private readonly onLoad = (): void => {
    if (!this.running || !this.trace.isRunning) return;
    this.trace.instant("maplibre_source_loaded", { sourceDataType: "style", event: "load" });
    this.sampleNow(true);
  };

  private readonly onError = (event: any): void => {
    if (!this.running || !this.trace.isRunning) return;
    this.errorCount += 1;
    this.trace.recordCounter("maplibreErrorCount");
    this.trace.instant("maplibre_error", {
      sourceId: sourceIdFromEvent(event),
      message: typeof event?.error?.message === "string" ? event.error.message.slice(0, 160) : undefined,
    });
    this.sampleNow(true);
  };

  private readonly onMoveStateChanged = (): void => {
    if (!this.running || !this.trace.isRunning) return;
    this.sampleNow();
  };

  private sampleNow(force = false): void {
    if (!this.running || !this.trace.isRunning) return;
    const timestampMs = nowMs();
    if (!force && this.lastSampleAtMs !== undefined && timestampMs - this.lastSampleAtMs < this.sampleIntervalMs) return;
    const sample = {
      timestampMs,
      zoom: safeNumber(() => this.map.getZoom()),
      center: safeCenter(() => this.map.getCenter()),
      moving: safeBoolean(() => this.map.isMoving()),
      styleLoaded: safeBoolean(() => this.map.isStyleLoaded()),
      tilesLoaded: safeBoolean(() => this.map.areTilesLoaded()),
      sourceLoadingCount: this.sourceSpans.size,
      errorCount: this.errorCount,
      idleObserved: this.idleObservedSinceSample,
    };
    this.idleObservedSinceSample = false;
    this.samplesRing[this.samplesWriteIndex] = sample;
    this.samplesWriteIndex = (this.samplesWriteIndex + 1) % this.samplesRing.length;
    this.samplesCount = Math.min(this.samplesCount + 1, this.samplesRing.length);
    this.lastSampleAtMs = timestampMs;
    this.trace.recordMapLibreSample(sample);
  }

  private publishSummary(): void {
    const allSamples = this.readSamples().map((sample) => ({
      ...sample,
      center: sample.center ? { ...sample.center } : undefined,
    }));
    const readySampleCount = allSamples.filter((sample) => sample.styleLoaded && sample.tilesLoaded).length;
    this.trace.setMapLibreSummary({
      sampleIntervalMs: this.sampleIntervalMs,
      sampleCount: allSamples.length,
      samples: allSamples,
      renderCount: this.renderCount,
      idleCount: this.idleCount,
      errorCount: this.errorCount,
      movingSampleCount: allSamples.filter((sample) => sample.moving).length,
      styleNotLoadedSampleCount: allSamples.filter((sample) => !sample.styleLoaded).length,
      tilesNotLoadedSampleCount: allSamples.filter((sample) => !sample.tilesLoaded).length,
      sourceLoadingSampleCount: allSamples.filter((sample) => sample.sourceLoadingCount > 0).length,
      readySampleCount,
      readinessFailureSampleCount: allSamples.length - readySampleCount,
      readySampleRatio: allSamples.length > 0 ? readySampleCount / allSamples.length : 1,
      minimumCoverage: allSamples.every((sample) => sample.styleLoaded && sample.tilesLoaded) ? 1 : 0,
    });
  }

  private readSamples(): TransportMapTraceMapLibreSample[] {
    const result: TransportMapTraceMapLibreSample[] = [];
    const start = this.samplesCount < this.samplesRing.length ? 0 : this.samplesWriteIndex;
    for (let index = 0; index < this.samplesCount; index += 1) {
      const sample = this.samplesRing[(start + index) % this.samplesRing.length];
      if (sample) result.push(sample);
    }
    return result;
  }
}

function sourceIdFromEvent(event: any): string {
  return typeof event?.sourceId === "string" && event.sourceId.length > 0
    ? event.sourceId
    : "<unknown>";
}

function safeNumber(read: () => number): number | undefined {
  try {
    const value = read();
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function safeBoolean(read: () => boolean): boolean {
  try {
    return read() === true;
  } catch {
    return false;
  }
}

function safeCenter(read: () => { lng: number; lat: number }): { lon: number; lat: number } | undefined {
  try {
    const center = read();
    return Number.isFinite(center.lng) && Number.isFinite(center.lat)
      ? { lon: center.lng, lat: center.lat }
      : undefined;
  } catch {
    return undefined;
  }
}

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
