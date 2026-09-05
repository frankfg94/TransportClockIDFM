import { describe, expect, it, vi } from "vitest";
import { fetchDirectionGroupsForStation } from "../src/services/idfm";
import {
  createDefaultPreferences,
  migrateCustomBoardDirectionGroups,
} from "../src/storage/transitPreferences";
import type {
  LineSearchOption,
  StationSearchOption,
  TransitBoardConfig,
} from "../src/types/transit";

describe("station direction groups", () => {
  it("loads every schedule page before deriving directions", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());

      expect(url.searchParams.get("count")).toBe("100");

      if (url.searchParams.get("start_page") === "0") {
        return jsonResponse({
          pagination: {
            total_result: 102,
            start_page: 0,
            items_per_page: 100,
            items_on_page: 100,
          },
          // A busy direction can fill the first page entirely.
          stop_schedules: Array.from({ length: 100 }, () =>
            createSchedule(
              "Aéroport d’Orly (Terminaux 1-2-3) (Paray-Vieille-Poste)",
              "stop_point:IDFM:490851",
            ),
          ),
        });
      }

      expect(url.searchParams.get("start_page")).toBe("1");
      return jsonResponse({
        pagination: {
          total_result: 102,
          start_page: 1,
          items_per_page: 100,
          items_on_page: 2,
        },
        stop_schedules: [
          createSchedule(
            "Saint-Denis - Pleyel (Saint-Denis)",
            "stop_point:IDFM:490835",
          ),
        ],
      });
    });

    const groups = await fetchDirectionGroupsForStation(line, station, {
      apiBase: "https://idfm.test/v2/navitia",
      fetcher: fetcher as typeof fetch,
    });

    expect(groups).toEqual([
      expect.objectContaining({
        id: "aeroport-d-orly-terminaux-1-2-3",
        label: "Aéroport d’Orly (Terminaux 1-2-3)",
        match: {
          destinationIncludes: ["Aéroport d’Orly (Terminaux 1-2-3)"],
          navitiaStopPointRefs: ["stop_point:IDFM:490851"],
        },
      }),
      expect.objectContaining({
        id: "saint-denis-pleyel",
        label: "Saint-Denis - Pleyel",
        match: {
          destinationIncludes: ["Saint-Denis - Pleyel"],
          navitiaStopPointRefs: ["stop_point:IDFM:490835"],
        },
      }),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not persist an all-directions fallback after a transient lookup failure", async () => {
    const fetcher = vi.fn(async () =>
      new Response("Service unavailable", { status: 503 }),
    );

    await expect(
      fetchDirectionGroupsForStation(line, station, {
        apiBase: "https://idfm.test/v2/navitia",
        fetcher: fetcher as typeof fetch,
      }),
    ).rejects.toThrow("HTTP 503");
  });

  it("keeps every stop point serving the same direction", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        pagination: {
          total_result: 2,
          start_page: 0,
          items_per_page: 100,
          items_on_page: 2,
        },
        stop_schedules: [
          createSchedule(
            "Saint-Denis - Pleyel (Saint-Denis)",
            "stop_point:IDFM:490835",
          ),
          createSchedule(
            "Saint-Denis - Pleyel (Saint-Denis)",
            "stop_point:IDFM:490836",
          ),
        ],
      }),
    );

    const groups = await fetchDirectionGroupsForStation(line, station, {
      apiBase: "https://idfm.test/v2/navitia",
      fetcher: fetcher as typeof fetch,
    });

    expect(groups).toEqual([
      expect.objectContaining({
        id: "saint-denis-pleyel",
        match: expect.objectContaining({
          navitiaStopPointRefs: [
            "stop_point:IDFM:490835",
            "stop_point:IDFM:490836",
          ],
        }),
      }),
    ]);
  });

  it("upgrades existing custom boards that were saved with one direction", async () => {
    const preferences = {
      ...createDefaultPreferences([]),
      customBoards: [createBoardWithOneDirection()],
      visibleBoardIds: ["metro-14-chevilly"],
      boardOrderIds: ["metro-14-chevilly"],
      directionGroupDiscoveryVersion: 1,
    };
    const discoverDirectionGroups = vi.fn().mockResolvedValue([
      {
        id: "aeroport-d-orly",
        label: "Aéroport d’Orly",
        match: {
          destinationIncludes: ["Aéroport d’Orly"],
          navitiaStopPointRefs: ["stop_point:IDFM:490851"],
        },
      },
      {
        id: "saint-denis-pleyel",
        label: "Saint-Denis - Pleyel",
        match: {
          destinationIncludes: ["Saint-Denis - Pleyel"],
          navitiaStopPointRefs: ["stop_point:IDFM:490835"],
        },
      },
    ]);

    const result = await migrateCustomBoardDirectionGroups(
      preferences,
      discoverDirectionGroups,
    );

    expect(result).toEqual({
      updatedBoardIds: ["metro-14-chevilly"],
      completed: true,
    });
    expect(preferences.customBoards[0].directionGroups).toHaveLength(2);
    expect(preferences.directionGroupDiscoveryVersion).toBe(2);
    expect(discoverDirectionGroups).toHaveBeenCalledWith(
      expect.objectContaining({ id: "metro-14-chevilly" }),
    );
  });

  it("retries a fallback direction after the migration version is current", async () => {
    const board = createBoardWithOneDirection();
    board.directionGroups = [
      {
        id: "all-directions",
        label: "All directions",
        subtitle: board.title,
        match: {},
      },
    ];
    const preferences = {
      ...createDefaultPreferences([]),
      customBoards: [board],
      visibleBoardIds: [board.id],
      boardOrderIds: [board.id],
      directionGroupDiscoveryVersion: 2,
    };
    const discoverDirectionGroups = vi.fn().mockResolvedValue([
      {
        id: "saint-denis-pleyel",
        label: "Saint-Denis - Pleyel",
        match: {
          destinationIncludes: ["Saint-Denis - Pleyel"],
        },
      },
    ]);

    const result = await migrateCustomBoardDirectionGroups(
      preferences,
      discoverDirectionGroups,
    );

    expect(result).toEqual({
      updatedBoardIds: [board.id],
      completed: true,
    });
    expect(preferences.customBoards[0].directionGroups).toEqual([
      expect.objectContaining({ id: "saint-denis-pleyel" }),
    ]);
    expect(discoverDirectionGroups).toHaveBeenCalledWith(
      expect.objectContaining({ id: board.id }),
    );
  });
});

