/**
 * A small, optional causal trace for the transport-map performance probes.
 *
 * This deliberately is not the application's event bus.  It is a bounded
 * diagnostic recorder: when it is stopped, it explains which instrumented
 * operations overlapped each slow frame without changing the rendering or
 * loading sequence being measured.
 */

export const TRANSPORT_MAP_TRACE_THRESHOLDS = {
  slowFrameMs: 33,
  spikeFrameMs: 50,
  severeSpikeMs: 100,
  catastrophicMs: 500,
} as const;

export type TransportMapTraceEventType =
  | "camera_update"
  | "viewport_refresh"
  | "viewport_generation_change"
  | "publish_network"
  | "publish_viewport"
  | "after_viewport_publish"
  | "network_triggered"
  | "render_scene_resolve"
  | "renderer_render_call"
  | "lod_change"
  | "lod_materialize"
  | "regional_to_detailed"
  | "detailed_to_regional"
  | "chunk_request_batch"
  | "chunk_fetch"
  | "chunk_response_body"
  | "chunk_json_parse"
  | "chunk_decode"
  | "chunk_materialize"
  | "chunk_cache_hit"
  | "chunk_cache_miss"
  | "worker_job"
  | "worker_post_message"
  | "worker_decode"
  | "worker_filter"
  | "filter_paths_local"
  | "worker_binary_compile"
  | "scene_rebuild"
  | "scene_publish"
  | "render_paths_compute"
  | "render_stations_compute"
  | "active_station_lines_compute"
  | "line_metadata_paths_compute"
  | "ghost_line_paths_compute"
  | "hit_test_stations_compute"
  | "hit_test_station_ids_prepare"
  | "hit_test_candidates_compute"
  | "live_render_scene_build"
  | "path_spatial_index_build"
  | "station_spatial_index_build"
  | "render_model_build"
  | "binary_compile"
  | "binary_cache_key_build"
  | "binary_cache_hit"
  | "binary_cache_miss"
  | "binary_cache_evict"
  | "binary_packet_ready"
  | "binary_packet_promote"
  | "deck_set_props"
  | "deck_data_changed"
  | "deck_layer_rebuild"
  | "deck_update_attributes"
  | "maplibre_render"
  | "maplibre_source_loading"
  | "maplibre_source_loaded"
  | "maplibre_idle"
  | "maplibre_error"
  | "traffic_refresh"
  | "station_visibility_rebuild"
  | "viewport_result_apply"
  | "route_switch"
  | "route_switch_selected"
  | "route_switch_next_tick"
  | "route_switch_first_paint"
  | "route_segments_prepare"
  | "route_section_exits"
  | "route_camera_fit"
  | "chaos_full_network_invariant_violation";

export type TransportMapTraceMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly TransportMapTraceMetadataValue[]
  | { readonly [key: string]: TransportMapTraceMetadataValue };

export type TransportMapTraceMetadata = Record<string, unknown>;

export type TransportMapTraceEventId = string;

export interface TransportMapTraceEvent {
  id: TransportMapTraceEventId;
  type: TransportMapTraceEventType;
  startMs: number;
  endMs?: number;
  durationMs?: number;
  parentId?: TransportMapTraceEventId;
  metadata?: Record<string, TransportMapTraceMetadataValue>;
}

export type TransportMapTraceFrameSeverity =
  | "slow"
  | "spike"
  | "severe"
  | "catastrophic";

export type TransportMapTraceMode = "off" | "spikes" | "full";

export type TransportMapTraceLikelyCause =
  | "SCENE_REBUILD"
  | "CACHE_KEY_BUILD"
  | "LOD_TRANSITION"
  | "BINARY_REBUILD"
  | "DECK_ATTRIBUTE_UPDATE"
  | "CHUNK_BURST"
  | "BASEMAP_LOADING"
  | "MAIN_THREAD_UNATTRIBUTED"
  | "UNATTRIBUTED_MAIN_THREAD_STALL"
  | "RAF_STARVATION_UNATTRIBUTED"
  | "SUSPECTED_GC";

export interface TransportMapTraceMemorySample {
  timestampMs: number;
  usedJsHeapSize?: number;
  totalJsHeapSize?: number;
  jsHeapSizeLimit?: number;
}

export interface TransportMapTraceMapLibreSample {
  timestampMs: number;
  zoom?: number;
  center?: { lon: number; lat: number };
  moving: boolean;
  styleLoaded: boolean;
  tilesLoaded: boolean;
  sourceLoadingCount: number;
  errorCount: number;
  idleObserved: boolean;
}

export interface TransportMapTraceFrameSnapshot {
  timestampMs?: number;
  frameMs?: number;
  severity?: TransportMapTraceFrameSeverity;
  camera?: {
    zoom?: number;
    startZoom?: number;
    endZoom?: number;
    zoomDelta?: number;
    updateCount?: number;
    centerWorldX?: number;
    centerWorldY?: number;
    center?: { lon: number; lat: number };
  };
  lod?: {
    current?: number;
    previous?: number;
    changing?: boolean;
  };
  render?: {
    pathCount?: number;
    stationCount?: number;
    vertexCount?: number;
  };
  chunks?: {
    visible?: number;
    added?: number;
    removed?: number;
    pending?: number;
    active?: number;
    completed?: number;
    bytes?: number;
  };
  binary?: {
    cacheBytes?: number;
    cacheEntries?: number;
    hits?: number;
    misses?: number;
    compileInProgress?: number;
  };
  maplibre?: {
    styleLoaded?: boolean;
    tilesLoaded?: boolean;
    moving?: boolean;
    sourceLoadingCount?: number;
    errorCount?: number;
    idleObserved?: boolean;
  };
  metadata?: TransportMapTraceMetadata;
}

export interface TransportMapTraceEventSummary {
  id: TransportMapTraceEventId;
  type: TransportMapTraceEventType;
  startOffsetMs: number;
  endOffsetMs?: number;
  durationMs?: number;
  parentId?: TransportMapTraceEventId;
  metadata?: Record<string, TransportMapTraceMetadataValue>;
}

export interface TransportMapTraceTimelineEntry {
  id: TransportMapTraceEventId;
  type: TransportMapTraceEventType;
  phase: "START" | "END";
  offsetMs: number;
  durationMs?: number;
  parentId?: TransportMapTraceEventId;
  clipped?: boolean;
  metadata?: Record<string, TransportMapTraceMetadataValue>;
}

export interface TransportMapTraceHeapDelta {
  before?: number;
  after?: number;
  deltaBytes?: number;
}

export interface TransportMapTraceFastEventAggregate {
  count: number;
  totalMs: number;
  maxMs: number;
}

export interface TransportMapTraceSpike {
  id: number;
  timestampMs: number;
  offsetMs: number;
  frameMs: number;
  severity: TransportMapTraceFrameSeverity;
  preRollMs: number;
  postRollMs: number;
  snapshot?: TransportMapTraceFrameSnapshot;
  activeEventsAtSpike: TransportMapTraceEventSummary[];
  overlappingEvents: TransportMapTraceEventSummary[];
  /** Significant measured operations that overlap the frame itself. */
  directCauses: TransportMapTraceEventSummary[];
  /** Events in the causal window that are useful context but not direct causes. */
  correlatedEvents: TransportMapTraceEventSummary[];
  measuredMainThreadMs: number;
  unattributedMs: number;
  unattributedCategory?: "MAIN_THREAD_UNATTRIBUTED" | "RAF_STARVATION_UNATTRIBUTED";
  unattributedClassification?: "UNATTRIBUTED_MAIN_THREAD_STALL" | "UNATTRIBUTED_RAF_STARVATION";
  longTasks: Array<{ startOffsetMs: number; durationMs: number }>;
  heap: TransportMapTraceHeapDelta;
  likelyCauses: TransportMapTraceLikelyCause[];
  suspectedGc?: {
    inferred: true;
    confirmed: false;
    reason: "heap-drop-with-long-task";
  };
  timeline?: TransportMapTraceTimelineEntry[];
}

