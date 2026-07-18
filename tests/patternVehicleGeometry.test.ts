import { describe, expect, it } from "vitest";
import { getPatternVehicleLayoutPoint } from "../packages/realtime-vehicles/src/runtime/client/patternVehicleGeometry";

describe("pattern vehicle geometry", () => {
  const positions = new Map([
    ["a", { x: 0, y: 0 }],
    ["b", { x: 100, y: 0 }],
    ["c", { x: 200, y: 100 }],
  ]);

  it("interpolates a straight edge in both travel directions", () => {
    expect(
      getPatternVehicleLayoutPoint({
        sourceId: "a",
        targetId: "b",
        progress: 0.25,
        positions,
        rounded: false,
      }),
    ).toMatchObject({ x: 25, y: 0, angleDegrees: 0 });

    expect(
      getPatternVehicleLayoutPoint({
        sourceId: "b",
        targetId: "a",
        progress: 0.25,
        positions,
        rounded: false,
      }),
    ).toMatchObject({ x: 75, y: 0, angleDegrees: 180 });
  });

  it("keeps a rounded vehicle on the shared cubic corridor", () => {
    const point = getPatternVehicleLayoutPoint({
      sourceId: "b",
      targetId: "c",
      progress: 0.5,
      positions,
      rounded: true,
    });

    expect(point?.x).toBeCloseTo(150, 5);
    expect(point?.y).toBeCloseTo(50, 5);
    expect(point?.angleDegrees).toBeGreaterThan(0);
  });

  it("clamps invalid progress and handles a vehicle at a station", () => {
    expect(
      getPatternVehicleLayoutPoint({
        sourceId: "a",
        targetId: "b",
        progress: 5,
        positions,
        rounded: false,
      })?.x,
    ).toBe(100);
    expect(
      getPatternVehicleLayoutPoint({
        sourceId: "a",
        targetId: "a",
        progress: 0.5,
        positions,
        rounded: true,
      }),
    ).toEqual({ x: 0, y: 0, angleDegrees: 0 });
  });
});
