import { describe, expect, it } from "vitest";
import { createGlobalMapDistanceMeasurement } from "../src/features/line-map/globalMapDistanceMeasurement";

describe("global map distance measurement", () => {
  it("calculates a geodesic distance without depending on Vue or the renderer", () => {
    const measurement = createGlobalMapDistanceMeasurement(
      { lon: 2.3522, lat: 48.8566 },
      { lon: 2.3622, lat: 48.8566 },
    );

    expect(measurement.start).toEqual({ lon: 2.3522, lat: 48.8566 });
    expect(measurement.end).toEqual({ lon: 2.3622, lat: 48.8566 });
    expect(measurement.distanceMeters).toBeGreaterThan(700);
    expect(measurement.distanceMeters).toBeLessThan(800);
  });

  it("keeps a zero-length segment valid while the second point follows the pointer", () => {
    const point = { lon: 2.3522, lat: 48.8566 };
    const measurement = createGlobalMapDistanceMeasurement(point, point);

    expect(measurement.distanceMeters).toBe(0);
  });
});

