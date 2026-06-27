import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TRANSIT_PREFERENCES_CHANGED_EVENT,
  TRANSIT_PREFERENCES_STORAGE_KEY,
  DEFAULT_TRANSIT_PLACE_ID,
  WORK_TRANSIT_PLACE_ID,
  addBoardToTransitPreferences,
  createDefaultPreferences,
  createTransitPlace,
  deleteTransitPlace,
  loadTransitPreferences,
  loadTransitPresetState,
  renameTransitPlace,
  resolveTransitPlaceId,
  saveTransitPresetState,
  saveTransitPreferences,
  setDefaultTransitPlace,
  updateTransitPlacePreferences,
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

    const state = loadTransitPresetState([defaultBoard, secondBoard]);
    expect(state.defaultPlaceId).toBe(DEFAULT_TRANSIT_PLACE_ID);
    expect(state.places.map((place) => place.id)).toEqual([
      DEFAULT_TRANSIT_PLACE_ID,
      WORK_TRANSIT_PLACE_ID,
    ]);
    expect(
      state.places.find((place) => place.id === WORK_TRANSIT_PLACE_ID)
        ?.preferences.visibleBoardIds,
    ).toEqual([]);
  });

  it("falls back to safe built-in places when storage is malformed", () => {
    window.localStorage.setItem(TRANSIT_PREFERENCES_STORAGE_KEY, "{nope");

    const state = loadTransitPresetState([defaultBoard]);

    expect(state.defaultPlaceId).toBe(DEFAULT_TRANSIT_PLACE_ID);
    expect(state.places[0].label).toBe("Maison");
    expect(state.places[0].preferences.visibleBoardIds).toEqual([
      "default-board",
    ]);
    expect(state.places[1].label).toBe("Travail");
    expect(state.places[1].preferences.visibleBoardIds).toEqual([]);
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

  it("adds a board only to the requested preset", () => {
    addBoardToTransitPreferences(
      {
        ...createBoard("work-board", "stop_area:work"),
        title: "Station travail",
      },
      [defaultBoard],
      WORK_TRANSIT_PLACE_ID,
    );

    const state = loadTransitPresetState([defaultBoard]);
    const home = state.places.find((place) => place.id === DEFAULT_TRANSIT_PLACE_ID);
    const work = state.places.find((place) => place.id === WORK_TRANSIT_PLACE_ID);

    expect(home?.preferences.visibleBoardIds).toEqual(["default-board"]);
    expect(work?.preferences.visibleBoardIds).toEqual(["work-board"]);
  });

  it("creates, renames, deletes, and protects presets", () => {
    const initialState = loadTransitPresetState([defaultBoard]);
    const created = createTransitPlace(initialState, "Salle de sport", [
      defaultBoard,
    ]);

    expect(created.place.id).toBe("salle-de-sport");
    expect(created.place.preferences.visibleBoardIds).toEqual([]);
    expect(created.state.places.map((place) => place.id)).toEqual([
      DEFAULT_TRANSIT_PLACE_ID,
      "salle-de-sport",
      WORK_TRANSIT_PLACE_ID,
    ]);

    const withCustomPreferences = updateTransitPlacePreferences(
      created.state,
      created.place.id,
      {
        ...created.place.preferences,
        visibleBoardIds: ["default-board"],
        closedDirectionSummaryMode: "last",
      },
    );
    const renamed = renameTransitPlace(
      withCustomPreferences,
      created.place.id,
      "Studio",
    );

    expect(resolveTransitPlaceId(renamed, "studio")).toBe("studio");
    expect(renamed.places.map((place) => place.id)).toEqual([
      DEFAULT_TRANSIT_PLACE_ID,
      "studio",
      WORK_TRANSIT_PLACE_ID,
    ]);
    expect(
      renamed.places.find((place) => place.id === "studio")?.preferences
        .closedDirectionSummaryMode,
    ).toBe("last");
    expect(() => createTransitPlace(renamed, "Home", [defaultBoard])).toThrow(
      "réservé",
    );
    expect(() => createTransitPlace(renamed, "Studio", [defaultBoard])).toThrow(
      "existe",
    );
    expect(() =>
      deleteTransitPlace(renamed, DEFAULT_TRANSIT_PLACE_ID),
    ).toThrow("ne peuvent pas être supprimés");

    const withoutCustom = deleteTransitPlace(renamed, "studio");
    expect(withoutCustom.places.map((place) => place.id)).toEqual([
      DEFAULT_TRANSIT_PLACE_ID,
      WORK_TRANSIT_PLACE_ID,
    ]);
  });

  it("persists the default place and per-place preferences", () => {
    const initialState = loadTransitPresetState([defaultBoard]);
    const workPreferences =
      initialState.places.find((place) => place.id === WORK_TRANSIT_PLACE_ID)
        ?.preferences ?? createDefaultPreferences([]);
    const state = setDefaultTransitPlace(
      updateTransitPlacePreferences(initialState, WORK_TRANSIT_PLACE_ID, {
        ...workPreferences,
        boardDisplayMode: "list",
      }),
      WORK_TRANSIT_PLACE_ID,
    );

    saveTransitPresetState(state);

    const reloaded = loadTransitPresetState([defaultBoard]);
    expect(reloaded.defaultPlaceId).toBe(WORK_TRANSIT_PLACE_ID);
    expect(loadTransitPreferences([defaultBoard], WORK_TRANSIT_PLACE_ID)).toMatchObject({
      boardDisplayMode: "list",
      visibleBoardIds: [],
    });
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
