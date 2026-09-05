import { describe, expect, it } from "vitest";
import {
  isBalancedDiagonal,
  projectNearbyHeavyStationToViewport,
} from "../src/features/nearby-stations/nearbyHeavyProjection";

describe("nearby heavy viewport projection", () => {
  const viewport = { width: 1_000, height: 800, inset: 26 };
  const origin = { x: 500, y: 400 };

  it("keeps a mostly eastern station on the right edge", () => {
    const projection = projectNearbyHeavyStationToViewport(
      { x: 1_400, y: 430 },
      origin,
      viewport.width,
      viewport.height,
      viewport.inset,
    );

    expect(projection.anchor).toBe("right");
    expect(projection.point.x).toBe(viewport.width - viewport.inset);
    expect(projection.point.y).toBeGreaterThan(viewport.inset);
    expect(projection.point.y).toBeLessThan(viewport.height - viewport.inset);
  });

  it("snaps a balanced north-east station to the north-east corner", () => {
    const projection = projectNearbyHeavyStationToViewport(
      { x: 1_000, y: 0 },
      origin,
      viewport.width,
      viewport.height,
      viewport.inset,
    );

    expect(projection.anchor).toBe("top-right");
    expect(projection.corner).toBe("top-right");
    expect(projection.point).toEqual({
      x: viewport.width - viewport.inset,
      y: viewport.inset,
    });
  });

  it("uses the same 2:1 boundary as the cardinal heavy-sector rule", () => {
    expect(isBalancedDiagonal(100, 49)).toBe(false);
    expect(isBalancedDiagonal(100, 51)).toBe(true);
    expect(isBalancedDiagonal(100, 100)).toBe(true);
  });

  it("keeps projected corners inside a control-safe viewport", () => {
    const bounds = { left: 26, right: 974, top: 74, bottom: 652 };

    expect(projectNearbyHeavyStationToViewport(
      { x: 1_000, y: 0 },
      origin,
      viewport.width,
      viewport.height,
      viewport.inset,
      bounds,
    ).point).toEqual({ x: bounds.right, y: bounds.top });

    expect(projectNearbyHeavyStationToViewport(
      { x: 1_000, y: 800 },
      origin,
      viewport.width,
      viewport.height,
      viewport.inset,
      bounds,
    ).point).toEqual({ x: bounds.right, y: bounds.bottom });
  });
});
