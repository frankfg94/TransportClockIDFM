import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from "vue";
import type { TransferLineOption } from "../../types/transit";
import { fetchResolvedLineGeometry } from "../../services/lineGeometry";
import type { GeographicViewport } from "./geoProjection";
import {
  createNetworkGhostLine,
  filterNetworkGhostTransfers,
  getNetworkGhostModeKey,
  loadNetworkGhostTopology,
  projectNetworkGhostQuays,
} from "./networkGhostData";
import {
  applyNetworkGhostGeometry,
  createNetworkGhostGeometryRequest,
} from "./networkGhostGeometry";
import type {
  GhostNetworkScope,
  NetworkGhostAnchor,
  NetworkGhostLineView,
  NetworkGhostProgress,
} from "./types";

const DESKTOP_TOPOLOGY_CONCURRENCY = 8;
const NATIVE_TOPOLOGY_CONCURRENCY = 4;
const DESKTOP_GEOMETRY_CONCURRENCY = 4;
const NATIVE_GEOMETRY_CONCURRENCY = 2;

interface PendingTransfer {
  index: number;
  transfer: TransferLineOption;
}

interface PendingGeometry extends PendingTransfer {
  line: NetworkGhostLineView;
}

export interface UseNetworkGhostOptions {
  anchor: MaybeRefOrGetter<NetworkGhostAnchor | undefined>;
  enabled: MaybeRefOrGetter<boolean>;
  scope: MaybeRefOrGetter<GhostNetworkScope>;
  transfers: MaybeRefOrGetter<TransferLineOption[]>;
  useGtfs?: MaybeRefOrGetter<boolean>;
  viewport: MaybeRefOrGetter<GeographicViewport | undefined>;
}

export function useNetworkGhost(options: UseNetworkGhostOptions) {
  const lines = shallowRef<NetworkGhostLineView[]>([]);
  const progress = ref<NetworkGhostProgress>(createEmptyProgress());
  let requestId = 0;
  let requestController: AbortController | undefined;
  let renderedContextKey = "";
  let publishFrame: number | undefined;
  let publishScheduled = false;
  let publishRequestId = 0;
  let pendingPublishedLines: Map<number, NetworkGhostLineView> | undefined;

  onScopeDispose(() => {
    requestController?.abort();
    cancelPendingPublish();
  });

  const quays = computed(() =>
    projectNetworkGhostQuays(toValue(options.anchor), toValue(options.viewport)),
  );
  const loading = computed(
    () => progress.value.total > 0 && progress.value.completed < progress.value.total,
  );

  watch(
    () => [
      toValue(options.enabled),
      toValue(options.scope),
      toValue(options.anchor),
      toValue(options.transfers),
      toValue(options.useGtfs ?? true),
      toValue(options.viewport),
    ],
    () => {
      void reload();
    },
    { deep: true, immediate: true },
  );

  async function reload(): Promise<void> {
    const currentRequestId = ++requestId;
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    const enabled = toValue(options.enabled);
    const anchor = toValue(options.anchor);
    const useGtfs = toValue(options.useGtfs ?? true);
    const viewport = toValue(options.viewport);

    if (!enabled || !anchor || !viewport) {
      cancelPendingPublish();
      lines.value = [];
      renderedContextKey = "";
      progress.value = createEmptyProgress();
      return;
    }

    const scope = toValue(options.scope);
    const transfers = filterNetworkGhostTransfers(
      toValue(options.transfers),
      scope,
    );
    const contextKey = createNetworkGhostContextKey(anchor, viewport, useGtfs, scope);
    const existingById =
      contextKey === renderedContextKey
        ? new Map(lines.value.map((line) => [line.id, line]))
        : new Map<string, NetworkGhostLineView>();
    const loadedLines = new Map<number, NetworkGhostLineView>();
    const pendingTransfers: PendingTransfer[] = [];
    const pendingGeometry: PendingGeometry[] = [];

    transfers.forEach((transfer, index) => {
      const existing = existingById.get(transfer.id);
      if (existing) {
        const line = { ...existing, loadOrder: index };
        loadedLines.set(index, line);
        if (line.geometryPending) {
          pendingGeometry.push({ index, transfer, line });
        }
      } else {
        pendingTransfers.push({ index, transfer });
      }
    });
    renderedContextKey = contextKey;
    lines.value = Array.from(loadedLines.values());
    progress.value = {
      completed: loadedLines.size,
      total: transfers.length,
      precisionCompleted: loadedLines.size - pendingGeometry.length,
      precisionTotal: loadedLines.size,
    };

    const topologyQueue = roundRobinByMode(pendingTransfers);
    let nextTopologyIndex = 0;
    const topologyWorkers = Array.from(
      { length: Math.min(getTopologyConcurrency(), topologyQueue.length) },
      async () => {
        while (nextTopologyIndex < topologyQueue.length) {
          const pending = topologyQueue[nextTopologyIndex];
          nextTopologyIndex += 1;
          if (!pending) return;
          const { index, transfer } = pending;

          try {
            const topology = await loadNetworkGhostTopology(transfer.id, controller.signal);

            if (currentRequestId !== requestId) {
              return;
            }

            const directLine = createNetworkGhostLine(
              transfer,
              topology,
              anchor,
              viewport,
              index,
            );

            if (currentRequestId !== requestId) {
              return;
            }

            if (directLine) {
              const line = { ...directLine, geometryPending: true };
              loadedLines.set(index, line);
              pendingGeometry.push({ index, transfer, line });
              progress.value = {
                ...progress.value,
                precisionTotal: progress.value.precisionTotal + 1,
              };
              schedulePublish(currentRequestId, loadedLines);
            }
          } catch (error) {
            if (isAbortError(error)) return;
            // A missing line topology must not block the other correspondences.
          } finally {
            if (currentRequestId === requestId) {
              progress.value = {
                ...progress.value,
                completed: progress.value.completed + 1,
              };
            }
          }
        }
      },
    );

    await Promise.all(topologyWorkers);
    publishNow(currentRequestId, loadedLines);
    if (currentRequestId !== requestId || controller.signal.aborted) return;

    const geometryQueue = roundRobinByMode(pendingGeometry);
    let nextGeometryIndex = 0;
    const geometryWorkers = Array.from(
      { length: Math.min(getGeometryConcurrency(), geometryQueue.length) },
      async () => {
        while (nextGeometryIndex < geometryQueue.length) {
          const pending = geometryQueue[nextGeometryIndex];
          nextGeometryIndex += 1;
          if (!pending) return;
          const { index, line: directLine, transfer } = pending;
          let line = directLine;
          const geometryRequest = createNetworkGhostGeometryRequest(
            directLine,
            transfer,
            useGtfs,
          );

          if (geometryRequest) {
            try {
              const resolution = await fetchResolvedLineGeometry(geometryRequest, {
                signal: controller.signal,
              });
              if (currentRequestId !== requestId || controller.signal.aborted) return;
              line = applyNetworkGhostGeometry(directLine, resolution, viewport);
              console.info(
                `[line-map] ghost geometry loaded line=${line.id} source=${resolution.source}`,
              );
            } catch (error) {
              if (isAbortError(error)) return;
              console.warn(
                `[line-map] ghost geometry fallback line=${line.id} source=direct`,
                error instanceof Error ? error.message : error,
              );
            }
          }

          if (currentRequestId !== requestId || controller.signal.aborted) return;
          loadedLines.set(index, { ...line, geometryPending: false });
          progress.value = {
            ...progress.value,
            precisionCompleted: progress.value.precisionCompleted + 1,
          };
          schedulePublish(currentRequestId, loadedLines);
        }
      },
    );

    await Promise.all(geometryWorkers);
    publishNow(currentRequestId, loadedLines);
  }

  function schedulePublish(
    currentRequestId: number,
    loadedLines: Map<number, NetworkGhostLineView>,
  ): void {
    pendingPublishedLines = loadedLines;
    publishRequestId = currentRequestId;
    if (publishScheduled) return;
    publishScheduled = true;

    if (typeof window === "undefined") {
      queueMicrotask(() => {
        publishScheduled = false;
        publishNow(publishRequestId, pendingPublishedLines);
      });
      return;
    }

    publishFrame = window.requestAnimationFrame(() => {
      publishFrame = undefined;
      publishScheduled = false;
      publishNow(publishRequestId, pendingPublishedLines);
    });
  }

  function publishNow(
    currentRequestId: number,
    loadedLines?: Map<number, NetworkGhostLineView>,
  ): void {
    if (currentRequestId !== requestId || !loadedLines) return;
    if (publishFrame !== undefined && typeof window !== "undefined") {
      window.cancelAnimationFrame(publishFrame);
      publishFrame = undefined;
    }
    publishScheduled = false;

    lines.value = Array.from(loadedLines.entries())
      .sort(([left], [right]) => left - right)
      .map(([, loadedLine]) => loadedLine);
    pendingPublishedLines = undefined;
  }

  function cancelPendingPublish(): void {
    if (publishFrame !== undefined && typeof window !== "undefined") {
      window.cancelAnimationFrame(publishFrame);
    }
    publishFrame = undefined;
    publishScheduled = false;
    pendingPublishedLines = undefined;
  }

  return {
    lines,
    loading,
    progress,
    quays,
    reload,
  };
}