export interface TransportMapTraceMapLibreSummary {
  sampleIntervalMs: number;
  sampleCount: number;
  samples: TransportMapTraceMapLibreSample[];
  renderCount: number;
  idleCount: number;
  errorCount: number;
  movingSampleCount: number;
  styleNotLoadedSampleCount: number;
  tilesNotLoadedSampleCount: number;
  sourceLoadingSampleCount: number;
  readySampleCount: number;
  readinessFailureSampleCount: number;
  readySampleRatio: number;
  minimumCoverage: number;
}

export interface TransportMapTraceReport {
  schemaVersion: 1;
  traceMode: TransportMapTraceMode;
  traceSessionId: number;
  startedAt: string;
  stoppedAt: string;
  durationMs: number;
  preRollMs: number;
  postRollMs: number;
  eventCapacity: number;
  /** Additional bounded storage reserved for events overlapping spike windows. */
  causalEventCapacity: number;
  eventCount: number;
  droppedEventCount: number;
  events: TransportMapTraceEvent[];
  /** Fast repetitive diagnostics omitted from the event ring in spikes mode. */
  fastEventAggregates: Record<string, TransportMapTraceFastEventAggregate>;
  counters: Record<string, number>;
  rendererFrames: number;
  frameCount: number;
  slowFrameCount: number;
  spikeFrameCount: number;
  severeSpikeCount: number;
  catastrophicSpikeCount: number;
  totalSpikeCount: number;
  retainedSpikeCount: number;
  spikes: TransportMapTraceSpike[];
  worstSpikes: TransportMapTraceSpike[];
  timelines: Array<{
    spikeId: number;
    frameMs: number;
    severity: TransportMapTraceFrameSeverity;
    entries: TransportMapTraceTimelineEntry[];
    text: string;
  }>;
  likelyCauseCounts: Partial<Record<TransportMapTraceLikelyCause, number>>;
  byLod: Record<string, { slowFrames: number; spikes: number; severeSpikes: number }>;
  byTransition: Record<string, { slowFrames: number; spikes: number; severeSpikes: number }>;
  spikesDuringLodTransition: number;
  zoomBuckets: Record<string, { slowFrames: number; spikes: number }>;
  longTaskCount: number;
  longTasksOver50Ms: number;
  memoryStart?: TransportMapTraceMemorySample;
  memoryEnd?: TransportMapTraceMemorySample;
  memoryDeltaBytes?: number;
  maxUsedJsHeapSize?: number;
  memorySamples: TransportMapTraceMemorySample[];
  maplibre?: TransportMapTraceMapLibreSummary;
  thresholds: typeof TRANSPORT_MAP_TRACE_THRESHOLDS;
  metadata?: Record<string, TransportMapTraceMetadataValue>;
}

export interface TransportMapPerformanceTraceProbe {
  start(): void;
  stop(): void;
  dispose(): void;
}

export interface TransportMapPerformanceTraceOptions {
  /** `spikes` is the bounded mode intended for Total Chaos. */
  mode?: TransportMapTraceMode;
  capacity?: number;
  spikeCapacity?: number;
  preRollMs?: number;
  postRollMs?: number;
  memorySampleIntervalMs?: number;
  now?: () => number;
  observeLongTasks?: boolean;
}

interface TraceLongTask {
  startMs: number;
  durationMs: number;
}

interface TraceFrameDraft {
  id: number;
  timestampMs: number;
  frameMs: number;
  severity: TransportMapTraceFrameSeverity;
  snapshot?: TransportMapTraceFrameSnapshot;
}

/** Fixed-size storage used by the diagnostic recorder and its probes. */
class BoundedTraceRing<T> {
  private readonly values: Array<T | undefined>;
  private writeIndex = 0;
  private countValue = 0;

  constructor(private readonly capacity: number) {
    this.values = new Array(Math.max(1, capacity));
  }

  get count(): number {
    return this.countValue;
  }

  push(value: T): void {
    this.values[this.writeIndex] = value;
    this.writeIndex = (this.writeIndex + 1) % this.values.length;
    this.countValue = Math.min(this.countValue + 1, this.values.length);
  }

  clear(): void {
    this.values.fill(undefined);
    this.writeIndex = 0;
    this.countValue = 0;
  }

  last(): T | undefined {
    if (this.countValue === 0) return undefined;
    return this.values[(this.writeIndex - 1 + this.values.length) % this.values.length];
  }

  toArray(): T[] {
    const result: T[] = [];
    const start = this.countValue < this.values.length ? 0 : this.writeIndex;
    for (let index = 0; index < this.countValue; index += 1) {
      const value = this.values[(start + index) % this.values.length];
      if (value !== undefined) result.push(value);
    }
    return result;
  }
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

const LOD_EVENT_TYPES = new Set<TransportMapTraceEventType>([
  "lod_change",
  "lod_materialize",
  "regional_to_detailed",
  "detailed_to_regional",
]);
const BINARY_EVENT_TYPES = new Set<TransportMapTraceEventType>([
  "binary_compile",
  "binary_cache_miss",
  "binary_cache_evict",
  "binary_packet_ready",
  "binary_packet_promote",
  "worker_binary_compile",
]);
const DECK_EVENT_TYPES = new Set<TransportMapTraceEventType>([
  "deck_set_props",
  "deck_data_changed",
  "deck_layer_rebuild",
  "deck_update_attributes",
]);
const CHUNK_EVENT_TYPES = new Set<TransportMapTraceEventType>([
  "chunk_request_batch",
  "chunk_fetch",
  "chunk_response_body",
  "chunk_json_parse",
  "chunk_decode",
  "chunk_materialize",
  "chunk_cache_miss",
  "worker_decode",
  "worker_filter",
]);
const NON_MAIN_THREAD_EVENT_TYPES = new Set<TransportMapTraceEventType>([
  "worker_job",
  "worker_decode",
  "worker_filter",
  "worker_binary_compile",
  "maplibre_render",
  "maplibre_source_loading",
  "maplibre_source_loaded",
  "maplibre_idle",
  "maplibre_error",
]);
const WALL_TIME_ONLY_EVENT_TYPES = new Set<TransportMapTraceEventType>([
  // These spans cover async orchestration or I/O. Their elapsed wall time is
  // useful for correlation, but it is not continuously occupied main-thread
  // CPU and must not hide an unattributed LongTask.
  "viewport_refresh",
  "regional_to_detailed",
  "detailed_to_regional",
  "chunk_request_batch",
  "chunk_fetch",
  "chunk_response_body",
]);
const SCENE_EVENT_TYPES = new Set<TransportMapTraceEventType>([
  "scene_rebuild",
  "render_scene_resolve",
  "render_paths_compute",
  "render_stations_compute",
  "active_station_lines_compute",
  "line_metadata_paths_compute",
  "ghost_line_paths_compute",
  "hit_test_stations_compute",
  "live_render_scene_build",
  "path_spatial_index_build",
  "station_spatial_index_build",
  "render_model_build",
  "renderer_render_call",
  "publish_network",
  "publish_viewport",
  "after_viewport_publish",
  "scene_publish",
  "station_visibility_rebuild",
  "viewport_result_apply",
]);

/**
 * Create the independent recorder.  Calling any recording method while the
 * recorder is stopped is a no-op, so production can keep the object wired in
 * without paying for diagnostics unless a debug run is active.
 */
export function createTransportMapPerformanceTrace(
  options: TransportMapPerformanceTraceOptions = {},
): TransportMapPerformanceTrace {
  return new TransportMapPerformanceTrace(options);
}

export class TransportMapPerformanceTrace {
  private readonly mode: TransportMapTraceMode;
  private readonly capacity: number;
  private readonly spikeCapacity: number;
  private readonly preRollMs: number;
  private readonly postRollMs: number;
  private readonly causalEventCapacity: number;
  private readonly memorySampleIntervalMs: number;
  private readonly now: () => number;
  private readonly eventRing: Array<TransportMapTraceEvent | undefined>;
  private readonly memorySamplesRing: Array<TransportMapTraceMemorySample | undefined>;
  private readonly spikeDrafts: BoundedTraceRing<TraceFrameDraft>;
  private readonly activeEvents = new Map<TransportMapTraceEventId, TransportMapTraceEvent>();
  private readonly probes = new Set<TransportMapPerformanceTraceProbe>();
  private readonly longTasks: BoundedTraceRing<TraceLongTask>;
  private readonly mapLibreSamples: BoundedTraceRing<TransportMapTraceMapLibreSample>;
  /** Copies only event windows around observed slow frames, not business data. */
  private readonly retainedCausalEvents = new Map<TransportMapTraceEventId, TransportMapTraceEvent>();
  private readonly fastEventAggregates = new Map<string, TransportMapTraceFastEventAggregate>();
  private readonly counters = new Map<string, number>();
  private nextEventId = 0;
  private traceSessionIdValue = 0;
  private nextSpikeId = 0;
  private eventWriteIndex = 0;
  private eventCountValue = 0;
  private droppedEventCount = 0;
  private memoryWriteIndex = 0;
  private memoryCountValue = 0;
  private frameCountValue = 0;
  private slowFrameCountValue = 0;
  private spikeFrameCountValue = 0;
  private severeSpikeCountValue = 0;
  private catastrophicSpikeCountValue = 0;
  private totalSpikeCountValue = 0;
  private rendererFramesValue = 0;
  private running = false;
  private startedAtMs = 0;
  private stoppedAtMs = 0;
  private startedAtWall = "";
  private stoppedAtWall = "";
  private sessionMetadata?: Record<string, TransportMapTraceMetadataValue>;
  private memoryTimer?: ReturnType<typeof setInterval>;
  private longTaskObserver?: PerformanceObserver;
  private lastFrameTimestamp?: number;
  private memoryStart?: TransportMapTraceMemorySample;
  private memoryEnd?: TransportMapTraceMemorySample;
  private maxUsedJsHeapSizeValue?: number;
  private mapLibreSummary?: TransportMapTraceMapLibreSummary;
  private cameraUpdatesSinceFrame = 0;
  private firstCameraZoomSinceFrame?: number;
  private lastCameraZoomSinceFrame?: number;

