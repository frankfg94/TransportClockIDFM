import { computed, nextTick, ref, shallowRef } from "vue";
import type { LineRouteSequence } from "../../types/transit";
import { fetchLineRouteSequences } from "../../services/idfm";
import { fetchResolvedLineGeometry } from "../../services/lineGeometry";
import type { TransportMapNetwork } from "../transport-map/contracts/network";
import type {
  GlobalMapLine,
  GlobalMapPath,
  GlobalMapStation,
} from "../transport-map/contracts/manifest";
import { lonLatToWorld } from "../transport-map/geo/coordinateKernel";
import {
  getGlobalBusDirectionEdgeKeys,
  getGlobalBusDirectionOrderedStopIds,
  getGlobalBusDirectionQuays,
  getGlobalBusDirectionStationIds,
  resolveGlobalDirection,
} from "./globalBusDirections";
import {
  createGlobalBusDirectionGeometryPath,
  createGlobalBusDirectionGeometryRequest,
  hasSingleConnectedGlobalMapPathGeometry,
} from "./globalBusDirectionGeometry";
import {
  defaultGlobalDirectionMerge,
  GLOBAL_MERGED_DIRECTION_ID,
  type BusMapDirectionSelection,
} from "./lineMapData";
import { createTransportLineSearchOption } from "../transport-map/overlays/ghostLineDirections";
import { resolveTransitLonLat } from "../network-ghost/geoProjection";
import type { GlobalMapQuayMarker } from "../transport-map/contracts/renderer";

export interface UseGlobalLineDirectionsOptions {
  getNetwork: () => TransportMapNetwork | undefined;
  getActiveLine: () => GlobalMapLine | undefined;
  getRouteQuery: (key: string) => unknown;
  getStaticLineMetadataPaths: () => readonly GlobalMapPath[];
  clearActiveTrafficDisruption: () => void;
  syncRoute: () => void;
  draw: () => void;
}

export function supportsGlobalLineDirections(line: GlobalMapLine | undefined): line is GlobalMapLine {
  return Boolean(line && line.mode !== "BIKE");
}

export function supportsGlobalBusDirections(line: GlobalMapLine | undefined): line is GlobalMapLine {
  return line?.mode === "BUS" || line?.mode === "NOCTILIEN";
}

/**
 * Owns the asynchronous direction selection shared by the global map and its
 * route restoration.  The composable deliberately exposes state rather than
 * a renderer-specific API: geometry remains a normal GlobalMapPath and can be
 * consumed by Canvas2D today or another renderer later.
 */
