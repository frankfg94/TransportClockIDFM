import {
  computed,
  onBeforeUnmount,
  ref,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from "vue";
import { fetchLineRouteSequences } from "../../services/idfm";
import { fetchResolvedLineGeometry } from "../../services/lineGeometry";
import type { LineRouteSequence } from "../../types/transit";
import type { GlobalMapLine, GlobalMapPath, GlobalMapMode, GlobalMapStation } from "../transport-map/contracts/manifest";
import type { TransportMapNetwork, TransportMapViewportResult } from "../transport-map/contracts/network";
import type { CameraState } from "../transport-map/geo/camera";
import {
  createGlobalBusDirectionGeometryPath,
  createGlobalBusDirectionGeometryRequest,
  hasSingleConnectedGlobalMapPathGeometry,
} from "../line-map/globalBusDirectionGeometry";
import { buildCitiesLinePatternCities, type CitiesLinePatternCity } from "../line-map/citiesLinePattern";
import {
  createGhostLineFlowModel,
  type GhostLineFlowModel,
} from "../transport-map/overlays/ghostLineFlow";
import {
  createTransportLineFlowDirections,
  createTransportLineSearchOption,
  isRoadTransportLine,
  type TransportLineFlowDirection,
} from "../transport-map/overlays/ghostLineDirections";
import { selectPreferredLinePaths } from "../transport-map/data/pathPrecedence";
import { getCoordinatesDistanceMeters } from "../../services/distance";
import type { NearbyStationEntry } from "./nearbyStations";

export interface NearbyStationsLineFlowSource {
  selectedPlace?: { value?: { lon: number; lat: number } };
  visibleStations: { value: NearbyStationEntry[] };
  activeModes: { value: GlobalMapMode[] };
  transportMapNetwork: { value?: TransportMapNetwork };
  queryTransportMapViewport: (
    camera: CameraState,
    detailLineId?: string,
    forcedLineIds?: string[],
  ) => Promise<TransportMapViewportResult>;
}

export interface UseNearbyStationsLineFlowOptions {
  enabled?: MaybeRefOrGetter<boolean>;
}

export interface NearbyLineFlowFocus {
  /** Passenger-facing destination shown by the selected itinerary section. */
  directionLabel?: string;
  /** Physical station where the selected itinerary boards this line. */
  fromStationId?: string;
}

const MAX_LINE_SEQUENCE_CACHE_ENTRIES = 64;
const MAX_LINE_FLOW_GEOMETRY_CACHE_ENTRIES = 64;
const lineSequenceCache = new Map<string, Promise<LineRouteSequence[]>>();
const lineFlowGeometryCache = new Map<string, Promise<GlobalMapPath | undefined>>();

function getLruCacheValue<T>(cache: Map<string, T>, key: string): T | undefined {
  const cached = cache.get(key);
  if (cached === undefined) return undefined;

  cache.delete(key);
  cache.set(key, cached);
  return cached;
}

function setLruCacheValue<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  maxEntries: number,
): void {
  cache.set(key, value);
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

function deleteCachedValue<T>(cache: Map<string, T>, key: string, value: T): void {
  if (cache.get(key) === value) cache.delete(key);
}

interface NearbyLineFlowState {
  metadataPaths: GlobalMapPath[];
  renderPaths: GlobalMapPath[];
  directions: TransportLineFlowDirection[];
}

export function useNearbyStationsLineFlow(
  source: NearbyStationsLineFlowSource,
  options: UseNearbyStationsLineFlowOptions = {},
) {
  const enabled = () => options.enabled === undefined ? true : toValue(options.enabled);
  const hoveredLineId = ref<string>();
  const activeLineId = ref<string>();
  // A projected heavy station may be reached by a local feeder. Keep the
  // heavy line active for the details panel, but draw the exact feeder route
  // when that is the only route that can appear in this viewport.
  const ghostLineIds = ref<string[]>([]);
  const ghostLineId = computed(() => ghostLineIds.value[0]);
  const focusedStationId = ref<string>();
  const requestedDirectionLabel = ref<string>();
  const focusedFromStationId = ref<string>();
  const flowCamera = shallowRef<CameraState>();
  const lineMetadataPaths = shallowRef<GlobalMapPath[]>([]);
  const renderPaths = shallowRef<GlobalMapPath[]>([]);
  const lineFlowDirections = shallowRef<TransportLineFlowDirection[]>([]);
  const lineFlowStates = shallowRef<Map<string, NearbyLineFlowState>>(new Map());
  const pinnedLinePatternDirection = shallowRef<TransportLineFlowDirection>();
  const pinnedLinePatternLineId = ref<string>();
  const lineFlowLoading = ref(false);
  const lineFlowRequestToken = ref(0);
  const pinnedLinePatternRequestToken = ref(0);
  let lineFlowRefreshTimer: number | undefined;

  const targetLineId = computed(() => hoveredLineId.value ?? activeLineId.value);
  const targetLine = computed(() => {
    const lineId = targetLineId.value;
    if (!lineId) return undefined;
    return source.transportMapNetwork.value?.linesById.get(lineId) ?? findNearbyLine(lineId);
  });
  const flowLineId = computed(() => hoveredLineId.value ?? ghostLineId.value ?? activeLineId.value);
  const flowLineIds = computed(() => {
    const ids = hoveredLineId.value
      ? [hoveredLineId.value]
      : [activeLineId.value, ...ghostLineIds.value].filter(
        (lineId): lineId is string => Boolean(lineId),
      );
    return [...new Set(ids)];
  });
  const flowLine = computed(() => {
    const lineId = flowLineId.value;
    return lineId ? findNearbyLine(lineId) : undefined;
  });
  const pinnedLine = computed(() => {
    const lineId = activeLineId.value;
    if (!lineId) return undefined;
    return source.transportMapNetwork.value?.linesById.get(lineId) ?? findNearbyLine(lineId);
  });
  const pinnedLinePatternStations = computed<GlobalMapStation[]>(() => {
    const line = pinnedLine.value;
    const network = source.transportMapNetwork.value;
    if (!line || !network) return [];

    const direction = pinnedLinePatternLineId.value === line.id
      ? pinnedLinePatternDirection.value
      : undefined;
    const directionalStationIds = direction?.flow.orderedStationIds ?? [];
    const stationIds = directionalStationIds.length > 1
      ? directionalStationIds
      : line.stationIds;

    return stationIds
      .map((stationId) => network.stationsById.get(stationId))
      .filter((station): station is GlobalMapStation => Boolean(station));
  });
  const nearbyPinnedCityNames = computed(() => {
    const line = pinnedLine.value;
    if (!line) return [];

    const cityNames = new Set<string>();
    for (const entry of source.visibleStations.value) {
      if (!entry.insideRadius) continue;
      for (const station of entry.memberStations) {
        if (!station.lineIds.includes(line.id) || !station.city?.trim()) continue;
        cityNames.add(station.city.trim());
      }
    }
    return [...cityNames];
  });
  const pinnedLinePatternCities = computed<CitiesLinePatternCity[]>(() =>
    buildCitiesLinePatternCities(pinnedLinePatternStations.value, nearbyPinnedCityNames.value),
  );
  const focusedDirectionId = computed(() => {
    const lineId = activeLineId.value;
    if (!lineId || flowLine.value?.id !== lineId) return undefined;
    const line = flowLine.value;
    if (!line) return undefined;

    const directionLabel = requestedDirectionLabel.value?.trim();
    if (directionLabel) {
      return selectDirectionByLabel(
        lineFlowDirections.value,
        directionLabel,
        source.transportMapNetwork.value?.stationsById,
      );
    }

    const stationId = focusedStationId.value;
    if (!stationId) return undefined;
    return selectDirectionTowardStation(
      line,
      stationId,
      lineFlowDirections.value,
      source.visibleStations.value,
      source.selectedPlace?.value,
      source.transportMapNetwork.value?.stationsById,
    );
  });
  const focusedDirectionStartStationId = computed(() => (
    focusedDirectionId.value && focusedFromStationId.value
      ? focusedFromStationId.value
      : undefined
  ));
  const lineFlowModel = computed<GhostLineFlowModel | undefined>(() => {
    const line = flowLine.value;
    if (!line) return undefined;
    const camera = flowCamera.value;
    const network = source.transportMapNetwork.value;
    if (!camera || !network) return undefined;

    // The bootstrap already contains a compact path for every line. Use it as
    // an immediate visual skeleton while the focused chunks and direction
    // geometry are loading. The detailed model below replaces it as soon as
    // those assets are available.
    const loadedPaths = lineMetadataPaths.value.length > 0 ? lineMetadataPaths.value : renderPaths.value;
    const paths = pathsForLine(line.id, loadedPaths, network);
    if (paths.length === 0) return undefined;

    return createGhostLineFlowModel({
      camera,
      line,
      paths,
      stationsById: network.stationsById,
      directions: lineFlowDirections.value.map((direction) => direction.flow),
      focusedDirectionId: focusedDirectionId.value,
      focusedFromStationId: focusedDirectionStartStationId.value,
    });
  });
  const emptyLineFlowModels: GhostLineFlowModel[] = [];
  const lineFlowModels = computed<GhostLineFlowModel[]>(() => {
    const lineIds = flowLineIds.value;
    // Do not subscribe the whole nearby page to the camera just to publish a
    // new empty array on every pointer move when no line is being traced.
    if (lineIds.length === 0) return emptyLineFlowModels;
    const camera = flowCamera.value;
    const network = source.transportMapNetwork.value;
    if (!camera || !network) return emptyLineFlowModels;

    return lineIds.flatMap((lineId) => {
      if (lineId === flowLineId.value && lineFlowModel.value) return [lineFlowModel.value];

      const line = findNearbyLine(lineId);
      const state = lineFlowStates.value.get(lineId);
      if (!line) return [];
      const paths = pathsForLine(
        lineId,
        state && (state.metadataPaths.length > 0 ? state.metadataPaths : state.renderPaths),
        network,
      );
      if (paths.length === 0) return [];

      return [createGhostLineFlowModel({
        camera,
        line,
        paths,
        stationsById: network.stationsById,
        directions: state?.directions.map((direction) => direction.flow) ?? [],
      })];
    });
  });

  function pathsForLine(
    lineId: string,
    loadedPaths: readonly GlobalMapPath[] | undefined,
    network: TransportMapNetwork,
  ): GlobalMapPath[] {
    const linePaths = loadedPaths?.filter((path) => path.lineId === lineId) ?? [];
    return linePaths.length > 0
      ? linePaths
      : network.regionalPaths.filter((path) => path.lineId === lineId);
  }

  function findNearbyLine(lineId: string): GlobalMapLine | undefined {
    const networkLines = source.transportMapNetwork.value?.linesById;
    const exactNetworkLine = networkLines?.get(lineId);
    if (exactNetworkLine) return exactNetworkLine;

    const visibleLines = source.visibleStations.value
      .flatMap((entry) => entry.lines)
      .filter((line, index, lines) => lines.findIndex((candidate) => candidate.id === line.id) === index);
    const exactVisibleLine = visibleLines.find((line) => line.id === lineId);
    if (exactVisibleLine) return exactVisibleLine;

    const normalizedKey = normalizeLineKey(lineId);
    return visibleLines.find((line) => [line.code, line.label, line.sourceLineId, ...line.aliases]
      .filter((value): value is string => Boolean(value))
      .some((value) => normalizeLineKey(value) === normalizedKey))
      ?? [...(networkLines?.values() ?? [])].find((line) => [line.code, line.label, line.sourceLineId, ...line.aliases]
        .filter((value): value is string => Boolean(value))
        .some((value) => normalizeLineKey(value) === normalizedKey));
  }

  function normalizeLineKey(value: string): string {
    return value.trim().toLocaleLowerCase("fr-FR");
  }

  function handleCameraChange(nextCamera: CameraState): void {
    flowCamera.value = nextCamera;
    if (flowLineIds.value.length > 0) scheduleLineFlowRefresh();
  }

  function handleHoverLine(lineId: string): void {
    hoveredLineId.value = lineId;
  }

  function handleLeaveLine(lineId: string): void {
    if (hoveredLineId.value === lineId) hoveredLineId.value = undefined;
  }

  function handleActivateLine(
    lineId: string,
    stationId?: string,
    nextGhostLineIds?: string | readonly string[],
    focus?: NearbyLineFlowFocus,
  ): void {
    activeLineId.value = lineId;
    const requestedGhostLineIds = typeof nextGhostLineIds === "string"
      ? [nextGhostLineIds]
      : nextGhostLineIds ?? [];
    ghostLineIds.value = [...new Set(requestedGhostLineIds.filter((id) => id && id !== lineId))];
    focusedStationId.value = stationId;
    requestedDirectionLabel.value = focus?.directionLabel?.trim() || undefined;
    focusedFromStationId.value = focus?.fromStationId || undefined;
  }

  function clearLineFocus(): void {
    hoveredLineId.value = undefined;
    activeLineId.value = undefined;
    ghostLineIds.value = [];
    focusedStationId.value = undefined;
    requestedDirectionLabel.value = undefined;
    focusedFromStationId.value = undefined;
  }

  function scheduleLineFlowRefresh(): void {
    lineFlowRequestToken.value += 1;
    if (lineFlowRefreshTimer !== undefined) window.clearTimeout(lineFlowRefreshTimer);

    if (!enabled() || !flowLine.value || !flowCamera.value) {
      resetLineFlow();
      return;
    }

    lineFlowRefreshTimer = window.setTimeout(() => {
      lineFlowRefreshTimer = undefined;
      void refreshLineFlow(lineFlowRequestToken.value);
    }, 70);
  }

  function resetLineFlow(): void {
    lineMetadataPaths.value = [];
    renderPaths.value = [];
    lineFlowDirections.value = [];
    lineFlowStates.value = new Map();
    lineFlowLoading.value = false;
  }

  async function refreshPinnedLinePattern(): Promise<void> {
    const requestToken = pinnedLinePatternRequestToken.value + 1;
    pinnedLinePatternRequestToken.value = requestToken;
    const line = pinnedLine.value;
    pinnedLinePatternLineId.value = line?.id;
    pinnedLinePatternDirection.value = undefined;
    if (!line) return;

    const sequences = await getCachedLineSequences(line).catch((): LineRouteSequence[] => []);
    if (
      requestToken !== pinnedLinePatternRequestToken.value ||
      pinnedLine.value?.id !== line.id
    ) return;

    const directions = createTransportLineFlowDirections(
      line,
      sequences,
      source.transportMapNetwork.value?.stations ?? [],
    );
    pinnedLinePatternDirection.value = directions[0];
  }

  async function refreshLineFlow(requestToken: number): Promise<void> {
    const camera = flowCamera.value;
    const requestedLineIds = flowLineIds.value;
    if (!enabled() || requestedLineIds.length === 0 || !camera) {
      resetLineFlow();
      return;
    }

    lineFlowLoading.value = true;
    try {
      const network = source.transportMapNetwork.value;
      const nextStates = new Map<string, NearbyLineFlowState>();
      const publishPartialState = (lineId: string, state: NearbyLineFlowState): void => {
        if (
          requestToken !== lineFlowRequestToken.value ||
          requestedLineIds.join("|") !== flowLineIds.value.join("|")
        ) return;
        nextStates.set(lineId, state);
        lineFlowStates.value = new Map(nextStates);
        if (lineId === flowLineId.value) {
          lineMetadataPaths.value = state.metadataPaths;
          renderPaths.value = state.renderPaths;
          lineFlowDirections.value = state.directions;
        }
      };
      const states = await Promise.all(requestedLineIds.map(async (lineId) => {
        const line = findNearbyLine(lineId);
        if (!line) return undefined;
        try {
          return {
            lineId,
            state: await loadLineFlowState(line, camera, network, (state) => {
              publishPartialState(lineId, state);
            }),
          };
        } catch (cause) {
          // A single unavailable line must not hide the other lines selected
          // by the itinerary (for example a bus without a cached geometry).
          console.warn(
            `[nearby-map] line flow unavailable line=${lineId}`,
            cause instanceof Error ? cause.message : cause,
          );
          return undefined;
        }
      }));
      if (
        requestToken !== lineFlowRequestToken.value ||
        requestedLineIds.join("|") !== flowLineIds.value.join("|")
      ) return;

      for (const result of states) {
        if (result) nextStates.set(result.lineId, result.state);
      }
      lineFlowStates.value = nextStates;

      const primaryState = flowLineId.value ? nextStates.get(flowLineId.value) : undefined;
      lineMetadataPaths.value = primaryState?.metadataPaths ?? [];
      renderPaths.value = primaryState?.renderPaths ?? [];
      lineFlowDirections.value = primaryState?.directions ?? [];
    } catch (cause) {
      if (requestToken === lineFlowRequestToken.value) {
        resetLineFlow();
        console.warn(
          `[nearby-map] line flow unavailable lines=${requestedLineIds.join(",")}`,
          cause instanceof Error ? cause.message : cause,
        );
      }
    } finally {
      if (requestToken === lineFlowRequestToken.value) lineFlowLoading.value = false;
    }
  }

  async function loadLineFlowState(
    line: GlobalMapLine,
    camera: CameraState,
    network: TransportMapNetwork | undefined,
    onPartialState?: (state: NearbyLineFlowState) => void,
  ): Promise<NearbyLineFlowState> {
    // Start both requests together, but do not make the first visible path
    // wait for the direction metadata. For a focused line the viewport is
    // already enough to draw a useful path; direction arrows and road-level
    // geometry can arrive afterwards.
    const sequencesPromise = getCachedLineSequences(line).catch((): LineRouteSequence[] => []);
    const viewport = await source.queryTransportMapViewport(camera, line.id, [line.id]);
    const targetPaths = viewport.paths.filter((path) => path.lineId === line.id);
    const preferredPaths = selectPreferredLinePaths(
      targetPaths,
      network?.regionalPaths ?? [],
      line.id,
    );
    const initialPaths = preferredPaths.length > 0 ? preferredPaths : targetPaths;
    if (initialPaths.length > 0) {
      onPartialState?.({
        metadataPaths: [],
        renderPaths: initialPaths,
        directions: [],
      });
    }
    const sequences = await sequencesPromise;
    const directions = createTransportLineFlowDirections(
      line,
      sequences,
      network?.stations ?? [],
    );
    const resolvedPaths = await resolveDirectionGeometry(
      line,
      directions,
      preferredPaths,
      network,
    );

    return {
      metadataPaths: resolvedPaths.length > 0 && resolvedPaths.length === directions.length
        ? resolvedPaths
        : preferredPaths,
      renderPaths: resolvedPaths.length > 0 && resolvedPaths.length === directions.length
        ? resolvedPaths
        : targetPaths,
      directions,
    };
  }

  function getCachedLineSequences(line: GlobalMapLine): Promise<LineRouteSequence[]> {
    const cached = getLruCacheValue(lineSequenceCache, line.id);
    if (cached) return cached;
    const option = createTransportLineSearchOption(line);
    const request = option ? fetchLineRouteSequences(option, true) : Promise.resolve([]);
    setLruCacheValue(
      lineSequenceCache,
      line.id,
      request,
      MAX_LINE_SEQUENCE_CACHE_ENTRIES,
    );
    void request.catch(() => {
      deleteCachedValue(lineSequenceCache, line.id, request);
    });
    return request;
  }

  async function resolveDirectionGeometry(
    line: GlobalMapLine,
    directions: readonly TransportLineFlowDirection[],
    staticPaths: readonly GlobalMapPath[],
    network: TransportMapNetwork | undefined,
  ): Promise<GlobalMapPath[]> {
    if (!network || !isRoadTransportLine(line) || directions.length === 0) return [];
    if (hasSingleConnectedGlobalMapPathGeometry(staticPaths, network.stationsById)) return [];

    const paths = await Promise.all(directions.map(async (direction) => {
      const stationIds = direction.flow.orderedStationIds;
      const request = createGlobalBusDirectionGeometryRequest(line, direction.selection);
      if (!request || stationIds.length !== request.stops.length) return undefined;

      const cacheKey = `${line.id}:${direction.selection.selectedDirectionId}`;
      let geometry = getLruCacheValue(lineFlowGeometryCache, cacheKey);
      if (!geometry) {
        const requestPromise = fetchResolvedLineGeometry(request)
          .then((resolution) => createGlobalBusDirectionGeometryPath(
            line,
            direction.selection,
            stationIds,
            resolution,
          ))
          .catch(() => undefined);
        setLruCacheValue(
          lineFlowGeometryCache,
          cacheKey,
          requestPromise,
          MAX_LINE_FLOW_GEOMETRY_CACHE_ENTRIES,
        );
        void requestPromise.then((result) => {
          if (result === undefined) {
            deleteCachedValue(lineFlowGeometryCache, cacheKey, requestPromise);
          }
        });
        geometry = requestPromise;
      }
      return geometry;
    }));

    return paths.filter((path): path is GlobalMapPath => Boolean(path));
  }

  watch(
    [() => flowLineIds.value.join("|"), () => source.activeModes.value.join("|")],
    () => scheduleLineFlowRefresh(),
  );

  watch(activeLineId, () => void refreshPinnedLinePattern(), { immediate: true });

  watch(
    () => source.visibleStations.value.map((entry) => entry.lines.map((line) => line.id).join(",")).join("|"),
    () => {
      const visibleLineIds = new Set(source.visibleStations.value.flatMap((entry) => entry.lines.map((line) => line.id)));
      const visibleLines = source.visibleStations.value.flatMap((entry) => entry.lines);
      const networkLines = source.transportMapNetwork.value?.linesById;
      const isKnownLine = (lineId: string): boolean => {
        if (visibleLineIds.has(lineId) || networkLines?.has(lineId)) return true;
        const normalizedLineId = normalizeLineKey(lineId);
        return [...visibleLines, ...(networkLines?.values() ?? [])].some((line) =>
          [line.id, line.code, line.label, ...line.aliases]
            .filter((value): value is string => Boolean(value))
            .some((value) => normalizeLineKey(value) === normalizedLineId),
        );
      };
      const activeLineKnown = activeLineId.value ? isKnownLine(activeLineId.value) : false;
      // A projected heavy station can be the only visible affordance for its
      // line. Keep that line active even when no same-line station is inside
      // the radius; otherwise its clicked directional wave disappears during
      // the next nearby-station scan.
      if (activeLineId.value && !activeLineKnown) {
        activeLineId.value = undefined;
        ghostLineIds.value = [];
        focusedStationId.value = undefined;
        requestedDirectionLabel.value = undefined;
        focusedFromStationId.value = undefined;
      } else {
        const knownGhostLineIds = ghostLineIds.value.filter(isKnownLine);
        if (knownGhostLineIds.length !== ghostLineIds.value.length) {
          ghostLineIds.value = knownGhostLineIds;
        }
      }
      if (hoveredLineId.value && !visibleLineIds.has(hoveredLineId.value)) hoveredLineId.value = undefined;
    },
  );

  onBeforeUnmount(() => {
    if (lineFlowRefreshTimer !== undefined) window.clearTimeout(lineFlowRefreshTimer);
    lineFlowRequestToken.value += 1;
    pinnedLinePatternRequestToken.value += 1;
  });

  return {
    hoveredLineId,
    activeLineId,
    ghostLineId,
    ghostLineIds,
    focusedDirectionId,
    lineFlowDirections,
    targetLine,
    flowLine,
    pinnedLine,
    pinnedLinePatternCities,
    lineFlowModel,
    lineFlowModels,
    lineFlowLoading,
    handleCameraChange,
    handleHoverLine,
    handleLeaveLine,
    handleActivateLine,
    clearLineFocus,
  };
}

/**
 * Pick the direction that carries a selected supplemental station away from
 * the closest in-radius station.  A projected heavy station is deliberately
 * treated as a directional target; hovering or selecting a normal station
 * never sets this focus.
 */
export function selectDirectionTowardStation(
  line: GlobalMapLine,
  targetStationId: string,
  directions: readonly TransportLineFlowDirection[],
  visibleStations: readonly NearbyStationEntry[],
  origin?: { lon: number; lat: number },
  stationsById?: ReadonlyMap<string, GlobalMapStation>,
): string | undefined {
  if (directions.length === 0) return undefined;

  const nearbyStationCandidates = visibleStations
    .filter((entry) => entry.insideRadius && entry.lineInsideRadius?.[line.id] !== false)
    .flatMap((entry) => entry.memberStations
      .filter((station) => station.lineIds.includes(line.id))
      .map((station) => ({
        id: station.id,
        distance: entry.lineDistanceMeters?.[line.id] ?? entry.distanceMeters,
      })))
    .sort((left, right) => left.distance - right.distance)
    .map((station) => station.id);
  const nearestLocalStationIds = nearbyStationCandidates.length > 0
    ? nearbyStationCandidates
    : origin && stationsById
      ? [...new Set(directions.flatMap((direction) => direction.flow.orderedStationIds))]
        .map((stationId) => stationsById.get(stationId))
        .filter((station): station is GlobalMapStation => Boolean(station))
        .filter((station) => station.id !== targetStationId)
        .map((station) => ({
          id: station.id,
          distance: getCoordinatesDistanceMeters(origin.lat, origin.lon, station.lat, station.lon),
        }))
        .sort((left, right) => left.distance - right.distance)
        .map((station) => station.id)
      : [];

  const scored = directions
    .map((direction) => {
      const orderedStationIds = direction.flow.orderedStationIds;
      const targetIndex = orderedStationIds.indexOf(targetStationId);
      if (targetIndex < 0) return { direction, score: Number.NEGATIVE_INFINITY };

      const localIndex = nearestLocalStationIds
        .map((stationId) => orderedStationIds.indexOf(stationId))
        .find((index) => index >= 0);
      if (localIndex === undefined || targetIndex === localIndex) {
        return { direction, score: 0 };
      }

      return {
        direction,
        score: targetIndex > localIndex ? 2 : -2,
      };
    })
    .filter((candidate) => Number.isFinite(candidate.score));

  const towardTarget = scored
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)[0];
  if (towardTarget) return towardTarget.direction.flow.id;

  // If there is only one resolvable direction, keeping it focused is safer
  // than re-enabling the opposite wave that the data source did not expose.
  if (scored.length === 1) return scored[0]!.direction.flow.id;
  return undefined;
}

