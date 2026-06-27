import { transitBoards } from "../../config/transitBoards";
import { transitModeToFamily } from "../../services/linePresentation";
import {
  createDefaultPreferences,
  loadTransitPreferences,
} from "../../storage/transitPreferences";
import type { TransitBoardConfig } from "../../types/transit";
import { normalizeTrafficLineRef } from "./trafficNormalization";
import type { ActiveTrafficLine } from "./types";

export function getActiveTrafficLines(placeId?: string): ActiveTrafficLine[] {
  const preferences =
    typeof window === "undefined"
      ? createDefaultPreferences(transitBoards)
      : loadTransitPreferences(transitBoards, placeId);
  const boards = [...transitBoards, ...preferences.customBoards].filter(
    (board) => preferences.visibleBoardIds.includes(board.id),
  );
  const linesByRef = new Map<string, ActiveTrafficLine>();

  boards
    .filter((board) => board.line.mode !== "bus")
    .forEach((board) => {
      const navitiaLineRef = resolveBoardNavitiaLineRef(board);
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

function resolveBoardNavitiaLineRef(board: TransitBoardConfig): string {
  return normalizeTrafficLineRef(board.schedule?.lineRef ?? board.line.ref);
}
