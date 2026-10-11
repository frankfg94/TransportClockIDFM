import { describe, expect, it } from "vitest";
import { isNearbyNoiseDetailZoomActive, nearbyMapZoomPercent } from "../src/features/nearby-stations/nearbyMapZoom";

describe("nearby noise detail zoom threshold", () => {
  it("activates when the displayed map zoom reaches 250 percent", () => {
    const zoomAt339Percent = Math.log2(3.39);
    const zoomAt250Percent = Math.log2(2.5);
    const zoomAt249Percent = Math.log2(2.49);

    expect(nearbyMapZoomPercent(zoomAt339Percent, 0)).toBe(339);
    expect(isNearbyNoiseDetailZoomActive(zoomAt339Percent, 0)).toBe(true);
    expect(nearbyMapZoomPercent(zoomAt250Percent, 0)).toBe(250);
    expect(isNearbyNoiseDetailZoomActive(zoomAt250Percent, 0)).toBe(true);
    expect(nearbyMapZoomPercent(zoomAt249Percent, 0)).toBe(249);
    expect(isNearbyNoiseDetailZoomActive(zoomAt249Percent, 0)).toBe(false);
  });
});
