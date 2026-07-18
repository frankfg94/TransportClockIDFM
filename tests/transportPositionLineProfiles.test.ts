import { describe, expect, it } from "vitest";
import {
  getTransportPositionLineProfile,
  listTransportPositionLineProfiles,
  resolveTransportPositionLineProfileSegment,
} from "../packages/realtime-vehicles/src/runtime/client/transportPositionLineProfiles";

describe("transport position line profiles", () => {
  it("loads the common Metro 13 MF77 profile by supported line refs", () => {
    const canonical = getTransportPositionLineProfile("line:IDFM:C01383");

    expect(canonical?.rollingStock.model).toBe("MF77");
    expect(canonical?.segments).toHaveLength(31);
    expect(getTransportPositionLineProfile("STIF:Line::C01383:")?.id).toBe(
      canonical?.id,
    );
    expect(getTransportPositionLineProfile("13")?.id).toBe(canonical?.id);
    expect(getTransportPositionLineProfile("line:IDFM:C01384")).toBeUndefined();
    expect(listTransportPositionLineProfiles()).toContain(canonical);
  });

  it("resolves directional runtime, GTFS distance and the MF77 speed cap", () => {
    const profile = getTransportPositionLineProfile("line:IDFM:C01383");
    const forward = resolveTransportPositionLineProfileSegment(
      profile,
      "FR::Quay:50026260:FR1",
      "FR::Quay:50239724:FR1",
    );
    const reverse = resolveTransportPositionLineProfileSegment(
      profile,
      "FR::Quay:50239724:FR1",
      "FR::Quay:50026260:FR1",
    );

    expect(forward).toMatchObject({
      distanceMeters: 603,
      runtimeSeconds: 80,
      maxOperatingSpeedKph: 70,
    });
    expect(reverse?.runtimeSeconds).toBe(68);
  });
});
