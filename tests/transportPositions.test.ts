import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import {
  createTransportPositionEngine,
  minimumJerk,
  projectJourneyPosition,
  trapezoidalProgress,
} from "../packages/realtime-vehicles/src/runtime/client/transportPositionEngine";
import { createDefaultTransportPositionParameterSettings } from "../packages/realtime-vehicles/src/runtime/client/transportPositionParameters";
import {
  getConfiguredTransportPositionPollAfterMs,
  getTransportPositionRetryDelay,
  parseRetryAfter,
  useTransportPositions,
  withPollingJitter,
} from "../packages/realtime-vehicles/src/runtime/client/useTransportPositions";
import type {
  TransitVehicleCallEstimate,
  TransitVehicleJourneyEstimate,
  TransitVehicleSnapshot,
} from "../packages/realtime-vehicles/src/runtime/client/transportPositions";

const BASE_TIME = Date.parse("2026-07-10T10:00:00.000Z");

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("transport position projection", () => {
  it("uses a minimum-jerk curve with stationary ends", () => {
    expect(minimumJerk(-1)).toBe(0);
    expect(minimumJerk(0)).toBe(0);
    expect(minimumJerk(0.25)).toBeCloseTo(0.103515625, 10);
    expect(minimumJerk(0.5)).toBeCloseTo(0.5, 10);
    expect(minimumJerk(1)).toBe(1);
    expect(minimumJerk(2)).toBe(1);
  });

  it("moves between the two enclosing stations and waits at the platform", () => {
    const journey = createJourney({
      calls: [
        createCall("A", 0, { arrival: -10, departure: 0 }),
        createCall("B", 1, { arrival: 60, departure: 70 }),
        createCall("C", 2, { arrival: 130, departure: 140 }),
      ],
    });

    expect(projectJourneyPosition(journey, BASE_TIME + 15_000)).toEqual({
      sourceStationId: "A",
      targetStationId: "B",
      progress: minimumJerk(0.25),
      state: "moving",
      activeParameterIds: ["acceleration"],
    });
    expect(projectJourneyPosition(journey, BASE_TIME + 65_000)).toEqual({
      sourceStationId: "B",
      targetStationId: "C",
      progress: 0,
      state: "at_stop",
    });
  });

  it("places a terminus stop on the incoming edge", () => {
    const journey = createJourney({
      calls: [
        createCall("A", 0, { departure: 0 }),
        createCall("B", 1, {
          arrival: 60,
          departure: 70,
          vehicleAtStop: true,
        }),
      ],
    });

    expect(projectJourneyPosition(journey, BASE_TIME)).toEqual({
      sourceStationId: "A",
      targetStationId: "B",
      progress: 1,
      state: "at_stop",
    });
  });

  it("prefers normalized realtime times and falls back to aimed times", () => {
    const realtimeJourney = createJourney({
      calls: [
        createCall("A", 0, { departure: 0, aimedDeparture: -100 }),
        createCall("B", 1, { arrival: 100, aimedArrival: 20 }),
      ],
    });
    const aimedOnlyJourney = createJourney({
      calls: [
        createCall("A", 0, { aimedDeparture: 0 }),
        createCall("B", 1, { aimedArrival: 100 }),
      ],
    });

    expect(
      projectJourneyPosition(realtimeJourney, BASE_TIME + 50_000)?.progress,
    ).toBeCloseTo(0.5, 10);
    expect(
      projectJourneyPosition(aimedOnlyJourney, BASE_TIME + 50_000)?.progress,
    ).toBeCloseTo(0.5, 10);
  });

  it("does not invent a position without a usable time interval", () => {
    const journey = createJourney({
      calls: [createCall("A", 0), createCall("B", 1)],
    });

    expect(projectJourneyPosition(journey, BASE_TIME)).toBeUndefined();
  });

  it("rebuilds the omitted beginning of a rolling SIRI window from topology and GTFS distance", () => {
    const parameters = createDefaultTransportPositionParameterSettings();
    parameters.acceleration.curve = "linear";
    const journey = createJourney({
      patternStationIds: ["A", "B", "C"],
      calls: [
        createCall("B", 1, { arrival: 60 }),
        createCall("C", 2, { arrival: 120 }),
      ],
    });
    const projection = projectJourneyPosition(journey, BASE_TIME + 42_000, {
      parameters,
      segmentMetrics: [
        {
          id: "segment:a-b",
          sourceStationId: "A",
          targetStationId: "B",
          distanceMeters: 320,
          fallbackDistanceMeters: 300,
          distanceSource: "gtfs_shape",
          projectionErrorMeters: 2,
        },
      ],
    });

    expect(projection).toMatchObject({
      sourceStationId: "A",
      targetStationId: "B",
      progress: 0.5,
      state: "moving",
      segmentDistanceSource: "gtfs_shape",
    });
  });

  it("applies independently toggleable distance, speed and acceleration parameters", () => {
    const journey = createJourney({
      calls: movingCalls("A", "B", 0, 100),
    });
    const parameters = createDefaultTransportPositionParameterSettings();
    const metric = {
      id: "segment:a-b",
      sourceStationId: "A",
      targetStationId: "B",
      distanceMeters: 2_000,
      fallbackDistanceMeters: 1_000,
      distanceSource: "gtfs_shape" as const,
      projectionErrorMeters: 5,
    };

    parameters.acceleration.curve = "linear";
    const linear = projectJourneyPosition(journey, BASE_TIME + 25_000, {
      parameters,
      segmentMetrics: [metric],
    });
    expect(linear?.progress).toBeCloseTo(0.25, 10);
    expect(linear).toMatchObject({
      segmentDistanceMeters: 2_000,
      segmentDistanceSource: "gtfs_shape",
      activeParameterIds: ["trackDistance", "speed", "acceleration"],
    });

    parameters.acceleration.curve = "trapezoidal";
    const accelerated = projectJourneyPosition(
      journey,
      BASE_TIME + 25_000,
      { parameters, segmentMetrics: [metric] },
    );
    expect(accelerated?.progress).not.toBeCloseTo(linear?.progress ?? 0, 5);

    parameters.trackDistance.source = "geodesic";
    const geodesic = projectJourneyPosition(
      journey,
      BASE_TIME + 25_000,
      { parameters, segmentMetrics: [metric] },
    );
    expect(geodesic).toMatchObject({
      segmentDistanceMeters: 1_000,
      segmentDistanceSource: "geodesic_fallback",
    });
  });

  it("provides a normalized trapezoidal acceleration curve", () => {
    expect(trapezoidalProgress(0, 0.2)).toBe(0);
    expect(trapezoidalProgress(0.5, 0.2)).toBeCloseTo(0.5, 10);
    expect(trapezoidalProgress(1, 0.2)).toBe(1);
    expect(trapezoidalProgress(0.1, 0.2)).toBeLessThan(0.1);
  });
});

