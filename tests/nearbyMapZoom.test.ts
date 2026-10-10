import { describe, expect, it } from "vitest";
import { isNearbyNoiseDetailZoomActive, nearbyMapZoomPercent } from "../src/features/nearby-stations/nearbyMapZoom";

describe("nearby noise detail zoom threshold", () => {
  it("activates when the displayed map zoom reaches 300 percent", () => {
    const zoomAt339Percent = Math.log2(3.39);
    const zoomAt300Percent = Math.log2(3);
    const zoomAt299Percent = Math.log2(2.99);

    expect(nearbyMapZoomPercent(zoomAt339Percent, 0)).toBe(339);
    expect(isNearbyNoiseDetailZoomActive(zoomAt339Percent, 0)).toBe(true);
    expect(nearbyMapZoomPercent(zoomAt300Percent, 0)).toBe(300);
    expect(isNearbyNoiseDetailZoomActive(zoomAt300Percent, 0)).toBe(true);
    expect(nearbyMapZoomPercent(zoomAt299Percent, 0)).toBe(299);
    expect(isNearbyNoiseDetailZoomActive(zoomAt299Percent, 0)).toBe(false);
  });
});
