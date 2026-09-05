import { computed, onBeforeUnmount, onMounted, readonly, ref, shallowReadonly, shallowRef, toValue, watch, type MaybeRefOrGetter } from "vue";
import type { GeocoderPoint, TransportMapGeocoder } from "../transport-map/contracts/geocoder";
import { GLOBAL_MAP_MODE_ORDER, type GlobalMapMode } from "../transport-map/contracts/manifest";
import type { TransportMapNetwork, TransportMapViewportResult } from "../transport-map/contracts/network";
import { TransportMapDataSource } from "../transport-map/data/createTransportMapDataSource";
import type { CameraState } from "../transport-map/geo/camera";
import { GeocodingApiError, createIgnTransportMapGeocoder } from "./geocoding";
import {
  NEARBY_MAP_MARGIN_METERS,
  NEARBY_CLUSTER_GROUPING_DEFAULT_METERS,
  NEARBY_RADIUS_DEFAULT_METERS,
  NEARBY_SUPPORTED_MODES,
  buildNearbyStationEntries,
  normalizeNearbyClusterGrouping,
  normalizeNearbyRadius,
  selectionToDashboardTargets,
  type NearbyStationEntry,
  type NearbyStationSelection,
} from "./nearbyStations";
import type { NearbyStationsDraft } from "./nearbyStationsDraft";

export type NearbyStationsErrorType =
  | "api_limit_reached"
  | "address_not_found"
  | "geocoding_unavailable"
  | "map_data_unavailable"
  | "geolocation_denied"
  | "geolocation_unavailable"
  | "unknown";

export interface NearbyStationsError {
  type: NearbyStationsErrorType;
  message?: string;
  retryable: boolean;
}

export interface UseNearbyStationsOptions {
  enabled?: MaybeRefOrGetter<boolean>;
  geocoder?: TransportMapGeocoder;
  createDataSource?: () => TransportMapDataSource;
  initialDraft?: NearbyStationsDraft;
}