describe("transport position reconciliation", () => {
  it("keeps a reliable journey identity and corrects the same edge smoothly", () => {
    const engine = createTransportPositionEngine();
    const original = createJourney({
      journeyRef: "vehicle-42",
      calls: movingCalls("A", "B", 0, 100),
    });
    const corrected = createJourney({
      snapshotId: "snapshot-2",
      journeyRef: "vehicle-42",
      calls: movingCalls("A", "B", 0, 60),
    });
    const now = BASE_TIME + 50_000;
    const first = engine.reconcile(createSnapshot([original]), now)[0];
    const correctionStart = engine.reconcile(
      createSnapshot([corrected], { generatedAt: iso(50) }),
      now,
    )[0];

    expect(correctionStart.trackId).toBe(first.trackId);
    expect(correctionStart.state).toBe("correcting");
    expect(correctionStart.progress).toBeCloseTo(first.progress, 10);

    const settled = engine.positionsAt(now + 2_100)[0];
    expect(settled.state).toBe("moving");
    expect(settled.progress).toBeGreaterThan(correctionStart.progress);
  });

  it("matches inferred identities by pattern, direction and projected position", () => {
    const engine = createTransportPositionEngine();
    const firstJourney = createJourney({
      snapshotId: "anonymous-1",
      identityQuality: "inferred",
      journeyRef: undefined,
      calls: movingCalls("A", "B", 0, 100),
    });
    const nextJourney = createJourney({
      snapshotId: "anonymous-2",
      identityQuality: "inferred",
      journeyRef: undefined,
      calls: movingCalls("A", "B", -2, 98),
    });
    const now = BASE_TIME + 50_000;
    const firstTrackId = engine.reconcile(
      createSnapshot([firstJourney]),
      now,
    )[0].trackId;
    const nextPosition = engine.reconcile(
      createSnapshot([nextJourney], { generatedAt: iso(50) }),
      now,
    )[0];

    expect(nextPosition.trackId).toBe(firstTrackId);
    expect(nextPosition.snapshotJourneyId).toBe("anonymous-2");
  });

  it("slides across one adjacent edge in at most three seconds", () => {
    const engine = createTransportPositionEngine();
    const now = BASE_TIME + 80_000;
    const firstJourney = createJourney({
      journeyRef: "vehicle-42",
      calls: movingCalls("A", "B", 0, 100),
    });
    const adjacentJourney = createJourney({
      snapshotId: "snapshot-adjacent",
      journeyRef: "vehicle-42",
      calls: movingCalls("B", "C", 70, 120),
    });

    engine.reconcile(createSnapshot([firstJourney]), now);
    const correctionStart = engine.reconcile(
      createSnapshot([adjacentJourney], { generatedAt: iso(80) }),
      now,
    )[0];

    expect(correctionStart.state).toBe("correcting");
    expect(correctionStart.sourceStationId).toBe("A");
    expect(correctionStart.targetStationId).toBe("B");

    const settled = engine.positionsAt(now + 3_001)[0];
    expect(settled.state).toBe("moving");
    expect(settled.sourceStationId).toBe("B");
    expect(settled.targetStationId).toBe("C");
  });

  it("snaps large inconsistencies and every correction in reduced-motion mode", () => {
    const now = BASE_TIME + 50_000;
    const original = createJourney({
      journeyRef: "vehicle-42",
      calls: movingCalls("A", "B", 0, 100),
    });
    const distant = createJourney({
      snapshotId: "snapshot-distant",
      journeyRef: "vehicle-42",
      calls: movingCalls("D", "E", 0, 100),
    });
    const corrected = createJourney({
      snapshotId: "snapshot-corrected",
      journeyRef: "vehicle-42",
      calls: movingCalls("A", "B", 0, 60),
    });

    const largeGapEngine = createTransportPositionEngine();
    largeGapEngine.reconcile(createSnapshot([original]), now);
    const snapped = largeGapEngine.reconcile(
      createSnapshot([distant], { generatedAt: iso(50) }),
      now,
    )[0];

    expect(snapped.state).toBe("moving");
    expect(snapped.sourceStationId).toBe("D");

    const reducedMotionEngine = createTransportPositionEngine();
    reducedMotionEngine.reconcile(createSnapshot([original]), now);
    const reduced = reducedMotionEngine.reconcile(
      createSnapshot([corrected], { generatedAt: iso(50) }),
      now,
      true,
    )[0];

    expect(reduced.state).toBe("moving");
    expect(reduced.progress).toBeCloseTo(minimumJerk(5 / 6), 10);
  });

  it("removes absent vehicles immediately after a complete snapshot", () => {
    const engine = createTransportPositionEngine();
    const now = BASE_TIME + 100_000;
    const journey = createJourney({
      calls: movingCalls("A", "B", 0, 600),
    });

    engine.reconcile(createSnapshot([journey]), now);

    expect(
      engine.reconcile(createSnapshot([], { complete: true }), now),
    ).toEqual([]);
  });

  it("retains an absent vehicle for no more than two partial polling periods", () => {
    const engine = createTransportPositionEngine();
    const now = BASE_TIME + 100_000;
    const journey = createJourney({
      calls: movingCalls("A", "B", 0, 600),
    });

    engine.reconcile(createSnapshot([journey]), now);
    engine.reconcile(
      createSnapshot([], { complete: false, pollAfterMs: 60_000 }),
      now,
    );

    expect(engine.positionsAt(now + 119_999)).toHaveLength(1);
    expect(engine.positionsAt(now + 120_001)).toEqual([]);
  });

  it("clears positions when the source reports the feature unavailable", () => {
    const engine = createTransportPositionEngine();
    const now = BASE_TIME + 50_000;

    engine.reconcile(
      createSnapshot([
        createJourney({ calls: movingCalls("A", "B", 0, 100) }),
      ]),
      now,
    );

    expect(
      engine.reconcile(
        createSnapshot([], { available: false, complete: false }),
        now,
      ),
    ).toEqual([]);
  });
});

