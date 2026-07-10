import { describe, expect, it } from "vitest";
import {
  createInterruptionWalkingTimes,
  estimateWalkingMinutes,
} from "../src/features/service-pattern/interruptionWalkingTimes";

describe("interruption walking times", () => {
  it("estimates an urban walking duration from the station distance", () => {
    expect(estimateWalkingMinutes(0.832)).toBe(13);
    expect(estimateWalkingMinutes(4.8)).toBe(75);
  });

  it("ignores missing, invalid, and zero distances", () => {
    expect(estimateWalkingMinutes(undefined)).toBeUndefined();
    expect(estimateWalkingMinutes(0)).toBeUndefined();
    expect(estimateWalkingMinutes(Number.NaN)).toBeUndefined();
  });

  it("keeps one walking annotation per interrupted edge", () => {
    expect(
      createInterruptionWalkingTimes(
        [
          { kind: "interruption", edgeKeys: ["a--b", "b--c"] },
          { kind: "interruption", edgeKeys: ["b--c"] },
          { kind: "disturbance", edgeKeys: ["c--d"] },
        ],
        [
          { source: "a", target: "b", distanceKm: 0.5 },
          { source: "b", target: "c", distanceKm: 1 },
          { source: "c", target: "d", distanceKm: 0.5 },
        ],
      ),
    ).toEqual([
      { edgeKey: "a--b", source: "a", target: "b", minutes: 8 },
      { edgeKey: "b--c", source: "b", target: "c", minutes: 16 },
    ]);
  });
});
