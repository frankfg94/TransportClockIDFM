import type { GlobalMapLine, GlobalMapMode, GlobalMapStation } from "../transport-map/contracts/manifest";
import type { CameraState } from "../transport-map/geo/camera";
import {
  cameraFromSharedViewport,
  decodeSharedViewport,
  encodeSharedViewport,
  SHARED_VIEWPORT_QUERY_KEY,
} from "../transport-map/geo/sharedViewport";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../transport-map/config/globalTransportPlanConfig";
import type { GlobalMapStationSearchGroup } from "../transport-map/search/globalMapSearch";

export interface GlobalTransportRouteDirectionState {
  filterRequested: boolean;
  selectedDirectionId?: string;
  mergeEnabled: boolean;
  ready: boolean;
}

export interface GlobalTransportRouteSelectionState {
  activeStationId?: string;
  activeLineId?: string;
}

export interface GlobalTransportRouteStateRouter {
  replace: (location: { query: Record<string, string | undefined> }) => void | Promise<unknown>;
}

export interface UseGlobalTransportRouteStateOptions {
  getQuery: () => Readonly<Record<string, unknown>>;
  router: GlobalTransportRouteStateRouter;
  isMounted: () => boolean;
  getCamera: () => CameraState;
  applyCamera: (camera: CameraState, query?: boolean, refresh?: boolean, render?: boolean) => void;
  captureSelectedLineBasemapCoverSnapshot: () => void;
  getSharedViewportSignature: () => string | undefined;
  setSharedViewportSignature: (signature: string | undefined) => void;
  getSelection: () => GlobalTransportRouteSelectionState;
  getActiveLine: () => GlobalMapLine | undefined;
  getDirectionState: () => GlobalTransportRouteDirectionState;
  getNetwork: () => {
    lines: readonly GlobalMapLine[];
    linesById: ReadonlyMap<string, GlobalMapLine>;
  } | undefined;
  supportsLineDirections: (line: GlobalMapLine | undefined) => boolean;
  defaultDirectionMerge: (mode: GlobalMapMode) => boolean;
  ensureSearchCatalog: () => Promise<void>;
  selectLineFromSearch: (line: GlobalMapLine) => Promise<void>;
  getStation: (stationId: string) => Promise<GlobalMapStation | undefined>;
  refreshNetwork: () => void;
  selectStation: (
    stationId: string,
    event?: MouseEvent,
    stationGroup?: GlobalMapStationSearchGroup,
    loadConnections?: boolean,
    preserveActiveLine?: boolean,
  ) => void;
  loadStationConnections: (station: GlobalMapStation) => Promise<void>;
  refreshViewport: () => Promise<unknown>;
  resolveDebugLine: (lines: readonly GlobalMapLine[], query: string) => GlobalMapLine | undefined;
  getDebugLineQuery: () => string | undefined;
  ensureModeVisible: (mode: GlobalMapMode) => void;
  resetDirections: () => void;
  selectLine: (lineId: string | undefined) => void;
  clearActiveStation: () => void;
  clearActiveStationGroup: () => void;
  clearConnectedStations: () => void;
  getStationById: (stationId: string) => GlobalMapStation | undefined;
  zoomToLine: (lineId: string) => void;
  hasDebugWithZoom: () => boolean;
}

/**
 * Keeps all URL serialization and restoration in one place. Domain actions
 * are injected so this module does not own map selection or renderer state.
 */
