import type {
  GlobalMapCatalog,
  GlobalMapBounds,
  GlobalMapChunkDescriptor,
  GlobalMapChunkPayload,
  GlobalMapLinePaletteDocument,
  GlobalMapManifest,
  GlobalMapMode,
  GlobalMapPath,
  GlobalMapStation,
} from "../contracts/manifest";
import { GLOBAL_MAP_MODE_ORDER } from "../contracts/manifest";
import type { TransportMapNetwork, TransportMapViewportResult } from "../contracts/network";
import type { CameraState } from "../geo/camera";
import { boundsIntersect, expandBounds, visibleWorldBounds } from "../geo/coordinateKernel";
import { selectLodForZoom } from "../geo/lod";
import { buildStationSpatialIndex, PackedSpatialIndex } from "../spatial/packedIndex";
import { queryStationsWithinRadius } from "../spatial/radiusQuery";
import {
  assertCatalogPayload,
  assertChunkPayload,
  GlobalMapAssetLoader,
  decodeBootstrap,
  decodeRegionalPaths,
  parseCatalogPayload,
  parseChunkPayload,
} from "./assetLoader";
import { TransportMapChunkScheduler, type ChunkRequest } from "./chunkScheduler";
import { TransportMapWorkerPool } from "../workers/workerPool";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../config/globalTransportPlanConfig";
import { filterPathsByBounds } from "./filterPathsByBounds";
import type {
  TransportMapPerformanceTrace,
  TransportMapTraceEventId,
} from "../performance/transportMapPerformanceTrace";

export interface TransportMapDataSourceOptions {
  loader?: GlobalMapAssetLoader;
  maxChunkConcurrency?: number;
  decodedChunkCacheMaxEntries?: number;
  decodedChunkCacheMaxBytes?: number;
  /** Keep the next vector overview on one complete regional geometry set. */
  useRegionalOverview?: boolean;
  trace?: TransportMapPerformanceTrace;
}

export interface TransportMapDataSourceMetrics {
  manifestLoaded: boolean;
  catalogLoaded: boolean;
  lastGeneration: number;
  lastChunkCount: number;
  bytes: number;
  decodeTimeMs: number;
  workerTimeMs: number;
  workerCount: number;
  filterPathsLocal: TransportMapFilterPathsLocalMetrics;
  prefetchRequests: number;
  prefetchHits: number;
  prefetchUsefulHits: number;
  prefetchCancelled: number;
  prefetchBytes: number;
  prefetchCompileMs: number;
  workerPool: ReturnType<TransportMapWorkerPool["getMetrics"]>;
  cache: ReturnType<TransportMapChunkScheduler["metrics"]>;
}

export interface TransportMapFilterPathsLocalMetrics {
  calls: number;
  totalMs: number;
  maxMs: number;
  inputPathCount: number;
  outputPathCount: number;
}

export interface TransportMapPrefetchOptions {
  maxChunks?: number;
  maxBytes?: number;
  overscanRatio?: number;
  generation?: number;
}

export class TransportMapDataSource {
  private manifest?: GlobalMapManifest;
  private bootstrapPayload?: Awaited<ReturnType<GlobalMapAssetLoader["loadBootstrapPayload"]>>;
  private linePalette?: GlobalMapLinePaletteDocument;
  private catalog?: GlobalMapCatalog;
  private scheduler?: TransportMapChunkScheduler;
  private network?: TransportMapNetwork;
  private networkVersion = 0;
  private lastGeneration = 0;
  private lastChunkCount = 0;
  private bytes = 0;
  private stationIndex?: PackedSpatialIndex;
  private decodeTimeMs = 0;
  private workerTimeMs = 0;
  private filterPathsLocal: TransportMapFilterPathsLocalMetrics = createEmptyFilterPathsLocalMetrics();
  private readonly workerPool?: TransportMapWorkerPool;
  private catalogPromise?: Promise<TransportMapNetwork>;
  private regionalCorePaths?: GlobalMapPath[];
  private regionalBusPaths?: GlobalMapPath[];
  private regionalBikePaths?: GlobalMapPath[];
  private regionalCorePromise?: Promise<GlobalMapPath[]>;
  private regionalBusPromise?: Promise<GlobalMapPath[]>;
  private regionalBikePromise?: Promise<GlobalMapPath[]>;
  private readonly focusedViewportResultCache = new Map<string, TransportMapViewportResult>();
  private lifecycleToken = 0;
  private prefetchEpoch = 0;
  private prefetchedChunkIds = new Set<string>();
  private prefetchRequests = 0;
  private prefetchHits = 0;
  private prefetchUsefulHits = 0;
  private prefetchCancelled = 0;
  private prefetchBytes = 0;
  private prefetchCompileMs = 0;
  private lastTraceLodLevel?: number;
  private lastTraceDetailed?: boolean;
  private lastTracePathCount = 0;
  private lastTraceStationCount = 0;
  private lastTraceSessionId?: number;

  constructor(private readonly options: TransportMapDataSourceOptions = {}) {
    this.workerPool = createWorkerPool(options.trace);
  }

  async initialize(signal?: AbortSignal): Promise<TransportMapNetwork> {
    const lifecycleToken = ++this.lifecycleToken;
    const loader = this.options.loader ?? new GlobalMapAssetLoader({ trace: this.options.trace });
    const manifest = await loader.loadManifest(signal);
    if (lifecycleToken !== this.lifecycleToken) throw createLifecycleAbortError();
    const [bootstrapPayload, linePalette] = await Promise.all([
      loader.loadBootstrapPayload(manifest, signal),
      loader.loadLinePalette(manifest, signal),
    ]);
    if (lifecycleToken !== this.lifecycleToken) throw createLifecycleAbortError();
    this.manifest = manifest;
    this.bootstrapPayload = bootstrapPayload;
    this.linePalette = linePalette;
    const decodeStartedAt = nowMs();
    const network = decodeBootstrap(
      bootstrapPayload,
      manifest,
      undefined,
      linePalette,
    );
    this.network = network;
    this.decodeTimeMs += nowMs() - decodeStartedAt;
    this.stationIndex = buildStationSpatialIndex(network.stations);
    this.scheduler = new TransportMapChunkScheduler(
      loader,
      manifest,
      this.options.maxChunkConcurrency ?? resolveDefaultConcurrency(),
      this.workerPool
        ? (request, signal) =>
            request.descriptor.bytes !== undefined && request.descriptor.bytes >= 1_000_000
              ? this.loadChunkWithWorker(loader, manifest, request, signal)
              : loader.loadChunk(manifest, request.descriptor, signal, request.traceParentId)
        : undefined,
      {
        maxEntries: this.options.decodedChunkCacheMaxEntries ?? 12,
        maxBytes: this.options.decodedChunkCacheMaxBytes ?? 48 * 1024 * 1024,
      },
      this.options.trace,
    );
    this.networkVersion += 1;
    return network;
  }

