import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addGlobalMapTargetsToDashboard,
  toDashboardStationOption,
} from "../src/features/transport-map/adapters/dashboard";
import { loadTransitPresetState } from "../src/storage/transitPreferences";
import type {
  GlobalMapLine,
  GlobalMapStation,
} from "../src/features/transport-map/contracts/manifest";

const station: GlobalMapStation = {
  id: "station:FR::monomodalStopPlace:123:FR1",
  index: 0,
  name: "Station test",
  normalizedName: "station test",
  city: "Paris",
  aliases: ["Station test"],
  rawRefs: ["FR::monomodalStopPlace:123:FR1"],
  lineIds: ["line:IDFM:C00123"],
  ownerChunkId: "z11-0-0",
  isHub: true,
  sourceCrs: "EPSG:2154",
  sourceX: 648000,
  sourceY: 6860000,
  lon: 2.35,
  lat: 48.85,
  worldX: 0.5,
  worldY: 0.3,
  coordinateSource: "netex",
  coordinateAccuracyM: 1,
  transformVersion: "lambert93-ntf-v1",
};

const line: GlobalMapLine = {
  id: "line:IDFM:C00123",
  index: 0,
  code: "123",
  label: "123",
  mode: "METRO",
  color: "#123456",
  textColor: "#ffffff",
  aliases: ["123"],
  stationIds: [station.id],
  geometryIds: [],
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("global map dashboard adapter", () => {
  it("maps official stop-area references without coupling the renderer to storage", () => {
    expect(toDashboardStationOption(station)).toMatchObject({
      id: station.id,
      scheduleStopAreaRef: "FR::monomodalStopPlace:123:FR1",
    });
  });

  it("adds multiple targets, deduplicates them, and restores the previous place on undo", async () => {
    const preferenceWrites = vi.fn();
    window.addEventListener("transport-clock:preferences-changed", preferenceWrites);
    const loadDirectionGroups = vi.fn(async () => [
      { id: "north", label: "North", match: {} },
    ]);
    const target = { station, line };

    const first = await addGlobalMapTargetsToDashboard(
      [target, target],
      "home",
      { loadDirectionGroups },
    );

    expect(first.addedBoardIds).toHaveLength(1);
    expect(first.duplicateBoardIds).toHaveLength(0);
    expect(loadDirectionGroups).toHaveBeenCalledTimes(1);
    expect(loadTransitPresetState([]).places[0]?.preferences.customBoards).toHaveLength(1);
    expect(preferenceWrites).toHaveBeenCalledTimes(1);

    const second = await addGlobalMapTargetsToDashboard(
      [target],
      "home",
      { loadDirectionGroups },
    );
    expect(second.addedBoardIds).toHaveLength(0);
    expect(second.duplicateBoardIds).toHaveLength(1);
    expect(loadDirectionGroups).toHaveBeenCalledTimes(1);
    expect(preferenceWrites).toHaveBeenCalledTimes(1);

    first.undo();
    expect(loadTransitPresetState([]).places[0]?.preferences.customBoards).toHaveLength(0);
    window.removeEventListener("transport-clock:preferences-changed", preferenceWrites);
  });
});
