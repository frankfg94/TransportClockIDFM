import type { CameraState } from "../../geo/camera";
import type {
  TransportMapRenderFrame,
  TransportMapRenderScene,
  TransportMapRenderer,
  TransportMapRendererHost,
  TransportMapRendererKind,
  TransportMapRendererMetrics,
} from "../../contracts/renderer";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../../config/globalTransportPlanConfig";
import { TransportMapWorkerPool } from "../../workers/workerPool";
import { DeckGeometryCache } from "./deckGeometryCache";
import {
  deckPathPacketKey,
  WorkerBackedDeckPathPacketCompiler,
  type DeckPathPacketCompiler,
} from "./deckPathPacket";
import {
  TransportMapRenderModelBuilder,
  type TransportMapPathRenderRecord,
  type TransportMapBinaryPathPacket,
} from "../transportMapRenderModel";
import type { TransportMapPerformanceTrace } from "../../performance/transportMapPerformanceTrace";

type PacketRole = "base" | "traffic" | "highlight";
type PacketInput = {
  records: readonly TransportMapPathRenderRecord[];
  role: PacketRole;
  identity?: string;
  batchIndex?: number;
  zoomDependent?: boolean;
};

export interface DeckModelPreparationScheduler {
  schedule(work: () => void): void;
  sliceBudgetMs: number;
  minPaths: number;
  waitForInitialBinary?: boolean;
}

/**
 * Deck strategy for the next experience. It owns prepared data and the host
 * hand-off, but never creates a WebGL context itself: MapLibreDeckSurface
 * attaches the official MapboxOverlay on MapLibre's WebGL2 context.
 */
export class DeckGlRenderer implements TransportMapRenderer {
  readonly kind: TransportMapRendererKind = "webgl2";
  private readonly modelBuilder = new TransportMapRenderModelBuilder();
  private readonly binaryCache = new DeckGeometryCache(
    GLOBAL_TRANSPORT_PLAN_CONFIG.nextMap.binaryCacheMaxBytes,
  );
  private packetCompiler: DeckPathPacketCompiler;
  private readonly pendingPackets = new Map<string, Promise<void>>();
  private readonly recordStats = new WeakMap<readonly TransportMapPathRenderRecord[], { vertexCount: number; inputBytes: number }>();
  /** Failed keys may safely fall back to one complete object-data frame. */
  private readonly failedPacketKeys = new Set<string>();
  /** Keys that have been used by a visible binary PathLayer at least once. */
  private readonly promotedPacketKeys = new Set<string>();
  /** Ready packets held until the first stable frame after interaction. */
  private readonly deferredPacketKeys = new Set<string>();
  private canvas?: HTMLCanvasElement;
  private host?: TransportMapRendererHost;
  private currentFrame?: TransportMapRenderFrame;
  /**
   * Last frame actually handed to Deck. `currentFrame` may be newer while a
   * worker is compiling one or more packets. Keeping the two states separate
   * lets us hold a complete, valid layer set instead of changing a PathLayer
   * from object data to binary data halfway through a hover update.
   */
  private presentedFrame?: TransportMapRenderFrame;
  private disposed = false;
  private binaryCompileMs = 0;
  private binaryCompileBytes = 0;
  private basePacketBuilds = 0;
  private trafficPacketBuilds = 0;
  private stationPacketBuilds = 0;
  private deckLayerRebuilds = 0;
  private deckSetPropsCount = 0;
  private geometryPacketReuses = 0;
  private binaryLayerActivations = 0;
  private binaryLayerFrames = 0;
  private objectFallbackFrames = 0;
  private binaryPromotionDeferredDuringInteraction = 0;
  private pathModelBuildCount = 0;
  private pathModelReuseCount = 0;
  private pathModelBuildMs = 0;
  private pathModelWorstMs = 0;
  private metrics: TransportMapRendererMetrics;
  private packetGeneration = 0;
  private readonly preparationScheduler?: DeckModelPreparationScheduler;
  private preparationTask?: Generator<void, TransportMapRenderFrame["model"]>;
  private latestRequest?: Pick<TransportMapRenderFrame, "camera" | "scene">;
  private preparedInputs?: Pick<TransportMapRenderFrame, "camera" | "scene">;
  private modelPreparationSlices = 0;
  private modelPreparationCpuMs = 0;
  private modelPreparationWorstSliceMs = 0;
  private performanceTrace?: TransportMapPerformanceTrace;
  private readonly tracedBinaryCacheHits = new Set<string>();
  private readonly tracedBinaryCacheMisses = new Set<string>();
  private tracedBinaryCacheSessionId?: number;