  constructor(options: TransportMapPerformanceTraceOptions = {}) {
    this.mode = options.mode ?? "spikes";
    this.capacity = Math.max(256, Math.floor(options.capacity ?? 10_000));
    this.spikeCapacity = Math.max(1, Math.floor(options.spikeCapacity ?? 2_048));
    this.preRollMs = Math.max(0, options.preRollMs ?? 250);
    this.postRollMs = Math.max(0, options.postRollMs ?? 500);
    this.causalEventCapacity = this.capacity + this.spikeCapacity;
    this.memorySampleIntervalMs = Math.max(50, options.memorySampleIntervalMs ?? 250);
    this.now = options.now ?? (() => (typeof performance === "undefined" ? Date.now() : performance.now()));
    this.eventRing = new Array(this.capacity);
    this.memorySamplesRing = new Array(Math.max(16, Math.ceil(60_000 / this.memorySampleIntervalMs)));
    this.spikeDrafts = new BoundedTraceRing<TraceFrameDraft>(this.spikeCapacity);
    this.longTasks = new BoundedTraceRing<TraceLongTask>(this.capacity);
    this.mapLibreSamples = new BoundedTraceRing<TransportMapTraceMapLibreSample>(this.capacity);
    this.observeLongTasks = options.observeLongTasks !== false;
  }

  private readonly observeLongTasks: boolean;

  get isRunning(): boolean {
    return this.running;
  }

  get startedAt(): number {
    return this.startedAtMs;
  }

  get sessionId(): number {
    return this.traceSessionIdValue;
  }

  /** Start a fresh bounded trace session. */
  start(metadata?: TransportMapTraceMetadata): void {
    if (this.running) return;
    this.resetSession();
    this.traceSessionIdValue += 1;
    this.sessionMetadata = cloneTraceMetadata(metadata);
    if (this.mode === "off") {
      this.startedAtMs = this.now();
      this.stoppedAtMs = this.startedAtMs;
      this.startedAtWall = new Date().toISOString();
      this.stoppedAtWall = this.startedAtWall;
      return;
    }
    this.running = true;
    this.startedAtMs = this.now();
    this.stoppedAtMs = this.startedAtMs;
    this.startedAtWall = new Date().toISOString();
    this.stoppedAtWall = this.startedAtWall;
    this.recordMemorySample(this.startedAtMs);
    this.startLongTaskObserver();
    if (this.memoryStart) {
      this.memoryTimer = setInterval(() => this.recordMemorySample(this.now()), this.memorySampleIntervalMs);
    }
    for (const probe of this.probes) probe.start();
  }

  /** Stop the session and return the causal report. */
  stop(metadata?: TransportMapTraceMetadata): TransportMapTraceReport {
    if (!this.running) return this.snapshot(metadata);
    // Probes may publish their final public samples while the recorder is
    // still live. This is important for the MapLibre post-roll snapshot.
    for (const probe of this.probes) probe.stop();
    this.recordMemorySample(this.now());
    this.running = false;
    this.stoppedAtMs = this.now();
    this.stoppedAtWall = new Date().toISOString();
    if (this.memoryTimer !== undefined) clearInterval(this.memoryTimer);
    this.memoryTimer = undefined;
    this.stopLongTaskObserver();
    for (const event of this.activeEvents.values()) {
      event.endMs = this.stoppedAtMs;
      event.durationMs = Math.max(0, this.stoppedAtMs - event.startMs);
      event.metadata = {
        ...(event.metadata ?? {}),
        incomplete: true,
      };
    }
    this.activeEvents.clear();
    if (metadata) this.sessionMetadata = cloneTraceMetadata(metadata);
    return this.snapshot();
  }