describe("transport position polling helpers", () => {
  it("lets the polling plugin adjust client calls", () => {
    const parameters = createDefaultTransportPositionParameterSettings();
    parameters.polling.intervalSeconds = 30;

    expect(getConfiguredTransportPositionPollAfterMs(60_000, parameters)).toBe(
      30_000,
    );
    parameters.polling.enabled = false;
    expect(getConfiguredTransportPositionPollAfterMs(90_000, parameters)).toBe(
      90_000,
    );
  });

  it("parses seconds and HTTP dates from Retry-After", () => {
    expect(parseRetryAfter("120", BASE_TIME)).toBe(120_000);
    expect(parseRetryAfter(iso(90), BASE_TIME)).toBe(90_000);
    expect(parseRetryAfter("invalid", BASE_TIME)).toBeUndefined();
  });

  it("adds only a small positive polling jitter", () => {
    expect(withPollingJitter(60_000, 0)).toBe(60_000);
    expect(withPollingJitter(60_000, 1)).toBe(63_000);
    expect(withPollingJitter(60_000, 2)).toBe(63_000);
  });

  it("backs off exponentially and caps retries at five minutes", () => {
    expect(getTransportPositionRetryDelay(1)).toBe(60_000);
    expect(getTransportPositionRetryDelay(2)).toBe(120_000);
    expect(getTransportPositionRetryDelay(3)).toBe(240_000);
    expect(getTransportPositionRetryDelay(4)).toBe(300_000);
    expect(getTransportPositionRetryDelay(20)).toBe(300_000);
  });
});