  getManifest(): GlobalMapManifest {
    if (!this.manifest) throw new Error("Global map data source is not initialized");
    return this.manifest;
  }

  getNetwork(): TransportMapNetwork {
    if (!this.network) throw new Error("Global map data source is not initialized");
    return this.network;
  }

  getNetworkVersion(): number {
    return this.networkVersion;
  }

  /**
   * Return the catalogue station index used by synchronous map lookups.
   * Route overlays use it to narrow a boundary lookup before doing the
   * name/line matching work on the main thread.
   */
  getStationSpatialIndex(): PackedSpatialIndex | undefined {
    return this.stationIndex;
  }

  /** Shared worker boundary for renderer-side binary preparation. */
  getWorkerPool(): TransportMapWorkerPool | undefined {
    return this.workerPool;
  }

  async ensureCatalog(signal?: AbortSignal): Promise<TransportMapNetwork> {
    if (!this.manifest || !this.network)
      throw new Error("Global map data source is not initialized");
    if (this.catalog) return this.network;
    if (this.catalogPromise) return this.catalogPromise;
    const lifecycleToken = this.lifecycleToken;
    const manifest = this.manifest;
    const bootstrapPayload = this.bootstrapPayload;
    const linePalette = this.linePalette;
    const network = this.network;
    const loader = this.options.loader ?? new GlobalMapAssetLoader({ trace: this.options.trace });
    const promise = (async () => {
      const raw = await loader.loadCatalogText(manifest, signal);
      if (lifecycleToken !== this.lifecycleToken) throw createLifecycleAbortError();
      // The compact global catalogue is only 6.3 MiB and its indexed decode
      // is cheaper than a structured-clone round trip on Android WebView.
      // Workers remain reserved for chunk decoding and viewport culling, where
      // the payload is bounded to the active viewport.
      const catalog = assertCatalogPayload(parseCatalogPayload(raw, manifest), manifest);
      if (lifecycleToken !== this.lifecycleToken) throw createLifecycleAbortError();
      this.catalog = catalog;
      // Decode a fresh network so all line/station relationships use the full
      // dense catalog while regional paths remain unchanged.
      if (bootstrapPayload) {
        const decodeStartedAt = nowMs();
        const nextNetwork = decodeBootstrap(
          bootstrapPayload,
          manifest,
          catalog,
          linePalette,
        );
        this.network = nextNetwork;
        this.syncLoadedRegionalPaths();
        this.networkVersion += 1;
        this.decodeTimeMs += nowMs() - decodeStartedAt;
        this.stationIndex = buildStationSpatialIndex(nextNetwork.stations);
        return nextNetwork;
      }
      return network;
    })();
    this.catalogPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.catalogPromise === promise) this.catalogPromise = undefined;
    }
  }

  private async ensureRegionalPaths(includeBus: boolean, includeBike: boolean): Promise<GlobalMapPath[]> {
    const corePaths = await this.ensureRegionalLayer("core");
    const extraPaths: GlobalMapPath[] = [];
    if (includeBus) extraPaths.push(...await this.ensureRegionalLayer("bus"));
    if (includeBike) extraPaths.push(...await this.ensureRegionalLayer("bike"));
    return [...corePaths, ...extraPaths];
  }

  private async ensureRegionalLayer(layer: "core" | "bus" | "bike"): Promise<GlobalMapPath[]> {
    if (!this.manifest || !this.network)
      throw new Error("Global map data source is not initialized");
    const loadedPaths = layer === "bus"
      ? this.regionalBusPaths
      : layer === "bike"
        ? this.regionalBikePaths
        : this.regionalCorePaths;
    const pendingPromise = layer === "bus"
      ? this.regionalBusPromise
      : layer === "bike"
        ? this.regionalBikePromise
        : this.regionalCorePromise;
    if (loadedPaths) return loadedPaths;
    if (pendingPromise) return pendingPromise;

    const fallback = this.network.regionalPaths.filter((path) => {
      const mode = this.network!.linesById.get(path.lineId)?.mode;
      return layer === "bus"
        ? mode === "BUS" || mode === "NOCTILIEN"
        : layer === "bike"
          ? mode === "BIKE"
          : mode !== "BUS" && mode !== "NOCTILIEN" && mode !== "BIKE";
    });
    const lifecycleToken = this.lifecycleToken;
    const loader = this.options.loader ?? new GlobalMapAssetLoader({ trace: this.options.trace });
    const loadPayload =
      layer === "bus"
        ? loader.loadRegionalBusPayload(this.manifest)
        : layer === "bike"
          ? loader.loadRegionalBikePayload(this.manifest)
          : loader.loadRegionalPayload(this.manifest);
    const promise = loadPayload.then((payload) => {
      if (lifecycleToken !== this.lifecycleToken) return fallback;
      const paths =
        payload && this.bootstrapPayload
          ? decodeRegionalPaths(payload, this.bootstrapPayload)
          : fallback;
      if (layer === "bus") this.regionalBusPaths = paths;
      else if (layer === "bike") this.regionalBikePaths = paths;
      else this.regionalCorePaths = paths;
      this.syncLoadedRegionalPaths();
      return paths;
    });
    if (layer === "bus") this.regionalBusPromise = promise;
    else if (layer === "bike") this.regionalBikePromise = promise;
    else this.regionalCorePromise = promise;
    try {
      return await promise;
    } finally {
      if (layer === "bus") {
        if (this.regionalBusPromise === promise) this.regionalBusPromise = undefined;
      } else if (layer === "bike") {
        if (this.regionalBikePromise === promise) this.regionalBikePromise = undefined;
      } else if (this.regionalCorePromise === promise) {
        this.regionalCorePromise = undefined;
      }
    }
  }

  private syncLoadedRegionalPaths(): void {
    if (!this.network) return;
    const paths = [
      ...(this.regionalCorePaths ?? []),
      ...(this.regionalBusPaths ?? []),
      ...(this.regionalBikePaths ?? []),
    ];
    if (paths.length === 0) return;
    if (this.network.regionalPaths === paths) return;
    this.network.regionalPaths = paths;
    for (const path of paths) this.network.pathsById.set(path.id, path);
    this.networkVersion += 1;
  }

  async queryViewport(
    camera: CameraState,
    visibleModeMask: number,
    generation = camera.generation,
    detailLineId?: string,
    forcedLineIds: readonly string[] = [],
  ): Promise<TransportMapViewportResult> {
    if (!this.manifest || !this.network || !this.scheduler) {
      throw new Error("Global map data source is not initialized");
    }
    const trace = this.options.trace?.isRunning ? this.options.trace : undefined;
    if (trace && this.lastTraceSessionId !== trace.sessionId) {
      this.lastTraceSessionId = trace.sessionId;
      this.lastTraceLodLevel = undefined;
      this.lastTraceDetailed = undefined;
      this.lastTracePathCount = 0;
      this.lastTraceStationCount = 0;
    }
    const refreshTraceId = trace?.begin("viewport_refresh", {
      generation,
      zoom: camera.zoom,
      centerWorldX: camera.centerWorldX,
      centerWorldY: camera.centerWorldY,
      visibleModeMask,
      detailLineId,
      forcedLineCount: forcedLineIds.length,
    });
    let lodTransitionTraceId: TransportMapTraceEventId | undefined;
    try {
    this.lastGeneration = generation;
    this.scheduler.cancelObsolete(generation);
    this.scheduler.evictInvisibleModes(visibleModeMask);
    this.workerPool?.cancelObsolete(generation);
    const lod = selectLodForZoom(camera.zoom, this.manifest.lod);
    const previousLodLevel = trace ? this.lastTraceLodLevel : undefined;
    if (trace && previousLodLevel !== undefined && previousLodLevel !== lod.level) {
      trace?.instant("lod_change", {
        from: previousLodLevel,
        to: lod.level,
        previousLevel: previousLodLevel,
        newLevel: lod.level,
        zoom: camera.zoom,
        generation,
      });
      const transitionType = lod.level > previousLodLevel ? "regional_to_detailed" : "detailed_to_regional";
      lodTransitionTraceId = trace?.begin(
        transitionType,
        {
          previousLevel: previousLodLevel,
          newLevel: lod.level,
          from: previousLodLevel,
          to: lod.level,
          pathCountBefore: this.lastTracePathCount,
          stationCountBefore: this.lastTraceStationCount,
          zoom: camera.zoom,
          generation,
        },
        refreshTraceId,
      );
    }
    if (trace) this.lastTraceLodLevel = lod.level;
    const viewportBounds = visibleWorldBounds(camera);
    const visibleBounds = viewportBounds;
    const forcedLineSet = new Set(forcedLineIds);
    const shouldLoadGhostCorrespondenceDetail =
      GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.highFidelityGhostCorrespondences &&
      forcedLineSet.size > 0;
    const detailLine = detailLineId ? this.network.linesById.get(detailLineId) : undefined;
    const focusedViewportCacheKey = detailLine
      ? [
          detailLine.id,
          visibleModeMask,
          lod.level,
          [...forcedLineSet].sort().join(","),
          viewportBounds.minX.toFixed(9),
          viewportBounds.minY.toFixed(9),
          viewportBounds.maxX.toFixed(9),
          viewportBounds.maxY.toFixed(9),
        ].join(":")
      : undefined;
    if (focusedViewportCacheKey) {
      const cached = this.focusedViewportResultCache.get(focusedViewportCacheKey);
      if (cached) {
        this.focusedViewportResultCache.delete(focusedViewportCacheKey);
        this.focusedViewportResultCache.set(focusedViewportCacheKey, cached);
        this.lastChunkCount = cached.chunkIds.length;
        this.bytes = this.scheduler.metrics().cache.bytes;
        if (trace) {
          this.lastTraceDetailed = Boolean(detailLine);
          this.lastTracePathCount = cached.paths.length;
          this.lastTraceStationCount = cached.stations.length;
        }
        return {
          ...cached,
          generation,
          bytes: this.bytes,
          fromCache: true,
        };
      }
    }
    if (detailLine) {
      // A line selected through ?line is a stable detail surface. Load its
      // regional topology up front so both the focused GTFS geometry and the
      // traffic graph keep the complete line when the camera later zooms into
      // one of its stations.
      // Forced station correspondences may belong to the other regional pack
      // (typically a Metro focus with a Bus at the selected interchange).
      // Decode every required pack before deriving their spatial bounds so an
      // unavailable detail chunk can immediately fall back to its complete
      // regional trace instead of disappearing until a later unrelated query.
      const requiredRegionalLayers = new Set<"bus" | "core" | "bike">(
        [detailLine.id, ...forcedLineSet]
          .map((lineId) => this.network!.linesById.get(lineId)?.mode)
          .filter((mode): mode is GlobalMapMode => Boolean(mode))
          .map((mode) =>
            mode === "BUS" || mode === "NOCTILIEN"
              ? "bus"
              : mode === "BIKE"
                ? "bike"
                : "core"),
      );
      await Promise.all(
        [...requiredRegionalLayers].map((layer) => this.ensureRegionalLayer(layer)),
      );
    }
    const focusedLineStations =
      detailLine && GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.keepStationLabelsDuringZoom
        ? detailLine.stationIds
            .map((stationId) => this.network!.stationsById.get(stationId))
            .filter((station): station is GlobalMapStation => Boolean(station))
        : [];
    // A focused line is the only visible transport layer. Keeping the global
    // mode mask here made a RER focus download every Bus/Metro/Train chunk in
    // the viewport before filterPaths discarded those paths.
    const effectiveModeMask = addForcedLineModeBits(
      detailLine ? modeBitForLine(detailLine.mode) || visibleModeMask : visibleModeMask,
      forcedLineSet,
      this.network.linesById,
    );
    // Forced lines need their mode bit only to make the corresponding asset
    // chunks load. Keep the original user mask for rendering, otherwise a
    // selected Metro/RER/etc. correspondence would make every line of that
    // mode visible across the map.
    const renderModeMask = visibleModeMask;
    const shouldLoadFocusedLineDetail = Boolean(detailLine);
    // The next strategy owns the regional asset only below the first detailed
    // LOD boundary. At urban zooms it must promote to spatial chunks so a
    // regional station-to-station simplification can never be mistaken for
    // the street-level GTFS trace. The legacy strategy keeps its existing
    // level-0 branch because its caller does not set this option.
    const useRegionalOverview =
      this.options.useRegionalOverview === true &&
      !shouldLoadFocusedLineDetail &&
      lod.level === 0;
    const detailedPathBranch = !(
      useRegionalOverview ||
      (lod.level === 0 && !shouldLoadFocusedLineDetail && !shouldLoadGhostCorrespondenceDetail)
    );
    if (trace && this.lastTraceDetailed !== undefined && this.lastTraceDetailed !== detailedPathBranch) {
      // A branch transition can happen without crossing a numeric LOD band
      // (for example when a focused line is selected). Reuse the LOD span
      // when one already exists; otherwise create the same bounded transition
      // span so its before/after counts are available in the report.
      if (!lodTransitionTraceId) {
        lodTransitionTraceId = trace?.begin(
          detailedPathBranch ? "regional_to_detailed" : "detailed_to_regional",
          {
            from: this.lastTraceDetailed ? "detailed" : "regional",
            to: detailedPathBranch ? "detailed" : "regional",
            pathCountBefore: this.lastTracePathCount,
            stationCountBefore: this.lastTraceStationCount,
            newLodLevel: lod.level,
            zoom: camera.zoom,
            generation,
          },
          refreshTraceId,
        );
      }
    }
    if (
      useRegionalOverview ||
      (lod.level === 0 && !shouldLoadFocusedLineDetail && !shouldLoadGhostCorrespondenceDetail)
    ) {
      // `/map` keeps one complete regional geometry set only for the
      // world/regional overview. MapLibre owns basemap tile visibility, while
      // Deck keeps this transport scene stable during a zoom gesture. Once
      // `lod.level` becomes detailed, the bounded chunk branch below takes
      // over and supplies the audited GTFS geometry.
      const hideSurfaceAtGlobalLod = useRegionalOverview ? false : camera.zoom < 9;
      const forcedBusVisibleAtGlobalLod = [...forcedLineSet].some(
        (lineId) => {
          const mode = this.network!.linesById.get(lineId)?.mode;
          return mode === "BUS" || mode === "NOCTILIEN";
        },
      );
      const includeBus =
        (effectiveModeMask & (modeBitForLine("BUS") | modeBitForLine("NOCTILIEN"))) !== 0 &&
        (!hideSurfaceAtGlobalLod || forcedBusVisibleAtGlobalLod);
      const includeBike = (effectiveModeMask & modeBitForLine("BIKE")) !== 0;
      const regionalPaths = await this.ensureRegionalPaths(includeBus, includeBike);
      const materializeStartedAt = trace ? nowMs() : 0;
      const paths = filterPaths(
        regionalPaths,
        this.network.linesById,
        renderModeMask,
        useRegionalOverview ? undefined : visibleBounds,
        hideSurfaceAtGlobalLod,
        false,
        forcedLineSet,
        detailLineId,
      );
      const sourceStations = useRegionalOverview
        ? this.network.stations
        : visibleStations(this.network, this.stationIndex, visibleBounds);
      const stations = mergeFocusedLineStations(
        sourceStations.filter((station) => {
          const lineVisible = station.lineIds.some((lineId) => {
            const line = this.network!.linesById.get(lineId);
            return (
              line &&
              (!hideSurfaceAtGlobalLod ||
                (line.mode !== "BUS" && line.mode !== "NOCTILIEN") ||
                forcedLineSet.has(lineId)) &&
              isLineVisible(lineId, line.mode, renderModeMask, forcedLineSet, detailLineId)
            );
          });
          return (
            lineVisible &&
            (useRegionalOverview || (
              station.worldX >= visibleBounds.minX &&
              station.worldX <= visibleBounds.maxX &&
              station.worldY >= visibleBounds.minY &&
              station.worldY <= visibleBounds.maxY
            ))
          );
        }),
        focusedLineStations,
      );
      if (trace) {
        trace.recordDuration("lod_materialize", nowMs() - materializeStartedAt, {
          lodLevel: lod.level,
          pathCount: paths.length,
          vertexCount: paths.reduce((sum, path) => sum + path.vertices.length, 0),
          generation,
        }, refreshTraceId);
      }
      this.lastChunkCount = 0;
      if (trace) {
        this.lastTraceDetailed = false;
        this.lastTracePathCount = paths.length;
        this.lastTraceStationCount = stations.length;
      }
      return { generation, chunkIds: [], paths, stations, bytes: 0, fromCache: true };
    }

    await this.ensureCatalog();
    // The compiler writes separate core and Bus assets for every populated
    // spatial cell. When the Bus layer is off, its geometry files are not
    // scheduled at all; the catalog and station index remain shared.
    const focusedLineDetailBounds = detailLineId
      ? getDetailLineSpatialBounds(this.network!, detailLineId) ?? []
      : [];
    // Correspondence lines keep full-detail chunks throughout every world
    // point that can become visible in the supported 16.7 -> 12.1 gesture.
    // Their complete regional GTFS traces are already decoded as the fallback
    // outside that envelope. Loading every remote terminus of 26 Saint-Lazare
    // lines used 59 chunks/35 MiB and caused GC pauses during the wheel RAF
    // without adding a visible vertex to the viewport.
    const ghostDetailBounds = shouldLoadGhostCorrespondenceDetail
      ? expandBounds(
          visibleWorldBounds({
            ...camera,
            zoom: Math.min(camera.zoom, FOCUSED_GHOST_DETAIL_PRELOAD_ZOOM),
          }),
          FOCUSED_GHOST_DETAIL_PRELOAD_PADDING_RATIO,
        )
      : undefined;
    const detailQueryBounds = [
      ...focusedLineDetailBounds,
      ...(ghostDetailBounds ? [ghostDetailBounds] : []),
    ];
    const focusedLineBounds = detailLine ? unionBounds(detailQueryBounds) : undefined;
    const pathQueryBounds = focusedLineBounds ?? viewportBounds;
    const chunkOverscanRatio =
      detailLine && GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.biggerTiles
        ? BIGGER_DETAIL_LINE_CHUNK_OVERSCAN_RATIO
        : DEFAULT_CHUNK_OVERSCAN_RATIO;
    const descriptors = this.scheduler
      .descriptorsForBounds(pathQueryBounds, chunkOverscanRatio, effectiveModeMask)
      .filter(
        (descriptor) =>
          detailQueryBounds.length === 0 ||
          detailQueryBounds.some((lineBounds) =>
            boundsIntersect(
              expandBounds(lineBounds, DETAIL_LINE_CHUNK_PADDING_RATIO),
              descriptor.bounds,
            ),
          ),
      );
    for (const descriptor of descriptors) {
      if (this.prefetchedChunkIds.delete(descriptor.id) && this.scheduler.hasCached(descriptor.id)) {
        this.prefetchUsefulHits += 1;
      }
    }
    const allDescriptorsCached = descriptors.every((descriptor) =>
      this.scheduler!.hasCached(descriptor.id),
    );
    const schedulerBeforeBatch = this.scheduler.metrics();
    const chunkBatchTraceId = trace?.begin("chunk_request_batch", {
      generation,
      requested: descriptors.length,
      visible: descriptors.filter((descriptor) => boundsContains(viewportBounds, descriptor.bounds)).length,
      overscan: descriptors.filter((descriptor) => !boundsContains(viewportBounds, descriptor.bounds)).length,
      priority: descriptors.some((descriptor) => boundsContains(viewportBounds, descriptor.bounds)) ? "visible" : "overscan",
      totalBytes: descriptors.reduce((sum, descriptor) => sum + (descriptor.bytes ?? 0), 0),
    }, refreshTraceId);
    const payloads = await Promise.all(
      descriptors.map((descriptor) =>
        this.scheduler!.request({
          descriptor,
          generation,
          priority: boundsContains(viewportBounds, descriptor.bounds) ? "visible" : "overscan",
          traceParentId: chunkBatchTraceId,
        }).catch((error: unknown) => {
          // A line switch cancels the previous batch. It is not a partial
          // success: publishing it can replace a complete line with the few
          // chunks that finished before cancellation, while stations remain.
          if (error instanceof Error && error.name === "AbortError") {
            trace?.end(chunkBatchTraceId, { generation, failed: true });
            throw error;
          }
          return undefined;
        }),
      ),
    );
    // Fetch can reject with the numeric AbortSignal.reason supplied by the
    // scheduler instead of an AbortError. Reject stale batches in that case too.
    if (generation !== this.lastGeneration) {
      trace?.end(chunkBatchTraceId, { generation, failed: true });
      throw new DOMException("Stale global-map generation", "AbortError");
    }
    const schedulerAfterBatch = this.scheduler.metrics();
    const loadedPayloadCount = payloads.filter((payload): payload is GlobalMapChunkPayload => Boolean(payload)).length;
    trace?.end(chunkBatchTraceId, {
      requested: descriptors.length,
      loaded: loadedPayloadCount,
      cacheHits: Math.max(0, schedulerAfterBatch.cache.hits - schedulerBeforeBatch.cache.hits),
      cacheMisses: Math.max(0, schedulerAfterBatch.cache.misses - schedulerBeforeBatch.cache.misses),
      completed: Math.max(0, schedulerAfterBatch.completed - schedulerBeforeBatch.completed),
      decoded: loadedPayloadCount,
      totalBytes: descriptors.reduce((sum, descriptor) => sum + (descriptor.bytes ?? 0), 0),
    });
    const candidatePaths = dedupePaths(
      payloads
        .flatMap((payload) => payload?.paths ?? [])
        .filter((path) => this.network!.linesById.has(path.lineId)),
    );
    let culledPaths = candidatePaths;
    // Structured-cloning a few hundred geometry objects costs more than the
    // linear cull on Android WebView; reserve the bounded Worker queue for the
    // genuinely large dense viewports.
    if (candidatePaths.length > 2_048) {
      const filterStartedAt = nowMs();
      culledPaths = filterPathsByBounds(candidatePaths, pathQueryBounds);
      const durationMs = Math.max(0, nowMs() - filterStartedAt);
      this.filterPathsLocal.calls += 1;
      this.filterPathsLocal.totalMs += durationMs;
      this.filterPathsLocal.maxMs = Math.max(this.filterPathsLocal.maxMs, durationMs);
      this.filterPathsLocal.inputPathCount += candidatePaths.length;
      this.filterPathsLocal.outputPathCount += culledPaths.length;
      trace?.recordDuration("filter_paths_local", durationMs, {
        inputPathCount: candidatePaths.length,
        outputPathCount: culledPaths.length,
      }, refreshTraceId);
    }
    // A selected line is the V1-style detail view. Keep its complete chunk
    // geometry while the surrounding network uses the bounded LOD selected by
    // the camera; otherwise a 250 m LOD can turn a precise GTFS curve into a
    // visibly angular metro path around dense stations.
    const maximumLodLevel = this.manifest.lod.reduce(
      (maximum, definition) => Math.max(maximum, definition.level),
      0,
    );
    const materializeStartedAt = trace ? nowMs() : 0;
    const paths = culledPaths.map((path) => {
      if (path.lineId === detailLineId) return breakIncompleteGtfsConnectors(path);
      if (
        shouldLoadGhostCorrespondenceDetail &&
        forcedLineSet.has(path.lineId) &&
        path.geometrySource === "gtfs"
      ) {
        return breakIncompleteGtfsConnectors(materializeLod(path, maximumLodLevel));
      }
      const lineMode = this.network!.linesById.get(path.lineId)?.mode;
      return breakIncompleteGtfsConnectors(
        materializeLod(path, resolveLodLevelForMode(lineMode, lod.level)),
      );
    });
    if (trace) {
      trace.recordDuration("lod_materialize", nowMs() - materializeStartedAt, {
        lodLevel: lod.level,
        pathCount: paths.length,
        vertexCount: paths.reduce((sum, path) => sum + path.vertices.length, 0),
        generation,
      }, refreshTraceId);
    }
    const stations = mergeFocusedLineStations(
      visibleStations(this.network, this.stationIndex, visibleBounds).filter((station) => {
        const inViewport =
          station.worldX >= visibleBounds.minX &&
          station.worldX <= visibleBounds.maxX &&
          station.worldY >= visibleBounds.minY &&
          station.worldY <= visibleBounds.maxY;
        return (
          inViewport &&
          station.lineIds.some((lineId) => {
            const line = this.network!.linesById.get(lineId);
            return line
              ? isLineVisible(lineId, line.mode, renderModeMask, forcedLineSet, detailLineId)
              : false;
          })
        );
      }),
      focusedLineStations,
    );
    this.lastChunkCount = descriptors.length;
    const cacheMetrics = this.scheduler.metrics().cache;
    this.bytes = cacheMetrics.bytes;
    // A schematic fallback is useful for the regional overview, but it is not
    // road-audited geometry. At detailed zoom it can visibly cut across a
    // bridge or a building, including when the user has selected that line.
    // Hide it for the road-based layers so a detailed Châtelet view never
    // presents a false bus/Noctilien alignment as if it were a road trace.
    // A missing audited segment is deliberately left as a gap at this zoom.
    const hideFallbackAtDetail =
      Boolean(detailLine) ||
      camera.zoom >= GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.fallbackLineMinZoom;
    const result: TransportMapViewportResult = {
      generation,
      chunkIds: descriptors.map((descriptor) => descriptor.id),
      paths: filterPaths(
        paths,
        this.network.linesById,
        renderModeMask,
        pathQueryBounds,
        false,
        hideFallbackAtDetail,
        forcedLineSet,
        detailLineId,
      ),
      stations,
      bytes: this.bytes,
      fromCache: allDescriptorsCached,
    };
    if (trace) {
      this.lastTraceDetailed = true;
      this.lastTracePathCount = result.paths.length;
      this.lastTraceStationCount = result.stations.length;
    }
    // Missing chunks may be retried on the next viewport request. Caching a
    // partial result here would permanently skip those retries on C -> A -> C.
    if (focusedViewportCacheKey && loadedPayloadCount === descriptors.length) {
      this.focusedViewportResultCache.set(focusedViewportCacheKey, result);
      while (this.focusedViewportResultCache.size > 8) {
        const oldest = this.focusedViewportResultCache.keys().next().value as string | undefined;
        if (!oldest) break;
        this.focusedViewportResultCache.delete(oldest);
      }
    }
    return result;
    } finally {
      trace?.end(lodTransitionTraceId, {
        pathCountAfter: this.lastTracePathCount,
        stationCountAfter: this.lastTraceStationCount,
        failed: this.lastGeneration !== generation,
      });
      trace?.end(refreshTraceId, {
        generation,
        lodLevel: this.lastTraceLodLevel,
        chunkCount: this.lastChunkCount,
        bytes: this.bytes,
        pathCount: this.lastTracePathCount,
        stationCount: this.lastTraceStationCount,
      });
    }
  }

  /**
   * Warm transport chunks just ahead of a camera gesture. Prefetch requests
   * use an independent epoch and the scheduler deliberately preserves them
   * across ordinary camera generations; a visible request can still preempt
   * one when all fetch slots are occupied.
   */
  prefetchViewport(
    camera: CameraState,
    visibleModeMask: number,
    activeLineId?: string,
    forcedLineIds: readonly string[] = [],
    options: TransportMapPrefetchOptions = {},
  ): Promise<GlobalMapChunkPayload[]> {
    if (!GLOBAL_TRANSPORT_PLAN_CONFIG.nextMap.prefetch.enabled) return Promise.resolve([]);
    if (!this.manifest || !this.network || !this.scheduler) return Promise.resolve([]);
    const forcedLineSet = new Set(forcedLineIds);
    if (activeLineId) forcedLineSet.add(activeLineId);
    const effectiveModeMask = addForcedLineModeBits(
      visibleModeMask,
      forcedLineSet,
      this.network.linesById,
    );
    const predictedBounds = expandBounds(
      visibleWorldBounds(camera),
      Math.max(0, Math.min(0.75, options.overscanRatio ?? GLOBAL_TRANSPORT_PLAN_CONFIG.nextMap.prefetch.overscanRatio)),
    );
    const maxChunks = Math.max(0, Math.floor(options.maxChunks ?? GLOBAL_TRANSPORT_PLAN_CONFIG.nextMap.prefetch.maxChunks));
    const maxBytes = Math.max(0, Math.floor(options.maxBytes ?? GLOBAL_TRANSPORT_PLAN_CONFIG.nextMap.prefetch.maxBytes));
    if (maxChunks === 0 || maxBytes === 0) return Promise.resolve([]);
    const centerX = (predictedBounds.minX + predictedBounds.maxX) / 2;
    const centerY = (predictedBounds.minY + predictedBounds.maxY) / 2;
    const descriptors = this.scheduler
      .descriptorsForBounds(predictedBounds, 0, effectiveModeMask)
      .sort((left, right) => chunkDistanceSquared(left, centerX, centerY) - chunkDistanceSquared(right, centerX, centerY));
    let selected = 0;
    let bytes = 0;
    const generation = options.generation ?? ++this.prefetchEpoch;
    const selectedDescriptors: GlobalMapChunkDescriptor[] = [];
    for (const descriptor of descriptors) {
      if (selected >= maxChunks) break;
      const descriptorBytes = descriptor.bytes ?? 0;
      if (selected > 0 && bytes + descriptorBytes > maxBytes) break;
      if (this.scheduler.hasCached(descriptor.id)) {
        this.prefetchHits += 1;
        continue;
      }
      selected += 1;
      bytes += descriptorBytes;
      selectedDescriptors.push(descriptor);
    }
    const trace = this.options.trace?.isRunning ? this.options.trace : undefined;
    const traceSessionId = trace?.sessionId;
    const traceForPrefetch = (): TransportMapPerformanceTrace | undefined =>
      trace && trace.isRunning && trace.sessionId === traceSessionId ? trace : undefined;
    const batchTraceId = selectedDescriptors.length > 0
      ? trace?.begin("chunk_request_batch", {
          generation,
          requested: selectedDescriptors.length,
          visible: 0,
          overscan: selectedDescriptors.length,
          priority: "prefetch",
          totalBytes: bytes,
        })
      : undefined;
    const pending: Array<Promise<GlobalMapChunkPayload | undefined>> = [];
    for (const descriptor of selectedDescriptors) {
      const descriptorBytes = descriptor.bytes ?? 0;
      this.prefetchRequests += 1;
      this.prefetchedChunkIds.add(descriptor.id);
      const request = this.scheduler.request({
        descriptor,
        generation,
        priority: "prefetch",
        traceParentId: batchTraceId,
      }).then((payload) => {
        this.prefetchBytes += descriptorBytes || JSON.stringify(payload).length;
        return payload;
      }).catch((error: unknown) => {
        this.prefetchedChunkIds.delete(descriptor.id);
        if (error instanceof DOMException && error.name === "AbortError") this.prefetchCancelled += 1;
        return undefined;
      });
      pending.push(request);
    }
    return Promise.all(pending).then((payloads) => {
      traceForPrefetch()?.end(batchTraceId, {
        requested: selectedDescriptors.length,
        loaded: payloads.filter((payload): payload is GlobalMapChunkPayload => Boolean(payload)).length,
        totalBytes: bytes,
      });
      return payloads.filter((payload): payload is GlobalMapChunkPayload => Boolean(payload));
    });
  }

  async getStation(stationId: string, signal?: AbortSignal) {
    const network = await this.ensureCatalog(signal);
    return network.stationsById.get(stationId);
  }

  async queryStationsWithinRadius(
    lon: number,
    lat: number,
    radiusMeters: number,
    signal?: AbortSignal,
  ) {
    const network = await this.ensureCatalog(signal);
    return queryStationsWithinRadius(
      network.stations,
      { lon, lat },
      radiusMeters,
      Number.POSITIVE_INFINITY,
      0,
      this.stationIndex,
    );
  }

  metrics(): TransportMapDataSourceMetrics {
    return {
      manifestLoaded: Boolean(this.manifest),
      catalogLoaded: Boolean(this.catalog),
      lastGeneration: this.lastGeneration,
      lastChunkCount: this.lastChunkCount,
      bytes: this.bytes,
      decodeTimeMs: roundMetric(this.decodeTimeMs),
      workerTimeMs: roundMetric(this.workerTimeMs),
      workerCount: this.workerPool?.workerCount ?? 0,
      filterPathsLocal: {
        calls: this.filterPathsLocal.calls,
        totalMs: roundMetric(this.filterPathsLocal.totalMs),
        maxMs: roundMetric(this.filterPathsLocal.maxMs),
        inputPathCount: this.filterPathsLocal.inputPathCount,
        outputPathCount: this.filterPathsLocal.outputPathCount,
      },
      prefetchRequests: this.prefetchRequests,
      prefetchHits: this.prefetchHits,
      prefetchUsefulHits: this.prefetchUsefulHits,
      prefetchCancelled: this.prefetchCancelled,
      prefetchBytes: this.prefetchBytes,
      prefetchCompileMs: roundMetric(this.prefetchCompileMs),
      workerPool: this.workerPool?.getMetrics() ?? emptyWorkerPoolMetrics(),
      cache: this.scheduler?.metrics() ?? {
        pending: 0,
        active: 0,
        completed: 0,
        abandoned: 0,
        cache: { entries: 0, bytes: 0, hits: 0, misses: 0, evictions: 0 },
      },
    };
  }

  dispose(): void {
    this.lifecycleToken += 1;
    this.scheduler?.dispose();
    this.workerPool?.dispose();
    this.scheduler = undefined;
    this.focusedViewportResultCache.clear();
    this.network = undefined;
    this.networkVersion = 0;
    this.manifest = undefined;
    this.catalog = undefined;
    this.catalogPromise = undefined;
    this.regionalCorePromise = undefined;
    this.regionalBusPromise = undefined;
    this.regionalBikePromise = undefined;
    this.regionalCorePaths = undefined;
    this.regionalBusPaths = undefined;
    this.regionalBikePaths = undefined;
    this.bootstrapPayload = undefined;
    this.stationIndex = undefined;
    this.decodeTimeMs = 0;
    this.workerTimeMs = 0;
    this.filterPathsLocal = createEmptyFilterPathsLocalMetrics();
    this.prefetchEpoch = 0;
    this.prefetchedChunkIds.clear();
    this.prefetchRequests = 0;
    this.prefetchHits = 0;
    this.prefetchUsefulHits = 0;
    this.prefetchCancelled = 0;
    this.prefetchBytes = 0;
    this.prefetchCompileMs = 0;
  }

  private async loadChunkWithWorker(
    loader: GlobalMapAssetLoader,
    manifest: GlobalMapManifest,
    request: ChunkRequest,
    signal: AbortSignal,
  ): Promise<GlobalMapChunkPayload> {
    const raw = await loader.loadChunkText(manifest, request.descriptor, signal, request.traceParentId);
    const workerStartedAt = nowMs();
    const decoded = await this.workerPool!.run(
      "decode-chunk",
      { raw },
      request.generation,
      request.priority,
      () => parseChunkPayload(
        raw,
        manifest,
        request.descriptor,
        (durationMs) => this.options.trace?.recordDuration("chunk_json_parse", durationMs, {
          chunkId: request.descriptor.id,
          inputBytes: raw.length,
          execution: "main-thread-fallback",
        }, request.traceParentId),
      ),
      [],
      request.traceParentId,
    );
    this.workerTimeMs += nowMs() - workerStartedAt;
    return assertChunkPayload(decoded as GlobalMapChunkPayload, manifest, request.descriptor);
  }
}