  snapshot(metadata?: TransportMapTraceMetadata): TransportMapTraceReport {
    const effectiveStoppedAt = this.running ? this.now() : this.stoppedAtMs || this.now();
    const effectiveMetadata = metadata ? cloneTraceMetadata(metadata) : this.sessionMetadata;
    const events = this.readEvents();
    const drafts = this.spikeDrafts.toArray().map((draft) => this.diagnoseSpike(draft, events));
    const sortedWorst = [...drafts].sort((left, right) => right.frameMs - left.frameMs);
    const likelyCauseCounts: Partial<Record<TransportMapTraceLikelyCause, number>> = {};
    const byLod: TransportMapTraceReport["byLod"] = {};
    const byTransition: TransportMapTraceReport["byTransition"] = {};
    const zoomBuckets: TransportMapTraceReport["zoomBuckets"] = {};
    let spikesDuringLodTransition = 0;
    for (const spike of drafts) {
      for (const cause of spike.likelyCauses) {
        likelyCauseCounts[cause] = (likelyCauseCounts[cause] ?? 0) + 1;
      }
      const lodKey = numberKey(spike.snapshot?.lod?.current);
      const lod = byLod[lodKey] ?? { slowFrames: 0, spikes: 0, severeSpikes: 0 };
      lod.slowFrames += 1;
      if (spike.severity !== "slow") lod.spikes += 1;
      if (spike.severity === "severe" || spike.severity === "catastrophic") lod.severeSpikes += 1;
      byLod[lodKey] = lod;
      const transitionKey = transitionKeyForSpike(spike);
      if (transitionKey) {
        const transition = byTransition[transitionKey] ?? { slowFrames: 0, spikes: 0, severeSpikes: 0 };
        transition.slowFrames += 1;
        if (spike.severity !== "slow") transition.spikes += 1;
        if (spike.severity === "severe" || spike.severity === "catastrophic") transition.severeSpikes += 1;
        byTransition[transitionKey] = transition;
      }
      const zoom = spike.snapshot?.camera?.zoom;
      if (typeof zoom === "number" && Number.isFinite(zoom)) {
        const zoomKey = zoomBucketKey(zoom);
        const bucket = zoomBuckets[zoomKey] ?? { slowFrames: 0, spikes: 0 };
        bucket.slowFrames += 1;
        if (spike.severity !== "slow") bucket.spikes += 1;
        zoomBuckets[zoomKey] = bucket;
      }
      if (spike.likelyCauses.includes("LOD_TRANSITION")) spikesDuringLodTransition += 1;
    }
    const worstSpikes = sortedWorst.slice(0, 10);
    const timelines = worstSpikes.map((spike) => {
      const entries = buildTimeline(spike, events);
      spike.timeline = entries;
      return {
        spikeId: spike.id,
        frameMs: spike.frameMs,
        severity: spike.severity,
        entries,
        text: formatTimelineText(spike, entries),
      };
    });
    const memorySamples = this.readMemorySamples();
    const memoryStart = this.memoryStart ?? memorySamples[0];
    const memoryEnd = this.memoryEnd ?? memorySamples.at(-1);
    const memoryDeltaBytes = memoryStart?.usedJsHeapSize !== undefined && memoryEnd?.usedJsHeapSize !== undefined
      ? memoryEnd.usedJsHeapSize - memoryStart.usedJsHeapSize
      : undefined;
    const maxUsedJsHeapSize = this.maxUsedJsHeapSizeValue;
    const counters = Object.fromEntries(this.counters.entries());
    const maplibre = this.buildMapLibreSummary();
    return omitUndefined({
      schemaVersion: 1 as const,
      traceMode: this.mode,
      traceSessionId: this.traceSessionIdValue,
      startedAt: this.startedAtWall || new Date().toISOString(),
      stoppedAt: this.stoppedAtWall || new Date().toISOString(),
      durationMs: round(Math.max(0, effectiveStoppedAt - this.startedAtMs)),
      preRollMs: this.preRollMs,
      postRollMs: this.postRollMs,
      eventCapacity: this.capacity,
      causalEventCapacity: this.causalEventCapacity,
      eventCount: events.length,
      droppedEventCount: this.droppedEventCount,
      events,
      fastEventAggregates: Object.fromEntries(
        [...this.fastEventAggregates.entries()].map(([key, aggregate]) => [key, {
          count: aggregate.count,
          totalMs: round(aggregate.totalMs),
          maxMs: round(aggregate.maxMs),
        }]),
      ),
      counters,
      rendererFrames: this.rendererFramesValue,
      frameCount: this.frameCountValue,
      slowFrameCount: this.slowFrameCountValue,
      spikeFrameCount: this.spikeFrameCountValue,
      severeSpikeCount: this.severeSpikeCountValue,
      catastrophicSpikeCount: this.catastrophicSpikeCountValue,
      totalSpikeCount: this.totalSpikeCountValue,
      retainedSpikeCount: drafts.length,
      spikes: drafts,
      worstSpikes,
      timelines,
      likelyCauseCounts,
      byLod,
      byTransition,
      spikesDuringLodTransition,
      zoomBuckets,
      longTaskCount: this.longTasks.count,
      longTasksOver50Ms: this.longTasks.toArray().filter((task) => task.durationMs > 50).length,
      memoryStart,
      memoryEnd,
      memoryDeltaBytes,
      maxUsedJsHeapSize,
      memorySamples,
      maplibre,
      thresholds: TRANSPORT_MAP_TRACE_THRESHOLDS,
      metadata: effectiveMetadata,
    });
  }

  begin(
    type: TransportMapTraceEventType,
    metadata?: TransportMapTraceMetadata,
    parentId?: TransportMapTraceEventId,
  ): TransportMapTraceEventId | undefined {
    if (!this.running) return undefined;
    if (this.shouldSuppressEvent(type, metadata)) return undefined;
    const event: TransportMapTraceEvent = {
      id: `trace-${this.traceSessionIdValue}-${++this.nextEventId}`,
      type,
      startMs: this.now(),
      parentId,
      metadata: cloneTraceMetadata(metadata),
    };
    this.pushEvent(event);
    this.activeEvents.set(event.id, event);
    return event.id;
  }

  end(
    eventId: TransportMapTraceEventId | undefined,
    metadata?: TransportMapTraceMetadata,
  ): void {
    if (!eventId) return;
    const event = this.activeEvents.get(eventId);
    if (!event) return;
    const endMs = this.now();
    event.endMs = endMs;
    event.durationMs = Math.max(0, endMs - event.startMs);
    const extra = cloneTraceMetadata(metadata);
    if (extra) event.metadata = { ...(event.metadata ?? {}), ...extra };
    this.activeEvents.delete(eventId);
  }

  instant(
    type: TransportMapTraceEventType,
    metadata?: TransportMapTraceMetadata,
  ): TransportMapTraceEventId | undefined {
    return this.recordDuration(type, 0, metadata);
  }

  /** Record a measured operation without opening a caller-managed span. */
  recordDuration(
    type: TransportMapTraceEventType,
    durationMs: number,
    metadata?: TransportMapTraceMetadata,
    parentId?: TransportMapTraceEventId,
  ): TransportMapTraceEventId | undefined {
    if (!this.running) return undefined;
    if (this.shouldSuppressEvent(type, metadata)) return undefined;
    const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    const fastAggregateKey = this.fastEventAggregateKey(type, duration, metadata);
    if (fastAggregateKey) {
      this.recordFastEventAggregate(fastAggregateKey, duration);
      return undefined;
    }
    const endMs = this.now();
    const event: TransportMapTraceEvent = {
      id: `trace-${this.traceSessionIdValue}-${++this.nextEventId}`,
      type,
      startMs: endMs - duration,
      endMs,
      durationMs: duration,
      parentId,
      metadata: cloneTraceMetadata(metadata),
    };
    this.pushEvent(event);
    return event.id;
  }

  /** Record one browser frame. No per-frame trace event is created. */
  recordFrame(
    frameMs: number,
    timestampMs = this.now(),
    snapshot?: TransportMapTraceFrameSnapshot,
  ): void {
    if (!this.running || !Number.isFinite(frameMs) || frameMs < 0) return;
    const timestamp = Number.isFinite(timestampMs) ? timestampMs : this.now();
    const frameSnapshot = this.consumeCameraWindow(snapshot);
    // The performance probe and Chaos monitor can observe the same RAF. Merge
    // their snapshots instead of counting it twice.
    if (this.lastFrameTimestamp !== undefined && Math.abs(timestamp - this.lastFrameTimestamp) < 0.01) {
      const previous = this.spikeDrafts.last();
      if (previous && frameSnapshot) previous.snapshot = mergeFrameSnapshots(previous.snapshot, frameSnapshot);
      return;
    }
    this.lastFrameTimestamp = timestamp;
    this.frameCountValue += 1;
    const severity = classifyFrame(frameMs);
    if (frameMs >= TRANSPORT_MAP_TRACE_THRESHOLDS.slowFrameMs) {
      this.slowFrameCountValue += 1;
      if (severity === "spike") this.spikeFrameCountValue += 1;
      if (severity === "severe") this.severeSpikeCountValue += 1;
      if (severity === "catastrophic") this.catastrophicSpikeCountValue += 1;
      this.totalSpikeCountValue += 1;
      const draft: TraceFrameDraft = {
        id: ++this.nextSpikeId,
        timestampMs: timestamp,
        frameMs: round(frameMs),
        severity,
        snapshot: frameSnapshot
          ? cloneFrameSnapshots({
              timestampMs: timestamp,
              frameMs: frameMs,
              severity,
              ...frameSnapshot,
            })
          : undefined,
      };
      this.spikeDrafts.push(draft);
      this.retainEventsForSpike(draft);
    }
  }