describe("useTransportPositions", () => {
  it("activates immediately and advances a projected vehicle on animation frames", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME + 50_000);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const client = installClientEnvironment();
    const payload = createSnapshot(
      [createJourney({ calls: movingCalls("A", "B", 0, 100) })],
      {
        lineId: "line:IDFM:C01373",
        segmentMetrics: [
          {
            id: "segment:a-b",
            sourceStationId: "A",
            targetStationId: "B",
            distanceMeters: 1_200,
            fallbackDistanceMeters: 1_000,
            distanceSource: "gtfs_shape",
            projectionErrorMeters: 4,
          },
        ],
      },
    );
    const fetchMock = vi.fn(async () =>
      createJsonResponse(payload),
    );
    vi.stubGlobal("fetch", fetchMock);
    const active = ref(true);
    const scope = effectScope();
    const composable = scope.run(() =>
      useTransportPositions({
        active,
        endpoint: "/api/lines/metro/13/vehicles",
        reduceMotion: false,
      }),
    );

    expect(composable).toBeDefined();
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(composable?.status.value).toBe("live");
    expect(composable?.lastUpdatedAt.value).toBe(payload.generatedAt);
    expect(composable?.transportPositions.value).toHaveLength(1);
    expect(composable?.transportPositions.value[0].state).toBe("moving");
    expect(composable?.parameters.value).toHaveLength(10);
    expect(
      composable?.parameters.value.find(
        (parameter) => parameter.id === "trackDistance",
      ),
    ).toMatchObject({ enabled: true, runtimeAvailable: true });
    expect(
      composable?.parameters.value.find(
        (parameter) => parameter.id === "crowding",
      ),
    ).toMatchObject({ enabled: true, runtimeAvailable: false });
    const initialProgress = composable?.transportPositions.value[0].progress ?? 0;

    vi.setSystemTime(BASE_TIME + 75_000);
    client.runAnimationFrame();
    await nextTick();

    expect(composable?.transportPositions.value[0].progress).toBeGreaterThan(
      initialProgress,
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "[transport-positions] activated",
      expect.objectContaining({ endpoint: "/api/lines/metro/13/vehicles" }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "[transport-positions] snapshot-applied",
      expect.objectContaining({
        projectedPositionCount: 1,
        movingPositionCount: 1,
      }),
    );
    expect(client.scheduledDelays.at(-1)).toBeGreaterThanOrEqual(60_000);
    expect(client.scheduledDelays.at(-1)).toBeLessThanOrEqual(63_000);

    client.setHidden(true);
    expect(composable?.status.value).toBe("stale");

    client.setHidden(false);
    await flushAsyncWork();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    active.value = false;
    await nextTick();
    expect(composable?.status.value).toBe("idle");
    expect(composable?.transportPositions.value).toEqual([]);

    scope.stop();
  });

  it("honors Retry-After when the endpoint is rate limited", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = installClientEnvironment();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(undefined, {
          status: 429,
          headers: { "Retry-After": "120" },
        }),
      ),
    );
    const scope = effectScope();
    const composable = scope.run(() =>
      useTransportPositions({
        active: true,
        endpoint: "/api/lines/metro/14/vehicles",
        reduceMotion: false,
      }),
    );

    await flushAsyncWork();

    expect(composable?.status.value).toBe("rate_limited");
    expect(warnSpy).toHaveBeenCalledWith(
      "[transport-positions] rate-limited",
      expect.objectContaining({ retryAfter: "120" }),
    );
    expect(client.scheduledDelays.at(-1)).toBeGreaterThanOrEqual(120_000);
    expect(client.scheduledDelays.at(-1)).toBeLessThanOrEqual(126_000);

    scope.stop();
  });

  it("logs the exact snapshot diagnostics when positions are unavailable", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    installClientEnvironment();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse(
          createSnapshot([], {
            available: false,
            reason: "no_data",
            diagnostics: {
              stage: "reconstruction",
              missing: ["mapped_station_calls_or_valid_times"],
              estimatedLineJourneyCount: 12,
              mappedRawJourneyCount: 0,
            },
          }),
        ),
      ),
    );
    const scope = effectScope();
    const composable = scope.run(() =>
      useTransportPositions({
        active: true,
        endpoint: "/api/lines/metro/13/vehicles",
        reduceMotion: false,
      }),
    );

    await flushAsyncWork();

    expect(composable?.status.value).toBe("unavailable");
    expect(composable?.transportPositions.value).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      "[transport-positions] snapshot-unavailable",
      expect.objectContaining({
        endpoint: "/api/lines/metro/13/vehicles",
        reason: "no_data",
        diagnostics: expect.objectContaining({
          missing: ["mapped_station_calls_or_valid_times"],
          estimatedLineJourneyCount: 12,
          mappedRawJourneyCount: 0,
        }),
      }),
    );

    scope.stop();
  });

  it("does not keep an animation frame loop in reduced-motion mode", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME + 50_000);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const client = installClientEnvironment();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse(
          createSnapshot([
            createJourney({ calls: movingCalls("A", "B", 0, 100) }),
          ]),
        ),
      ),
    );
    const reduceMotion = ref(true);
    const scope = effectScope();

    scope.run(() =>
      useTransportPositions({
        active: true,
        endpoint: "/api/lines/metro/14/vehicles",
        reduceMotion,
      }),
    );
    await flushAsyncWork();

    expect(client.animationRequestCount()).toBe(0);

    reduceMotion.value = false;
    await nextTick();
    expect(client.animationRequestCount()).toBe(1);

    scope.stop();
  });
});