function filterPaths(
  paths: GlobalMapPath[],
  linesById: Map<string, { mode: string }>,
  visibleModeMask: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | undefined,
  hideSurfaceAtGlobalLod = false,
  hideFallbackAtDetail = false,
  forcedLineIds: ReadonlySet<string> = new Set(),
  detailLineId?: string,
): GlobalMapPath[] {
  return paths.filter((path) => {
    const line = linesById.get(path.lineId);
    const isRoadBasedMode = line?.mode === "BUS" || line?.mode === "NOCTILIEN";
    return Boolean(
      line &&
      (!detailLineId || path.lineId === detailLineId || forcedLineIds.has(path.lineId)) &&
      (!hideSurfaceAtGlobalLod ||
        (line.mode !== "BUS" && line.mode !== "NOCTILIEN") ||
        forcedLineIds.has(path.lineId)) &&
      (!hideFallbackAtDetail ||
        !isRoadBasedMode ||
        path.geometrySource !== "netex-schematic-fallback") &&
      isLineVisible(path.lineId, line.mode, visibleModeMask, forcedLineIds, detailLineId) &&
      (!bounds || !(
        path.maxX < bounds.minX ||
        path.minX > bounds.maxX ||
        path.maxY < bounds.minY ||
        path.minY > bounds.maxY
      )),
    );
  });
}

