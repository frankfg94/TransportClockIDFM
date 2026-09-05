export interface ChaosCanvasAnalysisOptions {
  expectedPixelRatio?: number;
  visiblePathCount?: number;
  visibleStationCount?: number;
}

export interface ChaosCanvasAnalysis {
  analysisAvailable: boolean;
  width: number;
  height: number;
  sampledPixels: number;
  alphaCoverageRatio: number;
  opaqueCoverageRatio: number;
  nonTransparentPixelRatio: number;
  meanLuminance: number;
  luminanceStdDev: number;
  edgeDensity: number;
  sharpnessScore: number;
  backingStorePixelRatio: number;
  resolutionMismatch: boolean;
  isBlank: boolean;
  isBlurry: boolean;
  blankReason?: string;
  blurReason?: string;
}

export interface ChaosFrameTimingSummary {
  durationMs: number;
  frameCount: number;
  expectedFrameCount: number;
  averageFps: number;
  minFps: number;
  maxFps: number;
  deliveredFrameRatio: number;
  averageFrameTimeMs: number;
  medianFrameTimeMs: number;
  p95FrameTimeMs: number;
  p99FrameTimeMs: number;
  maxFrameTimeMs: number;
  framesOver16Ms: number;
  framesOver33Ms: number;
  framesOver50Ms: number;
  framesOver100Ms: number;
  framesOver500Ms: number;
  isLagSpike: boolean;
}

export interface ChaosBasemapAuditSample {
  sampledAtMs: number;
  zoom: number;
  scrolling: boolean;
  combinedCoverageRatio: number;
  liveCoverageRatio: number;
  maxGapPx: number;
  hasGap: boolean;
  isBlurry: boolean;
}

export interface ChaosBasemapAuditSummary {
  /** Identifies whether this is a pixel audit or a public MapLibre readiness audit. */
  source?: "legacy-raster-pixels" | "maplibre-public-api";
  sampleIntervalMs: number;
  sampleCount: number;
  gapSampleCount: number;
  partialBlankSampleCount: number;
  fullBlankSampleCount: number;
  minimumCombinedCoverageRatio: number;
  maximumMissingRatio: number;
  maximumGapPx: number;
  longestGapDurationMs: number;
  hasPersistentGap: boolean;
  hasPartialBlank: boolean;
  hasFullBlank: boolean;
  blurrySampleCount: number;
  failures: ChaosBasemapAuditSample[];
}

const MAX_ANALYSIS_SAMPLES = 120_000;
const TRANSPARENT_ALPHA_THRESHOLD = 8;
const BLANK_PIXEL_RATIO_THRESHOLD = 0.00025;
const BLUR_EDGE_DENSITY_THRESHOLD = 0.0015;
const BLUR_SHARPNESS_THRESHOLD = 1.5;
export const CHAOS_BASEMAP_SAMPLE_INTERVAL_MS = 20;
export const CHAOS_BASEMAP_PARTIAL_BLANK_MISSING_RATIO = 0.4;
export const CHAOS_BASEMAP_FULL_BLANK_MISSING_RATIO = 0.98;
export const CHAOS_BASEMAP_PERSISTENT_GAP_MS = 200;
const MAX_REPORTED_BASEMAP_FAILURE_SAMPLES = 64;

/**
 * Inspects the map canvas without retaining ImageData. The result is a
 * heuristic, not a perceptual-quality score: it deliberately exposes the
 * raw signals so a caller can tune thresholds for a renderer or device.
 */
