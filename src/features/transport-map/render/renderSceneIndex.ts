import type {
  GlobalMapLine,
  GlobalMapPath,
  GlobalMapStation,
} from "../contracts/manifest";
import type {
  TransportMapRenderScene,
  TransportMapTrafficPathSpan,
} from "../contracts/renderer";
import { GLOBAL_MAP_MODE_ORDER } from "../contracts/manifest";
import { TransportMapTrafficRangeIndex } from "./trafficRanges";
import {
  createStationNodeVisibilityContext,
  type StationNodeVisibilityContext,
} from "./stationNodeVisibility";

export interface TransportMapRenderSceneIndexes {
  readonly linesById: ReadonlyMap<string, GlobalMapLine>;
  readonly pathsByLineId: ReadonlyMap<string, GlobalMapPath[]>;
  readonly stationsById: ReadonlyMap<string, GlobalMapStation>;
  readonly visibleLineIds: ReadonlySet<string>;
  readonly ghostLineIds: ReadonlySet<string>;
  readonly hoveredGhostStationIds: ReadonlySet<string>;
  readonly entranceStationIds: ReadonlySet<string>;
  readonly activeLineStationIds: ReadonlySet<string>;
  readonly interruptionLineIds: ReadonlySet<string>;
  readonly disturbanceLineIds: ReadonlySet<string>;
  readonly interruptedStationIds: ReadonlySet<string>;
  readonly disturbedStationIds: ReadonlySet<string>;
  readonly selectedStationIds: ReadonlySet<string>;
  readonly stationVisibility: StationNodeVisibilityContext;
  readonly trafficRanges: TransportMapTrafficRangeIndex;
  readonly version: number;
}

/**
 * Shared scene indexes. Every collection is rebuilt only when its source
 * reference changes, matching the former Canvas2D identity invalidation
 * rules. The instance is renderer-owned so no reactive collection enters the
 * frame loop.
 */
export class TransportMapRenderSceneIndex implements TransportMapRenderSceneIndexes {
  private linesSource?: GlobalMapLine[];
  private pathsSource?: GlobalMapPath[];
  private stationsSource?: GlobalMapStation[];
  private ghostLineIdsSource?: string[];
  private entranceStationIdsSource?: string[];
  private activeLineSource?: GlobalMapLine;
  private hoveredLineId?: string;
  private interruptionLineIdsSource?: string[];
  private disturbanceLineIdsSource?: string[];
  private interruptedStationIdsSource?: string[];
  private disturbedStationIdsSource?: string[];
  private selectedStationIdsSource?: string[];
  private visibleModeMask = Number.NaN;

  linesById = new Map<string, GlobalMapLine>();
  pathsByLineId = new Map<string, GlobalMapPath[]>();
  stationsById = new Map<string, GlobalMapStation>();
  visibleLineIds = new Set<string>();
  ghostLineIds = new Set<string>();
  hoveredGhostStationIds = new Set<string>();
  entranceStationIds = new Set<string>();
  activeLineStationIds = new Set<string>();
  interruptionLineIds = new Set<string>();
  disturbanceLineIds = new Set<string>();
  interruptedStationIds = new Set<string>();
  disturbedStationIds = new Set<string>();
  selectedStationIds = new Set<string>();
  stationVisibility: StationNodeVisibilityContext = createStationNodeVisibilityContext({
    lines: [],
    activeLineId: undefined,
    activeStationId: undefined,
    hoveredLineId: undefined,
    selectedStationIds: [],
    visibleModeMask: 0,
    ghostLineIds: [],
    stations: [],
  });
  trafficRanges = new TransportMapTrafficRangeIndex();
  version = 0;