function chunkDistanceSquared(
  descriptor: GlobalMapChunkDescriptor,
  centerX: number,
  centerY: number,
): number {
  const chunkCenterX = (descriptor.bounds.minX + descriptor.bounds.maxX) / 2;
  const chunkCenterY = (descriptor.bounds.minY + descriptor.bounds.maxY) / 2;
  return (chunkCenterX - centerX) ** 2 + (chunkCenterY - centerY) ** 2;
}

function dedupePaths(paths: GlobalMapPath[]): GlobalMapPath[] {
  const byId = new Map(paths.map((path) => [path.id, path]));
  return [...byId.values()];
}

function materializeLod(path: GlobalMapPath, lodLevel: number): GlobalMapPath {
  const lodKey = String(lodLevel);
  const vertices = path.lodVertices?.[lodKey];
  if (!vertices || vertices.length < 2) return path;

  // LOD vertices are independently simplified, so their break indices are
  // independently indexed too. Never carry full-detail starts into an LOD
  // array: doing so could reintroduce a cross-fragment chord.
  const { subpathStarts: _fullDetailSubpathStarts, ...pathWithoutFullDetailStarts } = path;
  const lodSubpathStarts = path.lodSubpathStarts?.[lodKey];
  return {
    ...pathWithoutFullDetailStarts,
    vertices,
    ...(lodSubpathStarts === undefined ? {} : { subpathStarts: lodSubpathStarts }),
  };
}

