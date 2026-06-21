import type { TransitBoardConfig, TransitBoardPreferences } from "../types/transit";

import type { DirectionGroupConfig } from "../types/transit";

export const TRANSIT_PREFERENCES_STORAGE_KEY =
  "transport-clock.preferences.v2";
export const TRANSIT_PREFERENCES_CHANGED_EVENT =
  "transport-clock:preferences-changed";
const DIRECTION_GROUP_DISCOVERY_VERSION = 1;

export interface DirectionGroupMigrationResult {
  updatedBoardIds: string[];
  completed: boolean;
}

export function createDefaultPreferences(
  boards: TransitBoardConfig[],
): TransitBoardPreferences {
  return {
    visibleBoardIds: boards.map((board) => board.id),
    boardOrderIds: boards.map((board) => board.id),
    boardDisplayMode: "grid",
    collapsedDirectionIds: [],
    customBoards: [],
    directionGroupDiscoveryVersion: DIRECTION_GROUP_DISCOVERY_VERSION,
  };
}

export function loadTransitPreferences(
  defaultBoards: TransitBoardConfig[],
): TransitBoardPreferences {
  const defaults = createDefaultPreferences(defaultBoards);
  const rawValue = window.localStorage.getItem(
    TRANSIT_PREFERENCES_STORAGE_KEY,
  );

  if (!rawValue) {
    return defaults;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<TransitBoardPreferences>;
    const customBoards = parsedValue.customBoards ?? [];
    const knownBoardIds = [
      ...defaultBoards.map((board) => board.id),
      ...customBoards.map((board) => board.id),
    ];
    const knownBoardIdSet = new Set(knownBoardIds);
    const visibleBoardIds =
      parsedValue.visibleBoardIds?.filter((id) => knownBoardIdSet.has(id)) ??
      defaults.visibleBoardIds;

    return {
      visibleBoardIds,
      boardOrderIds: normalizeBoardOrderIds(
        parsedValue.boardOrderIds,
        knownBoardIds,
      ),
      boardDisplayMode:
        parsedValue.boardDisplayMode === "list" ? "list" : "grid",
      collapsedDirectionIds: parsedValue.collapsedDirectionIds ?? [],
      customBoards,
      directionGroupDiscoveryVersion: readDirectionGroupDiscoveryVersion(
        parsedValue.directionGroupDiscoveryVersion,
      ),
    };
  } catch {
    return defaults;
  }
}

export function saveTransitPreferences(
  preferences: TransitBoardPreferences,
): void {
  window.localStorage.setItem(
    TRANSIT_PREFERENCES_STORAGE_KEY,
    JSON.stringify(preferences),
  );
  window.dispatchEvent(new Event(TRANSIT_PREFERENCES_CHANGED_EVENT));
}

export async function migrateCustomBoardDirectionGroups(
  preferences: TransitBoardPreferences,
  discoverDirectionGroups: (
    board: TransitBoardConfig,
  ) => Promise<DirectionGroupConfig[] | undefined>,
): Promise<DirectionGroupMigrationResult> {
  if (
    preferences.directionGroupDiscoveryVersion >=
    DIRECTION_GROUP_DISCOVERY_VERSION
  ) {
    return { updatedBoardIds: [], completed: true };
  }

  const candidates = preferences.customBoards.filter(
    (board) => Boolean(board.schedule) && board.directionGroups.length === 1,
  );
  const updatedBoardIds: string[] = [];
  let completed = true;

  for (const board of candidates) {
    try {
      const directionGroups = await discoverDirectionGroups(board);

      if (!directionGroups) {
        completed = false;
        continue;
      }

      if (!haveSameDirectionGroups(board.directionGroups, directionGroups)) {
        preferences.customBoards = preferences.customBoards.map((candidate) =>
          candidate.id === board.id
            ? { ...candidate, directionGroups }
            : candidate,
        );
        updatedBoardIds.push(board.id);
      }
    } catch {
      // Leave the migration pending so a transient API failure is retried.
      completed = false;
    }
  }

  if (completed) {
    preferences.directionGroupDiscoveryVersion =
      DIRECTION_GROUP_DISCOVERY_VERSION;
  }

  return { updatedBoardIds, completed };
}

export function addBoardToTransitPreferences(
  board: TransitBoardConfig,
  defaultBoards: TransitBoardConfig[],
): TransitBoardPreferences {
  const preferences = loadTransitPreferences(defaultBoards);
  const defaultBoard = defaultBoards.find((candidate) =>
    boardsReferToSameStation(candidate, board),
  );

  if (defaultBoard) {
    preferences.visibleBoardIds = addUniqueId(
      preferences.visibleBoardIds,
      defaultBoard.id,
    );
    preferences.boardOrderIds = addUniqueId(
      preferences.boardOrderIds,
      defaultBoard.id,
    );
    saveTransitPreferences(preferences);
    return preferences;
  }

  const existingIndex = preferences.customBoards.findIndex(
    (candidate) =>
      candidate.id === board.id || boardsReferToSameStation(candidate, board),
  );

  if (existingIndex >= 0) {
    const existingId = preferences.customBoards[existingIndex].id;

    preferences.customBoards[existingIndex] = {
      ...board,
      id: existingId,
    };
    preferences.visibleBoardIds = addUniqueId(
      preferences.visibleBoardIds,
      existingId,
    );
    preferences.boardOrderIds = addUniqueId(
      preferences.boardOrderIds,
      existingId,
    );
  } else {
    preferences.customBoards.push(board);
    preferences.visibleBoardIds = addUniqueId(
      preferences.visibleBoardIds,
      board.id,
    );
    preferences.boardOrderIds = addUniqueId(
      preferences.boardOrderIds,
      board.id,
    );
  }

  saveTransitPreferences(preferences);
  return preferences;
}

function boardsReferToSameStation(
  left: TransitBoardConfig,
  right: TransitBoardConfig,
): boolean {
  const leftStopArea = normalizeIdentity(left.schedule?.stopAreaRef);
  const rightStopArea = normalizeIdentity(right.schedule?.stopAreaRef);
  const leftLine = normalizeIdentity(
    left.schedule?.lineRef ?? left.line.ref ?? left.line.shortName,
  );
  const rightLine = normalizeIdentity(
    right.schedule?.lineRef ?? right.line.ref ?? right.line.shortName,
  );

  if (
    leftStopArea &&
    rightStopArea &&
    leftStopArea === rightStopArea &&
    leftLine === rightLine
  ) {
    return true;
  }

  return (
    normalizeIdentity(left.title) === normalizeIdentity(right.title) &&
    normalizeIdentity(left.line.shortName) ===
      normalizeIdentity(right.line.shortName)
  );
}

function addUniqueId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

function normalizeBoardOrderIds(
  value: unknown,
  knownBoardIds: string[],
): string[] {
  const knownBoardIdSet = new Set(knownBoardIds);
  const savedIds = Array.isArray(value)
    ? value.filter(
        (id): id is string =>
          typeof id === "string" && knownBoardIdSet.has(id),
      )
    : [];

  return [...new Set([...savedIds, ...knownBoardIds])];
}

function normalizeIdentity(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/giu, "")
    .toLowerCase();
}

function readDirectionGroupDiscoveryVersion(value: unknown): number {
  return typeof value === "number" && value >= 0 ? value : 0;
}

function haveSameDirectionGroups(
  left: DirectionGroupConfig[],
  right: DirectionGroupConfig[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (group, index) =>
        group.id === right[index]?.id &&
        group.label === right[index]?.label &&
        JSON.stringify(group.match) === JSON.stringify(right[index]?.match),
    )
  );
}