  constructor(
    workerPool?: TransportMapWorkerPool,
    packetCompiler?: DeckPathPacketCompiler,
    preparationScheduler?: DeckModelPreparationScheduler,
  ) {
    this.packetCompiler = packetCompiler ?? new WorkerBackedDeckPathPacketCompiler(workerPool);
    this.metrics = this.createMetrics();
    this.preparationScheduler = preparationScheduler ?? browserModelPreparationScheduler();
  }

  mount(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    canvas.dataset.transportRenderer = "deckgl-webgl2";
    canvas.style.background = "transparent";
    canvas.style.touchAction = "none";
  }

  resize(widthCssPx: number, heightCssPx: number, pixelRatio: number): void {
    if (this.canvas) {
      this.canvas.style.width = `${Math.max(1, widthCssPx)}px`;
      this.canvas.style.height = `${Math.max(1, heightCssPx)}px`;
    }
    this.host?.resize(widthCssPx, heightCssPx, pixelRatio);
  }

  /** Called by the shared data source once its existing worker pool is ready. */
  attachWorkerPool(workerPool: TransportMapWorkerPool | undefined): void {
    this.packetCompiler = new WorkerBackedDeckPathPacketCompiler(workerPool);
  }

  setPerformanceTrace(trace: TransportMapPerformanceTrace | undefined): void {
    this.performanceTrace = trace;
    this.tracedBinaryCacheSessionId = undefined;
    this.tracedBinaryCacheHits.clear();
    this.tracedBinaryCacheMisses.clear();
  }

  attachHost(host: TransportMapRendererHost): void {
    this.host = host;
    if (this.presentedFrame) {
      this.presentToHost(this.presentedFrame);
    } else if (this.currentFrame) {
      this.presentToHost(this.currentFrame);
    }
  }

  detachHost(host?: TransportMapRendererHost): void {
    if (!host || host === this.host) this.host = undefined;
  }

  render(camera: CameraState, scene: TransportMapRenderScene): void {
    if (this.disposed) return;
    this.latestRequest = { camera, scene };
    if (this.preparationTask) {
      this.presentWhilePreparing(camera, scene);
      return;
    }
    const previous = this.preparedInputs;
    if (this.preparationScheduler && scene.paths.length >= this.preparationScheduler.minPaths
      && (!previous || !samePathPreparationInputs(previous.camera, previous.scene, camera, scene, this.modelBuilder.hasZoomDependentPaths))) {
      this.prepareModel(camera, scene);
      this.presentWhilePreparing(camera, scene);
      return;
    }
    this.renderNow(camera, scene);
  }

  private prepareModel(camera: CameraState, scene: TransportMapRenderScene): void {
    const task = this.modelBuilder.buildCooperatively(camera, scene, this.preparationScheduler!.sliceBudgetMs);
    this.preparationTask = task;
    const trace = this.activeTrace;
    const sessionId = trace?.sessionId;
    const event = trace?.begin("render_model_prepare", { pathCount: scene.paths.length });
    const run = () => {
      if (this.disposed || this.preparationTask !== task) return;
      const activeTrace = this.activeTrace;
      const parentId = activeTrace === trace && trace?.sessionId === sessionId ? event : undefined;
      const slice = activeTrace?.begin("render_model_prepare_slice", { pathCount: scene.paths.length }, parentId);
      const startedAt = nowMs();
      let step: IteratorResult<void, TransportMapRenderFrame["model"]>;
      try {
        step = task.next();
      } catch (error) {
        this.preparationTask = undefined;
        activeTrace?.end(slice, { failed: true });
        if (parentId) trace?.end(event, { failed: true });
        throw error;
      }
      const durationMs = nowMs() - startedAt;
      this.modelPreparationSlices += 1;
      this.modelPreparationCpuMs += durationMs;
      this.modelPreparationWorstSliceMs = Math.max(this.modelPreparationWorstSliceMs, durationMs);
      activeTrace?.end(slice, { completed: step.done === true });
      if (!step.done) {
        this.preparationScheduler!.schedule(run);
        return;
      }
      this.preparationTask = undefined;
      const latest = this.latestRequest!;
      const current = samePathPreparationInputs(camera, scene, latest.camera, latest.scene, this.modelBuilder.hasZoomDependentPaths);
      if (parentId) trace?.end(event, { superseded: !current, pathCount: step.value.pathCount });
      if (current) {
        // The completed bundle is now cached. Apply the newest quarter zoom,
        // camera and marker state without revisiting all stable road paths.
        this.renderNow(latest.camera, latest.scene);
      } else {
        // Only one task can own the builder. Never publish obsolete geometry
        // or run a second mutable builder task alongside the first one.
        this.render(latest.camera, latest.scene);
      }
    };
    this.preparationScheduler!.schedule(run);
  }

