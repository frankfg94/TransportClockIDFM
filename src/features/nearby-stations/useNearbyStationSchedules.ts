import { computed, onBeforeUnmount, onMounted, readonly, ref, watch } from "vue";
import { createBoardFromDraft } from "../../services/boardBuilder";
import {
  fetchBoardDepartures,
  fetchCachedLineRouteSequences,
} from "../../services/idfm";
import { idfmReferenceToMonitoringRef } from "../../services/idfmStopReferences";
import type { GlobalMapMode } from "../transport-map/contracts/manifest";
import type { StationSearchOption } from "../../types/transit";
import {
  addTopologyScheduleStopAreaRef,
  createNearbyDirectionGroupsFromTopology,
  createNearbyTooltipDirectionsFromTopology,
  mergeNearbyScheduleRefreshItems,
  selectNearbyScheduleCandidates,
  selectSupplementalScheduleCandidates,
  scheduleDirectionId,
  type ScheduleVisibilityStore,
  type NearbyStationScheduleCandidate,
  type NearbyStationScheduleItem,
  type NearbyStationScheduleMetadata,
  type NearbyStationScheduleState,
} from "./nearbyStationSchedules";
import { createTransportLineSearchOption } from "../transport-map/overlays/ghostLineDirections";
import type { NearbyStationEntry } from "./nearbyStations";
import type { NearbyHeavyTransportCandidate } from "./nearbyHeavyTransports";

const SCHEDULE_LOAD_CONCURRENCY = 4;
const SCHEDULE_CANDIDATE_TIMEOUT_MS = 12_000;

export interface NearbyStationScheduleSource {
  stations: { value: NearbyStationEntry[] };
  activeModes: { value: GlobalMapMode[] };
  extraCandidates?: { value: NearbyHeavyTransportCandidate[] };
}

export interface UseNearbyStationSchedulesOptions {
  visibilityStore?: ScheduleVisibilityStore;
}

const scheduleMetadataCache = new Map<string, Promise<NearbyStationScheduleMetadata>>();

