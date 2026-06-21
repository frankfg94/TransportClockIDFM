import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TRANSIT_PREFERENCES_CHANGED_EVENT,
  TRANSIT_PREFERENCES_STORAGE_KEY,
  addBoardToTransitPreferences,
  createDefaultPreferences,
  loadTransitPreferences,
  saveTransitPreferences,
} from "../src/storage/transitPreferences";
import type { TransitBoardConfig } from "../src/types/transit";

const defaultBoard = createBoard("default-board", "stop_area:test");

beforeEach(() => {
  window.localStorage.clear();
});

describe("transit preferences favorites", () => {
  it("migrates the display mode and board order without losing existing preferences", () => {
    const secondBoard = createBoard("second-board", "stop_area:second");
    window.localStorage.setItem(
      TRANSIT_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        visibleBoardIds: ["default-board", "second-board"],
        boardDisplayMode: "list",
        boardOrderIds: ["second-board", "unknown-board"],
        collapsedDirectionIds: [],
        customBoards: [],
      }),
    );

    expect(loadTransitPreferences([defaultBoard, secondBoard])).toMatchObject({
      boardDisplayMode: "list",
      boardOrderIds: ["second-board", "default-board"],
      visibleBoardIds: ["default-board", "second-board"],
    });
  });

  it("reactivates a matching default board instead of creating a custom one", () => {
    saveTransitPreferences({
      ...createDefaultPreferences([defaultBoard]),
      visibleBoardIds: [],
    });

    const preferences = addBoardToTransitPreferences(
      createBoard("generated-board", "stop_area:test"),
      [defaultBoard],
    );

    expect(preferences.visibleBoardIds).toEqual(["default-board"]);
    expect(preferences.customBoards).toEqual([]);
  });

  it("updates a custom board without duplicates and dispatches a sync event", () => {
    const listener = vi.fn();
    window.addEventListener(TRANSIT_PREFERENCES_CHANGED_EVENT, listener);

    addBoardToTransitPreferences(
      createBoard("generated-board", "stop_area:custom"),
      [],
    );
    const updated = addBoardToTransitPreferences(
      {
        ...createBoard("another-id", "stop_area:custom"),
        city: "Paris",
      },
      [],
    );

    expect(updated.customBoards).toHaveLength(1);
    expect(updated.customBoards[0].id).toBe("generated-board");
    expect(updated.customBoards[0].city).toBe("Paris");
    expect(updated.visibleBoardIds).toEqual(["generated-board"]);
    expect(listener).toHaveBeenCalled();

    window.removeEventListener(TRANSIT_PREFERENCES_CHANGED_EVENT, listener);
  });
});

function createBoard(id: string, stopAreaRef: string): TransitBoardConfig {
  return {
    id,
    title: "Station test",
    city: "Test",
    line: {
      ref: "line:test",
      shortName: "T",
      longName: "Ligne test",
      mode: "tram",
      color: "#0064ff",
      textColor: "#ffffff",
    },
    monitoringPoints: [{ ref: "stop:test", label: "Tous quais" }],
    directionGroups: [],
    schedule: {
      lineRef: "line:test",
      stopAreaRef,
    },
    maxDepartures: 8,
  };
}