export function breakIncompleteGtfsConnectors(path: GlobalMapPath): GlobalMapPath {
  if (
    path.geometrySource !== "gtfs" ||
    path.quality.complete ||
    // rows-v2 and current chunk assets carry compiler-authored breaks. Keep
    // them verbatim; adding station-boundary breaks here would alter the
    // source subpaths and could erase valid geometry around the gap.
    path.subpathStarts !== undefined
  ) return path;

  const connectorBreaks = path.vertices.flatMap((vertex, index) =>
    index > 0 && path.vertices[index - 1]?.stationId && vertex.stationId ? [index] : [],
  );
  if (connectorBreaks.length === 0) return path;

  // The pack marks a topology connector as incomplete when a physical edge
  // has no audited GTFS shape. Its two station anchors are otherwise drawn as
  // a straight chord. Start a new Canvas subpath at the second anchor: the
  // reliable pieces around it stay visible, while the unaudited connector is
  // intentionally left as a gap.
  const subpathStarts = [...new Set([...(path.subpathStarts ?? []), ...connectorBreaks])].sort(
    (left, right) => left - right,
  );
  return { ...path, subpathStarts };
}

function resolveLodLevelForMode(mode: GlobalMapMode | undefined, cameraLodLevel: number): number {
  if (!mode) return cameraLodLevel;
  return Math.max(
    cameraLodLevel,
    GLOBAL_TRANSPORT_PLAN_CONFIG.lod.minimumLevelByMode[mode] ?? cameraLodLevel,
  );
}