  recordRendererFrame(count = 1): void {
    if (!this.running || !Number.isFinite(count)) return;
    this.rendererFramesValue += Math.max(0, count);
  }

  recordCounter(name: string, delta = 1): void {
    if (!this.running || !name || !Number.isFinite(delta)) return;
    this.counters.set(name, (this.counters.get(name) ?? 0) + delta);
  }

  recordMemorySample(timestampMs = this.now()): void {
    if (!this.running) return;
    const sample = readTraceMemory(timestampMs);
    if (!sample) return;
    if (this.memoryStart === undefined) this.memoryStart = sample;
    this.memoryEnd = sample;
    if (sample.usedJsHeapSize !== undefined) {
      this.maxUsedJsHeapSizeValue = Math.max(this.maxUsedJsHeapSizeValue ?? 0, sample.usedJsHeapSize);
    }
    this.memorySamplesRing[this.memoryWriteIndex] = sample;
    this.memoryWriteIndex = (this.memoryWriteIndex + 1) % this.memorySamplesRing.length;
    this.memoryCountValue = Math.min(this.memoryCountValue + 1, this.memorySamplesRing.length);
  }

  recordLongTask(startMs: number, durationMs: number): void {
    if (!this.running || !Number.isFinite(startMs) || !Number.isFinite(durationMs) || durationMs < 0) return;
    this.longTasks.push({ startMs, durationMs });
  }

  recordMapLibreSample(sample: TransportMapTraceMapLibreSample): void {
    if (!this.running) return;
    this.mapLibreSamples.push({
      ...sample,
      center: sample.center ? { ...sample.center } : undefined,
    });
  }

  setMapLibreSummary(summary: TransportMapTraceMapLibreSummary | undefined): void {
    if (!summary) return;
    this.mapLibreSummary = {
      ...summary,
      samples: summary.samples.map((sample) => ({
        ...sample,
        center: sample.center ? { ...sample.center } : undefined,
      })),
    };
  }

  attachProbe(probe: TransportMapPerformanceTraceProbe): () => void {
    this.probes.add(probe);
    if (this.running) probe.start();
    return () => this.detachProbe(probe);
  }

  detachProbe(probe: TransportMapPerformanceTraceProbe): void {
    this.probes.delete(probe);
    probe.stop();
  }

  dispose(): void {
    if (this.running) this.stop();
    for (const probe of this.probes) probe.dispose();
    this.probes.clear();
    this.resetSession();
  }

  private resetSession(): void {
    this.stopLongTaskObserver();
    if (this.memoryTimer !== undefined) clearInterval(this.memoryTimer);
    this.memoryTimer = undefined;
    this.eventRing.fill(undefined);
    this.memorySamplesRing.fill(undefined);
    this.spikeDrafts.clear();
    this.activeEvents.clear();
    this.longTasks.clear();
    this.mapLibreSamples.clear();
    this.retainedCausalEvents.clear();
    this.fastEventAggregates.clear();
    this.mapLibreSummary = undefined;
    this.counters.clear();
    this.nextEventId = 0;
    this.nextSpikeId = 0;
    this.eventWriteIndex = 0;
    this.eventCountValue = 0;
    this.droppedEventCount = 0;
    this.memoryWriteIndex = 0;
    this.memoryCountValue = 0;
    this.frameCountValue = 0;
    this.slowFrameCountValue = 0;
    this.spikeFrameCountValue = 0;
    this.severeSpikeCountValue = 0;
    this.catastrophicSpikeCountValue = 0;
    this.totalSpikeCountValue = 0;
    this.rendererFramesValue = 0;
    this.lastFrameTimestamp = undefined;
    this.memoryStart = undefined;
    this.memoryEnd = undefined;
    this.maxUsedJsHeapSizeValue = undefined;
    this.startedAtWall = "";
    this.stoppedAtWall = "";
    this.sessionMetadata = undefined;
    this.cameraUpdatesSinceFrame = 0;
    this.firstCameraZoomSinceFrame = undefined;
    this.lastCameraZoomSinceFrame = undefined;
  }

  private pushEvent(event: TransportMapTraceEvent): void {
    if (this.eventRing[this.eventWriteIndex] !== undefined) {
      this.droppedEventCount += 1;
    } else {
      this.eventCountValue += 1;
    }
    this.eventRing[this.eventWriteIndex] = event;
    this.eventWriteIndex = (this.eventWriteIndex + 1) % this.capacity;
    this.retainEventForExistingSpikes(event);
  }

  private readEvents(): TransportMapTraceEvent[] {
    const byId = new Map<TransportMapTraceEventId, TransportMapTraceEvent>();
    for (const event of this.retainedCausalEvents.values()) byId.set(event.id, event);
    for (const event of this.readEventReferences()) byId.set(event.id, event);
    return [...byId.values()]
      .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
      .map((event) => cloneTraceEvent(event));
  }

  private readEventReferences(): TransportMapTraceEvent[] {
    const result: TransportMapTraceEvent[] = [];
    const start = this.eventCountValue < this.capacity ? 0 : this.eventWriteIndex;
    const count = Math.min(this.eventCountValue, this.capacity);
    for (let index = 0; index < count; index += 1) {
      const event = this.eventRing[(start + index) % this.capacity];
      if (event) result.push(event);
    }
    return result;
  }

  private retainEventsForSpike(draft: TraceFrameDraft): void {
    const frameStart = draft.timestampMs - draft.frameMs;
    const windowStart = frameStart - this.preRollMs;
    const windowEnd = draft.timestampMs + this.postRollMs;
    for (const event of [...this.readEventReferences(), ...this.activeEvents.values()]) {
      if (event.startMs <= windowEnd && (event.endMs === undefined || event.endMs >= windowStart)) {
        this.retainCausalEvent(event);
      }
    }
  }

  private retainEventForExistingSpikes(event: TransportMapTraceEvent): void {
    for (const draft of this.spikeDrafts.toArray()) {
      const frameStart = draft.timestampMs - draft.frameMs;
      const windowStart = frameStart - this.preRollMs;
      const windowEnd = draft.timestampMs + this.postRollMs;
      if (event.startMs <= windowEnd && (event.endMs === undefined || event.endMs >= windowStart)) {
        this.retainCausalEvent(event);
        return;
      }
    }
  }

  private retainCausalEvent(event: TransportMapTraceEvent): void {
    if (this.retainedCausalEvents.has(event.id)) return;
    if (this.retainedCausalEvents.size >= this.causalEventCapacity) {
      const oldest = this.retainedCausalEvents.keys().next().value as TransportMapTraceEventId | undefined;
      if (oldest) this.retainedCausalEvents.delete(oldest);
    }
    this.retainedCausalEvents.set(event.id, event);
  }

  private readMemorySamples(): TransportMapTraceMemorySample[] {
    const result: TransportMapTraceMemorySample[] = [];
    const start = this.memoryCountValue < this.memorySamplesRing.length ? 0 : this.memoryWriteIndex;
    const count = Math.min(this.memoryCountValue, this.memorySamplesRing.length);
    for (let index = 0; index < count; index += 1) {
      const sample = this.memorySamplesRing[(start + index) % this.memorySamplesRing.length];
      if (sample) result.push({ ...sample });
    }
    return result;
  }