export function useNearbyStationSchedules(
  source: NearbyStationScheduleSource,
  options: UseNearbyStationSchedulesOptions = {},
) {
  const items = ref<NearbyStationScheduleItem[]>([]);
  const hiddenStationIds = ref<Set<string>>(new Set());
  const isRefreshing = ref(false);
  const updatedAt = ref<Date>();
  const requestToken = ref(0);
  const hiddenDirectionIds = ref<Set<string>>(new Set());
  const removedItemIds = ref<Set<string>>(new Set());
  let refreshTimer: number | undefined;
  let refreshInFlight = false;
  let refreshPending = false;
  let activeRefreshSignature = "";

  const localVisibilityStore: ScheduleVisibilityStore = {
    isStationHidden: (stationId) => hiddenStationIds.value.has(stationId),
    isDirectionHidden: (directionId) => hiddenDirectionIds.value.has(directionId),
    toggleStation: (stationId) => {
      const next = new Set(hiddenStationIds.value);
      if (next.has(stationId)) next.delete(stationId);
      else next.add(stationId);
      hiddenStationIds.value = next;
    },
    toggleDirection: (directionId) => {
      const next = new Set(hiddenDirectionIds.value);
      if (next.has(directionId)) next.delete(directionId);
      else next.add(directionId);
      hiddenDirectionIds.value = next;
    },
    reset: () => {
      hiddenStationIds.value = new Set();
      hiddenDirectionIds.value = new Set();
    },
  };
  const visibilityStore = options.visibilityStore ?? localVisibilityStore;
  const candidates = computed(() => [
    ...selectNearbyScheduleCandidates(
      source.stations.value,
      source.activeModes.value,
      undefined,
      selectSupplementalScheduleCandidates(source.extraCandidates?.value ?? [], source.activeModes.value),
    ),
  ].filter((candidate) => !removedItemIds.value.has(candidate.id)));
  const activeItems = computed(() => items.value.filter((item) =>
    source.activeModes.value.includes(item.line.mode),
  ));
  const visibleItems = computed(() => activeItems.value.filter((item) => item.state === "visible"));

  function candidateSignature(): string {
    return candidates.value
      .map((candidate) => `${candidate.id}:${Math.round(candidate.distanceMeters)}`)
      .join("|");
  }

  function scheduleState(stationId: string): NearbyStationScheduleState | undefined {
    const stationCandidates = candidates.value.filter((candidate) => candidate.stationId === stationId);
    const stationItems = activeItems.value.filter((item) => item.stationId === stationId);
    if (stationCandidates.length === 0 && stationItems.length === 0) return undefined;
    if (stationItems.length === 0 || stationItems.some((item) => item.state === "loading")) return "loading";
    if (stationItems.every((item) => item.state === "unavailable")) return "unavailable";
    return visibilityStore.isStationHidden(stationId) ? "hidden" : "visible";
  }

  function toggleStationSchedule(stationId: string): void {
    visibilityStore.toggleStation(stationId);
    items.value = items.value.map((item) => {
      if (item.stationId !== stationId || item.state === "unavailable" || item.state === "loading") {
        return item;
      }
      return { ...item, state: visibilityStore.isStationHidden(stationId) ? "hidden" : "visible" };
    });
  }

  function resetVisibility(): void {
    visibilityStore.reset();
    removedItemIds.value = new Set();
    items.value = items.value.map((item) =>
      item.state === "hidden" ? { ...item, state: "visible" } : item,
    );
  }

  function toggleDirection(itemId: string, directionId: string): void {
    visibilityStore.toggleDirection(scheduleDirectionId(itemId, directionId));
  }

  function isDirectionVisible(itemId: string, directionId: string): boolean {
    return !visibilityStore.isDirectionHidden(scheduleDirectionId(itemId, directionId));
  }

  function setHiddenDirections(itemId: string, directionIds: readonly string[]): void {
    const hidden = new Set(directionIds);
    const item = items.value.find((candidate) => candidate.id === itemId);
    for (const group of item?.result?.directionGroups ?? []) {
      if (visibilityStore.isDirectionHidden(scheduleDirectionId(itemId, group.id)) !== hidden.has(group.id)) {
        visibilityStore.toggleDirection(scheduleDirectionId(itemId, group.id));
      }
    }
  }

  function removeItem(itemId: string): void {
    removedItemIds.value = new Set(removedItemIds.value).add(itemId);
    items.value = items.value.filter((item) => item.id !== itemId);
  }

  async function refresh(): Promise<void> {
    const nextSignature = candidateSignature();
    if (refreshInFlight) {
      if (nextSignature !== activeRefreshSignature) refreshPending = true;
      return;
    }

    refreshInFlight = true;
    activeRefreshSignature = nextSignature;
    const token = requestToken.value + 1;
    requestToken.value = token;
    if (refreshTimer !== undefined) {
      window.clearTimeout(refreshTimer);
      refreshTimer = undefined;
    }

    const currentCandidates = candidates.value;
    if (currentCandidates.length === 0) {
      items.value = [];
      isRefreshing.value = false;
      updatedAt.value = undefined;
      refreshInFlight = false;
      return;
    }

    isRefreshing.value = true;
    // Keep hydrated boards mounted while the next snapshot is fetched.  The
    // loading state is reserved for candidates that have never produced a
    // board; replacing every item with a loading placeholder here caused the
    // map badges and the sidebar cards to pop out and back in on each refresh.
    items.value = mergeNearbyScheduleRefreshItems(currentCandidates, items.value);

    try {
      const hydrated = await mapWithConcurrency(
        currentCandidates,
        SCHEDULE_LOAD_CONCURRENCY,
        hydrateCandidate,
        (item) => {
          if (token !== requestToken.value) return;
          items.value = items.value.map((current) =>
            current.id === item.id ? normalizeHydratedItem(item, visibilityStore) : current,
          );
        },
      );
      if (token !== requestToken.value) return;

      items.value = hydrated.map((item) => normalizeHydratedItem(item, visibilityStore));
      updatedAt.value = new Date();
    } finally {
      if (token === requestToken.value) {
        isRefreshing.value = false;
        refreshInFlight = false;
        const signatureChanged = candidateSignature() !== activeRefreshSignature;
        if (refreshPending || signatureChanged) {
          refreshPending = false;
          void refresh();
        }
      }
    }
  }

  async function refreshSoon(): Promise<void> {
    if (typeof window === "undefined") return;
    if (document.visibilityState === "hidden") return;
    if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshTimer = undefined;
      void refresh();
    }, 80);
  }

  async function hydrateCandidate(
    candidate: NearbyStationScheduleCandidate,
  ): Promise<NearbyStationScheduleItem> {
    const abortController = new AbortController();

    try {
      return await withTimeout(
        hydrateCandidateWithoutTimeout(candidate, abortController.signal),
        SCHEDULE_CANDIDATE_TIMEOUT_MS,
        "schedule-timeout",
        () => abortController.abort(),
      );
    } catch (cause) {
      return {
        ...candidate,
        state: "unavailable",
        error: cause instanceof Error ? cause.message : "schedule-unavailable",
      };
    }
  }

  async function hydrateCandidateWithoutTimeout(
    candidate: NearbyStationScheduleCandidate,
    signal: AbortSignal,
  ): Promise<NearbyStationScheduleItem> {
    const lineOption = createTransportLineSearchOption(candidate.line);
    if (!lineOption) throw new Error("unsupported-line");

    const requestOptions = { signal };
    const { station, metadata } = await resolveScheduleMetadata(
      lineOption,
      candidate,
      requestOptions,
    );
    const result = await fetchBoardDepartures(metadata.board, requestOptions);
    return {
      ...candidate,
      state: "visible",
      station,
      lineOption,
      board: metadata.board,
      result,
      tooltipDirections: metadata.tooltipDirections.length > 0
        ? metadata.tooltipDirections
        : result.directionGroups.map((group) => ({
          id: group.id,
          label: group.label,
        })),
    };
  }

  async function resolveScheduleMetadata(
    lineOption: NonNullable<ReturnType<typeof createTransportLineSearchOption>>,
    candidate: NearbyStationScheduleCandidate,
    requestOptions: { signal: AbortSignal },
  ): Promise<{
    station: StationSearchOption;
    metadata: NearbyStationScheduleMetadata;
  }> {
    const station = createRealtimeStationOption(candidate);

    return {
      station,
      metadata: await getScheduleMetadata(
        lineOption,
        station,
        candidate,
        requestOptions,
      ),
    };
  }

  function getScheduleMetadata(
    line: NonNullable<ReturnType<typeof createTransportLineSearchOption>>,
    station: StationSearchOption,
    candidate: NearbyStationScheduleCandidate,
    requestOptions: { signal: AbortSignal },
  ): Promise<NearbyStationScheduleMetadata> {
    const cacheKey = `${line.navitiaId}:${candidate.stationId}`;
    const cached = scheduleMetadataCache.get(cacheKey);
    if (cached) return cached;

    const request = fetchCachedLineRouteSequences(
      line,
      true,
      requestOptions.signal,
    ).catch(() => []).then((sequences) => {
      const directionGroups = createNearbyDirectionGroupsFromTopology(candidate, sequences);
      const tooltipDirections = createNearbyTooltipDirectionsFromTopology(candidate, sequences);
      const resolvedStation = addTopologyScheduleStopAreaRef(station, directionGroups);
      const board = createBoardFromDraft(
        { family: line.family, line, station: resolvedStation },
        directionGroups,
      );
      board.maxDeparturesPerDirection = 4;

      return {
        station: resolvedStation,
        line,
        directionGroups,
        board,
        tooltipDirections,
      };
    });
    scheduleMetadataCache.set(cacheKey, request);
    void request.catch(() => {
      if (scheduleMetadataCache.get(cacheKey) === request) scheduleMetadataCache.delete(cacheKey);
    });
    return request;
  }

  watch(candidateSignature, () => void refreshSoon(), { immediate: true });

  let refreshInterval: number | undefined;

  onMounted(() => {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (document.visibilityState !== "hidden") void refresh();
    refreshInterval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refresh();
    }, 30_000);
  });

  onBeforeUnmount(() => {
    requestToken.value += 1;
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    if (refreshInterval !== undefined) window.clearInterval(refreshInterval);
    if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
  });

  function handleVisibilityChange(): void {
    if (document.visibilityState !== "hidden") void refresh();
  }

  return {
    candidates,
    // Keep the public collection read-only by convention without exposing
    // Vue's deeply-readonly wrapper, which would make board line options
    // incompatible with the existing TransitBoard contracts in templates.
    items: computed(() => items.value),
    visibleItems,
    isRefreshing: readonly(isRefreshing),
    updatedAt: readonly(updatedAt),
    scheduleState,
    toggleStationSchedule,
    resetVisibility,
    resetAllVisibility: resetVisibility,
    toggleDirection,
    isDirectionVisible,
    setHiddenDirections,
    removeItem,
    visibilityStore,
    refresh,
  };
}