export function useGlobalLineDirections(options: UseGlobalLineDirectionsOptions) {
  const busDirectionSelection = shallowRef<BusMapDirectionSelection>();
  const busDirectionSequences = shallowRef<LineRouteSequence[]>([]);
  const directionMergeEnabled = ref(false);
  const directionFilterRequested = ref(false);
  const directionStateReady = ref(false);
  const busDirectionLoading = ref(false);
  const busDirectionGeometryPaths = shallowRef<GlobalMapPath[]>([]);
  const unavailableBusDirectionGeometryKey = shallowRef<string>();

  let busDirectionRequestToken = 0;
  let busDirectionGeometryRequestToken = 0;
  const busDirectionSequenceCache = new Map<string, Promise<LineRouteSequence[]>>();
  const busDirectionGeometryCache = new Map<string, Promise<GlobalMapPath | undefined>>();

  const selectedDirectionButtonId = computed(() =>
    directionMergeEnabled.value
      ? GLOBAL_MERGED_DIRECTION_ID
      : busDirectionSelection.value?.selectedMainDirectionId,
  );

  const selectedBusDirectionStationIds = computed<string[] | undefined>(() => {
    const line = options.getActiveLine();
    const direction = busDirectionSelection.value;
    if (
      !supportsGlobalLineDirections(line) ||
      !directionFilterRequested.value ||
      !direction ||
      direction.options.length < 2
    ) {
      return undefined;
    }

    const stationIds = getGlobalBusDirectionStationIds(
      line,
      direction,
      options.getNetwork()?.stations ?? [],
    );
    return stationIds.length > 1 ? stationIds : undefined;
  });

  const selectedBusDirectionStationSet = computed<ReadonlySet<string> | undefined>(() => {
    const stationIds = selectedBusDirectionStationIds.value;
    return stationIds ? new Set(stationIds) : undefined;
  });

  const selectedBusDirectionEdgeKeys = computed<ReadonlySet<string> | undefined>(() => {
    const line = options.getActiveLine();
    const direction = busDirectionSelection.value;
    if (
      !supportsGlobalLineDirections(line) ||
      !directionFilterRequested.value ||
      !direction ||
      direction.options.length < 2
    ) {
      return undefined;
    }

    const edgeKeys = getGlobalBusDirectionEdgeKeys(
      line,
      direction,
      options.getNetwork()?.stations ?? [],
    );
    return edgeKeys.size > 0 ? edgeKeys : undefined;
  });

  const selectedBusDirectionQuays = computed<GlobalMapQuayMarker[]>(() => {
    const line = options.getActiveLine();
    const direction = busDirectionSelection.value;
    if (!supportsGlobalLineDirections(line) || !directionFilterRequested.value || !direction) {
      return [];
    }

    return getGlobalBusDirectionQuays(line, direction, options.getNetwork()?.stations ?? []).flatMap(
      ({ stationId, quay }) => {
        const coordinate = resolveTransitLonLat(quay);
        if (!coordinate) return [];

        const world = lonLatToWorld(coordinate);
        return [
          {
            id: `quay-marker:${line.id}:${stationId}:${quay.id}`,
            stationId,
            name: quay.name,
            worldX: world.x,
            worldY: world.y,
          },
        ];
      },
    );
  });

  function directionMergePreference(line: GlobalMapLine): boolean {
    const queryLine = queryString(options.getRouteQuery("line"));
    const queryPreference =
      queryLine === line.id ? queryString(options.getRouteQuery("mergeDirections")) : undefined;
    return queryPreference === undefined
      ? defaultGlobalDirectionMerge(line.mode)
      : hasQueryFlag(queryPreference);
  }

  function hasExplicitDirectionMergePreference(line: GlobalMapLine): boolean {
    return (
      queryString(options.getRouteQuery("line")) === line.id &&
      queryString(options.getRouteQuery("mergeDirections")) !== undefined
    );
  }

  function resetBusDirectionState(): void {
    busDirectionRequestToken += 1;
    busDirectionGeometryRequestToken += 1;
    busDirectionSelection.value = undefined;
    busDirectionSequences.value = [];
    directionMergeEnabled.value = false;
    directionFilterRequested.value = false;
    directionStateReady.value = false;
    busDirectionGeometryPaths.value = [];
    unavailableBusDirectionGeometryKey.value = undefined;
    busDirectionLoading.value = false;
  }

  function getCachedBusDirectionSequences(line: GlobalMapLine): Promise<LineRouteSequence[]> {
    const cached = busDirectionSequenceCache.get(line.id);
    if (cached) return cached;

    const lineOption = createTransportLineSearchOption(line);
    const request = lineOption ? fetchLineRouteSequences(lineOption, true) : Promise.resolve([]);
    busDirectionSequenceCache.set(line.id, request);
    void request.catch(() => {
      if (busDirectionSequenceCache.get(line.id) === request) {
        busDirectionSequenceCache.delete(line.id);
      }
    });
    return request;
  }

  async function loadBusDirection(lineId: string, requestedDirectionId?: string): Promise<void> {
    const line = options.getNetwork()?.linesById.get(lineId);
    if (!supportsGlobalLineDirections(line)) {
      resetBusDirectionState();
      return;
    }

    directionStateReady.value = false;
    directionMergeEnabled.value = directionMergePreference(line);
    if (
      requestedDirectionId &&
      !(directionMergeEnabled.value && hasExplicitDirectionMergePreference(line))
    ) {
      directionMergeEnabled.value = false;
    }
    directionFilterRequested.value = !directionMergeEnabled.value;
    const selectedDirectionId = directionMergeEnabled.value ? undefined : requestedDirectionId;

    const requestToken = ++busDirectionRequestToken;
    busDirectionLoading.value = true;
    busDirectionSelection.value = undefined;
    busDirectionSequences.value = [];

    try {
      const sequences = await getCachedBusDirectionSequences(line);
      if (
        requestToken !== busDirectionRequestToken ||
        options.getActiveLine()?.id !== lineId
      ) {
        return;
      }

      busDirectionSequences.value = sequences;
      busDirectionSelection.value = resolveGlobalDirection(sequences, selectedDirectionId);
      if (supportsGlobalBusDirections(line) && directionFilterRequested.value) {
        void resolveBusDirectionGeometry(line, busDirectionSelection.value);
      }
    } catch (error) {
      if (
        requestToken === busDirectionRequestToken &&
        options.getActiveLine()?.id === lineId
      ) {
        busDirectionSequences.value = [];
        busDirectionSelection.value = undefined;
        console.warn(
          "[global-map] bus direction unavailable line=" + lineId,
          error instanceof Error ? error.message : error,
        );
      }
    } finally {
      if (requestToken === busDirectionRequestToken) {
        busDirectionLoading.value = false;
        directionStateReady.value = true;
        options.syncRoute();
        options.draw();
      }
    }
  }

  function changeBusDirection(directionId: string): void {
    const line = options.getActiveLine();
    if (!supportsGlobalLineDirections(line) || busDirectionSequences.value.length === 0) return;

    directionMergeEnabled.value = false;
    const selectionForDirection = resolveGlobalDirection(busDirectionSequences.value, directionId);
    if (!selectionForDirection) return;

    directionFilterRequested.value = true;
    options.clearActiveTrafficDisruption();
    busDirectionSelection.value = selectionForDirection;
    if (supportsGlobalBusDirections(line)) {
      void resolveBusDirectionGeometry(line, selectionForDirection);
    }
    options.syncRoute();
    options.draw();
  }

  function toggleMergedDirections(): void {
    const line = options.getActiveLine();
    if (!supportsGlobalLineDirections(line) || busDirectionSequences.value.length === 0) return;

    directionMergeEnabled.value = !directionMergeEnabled.value;
    options.clearActiveTrafficDisruption();
    directionFilterRequested.value = !directionMergeEnabled.value;
    busDirectionSelection.value = resolveGlobalDirection(busDirectionSequences.value);

    if (supportsGlobalBusDirections(line) && directionFilterRequested.value) {
      void resolveBusDirectionGeometry(line, busDirectionSelection.value);
    } else {
      busDirectionGeometryRequestToken += 1;
      busDirectionGeometryPaths.value = [];
      unavailableBusDirectionGeometryKey.value = undefined;
    }

    options.syncRoute();
    options.draw();
  }

  async function resolveBusDirectionGeometry(
    line: GlobalMapLine,
    direction: BusMapDirectionSelection | undefined,
  ): Promise<void> {
    const requestToken = ++busDirectionGeometryRequestToken;
    busDirectionGeometryPaths.value = [];
    unavailableBusDirectionGeometryKey.value = undefined;
    if (!direction) return;

    await nextTick();
    if (
      requestToken !== busDirectionGeometryRequestToken ||
      options.getActiveLine()?.id !== line.id ||
      hasSingleConnectedGlobalMapPathGeometry(
        options.getStaticLineMetadataPaths(),
        options.getNetwork()?.stationsById ?? new Map<string, GlobalMapStation>(),
      )
    ) {
      return;
    }

    const stationIds = getGlobalBusDirectionOrderedStopIds(
      line,
      direction,
      options.getNetwork()?.stations ?? [],
    );
    const request = createGlobalBusDirectionGeometryRequest(line, direction);
    if (!request || stationIds.length !== request.stops.length) return;

    const cacheKey = `${line.id}:${direction.selectedDirectionId}`;
    let geometry = busDirectionGeometryCache.get(cacheKey);
    if (!geometry) {
      geometry = fetchResolvedLineGeometry(request)
        .then((resolution) =>
          createGlobalBusDirectionGeometryPath(line, direction, stationIds, resolution),
        )
        .catch(() => undefined);
      busDirectionGeometryCache.set(cacheKey, geometry);
    }
    const path = await geometry;
    if (
      path &&
      requestToken === busDirectionGeometryRequestToken &&
      options.getActiveLine()?.id === line.id &&
      busDirectionSelection.value?.selectedDirectionId === direction.selectedDirectionId
    ) {
      busDirectionGeometryPaths.value = [path];
      options.draw();
    } else if (
      requestToken === busDirectionGeometryRequestToken &&
      options.getActiveLine()?.id === line.id &&
      busDirectionSelection.value?.selectedDirectionId === direction.selectedDirectionId
    ) {
      unavailableBusDirectionGeometryKey.value = cacheKey;
      options.draw();
    }
  }

  return {
    busDirectionSelection,
    busDirectionSequences,
    directionMergeEnabled,
    directionFilterRequested,
    directionStateReady,
    selectedDirectionButtonId,
    busDirectionLoading,
    busDirectionGeometryPaths,
    unavailableBusDirectionGeometryKey,
    selectedBusDirectionStationIds,
    selectedBusDirectionStationSet,
    selectedBusDirectionEdgeKeys,
    selectedBusDirectionQuays,
    resetBusDirectionState,
    loadBusDirection,
    changeBusDirection,
    toggleMergedDirections,
  };
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string"
    ? value
    : Array.isArray(value) && typeof value[0] === "string"
      ? value[0]
      : undefined;
}

function hasQueryFlag(value: unknown): boolean {
  const normalized = queryString(value)?.trim().toLowerCase();
  return normalized === "" || normalized === "1" || normalized === "true";
}