  private startLongTaskObserver(): void {
    if (!this.observeLongTasks || typeof PerformanceObserver === "undefined") return;
    try {
      this.longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) this.recordLongTask(entry.startTime, entry.duration);
      });
      this.longTaskObserver.observe({ entryTypes: ["longtask"] });
    } catch {
      this.longTaskObserver = undefined;
    }
  }

  private stopLongTaskObserver(): void {
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = undefined;
  }

  private shouldSuppressEvent(
    type: TransportMapTraceEventType,
    metadata: TransportMapTraceMetadata | undefined,
  ): boolean {
    if (this.mode !== "spikes") return false;
    if (type === "camera_update") {
      this.cameraUpdatesSinceFrame += 1;
      const previousZoom = typeof metadata?.previousZoom === "number"
        ? metadata.previousZoom
        : undefined;
      const newZoom = typeof metadata?.newZoom === "number"
        ? metadata.newZoom
        : undefined;
      if (this.firstCameraZoomSinceFrame === undefined && previousZoom !== undefined) {
        this.firstCameraZoomSinceFrame = previousZoom;
      }
      if (newZoom !== undefined) this.lastCameraZoomSinceFrame = newZoom;
      this.counters.set(
        "cameraUpdateCount",
        (this.counters.get("cameraUpdateCount") ?? 0) + 1,
      );
      return true;
    }
    if (
      type === "viewport_generation_change" &&
      metadata?.refresh !== true &&
      metadata?.query !== true &&
      metadata?.sceneTriggered !== true
    ) {
      this.counters.set(
        "viewportGenerationChangeCount",
        (this.counters.get("viewportGenerationChangeCount") ?? 0) + 1,
      );
      return true;
    }
    return false;
  }

  private fastEventAggregateKey(
    type: TransportMapTraceEventType,
    durationMs: number,
    metadata: TransportMapTraceMetadata | undefined,
  ): string | undefined {
    if (this.mode !== "spikes" || durationMs >= 10) return undefined;
    if (type === "binary_cache_key_build") return type;
    if (
      type === "filter_paths_local" ||
      type === "active_station_lines_compute" ||
      type === "line_metadata_paths_compute" ||
      type === "ghost_line_paths_compute" ||
      type === "hit_test_stations_compute" ||
      type === "hit_test_station_ids_prepare" ||
      type === "hit_test_candidates_compute"
    ) return type;
    if (type === "render_model_build" && metadata?.reused === true) {
      return "render_model_build.reused";
    }
    if (type === "renderer_render_call") return "renderer_render_call.quick";
    return undefined;
  }

  private recordFastEventAggregate(key: string, durationMs: number): void {
    const previous = this.fastEventAggregates.get(key);
    if (previous) {
      previous.count += 1;
      previous.totalMs += durationMs;
      previous.maxMs = Math.max(previous.maxMs, durationMs);
      return;
    }
    this.fastEventAggregates.set(key, {
      count: 1,
      totalMs: durationMs,
      maxMs: durationMs,
    });
  }

  private consumeCameraWindow(
    snapshot: TransportMapTraceFrameSnapshot | undefined,
  ): TransportMapTraceFrameSnapshot | undefined {
    if (this.cameraUpdatesSinceFrame === 0) return snapshot;
    const startZoom = this.firstCameraZoomSinceFrame;
    const endZoom = this.lastCameraZoomSinceFrame;
    const camera = {
      ...(snapshot?.camera ?? {}),
      startZoom,
      endZoom: endZoom ?? snapshot?.camera?.zoom,
      zoomDelta: startZoom !== undefined && endZoom !== undefined
        ? endZoom - startZoom
        : undefined,
      updateCount: this.cameraUpdatesSinceFrame,
    };
    this.cameraUpdatesSinceFrame = 0;
    this.firstCameraZoomSinceFrame = undefined;
    this.lastCameraZoomSinceFrame = undefined;
    return { ...(snapshot ?? {}), camera };
  }

  private diagnoseSpike(
    draft: TraceFrameDraft,
    events: readonly TransportMapTraceEvent[],
  ): TransportMapTraceSpike {
    const frameStart = draft.timestampMs - draft.frameMs;
    const frameEnd = draft.timestampMs;
    const windowStart = frameStart - this.preRollMs;
    const windowEnd = frameEnd + this.postRollMs;
    const activeEvents = events.filter((event) =>
      event.startMs <= frameEnd && (event.endMs === undefined || event.endMs >= frameStart),
    );
    const overlappingEvents = events.filter((event) =>
      event.startMs <= windowEnd && (event.endMs === undefined || event.endMs >= windowStart),
    );
    const activeSummaries = activeEvents.map((event) => this.summarizeEvent(event));
    const overlappingSummaries = overlappingEvents.map((event) => this.summarizeEvent(event));
    const longTasks = this.longTasks.toArray()
      .filter((task) => task.startMs <= windowEnd && task.startMs + task.durationMs >= windowStart)
      .map((task) => ({
        startOffsetMs: round(task.startMs - frameStart),
        durationMs: round(task.durationMs),
      }));
    const heapBefore = this.findMemoryBefore(frameStart);
    const heapAfter = this.findMemoryAfter(frameEnd);
    const heap: TransportMapTraceHeapDelta = {
      before: heapBefore?.usedJsHeapSize,
      after: heapAfter?.usedJsHeapSize,
      deltaBytes: heapBefore?.usedJsHeapSize !== undefined && heapAfter?.usedJsHeapSize !== undefined
        ? heapAfter.usedJsHeapSize - heapBefore.usedJsHeapSize
        : undefined,
    };
    const eventTypes = new Set(overlappingEvents.map((event) => event.type));
    const directEvents = overlappingEvents.filter((event) =>
      isMainThreadMeasuredEvent(event) &&
      isSignificantFrameOperation(event, frameStart, frameEnd, draft.frameMs),
    );
    const directEventIds = new Set(directEvents.map((event) => event.id));
    const directCauses = directEvents.map((event) => this.summarizeEvent(event));
    const correlatedEvents = overlappingEvents
      .filter((event) => !directEventIds.has(event.id))
      .map((event) => this.summarizeEvent(event));
    const measuredMainThreadMs = measureMainThreadOverlap(
      overlappingEvents,
      frameStart,
      frameEnd,
    );
    const unattributedMs = Math.max(0, draft.frameMs - measuredMainThreadMs);
    const significantUnattributed = isSignificantDuration(unattributedMs, draft.frameMs);
    const longTaskOverlapsFrame = this.longTasks.toArray().some((task) =>
      task.startMs < frameEnd && task.startMs + task.durationMs > frameStart,
    );
    const mapLibreOverlap = this.mapLibreSamples.toArray().some((sample) =>
      sample.timestampMs >= windowStart && sample.timestampMs <= windowEnd &&
      (!sample.tilesLoaded || !sample.styleLoaded || sample.sourceLoadingCount > 0),
    );
    const causes = new Set<TransportMapTraceLikelyCause>();
    if (draft.snapshot?.lod?.changing || [...eventTypes].some((type) => LOD_EVENT_TYPES.has(type))) {
      causes.add("LOD_TRANSITION");
    }
    if ([...eventTypes].some((type) => BINARY_EVENT_TYPES.has(type)) ||
      (draft.snapshot?.binary?.compileInProgress ?? 0) > 0) {
      causes.add("BINARY_REBUILD");
    }
    if ([...eventTypes].some((type) => DECK_EVENT_TYPES.has(type))) {
      causes.add("DECK_ATTRIBUTE_UPDATE");
    }
    if ([...eventTypes].some((type) => CHUNK_EVENT_TYPES.has(type)) ||
      (draft.snapshot?.chunks?.added ?? 0) > 0 ||
      (draft.snapshot?.chunks?.pending ?? 0) > 0 ||
      (draft.snapshot?.chunks?.active ?? 0) > 0) {
      causes.add("CHUNK_BURST");
    }
    if (mapLibreOverlap || [...eventTypes].some((type) =>
      type === "maplibre_source_loading" || type === "maplibre_render")) {
      causes.add("BASEMAP_LOADING");
    }
    for (const event of directEvents) {
      const cause = directCauseForEvent(event);
      if (cause) causes.add(cause);
    }
    let unattributedCategory: TransportMapTraceSpike["unattributedCategory"];
    let unattributedClassification: TransportMapTraceSpike["unattributedClassification"];
    if (significantUnattributed) {
      if (longTaskOverlapsFrame) {
        unattributedCategory = "MAIN_THREAD_UNATTRIBUTED";
        causes.add("MAIN_THREAD_UNATTRIBUTED");
        causes.add("UNATTRIBUTED_MAIN_THREAD_STALL");
        unattributedClassification = "UNATTRIBUTED_MAIN_THREAD_STALL";
      } else if (directEvents.length === 0) {
        unattributedCategory = "RAF_STARVATION_UNATTRIBUTED";
        causes.add("RAF_STARVATION_UNATTRIBUTED");
        unattributedClassification = "UNATTRIBUTED_RAF_STARVATION";
      }
    }
    const heapDropThreshold = Math.max(16 * 1024 * 1024, Math.abs(heap.before ?? 0) * 0.1);
    const hasKnownDirectCause = [...causes].some((cause) =>
      cause !== "MAIN_THREAD_UNATTRIBUTED" &&
      cause !== "UNATTRIBUTED_MAIN_THREAD_STALL" &&
      cause !== "RAF_STARVATION_UNATTRIBUTED",
    );
    const hasInferredGc = heap.deltaBytes !== undefined &&
      heap.deltaBytes <= -heapDropThreshold &&
      longTasks.some((task) => task.durationMs > 50) &&
      !hasKnownDirectCause;
    if (hasInferredGc) causes.add("SUSPECTED_GC");
    return {
      id: draft.id,
      timestampMs: round(draft.timestampMs),
      offsetMs: round(draft.timestampMs - this.startedAtMs),
      frameMs: draft.frameMs,
      severity: draft.severity,
      preRollMs: this.preRollMs,
      postRollMs: this.postRollMs,
      snapshot: draft.snapshot,
      activeEventsAtSpike: activeSummaries,
      overlappingEvents: overlappingSummaries,
      directCauses,
      correlatedEvents,
      measuredMainThreadMs: round(measuredMainThreadMs),
      unattributedMs: round(unattributedMs),
      unattributedCategory,
      unattributedClassification,
      longTasks,
      heap,
      likelyCauses: [...causes],
      suspectedGc: hasInferredGc ? {
        inferred: true,
        confirmed: false,
        reason: "heap-drop-with-long-task",
      } : undefined,
    };
  }

  private summarizeEvent(event: TransportMapTraceEvent): TransportMapTraceEventSummary {
    return omitUndefined({
      id: event.id,
      type: event.type,
      startOffsetMs: round(event.startMs - this.startedAtMs),
      endOffsetMs: event.endMs === undefined ? undefined : round(event.endMs - this.startedAtMs),
      durationMs: event.durationMs === undefined ? undefined : round(event.durationMs),
      parentId: event.parentId,
      metadata: event.metadata,
    });
  }

  private findMemoryBefore(timestampMs: number): TransportMapTraceMemorySample | undefined {
    const samples = this.readMemorySamples();
    return samples.filter((sample) => sample.timestampMs <= timestampMs).at(-1) ?? samples[0];
  }

  private findMemoryAfter(timestampMs: number): TransportMapTraceMemorySample | undefined {
    const samples = this.readMemorySamples();
    return samples.find((sample) => sample.timestampMs >= timestampMs) ?? samples.at(-1);
  }

  private buildMapLibreSummary(): TransportMapTraceMapLibreSummary | undefined {
    if (this.mapLibreSummary) return this.mapLibreSummary;
    const retainedSamples = this.mapLibreSamples.toArray();
    if (retainedSamples.length === 0) return undefined;
    const samples = retainedSamples.map((sample) => ({
      ...sample,
      center: sample.center ? { ...sample.center } : undefined,
    }));
    const readySampleCount = samples.filter((sample) => sample.styleLoaded && sample.tilesLoaded).length;
    return {
      sampleIntervalMs: this.memorySampleIntervalMs,
      sampleCount: samples.length,
      samples,
      renderCount: this.counters.get("maplibreRenderCount") ?? 0,
      idleCount: this.counters.get("maplibreIdleCount") ?? 0,
      errorCount: this.counters.get("maplibreErrorCount") ?? 0,
      movingSampleCount: samples.filter((sample) => sample.moving).length,
      styleNotLoadedSampleCount: samples.filter((sample) => !sample.styleLoaded).length,
      tilesNotLoadedSampleCount: samples.filter((sample) => !sample.tilesLoaded).length,
      sourceLoadingSampleCount: samples.filter((sample) => sample.sourceLoadingCount > 0).length,
      readySampleCount,
      readinessFailureSampleCount: samples.length - readySampleCount,
      readySampleRatio: samples.length > 0 ? round(readySampleCount / samples.length) : 1,
      minimumCoverage: samples.every((sample) => sample.styleLoaded && sample.tilesLoaded) ? 1 : 0,
    };
  }
}