function createEmptyProgress(): NetworkGhostProgress {
  return {
    completed: 0,
    total: 0,
    precisionCompleted: 0,
    precisionTotal: 0,
  };
}

function roundRobinByMode<T extends PendingTransfer>(items: T[]): T[] {
  const grouped = new Map<string, T[]>();
  items.forEach((item) => {
    const mode = getNetworkGhostModeKey(item.transfer) ?? "other";
    const group = grouped.get(mode) ?? [];
    group.push(item);
    grouped.set(mode, group);
  });

  const groups = Array.from(grouped.values());
  const result: T[] = [];
  let remaining = items.length;
  while (remaining > 0) {
    groups.forEach((group) => {
      const item = group.shift();
      if (!item) return;
      result.push(item);
      remaining -= 1;
    });
  }

  return result;
}

function getTopologyConcurrency(): number {
  return isCapacitorRuntime()
    ? NATIVE_TOPOLOGY_CONCURRENCY
    : DESKTOP_TOPOLOGY_CONCURRENCY;
}

function getGeometryConcurrency(): number {
  return isCapacitorRuntime()
    ? NATIVE_GEOMETRY_CONCURRENCY
    : DESKTOP_GEOMETRY_CONCURRENCY;
}

function isCapacitorRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as Window & { Capacitor?: unknown }).Capacitor)
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function createNetworkGhostContextKey(
  anchor: NetworkGhostAnchor,
  viewport: GeographicViewport,
  useGtfs: boolean,
  scope: GhostNetworkScope,
): string {
  return JSON.stringify([
    anchor.id,
    anchor.lon,
    anchor.lat,
    anchor.projectedX,
    anchor.projectedY,
    anchor.mapX,
    anchor.mapY,
    viewport.minX,
    viewport.maxX,
    viewport.minY,
    viewport.maxY,
    useGtfs,
    scope,
  ]);
}