function createSnapshot(
  journeys: TransitVehicleJourneyEstimate[],
  overrides: Partial<TransitVehicleSnapshot> = {},
): TransitVehicleSnapshot {
  return {
    available: true,
    lineId: "line:14",
    source: "idfm-siri-estimated-timetable",
    positionKind: "estimated",
    generatedAt: iso(0),
    complete: true,
    pollAfterMs: 60_000,
    journeys,
    ...overrides,
  };
}

function createJourney(
  overrides: Partial<TransitVehicleJourneyEstimate> = {},
): TransitVehicleJourneyEstimate {
  return {
    snapshotId: "snapshot-1",
    journeyRef: "vehicle-1",
    serviceDate: "2026-07-10",
    identityQuality: "reliable",
    confidence: "high",
    patternId: "pattern:southbound",
    directionRef: "southbound",
    destination: "Airport",
    calls: movingCalls("A", "B", 0, 100),
    ...overrides,
  };
}

function movingCalls(
  source: string,
  target: string,
  departureSeconds: number,
  arrivalSeconds: number,
): TransitVehicleCallEstimate[] {
  return [
    createCall(source, 0, { departure: departureSeconds }),
    createCall(target, 1, { arrival: arrivalSeconds }),
  ];
}

function createCall(
  stationId: string,
  order: number,
  times: {
    arrival?: number;
    departure?: number;
    aimedArrival?: number;
    aimedDeparture?: number;
    vehicleAtStop?: boolean;
    cancelled?: boolean;
  } = {},
): TransitVehicleCallEstimate {
  return {
    stationId,
    order,
    arrivalAt:
      times.arrival === undefined ? undefined : iso(times.arrival),
    departureAt:
      times.departure === undefined ? undefined : iso(times.departure),
    aimedArrivalAt:
      times.aimedArrival === undefined ? undefined : iso(times.aimedArrival),
    aimedDepartureAt:
      times.aimedDeparture === undefined
        ? undefined
        : iso(times.aimedDeparture),
    timeQuality: "estimated",
    vehicleAtStop: times.vehicleAtStop ?? false,
    cancelled: times.cancelled ?? false,
  };
}

