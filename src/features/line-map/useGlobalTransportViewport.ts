import { getCurrentInstance, onBeforeUnmount } from "vue";
import type { TransportMapNetwork, TransportMapViewportResult } from "../transport-map/contracts/network";
import type { CameraState } from "../transport-map/geo/camera";
import type {
  TransportMapTraceEventType,
  TransportMapTraceMetadata,
} from "../transport-map/performance/transportMapPerformanceTrace";

export type GlobalTransportViewportTimingKind =
  | "decode"
  | "worker"
  | TransportMapTraceEventType;

export interface UseGlobalTransportViewportOptions {
  isMounted: () => boolean;
  getNetwork: () => TransportMapNetwork | undefined;
  getNetworkVersion?: () => number | undefined;
  getCamera: () => CameraState;
  getVisibleModeMask: () => number;
  getActiveLineId: () => string | undefined;
  getForcedLineIds: () => readonly string[];
  queryViewport: (
    camera: CameraState,
    visibleModeMask: number,
    generation: number,
    activeLineId: string | undefined,
    forcedLineIds: readonly string[],
  ) => Promise<TransportMapViewportResult>;
  getNetworkAfterQuery: () => TransportMapNetwork;
  publishNetwork: (
    network: TransportMapNetwork,
    wasSameObject: boolean,
    dataChanged?: boolean,
  ) => void;
  publishViewport: (viewport: TransportMapViewportResult) => void;
  setLoading: (loading: boolean) => void;
  clearError: () => void;
  setError: (message: string) => void;
  recordTiming?: (
    kind: GlobalTransportViewportTimingKind,
    durationMs: number,
    metadata?: TransportMapTraceMetadata,
  ) => void;
  afterRefresh?: () => void;
  isAbortError?: (error: unknown) => boolean;
  debounceMs: number;
}

/**
 * Owns viewport debounce and freshness guards. The component supplies the
 * data source and publication callbacks so this composable has no knowledge
 * of the renderer, basemap, or route UI.
 */