function normalizeHydratedItem(
  item: NearbyStationScheduleItem,
  visibilityStore: ScheduleVisibilityStore,
): NearbyStationScheduleItem {
  return {
    ...item,
    state: item.state === "unavailable"
      ? "unavailable"
      : visibilityStore.isStationHidden(item.stationId)
        ? "hidden"
        : "visible",
  };
}

function createRealtimeStationOption(
  candidate: NearbyStationScheduleCandidate,
): StationSearchOption {
  const servingStations = candidate.entry.memberStations.filter((station) =>
    station.lineIds.includes(candidate.line.id),
  );
  const references = servingStations.flatMap((station) => [station.id, ...station.rawRefs]);
  const monitoringRef = references
    .map(idfmReferenceToMonitoringRef)
    .find((reference): reference is string => Boolean(reference));
  const station = candidate.mapStation;

  return {
    id: station.id,
    label: candidate.entry.station.name || station.name,
    city: candidate.entry.station.city ?? station.city,
    lon: station.lon,
    lat: station.lat,
    monitoringRef: monitoringRef ?? station.rawRefs[0] ?? station.id,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          onTimeout?.();
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
  onResolved?: (result: R, index: number) => void,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), values.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const result = await worker(values[index]);
      results[index] = result;
      onResolved?.(result, index);
    }
  }));

  return results;
}