function iso(secondsAfterBase: number): string {
  return new Date(BASE_TIME + secondsAfterBase * 1_000).toISOString();
}

function createJsonResponse(value: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => value,
  } as Response;
}

function installClientEnvironment(): {
  animationRequestCount: () => number;
  runAnimationFrame: () => void;
  scheduledDelays: number[];
  setHidden: (hidden: boolean) => void;
} {
  let visibilityListener: (() => void) | undefined;
  let nextAnimationFrameId = 0;
  const animationFrames = new Map<number, FrameRequestCallback>();
  const scheduledDelays: number[] = [];
  const fakeDocument = {
    hidden: false,
    addEventListener: vi.fn(
      (eventName: string, listener: EventListenerOrEventListenerObject) => {
        if (eventName === "visibilitychange" && typeof listener === "function") {
          visibilityListener = listener as () => void;
        }
      },
    ),
    removeEventListener: vi.fn(),
  };
  const fakeWindow = {
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextAnimationFrameId;
      animationFrames.set(id, callback);
      return id;
    }),
    cancelAnimationFrame: vi.fn((id: number) => {
      animationFrames.delete(id);
    }),
    setTimeout: vi.fn((_callback: TimerHandler, delay?: number) => {
      scheduledDelays.push(delay ?? 0);
      return scheduledDelays.length;
    }),
    clearTimeout: vi.fn(),
  };

  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("window", fakeWindow);

  return {
    animationRequestCount: () => fakeWindow.requestAnimationFrame.mock.calls.length,
    runAnimationFrame() {
      const pending = animationFrames.entries().next().value as
        | [number, FrameRequestCallback]
        | undefined;

      if (!pending) {
        throw new Error("No animation frame is scheduled.");
      }

      const [id, callback] = pending;
      animationFrames.delete(id);
      callback(Date.now());
    },
    scheduledDelays,
    setHidden(hidden: boolean) {
      fakeDocument.hidden = hidden;
      visibilityListener?.();
    },
  };
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }

  await nextTick();
}
