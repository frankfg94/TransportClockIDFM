import { describe, expect, it, vi } from "vitest";
import type { TrafficLineReport } from "../src/features/traffic/types";
import type { HomeAssistantBoardRequest } from "../src/types/homeAssistant";
import {
  isHomeAssistantAuthorized,
} from "../server/services/homeAssistant/runtime";
import { HomeAssistantTransitApi } from "../server/services/homeAssistant/transitApi";

describe("Home Assistant API", () => {
  it("authorizes optional bearer tokens without accepting partial values", () => {
    expect(isHomeAssistantAuthorized("", "")).toBe(true);
    expect(isHomeAssistantAuthorized("secret", "Bearer secret")).toBe(true);
    expect(isHomeAssistantAuthorized("secret", "Bearer secre")).toBe(false);
    expect(isHomeAssistantAuthorized("secret", "secret")).toBe(false);
  });

  it("exposes catalogs and isolates invalid boards in a batch", async () => {
    const fetcher = createIdfmFetchMock();
    const fetchTraffic = vi.fn(
      async (lineRef: string): Promise<TrafficLineReport> => ({
        disruptions: [],
        lineRef,
        status: "normal",
      }),
    );
    const api = new HomeAssistantTransitApi({
      fetchTraffic,
      requestOptions: {
        apiBase: "https://idfm.test/v2/navitia",
        fetcher,
        siriApiBase: "https://idfm.test",
      },
    });

    const families = await api.listFamilies();
    const lines = await api.searchLines("RER", "");
    const stations = await api.searchStations(
      "RER",
      "line:IDFM:C01743",
      "",
    );
    const directions = await api.listDirections(
      "RER",
      "line:IDFM:C01743",
      "stop_area:IDFM:69813",
    );

    expect(families.items).toEqual([
      {
        family: "RER",
        id: "commercial_mode:IDFM:RER",
        label: "Rer",
      },
    ]);
    expect(lines.items[0]).toMatchObject({
      family: "RER",
      id: "line:IDFM:C01743",
      label: "B",
    });
    expect(stations.items[0]).toMatchObject({
      city: "Antony",
      id: "stop_area:IDFM:69813",
      label: "La Croix de Berny",
    });
    expect(directions.items).toEqual([
      {
        id: "massy-palaiseau",
        label: "Massy-Palaiseau",
      },
    ]);

    const validRequest = createBoardRequest();
    const response = await api.getBoards([
      validRequest,
      {
        ...validRequest,
        stationId: "stop_area:IDFM:missing",
      },
    ]);

    expect(response.boards[0]).toMatchObject({
      family: "RER",
      id: "line-idfm-c01743-stop-area-idfm-69813",
      lineLabel: "B",
      stationLabel: "La Croix de Berny",
      traffic: {
        status: "normal",
      },
    });
    expect(response.boards[0].directions[0].departures[0]).toMatchObject({
      destination: "Massy-Palaiseau",
      platform: "1",
    });
    expect(response.boards[1].error).toContain("Station not found");

    await api.getBoards([validRequest]);

    expect(fetchTraffic).toHaveBeenCalledTimes(1);
    expect(
      fetcher.mock.calls.filter(([input]) =>
        input.toString().includes("/stop-monitoring"),
      ),
    ).toHaveLength(1);
  });

  it("rejects invalid batch envelopes and isolates invalid board fields", async () => {
    const api = new HomeAssistantTransitApi({
      fetchTraffic: vi.fn(),
      requestOptions: {
        fetcher: createIdfmFetchMock(),
      },
    });

    await expect(api.getBoards([])).rejects.toThrow(
      "At least one board is required",
    );

    const response = await api.getBoards([
      {
        ...createBoardRequest(),
        directionIds: [],
        limit: 6,
      },
    ]);

    expect(response.boards[0]).toMatchObject({
      directions: [],
      error: "At least one directionId is required.",
      traffic: { status: "error" },
    });
  });
});

function createBoardRequest(): HomeAssistantBoardRequest {
  return {
    directionIds: ["massy-palaiseau"],
    family: "RER",
    limit: 4,
    lineId: "line:IDFM:C01743",
    stationId: "stop_area:IDFM:69813",
  };
}

function createIdfmFetchMock() {
  const departureTime = new Date(Date.now() + 5 * 60_000).toISOString();

  return vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();

    if (url.includes("/commercial_modes?")) {
      return jsonResponse({
        commercial_modes: [
          {
            id: "commercial_mode:IDFM:RER",
            name: "RER",
          },
        ],
      });
    }

    if (url.includes("/commercial_modes/") && url.includes("/lines?")) {
      return jsonResponse({
        lines: [
          {
            code: "B",
            color: "5091cb",
            commercial_mode: {
              id: "commercial_mode:IDFM:RER",
              name: "RER",
            },
            id: "line:IDFM:C01743",
            name: "RER B",
            text_color: "ffffff",
          },
        ],
        pagination: {
          items_on_page: 1,
          items_per_page: 100,
          start_page: 0,
          total_result: 1,
        },
      });
    }

    if (url.includes("/lines/") && url.includes("/stop_areas?")) {
      return jsonResponse({
        pagination: {
          items_on_page: 1,
          items_per_page: 100,
          start_page: 0,
          total_result: 1,
        },
        stop_areas: [
          {
            administrative_regions: [{ name: "Antony" }],
            id: "stop_area:IDFM:69813",
            label: "La Croix de Berny (Antony)",
          },
        ],
      });
    }

    if (url.includes("/stop_schedules?")) {
      return jsonResponse({
        stop_schedules: [
          {
            date_times: [],
            display_informations: {
              direction: "Massy-Palaiseau",
            },
            stop_point: {
              id: "stop_point:IDFM:123",
            },
          },
        ],
      });
    }

    if (url.includes("/stop-monitoring?")) {
      return jsonResponse({
        Siri: {
          ServiceDelivery: {
            StopMonitoringDelivery: [
              {
                MonitoredStopVisit: [
                  {
                    ItemIdentifier: "departure-1",
                    MonitoredVehicleJourney: {
                      DestinationName: [{ value: "Massy-Palaiseau" }],
                      LineRef: { value: "STIF:Line::C01743:" },
                      MonitoredCall: {
                        DeparturePlatformName: { value: "1" },
                        DestinationDisplay: [{ value: "Massy-Palaiseau" }],
                        ExpectedDepartureTime: departureTime,
                        StopPointName: [{ value: "La Croix de Berny" }],
                      },
                    },
                    MonitoringRef: { value: "STIF:StopPoint:Q:123:" },
                  },
                ],
              },
            ],
          },
        },
      });
    }

    throw new Error(`Unexpected IDFM URL: ${url}`);
  });
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
    },
    status: 200,
  });
}