  update(scene: TransportMapRenderScene): void {
    let changed = false;
    const linesChanged = this.linesSource !== scene.lines;
    const stationsChanged = this.stationsSource !== scene.stations;
    const ghostLineIdsChanged = this.ghostLineIdsSource !== scene.ghostLineIds;

    if (linesChanged) {
      this.linesSource = scene.lines;
      this.linesById = new Map(scene.lines.map((line) => [line.id, line]));
      changed = true;
    }
    if (this.pathsSource !== scene.paths) {
      this.pathsSource = scene.paths;
      this.pathsByLineId = new Map();
      for (const path of scene.paths) {
        const paths = this.pathsByLineId.get(path.lineId) ?? [];
        paths.push(path);
        this.pathsByLineId.set(path.lineId, paths);
      }
      changed = true;
    }
    if (stationsChanged) {
      this.stationsSource = scene.stations;
      this.stationsById = new Map(scene.stations.map((station) => [station.id, station]));
      changed = true;
    }
    if (ghostLineIdsChanged) {
      this.ghostLineIdsSource = scene.ghostLineIds;
      this.ghostLineIds = new Set(scene.ghostLineIds ?? []);
      changed = true;
    }
    if (this.visibleModeMask !== scene.visibleModeMask || changed) {
      this.visibleModeMask = scene.visibleModeMask;
      this.visibleLineIds.clear();
      for (const line of scene.lines) {
        if (this.ghostLineIds.has(line.id) || isModeVisible(line.mode, scene.visibleModeMask)) {
          this.visibleLineIds.add(line.id);
        }
      }
      changed = true;
    }
    if (this.entranceStationIdsSource !== scene.entranceStationIds) {
      this.entranceStationIdsSource = scene.entranceStationIds;
      this.entranceStationIds = new Set(scene.entranceStationIds ?? []);
      changed = true;
    }
    const nextActiveLine = scene.activeLineId ? this.linesById.get(scene.activeLineId) : undefined;
    const activeLineChanged = this.activeLineSource !== nextActiveLine;
    if (linesChanged || stationsChanged || activeLineChanged) {
      this.activeLineSource = nextActiveLine;
      this.activeLineStationIds = new Set(this.activeLineSource?.stationIds ?? []);
      if (this.activeLineSource) {
        for (const station of scene.stations) {
          if (station.lineIds.includes(this.activeLineSource.id)) {
            this.activeLineStationIds.add(station.id);
          }
        }
      }
      changed = true;
    }
    if (activeLineChanged) {
      this.visibleLineIds.clear();
      for (const line of scene.lines) {
        if (this.ghostLineIds.has(line.id) || isModeVisible(line.mode, scene.visibleModeMask)) {
          this.visibleLineIds.add(line.id);
        }
      }
    }
    if (this.activeLineSource) this.visibleLineIds.add(this.activeLineSource.id);
    if (this.hoveredLineId !== scene.hoveredLineId || linesChanged || stationsChanged || ghostLineIdsChanged) {
      this.hoveredLineId = scene.hoveredLineId;
      const hoveredLine = scene.hoveredLineId ? this.linesById.get(scene.hoveredLineId) : undefined;
      this.hoveredGhostStationIds = new Set(
        hoveredLine && hoveredLine.id !== scene.activeLineId && this.ghostLineIds.has(hoveredLine.id)
          ? hoveredLine.stationIds
          : [],
      );
      changed = true;
    }
    changed = this.updateSet(scene.interruptionLineIds, "interruptionLineIdsSource", "interruptionLineIds") || changed;
    changed = this.updateSet(scene.disturbanceLineIds, "disturbanceLineIdsSource", "disturbanceLineIds") || changed;
    changed = this.updateSet(scene.interruptedStationIds, "interruptedStationIdsSource", "interruptedStationIds") || changed;
    changed = this.updateSet(scene.disturbedStationIds, "disturbedStationIdsSource", "disturbedStationIds") || changed;
    changed = this.updateSet(scene.selectedStationIds, "selectedStationIdsSource", "selectedStationIds") || changed;

    this.trafficRanges.update(scene.trafficPathSpans);
    if (changed) {
      this.stationVisibility = createStationNodeVisibilityContext(scene, {
        visibleLineIds: this.visibleLineIds,
        ghostLineIds: this.ghostLineIds,
        activeLineStationIds: this.activeLineStationIds,
        hoveredGhostStationIds: this.hoveredGhostStationIds,
        selectedStationIds: this.selectedStationIds,
      });
      this.version += 1;
    }
  }

  dispose(): void {
    this.linesSource = undefined;
    this.pathsSource = undefined;
    this.stationsSource = undefined;
    this.ghostLineIdsSource = undefined;
    this.entranceStationIdsSource = undefined;
    this.activeLineSource = undefined;
    this.hoveredLineId = undefined;
    this.interruptionLineIdsSource = undefined;
    this.disturbanceLineIdsSource = undefined;
    this.interruptedStationIdsSource = undefined;
    this.disturbedStationIdsSource = undefined;
    this.selectedStationIdsSource = undefined;
    this.visibleModeMask = Number.NaN;
    this.linesById.clear();
    this.pathsByLineId.clear();
    this.stationsById.clear();
    this.visibleLineIds.clear();
    this.ghostLineIds.clear();
    this.hoveredGhostStationIds.clear();
    this.entranceStationIds.clear();
    this.activeLineStationIds.clear();
    this.interruptionLineIds.clear();
    this.disturbanceLineIds.clear();
    this.interruptedStationIds.clear();
    this.disturbedStationIds.clear();
    this.selectedStationIds.clear();
    this.trafficRanges = new TransportMapTrafficRangeIndex();
    this.version += 1;
  }

  private updateSet(
    source: string[] | undefined,
    sourceKey:
      | "interruptionLineIdsSource"
      | "disturbanceLineIdsSource"
      | "interruptedStationIdsSource"
      | "disturbedStationIdsSource"
      | "selectedStationIdsSource",
    targetKey:
      | "interruptionLineIds"
      | "disturbanceLineIds"
      | "interruptedStationIds"
      | "disturbedStationIds"
      | "selectedStationIds",
  ): boolean {
    if (this[sourceKey] === source) return false;
    this[sourceKey] = source;
    this[targetKey] = new Set(source ?? []);
    return true;
  }
}

function isModeVisible(mode: GlobalMapLine["mode"], mask: number): boolean {
  const modeIndex = GLOBAL_MAP_MODE_ORDER.indexOf(mode);
  return modeIndex >= 0 && (mask & (1 << modeIndex)) !== 0;
}