function modeBitForLine(mode: string): number {
  const index = GLOBAL_MAP_MODE_ORDER.indexOf(mode as (typeof GLOBAL_MAP_MODE_ORDER)[number]);
  return index < 0 ? 0 : 1 << index;
}

function addForcedLineModeBits(
  mask: number,
  forcedLineIds: ReadonlySet<string>,
  linesById: Map<string, { mode: string }>,
): number {
  let effectiveMask = mask;
  for (const lineId of forcedLineIds) {
    const line = linesById.get(lineId);
    if (line) effectiveMask |= modeBitForLine(line.mode);
  }
  return effectiveMask;
}

function isLineVisible(
  lineId: string,
  lineMode: string,
  mask: number,
  forcedLineIds: ReadonlySet<string>,
  detailLineId?: string,
): boolean {
  if (detailLineId) return lineId === detailLineId || forcedLineIds.has(lineId);
  return forcedLineIds.has(lineId) || (mask & modeBitForLine(lineMode)) !== 0;
}

function createLifecycleAbortError(): DOMException {
  return new DOMException("Global map data source lifecycle changed", "AbortError");
}

function createEmptyFilterPathsLocalMetrics(): TransportMapFilterPathsLocalMetrics {
  return {
    calls: 0,
    totalMs: 0,
    maxMs: 0,
    inputPathCount: 0,
    outputPathCount: 0,
  };
}