  private presentWhilePreparing(camera: CameraState, scene: TransportMapRenderScene): void {
    this.activeTrace?.recordRendererFrame();
    const startedAt = nowMs();
    if (this.presentedFrame) {
      const frame = { ...this.presentedFrame, camera, scene: { ...this.presentedFrame.scene,
        interactionActive: scene.interactionActive, continuousRendering: scene.continuousRendering } };
      if (this.currentFrame) this.currentFrame = { ...this.currentFrame, camera };
      this.presentToHost(frame);
    }
    this.metrics = { ...this.metrics, renderMs: Number((nowMs() - startedAt).toFixed(3)),
      renderSequence: (this.metrics.renderSequence ?? 0) + 1 };
  }

  private renderNow(camera: CameraState, scene: TransportMapRenderScene): void {
    if (this.disposed) return;
    this.activeTrace?.recordRendererFrame();
    const startedAt = nowMs();
    const trace = this.activeTrace;
    const previousModel = this.currentFrame?.model;
    const modelStartedAt = nowMs();
    const model = this.modelBuilder.build(camera, scene);
    this.preparedInputs = { camera, scene };
    const modelBuildMs = nowMs() - modelStartedAt;
    const pathModelReused = Boolean(
      previousModel &&
      previousModel.basePaths === model.basePaths &&
      previousModel.trafficPaths === model.trafficPaths &&
      previousModel.highlightPaths === model.highlightPaths,
    );
    if (pathModelReused) {
      this.pathModelReuseCount += 1;
    } else {
      this.pathModelBuildCount += 1;
      this.pathModelBuildMs += modelBuildMs;
      this.pathModelWorstMs = Math.max(this.pathModelWorstMs, modelBuildMs);
    }
    trace?.recordDuration("render_model_build", modelBuildMs, {
      reused: model === previousModel,
      pathModelReused,
      sceneVersion: model.sceneVersion,
      geometryVersion: model.geometryVersion,
      pathCount: model.pathCount,
      stationCount: model.stations.length,
      vertexCount: model.vertexCount,
      preparedPathCache: this.modelBuilder.pathCacheMetrics(),
    });
    if (model !== previousModel) {
      this.activeTrace?.recordDuration("scene_rebuild", nowMs() - startedAt, {
        reason: !previousModel
          ? "initial"
          : previousModel.geometryVersion !== model.geometryVersion
            ? "geometry"
            : previousModel.sceneVersion !== model.sceneVersion
              ? "scene"
            : previousModel.stations !== model.stations
              ? "station_visibility"
              : "geometry_or_filters",
        sceneVersion: model.sceneVersion,
        pathCount: model.pathCount,
        stationCount: model.stations.length,
        vertexCount: model.vertexCount,
      });
      if (previousModel?.stations !== model.stations) {
        this.activeTrace?.recordDuration("station_visibility_rebuild", nowMs() - startedAt, {
          sceneVersion: model.sceneVersion,
          stationCount: model.stations.length,
          zoom: camera.zoom,
        });
      }
    }
    if (!previousModel || previousModel.stations !== model.stations) this.stationPacketBuilds += 1;

    // Camera/marker frames must not scan thousands of unchanged path records
    // or touch every LRU entry just to rediscover the already published packets.
    const traceSessionChanged = trace && this.tracedBinaryCacheSessionId !== trace.sessionId;
    const resolvedPackets = pathModelReused && !traceSessionChanged && this.currentFrame && this.arePathPacketsReady(model, this.currentFrame.binaryPackets)
      ? this.currentFrame.binaryPackets
      : this.resolvePackets(model, scene.interactionActive === true && !scene.continuousRendering, camera.zoom, true);
    const binaryPackets = this.arePathPacketsReady(model, resolvedPackets) ? resolvedPackets : undefined;
    const frame: TransportMapRenderFrame = { camera, scene, model, binaryPackets };
    this.currentFrame = frame;
    this.metrics = {
      ...this.metrics,
      drawCalls: countDeckLayers(model),
      visiblePathCount: model.pathCount,
      visibleStationCount: model.stations.length,
      visibleVertexCount: model.vertexCount,
      renderMs: Number((nowMs() - startedAt).toFixed(3)),
      renderSequence: (this.metrics.renderSequence ?? 0) + 1,
      cacheBytes: this.binaryCache.metrics().bytes,
      binaryCacheBytes: this.binaryCache.metrics().bytes,
      binaryCacheEntries: this.binaryCache.metrics().entries,
      binaryCacheHits: this.binaryCache.metrics().hits,
      binaryCacheMisses: this.binaryCache.metrics().misses,
      binaryCacheEvictions: this.binaryCache.metrics().evictions,
      binaryCompileMs: Number(this.binaryCompileMs.toFixed(3)),
      binaryCompileBytes: this.binaryCompileBytes,
      binaryCompileInProgress: this.pendingPackets.size,
      basePacketBuilds: this.basePacketBuilds,
      trafficPacketBuilds: this.trafficPacketBuilds,
      stationPacketBuilds: this.stationPacketBuilds,
      deckLayerRebuilds: this.deckLayerRebuilds,
      geometryPacketReuses: this.geometryPacketReuses,
      deckSetPropsCount: this.deckSetPropsCount,
      binaryLayerActivations: this.binaryLayerActivations,
      binaryLayerFrames: this.binaryLayerFrames,
      objectFallbackFrames: this.objectFallbackFrames,
      binaryPromotionDeferredDuringInteraction: this.binaryPromotionDeferredDuringInteraction,
      pathModelBuildCount: this.pathModelBuildCount,
      pathModelReuseCount: this.pathModelReuseCount,
      pathModelBuildMs: Number(this.pathModelBuildMs.toFixed(3)),
      pathModelWorstMs: Number(this.pathModelWorstMs.toFixed(3)),
    };
    if (this.preparationScheduler?.waitForInitialBinary && !binaryPackets
      && !scene.allowGeometrySwapDuringInteraction && !this.presentedFrame?.model.pathCount) {
      // The basemap is already visible. Compile the first transport set once,
      // instead of initializing object GPU buffers and replacing them with
      // incompatible binary strides immediately after the lines appear.
      if (this.presentedFrame) this.presentToHost({ ...this.presentedFrame, camera, scene });
    } else if (this.shouldHoldForAtomicBinarySwap(frame)) {
      // Camera updates still flow through the presenter, but the layer model
      // stays untouched until every path packet for the new frame is ready.
      // This prevents Deck from reconciling object records and binary
      // attributes in the middle of a rapid hover sequence.
      this.presentToHost({
        ...this.presentedFrame!,
        camera,
        scene,
      });
    } else {
      this.presentToHost(frame);
    }
  }

