import {
  computed,
  ref,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from "vue";
import type { TransferLineOption } from "../../types/transit";
import type { GeographicViewport } from "./geoProjection";
import {
  createNetworkGhostLine,
  filterNetworkGhostTransfers,
  loadNetworkGhostTopology,
  projectNetworkGhostQuays,
} from "./networkGhostData";
import type {
  GhostNetworkScope,
  NetworkGhostAnchor,
  NetworkGhostLineView,
  NetworkGhostProgress,
} from "./types";

const NETWORK_GHOST_CONCURRENCY = 4;

export interface UseNetworkGhostOptions {
  anchor: MaybeRefOrGetter<NetworkGhostAnchor | undefined>;
  enabled: MaybeRefOrGetter<boolean>;
  scope: MaybeRefOrGetter<GhostNetworkScope>;
  transfers: MaybeRefOrGetter<TransferLineOption[]>;
  viewport: MaybeRefOrGetter<GeographicViewport | undefined>;
}

export function useNetworkGhost(options: UseNetworkGhostOptions) {
  const lines = shallowRef<NetworkGhostLineView[]>([]);
  const progress = ref<NetworkGhostProgress>({ completed: 0, total: 0 });
  let requestId = 0;

  const quays = computed(() =>
    projectNetworkGhostQuays(toValue(options.anchor), toValue(options.viewport)),
  );
  const loading = computed(
    () =>
      progress.value.total > 0 &&
      progress.value.completed < progress.value.total,
  );

  watch(
    () => [
      toValue(options.enabled),
      toValue(options.scope),
      toValue(options.anchor),
      toValue(options.transfers),
      toValue(options.viewport),
    ],
    () => {
      void reload();
    },
    { deep: true, immediate: true },
  );

  async function reload(): Promise<void> {
    const currentRequestId = ++requestId;
    const enabled = toValue(options.enabled);
    const anchor = toValue(options.anchor);
    const viewport = toValue(options.viewport);

    lines.value = [];

    if (!enabled || !anchor || !viewport) {
      progress.value = { completed: 0, total: 0 };
      return;
    }

    const transfers = filterNetworkGhostTransfers(
      toValue(options.transfers),
      toValue(options.scope),
    );
    const loadedLines = new Map<number, NetworkGhostLineView>();
    let nextIndex = 0;

    progress.value = { completed: 0, total: transfers.length };

    const workers = Array.from(
      { length: Math.min(NETWORK_GHOST_CONCURRENCY, transfers.length) },
      async () => {
        while (nextIndex < transfers.length) {
          const index = nextIndex;
          const transfer = transfers[index];

          nextIndex += 1;

          try {
            const topology = await loadNetworkGhostTopology(transfer.id);

            if (currentRequestId !== requestId) {
              return;
            }

            const line = createNetworkGhostLine(
              transfer,
              topology,
              anchor,
              viewport,
              index,
            );

            if (line) {
              loadedLines.set(index, line);
              lines.value = Array.from(loadedLines.entries())
                .sort(([left], [right]) => left - right)
                .map(([, loadedLine]) => loadedLine);
            }
          } catch {
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

    await Promise.all(workers);
  }

  return {
    lines,
    loading,
    progress,
    quays,
    reload,
  };
}