function boundsContains(
  left: { minX: number; minY: number; maxX: number; maxY: number },
  right: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return (
    left.minX <= right.minX &&
    left.minY <= right.minY &&
    left.maxX >= right.maxX &&
    left.maxY >= right.maxY
  );
}

// The manifest currently indexes chunks spatially and by mode, but does not
// duplicate the line membership that is already present in each chunk payload.
// Regional line traces are a compact, already-loaded approximation that lets a
// focused view avoid fetching neighbouring cells containing unrelated lines.
const DEFAULT_CHUNK_OVERSCAN_RATIO = 0.05;
const BIGGER_DETAIL_LINE_CHUNK_OVERSCAN_RATIO = 0.2;
const DETAIL_LINE_CHUNK_PADDING_RATIO = 0.08;
const FOCUSED_GHOST_DETAIL_PRELOAD_ZOOM = 12.1;
const FOCUSED_GHOST_DETAIL_PRELOAD_PADDING_RATIO = 0.2;

function getDetailLineSpatialBounds(
  network: TransportMapNetwork,
  detailLineId: string,
): GlobalMapBounds[] | undefined {
  const regionalBounds = network.regionalPaths
    .filter((path) => path.lineId === detailLineId)
    .map((path) => ({
      minX: path.minX,
      minY: path.minY,
      maxX: path.maxX,
      maxY: path.maxY,
    }));
  if (regionalBounds.length > 0) return regionalBounds;

  const line = network.linesById.get(detailLineId);
  const stations = line?.stationIds
    .map((stationId) => network.stationsById.get(stationId))
    .filter((station): station is NonNullable<typeof station> => Boolean(station));
  if (!stations?.length) return undefined;
  return [
    {
      minX: Math.min(...stations.map((station) => station.worldX)),
      minY: Math.min(...stations.map((station) => station.worldY)),
      maxX: Math.max(...stations.map((station) => station.worldX)),
      maxY: Math.max(...stations.map((station) => station.worldY)),
    },
  ];
}

