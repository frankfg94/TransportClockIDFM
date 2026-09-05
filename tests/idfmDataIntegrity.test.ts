import { afterEach, describe, expect, it } from "vitest";
import {
  lineStopMatchesDepartureStation,
  parseNavitiaDateTime,
} from "../src/services/idfm";
import type { Departure, LineRouteStop } from "../src/types/transit";

describe("IDFM data integrity", () => {
  const originalTimeZone = process.env.TZ;

  afterEach(() => {
    if (originalTimeZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimeZone;
    }
  });

  it("parses Navitia local times as Europe/Paris independently of process TZ", () => {
    process.env.TZ = "UTC";

    expect(parseNavitiaDateTime("20260830T120000")).toBe(
      "2026-08-30T10:00:00.000Z",
    );
    expect(parseNavitiaDateTime("20261230T120000")).toBe(
      "2026-12-30T11:00:00.000Z",
    );
  });

  it("matches a line station with an exact departure reference", () => {
    const stop: LineRouteStop = {
      id: "station:target",
      label: "Station cible",
      station: {
        id: "station:target",
        label: "Station cible",
        monitoringRef: "STIF:StopArea:SP:123:",
        scheduleStopAreaRef: "stop_area:IDFM:123",
      },
    };
    const departure: Departure = {
      id: "departure:target",
      lineRef: "line:test",
      monitoringRef: "STIF:StopArea:SP:123:",
      stopName: "Autre station",
      destination: "Terminus",
      monitoringLabel: "Quai 1",
      vehicleAtStop: false,
    };

    expect(lineStopMatchesDepartureStation(stop, departure)).toBe(true);
  });
});
