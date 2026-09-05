import type {
  DirectionGroupConfig,
  LineSearchOption,
  StationSearchOption,
  TransitBoardConfig,
  TransitFamily,
} from "../../../types/transit";
import type {
  GlobalMapLine,
  GlobalMapMode,
  GlobalMapStation,
} from "../contracts/manifest";
import { createBoardFromDraft } from "../../../services/boardBuilder";
import { fetchDirectionGroupsForStation } from "../../../services/idfm";
import {
  cloneTransitBoardPreferences,
  getTransitPlaceById,
  loadTransitPresetState,
  resolveTransitPlaceId,
  saveTransitPresetState,
  boardsReferToSameStation,
  updateTransitPlacePreferences,
  type TransitPlacePreset,
} from "../../../storage/transitPreferences";

export interface GlobalMapDashboardTarget {
  station: GlobalMapStation;
  line: GlobalMapLine;
}

export interface GlobalMapDashboardAddResult {
  placeId: string;
  addedBoardIds: string[];
  duplicateBoardIds: string[];
  skippedStationIds: string[];
  undo(): void;
}

export type DirectionGroupsLoader = (
  line: LineSearchOption,
  station: StationSearchOption,
) => Promise<DirectionGroupConfig[]>;

export function listGlobalMapDashboardPlaces(): TransitPlacePreset[] {
  if (typeof window === "undefined") return [];
  return loadTransitPresetState([]).places;
}

export function globalMapModeToTransitFamily(
  mode: GlobalMapMode,
): TransitFamily | undefined {
  if (
    mode === "BUS" ||
    mode === "METRO" ||
    mode === "RER" ||
    mode === "TRAM" ||
    mode === "NOCTILIEN" ||
    mode === "TRANSILIEN" ||
    mode === "CABLE"
  ) {
    return mode;
  }

  // The existing dashboard model has no separate TRAIN family. Train assets
  // are still valid dashboard targets and use the existing rail family.
  if (mode === "TRAIN") return "TRANSILIEN";
  return undefined;
}

export function toDashboardLineOption(
  line: GlobalMapLine,
): LineSearchOption | undefined {
  const family = globalMapModeToTransitFamily(line.mode);
  if (!family) return undefined;

  return {
    family,
    id: line.id,
    label: line.label || line.code,
    ref: line.id,
    navitiaId: line.id,
    color: line.color,
    textColor: line.textColor,
    displayName: line.label || line.code,
  };
}

export function toDashboardStationOption(
  station: GlobalMapStation,
): StationSearchOption {
  const rawStopAreaRef = station.rawRefs
    .map((value) => value.replace(/^station:/u, ""))
    .find(isLikelyStopAreaReference);

  return {
    id: station.id,
    label: station.name,
    city: station.city,
    lon: station.lon,
    lat: station.lat,
    monitoringRef: station.rawRefs[0] ?? station.id,
    scheduleStopAreaRef: rawStopAreaRef,
  };
}

export async function addGlobalMapTargetsToDashboard(
  targets: GlobalMapDashboardTarget[],
  requestedPlaceId: string | undefined,
  options: { loadDirectionGroups?: DirectionGroupsLoader } = {},
): Promise<GlobalMapDashboardAddResult> {
  if (typeof window === "undefined") {
    throw new Error("Dashboard preferences are only available in the browser.");
  }

  const before = loadTransitPresetState([]);
  const placeId = resolveTransitPlaceId(before, requestedPlaceId);
  const place = getTransitPlaceById(before, placeId);
  const previousPreferences = cloneTransitBoardPreferences(
    place?.preferences ?? loadTransitPresetState([]).places[0]!.preferences,
  );
  const knownBoardIds = new Set([
    ...previousPreferences.visibleBoardIds,
    ...previousPreferences.boardOrderIds,
    ...previousPreferences.customBoards.map((board) => board.id),
  ]);
  const knownBoards = [...previousPreferences.customBoards];
  const addedBoardIds: string[] = [];
  const duplicateBoardIds: string[] = [];
  const skippedStationIds: string[] = [];
  const loadDirectionGroups =
    options.loadDirectionGroups ?? fetchDirectionGroupsForStation;

  const boardsToAdd: TransitBoardConfig[] = [];

  for (const target of uniqueTargets(targets)) {
    const line = toDashboardLineOption(target.line);
    if (!line) {
      skippedStationIds.push(target.station.id);
      continue;
    }

    const station = toDashboardStationOption(target.station);
    const fallbackBoard = createBoardFromDraft(
      { family: line.family, line, station },
      [createFallbackDirectionGroup(station.label)],
    );
    if (
      knownBoardIds.has(fallbackBoard.id) ||
      knownBoards.some((candidate) => boardsReferToSameStation(candidate, fallbackBoard))
    ) {
      duplicateBoardIds.push(fallbackBoard.id);
      continue;
    }

    const directionGroups =
      typeof navigator !== "undefined" && navigator.onLine === false
        ? [createFallbackDirectionGroup(station.label)]
        : await loadDirectionGroups(line, station).catch(() => [
            createFallbackDirectionGroup(station.label),
          ]);
    const board = createBoardFromDraft(
      { family: line.family, line, station },
      directionGroups.length > 0
        ? directionGroups
      : [createFallbackDirectionGroup(station.label)],
    );

    knownBoardIds.add(board.id);
    knownBoards.push(board);
    addedBoardIds.push(board.id);
    boardsToAdd.push(board);
  }

  if (boardsToAdd.length > 0) {
    const nextPreferences = cloneTransitBoardPreferences(previousPreferences);
    for (const board of boardsToAdd) {
      nextPreferences.customBoards.push(board);
      if (!nextPreferences.visibleBoardIds.includes(board.id)) {
        nextPreferences.visibleBoardIds.push(board.id);
      }
      if (!nextPreferences.boardOrderIds.includes(board.id)) {
        nextPreferences.boardOrderIds.push(board.id);
      }
    }
    saveTransitPresetState(
      updateTransitPlacePreferences(before, placeId, nextPreferences),
    );
  }

  return {
    placeId,
    addedBoardIds,
    duplicateBoardIds,
    skippedStationIds,
    undo(): void {
      const current = loadTransitPresetState([]);
      saveTransitPresetState(
        updateTransitPlacePreferences(current, placeId, previousPreferences),
      );
    },
  };
}

function uniqueTargets(
  targets: GlobalMapDashboardTarget[],
): GlobalMapDashboardTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.station.id}\u0000${target.line.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isLikelyStopAreaReference(value: string): boolean {
  return (
    value.startsWith("FR::") ||
    value.startsWith("stop_area:") ||
    /(?:monomodalStopPlace|multimodalStopPlace|StopArea)/iu.test(value)
  );
}

function createFallbackDirectionGroup(label: string): DirectionGroupConfig {
  return {
    id: "global-map-fallback",
    label,
    match: {},
  };
}