/**
 * Matches the direction displayed by an itinerary with the loaded line
 * topology. Navitia may append the city in parentheses, while the cached
 * topology may expose only the terminal name, so an unambiguous containment
 * match is accepted after exact matching.
 */
export function selectDirectionByLabel(
  directions: readonly TransportLineFlowDirection[],
  targetLabel: string,
  stationsById?: ReadonlyMap<string, GlobalMapStation>,
): string | undefined {
  const normalizedTarget = normalizeDirectionLabel(targetLabel);
  if (!normalizedTarget) return undefined;

  const candidates = directions.map((direction) => ({
    direction,
    labels: [
      direction.flow.label,
      direction.flow.destinationStationId
        ? stationsById?.get(direction.flow.destinationStationId)?.name
        : undefined,
    ]
      .filter((label): label is string => Boolean(label))
      .map(normalizeDirectionLabel)
      .filter(Boolean),
  }));
  const exactMatches = candidates.filter((candidate) => candidate.labels.includes(normalizedTarget));
  if (exactMatches.length === 1) return exactMatches[0]!.direction.flow.id;

  const partialMatches = candidates.filter((candidate) => candidate.labels.some((label) =>
    label.includes(normalizedTarget) || normalizedTarget.includes(label),
  ));
  return partialMatches.length === 1 ? partialMatches[0]!.direction.flow.id : undefined;
}

function normalizeDirectionLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}