export function useGlobalTransportRouteState(options: UseGlobalTransportRouteStateOptions) {
  function syncUrl(): void {
    if (!options.isMounted()) return;

    const query = { ...options.getQuery() } as Record<string, string | undefined>;
    const sharedViewportSignature = options.getSharedViewportSignature();
    if (
      sharedViewportSignature &&
      encodeSharedViewport(options.getCamera()) !== sharedViewportSignature
    ) {
      delete query[SHARED_VIEWPORT_QUERY_KEY];
      options.setSharedViewportSignature(undefined);
    }

    const selection = options.getSelection();
    const routeLineId = queryString(query.line);
    if (selection.activeStationId) query.station = selection.activeStationId;
    else delete query.station;
    if (selection.activeLineId) query.line = selection.activeLineId;
    else delete query.line;

    const activeLine = options.getActiveLine();
    const direction = options.getDirectionState();
    const preservePendingDirectionQuery =
      !direction.ready &&
      Boolean(selection.activeLineId) &&
      routeLineId === activeLine?.id &&
      options.supportsLineDirections(activeLine);
    if (!preservePendingDirectionQuery) {
      if (
        selection.activeLineId &&
        options.supportsLineDirections(activeLine) &&
        direction.filterRequested &&
        direction.selectedDirectionId
      ) {
        query.direction = direction.selectedDirectionId;
      } else {
        delete query.direction;
      }

      if (
        direction.ready &&
        selection.activeLineId &&
        options.supportsLineDirections(activeLine)
      ) {
        const defaultMerge = options.defaultDirectionMerge(activeLine!.mode);
        if (direction.mergeEnabled === defaultMerge) delete query.mergeDirections;
        else query.mergeDirections = direction.mergeEnabled ? "1" : "0";
      } else {
        delete query.mergeDirections;
      }
    }
    void options.router.replace({ query });
  }

  function restoreSharedViewportFromUrl(): boolean {
    const encodedViewport = queryString(options.getQuery()[SHARED_VIEWPORT_QUERY_KEY]);
    const bounds = decodeSharedViewport(encodedViewport);
    if (!encodedViewport || !bounds) return false;

    options.applyCamera(
      cameraFromSharedViewport(
        options.getCamera(),
        bounds,
        GLOBAL_TRANSPORT_PLAN_CONFIG.camera.minZoom,
        GLOBAL_TRANSPORT_PLAN_CONFIG.camera.maxZoom,
      ),
      false,
      false,
      true,
    );
    options.captureSelectedLineBasemapCoverSnapshot();
    const normalizedSignature = encodeSharedViewport(options.getCamera());
    options.setSharedViewportSignature(normalizedSignature);
    if (normalizedSignature !== encodedViewport) {
      void options.router.replace({
        query: {
          ...options.getQuery(),
          [SHARED_VIEWPORT_QUERY_KEY]: normalizedSignature,
        } as Record<string, string | undefined>,
      });
    }
    return true;
  }

  async function restoreSelectionFromUrl(): Promise<void> {
    const stationId = queryString(options.getQuery().station);
    const lineId = queryString(options.getQuery().line);
    let lineFromUrl: GlobalMapLine | undefined;
    if (lineId) {
      await options.ensureSearchCatalog();
      lineFromUrl = options.getNetwork()?.linesById.get(lineId);
      if (lineFromUrl) await options.selectLineFromSearch(lineFromUrl);
    }

    if (!stationId) return;
    const station = await options.getStation(stationId);
    options.refreshNetwork();
    if (!station) return;

    // Restore line first, then station, so a deep link keeps focused-line
    // rendering instead of falling back to the whole network.
    options.selectStation(station.id, undefined, undefined, false, Boolean(lineFromUrl));
    await options.loadStationConnections(station);
    options.applyCamera(
      {
        ...options.getCamera(),
        centerWorldX: station.worldX,
        centerWorldY: station.worldY,
        zoom: options.hasDebugWithZoom()
          ? GLOBAL_TRANSPORT_PLAN_CONFIG.camera.maxZoom
          : Math.max(15, options.getCamera().zoom),
      },
      false,
    );
    options.captureSelectedLineBasemapCoverSnapshot();
    await options.refreshViewport();
  }

  async function restoreDebugLineFromUrl(): Promise<void> {
    const query = options.getDebugLineQuery();
    if (!query) return;
    await options.ensureSearchCatalog();
    const network = options.getNetwork();
    const line = network ? options.resolveDebugLine(network.lines, query) : undefined;
    if (!line) return;

    options.ensureModeVisible(line.mode);
    options.resetDirections();
    options.selectLine(line.id);
    options.clearActiveStation();
    options.clearActiveStationGroup();
    options.clearConnectedStations();
    const debugStationId = queryString(options.getQuery().station);
    const debugStation = debugStationId ? options.getStationById(debugStationId) : undefined;
    if (options.hasDebugWithZoom() && debugStation) {
      options.applyCamera(
        {
          ...options.getCamera(),
          centerWorldX: debugStation.worldX,
          centerWorldY: debugStation.worldY,
          zoom: GLOBAL_TRANSPORT_PLAN_CONFIG.camera.maxZoom,
        },
        false,
      );
      options.captureSelectedLineBasemapCoverSnapshot();
    } else {
      options.zoomToLine(line.id);
      if (options.hasDebugWithZoom()) {
        options.applyCamera(
          { ...options.getCamera(), zoom: GLOBAL_TRANSPORT_PLAN_CONFIG.camera.maxZoom },
          false,
        );
      }
    }
    await options.refreshViewport();
  }

  return {
    syncUrl,
    restoreSharedViewportFromUrl,
    restoreSelectionFromUrl,
    restoreDebugLineFromUrl,
  };
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string"
    ? value
    : Array.isArray(value) && typeof value[0] === "string"
      ? value[0]
      : undefined;
}