function isMainThreadMeasuredEvent(event: TransportMapTraceEvent): boolean {
  if (NON_MAIN_THREAD_EVENT_TYPES.has(event.type)) return false;
  if (WALL_TIME_ONLY_EVENT_TYPES.has(event.type)) return false;
  if (event.type === "binary_compile") {
    const execution = event.metadata?.execution;
    if (execution === "worker" || execution === "worker-fallback") return false;
  }
  return true;
}

function eventOverlapInterval(
  event: TransportMapTraceEvent,
  frameStart: number,
  frameEnd: number,
): [number, number] | undefined {
  const start = Math.max(frameStart, event.startMs);
  const end = Math.min(frameEnd, event.endMs ?? frameEnd);
  return end > start ? [start, end] : undefined;
}

function isSignificantFrameOperation(
  event: TransportMapTraceEvent,
  frameStart: number,
  frameEnd: number,
  frameMs: number,
): boolean {
  const interval = eventOverlapInterval(event, frameStart, frameEnd);
  if (!interval) return false;
  const overlapMs = interval[1] - interval[0];
  return overlapMs >= 10 || overlapMs >= frameMs * 0.15;
}

function isSignificantDuration(durationMs: number, frameMs: number): boolean {
  return durationMs >= 10 || durationMs >= frameMs * 0.15;
}

function measureMainThreadOverlap(
  events: readonly TransportMapTraceEvent[],
  frameStart: number,
  frameEnd: number,
): number {
  const intervals = events
    .filter(isMainThreadMeasuredEvent)
    .map((event) => eventOverlapInterval(event, frameStart, frameEnd))
    .filter((interval): interval is [number, number] => Boolean(interval))
    .sort((left, right) => left[0] - right[0]);
  let measured = 0;
  let currentStart: number | undefined;
  let currentEnd: number | undefined;
  for (const [start, end] of intervals) {
    if (currentStart === undefined || currentEnd === undefined) {
      currentStart = start;
      currentEnd = end;
    } else if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      measured += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }
  if (currentStart !== undefined && currentEnd !== undefined) {
    measured += currentEnd - currentStart;
  }
  return measured;
}

function directCauseForEvent(event: TransportMapTraceEvent): TransportMapTraceLikelyCause | undefined {
  if (event.type === "binary_cache_key_build") return "CACHE_KEY_BUILD";
  if (SCENE_EVENT_TYPES.has(event.type)) return "SCENE_REBUILD";
  if (BINARY_EVENT_TYPES.has(event.type)) return "BINARY_REBUILD";
  if (DECK_EVENT_TYPES.has(event.type)) return "DECK_ATTRIBUTE_UPDATE";
  if (LOD_EVENT_TYPES.has(event.type)) return "LOD_TRANSITION";
  if (CHUNK_EVENT_TYPES.has(event.type)) return "CHUNK_BURST";
  return undefined;
}

function classifyFrame(frameMs: number): TransportMapTraceFrameSeverity {
  if (frameMs >= TRANSPORT_MAP_TRACE_THRESHOLDS.catastrophicMs) return "catastrophic";
  if (frameMs >= TRANSPORT_MAP_TRACE_THRESHOLDS.severeSpikeMs) return "severe";
  if (frameMs >= TRANSPORT_MAP_TRACE_THRESHOLDS.spikeFrameMs) return "spike";
  return "slow";
}

