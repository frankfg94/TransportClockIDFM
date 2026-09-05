export interface BasemapCoverageRectangle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface BasemapCoverageViewport extends BasemapCoverageRectangle {}

export interface BasemapCoverageResult {
  coveredAreaPx2: number;
  viewportAreaPx2: number;
  coverageRatio: number;
  hasGap: boolean;
  maxGapPx: number;
}

/**
 * Measures the union of axis-aligned raster rectangles inside a viewport.
 * The small tolerance is applied before the union so one-pixel CSS rounding
 * seams do not become false coverage failures. `maxGapPx` is also reported
 * from the unexpanded rectangles, which keeps the diagnostic honest.
 */
export function measureBasemapCoverage(
  viewport: BasemapCoverageViewport,
  rectangles: BasemapCoverageRectangle[],
  tolerancePx = 1,
): BasemapCoverageResult {
  const left = Math.min(viewport.left, viewport.right);
  const right = Math.max(viewport.left, viewport.right);
  const top = Math.min(viewport.top, viewport.bottom);
  const bottom = Math.max(viewport.top, viewport.bottom);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const viewportAreaPx2 = width * height;
  if (width === 0 || height === 0) {
    return {
      coveredAreaPx2: 0,
      viewportAreaPx2,
      coverageRatio: 1,
      hasGap: false,
      maxGapPx: 0,
    };
  }

  const tolerance = Math.max(0, tolerancePx);
  const clipped = rectangles
    .map((rectangle) => clipRectangle(rectangle, left, top, right, bottom))
    .filter((rectangle): rectangle is BasemapCoverageRectangle => Boolean(rectangle));
  const tolerant = rectangles
    .map((rectangle) => clipRectangle({
      left: rectangle.left - tolerance,
      top: rectangle.top - tolerance,
      right: rectangle.right + tolerance,
      bottom: rectangle.bottom + tolerance,
    }, left, top, right, bottom))
    .filter((rectangle): rectangle is BasemapCoverageRectangle => Boolean(rectangle));

  const xBounds = uniqueSorted([
    left,
    right,
    ...clipped.flatMap((rectangle) => [rectangle.left, rectangle.right]),
    ...tolerant.flatMap((rectangle) => [rectangle.left, rectangle.right]),
  ]);
  let coveredAreaPx2 = 0;
  let maxGapPx = 0;
  let horizontalGapRun = 0;

  for (let index = 0; index < xBounds.length - 1; index += 1) {
    const xStart = xBounds[index]!;
    const xEnd = xBounds[index + 1]!;
    if (xEnd <= xStart) continue;
    const midpoint = (xStart + xEnd) / 2;
    const tolerantY = mergeIntervals(
      tolerant
        .filter((rectangle) => rectangle.left <= midpoint && rectangle.right >= midpoint)
        .map((rectangle) => ({ start: rectangle.top, end: rectangle.bottom })),
    );
    const rawY = mergeIntervals(
      clipped
        .filter((rectangle) => rectangle.left <= midpoint && rectangle.right >= midpoint)
        .map((rectangle) => ({ start: rectangle.top, end: rectangle.bottom })),
    );
    const coveredHeight = tolerantY.reduce((sum, interval) => sum + interval.end - interval.start, 0);
    const rawGapHeight = maxUncoveredInterval(rawY, top, bottom);
    if (rawY.length === 0) {
      horizontalGapRun += xEnd - xStart;
      maxGapPx = Math.max(maxGapPx, Math.min(horizontalGapRun, height));
    } else {
      horizontalGapRun = 0;
      if (rawGapHeight > 0) maxGapPx = Math.max(maxGapPx, Math.min(xEnd - xStart, rawGapHeight));
    }
    coveredAreaPx2 += (xEnd - xStart) * Math.min(height, Math.max(0, coveredHeight));
  }

  const coverageRatio = viewportAreaPx2 > 0
    ? Math.min(1, Math.max(0, coveredAreaPx2 / viewportAreaPx2))
    : 1;
  return {
    coveredAreaPx2,
    viewportAreaPx2,
    coverageRatio,
    hasGap: maxGapPx > tolerance,
    maxGapPx,
  };
}

function clipRectangle(
  rectangle: BasemapCoverageRectangle,
  left: number,
  top: number,
  right: number,
  bottom: number,
): BasemapCoverageRectangle | undefined {
  const clippedLeft = Math.max(left, Math.min(right, Math.min(rectangle.left, rectangle.right)));
  const clippedRight = Math.min(right, Math.max(left, Math.max(rectangle.left, rectangle.right)));
  const clippedTop = Math.max(top, Math.min(bottom, Math.min(rectangle.top, rectangle.bottom)));
  const clippedBottom = Math.min(bottom, Math.max(top, Math.max(rectangle.top, rectangle.bottom)));
  if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) return undefined;
  return { left: clippedLeft, top: clippedTop, right: clippedRight, bottom: clippedBottom };
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.filter(Number.isFinite))].sort((left, right) => left - right);
}

function mergeIntervals(intervals: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) merged.push({ ...interval });
    else previous.end = Math.max(previous.end, interval.end);
  }
  return merged;
}

function maxUncoveredInterval(
  intervals: Array<{ start: number; end: number }>,
  top: number,
  bottom: number,
): number {
  let cursor = top;
  let maximum = 0;
  for (const interval of intervals) {
    if (interval.start > cursor) maximum = Math.max(maximum, interval.start - cursor);
    cursor = Math.max(cursor, interval.end);
  }
  return Math.max(maximum, bottom - cursor);
}
