import { describe, expect, it } from "vitest";
import {
  analyzeChaosCanvas,
  summarizeChaosBasemapAudit,
  summarizeChaosFrameTimes,
} from "../src/features/line-map/chaosZoom";

function createCanvas(width: number, height: number, data: Uint8ClampedArray): HTMLCanvasElement {
  return {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: { width: `${width}px`, height: `${height}px` },
    getContext: () => ({ getImageData: () => ({ data }) }),
  } as unknown as HTMLCanvasElement;
}

describe("Chaos Zoom canvas diagnostics", () => {
  it("flags a transparent viewport as blank", () => {
    const canvas = createCanvas(40, 40, new Uint8ClampedArray(40 * 40 * 4));

    const result = analyzeChaosCanvas(canvas);

    expect(result.analysisAvailable).toBe(true);
    expect(result.isBlank).toBe(true);
    expect(result.alphaCoverageRatio).toBe(0);
  });

  it("keeps a high-contrast rendered scene non-blank and exposes sharpness signals", () => {
    const data = new Uint8ClampedArray(40 * 40 * 4);
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 40; x += 1) {
        const index = (y * 40 + x) * 4;
        const dark = x % 4 < 2;
        data[index] = dark ? 15 : 245;
        data[index + 1] = dark ? 25 : 245;
        data[index + 2] = dark ? 40 : 245;
        data[index + 3] = 255;
      }
    }

    const result = analyzeChaosCanvas(createCanvas(40, 40, data));

    expect(result.isBlank).toBe(false);
    expect(result.edgeDensity).toBeGreaterThan(0);
    expect(result.sharpnessScore).toBeGreaterThan(0);
  });

  it("detects a long frame as a lag spike and calculates cadence", () => {
    const result = summarizeChaosFrameTimes([16.7, 17, 60], 50.4);

    expect(result.frameCount).toBe(3);
    expect(result.averageFps).toBeGreaterThan(50);
    expect(result.framesOver50Ms).toBe(1);
    expect(result.isLagSpike).toBe(true);
  });

  it("detects a 40% partial basemap blank persisting across 20 ms probes", () => {
    const samples = Array.from({ length: 12 }, (_, index) => ({
      sampledAtMs: index * 20,
      zoom: 15.5,
      scrolling: true,
      combinedCoverageRatio: 0.59,
      liveCoverageRatio: 0.59,
      maxGapPx: 340,
      hasGap: true,
      isBlurry: false,
    }));

    const result = summarizeChaosBasemapAudit(samples, 20);

    expect(result.sampleCount).toBe(12);
    expect(result.partialBlankSampleCount).toBe(12);
    expect(result.longestGapDurationMs).toBe(240);
    expect(result.hasPersistentGap).toBe(true);
    expect(result.hasPartialBlank).toBe(true);
    expect(result.maximumMissingRatio).toBeCloseTo(0.41, 3);
  });

  it("does not join delayed probes into a fabricated persistent gap", () => {
    const result = summarizeChaosBasemapAudit([
      {
        sampledAtMs: 0,
        zoom: 15,
        scrolling: true,
        combinedCoverageRatio: 0.5,
        liveCoverageRatio: 0.5,
        maxGapPx: 200,
        hasGap: true,
        isBlurry: false,
      },
      {
        sampledAtMs: 500,
        zoom: 15,
        scrolling: false,
        combinedCoverageRatio: 0.5,
        liveCoverageRatio: 0.5,
        maxGapPx: 200,
        hasGap: true,
        isBlurry: false,
      },
    ], 20);

    expect(result.longestGapDurationMs).toBe(20);
    expect(result.hasPersistentGap).toBe(false);
  });
});
