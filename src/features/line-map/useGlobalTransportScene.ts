import { computed } from "vue";
import type {
  GlobalMapLine,
  GlobalMapMode,
  GlobalMapPath,
  GlobalMapStation,
} from "../transport-map/contracts/manifest";
import type { TransportMapNetwork, TransportMapViewportResult } from "../transport-map/contracts/network";
import type {
  GlobalMapQuayMarker,
  TransportMapRenderScene,
} from "../transport-map/contracts/renderer";
import type {
  TransportMapTraceEventType,
  TransportMapTraceMetadata,
} from "../transport-map/performance/transportMapPerformanceTrace";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../transport-map/config/globalTransportPlanConfig";
import { buildPathSpatialIndex, buildStationSpatialIndex } from "../transport-map/spatial/packedIndex";
import { linePathsAreHighFidelity, selectPreferredLinePaths } from "../transport-map/data/pathPrecedence";
import { filterPathsForGlobalBusDirection } from "./globalBusDirections";
import type { GlobalMapStationSearchGroup } from "../transport-map/search/globalMapSearch";
import { modeRank } from "../transport-map/search/globalMapSearch";
import {
  createStationNodeVisibilityPredicate,
} from "../transport-map/render/stationNodeVisibility";

const BUS_ONLY_GLOBAL_MAP_MODES = new Set<GlobalMapMode>(["BUS", "NOCTILIEN"]);
const HEAVY_QUAY_MODES = new Set<GlobalMapMode>(["METRO", "RER", "TRAIN", "TRANSILIEN"]);

/**
 * An itinerary preview owns the visible route overlay. Keep a small stable
 * renderer scene for that state instead of building the complete network
 * scene and throwing it away afterwards.
 */
const EMPTY_ITINERARY_PREVIEW_SCENE: TransportMapRenderScene = {
  lines: [],
  paths: [],
  stations: [],
  quays: [],
  entrances: [],
  entranceStationIds: [],
  selectedStationIds: [],
  visibleModeMask: 0,
  interruptionLineIds: [],
  disturbanceLineIds: [],
  interruptedStationIds: [],
  disturbedStationIds: [],
  trafficPathSpans: [],
  allowGeometrySwapDuringInteraction: false,
};

export interface GlobalTransportSceneTrafficState {
  readonly interruptionLineIds: readonly string[];
  readonly disturbanceLineIds: readonly string[];
  readonly interruptedStationIds: readonly string[];
  readonly disturbedStationIds: readonly string[];
  readonly trafficPathSpans: TransportMapRenderScene["trafficPathSpans"];
}

export interface UseGlobalTransportSceneOptions {
  getWalkingIsochrones?: () => TransportMapRenderScene["walkingIsochrones"];
  getHoveredIsochroneIds?: () => readonly string[];
  getNetwork: () => TransportMapNetwork | undefined;
  getViewport: () => TransportMapViewportResult;
  getPreloadedLinePaths?: () => readonly GlobalMapPath[];
  getActiveLine: () => GlobalMapLine | undefined;
  getActiveStationView: () => GlobalMapStationSearchGroup | GlobalMapStation | undefined;
  getActiveLineId: () => string | undefined;
  getActiveStationId: () => string | undefined;
  getCameraZoom: () => number;
  getSelectedStationIds: () => readonly string[];
  getSelectedModes: () => readonly GlobalMapMode[];
  getVisibleModeMask: () => number;
  getHoveredStationId: () => string | undefined;
  getHoveredLineId: () => string | undefined;
  getConnectedStationIds: () => readonly string[];
  getSelectedBusDirectionStationIds: () => readonly string[] | undefined;
  getSelectedBusDirectionStationSet: () => ReadonlySet<string> | undefined;
  getSelectedBusDirectionEdgeKeys: () => ReadonlySet<string> | undefined;
  getSelectedBusDirectionQuays: () => readonly GlobalMapQuayMarker[];
  getBusDirectionGeometryPaths: () => readonly GlobalMapPath[];
  getUnavailableBusDirectionGeometryKey: () => string | undefined;
  getSelectedBusDirectionGeometryKey: () => string;
  getSelectedLineInteractionScene: () => TransportMapRenderScene | undefined;
  getItineraryPreviewActive?: () => boolean;
  getInteractionActive: () => boolean;
  getProgrammaticCameraFlightActive?: () => boolean;
  getTrafficState: () => GlobalTransportSceneTrafficState;
  getSidebarPreviewLineId: () => string | undefined;
  showBusOnlyStationNodesInOverview?: () => boolean;
  recordTiming?: (
    kind: TransportMapTraceEventType,
    durationMs: number,
    metadata?: TransportMapTraceMetadata,
  ) => void;
}