export function analyzeChaosCanvas(
  canvas: HTMLCanvasElement,
  options: ChaosCanvasAnalysisOptions = {},
): ChaosCanvasAnalysis {
  const width = Math.max(0, Math.floor(canvas.width));
  const height = Math.max(0, Math.floor(canvas.height));
  const fallbackHasScene =
    (options.visiblePathCount ?? 0) > 0 || (options.visibleStationCount ?? 0) > 0;
  const expectedPixelRatio = Math.max(0.1, options.expectedPixelRatio ?? 1);
  const cssWidth = resolveCanvasCssDimension(canvas, "width", width);
  const cssHeight = resolveCanvasCssDimension(canvas, "height", height);
  const backingStorePixelRatio =
    cssWidth > 0 && cssHeight > 0
      ? Math.min(width / cssWidth, height / cssHeight)
      : 0;
  const resolutionMismatch =
    backingStorePixelRatio > 0 && backingStorePixelRatio < expectedPixelRatio * 0.9;

  const empty = createEmptyAnalysis({
    width,
    height,
    backingStorePixelRatio,
    resolutionMismatch,
    fallbackHasScene,
  });
  if (width === 0 || height === 0) return empty;

  let context: CanvasRenderingContext2D | null = null;
  let imageData: ImageData;
  try {
    context = canvas.getContext("2d");
    if (!context) return empty;
    imageData = context.getImageData(0, 0, width, height);
  } catch {
    return empty;
  }

  const totalPixels = width * height;
  const stride = Math.max(1, Math.ceil(Math.sqrt(totalPixels / MAX_ANALYSIS_SAMPLES)));
  const pixels = imageData.data;
  let sampledPixels = 0;
  let alphaPixels = 0;
  let opaquePixels = 0;
  let luminanceSum = 0;
  let luminanceSquareSum = 0;
  let edgeSamples = 0;
  let edgeCount = 0;
  let sharpnessSum = 0;
  let sharpnessSamples = 0;

  const readLuminance = (x: number, y: number): number => {
    const index = (y * width + x) * 4;
    return (
      0.2126 * pixels[index]! +
      0.7152 * pixels[index + 1]! +
      0.0722 * pixels[index + 2]!
    );
  };
  const readAlpha = (x: number, y: number): number => pixels[(y * width + x) * 4 + 3]!;

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const alpha = readAlpha(x, y);
      const luminance = readLuminance(x, y);
      sampledPixels += 1;
      if (alpha >= TRANSPARENT_ALPHA_THRESHOLD) alphaPixels += 1;
      if (alpha >= 200) opaquePixels += 1;
      luminanceSum += luminance;
      luminanceSquareSum += luminance * luminance;

      if (x + stride >= width || y + stride >= height) continue;
      const right = readLuminance(Math.min(width - 1, x + stride), y);
      const below = readLuminance(x, Math.min(height - 1, y + stride));
      const gradient = Math.abs(luminance - right) + Math.abs(luminance - below);
      edgeSamples += 1;
      if (gradient >= 24) edgeCount += 1;

      if (x < stride || y < stride || x + stride >= width - stride || y + stride >= height - stride) {
        continue;
      }
      const left = readLuminance(x - stride, y);
      const top = readLuminance(x, y - stride);
      const laplacian = 4 * luminance - left - right - top - below;
      sharpnessSum += laplacian * laplacian;
      sharpnessSamples += 1;
    }
  }

  const alphaCoverageRatio = sampledPixels > 0 ? alphaPixels / sampledPixels : 0;
  const opaqueCoverageRatio = sampledPixels > 0 ? opaquePixels / sampledPixels : 0;
  const meanLuminance = sampledPixels > 0 ? luminanceSum / sampledPixels : 0;
  const luminanceVariance = sampledPixels > 0
    ? Math.max(0, luminanceSquareSum / sampledPixels - meanLuminance * meanLuminance)
    : 0;
  const edgeDensity = edgeSamples > 0 ? edgeCount / edgeSamples : 0;
  const sharpnessScore = sharpnessSamples > 0 ? sharpnessSum / sharpnessSamples : 0;
  // Once ImageData is available, trust the pixels rather than the scene
  // counters: a stale renderer scene with a cleared canvas is precisely the
  // blank-frame failure this diagnostic is meant to catch.
  const isBlank = sampledPixels < 32 || alphaCoverageRatio < BLANK_PIXEL_RATIO_THRESHOLD;
  const hasEnoughVisualContent = alphaCoverageRatio >= BLANK_PIXEL_RATIO_THRESHOLD;
  const isBlurry =
    hasEnoughVisualContent &&
    (resolutionMismatch ||
      (sharpnessScore < BLUR_SHARPNESS_THRESHOLD && edgeDensity < BLUR_EDGE_DENSITY_THRESHOLD));

  return {
    analysisAvailable: true,
    width,
    height,
    sampledPixels,
    alphaCoverageRatio: roundRatio(alphaCoverageRatio),
    opaqueCoverageRatio: roundRatio(opaqueCoverageRatio),
    nonTransparentPixelRatio: roundRatio(alphaCoverageRatio),
    meanLuminance: round(meanLuminance),
    luminanceStdDev: round(Math.sqrt(luminanceVariance)),
    edgeDensity: roundRatio(edgeDensity),
    sharpnessScore: round(sharpnessScore),
    backingStorePixelRatio: round(backingStorePixelRatio),
    resolutionMismatch,
    isBlank,
    isBlurry,
    blankReason: isBlank
      ? sampledPixels < 32
        ? "insufficient-pixel-samples"
        : "transparent-or-empty-canvas"
      : undefined,
    blurReason: isBlurry
      ? resolutionMismatch
        ? "backing-store-resolution-mismatch"
        : "low-high-frequency-detail"
      : undefined,
  };
}

