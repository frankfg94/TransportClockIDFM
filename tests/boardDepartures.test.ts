import { describe, expect, it, vi } from "vitest";
import { fetchBoardDepartures } from "../src/services/idfm";
import type { TransitBoardConfig } from "../src/types/transit";

describe("board departures", () => {
  it("matches realtime destinations when Navitia and SIRI use different dash spacing", async () => {
    const originalFetch = globalThis.fetch;
    const departureTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.includes("/stop-monitoring")) {
        return jsonResponse(createStopMonitoringPayload(departureTime));
      }

      if (url.includes("/stop_schedules")) {
        return jsonResponse({
          stop_schedules: [
            {
              display_informations: {
                direction: "Massy - Palaiseau (Massy)",
              },
              stop_point: {
                id: "stop_point:IDFM:monomodalStopPlace:46007",
              },
              date_times: [],
            },
          ],
        });
      }

      throw new Error(`Unexpected board departures fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const result = await fetchBoardDepartures(createRerBBoard());
      const massyGroup = result.directionGroups.find(
        (group) => group.id === "massy-palaiseau",
      );

      expect(massyGroup?.departures).toHaveLength(1);
      expect(massyGroup?.departures[0].destination).toBe("Massy-Palaiseau");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("infers the platform from a single-platform direction when SIRI only reports all platforms", async () => {
    const originalFetch = globalThis.fetch;
    const departureTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.includes("/stop-monitoring")) {
        return jsonResponse(createStopMonitoringPayload(departureTime, null));
      }

      if (url.includes("/stop_schedules")) {
        return jsonResponse({
          stop_schedules: [
            {
              display_informations: {
                direction: "Massy - Palaiseau (Massy)",
              },
              stop_point: {
                id: "stop_point:IDFM:monomodalStopPlace:46007",
              },
              date_times: [],
            },
          ],
        });
      }

      throw new Error(`Unexpected board departures fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const result = await fetchBoardDepartures(createRerBBoard(["1"]));
      const massyGroup = result.directionGroups.find(
        (group) => group.id === "massy-palaiseau",
      );

      expect(massyGroup?.departures[0].platform).toBe("1");
      expect(result.departures[0].platform).toBe("1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function createRerBBoard(platforms?: string[]): TransitBoardConfig {
  return {
    id: "rer-b-croix-de-berny-test",
    title: "La Croix de Berny",
    city: "Antony",
    line: {
      ref: "STIF:Line::C01743:",
      shortName: "B",
      longName: "RER B",
      mode: "rer",
      color: "#5091cb",
      textColor: "#ffffff",
    },
    monitoringPoints: [
      {
        ref: "STIF:StopArea:SP:46007:",
        label: "Tous quais",
      },
    ],
    directionGroups: [
      {
        id: "massy-palaiseau",
        label: "Massy - Palaiseau",
        match: {
          destinationIncludes: ["Massy - Palaiseau"],
          ...(platforms ? { platforms } : {}),
        },
      },
    ],
    schedule: {
      lineRef: "line:IDFM:C01743",
      stopAreaRef: "stop_area:IDFM:69813",
    },
    maxDepartures: 4,
  };
}

function createStopMonitoringPayload(
  departureTime: string,
  platform: string | null = "1",
) {
  return {
    Siri: {
      ServiceDelivery: {
        StopMonitoringDelivery: [
          {
            MonitoredStopVisit: [
              {
                ItemIdentifier: "massy-palaiseau-test",
                MonitoringRef: {
                  value: "STIF:StopArea:SP:46007:",
                },
                MonitoredVehicleJourney: {
                  LineRef: {
                    value: "STIF:Line::C01743:",
                  },
                  DestinationName: [
                    {
                      value: "Massy-Palaiseau",
                    },
                  ],
                  VehicleJourneyName: [
                    {
                      value: "KNOC00",
                    },
                  ],
                  MonitoredCall: {
                    StopPointName: [
                      {
                        value: "La Croix de Berny",
                      },
                    ],
                    DestinationDisplay: [
                      {
                        value: "Massy-Palaiseau",
                      },
                    ],
                    ExpectedDepartureTime: departureTime,
                    ...(platform
                      ? {
                          DeparturePlatformName: {
                            value: platform,
                          },
                        }
                      : {}),
                  },
                },
              },
            ],
          },
        ],
      },
    },
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
    },
    status: 200,
  });
}
