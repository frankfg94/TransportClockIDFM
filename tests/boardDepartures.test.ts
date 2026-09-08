import { describe, expect, it, vi } from "vitest";
import { fetchBoardDepartures } from "../src/services/idfm";
import type { TransitBoardConfig } from "../src/types/transit";

describe("board departures", () => {
  it("publishes realtime before a stalled schedule and returns it after the deadline", async () => {
    vi.useFakeTimers();
    try {
      const updates = vi.fn();
      let scheduleSignal: AbortSignal | undefined;
      const request = fetchBoardDepartures(createRerBBoard(), {
        onUpdate: updates,
        fetcher: vi.fn(async (input, init) => {
          if (String(input).includes("stop-monitoring")) {
            return jsonResponse(createStopMonitoringPayload(new Date(Date.now() + 300_000).toISOString()));
          }
          scheduleSignal = init?.signal ?? undefined;
          return new Promise<Response>(() => {});
        }),
      });
      await vi.advanceTimersByTimeAsync(1);
      expect(updates).toHaveBeenCalled();
      expect(updates.mock.calls[0]![0].departures).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(12_000);
      expect((await request).departures).toHaveLength(1);
      expect(scheduleSignal?.aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it("does not report an empty timetable when every source is unavailable", async () => {
    await expect(fetchBoardDepartures(createRerBBoard(), {
      fetcher: vi.fn(async () => new Response(null, { status: 503 })),
    })).rejects.toThrow("HTTP 503");
  });

  it("bounds stalled response bodies as well as pending headers", async () => {
    vi.useFakeTimers();
    try {
      const request = fetchBoardDepartures(createRerBBoard(), {
        fetcher: vi.fn(async () => ({ ok: true, json: () => new Promise(() => {}) }) as Response),
      });
      const rejected = expect(request).rejects.toMatchObject({ name: "TimeoutError" });
      await vi.advanceTimersByTimeAsync(12_000);
      await rejected;
    } finally { vi.useRealTimers(); }
  });

  it("propagates caller cancellation rather than returning an empty board", async () => {
    const controller = new AbortController();
    const request = fetchBoardDepartures(createRerBBoard(), {
      signal: controller.signal,
      fetcher: vi.fn(() => new Promise<Response>(() => {})),
    });
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
  });

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

  it("keeps a StopArea direction when SIRI answers with its concrete StopPoint", async () => {
    const departureTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const board = createRerBBoard();
    board.directionGroups[0]!.match.monitoringRefs = ["STIF:StopArea:SP:46007:"];
    const payload = createStopMonitoringPayload(
      departureTime,
      "1",
      "STIF:StopPoint:Q:486826:",
    );
    payload.Siri.ServiceDelivery.StopMonitoringDelivery[0]!
      .MonitoredStopVisit[0]!.MonitoredVehicleJourney
      .MonitoredCall.DestinationDisplay[0]!.value = "Massy-Pal.";
    const fetchMock = vi.fn(async () => jsonResponse(payload));

    const result = await fetchBoardDepartures(board, {
      fetcher: fetchMock as unknown as typeof fetch,
    });

    expect(result.directionGroups[0]?.departures).toHaveLength(1);
    expect(result.directionGroups[0]?.departures[0]?.monitoringRef).toBe(
      "STIF:StopPoint:Q:486826:",
    );
    expect(result.directionGroups[0]?.departures[0]?.destination).toBe("Massy-Palaiseau");
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
  monitoringRef = "STIF:StopArea:SP:46007:",
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
                  value: monitoringRef,
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
