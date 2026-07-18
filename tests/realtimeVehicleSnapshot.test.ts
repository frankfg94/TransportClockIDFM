import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NetexLineCache } from "../server/services/topology/netexCache";
import {
  buildRealtimeVehicleSnapshot,
  clearRealtimeVehicleSnapshotCache,
  getRealtimeVehicleSnapshot,
  isGuidedRealtimeMode,
  RealtimeVehicleUpstreamError,
} from "../packages/realtime-vehicles/src/runtime/server/vehicleSnapshot";

const NOW = new Date("2026-07-10T10:00:00.000Z");
const LINE_REF = "STIF:Line::C01384:";

describe("IDFM realtime vehicle snapshots", () => {
  beforeEach(() => {
    clearRealtimeVehicleSnapshotCache();
  });

  it.each(["rer", "train", "transilien"])(
    "treats %s cache modes as guided realtime transport",
    (mode) => {
      expect(isGuidedRealtimeMode(mode)).toBe(true);
    },
  );

  it("allows an RER cache mode to reach snapshot parsing", () => {
    const lineCache = createLineCache();
    lineCache.line.transportMode = "rer";
    lineCache.schematic.line.transportMode = "rer";

    const snapshot = buildRealtimeVehicleSnapshot(
      createPayload([
        createEstimatedJourney({
          destination: "Branch F",
          destinationRef: stopRef("F"),
          journeyRef: "operator:VehicleJourney::20260710.rer-b:",
          calls: [
            createCall("B", 2, "2026-07-10T10:02:00Z"),
            createCall("E", 3, "2026-07-10T10:04:00Z"),
            createCall("F", 4, "2026-07-10T10:06:00Z"),
          ],
        }),
      ]),
      lineCache,
      { now: NOW },
    );

    expect(snapshot).toMatchObject({ available: true });
    expect(snapshot.reason).toBeUndefined();
  });

  it("keeps a coherent journey reference as a reliable branch journey", () => {
    const payload = createPayload([
      createEstimatedJourney({
        destination: "Branch F",
        destinationRef: stopRef("F"),
        journeyRef: "operator:VehicleJourney::20260710.42:",
        calls: [
          createCall("B", 2, "2026-07-10T10:02:00Z"),
          createCall("E", 3, "2026-07-10T10:04:00Z"),
          createCall("F", 4, "2026-07-10T10:06:00Z"),
        ],
      }),
    ]);

    const snapshot = buildRealtimeVehicleSnapshot(payload, createLineCache(), {
      now: NOW,
    });

    expect(snapshot).toMatchObject({
      available: true,
      complete: true,
      lineId: "line:IDFM:C01384",
      pollAfterMs: 60_000,
    });
    expect(snapshot.journeys).toHaveLength(1);
    expect(snapshot.journeys[0]).toMatchObject({
      identityQuality: "reliable",
      confidence: "high",
      patternId: "pattern:branch-f",
      patternStationIds: [
        "station:a",
        "station:b",
        "station:e",
        "station:f",
      ],
      journeyRef: "operator:VehicleJourney::20260710.42:",
      serviceDate: "2026-07-10",
      destination: "Branch F",
    });
    expect(snapshot.journeys[0].calls.map((call) => call.stationId)).toEqual([
      "station:b",
      "station:e",
      "station:f",
    ]);
    expect(snapshot.journeys[0].calls.map((call) => call.order)).toEqual([
      1, 2, 3,
    ]);
  });

  it("reconstructs colliding technical references by topology and time order", () => {
    const collisionRef = "RATP-SIV:VehicleJourney::technical-counter";
    const journeys = [
      ["A", "2026-07-10T10:00:00Z"],
      ["A", "2026-07-10T10:05:00Z"],
      ["B", "2026-07-10T10:02:00Z"],
      ["B", "2026-07-10T10:07:00Z"],
      ["C", "2026-07-10T10:04:00Z"],
      ["C", "2026-07-10T10:09:00Z"],
    ].map(([station, time], index) =>
      createEstimatedJourney({
        destination: "Main D",
        destinationRef: stopRef("D"),
        journeyRef: collisionRef,
        calls: [createCall(station, index + 1, time)],
      }),
    );

    const snapshot = buildRealtimeVehicleSnapshot(
      createPayload(journeys),
      createLineCache(),
      { now: NOW },
    );

    expect(snapshot.available).toBe(true);
    expect(snapshot.journeys).toHaveLength(2);
    expect(
      snapshot.journeys.every(
        (journey) =>
          journey.identityQuality === "inferred" &&
          journey.confidence === "medium" &&
          journey.patternId === "pattern:main-d" &&
          journey.journeyRef === undefined,
      ),
    ).toBe(true);
    expect(
      snapshot.journeys.map((journey) =>
        journey.calls.map((call) => call.arrivalAt),
      ),
    ).toEqual([
      [
        "2026-07-10T10:00:00.000Z",
        "2026-07-10T10:02:00.000Z",
        "2026-07-10T10:04:00.000Z",
      ],
      [
        "2026-07-10T10:05:00.000Z",
        "2026-07-10T10:07:00.000Z",
        "2026-07-10T10:09:00.000Z",
      ],
    ]);
  });

  it("marks partial deliveries incomplete while retaining usable journeys", () => {
    const payload = createPayload(
      [
        createEstimatedJourney({
          destination: "Main D",
          destinationRef: stopRef("D"),
          journeyRef: "operator:VehicleJourney::20260710.partial:",
          calls: [
            createCall("A", 1, "2026-07-10T10:01:00Z"),
            createCall("B", 2, "2026-07-10T10:03:00Z"),
          ],
        }),
      ],
      {
        MoreData: true,
      },
    );

    const snapshot = buildRealtimeVehicleSnapshot(payload, createLineCache(), {
      now: NOW,
    });

    expect(snapshot.available).toBe(true);
    expect(snapshot.complete).toBe(false);
    expect(snapshot.journeys).toHaveLength(1);
  });

  it("preserves cancelled calls and omits an entirely cancelled journey", () => {
    const kept = createEstimatedJourney({
      destination: "Main D",
      destinationRef: stopRef("D"),
      journeyRef: "operator:VehicleJourney::20260710.kept:",
      calls: [
        createCall("A", 1, "2026-07-10T10:01:00Z"),
        createCall("B", 2, "2026-07-10T10:03:00Z"),
        {
          ...createCall("C", 3, "2026-07-10T10:05:00Z"),
          DepartureStatus: "cancelled",
        },
      ],
    });
    const removed = {
      ...createEstimatedJourney({
        destination: "Main D",
        destinationRef: stopRef("D"),
        journeyRef: "operator:VehicleJourney::20260710.removed:",
        calls: [
          createCall("A", 1, "2026-07-10T10:06:00Z"),
          createCall("B", 2, "2026-07-10T10:08:00Z"),
        ],
      }),
      IsCancelled: true,
    };

    const snapshot = buildRealtimeVehicleSnapshot(
      createPayload([kept, removed]),
      createLineCache(),
      { now: NOW },
    );

    expect(snapshot.journeys).toHaveLength(1);
    expect(snapshot.journeys[0].journeyRef).toContain("kept");
    expect(snapshot.journeys[0].calls.at(-1)?.cancelled).toBe(true);
  });

  it("explains when PRIM line records cannot be mapped to NeTEx stations", () => {
    const unknownCall = {
      ...createCall("A", 1, "2026-07-10T10:01:00Z"),
      StopPointRef: { value: "STIF:StopPoint:Q:UNKNOWN:" },
    };
    const snapshot = buildRealtimeVehicleSnapshot(
      createPayload([
        createEstimatedJourney({
          destination: "Main D",
          destinationRef: stopRef("D"),
          journeyRef: "operator:VehicleJourney::20260710.unmapped:",
          calls: [unknownCall],
        }),
      ]),
      createLineCache(),
      { now: NOW },
    );

    expect(snapshot).toMatchObject({
      available: false,
      reason: "no_data",
      diagnostics: {
        stage: "reconstruction",
        estimatedJourneyCount: 1,
        estimatedLineJourneyCount: 1,
        mappedRawJourneyCount: 0,
        reconstructedJourneyCount: 0,
        missing: ["mapped_station_calls_or_valid_times"],
      },
    });
  });

  it("resolves PRIM stop points through the official Navitia line aliases", async () => {
    const lineCache = createLineCache();

    lineCache.schematic.nodes.forEach((node) => {
      node.rawRefs = [`FR::Quay:NETEX-${node.name.at(-1)}:FR1`];
    });
    lineCache.stations = lineCache.schematic.nodes.map((node) => ({
      id: node.rawRefs?.[0] ?? node.id,
      name: node.name,
      rawRefs: node.rawRefs,
    }));
    lineCache.patterns = lineCache.patterns?.map((pattern) => ({
      ...pattern,
      stopIds: pattern.stopIds?.map((_, index) => {
        const stationCode = pattern.id === "pattern:main-d"
          ? ["A", "B", "C", "D"][index]
          : ["A", "B", "E", "F"][index];

        return `FR::Quay:NETEX-${stationCode}:FR1`;
      }),
    }));

    const payload = createPayload([
      createEstimatedJourney({
        destination: "Main D",
        destinationRef: stopRef("D"),
        journeyRef: "operator:VehicleJourney::20260710.aliases:",
        calls: [
          createCall("A", 1, "2026-07-10T10:01:00Z"),
          createCall("B", 2, "2026-07-10T10:03:00Z"),
        ],
      }),
    ]);
    const stopPoints = ["A", "B", "C", "D", "E", "F"].map((code) => ({
      id: `stop_point:IDFM:${code}`,
      name: `Station ${code}`,
      codes: [{ type: "source", value: `FR::Quay:${code}:FR1` }],
    }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/stop_points") ? { stop_points: stopPoints } : payload;

      return new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });

    const snapshot = await getRealtimeVehicleSnapshot({
      apiKey: "server-only-key",
      fetchImpl: fetchMock as unknown as typeof fetch,
      lineCache,
      now: NOW,
    });

    expect(snapshot.available).toBe(true);
    expect(snapshot.journeys[0]?.calls.map((call) => call.stationId)).toEqual([
      "station:a",
      "station:b",
    ]);
    expect(snapshot.diagnostics).toMatchObject({
      navitiaStopPointAliasSourceAvailable: true,
      navitiaStopPointCount: 6,
      resolvedStopPointAliasCount: 6,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/v2/navitia/lines/line%3AIDFM%3AC01384/stop_points",
    );
  });

  it("resolves RER StopArea calls through Navitia monomodal stop-place aliases", async () => {
    const payload = createPayload([
      createEstimatedJourney({
        destination: "Main D",
        destinationRef: "STIF:StopArea:SP:1004:",
        journeyRef: "operator:VehicleJourney::20260710.rer-stop-areas:",
        calls: [
          createStopAreaCall("1001", 1, "2026-07-10T10:01:00Z"),
          createStopAreaCall("1002", 2, "2026-07-10T10:03:00Z"),
          createStopAreaCall("1003", 3, "2026-07-10T10:05:00Z"),
        ],
      }),
    ]);
    const stopPoints = ["A", "B", "C", "D", "E", "F"].map(
      (code, index) => ({
        id: `stop_point:IDFM:monomodalStopPlace:${1001 + index}`,
        name: `Station ${code}`,
        codes: [
          {
            type: "netex_monomodal_stopplace",
            value: `monomodalStopPlace:${1001 + index}`,
          },
        ],
      }),
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const body = String(input).includes("/stop_points")
        ? { stop_points: stopPoints }
        : payload;

      return new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    const lineCache = createLineCache();
    lineCache.line.transportMode = "rer";
    lineCache.schematic.line.transportMode = "rer";

    const snapshot = await getRealtimeVehicleSnapshot({
      apiKey: "server-only-key",
      fetchImpl: fetchMock as unknown as typeof fetch,
      lineCache,
      now: NOW,
    });

    expect(snapshot.available).toBe(true);
    expect(snapshot.journeys[0]?.calls.map((call) => call.stationId)).toEqual([
      "station:a",
      "station:b",
      "station:c",
    ]);
    expect(snapshot.diagnostics).toMatchObject({
      mappedRawJourneyCount: 1,
      reconstructedJourneyCount: 1,
      resolvedStopPointAliasCount: 6,
    });
  });

  it("deduplicates concurrent and cached upstream global requests for 60 seconds", async () => {
    const payload = createPayload([
      createEstimatedJourney({
        destination: "Main D",
        destinationRef: stopRef("D"),
        journeyRef: "operator:VehicleJourney::20260710.cached:",
        calls: [
          createCall("A", 1, "2026-07-10T10:01:00Z"),
          createCall("B", 2, "2026-07-10T10:03:00Z"),
        ],
      }),
    ]);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    const options = {
      apiKey: "server-only-key",
      fetchImpl: fetchMock as unknown as typeof fetch,
      lineCache: createLineCache(),
      now: NOW,
    };

    const [first, second] = await Promise.all([
      getRealtimeVehicleSnapshot(options),
      getRealtimeVehicleSnapshot(options),
    ]);
    const third = await getRealtimeVehicleSnapshot(options);

    expect(first).toEqual(second);
    expect(third).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestedUrl).toContain("/marketplace/estimated-timetable");
    expect(requestedUrl).toContain("LineRef=ALL");
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
      Accept: "application/json",
      apikey: "server-only-key",
    });
  });

  it("shares one global upstream request across distinct line projections", async () => {
    const payload = createPayload([
      createEstimatedJourney({
        destination: "Main D",
        destinationRef: stopRef("D"),
        journeyRef: "operator:VehicleJourney::20260710.shared:",
        calls: [
          createCall("A", 1, "2026-07-10T10:01:00Z"),
          createCall("B", 2, "2026-07-10T10:03:00Z"),
        ],
      }),
    ]);
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    const otherLineCache = createLineCache();

    otherLineCache.line.id = "FR1:Line:C00001:";
    otherLineCache.line.code = "C00001";
    otherLineCache.line.name = "Other";
    otherLineCache.line.primLineId = "line:IDFM:C00001";
    otherLineCache.schematic.line = { ...otherLineCache.line };

    const [line14, otherLine] = await Promise.all([
      getRealtimeVehicleSnapshot({
        apiKey: "server-only-key",
        fetchImpl: fetchMock as unknown as typeof fetch,
        lineCache: createLineCache(),
        now: NOW,
      }),
      getRealtimeVehicleSnapshot({
        apiKey: "server-only-key",
        fetchImpl: fetchMock as unknown as typeof fetch,
        lineCache: otherLineCache,
        now: NOW,
      }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(line14.available).toBe(true);
    expect(otherLine).toMatchObject({
      available: false,
      lineId: "line:IDFM:C00001",
      reason: "no_data",
      diagnostics: {
        stage: "upstream",
        estimatedJourneyCount: 1,
        estimatedLineJourneyCount: 0,
        missing: ["upstream_line_records"],
      },
    });
  });

  it("preserves Retry-After on an upstream 429 without caching the failure", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(null, {
        headers: { "retry-after": "120" },
        status: 429,
      }),
    );

    await expect(
      getRealtimeVehicleSnapshot({
        apiKey: "server-only-key",
        fetchImpl: fetchMock as unknown as typeof fetch,
        lineCache: createLineCache(),
        now: NOW,
      }),
    ).rejects.toMatchObject({
      retryAfter: "120",
      statusCode: 429,
      upstreamStatus: 429,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function createLineCache(): NetexLineCache {
  const stationCodes = ["A", "B", "C", "D", "E", "F"];
  const nodes = stationCodes.map((code) => ({
    id: `station:${code.toLowerCase()}`,
    name: `Station ${code}`,
    rawRefs: [rawStopRef(code)],
    degree: ["A", "D", "F"].includes(code) ? 1 : code === "B" ? 3 : 2,
    isTerminal: ["A", "D", "F"].includes(code),
    isJunction: code === "B",
  }));

  return {
    generatedAt: "2026-07-10T09:00:00.000Z",
    line: {
      id: "FR1:Line:C01384:",
      code: "C01384",
      name: "14",
      primLineId: "line:IDFM:C01384",
      transportMode: "metro",
    },
    stations: nodes.map((node) => ({
      id: node.rawRefs[0],
      name: node.name,
      rawRefs: node.rawRefs,
    })),
    patterns: [
      {
        id: "pattern:main-d",
        destination: "Main D",
        direction: "Main D",
        stopIds: ["A", "B", "C", "D"].map(rawStopRef),
        serviceCount: 200,
      },
      {
        id: "pattern:branch-f",
        destination: "Branch F",
        direction: "Branch F",
        stopIds: ["A", "B", "E", "F"].map(rawStopRef),
        serviceCount: 100,
      },
    ],
    schematic: {
      schemaVersion: 1,
      line: {
        id: "FR1:Line:C01384:",
        code: "C01384",
        name: "14",
        primLineId: "line:IDFM:C01384",
        transportMode: "metro",
      },
      nodes,
      segments: [],
      branchGroups: [],
      parallelGroups: [],
      loops: [],
    },
  };
}

function createPayload(
  journeys: unknown[],
  deliveryOverrides: Record<string, unknown> = {},
): unknown {
  return {
    Siri: {
      ServiceDelivery: {
        ResponseTimestamp: NOW.toISOString(),
        Status: true,
        EstimatedTimetableDelivery: [
          {
            Status: true,
            EstimatedJourneyVersionFrame: [
              {
                EstimatedVehicleJourney: journeys,
              },
            ],
            ...deliveryOverrides,
          },
        ],
      },
    },
  };
}

function createEstimatedJourney(input: {
  calls: unknown[];
  destination: string;
  destinationRef: string;
  journeyRef: string;
}): Record<string, unknown> {
  return {
    LineRef: { value: LINE_REF },
    FramedVehicleJourneyRef: {
      DataFrameRef: { value: "2026-07-10" },
      DatedVehicleJourneyRef: input.journeyRef,
    },
    DirectionName: [{ value: input.destination }],
    DestinationRef: { value: input.destinationRef },
    DestinationName: [{ value: input.destination }],
    EstimatedCalls: {
      EstimatedCall: input.calls,
    },
  };
}

function createCall(
  station: string,
  order: number,
  time: string,
): Record<string, unknown> {
  return {
    StopPointRef: { value: stopRef(station) },
    Order: order,
    AimedArrivalTime: time,
    ExpectedArrivalTime: time,
    ExpectedDepartureTime: time,
    VehicleAtStop: false,
    ArrivalStatus: "onTime",
    DepartureStatus: "onTime",
  };
}

function createStopAreaCall(
  stationCode: string,
  order: number,
  time: string,
): Record<string, unknown> {
  return {
    ...createCall(stationCode, order, time),
    StopPointRef: { value: `STIF:StopArea:SP:${stationCode}:` },
  };
}

function rawStopRef(code: string): string {
  return `FR::Quay:${code}:FR1`;
}

function stopRef(code: string): string {
  return `STIF:StopPoint:Q:${code}:`;
}