export function useGlobalTransportViewport(options: UseGlobalTransportViewportOptions) {
  let scheduledTimer: number | undefined;
  let requestToken = 0;
  let preloadToken = 0;
  let pendingRequests = 0;

  function cancelScheduledRefresh(): void {
    if (scheduledTimer === undefined) return;
    window.clearTimeout(scheduledTimer);
    scheduledTimer = undefined;
  }

  function invalidatePendingRequests(): void {
    cancelScheduledRefresh();
    requestToken += 1;
    preloadToken += 1;
  }

  function cancelPreloadLine(): void {
    preloadToken += 1;
  }

  function isPending(): boolean {
    return scheduledTimer !== undefined || pendingRequests > 0;
  }

  function scheduleRefresh(): void {
    if (!options.isMounted()) return;
    cancelScheduledRefresh();
    scheduledTimer = window.setTimeout(() => {
      scheduledTimer = undefined;
      void refreshViewport();
    }, Math.max(0, options.debounceMs));
  }

  async function refreshViewport(forcedLineIds?: readonly string[]): Promise<boolean> {
    const currentNetwork = options.getNetwork();
    if (!currentNetwork) return false;
    const currentRequestToken = ++requestToken;
    const generation = options.getCamera().generation;
    const networkVersionBefore = options.getNetworkVersion?.();
    const requestedForcedLineIds = forcedLineIds ?? options.getForcedLineIds();
    pendingRequests += 1;
    options.setLoading(true);
    try {
      const result = await options.queryViewport(
        options.getCamera(),
        options.getVisibleModeMask(),
        generation,
        options.getActiveLineId(),
        requestedForcedLineIds,
      );
      const refreshedNetwork = options.getNetworkAfterQuery();
      const wasSameNetwork = refreshedNetwork === currentNetwork;
      const networkVersionAfter = options.getNetworkVersion?.();
      const dataChanged = !wasSameNetwork ||
        (networkVersionBefore !== undefined && networkVersionAfter !== undefined
          ? networkVersionBefore !== networkVersionAfter
          : !result.fromCache);
      const resultApplyStartedAt = options.recordTiming ? nowMs() : Number.NaN;
      const publishNetworkStartedAt = options.recordTiming ? nowMs() : Number.NaN;
      options.publishNetwork(refreshedNetwork, wasSameNetwork, dataChanged);
      recordTiming(options, "publish_network", publishNetworkStartedAt, {
        sameObject: wasSameNetwork,
        dataChanged,
        generation,
      });
      if (
        currentRequestToken !== requestToken ||
        generation !== options.getCamera().generation
      ) {
        if (currentRequestToken === requestToken) options.setLoading(false);
        recordTiming(options, "viewport_result_apply", resultApplyStartedAt, {
          generation,
          stale: true,
          fromCache: result.fromCache,
        });
        return false;
      }
      const publishViewportStartedAt = options.recordTiming ? nowMs() : Number.NaN;
      options.publishViewport(result);
      recordTiming(options, "publish_viewport", publishViewportStartedAt, {
        generation,
        fromCache: result.fromCache,
        pathCount: result.paths.length,
        stationCount: result.stations.length,
      });
      options.setLoading(false);
      options.clearError();
      const afterRefreshStartedAt = options.recordTiming ? nowMs() : Number.NaN;
      options.afterRefresh?.();
      recordTiming(options, "after_viewport_publish", afterRefreshStartedAt, {
        generation,
      });
      recordTiming(options, "viewport_result_apply", resultApplyStartedAt, {
        generation,
        fromCache: result.fromCache,
        pathCount: result.paths.length,
        stationCount: result.stations.length,
      });
      return true;
    } catch (error) {
      if (options.isAbortError?.(error)) {
        if (currentRequestToken === requestToken) options.setLoading(false);
        return false;
      }
      if (currentRequestToken === requestToken) {
        options.setLoading(false);
        options.setError(
          error instanceof Error ? error.message : "Erreur de chargement de la carte",
        );
      }
      return false;
    } finally {
      pendingRequests = Math.max(0, pendingRequests - 1);
    }
  }

  async function preloadLine(lineId: string): Promise<TransportMapViewportResult | undefined> {
    const currentNetwork = options.getNetwork();
    if (!currentNetwork || !lineId || !options.isMounted()) return undefined;

    const currentPreloadToken = ++preloadToken;
    const camera = { ...options.getCamera() };
    const generation = camera.generation;
    const networkVersionBefore = options.getNetworkVersion?.();
    try {
      // Keep the target line explicit even when its mode is currently hidden.
      // The data source uses detailLineId to load the complete line bounds,
      // including chunks that are outside the current viewport.
      const result = await options.queryViewport(
        camera,
        options.getVisibleModeMask(),
        generation,
        lineId,
        [lineId],
      );
      const refreshedNetwork = options.getNetworkAfterQuery();
      const wasSameNetwork = refreshedNetwork === currentNetwork;
      const networkVersionAfter = options.getNetworkVersion?.();
      const dataChanged = !wasSameNetwork ||
        (networkVersionBefore !== undefined && networkVersionAfter !== undefined
          ? networkVersionBefore !== networkVersionAfter
          : !result.fromCache);

      // A focused query can decode regional packs as a side effect. Publish
      // those data changes, but deliberately do not publish its viewport:
      // this is an off-screen warm-up and must not replace the scene currently
      // being displayed while the camera is in flight.
      options.publishNetwork(refreshedNetwork, wasSameNetwork, dataChanged);
      if (
        currentPreloadToken !== preloadToken ||
        !options.isMounted()
      ) return undefined;
      return result;
    } catch (error) {
      // Preloading is an optimization. A failed warm-up must not replace a
      // visible viewport error or interrupt the selection that requested it.
      if (options.isAbortError?.(error)) return undefined;
      return undefined;
    }
  }

  function dispose(): void {
    invalidatePendingRequests();
  }

  const result = {
    refreshViewport,
    preloadLine,
    cancelPreloadLine,
    scheduleRefresh,
    cancelScheduledRefresh,
    invalidatePendingRequests,
    isPending,
    dispose,
  };
  if (getCurrentInstance()) onBeforeUnmount(dispose);
  return result;
}

function recordTiming(
  options: UseGlobalTransportViewportOptions,
  kind: TransportMapTraceEventType,
  startedAt: number,
  metadata?: TransportMapTraceMetadata,
): void {
  if (!options.recordTiming || !Number.isFinite(startedAt)) return;
  options.recordTiming(kind, Math.max(0, nowMs() - startedAt), metadata);
}

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