export function summarizeChaosFrameTimes(
  frameTimesMs: number[],
  durationMs: number,
  expectedHz = 60,
): ChaosFrameTimingSummary {
  const sorted = frameTimesMs
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  const duration = Math.max(0, durationMs);
  const seconds = duration / 1_000;
  const expectedFrameCount = seconds * expectedHz;
  const averageFps = seconds > 0 ? sorted.length / seconds : 0;
  const fpsValues = sorted.filter((value) => value > 0).map((value) => 1_000 / value);
  const minFps = fpsValues.length ? Math.min(...fpsValues) : 0;
  const maxFps = fpsValues.length ? Math.max(...fpsValues) : 0;
  const maxFrameTimeMs = sorted.length ? sorted[sorted.length - 1]! : 0;

  return {
    durationMs: round(duration),
    frameCount: sorted.length,
    expectedFrameCount: round(expectedFrameCount),
    averageFps: round(averageFps),
    minFps: round(minFps),
    maxFps: round(maxFps),
    deliveredFrameRatio: round(expectedFrameCount > 0 ? Math.min(1, sorted.length / expectedFrameCount) : 0),
    averageFrameTimeMs: round(sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : 0),
    medianFrameTimeMs: round(percentile(sorted, 0.5)),
    p95FrameTimeMs: round(percentile(sorted, 0.95)),
    p99FrameTimeMs: round(percentile(sorted, 0.99)),
    maxFrameTimeMs: round(maxFrameTimeMs),
    framesOver16Ms: sorted.filter((value) => value > 16.67).length,
    framesOver33Ms: sorted.filter((value) => value > 33.33).length,
    framesOver50Ms: sorted.filter((value) => value > 50).length,
    framesOver100Ms: sorted.filter((value) => value > 100).length,
    framesOver500Ms: sorted.filter((value) => value > 500).length,
    isLagSpike: maxFrameTimeMs > 50 || percentile(sorted, 0.95) > 33.33,
  };
}

/**
 * Summarizes the 20 ms DOM-raster probe used while Chaos Zoom is moving.
 * A missing area of at least 40% matches the large persistent blank regions
 * that are visually hidden by the transport canvas itself. Gap duration is
 * based on actual sample timestamps, so an overloaded event loop cannot make
 * one delayed callback look like a long continuous failure.
 */
