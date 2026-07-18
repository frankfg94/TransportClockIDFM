import { describe, expect, it } from "vitest";
import { measureTransportPositionAccuracy } from "../packages/realtime-vehicles/src/runtime/client/transportPositionAccuracy";
import { createTransportPositionEngine } from "../packages/realtime-vehicles/src/runtime/client/transportPositionEngine";
import { createDefaultTransportPositionParameterSettings } from "../packages/realtime-vehicles/src/runtime/client/transportPositionParameters";
import type { TransitVehicleSnapshot } from "../packages/realtime-vehicles/src/runtime/client/transportPositions";

const BASE = Date.parse("2026-07-15T12:00:00.000Z");
const SOURCE = "FR::Quay:50026260:FR1";
const TARGET = "FR::Quay:50239724:FR1";

describe("transport position T1/T2 accuracy", () => {
  it("rewards the line profile when a delay is held at the platform", () => {
    const previous = createSnapshot(0, 300, "T1");
    const fresh = createSnapshot(220, 300, "T2");
    const withoutProfile = createDefaultTransportPositionParameterSettings();
    withoutProfile.metro13Profile.enabled = false;
    const withProfile = createDefaultTransportPositionParameterSettings();
    const atMs = BASE + 220_000;

    const genericEngine = createTransportPositionEngine(withoutProfile);
    genericEngine.reconcile(previous, BASE);
    const genericReport = measureTransportPositionAccuracy({
      previousSnapshot: previous,
      freshSnapshot: fresh,
      simulatedPositions: genericEngine.positionsAt(atMs),
      parameters: withoutProfile,
      atMs,
    });

    const profiledEngine = createTransportPositionEngine(withProfile);
    profiledEngine.reconcile(previous, BASE);
    const profiledReport = measureTransportPositionAccuracy({
      previousSnapshot: previous,
      freshSnapshot: fresh,
      simulatedPositions: profiledEngine.positionsAt(atMs),
      parameters: withProfile,
      atMs,
    });

    expect(genericReport).toMatchObject({
      sampleCount: 1,
      meanAbsoluteRemainingErrorSeconds: 0,
      teleportationCount: 1,
      profileEnabled: false,
    });
    expect(profiledReport).toMatchObject({
      sampleCount: 1,
      meanAbsoluteRemainingErrorSeconds: 0,
      teleportationCount: 0,
      profileEnabled: true,
      score: 100,
    });
    expect(profiledReport!.score).toBeGreaterThan(genericReport!.score);
  });

  it("measures the T1 simulated remaining time against fresh T2 data", () => {
    const previous = createSnapshot(0, 120, "T1");
    const fresh = createSnapshot(0, 100, "T2");
    const parameters = createDefaultTransportPositionParameterSettings();
    parameters.metro13Profile.enabled = false;
    const engine = createTransportPositionEngine(parameters);
    engine.reconcile(previous, BASE);

    const report = measureTransportPositionAccuracy({
      previousSnapshot: previous,
      freshSnapshot: fresh,
      simulatedPositions: engine.positionsAt(BASE + 50_000),
      parameters,
      atMs: BASE + 50_000,
    });

    expect(report?.meanAbsoluteRemainingErrorSeconds).toBe(20);
    expect(report?.samples[0]).toMatchObject({
      simulatedRemainingSeconds: 70,
      authoritativeRemainingSeconds: 50,
      remainingErrorSeconds: 20,
    });
  });
});

function createSnapshot(
  departureOffsetSeconds: number,
  arrivalOffsetSeconds: number,
  suffix: string,
): TransitVehicleSnapshot {
  return {
    available: true,
    lineId: "line:IDFM:C01383",
    source: "idfm-siri-estimated-timetable",
    positionKind: "estimated",
    generatedAt: new Date(BASE + departureOffsetSeconds * 1_000).toISOString(),
    complete: true,
    pollAfterMs: 60_000,
    journeys: [
      {
        snapshotId: `journey-${suffix}`,
        journeyRef: "stable-metro-13",
        serviceDate: "2026-07-15",
        identityQuality: "reliable",
        confidence: "high",
        patternId: "metro-13-south",
        calls: [
          {
            stationId: SOURCE,
            order: 0,
            departureAt: new Date(
              BASE + departureOffsetSeconds * 1_000,
            ).toISOString(),
            timeQuality: "estimated",
            vehicleAtStop: false,
            cancelled: false,
          },
          {
            stationId: TARGET,
            order: 1,
            arrivalAt: new Date(
              BASE + arrivalOffsetSeconds * 1_000,
            ).toISOString(),
            timeQuality: "estimated",
            vehicleAtStop: false,
            cancelled: false,
          },
        ],
      },
    ],
  };
}