  getMetrics(): TransportMapRendererMetrics {
    const cache = this.binaryCache.metrics();
    const presentationMetrics = this.host?.getPresentationMetrics?.();
    return {
      ...this.metrics,
      cacheBytes: cache.bytes,
      binaryCacheBytes: cache.bytes,
      binaryCacheEntries: cache.entries,
      binaryCacheHits: cache.hits,
      binaryCacheMisses: cache.misses,
      binaryCacheEvictions: cache.evictions,
      binaryCompileMs: Number(this.binaryCompileMs.toFixed(3)),
      binaryCompileBytes: this.binaryCompileBytes,
      binaryCompileInProgress: this.pendingPackets.size,
      basePacketBuilds: this.basePacketBuilds,
      trafficPacketBuilds: this.trafficPacketBuilds,
      stationPacketBuilds: this.stationPacketBuilds,
      deckLayerRebuilds: this.deckLayerRebuilds,
      geometryPacketReuses: this.geometryPacketReuses,
      deckSetPropsCount: this.deckSetPropsCount,
      binaryLayerActivations: this.binaryLayerActivations,
      binaryLayerFrames: this.binaryLayerFrames,
      objectFallbackFrames: this.objectFallbackFrames,
      binaryPromotionDeferredDuringInteraction: this.binaryPromotionDeferredDuringInteraction,
      pathModelBuildCount: this.pathModelBuildCount,
      pathModelReuseCount: this.pathModelReuseCount,
      pathModelBuildMs: Number(this.pathModelBuildMs.toFixed(3)),
      pathModelWorstMs: Number(this.pathModelWorstMs.toFixed(3)),
      modelPreparationSlices: this.modelPreparationSlices,
      modelPreparationCpuMs: Number(this.modelPreparationCpuMs.toFixed(3)),
      modelPreparationWorstSliceMs: Number(this.modelPreparationWorstSliceMs.toFixed(3)),
      deck: presentationMetrics?.deck,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.preparationTask?.return(undefined as never);
    this.preparationTask = undefined;
    this.latestRequest = undefined;
    this.preparedInputs = undefined;
    this.pendingPackets.clear();
    this.failedPacketKeys.clear();
    this.promotedPacketKeys.clear();
    this.deferredPacketKeys.clear();
    this.tracedBinaryCacheHits.clear();
    this.tracedBinaryCacheMisses.clear();
    this.tracedBinaryCacheSessionId = undefined;
    this.modelBuilder.dispose();
    this.binaryCache.clear();
    this.currentFrame = undefined;
    this.presentedFrame = undefined;
    this.host = undefined;
    this.canvas = undefined;
  }

  private ensurePacket(
    records: Parameters<typeof deckPathPacketKey>[0],
    role: PacketRole,
    interactionActive: boolean,
    zoom: number,
    stableIdentity?: string,
    zoomDependent?: boolean,
  ): TransportMapBinaryPathPacket | undefined {
    if (records.length === 0) return undefined;
    const { vertexCount, inputBytes } = this.getRecordStats(records);
    const key = this.buildPacketKey(records, role, stableIdentity, vertexCount);
    const trace = this.activeTrace;
    if (trace && this.tracedBinaryCacheSessionId !== trace.sessionId) {
      this.tracedBinaryCacheSessionId = trace.sessionId;
      this.tracedBinaryCacheHits.clear();
      this.tracedBinaryCacheMisses.clear();
    }
    const cached = this.binaryCache.get(key);
    if (cached) {
      if (trace && !this.tracedBinaryCacheHits.has(key)) {
        this.tracedBinaryCacheHits.add(key);
        trace.instant("binary_cache_hit", {
          role,
          cacheKey: traceCacheKey(key),
          cacheKeyLength: key.length,
          pathCount: cached.pathCount,
          vertexCount: cached.positions.length / 2,
          bytes: cached.bytes,
          zoom,
        });
      }
      if (interactionActive && !this.promotedPacketKeys.has(key)) {
        this.deferPromotion(key);
        return undefined;
      }
      this.promotePacket(key);
      this.geometryPacketReuses += 1;
      return cached;
    }
    if (this.pendingPackets.has(key)) return undefined;

    if (trace && !this.tracedBinaryCacheMisses.has(key)) {
      this.tracedBinaryCacheMisses.add(key);
      trace.instant("binary_cache_miss", {
        role,
        cacheKey: traceCacheKey(key),
        cacheKeyLength: key.length,
        pathCount: records.length,
        vertexCount,
        zoom,
      });
    }

    // A cache eviction/source change starts a fresh promotion lifecycle for
    // this geometry key. A packet that was already promoted remains promoted
    // only while it is actually retained by the bounded cache.
    this.promotedPacketKeys.delete(key);
    this.deferredPacketKeys.delete(key);
    this.failedPacketKeys.delete(key);

    // Compilation is asynchronous. The host retains its complete geometry
    // until the current packet set can be promoted together. The ordinary
    // records remain available for the synchronous/error fallback.
    const startedAt = nowMs();
    const traceSessionId = trace?.sessionId;
    const traceForSession = trace
      ? (): TransportMapPerformanceTrace | undefined =>
          trace.isRunning && trace.sessionId === traceSessionId ? trace : undefined
      : undefined;
    const compileTraceId = trace?.begin("binary_compile", {
      role,
      cacheKey: traceCacheKey(key),
      cacheKeyLength: key.length,
      pathCount: records.length,
      vertexCount,
      inputBytes,
      zoom,
      execution: this.packetCompiler.executionContext ?? "main-thread",
      zoomDependent,
    });
    const pending = Promise.resolve()
      .then(() => {
        const sessionTrace = traceForSession?.();
        const dispatch = sessionTrace?.begin("binary_compile_dispatch", { role, pathCount: records.length, inputBytes }, compileTraceId);
        try {
          return this.packetCompiler.compile(records, key, ++this.packetGeneration, compileTraceId);
        } finally {
          sessionTrace?.end(dispatch);
        }
      })
      .then((packet) => {
        const sessionTrace = traceForSession?.();
        if (this.disposed) {
          sessionTrace?.end(compileTraceId, {
            role,
            cacheKey: traceCacheKey(key),
            inputBytes,
            cancelled: true,
            disposed: true,
          });
          return;
        }
        this.failedPacketKeys.delete(key);
        const cacheBefore = this.binaryCache.metrics();
        this.binaryCache.set(packet);
        const cacheAfter = this.binaryCache.metrics();
        this.binaryCompileMs += nowMs() - startedAt;
        this.binaryCompileBytes += packet.bytes;
        sessionTrace?.end(compileTraceId, {
          role,
          cacheKey: traceCacheKey(key),
          outputBytes: packet.bytes,
          pathCount: packet.pathCount,
          vertexCount: packet.positions.length / 2,
          executionMs: nowMs() - startedAt,
        });
        sessionTrace?.instant("binary_packet_ready", {
          role,
          cacheKey: traceCacheKey(key),
          pathCount: packet.pathCount,
          vertexCount: packet.positions.length / 2,
          inputBytes,
          outputBytes: packet.bytes,
        });
        if (cacheAfter.evictions > cacheBefore.evictions) {
          sessionTrace?.instant("binary_cache_evict", {
            role,
            evictions: cacheAfter.evictions - cacheBefore.evictions,
            cacheBytes: cacheAfter.bytes,
            cacheEntries: cacheAfter.entries,
          });
        }
        if (role === "base") this.basePacketBuilds += 1;
        else if (role === "traffic") this.trafficPacketBuilds += 1;
        if (this.currentFrame?.scene.interactionActive === true && !this.currentFrame.scene.continuousRendering) {
          this.deferPromotion(key);
        } else if (this.currentFrame) {
          // The current frame may have moved to another geometry key while
          // this packet was compiling. The presenter checks the current model
          // and promotes only packets that belong to that frame.
          this.presentCurrentFrameWithCachedPackets();
        }
      })
      .catch(() => {
        const sessionTrace = traceForSession?.();
        sessionTrace?.end(compileTraceId, {
          role,
          cacheKey: traceCacheKey(key),
          inputBytes,
          failed: true,
          executionMs: nowMs() - startedAt,
        });
        this.failedPacketKeys.add(key);
        // A compiler failure must never leave the renderer holding an older
        // binary frame forever. If this key belongs to the current scene,
        // publish all current paths as object data in one atomic frame; a
        // later retry can promote the complete packet set again.
        this.presentCurrentFrameWithObjectFallback(key);
      })
      .finally(() => {
        this.pendingPackets.delete(key);
      });
    this.pendingPackets.set(key, pending);
    return undefined;
  }

  private buildPacketKey(
    records: readonly TransportMapPathRenderRecord[],
    role: PacketRole,
    stableIdentity?: string,
    vertexCount?: number,
  ): string {
    const trace = this.activeTrace;
    const startedAt = trace ? nowMs() : 0;
    const key = deckPathPacketKey(records, role, stableIdentity);
    trace?.recordDuration("binary_cache_key_build", nowMs() - startedAt, {
      role,
      keyLength: key.length,
      pathCount: records.length,
      vertexCount: vertexCount ?? this.getRecordStats(records).vertexCount,
    });
    return key;
  }

  private getRecordStats(records: readonly TransportMapPathRenderRecord[]) {
    let stats = this.recordStats.get(records);
    if (!stats) {
      const inputBytes = records.reduce((sum, record) => sum + record.positions.byteLength, 0);
      stats = { inputBytes, vertexCount: inputBytes / Float64Array.BYTES_PER_ELEMENT / 2 };
      this.recordStats.set(records, stats);
    }
    return stats;
  }

  private packetInputs(model: TransportMapRenderFrame["model"]): PacketInput[] {
    return [
      ...(model.basePathBatches
        ? model.basePathBatches.map((batch, batchIndex) => ({ records: batch.records, role: "base" as const,
            identity: batch.identity, batchIndex, zoomDependent: batch.zoomDependent }))
        : [{ records: model.basePaths, role: "base" as const, identity: model.basePathIdentity ?? model.pathIdentity }]),
      { records: model.trafficPaths, role: "traffic", identity: model.trafficPathIdentity ?? model.pathIdentity },
      { records: model.highlightPaths, role: "highlight", identity: model.highlightPathIdentity ?? model.pathIdentity },
    ];
  }

  private resolvePackets(model: TransportMapRenderFrame["model"], defer: boolean, zoom: number, compileMissing: boolean): NonNullable<TransportMapRenderFrame["binaryPackets"]> {
    const packets: NonNullable<TransportMapRenderFrame["binaryPackets"]> = {};
    const baseBatches: (TransportMapBinaryPathPacket | undefined)[] | undefined = model.basePathBatches ? [] : undefined;
    for (const input of this.packetInputs(model)) {
      const packet = input.records.length === 0 ? undefined : compileMissing
        ? this.ensurePacket(input.records, input.role, defer, zoom, input.identity, input.zoomDependent)
        : this.binaryCache.get(this.buildPacketKey(input.records, input.role, input.identity));
      if (input.batchIndex !== undefined) baseBatches![input.batchIndex] = packet;
      else packets[input.role] = packet;
    }
    if (baseBatches) packets.baseBatches = baseBatches;
    return packets;
  }

  private presentCurrentFrameWithCachedPackets(): void {
    const frame = this.currentFrame;
    if (!frame || (frame.scene.interactionActive === true && !frame.scene.continuousRendering)) return;
    const binaryPackets = this.resolvePackets(frame.model, false, frame.camera.zoom, false);
    // Publish a complete packet set atomically. A PathLayer must see either
    // its complete object-record data or its complete binary packet; mixing
    // the two while Deck is reconciling rapid hover updates can leave stale
    // tesselator state attached to the new geometry.
    if (!this.arePathPacketsReady(frame.model, binaryPackets)) return;
    for (const input of this.packetInputs(frame.model)) {
      if (input.records.length) this.promotePacket(this.buildPacketKey(input.records, input.role, input.identity));
    }
    const nextFrame = { ...frame, binaryPackets };
    this.currentFrame = nextFrame;
    this.presentToHost(nextFrame);
  }

  private presentCurrentFrameWithObjectFallback(failedKey: string): void {
    const frame = this.currentFrame;
    if (!frame || frame.scene.interactionActive === true) return;
    const currentKeys = this.packetInputs(frame.model).filter(input => input.records.length)
      .map(input => this.buildPacketKey(input.records, input.role, input.identity));
    if (!currentKeys.includes(failedKey)) return;
    const nextFrame: TransportMapRenderFrame = {
      ...frame,
      binaryPackets: undefined,
    };
    this.currentFrame = nextFrame;
    this.presentToHost(nextFrame);
  }

  private shouldHoldForAtomicBinarySwap(frame: TransportMapRenderFrame): boolean {
    const previous = this.presentedFrame;
    if (!previous || !this.hasAnyBinaryPathPacket(previous)) return false;
    if (frame.scene.allowGeometrySwapDuringInteraction) return false;
    return !this.arePathPacketsReady(frame.model, frame.binaryPackets);
  }

  private arePathPacketsReady(
    model: TransportMapRenderFrame["model"],
    packets: TransportMapRenderFrame["binaryPackets"],
  ): boolean {
    return (
      (model.basePathBatches
        ? packets?.baseBatches?.length === model.basePathBatches.length && packets.baseBatches.every(Boolean)
        : model.basePaths.length === 0 || Boolean(packets?.base)) &&
      (model.trafficPaths.length === 0 || Boolean(packets?.traffic)) &&
      (model.highlightPaths.length === 0 || Boolean(packets?.highlight))
    );
  }

  private hasAnyBinaryPathPacket(frame: TransportMapRenderFrame): boolean {
    return Boolean(
      frame.binaryPackets?.base ||
      frame.binaryPackets?.baseBatches?.some(Boolean) ||
      frame.binaryPackets?.traffic ||
      frame.binaryPackets?.highlight,
    );
  }

  private presentToHost(frame: TransportMapRenderFrame): void {
    this.presentedFrame = frame;
    if (!this.host) return;
    const pathInputs = this.packetInputs(frame.model).filter(input => input.records.length);
    const hasPathRecords = pathInputs.length > 0;
    const hasBinaryPathLayer = pathInputs.some(input => Boolean(input.batchIndex !== undefined
      ? frame.binaryPackets?.baseBatches?.[input.batchIndex] : frame.binaryPackets?.[input.role]));
    const hasObjectFallbackPathLayer = pathInputs.some(input => !(input.batchIndex !== undefined
      ? frame.binaryPackets?.baseBatches?.[input.batchIndex] : frame.binaryPackets?.[input.role]));
    if (hasPathRecords && hasBinaryPathLayer) this.binaryLayerFrames += 1;
    if (hasPathRecords && hasObjectFallbackPathLayer) this.objectFallbackFrames += 1;
    this.host.present(frame);
    const presentationMetrics = this.host.getPresentationMetrics?.();
    if (presentationMetrics) {
      this.deckLayerRebuilds = presentationMetrics.layerRebuilds;
      this.deckSetPropsCount = presentationMetrics.setPropsCount;
      this.metrics.deck = presentationMetrics.deck;
    } else {
      this.deckLayerRebuilds += 1;
      this.deckSetPropsCount += 1;
    }
  }

  private promotePacket(key: string): void {
    this.deferredPacketKeys.delete(key);
    if (this.promotedPacketKeys.has(key)) return;
    this.promotedPacketKeys.add(key);
    this.binaryLayerActivations += 1;
    this.activeTrace?.instant("binary_packet_promote", {
      cacheKey: traceCacheKey(key),
      cacheKeyLength: key.length,
      activationCount: this.binaryLayerActivations,
    });
  }

  private deferPromotion(key: string): void {
    if (this.deferredPacketKeys.has(key) || this.promotedPacketKeys.has(key)) return;
    this.deferredPacketKeys.add(key);
    this.binaryPromotionDeferredDuringInteraction += 1;
  }

  private get activeTrace(): TransportMapPerformanceTrace | undefined {
    return this.performanceTrace?.isRunning ? this.performanceTrace : undefined;
  }

  private createMetrics(): TransportMapRendererMetrics {
    return {
      renderer: this.kind,
      drawCalls: 0,
      visiblePathCount: 0,
      visibleStationCount: 0,
      renderMs: 0,
      cacheBytes: 0,
      focusedLineLiveRedraw: false,
      pathCacheCaptureCount: 0,
      pathCacheCaptureMs: 0,
      pathCacheCapturedBytes: 0,
      binaryLayerActivations: 0,
      binaryLayerFrames: 0,
      objectFallbackFrames: 0,
      binaryPromotionDeferredDuringInteraction: 0,
      pathModelBuildCount: 0,
      pathModelReuseCount: 0,
      pathModelBuildMs: 0,
      pathModelWorstMs: 0,
      binaryCompileInProgress: 0,
    };
  }
}

function traceCacheKey(key: string): string {
  if (key.length <= 160) return key;
  return `${key.slice(0, 80)}…${key.slice(-40)}`;
}

function countDeckLayers(model: TransportMapRenderFrame["model"]): number {
  return (model.basePathBatches?.length ?? (model.basePaths.length ? 1 : 0)) + [model.trafficPaths, model.highlightPaths, model.stations, model.quays, model.entrances, model.labels]
    .filter((items) => items.length > 0).length;
}

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function browserModelPreparationScheduler(): DeckModelPreparationScheduler | undefined {
  if (typeof window === "undefined") return undefined;
  return { sliceBudgetMs: 2, minPaths: 256, waitForInitialBinary: true, schedule(work) {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(work, { timeout: 100 });
    else window.setTimeout(work, 0);
  } };
}

function samePathPreparationInputs(leftCamera: CameraState, left: TransportMapRenderScene, rightCamera: CameraState, right: TransportMapRenderScene, zoomDependent: boolean): boolean {
  const widthThreshold = GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.overviewHeavyLineWidthMaxZoom;
  return left.paths === right.paths && left.lines === right.lines && left.stations === right.stations
    && left.visibleModeMask === right.visibleModeMask && left.activeLineId === right.activeLineId
    && left.hoveredLineId === right.hoveredLineId && left.trafficPathSpans === right.trafficPathSpans
    && (!zoomDependent || Math.ceil(leftCamera.zoom * 4) === Math.ceil(rightCamera.zoom * 4))
    && (leftCamera.zoom < widthThreshold) === (rightCamera.zoom < widthThreshold)
    && sameIdSequence(left.ghostLineIds, right.ghostLineIds)
    && sameIdSequence(left.interruptionLineIds, right.interruptionLineIds)
    && sameIdSequence(left.disturbanceLineIds, right.disturbanceLineIds);
}

function sameIdSequence(left?: readonly string[], right?: readonly string[]): boolean {
  if (left === right) return true;
  return (left?.length ?? 0) === (right?.length ?? 0) && (left ?? []).every((id, index) => id === right?.[index]);
}
