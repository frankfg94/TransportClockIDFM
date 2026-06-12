import type { TransitBoardConfig, TransitBoardPreferences } from "../types/transit";

export const TRANSIT_PREFERENCES_STORAGE_KEY =
  "transport-clock.preferences.v2";
export const TRANSIT_PREFERENCES_CHANGED_EVENT =
  "transport-clock:preferences-changed";

export function createDefaultPreferences(
  boards: TransitBoardConfig[],
): TransitBoardPreferences {
  return {
    visibleBoardIds: boards.map((board) => board.id),
    collapsedDirectionIds: [],
    customBoards: [],
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
    const knownBoardIds = new Set([
      ...defaultBoards.map((board) => board.id),
      ...(parsedValue.customBoards ?? []).map((board) => board.id),
    ]);
    const visibleBoardIds =
      parsedValue.visibleBoardIds?.filter((id) => knownBoardIds.has(id)) ??
      defaults.visibleBoardIds;

    return {
      visibleBoardIds,
      collapsedDirectionIds: parsedValue.collapsedDirectionIds ?? [],
      customBoards: parsedValue.customBoards ?? [],
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
  } else {
    preferences.customBoards.push(board);
    preferences.visibleBoardIds = addUniqueId(
      preferences.visibleBoardIds,
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

function normalizeIdentity(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/giu, "")
    .toLowerCase();
}

