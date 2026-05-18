import type { TransitBoardConfig, TransitBoardPreferences } from "../types/transit";

const STORAGE_KEY = "transport-clock.preferences.v2";

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
  const rawValue = window.localStorage.getItem(STORAGE_KEY);

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
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