function cloneFrameSnapshots(
  snapshot: TransportMapTraceFrameSnapshot | undefined,
): TransportMapTraceFrameSnapshot | undefined {
  return snapshot ? mergeFrameSnapshots(undefined, snapshot) : undefined;
}

function mergeFrameSnapshots(
  previous: TransportMapTraceFrameSnapshot | undefined,
  next: TransportMapTraceFrameSnapshot,
): TransportMapTraceFrameSnapshot {
  return {
    ...previous,
    ...next,
    camera: previous?.camera || next.camera
      ? { ...(previous?.camera ?? {}), ...(next.camera ?? {}), center: next.camera?.center ?? previous?.camera?.center }
      : undefined,
    lod: previous?.lod || next.lod ? { ...(previous?.lod ?? {}), ...(next.lod ?? {}) } : undefined,
    render: previous?.render || next.render ? { ...(previous?.render ?? {}), ...(next.render ?? {}) } : undefined,
    chunks: previous?.chunks || next.chunks ? { ...(previous?.chunks ?? {}), ...(next.chunks ?? {}) } : undefined,
    binary: previous?.binary || next.binary ? { ...(previous?.binary ?? {}), ...(next.binary ?? {}) } : undefined,
    maplibre: previous?.maplibre || next.maplibre ? { ...(previous?.maplibre ?? {}), ...(next.maplibre ?? {}) } : undefined,
    metadata: previous?.metadata || next.metadata
      ? cloneTraceMetadata({ ...(previous?.metadata ?? {}), ...(next.metadata ?? {}) })
      : undefined,
  };
}

function cloneTraceEvent(event: TransportMapTraceEvent): TransportMapTraceEvent {
  return omitUndefined({
    id: event.id,
    type: event.type,
    startMs: round(event.startMs),
    endMs: event.endMs === undefined ? undefined : round(event.endMs),
    durationMs: event.durationMs === undefined ? undefined : round(event.durationMs),
    parentId: event.parentId,
    metadata: event.metadata,
  });
}

function cloneTraceMetadata(
  metadata: TransportMapTraceMetadata | undefined,
): Record<string, TransportMapTraceMetadataValue> | undefined {
  if (!metadata) return undefined;
  const result: Record<string, TransportMapTraceMetadataValue> = {};
  for (const [key, value] of Object.entries(metadata).slice(0, 32)) {
    const cloned = cloneTraceMetadataValue(value, 0);
    if (cloned !== undefined) result[key] = cloned;
  }
  return result;
}

function cloneTraceMetadataValue(
  value: unknown,
  depth: number,
): TransportMapTraceMetadataValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (depth >= 2) return undefined;
  if (Array.isArray(value)) {
    // Metadata may contain small identifier lists, but never copy geometry,
    // packet buffers, or nested business objects into the trace. Keeping
    // arrays scalar also makes the bound obvious even for hostile callers.
    return value.slice(0, 32)
      .map((item) => cloneTraceMetadataScalar(item))
      .filter((item): item is TransportMapTraceMetadataValue => item !== undefined);
  }
  if (typeof value === "object") {
    if (typeof ArrayBuffer !== "undefined" &&
      (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)) return undefined;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const record: Record<string, TransportMapTraceMetadataValue> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 32)) {
      const cloned = cloneTraceMetadataValue(child, depth + 1);
      if (cloned !== undefined) record[key] = cloned;
    }
    return record;
  }
  return undefined;
}

function cloneTraceMetadataScalar(value: unknown): TransportMapTraceMetadataValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  return undefined;
}

function buildTimeline(
  spike: TransportMapTraceSpike,
  events: readonly TransportMapTraceEvent[],
): TransportMapTraceTimelineEntry[] {
  const frameStart = spike.timestampMs - spike.frameMs;
  const windowStart = frameStart - spike.preRollMs;
  const windowEnd = spike.timestampMs + spike.postRollMs;
  const entries: TransportMapTraceTimelineEntry[] = [];
  for (const event of events) {
    if (event.startMs > windowEnd || (event.endMs ?? Number.POSITIVE_INFINITY) < windowStart) continue;
    const startsBeforeWindow = event.startMs < windowStart;
    entries.push({
      id: event.id,
      type: event.type,
      phase: "START",
      offsetMs: round((startsBeforeWindow ? windowStart : event.startMs) - frameStart),
      durationMs: event.durationMs === undefined ? undefined : round(event.durationMs),
      parentId: event.parentId,
      clipped: startsBeforeWindow ? true : undefined,
      metadata: event.metadata,
    });
    if (event.endMs !== undefined) {
      const endsAfterWindow = event.endMs > windowEnd;
      entries.push({
        id: event.id,
        type: event.type,
        phase: "END",
        offsetMs: round((endsAfterWindow ? windowEnd : event.endMs) - frameStart),
        durationMs: event.durationMs === undefined ? undefined : round(event.durationMs),
        parentId: event.parentId,
        clipped: endsAfterWindow ? true : undefined,
        metadata: event.metadata,
      });
    }
  }
  return entries.sort((left, right) => left.offsetMs - right.offsetMs || (left.phase === "START" ? -1 : 1));
}

function formatTimelineText(
  spike: TransportMapTraceSpike,
  entries: readonly TransportMapTraceTimelineEntry[],
): string {
  const rows = entries.map((entry) => ({
    offsetMs: entry.offsetMs,
    order: entry.phase === "START" ? 1 : 2,
    text: `${entry.type} ${entry.phase}${entry.clipped ? " (clipped)" : ""}`,
  }));
  rows.push({ offsetMs: -spike.frameMs, order: 0, text: "FRAME START" });
  rows.push({ offsetMs: 0, order: 3, text: "FRAME END" });
  return rows
    .sort((left, right) => left.offsetMs - right.offsetMs || left.order - right.order)
    .map((row) => `${formatTimelineOffset(row.offsetMs)} ${row.text}`)
    .join("\n");
}

function formatTimelineOffset(offsetMs: number): string {
  const rounded = round(offsetMs);
  return `${rounded > 0 ? "+" : ""}${rounded}ms`;
}

function readTraceMemory(timestampMs: number): TransportMapTraceMemorySample | undefined {
  if (typeof performance === "undefined") return undefined;
  const memory = (performance as PerformanceWithMemory).memory;
  if (!memory || !Number.isFinite(memory.usedJSHeapSize)) return undefined;
  return {
    timestampMs,
    usedJsHeapSize: memory.usedJSHeapSize,
    totalJsHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
  };
}

function numberKey(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "unknown";
}

function transitionKeyForSpike(spike: TransportMapTraceSpike): string | undefined {
  const transitionEvent = spike.overlappingEvents.find((event) =>
    event.type === "regional_to_detailed" || event.type === "detailed_to_regional",
  );
  if (transitionEvent) {
    const from = metadataLabel(transitionEvent.metadata?.from ?? transitionEvent.metadata?.previousLevel);
    const to = metadataLabel(transitionEvent.metadata?.to ?? transitionEvent.metadata?.newLevel);
    if (from !== undefined && to !== undefined) return `${from}->${to}`;
    return transitionEvent.type;
  }
  if (spike.snapshot?.lod?.changing) {
    const from = numberKey(spike.snapshot.lod.previous);
    const to = numberKey(spike.snapshot.lod.current);
    if (from !== "unknown" && to !== "unknown") return `${from}->${to}`;
  }
  return undefined;
}

function metadataLabel(value: TransportMapTraceMetadataValue | undefined): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function zoomBucketKey(zoom: number): string {
  const lower = Math.max(0, Math.min(17, Math.floor(zoom)));
  return `${lower}-${lower + 1}`;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function omitUndefined<T extends object>(value: T): T {
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (record[key] === undefined) delete record[key];
  }
  return value;
}
