import { describe, expect, it } from "vitest";
import { recolorNearbyNoisePixelRange } from "../src/features/nearby-stations/nearbyNoiseWmsColorizer";

describe("nearby detailed noise image colorizer", () => {
  it("keeps the existing class mapping, display colors, and overlay opacity", () => {
    const pixels = new Uint8ClampedArray([
      142, 186, 226, 255,
      173, 83, 170, 128,
      213, 9, 9, 255,
    ]);
    const levels = new Uint8Array(3);

    recolorNearbyNoisePixelRange(pixels, levels, 0, levels.length);

    expect(levels).toEqual(new Uint8Array([1, 2, 3]));
    expect(pixels).toEqual(new Uint8ClampedArray([
      34, 197, 94, 64,
      250, 204, 21, 32,
      239, 68, 68, 64,
    ]));
  });

  it("preserves transparent and unmapped pixels as transparent", () => {
    const pixels = new Uint8ClampedArray([
      142, 186, 226, 0,
      255, 255, 255, 255,
      0, 0, 0, 255,
    ]);
    const levels = new Uint8Array(3);

    recolorNearbyNoisePixelRange(pixels, levels, 0, levels.length);

    expect(levels).toEqual(new Uint8Array([0, 0, 0]));
    expect([pixels[3], pixels[7], pixels[11]]).toEqual([0, 0, 0]);
  });

  it("processes only the requested chunk", () => {
    const pixels = new Uint8ClampedArray([
      142, 186, 226, 255,
      213, 9, 9, 255,
    ]);
    const levels = new Uint8Array(2);

    recolorNearbyNoisePixelRange(pixels, levels, 1, 2);

    expect(levels).toEqual(new Uint8Array([0, 3]));
    expect(pixels.slice(0, 4)).toEqual(new Uint8ClampedArray([142, 186, 226, 255]));
  });
});