function unionBounds(bounds: readonly GlobalMapBounds[]): GlobalMapBounds | undefined {
  if (bounds.length === 0) return undefined;

  return {
    minX: Math.min(...bounds.map((bound) => bound.minX)),
    minY: Math.min(...bounds.map((bound) => bound.minY)),
    maxX: Math.max(...bounds.map((bound) => bound.maxX)),
    maxY: Math.max(...bounds.map((bound) => bound.maxY)),
  };
}

function visibleStations(
  network: TransportMapNetwork,
  stationIndex: PackedSpatialIndex | undefined,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): GlobalMapStation[] {
  if (!stationIndex) {
    return network.stations.filter(
      (station) =>
        station.worldX >= bounds.minX &&
        station.worldX <= bounds.maxX &&
        station.worldY >= bounds.minY &&
        station.worldY <= bounds.maxY,
    );
  }
  return stationIndex
    .query(bounds)
    .map((stationIndexValue) => network.stations[stationIndexValue])
    .filter((station): station is GlobalMapStation => Boolean(station));
}

function mergeFocusedLineStations(
  visible: GlobalMapStation[],
  focusedLineStations: GlobalMapStation[],
): GlobalMapStation[] {
  if (focusedLineStations.length === 0) return visible;
  const byId = new Map(visible.map((station) => [station.id, station]));
  for (const station of focusedLineStations) byId.set(station.id, station);
  return [...byId.values()];
}

function resolveDefaultConcurrency(): number {
  return typeof navigator !== "undefined" && navigator.hardwareConcurrency <= 4 ? 1 : 2;
}

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function roundMetric(value: number): number {
  return Number(value.toFixed(3));
}

function createWorkerPool(trace?: TransportMapPerformanceTrace): TransportMapWorkerPool | undefined {
  if (typeof window === "undefined" || typeof Worker === "undefined") return undefined;
  try {
    return new TransportMapWorkerPool({
      size: resolveDefaultConcurrency(),
      trace,
      workerFactory: () =>
        new Worker(new URL("../workers/transportMap.worker.ts", import.meta.url), {
          type: "module",
        }),
    });
  } catch {
    return undefined;
  }
}

function emptyWorkerPoolMetrics(): ReturnType<TransportMapWorkerPool["getMetrics"]> {
  return {
    pending: 0,
    active: 0,
    queued: 0,
    completed: 0,
    abandoned: 0,
    jobsDiscardedBeforeExecution: 0,
    resultsDiscardedAsStale: 0,
    queueWaitMs: 0,
    workerExecutionMs: 0,
    byTaskType: {},
  };
}
