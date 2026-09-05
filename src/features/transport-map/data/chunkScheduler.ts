import type {
  GlobalMapChunkDescriptor,
  GlobalMapChunkPayload,
  GlobalMapMode,
  GlobalMapManifest,
} from "../contracts/manifest";
import { GLOBAL_MAP_MODE_ORDER } from "../contracts/manifest";
import { GlobalMapAssetLoader } from "./assetLoader";
import { BoundedLruCache } from "./decodedChunkCache";
import type { GlobalMapBounds } from "../contracts/manifest";
import { boundsIntersect } from "../geo/coordinateKernel";
import type {
  TransportMapPerformanceTrace,
  TransportMapTraceEventId,
} from "../performance/transportMapPerformanceTrace";

export type ChunkPriority = "critical" | "visible" | "overscan" | "prefetch";

export interface ChunkRequest {
  descriptor: GlobalMapChunkDescriptor;
  generation: number;
  priority: ChunkPriority;
  traceParentId?: TransportMapTraceEventId;
}

export type TransportMapChunkLoader = (
  request: ChunkRequest,
  signal: AbortSignal,
) => Promise<GlobalMapChunkPayload>;

export interface ChunkSchedulerMetrics {
  pending: number;
  active: number;
  completed: number;
  abandoned: number;
  cache: ReturnType<BoundedLruCache<GlobalMapChunkPayload>["metrics"]>;
}

export interface TransportMapChunkCacheLimits {
  maxEntries: number;
  maxBytes: number;
}

const DEFAULT_CHUNK_CACHE_LIMITS: TransportMapChunkCacheLimits = {
  maxEntries: 12,
  maxBytes: 48 * 1024 * 1024,
};

export class TransportMapChunkScheduler {
  private readonly cache: BoundedLruCache<GlobalMapChunkPayload>;
  private readonly pending: Array<ChunkRequest & { resolve: (value: GlobalMapChunkPayload) => void; reject: (reason: unknown) => void }> = [];
  private readonly active = new Map<string, { controller: AbortController; generation: number; priority: ChunkPriority }>();
  private readonly inFlight = new Map<string, Promise<GlobalMapChunkPayload>>();
  private readonly chunkLoader: TransportMapChunkLoader;
  private currentGeneration = 0;
  private completed = 0;
  private abandoned = 0;

  constructor(
    loader: GlobalMapAssetLoader,
    private readonly manifest: GlobalMapManifest,
    private readonly maxConcurrency = 2,
    chunkLoader?: TransportMapChunkLoader,
    cacheLimits: TransportMapChunkCacheLimits = DEFAULT_CHUNK_CACHE_LIMITS,
    private readonly trace?: TransportMapPerformanceTrace,
  ) {
    this.cache = new BoundedLruCache<GlobalMapChunkPayload>(
      Math.max(1, Math.floor(cacheLimits.maxEntries)),
      Math.max(1, Math.floor(cacheLimits.maxBytes)),
    );
    this.chunkLoader = chunkLoader ?? ((request, signal) => loader.loadChunk(
      this.manifest,
      request.descriptor,
      signal,
      request.traceParentId,
    ));
  }

  descriptorsForBounds(bounds: GlobalMapBounds, overscanRatio = 0.2, visibleModeMask = -1): GlobalMapChunkDescriptor[] {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const expanded = {
      minX: bounds.minX - width * overscanRatio,
      minY: bounds.minY - height * overscanRatio,
      maxX: bounds.maxX + width * overscanRatio,
      maxY: bounds.maxY + height * overscanRatio,
    };
    return this.manifest.files.chunks.filter((chunk) =>
      boundsIntersect(expanded, chunk.bounds) &&
      (!chunk.modes || chunk.modes.some((mode) => (visibleModeMask & modeBitForMode(mode)) !== 0)),
    );
  }