export function useNearbyStations(options: UseNearbyStationsOptions = {}) {
  const geocoder = options.geocoder ?? createIgnTransportMapGeocoder();
  const query = ref(options.initialDraft?.query ?? "");
  const suggestions = ref<GeocoderPoint[]>([]);
  const selectedPlace = ref<GeocoderPoint | undefined>(options.initialDraft?.selectedPlace);
  const radius = ref(options.initialDraft?.radius ?? NEARBY_RADIUS_DEFAULT_METERS);
  const clusterGroupingDistanceMeters = ref(normalizeNearbyClusterGrouping(
    options.initialDraft?.clusterGroupingDistanceMeters ?? NEARBY_CLUSTER_GROUPING_DEFAULT_METERS,
  ));
  const stations = ref<NearbyStationEntry[]>([]);
  const selections = ref<NearbyStationSelection[]>(options.initialDraft?.selections ?? []);
  const activeModes = ref<GlobalMapMode[]>(options.initialDraft?.activeModes ?? [...NEARBY_SUPPORTED_MODES]);
  const isSuggesting = ref(false);
  const isScanning = ref(false);
  const error = ref<NearbyStationsError>();
  const isError = computed(() => Boolean(error.value));
  const errorType = computed(() => error.value?.type);
  const selectedStationCount = computed(() => selections.value.filter((selection) => selection.lineIds.length > 0).length);
  const selectedBoardCount = computed(() => selections.value.reduce((count, selection) => count + selection.lineIds.length, 0));
  const selectedTargets = computed(() => selectionToDashboardTargets(stations.value, selections.value));
  const visibleStations = computed(() => stations.value.filter((entry) => entry.lines.some((line) => activeModes.value.includes(line.mode))));
  const transportMapNetwork = shallowRef<TransportMapNetwork>();
  const enabled = computed(() => options.enabled === undefined ? true : toValue(options.enabled));

  const suggestionCache = new Map<string, GeocoderPoint[]>();
  let suggestionTimer: number | undefined;
  let scanTimer: number | undefined;
  let suggestionController: AbortController | undefined;
  let scanController: AbortController | undefined;
  let source: TransportMapDataSource | undefined;
  let sourcePromise: Promise<TransportMapDataSource> | undefined;
  let disposed = false;

  watch(query, (value) => {
    if (selectedPlace.value?.label === value) return;
    selectedPlace.value = undefined;
    stations.value = [];
    selections.value = [];
    scheduleSuggestions(value);
  });

  watch(radius, (value) => {
    const normalized = normalizeNearbyRadius(value);
    if (normalized !== value) {
      radius.value = normalized;
      return;
    }
    if (!selectedPlace.value || !enabled.value) return;
    scheduleStationScan();
  });

  watch(clusterGroupingDistanceMeters, (value) => {
    const normalized = normalizeNearbyClusterGrouping(value);
    if (normalized !== value) {
      clusterGroupingDistanceMeters.value = normalized;
      return;
    }
    if (!selectedPlace.value || !enabled.value) return;
    scheduleStationScan();
  });

  function scheduleStationScan(): void {
    if (scanTimer !== undefined) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => void scanNearbyStations(), 120);
  }

  watch(enabled, (value) => {
    if (value) return;
    abortPending();
    suggestions.value = [];
  });

  onMounted(() => {
    if (enabled.value && selectedPlace.value) void scanNearbyStations();
  });

  function scheduleSuggestions(value: string): void {
    if (suggestionTimer !== undefined) window.clearTimeout(suggestionTimer);
    suggestionController?.abort();
    const normalized = value.trim().toLocaleLowerCase("fr-FR");
    if (!enabled.value || normalized.length < 3) {
      suggestions.value = [];
      isSuggesting.value = false;
      return;
    }
    const cached = suggestionCache.get(normalized);
    if (cached) {
      suggestions.value = cached;
      return;
    }
    suggestionTimer = window.setTimeout(() => void loadSuggestions(value.trim(), normalized), 280);
  }

  async function loadSuggestions(value: string, cacheKey: string): Promise<void> {
    if (!geocoder.autocomplete) return;
    const controller = new AbortController();
    suggestionController = controller;
    isSuggesting.value = true;
    try {
      const results = await geocoder.autocomplete(value, controller.signal);
      if (controller.signal.aborted) return;
      suggestionCache.set(cacheKey, results);
      suggestions.value = results;
      error.value = undefined;
    } catch (cause) {
      if (!controller.signal.aborted) error.value = normalizeError(cause, "geocoding_unavailable");
    } finally {
      if (suggestionController === controller) suggestionController = undefined;
      if (!controller.signal.aborted) isSuggesting.value = false;
    }
  }

  async function searchAddress(): Promise<boolean> {
    const value = query.value.trim();
    if (value.length < 3) return false;
    const controller = new AbortController();
    suggestionController?.abort();
    suggestionController = controller;
    isSuggesting.value = true;
    try {
      const result = (await geocoder.geocode(value, controller.signal))[0];
      if (!result) {
        error.value = { type: "address_not_found", retryable: false };
        return false;
      }
      await selectPlace(result);
      return true;
    } catch (cause) {
      if (!controller.signal.aborted) error.value = normalizeError(cause, "geocoding_unavailable");
      return false;
    } finally {
      if (suggestionController === controller) suggestionController = undefined;
      isSuggesting.value = false;
    }
  }

  async function selectPlace(place: GeocoderPoint): Promise<void> {
    selectedPlace.value = place;
    query.value = place.label ?? query.value;
    suggestions.value = [];
    error.value = undefined;
    await scanNearbyStations();
  }

  async function useCoordinates(point: Pick<GeocoderPoint, "lon" | "lat">): Promise<void> {
    let place: GeocoderPoint = { ...point, provider: "device" };
    if (geocoder.reverseGeocode) {
      try {
        place = (await geocoder.reverseGeocode(point))[0] ?? place;
      } catch {
        // Coordinates are sufficient for the local station scan.
      }
    }
    await selectPlace({ ...place, label: place.label ?? `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}` });
  }

  async function scanNearbyStations(): Promise<void> {
    const place = selectedPlace.value;
    if (!place) return;
    scanController?.abort();
    const controller = new AbortController();
    scanController = controller;
    isScanning.value = true;
    try {
      const dataSource = await ensureSource();
      const results = await dataSource.queryStationsWithinRadius(
        place.lon,
        place.lat,
        radius.value + NEARBY_MAP_MARGIN_METERS,
      );
      if (controller.signal.aborted) return;
      transportMapNetwork.value = dataSource.getNetwork();
      stations.value = buildNearbyStationEntries(
        results,
        dataSource.getNetwork(),
        place,
        radius.value,
        { clusterGroupingDistanceMeters: clusterGroupingDistanceMeters.value },
      );
      pruneSelections();
      error.value = undefined;
    } catch (cause) {
      if (!controller.signal.aborted) error.value = normalizeError(cause, "map_data_unavailable");
    } finally {
      if (scanController === controller) scanController = undefined;
      if (!controller.signal.aborted) isScanning.value = false;
    }
  }

  function toggleStation(stationId: string): void {
    const existing = selections.value.find((selection) => selection.stationId === stationId);
    if (existing) {
      selections.value = selections.value.filter((selection) => selection.stationId !== stationId);
      return;
    }
    const entry = stations.value.find((station) => station.id === stationId);
    if (!entry) return;
    const lineIds = entry.lines.filter((line) => activeModes.value.includes(line.mode)).map((line) => line.id);
    if (lineIds.length > 0) selections.value = [...selections.value, { stationId, lineIds }];
  }

  function toggleLine(stationId: string, lineId: string): void {
    const current = selections.value.find((selection) => selection.stationId === stationId);
    if (!current) {
      const entry = stations.value.find((station) => station.id === stationId);
      if (entry?.lines.some((line) => line.id === lineId)) {
        selections.value = [...selections.value, { stationId, lineIds: [lineId] }];
      }
      return;
    }
    const lineIds = current.lineIds.includes(lineId)
      ? current.lineIds.filter((id) => id !== lineId)
      : [...current.lineIds, lineId];
    selections.value = lineIds.length === 0
      ? selections.value.filter((selection) => selection.stationId !== stationId)
      : selections.value.map((selection) => selection.stationId === stationId ? { ...selection, lineIds } : selection);
  }

  function toggleMode(mode: GlobalMapMode): void {
    activeModes.value = activeModes.value.includes(mode)
      ? activeModes.value.filter((candidate) => candidate !== mode)
      : [...activeModes.value, mode];
    pruneSelections();
  }

  function setActiveModes(modes: readonly GlobalMapMode[]): void {
    const selected = new Set(modes);
    activeModes.value = GLOBAL_MAP_MODE_ORDER.filter(
      (mode) => NEARBY_SUPPORTED_MODES.includes(mode) && selected.has(mode),
    );
    pruneSelections();
  }

  function clearSelection(): void {
    selections.value = [];
  }

  function selectedLineIds(stationId: string): string[] {
    return selections.value.find((selection) => selection.stationId === stationId)?.lineIds ?? [];
  }

  function setError(type: NearbyStationsErrorType, message?: string): void {
    error.value = { type, message, retryable: type !== "address_not_found" && type !== "geolocation_denied" };
  }

  function clearError(): void {
    error.value = undefined;
  }

  async function queryTransportMapViewport(
    camera: CameraState,
    detailLineId?: string,
    forcedLineIds: readonly string[] = [],
  ): Promise<TransportMapViewportResult> {
    const dataSource = await ensureSource();
    const result = await dataSource.queryViewport(
      camera,
      modeMask(activeModes.value),
      camera.generation,
      detailLineId,
      forcedLineIds,
    );
    transportMapNetwork.value = dataSource.getNetwork();
    return result;
  }

  function createDraft(): NearbyStationsDraft {
    return {
      query: query.value,
      selectedPlace: selectedPlace.value ? { ...selectedPlace.value } : undefined,
      radius: radius.value,
      clusterGroupingDistanceMeters: clusterGroupingDistanceMeters.value,
      activeModes: [...activeModes.value],
      selections: selections.value.map((selection) => ({ ...selection, lineIds: [...selection.lineIds] })),
    };
  }

  function pruneSelections(): void {
    const linesByStation = new Map(stations.value.map((entry) => [entry.id, new Set(
      entry.lines.filter((line) => activeModes.value.includes(line.mode)).map((line) => line.id),
    )]));
    selections.value = selections.value.flatMap((selection) => {
      const allowed = linesByStation.get(selection.stationId);
      if (!allowed) return [];
      const lineIds = selection.lineIds.filter((id) => allowed.has(id));
      return lineIds.length > 0 ? [{ ...selection, lineIds }] : [];
    });
  }

  async function ensureSource(): Promise<TransportMapDataSource> {
    if (source) return source;
    if (sourcePromise) return sourcePromise;
    const next = options.createDataSource?.() ?? new TransportMapDataSource();
    sourcePromise = next.initialize().then((network) => {
      if (disposed) {
        next.dispose();
        throw new DOMException("Nearby station selector disposed", "AbortError");
      }
      transportMapNetwork.value = network;
      source = next;
      return next;
    });
    try {
      return await sourcePromise;
    } catch (cause) {
      next.dispose();
      throw cause;
    } finally {
      sourcePromise = undefined;
    }
  }

  function abortPending(): void {
    suggestionController?.abort();
    scanController?.abort();
    if (suggestionTimer !== undefined) window.clearTimeout(suggestionTimer);
    if (scanTimer !== undefined) window.clearTimeout(scanTimer);
    isSuggesting.value = false;
    isScanning.value = false;
  }

  onBeforeUnmount(() => {
    disposed = true;
    abortPending();
    source?.dispose();
    transportMapNetwork.value = undefined;
  });

  return {
    query,
    suggestions,
    selectedPlace,
    radius,
    clusterGroupingDistanceMeters,
    stations,
    transportMapNetwork: shallowReadonly(transportMapNetwork),
    visibleStations,
    selections,
    activeModes,
    isSuggesting: readonly(isSuggesting),
    isScanning: readonly(isScanning),
    isError,
    error: readonly(error),
    errorType,
    selectedStationCount,
    selectedBoardCount,
    selectedTargets,
    searchAddress,
    selectPlace,
    useCoordinates,
    scanNearbyStations,
    queryTransportMapViewport,
    toggleStation,
    toggleLine,
    toggleMode,
    setActiveModes,
    clearSelection,
    selectedLineIds,
    setError,
    clearError,
    createDraft,
  };
}

function modeMask(modes: readonly GlobalMapMode[]): number {
  return modes.reduce((mask, mode) => {
    const index = GLOBAL_MAP_MODE_ORDER.indexOf(mode);
    return index < 0 ? mask : mask | (1 << index);
  }, 0);
}

function normalizeError(cause: unknown, fallback: NearbyStationsErrorType): NearbyStationsError {
  if (cause instanceof GeocodingApiError && cause.status === 429) {
    return { type: "api_limit_reached", message: cause.message, retryable: true };
  }
  return { type: fallback, message: cause instanceof Error ? cause.message : undefined, retryable: true };
}