function isBusOnlyOverviewStation(
  station: GlobalMapStation,
  network: TransportMapNetwork | undefined,
): boolean {
  const lines = station.lineIds
    .map((lineId) => network?.linesById.get(lineId))
    .filter((line): line is GlobalMapLine => Boolean(line));
  return (
    lines.length === station.lineIds.length &&
    lines.length > 0 &&
    lines.every((line) => BUS_ONLY_GLOBAL_MAP_MODES.has(line.mode))
  );
}

function recordSceneTiming(
  options: UseGlobalTransportSceneOptions,
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

function suppressTransportLayers(scene: TransportMapRenderScene): TransportMapRenderScene {
  return {
    ...scene,
    lines: [],
    paths: [],
    stations: [],
    quays: [],
    entrances: [],
    entranceStationIds: [],
    activeLineId: undefined,
    activeStationId: undefined,
    hoveredStationId: undefined,
    hoveredLineId: undefined,
    selectedStationIds: [],
    ghostLineIds: [],
    visibleModeMask: 0,
    interruptionLineIds: [],
    disturbanceLineIds: [],
    interruptedStationIds: [],
    disturbedStationIds: [],
    trafficPathSpans: [],
    allowGeometrySwapDuringInteraction: false,
  };
}

function createItineraryPreviewScene(interactionActive: boolean): TransportMapRenderScene {
  return {
    ...EMPTY_ITINERARY_PREVIEW_SCENE,
    interactionActive,
  };
}

export function useGlobalTransportScene(options: UseGlobalTransportSceneOptions) {
  const activeStationMemberIds = computed<string[]>(() => {
    const station = options.getActiveStationView();
    if (!station) return [];
    return "memberStationIds" in station && Array.isArray(station.memberStationIds)
      ? station.memberStationIds
      : [station.id];
  });

  const activeConnectionStationIds = computed<string[]>(() => [
    ...new Set([...activeStationMemberIds.value, ...options.getConnectedStationIds()]),
  ]);

  const activeStationLines = computed<GlobalMapLine[]>(() => {
    const startedAt = options.recordTiming ? nowMs() : Number.NaN;
    try {
      const network = options.getNetwork();
      if (!network) return [];
      return activeConnectionStationIds.value
        .flatMap((stationId) => network.stationsById.get(stationId)?.lineIds ?? [])
        .filter((lineId, index, lineIds) => lineIds.indexOf(lineId) === index)
        .map((id) => network.linesById.get(id))
        .filter((line): line is GlobalMapLine => Boolean(line))
        .filter((line) => options.getSelectedModes().includes(line.mode))
        .sort(
          (left, right) =>
            modeRank(left.mode) - modeRank(right.mode) ||
            left.code.localeCompare(right.code, "fr-FR", { numeric: true }),
        );
    } finally {
      recordSceneTiming(options, "active_station_lines_compute", startedAt);
    }
  });

  const ghostLineIds = computed<string[]>(() => {
    if (!options.getActiveStationView()) return [];
    const activeLineId = options.getActiveLineId();
    return activeStationLines.value
      .map((line) => line.id)
      .filter((lineId) => lineId !== activeLineId);
  });

  const renderStations = computed<GlobalMapStation[]>(() => {
    const startedAt = options.recordTiming ? nowMs() : Number.NaN;
    try {
      const network = options.getNetwork();
      const viewport = options.getViewport();
      const contextStationIds = new Set(activeConnectionStationIds.value);
      const contextStations = activeConnectionStationIds.value
        .map((stationId) => network?.stationsById.get(stationId))
        .filter((station): station is GlobalMapStation => Boolean(station));
      const hoveredLineId = options.getHoveredLineId();
      const hoveredGhostStations =
        hoveredLineId && ghostLineIds.value.includes(hoveredLineId)
          ? (network?.linesById.get(hoveredLineId)?.stationIds ?? [])
              .map((stationId) => network?.stationsById.get(stationId))
              .filter((station): station is GlobalMapStation => Boolean(station))
          : [];
      const focusedLine = options.getActiveLine();
      if (!focusedLine) {
        const selectedStationIds = new Set(options.getSelectedStationIds());
        const forcedStationIds = new Set([
          ...contextStationIds,
          ...selectedStationIds,
          ...hoveredGhostStations.map((station) => station.id),
        ]);
        const overviewStations = [
          ...new Map(
            [...viewport.stations, ...contextStations, ...hoveredGhostStations].map((station) => [
              station.id,
              station,
            ]),
          ).values(),
        ];
        if (options.showBusOnlyStationNodesInOverview?.() ??
          GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.showBusOnlyStationNodesInOverview) {
          return overviewStations;
        }
        return overviewStations.filter(
          (station) => !isBusOnlyOverviewStation(station, network) || forcedStationIds.has(station.id),
        );
      }

      const focusedStationIds = options.getSelectedBusDirectionStationSet() ?? new Set(focusedLine.stationIds);
      const hasSelectedBusDirection = Boolean(options.getSelectedBusDirectionStationSet());
      const focusedStations = viewport.stations.filter(
        (station) =>
          contextStationIds.has(station.id) ||
          focusedStationIds.has(station.id) ||
          (!hasSelectedBusDirection && station.lineIds.includes(focusedLine.id)) ||
          station.id === options.getActiveStationId(),
      );
      const byId = new Map(
        [...focusedStations, ...contextStations, ...hoveredGhostStations].map((station) => [
          station.id,
          station,
        ]),
      );
      if (!GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.keepStationLabelsDuringZoom) {
        return [...byId.values()];
      }
      for (const stationId of options.getSelectedBusDirectionStationIds() ?? focusedLine.stationIds) {
        const station = network?.stationsById.get(stationId);
        if (station) byId.set(station.id, station);
      }
      return [...byId.values()];
    } finally {
      recordSceneTiming(options, "render_stations_compute", startedAt);
    }
  });

  const staticLineMetadataPaths = computed<GlobalMapPath[]>(() => {
    const lineId = options.getActiveLine()?.id;
    if (!lineId) return [...options.getViewport().paths];
    const network = options.getNetwork();
    const preloadedPaths = options.getPreloadedLinePaths?.() ?? [];
    const preferredPaths = selectPreferredLinePaths(
      [...options.getViewport().paths, ...preloadedPaths],
      network?.regionalPaths ?? [],
      lineId,
    );
    const edgeKeys = options.getSelectedBusDirectionEdgeKeys();
    if (!edgeKeys) return preferredPaths;
    return filterPathsForGlobalBusDirection(
      preferredPaths,
      edgeKeys,
      options.getSelectedBusDirectionStationSet(),
      { allowReversedPathStorage: true },
    );
  });

  const lineMetadataPaths = computed<GlobalMapPath[]>(() => {
    const startedAt = options.recordTiming ? nowMs() : Number.NaN;
    try {
      const geometryPaths = options.getBusDirectionGeometryPaths();
      if (geometryPaths.length > 0) return [...geometryPaths];
      const selectedGeometryKey = options.getSelectedBusDirectionGeometryKey();
      if (options.getUnavailableBusDirectionGeometryKey() === selectedGeometryKey) {
        return staticLineMetadataPaths.value.filter((path) => !path.quality.fallback);
      }
      return staticLineMetadataPaths.value;
    } finally {
      recordSceneTiming(options, "line_metadata_paths_compute", startedAt);
    }
  });

  const ghostLinePaths = computed<GlobalMapPath[]>(() => {
    const startedAt = options.recordTiming ? nowMs() : Number.NaN;
    try {
      const network = options.getNetwork();
      const viewportPaths = options.getViewport().paths;
      const regionalPaths = network?.regionalPaths ?? [];
      return ghostLineIds.value.flatMap((lineId) =>
        selectPreferredLinePaths(viewportPaths, regionalPaths, lineId),
      );
    } finally {
      recordSceneTiming(options, "ghost_line_paths_compute", startedAt);
    }
  });

  const renderPaths = computed<GlobalMapPath[]>(() => {
    const startedAt = options.recordTiming ? nowMs() : Number.NaN;
    try {
      if (!options.getActiveLine()) return [...options.getViewport().paths];
      const focusedLinePaths = lineMetadataPaths.value;
      if (focusedLinePaths.length === 0) {
        if (!options.getSelectedBusDirectionEdgeKeys()) {
          // During a programmatic line-to-line flight, the viewport still
          // contains the previous line until the off-screen warm-up finishes.
          // Reusing those paths here makes the renderer paint the old network
          // while the new camera is moving. Keep the scene empty for that
          // short gap so the first decoded target frame is atomic; instant
          // selections retain the overview fallback below.
          const lineTransitionActive =
            options.getInteractionActive() &&
            (options.getProgrammaticCameraFlightActive?.() ?? false);
          return lineTransitionActive ? [] : [...options.getViewport().paths];
        }
        return ghostLinePaths.value;
      }
      if (
        !GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.keepStationLabelsDuringZoom &&
        !options.getSelectedBusDirectionEdgeKeys()
      ) {
        return [...options.getViewport().paths];
      }
      return [...focusedLinePaths, ...ghostLinePaths.value];
    } finally {
      recordSceneTiming(options, "render_paths_compute", startedAt);
    }
  });

  const activeLineView = computed<GlobalMapLine | undefined>(() => {
    const line = options.getActiveLine();
    const stationIds = options.getSelectedBusDirectionStationIds();
    if (!line || !stationIds) return line;
    const geometryIds = lineMetadataPaths.value.map((path) => path.id);
    return {
      ...line,
      stationIds: [...stationIds],
      geometryIds: geometryIds.length > 0 ? geometryIds : line.geometryIds,
    };
  });

  const selectedStations = computed<GlobalMapStation[]>(() => {
    const network = options.getNetwork();
    return options
      .getSelectedStationIds()
      .map((id) => network?.stationsById.get(id))
      .filter((station): station is GlobalMapStation => Boolean(station));
  });

  const sidebarOpen = computed(() =>
    Boolean(options.getActiveStationView() || options.getActiveLine() || selectedStations.value.length),
  );

  const stationSidebarViewActive = computed(() =>
    Boolean(options.getActiveStationView() && !options.getSidebarPreviewLineId()),
  );

  const visibleSelectedBusDirectionQuays = computed<GlobalMapQuayMarker[]>(() => {
    const line = options.getActiveLine();
    if (!line || !HEAVY_QUAY_MODES.has(line.mode) || stationSidebarViewActive.value) {
      return [...options.getSelectedBusDirectionQuays()];
    }
    return [];
  });

  const activeStationEntrances = computed(() => {
    const network = options.getNetwork();
    if (!network || !options.getActiveStationView()) return [];
    const stationIds = new Set(activeConnectionStationIds.value);
    return network.entrances.filter((entrance) => stationIds.has(entrance.stationId));
  });

  const renderedGhostLineCount = computed(() => {
    const expected = new Set(ghostLineIds.value);
    const rendered = new Set<string>();
    for (const path of renderPaths.value) {
      if (expected.has(path.lineId)) rendered.add(path.lineId);
    }
    return rendered.size;
  });

  const renderableGhostLineIds = computed<string[]>(() => {
    const network = options.getNetwork();
    return ghostLineIds.value.filter(
      (lineId) => (network?.linesById.get(lineId)?.geometryIds.length ?? 0) > 0,
    );
  });

  const selectedLineInteractionSceneHighFidelity = computed(() => {
    const focusedLineId = options.getActiveLine()?.id;
    if (!focusedLineId) return false;
    return [focusedLineId, ...renderableGhostLineIds.value].every((lineId) =>
      linePathsAreHighFidelity(renderPaths.value, lineId),
    );
  });

  const unavailableGhostGeometryLineIds = computed<string[]>(() => {
    const renderable = new Set(renderableGhostLineIds.value);
    return ghostLineIds.value.filter((lineId) => !renderable.has(lineId));
  });

  const missingRenderedGhostLineIds = computed<string[]>(() => {
    const rendered = new Set(renderPaths.value.map((path) => path.lineId));
    return ghostLineIds.value.filter((lineId) => !rendered.has(lineId));
  });

  const selectedLineGhostSceneComplete = computed(() => {
    const rendered = new Set(renderPaths.value.map((path) => path.lineId));
    return renderableGhostLineIds.value.every((lineId) => rendered.has(lineId));
  });

  const selectedStationPulseStations = computed(() => {
    const renderedStationIds = new Set(renderStations.value.map((station) => station.id));
    return selectedStations.value.filter((station) => renderedStationIds.has(station.id));
  });

  let previousRenderedPathSource: GlobalMapPath[] | undefined;
  let previousRenderedPathIndex: ReturnType<typeof buildPathSpatialIndex> | undefined;
  const renderedPathIndex = computed(() => {
    const paths = renderPaths.value;
    if (paths === previousRenderedPathSource && previousRenderedPathIndex) {
      return previousRenderedPathIndex;
    }
    const startedAt = options.recordTiming ? nowMs() : Number.NaN;
    const index = buildPathSpatialIndex(paths);
    previousRenderedPathSource = paths;
    previousRenderedPathIndex = index;
    recordSceneTiming(options, "path_spatial_index_build", startedAt, {
      pathCount: paths.length,
    });
    return index;
  });

  const liveRenderScene = computed<TransportMapRenderScene>(() => {
    const startedAt = options.recordTiming ? nowMs() : Number.NaN;
    try {
      const traffic = options.getTrafficState();
      const activeStationView = options.getActiveStationView();
      const scene: TransportMapRenderScene = {
        lines: options.getNetwork()?.lines ?? [],
        paths: renderPaths.value,
        stations: renderStations.value,
        quays: visibleSelectedBusDirectionQuays.value,
        entrances: activeStationView ? activeStationEntrances.value : [],
        entranceStationIds: activeStationView ? activeConnectionStationIds.value : [],
        activeLineId: options.getActiveLineId(),
        activeStationId: options.getActiveStationId(),
        hoveredStationId: options.getHoveredStationId(),
        hoveredLineId: options.getHoveredLineId(),
        hoveredIsochroneIds: options.getHoveredIsochroneIds?.(),
        selectedStationIds: [...options.getSelectedStationIds()],
        ghostLineIds: ghostLineIds.value,
        visibleModeMask: options.getVisibleModeMask(),
        interruptionLineIds: [...traffic.interruptionLineIds],
        disturbanceLineIds: [...traffic.disturbanceLineIds],
        interruptedStationIds: [...traffic.interruptedStationIds],
        disturbedStationIds: [...traffic.disturbedStationIds],
        trafficPathSpans: traffic.trafficPathSpans,
        interactionActive: options.getInteractionActive(),
        allowGeometrySwapDuringInteraction:
          (options.getPreloadedLinePaths?.().length ?? 0) > 0 &&
          options.getInteractionActive() &&
          (options.getProgrammaticCameraFlightActive?.() ?? false),
      };
      return options.getItineraryPreviewActive?.() ? suppressTransportLayers(scene) : scene;
    } finally {
      recordSceneTiming(options, "live_render_scene_build", startedAt);
    }
  });

  const renderScene = computed<TransportMapRenderScene>(() => {
    const startedAt = options.recordTiming ? nowMs() : Number.NaN;
    try {
      // Do this guard before touching liveRenderScene. The live scene walks
      // the active network, builds spatial indexes and resolves traffic data;
      // none of that is visible while the itinerary overlay owns the stage.
      if (options.getItineraryPreviewActive?.()) {
        return createItineraryPreviewScene(options.getInteractionActive());
      }
      const snapshot = options.getSelectedLineInteractionScene();
      const scene = snapshot
        ? { ...snapshot, interactionActive: options.getInteractionActive() }
        : liveRenderScene.value;
      return options.getWalkingIsochrones || options.getHoveredIsochroneIds
        ? {
            ...scene,
            ...(options.getWalkingIsochrones
              ? { walkingIsochrones: options.getWalkingIsochrones() }
              : {}),
            ...(options.getHoveredIsochroneIds
              ? { hoveredIsochroneIds: options.getHoveredIsochroneIds() }
              : {}),
          }
        : scene;
    } finally {
      recordSceneTiming(options, "render_scene_resolve", startedAt);
    }
  });

  const hitTestStations = computed(() => {
    const startedAt = options.recordTiming ? nowMs() : Number.NaN;
    try {
      const scene = renderScene.value;
      const predicate = createStationNodeVisibilityPredicate(
        { zoom: options.getCameraZoom() },
        scene,
      );
      return scene.stations.filter((station) => predicate(station));
    } finally {
      recordSceneTiming(options, "hit_test_stations_compute", startedAt);
    }
  });

  let previousHitTestStationSource: GlobalMapStation[] | undefined;
  let previousHitTestStationIndex: ReturnType<typeof buildStationSpatialIndex> | undefined;
  const hitTestStationIndex = computed(() => {
    const stations = hitTestStations.value;
    if (stations === previousHitTestStationSource && previousHitTestStationIndex) {
      return previousHitTestStationIndex;
    }
    const startedAt = options.recordTiming ? nowMs() : Number.NaN;
    const index = buildStationSpatialIndex(stations);
    previousHitTestStationSource = stations;
    previousHitTestStationIndex = index;
    recordSceneTiming(options, "station_spatial_index_build", startedAt, {
      stationCount: stations.length,
    });
    return index;
  });

  const selectedLineGeometryBounds = computed(() => {
    const line = options.getActiveLine();
    const network = options.getNetwork();
    if (!line) return undefined;
    const bounds = [
      ...(options.getSelectedBusDirectionStationIds() ?? line.stationIds)
        .map((stationId) => network?.stationsById.get(stationId))
        .filter((station): station is GlobalMapStation => Boolean(station))
        .map((station) => ({
          minX: station.worldX,
          minY: station.worldY,
          maxX: station.worldX,
          maxY: station.worldY,
        })),
      ...lineMetadataPaths.value.map((path) => ({
        minX: path.minX,
        minY: path.minY,
        maxX: path.maxX,
        maxY: path.maxY,
      })),
      ...visibleSelectedBusDirectionQuays.value.map((quay) => ({
        minX: quay.worldX,
        minY: quay.worldY,
        maxX: quay.worldX,
        maxY: quay.worldY,
      })),
    ].filter(
      (bound) =>
        Number.isFinite(bound.minX) &&
        Number.isFinite(bound.minY) &&
        Number.isFinite(bound.maxX) &&
        Number.isFinite(bound.maxY),
    );
    if (bounds.length === 0) return undefined;
    return {
      minX: Math.min(...bounds.map((bound) => bound.minX)),
      minY: Math.min(...bounds.map((bound) => bound.minY)),
      maxX: Math.max(...bounds.map((bound) => bound.maxX)),
      maxY: Math.max(...bounds.map((bound) => bound.maxY)),
    };
  });

  return {
    activeStationMemberIds,
    activeConnectionStationIds,
    renderStations,
    staticLineMetadataPaths,
    lineMetadataPaths,
    ghostLinePaths,
    renderPaths,
    renderedPathIndex,
    activeLineView,
    activeStationLines,
    selectedStations,
    sidebarOpen,
    stationSidebarViewActive,
    visibleSelectedBusDirectionQuays,
    activeStationEntrances,
    selectedStationPulseStations,
    ghostLineIds,
    renderedGhostLineCount,
    renderableGhostLineIds,
    selectedLineInteractionSceneHighFidelity,
    unavailableGhostGeometryLineIds,
    missingRenderedGhostLineIds,
    selectedLineGhostSceneComplete,
    liveRenderScene,
    renderScene,
    hitTestStations,
    hitTestStationIds: computed(() => {
      const startedAt = options.recordTiming ? nowMs() : Number.NaN;
      try {
        return new Set(hitTestStations.value.map((station) => station.id));
      } finally {
        recordSceneTiming(options, "hit_test_station_ids_prepare", startedAt);
      }
    }),
    hitTestStationIndex,
    selectedLineGeometryBounds,
  };
}
