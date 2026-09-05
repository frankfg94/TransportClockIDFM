import {
  GLOBAL_MAP_MODE_ORDER,
  type GlobalMapMode,
  type GlobalMapStation,
} from "../contracts/manifest";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../config/globalTransportPlanConfig";
import type { TransportMapRenderScene } from "../contracts/renderer";
import type { CameraState } from "../geo/camera";

/** The zoom at which ordinary overview stations receive a rendered dot. */
export const GLOBAL_TRANSPORT_PLAN_STATION_DETAIL_ZOOM = 14;

type StationNodeVisibilityScene = Pick<
  TransportMapRenderScene,
  | "lines"
  | "activeLineId"
  | "activeStationId"
  | "hoveredLineId"
  | "selectedStationIds"
  | "visibleModeMask"
  | "ghostLineIds"
>;

export interface StationNodeVisibilityContext {
  visibleLineIds: ReadonlySet<string>;
  ghostLineIds: ReadonlySet<string>;
  activeLineStationIds: ReadonlySet<string>;
  hoveredGhostStationIds: ReadonlySet<string>;
  selectedStationIds: ReadonlySet<string>;
  majorOverviewHubIds: ReadonlySet<string>;
  majorOverviewHubIndexReady: boolean;
}

interface StationNodeVisibilityContextOverrides {
  visibleLineIds?: ReadonlySet<string>;
  ghostLineIds?: ReadonlySet<string>;
  activeLineStationIds?: ReadonlySet<string>;
  hoveredGhostStationIds?: ReadonlySet<string>;
  selectedStationIds?: ReadonlySet<string>;
}

/**
 * Build the stable set-based inputs used by both drawing and hit-testing.
 * RenderSceneIndex supplies the first five collections so they are shared
 * rather than rebuilt a second time.
 */
export function createStationNodeVisibilityContext(
  scene: StationNodeVisibilityScene & { stations?: readonly GlobalMapStation[] },
  overrides: StationNodeVisibilityContextOverrides = {},
): StationNodeVisibilityContext {
  const ghostLineIds = overrides.ghostLineIds ?? new Set(scene.ghostLineIds ?? []);
  const visibleLineIds = overrides.visibleLineIds ?? new Set(
    scene.lines
      .filter((line) => isModeVisible(line.mode, scene.visibleModeMask) || ghostLineIds.has(line.id))
      .map((line) => line.id),
  );
  const activeLine = scene.activeLineId
    ? scene.lines.find((line) => line.id === scene.activeLineId)
    : undefined;
  const activeLineStationIds = overrides.activeLineStationIds ?? new Set(activeLine?.stationIds ?? []);
  if (activeLine && overrides.visibleLineIds === undefined) {
    (visibleLineIds as Set<string>).add(activeLine.id);
  }
  const hoveredGhostLine = scene.hoveredLineId &&
    scene.hoveredLineId !== scene.activeLineId &&
    ghostLineIds.has(scene.hoveredLineId)
    ? scene.lines.find((line) => line.id === scene.hoveredLineId)
    : undefined;
  const hoveredGhostStationIds = overrides.hoveredGhostStationIds ?? new Set(hoveredGhostLine?.stationIds ?? []);
  const selectedStationIds = overrides.selectedStationIds ?? new Set(scene.selectedStationIds);
  const majorOverviewHubIds = new Set<string>();
  for (const station of scene.stations ?? []) {
    if (isMajorOverviewHub(station, scene.lines)) majorOverviewHubIds.add(station.id);
  }

  return {
    visibleLineIds,
    ghostLineIds,
    activeLineStationIds,
    hoveredGhostStationIds,
    selectedStationIds,
    majorOverviewHubIds,
    majorOverviewHubIndexReady: Array.isArray(scene.stations),
  };
}

export function isStationNodeVisible(
  camera: Pick<CameraState, "zoom">,
  scene: StationNodeVisibilityScene,
  station: GlobalMapStation,
  context: StationNodeVisibilityContext,
): boolean {
  if (!station.lineIds.some((lineId) => context.visibleLineIds.has(lineId))) return false;

  const selectedStation = station.id === scene.activeStationId || context.selectedStationIds.has(station.id);
  if (selectedStation || context.hoveredGhostStationIds.has(station.id)) return true;

  // A selected line is the user's explicit scope. Its station dots must
  // remain available at every zoom, including the merged/direction view.
  if (context.activeLineStationIds.has(station.id)) return true;

  if (
    context.majorOverviewHubIds.has(station.id) ||
    (!context.majorOverviewHubIndexReady && isMajorOverviewHub(station, scene.lines))
  ) return true;

  return camera.zoom >= GLOBAL_TRANSPORT_PLAN_STATION_DETAIL_ZOOM;
}

/**
 * Creates the pre-hover station visibility rule shared by Canvas rendering
 * and pointer hit-testing. `hoveredStationId` is deliberately not part of
 * the rule: a hidden station must not become visible merely because the
 * pointer landed on its hidden hit target.
 */
export function createStationNodeVisibilityPredicate(
  camera: Pick<CameraState, "zoom">,
  scene: StationNodeVisibilityScene,
  context?: StationNodeVisibilityContext,
): (station: GlobalMapStation) => boolean {
  const visibility = context ?? createStationNodeVisibilityContext(scene);
  return (station) => isStationNodeVisible(camera, scene, station, visibility);
}

function isMajorOverviewHub(
  station: GlobalMapStation,
  lines: StationNodeVisibilityScene["lines"],
): boolean {
  if (!station.isHub) return false;
  const stationLineIds = new Set(station.lineIds);
  if (stationLineIds.size >= GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.overviewMajorHubMinLines) return true;

  // Some major poles are split into two line records, such as a rail/metro
  // or rail/tram interchange. Keep those cross-family pairs, but hide
  // same-family pairs like the U/L and U/N stations in the overview. The
  // classification intentionally uses the station's complete line list: a
  // secondary family can be filtered from the current view while the station
  // remains a real interchange hub.
  const stationModes = new Set(
    lines
      .filter((line) => stationLineIds.has(line.id))
      .map((line) => line.mode),
  );
  return stationModes.size >= 2;
}

function isModeVisible(mode: GlobalMapMode, mask: number): boolean {
  const modeIndex = GLOBAL_MAP_MODE_ORDER.indexOf(mode);
  return modeIndex >= 0 && (mask & (1 << modeIndex)) !== 0;
}