export function summarizeChaosBasemapAudit(
  samples: ChaosBasemapAuditSample[],
  sampleIntervalMs = CHAOS_BASEMAP_SAMPLE_INTERVAL_MS,
): ChaosBasemapAuditSummary {
  const intervalMs = Math.max(1, sampleIntervalMs);
  const normalized = samples
    .filter((sample) => Number.isFinite(sample.sampledAtMs))
    .map((sample) => ({
      ...sample,
      combinedCoverageRatio: clampRatio(sample.combinedCoverageRatio),
      liveCoverageRatio: clampRatio(sample.liveCoverageRatio),
      maxGapPx: Math.max(0, Number.isFinite(sample.maxGapPx) ? sample.maxGapPx : 0),
    }))
    .sort((left, right) => left.sampledAtMs - right.sampledAtMs);

  let currentGapStartedAt: number | undefined;
  let previousGapSampleAt: number | undefined;
  let longestGapDurationMs = 0;
  const maximumContinuousSampleDelayMs = intervalMs * 2.5;
  const failures: ChaosBasemapAuditSample[] = [];
  let gapSampleCount = 0;
  let partialBlankSampleCount = 0;
  let fullBlankSampleCount = 0;
  let blurrySampleCount = 0;

  for (const sample of normalized) {
    const missingRatio = 1 - sample.combinedCoverageRatio;
    const isPartialBlank = missingRatio >= CHAOS_BASEMAP_PARTIAL_BLANK_MISSING_RATIO;
    const isFullBlank = missingRatio >= CHAOS_BASEMAP_FULL_BLANK_MISSING_RATIO;
    const failed = sample.hasGap || isPartialBlank || isFullBlank;
    if (sample.hasGap) gapSampleCount += 1;
    if (isPartialBlank) partialBlankSampleCount += 1;
    if (isFullBlank) fullBlankSampleCount += 1;
    if (sample.isBlurry) blurrySampleCount += 1;
    if (failed && failures.length < MAX_REPORTED_BASEMAP_FAILURE_SAMPLES) failures.push(sample);

    if (!failed) {
      if (currentGapStartedAt !== undefined && previousGapSampleAt !== undefined) {
        longestGapDurationMs = Math.max(
          longestGapDurationMs,
          previousGapSampleAt - currentGapStartedAt + intervalMs,
        );
      }
      currentGapStartedAt = undefined;
      previousGapSampleAt = undefined;
      continue;
    }

    if (
      currentGapStartedAt === undefined ||
      previousGapSampleAt === undefined ||
      sample.sampledAtMs - previousGapSampleAt > maximumContinuousSampleDelayMs
    ) {
      currentGapStartedAt = sample.sampledAtMs;
    }
    previousGapSampleAt = sample.sampledAtMs;
  }

  if (currentGapStartedAt !== undefined && previousGapSampleAt !== undefined) {
    longestGapDurationMs = Math.max(
      longestGapDurationMs,
      previousGapSampleAt - currentGapStartedAt + intervalMs,
    );
  }

  const minimumCombinedCoverageRatio = normalized.length
    ? Math.min(...normalized.map((sample) => sample.combinedCoverageRatio))
    : 1;
  return {
    source: "legacy-raster-pixels",
    sampleIntervalMs: intervalMs,
    sampleCount: normalized.length,
    gapSampleCount,
    partialBlankSampleCount,
    fullBlankSampleCount,
    minimumCombinedCoverageRatio: roundRatio(minimumCombinedCoverageRatio),
    maximumMissingRatio: roundRatio(1 - minimumCombinedCoverageRatio),
    maximumGapPx: round(
      normalized.length ? Math.max(...normalized.map((sample) => sample.maxGapPx)) : 0,
    ),
    longestGapDurationMs: round(longestGapDurationMs),
    hasPersistentGap: longestGapDurationMs >= CHAOS_BASEMAP_PERSISTENT_GAP_MS,
    hasPartialBlank: partialBlankSampleCount > 0,
    hasFullBlank: fullBlankSampleCount > 0,
    blurrySampleCount,
    failures,
  };
}

export function roundChaosMetric(value: number, digits = 3): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function createEmptyAnalysis(options: {
  width: number;
  height: number;
  backingStorePixelRatio: number;
  resolutionMismatch: boolean;
  fallbackHasScene: boolean;
}): ChaosCanvasAnalysis {
  return {
    analysisAvailable: false,
    width: options.width,
    height: options.height,
    sampledPixels: 0,
    alphaCoverageRatio: 0,
    opaqueCoverageRatio: 0,
    nonTransparentPixelRatio: 0,
    meanLuminance: 0,
    luminanceStdDev: 0,
    edgeDensity: 0,
    sharpnessScore: 0,
    backingStorePixelRatio: round(options.backingStorePixelRatio),
    resolutionMismatch: options.resolutionMismatch,
    // A renderer with visible paths/stations is not called blank merely
    // because a browser test/WebView refused to expose ImageData.
    isBlank: options.width === 0 || options.height === 0 ? true : !options.fallbackHasScene,
    isBlurry: options.resolutionMismatch,
    blankReason:
      options.width === 0 || options.height === 0
        ? "empty-canvas-dimensions"
        : "pixel-analysis-unavailable",
    blurReason: options.resolutionMismatch ? "backing-store-resolution-mismatch" : undefined,
  };
}

function resolveCanvasCssDimension(
  canvas: HTMLCanvasElement,
  dimension: "width" | "height",
  fallback: number,
): number {
  const clientValue = dimension === "width" ? canvas.clientWidth : canvas.clientHeight;
  if (clientValue > 0) return clientValue;
  const styleValue = Number.parseFloat(canvas.style[dimension]);
  return Number.isFinite(styleValue) && styleValue > 0 ? styleValue : fallback;
}

function percentile(sorted: number[], ratio: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))]!;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return roundChaosMetric(value, 3);
}

function roundRatio(value: number): number {
  return roundChaosMetric(value, 6);
}
