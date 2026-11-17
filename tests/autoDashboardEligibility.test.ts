import { describe, expect, it } from "vitest";
import { AutoDashboardStabilizer, isAutoDashboardEligible } from "../src/features/auto-dashboard/eligibility";
import { collectAutoDashboardCandidates } from "../src/features/auto-dashboard/candidates";
import type { NearbyStationEntry } from "../src/features/nearby-stations/nearbyStations";

describe("automatic dashboard walking eligibility", () => {
  it.each([
    ["BUS", 300], ["NOCTILIEN", 300], ["TRAM", 600], ["RER", 900],
  ] as const)("includes the %s limit and excludes longer walks", (mode, limit) => {
    expect(isAutoDashboardEligible(mode, limit)).toBe(true);
    expect(isAutoDashboardEligible(mode, limit + 1)).toBe(false);
  });

  it("does not apply a rail limit to buses or accept an unavailable time", () => {
    expect(isAutoDashboardEligible("BUS", 600)).toBe(false);
    expect(isAutoDashboardEligible("RER", undefined)).toBe(false);
    expect(isAutoDashboardEligible("METRO", 1)).toBe(false);
    expect(isAutoDashboardEligible("BUS", Number.NaN)).toBe(false);
  });

  it("keeps each mode attached to its physical stop and removes duplicate entries", () => {
    const bus = { id: "bus", mode: "BUS" };
    const rer = { id: "rer", mode: "RER" };
    const metro = { id: "metro", mode: "METRO" };
    const entry = {
      lines: [bus, rer, metro],
      memberStations: [
        { id: "platform-a", lat: 48, lon: 2, lineIds: ["bus", "metro"] },
        { id: "platform-b", lat: 48.001, lon: 2, lineIds: ["rer"] },
      ],
    } as unknown as NearbyStationEntry;
    const candidates = collectAutoDashboardCandidates([entry, entry], { lat: 48, lon: 2 }, 200);
    expect(candidates.map(({ station, line }) => [station.id, line.id])).toEqual([
      ["platform-a", "bus"], ["platform-b", "rer"],
    ]);
    expect(collectAutoDashboardCandidates([entry], { lat: 48, lon: 2 }, 50)).toHaveLength(1);
  });

  it("confirms crossings twice and does not mistake missing routes for exits", () => {
    const stabilizer = new AutoDashboardStabilizer();
    const scan = (value: boolean | undefined) => stabilizer.update(new Map([["stop-line", value]]));
    expect(scan(true).has("stop-line")).toBe(true);
    expect(scan(false).has("stop-line")).toBe(true);
    expect(scan(true).has("stop-line")).toBe(true);
    expect(scan(false).has("stop-line")).toBe(true);
    expect(scan(undefined).has("stop-line")).toBe(true);
    expect(scan(false).has("stop-line")).toBe(true);
    expect(scan(false).has("stop-line")).toBe(false);
    expect(scan(true).has("stop-line")).toBe(false);
    expect(scan(true).has("stop-line")).toBe(true);
  });
});