  request(request: ChunkRequest): Promise<GlobalMapChunkPayload> {
    const trace = this.trace?.isRunning ? this.trace : undefined;
    const cached = this.cache.get(request.descriptor.id);
    if (cached) {
      trace?.instant("chunk_cache_hit", {
        chunkId: request.descriptor.id,
        generation: request.generation,
        priority: request.priority,
        bytes: request.descriptor.bytes,
      });
      return Promise.resolve(cached);
    }
    trace?.instant("chunk_cache_miss", {
      chunkId: request.descriptor.id,
      generation: request.generation,
      priority: request.priority,
      bytes: request.descriptor.bytes,
    });
    const existing = this.inFlight.get(request.descriptor.id);
    if (existing) {
      const pending = this.pending.find((item) => item.descriptor.id === request.descriptor.id);
      if (pending && priorityRank(request.priority) < priorityRank(pending.priority)) {
        pending.priority = request.priority;
        pending.generation = request.generation;
        this.pending.sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority));
      }
      const active = this.active.get(request.descriptor.id);
      if (active && priorityRank(request.priority) < priorityRank(active.priority)) {
        active.priority = request.priority;
        active.generation = request.generation;
      }
      return existing;
    }
    if (priorityRank(request.priority) <= priorityRank("visible")) {
      this.preemptOnePrefetchIfNeeded();
    }
    const promise = new Promise<GlobalMapChunkPayload>((resolve, reject) => {
      this.pending.push({ ...request, resolve, reject });
      this.pending.sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority));
      this.pump();
    });
    this.inFlight.set(request.descriptor.id, promise);
    void promise.then(
      () => {
        if (this.inFlight.get(request.descriptor.id) === promise) {
          this.inFlight.delete(request.descriptor.id);
        }
      },
      () => {
        if (this.inFlight.get(request.descriptor.id) === promise) {
          this.inFlight.delete(request.descriptor.id);
        }
      },
    );
    return promise;
  }

  cancelObsolete(generation: number): void {
    this.currentGeneration = generation;
    for (const [chunkId, active] of this.active) {
      if (active.generation < generation && active.priority !== "prefetch") {
        active.controller.abort(generation);
        this.active.delete(chunkId);
        // abort() rejects the loader asynchronously. Do not let a new
        // generation deduplicate onto that already-cancelled promise.
        this.inFlight.delete(chunkId);
        this.abandoned += 1;
      }
    }
    for (let index = this.pending.length - 1; index >= 0; index -= 1) {
      if (this.pending[index]!.generation < generation && this.pending[index]!.priority !== "prefetch") {
        const stale = this.pending.splice(index, 1)[0]!;
        // The rejected promise remains in inFlight until its rejection
        // handler runs, so clear it before accepting an immediate retry.
        this.inFlight.delete(stale.descriptor.id);
        stale.reject(new DOMException("Stale global-map generation", "AbortError"));
        this.abandoned += 1;
      }
    }
    this.pump();
  }

  dispose(): void {
    for (const { controller } of this.active.values()) controller.abort("disposed");
    this.active.clear();
    for (const request of this.pending.splice(0)) request.reject(new DOMException("Disposed", "AbortError"));
    this.cache.clear();
  }

  metrics(): ChunkSchedulerMetrics {
    return {
      pending: this.pending.length,
      active: this.active.size,
      completed: this.completed,
      abandoned: this.abandoned,
      cache: this.cache.metrics(),
    };
  }

  hasCached(chunkId: string): boolean {
    return this.cache.has(chunkId);
  }

  evictInvisibleModes(visibleModeMask: number): void {
    for (const descriptor of this.manifest.files.chunks) {
      if (descriptor.modes?.length && !descriptor.modes.some((mode) => (visibleModeMask & modeBitForMode(mode)) !== 0)) {
        this.cache.delete(descriptor.id);
      }
    }
  }

  private pump(): void {
    while (this.active.size < this.maxConcurrency && this.pending.length > 0) {
      const request = this.pending.shift()!;
      const controller = new AbortController();
      controller.signal.addEventListener("abort", () => undefined, { once: true });
      const activeState = { controller, generation: request.generation, priority: request.priority };
      this.active.set(request.descriptor.id, activeState);
      const requestTrace = this.trace?.isRunning ? this.trace : undefined;
      const requestTraceSessionId = requestTrace?.sessionId;
      const traceForRequest = (): TransportMapPerformanceTrace | undefined =>
        requestTrace &&
        requestTrace.isRunning &&
        requestTrace.sessionId === requestTraceSessionId
          ? requestTrace
          : undefined;
      void this.chunkLoader(request, controller.signal)
        .then((payload) => {
          // Fetch/decode are traced by the loader and worker. Keep this span
          // limited to installing the decoded payload in the bounded cache.
          const materializeTrace = traceForRequest();
          const materializeEventId = materializeTrace?.begin("chunk_materialize", {
            chunkId: request.descriptor.id,
            generation: request.generation,
            priority: request.priority,
          }, request.traceParentId);
          const ownsActiveSlot = this.active.get(request.descriptor.id) === activeState;
          if (ownsActiveSlot) this.active.delete(request.descriptor.id);
          if (!ownsActiveSlot) {
            // A newer generation may have replaced this request for the same
            // chunk after the old request was aborted. Its late result must
            // not evict the replacement from active or populate its cache.
            materializeTrace?.end(materializeEventId, {
              chunkId: request.descriptor.id,
              abandoned: true,
              superseded: true,
            });
            request.reject(new DOMException("Superseded global-map chunk request", "AbortError"));
          } else if (activeState.priority !== "prefetch" && activeState.generation < this.currentGeneration) {
            this.abandoned += 1;
            materializeTrace?.end(materializeEventId, { chunkId: request.descriptor.id, abandoned: true });
            request.reject(new DOMException("Stale global-map generation", "AbortError"));
          } else {
            const bytes = request.descriptor.bytes ?? JSON.stringify(payload).length;
            this.cache.set(request.descriptor.id, { value: payload, bytes });
            this.completed += 1;
            materializeTrace?.end(materializeEventId, {
              chunkId: request.descriptor.id,
              bytes,
              pathCount: payload.paths.length,
              stationCount: 0,
            });
            request.resolve(payload);
          }
          this.pump();
        })
        .catch((error: unknown) => {
          if (this.active.get(request.descriptor.id) === activeState) {
            this.active.delete(request.descriptor.id);
          }
          request.reject(error);
          this.pump();
        });
    }
  }

  private preemptOnePrefetchIfNeeded(): void {
    if (this.active.size < this.maxConcurrency) return;
    const candidate = [...this.active.entries()].find(([, active]) => active.priority === "prefetch");
    if (!candidate) return;
    const [chunkId, active] = candidate;
    active.controller.abort("visible-priority");
    this.active.delete(chunkId);
    // The abort settles asynchronously; a rapid visible retry must not
    // deduplicate onto this already-cancelled prefetch promise.
    this.inFlight.delete(chunkId);
    this.abandoned += 1;
  }
}

function modeBitForMode(mode: GlobalMapMode): number {
  const index = GLOBAL_MAP_MODE_ORDER.indexOf(mode);
  return index < 0 ? 0 : 1 << index;
}

function priorityRank(priority: ChunkPriority): number {
  return { critical: 0, visible: 1, overscan: 2, prefetch: 3 }[priority];
}
