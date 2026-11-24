import { transitBoards } from "../../config/transitBoards";
import { transitModeToFamily } from "../../services/linePresentation";
import {
  createDefaultPreferences,
  loadTransitPreferences,
} from "../../storage/transitPreferences";
import type { TransitBoardConfig } from "../../types/transit";
import { resolveBoardTrafficLineRef } from "./dashboardTrafficBranches";
import type { ActiveTrafficLine } from "./types";

export function getActiveTrafficBoards(placeId?: string): TransitBoardConfig[] {
  const preferences =
    typeof window === "undefined"
      ? createDefaultPreferences(transitBoards)
      : loadTransitPreferences(transitBoards, placeId);
  const visibleBoardIds = new Set(preferences.visibleBoardIds);
  const order = new Map(preferences.boardOrderIds.map((id, index) => [id, index]));
  return [...transitBoards, ...preferences.customBoards]
    .filter((board) => visibleBoardIds.has(board.id))
    .sort((left, right) =>
      (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
}

export function getActiveTrafficLines(placeId?: string): ActiveTrafficLine[] {
  return groupActiveTrafficLines(getActiveTrafficBoards(placeId));
}

export function groupActiveTrafficLines(boards: readonly TransitBoardConfig[]): ActiveTrafficLine[] {
  const linesByRef = new Map<string, ActiveTrafficLine>();

  boards
    .filter((board) => board.line.mode !== "bus")
    .forEach((board) => {
      const navitiaLineRef = resolveBoardTrafficLineRef(board);
      const existing = linesByRef.get(navitiaLineRef);

      if (existing) {
        existing.boardIds.push(board.id);
        existing.boardTitles.push(board.title);
        return;
      }

      linesByRef.set(navitiaLineRef, {
        boardIds: [board.id],
        boardTitles: [board.title],
        family: transitModeToFamily(board.line.mode),
        line: board.line,
        navitiaLineRef,
      });
    });

  return Array.from(linesByRef.values());
}