const line: LineSearchOption = {
  family: "METRO",
  id: "line:IDFM:C01384",
  label: "14",
  navitiaId: "line:IDFM:C01384",
  ref: "line:IDFM:C01384",
};

const station: StationSearchOption = {
  id: "stop_area:IDFM:73753",
  label: "Chevilly-Larue (Marché International)",
  monitoringRef: "STIF:StopArea:SP:73753:",
  scheduleStopAreaRef: "stop_area:IDFM:73753",
};

function createSchedule(direction: string, stopPointId: string) {
  return {
    display_informations: { direction },
    stop_point: { id: stopPointId },
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  });
}

function createBoardWithOneDirection(): TransitBoardConfig {
  return {
    id: "metro-14-chevilly",
    title: "Chevilly-Larue (Marché International)",
    city: "Chevilly-Larue",
    line: {
      ref: "STIF:Line::C01384:",
      shortName: "14",
      longName: "Métro 14",
      mode: "metro",
      color: "#65008c",
      textColor: "#ffffff",
    },
    monitoringPoints: [
      { ref: "STIF:StopPoint:Q:490851:", label: "Aéroport d’Orly" },
    ],
    directionGroups: [
      {
        id: "aeroport-d-orly",
        label: "Aéroport d’Orly",
        match: {
          destinationIncludes: ["Aéroport d’Orly"],
          navitiaStopPointRefs: ["stop_point:IDFM:490851"],
        },
      },
    ],
    schedule: {
      lineRef: "line:IDFM:C01384",
      stopAreaRef: "stop_area:IDFM:73753",
    },
    maxDepartures: 8,
  };
}
