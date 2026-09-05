import type {
  TransportMapTrafficImpactKind,
  TransportMapTrafficPathSpan,
} from "../contracts/renderer";

export interface RenderTrafficRange {
  startVertexIndex: number;
  endVertexIndex: number;
  kind: TransportMapTrafficImpactKind | undefined;
}

export const EMPTY_RENDER_TRAFFIC_RANGES: readonly RenderTrafficRange[] = [];

/** Group the stable traffic topology once per scene source identity. */
export function groupTrafficPathSpans(
  spans: readonly TransportMapTrafficPathSpan[],
): Map<string, TransportMapTrafficPathSpan[]> {
  const grouped = new Map<string, TransportMapTrafficPathSpan[]>();
  for (const span of spans) {
    const pathSpans = grouped.get(span.pathId) ?? [];
    pathSpans.push(span);
    grouped.set(span.pathId, pathSpans);
  }
  for (const pathSpans of grouped.values()) {
    pathSpans.sort((left, right) => left.startVertexIndex - right.startVertexIndex);
  }
  return grouped;
}

/**
 * Convert absolute path traffic spans to ranges clipped to one stable
 * subpath. This pure helper is useful for tests and cache construction; the
 * renderer-facing cache below avoids calling it on every frame.
 */
export function createSubpathTrafficRanges(
  subpathStart: number,
  subpathEnd: number,
  spans: readonly TransportMapTrafficPathSpan[],
): RenderTrafficRange[] {
  const relevantSpans = spans.filter((span) =>
    span.endVertexIndex > subpathStart && span.startVertexIndex < subpathEnd - 1,
  );
  if (relevantSpans.length === 0) return [];

  const ranges: RenderTrafficRange[] = [];
  let cursor = subpathStart;
  for (const span of relevantSpans) {
    const impactStart = Math.max(cursor, subpathStart, span.startVertexIndex);
    const impactEnd = Math.min(subpathEnd - 1, span.endVertexIndex);
    if (impactEnd <= impactStart) continue;
    if (impactStart > cursor) {
      ranges.push({
        startVertexIndex: cursor,
        endVertexIndex: impactStart,
        kind: undefined,
      });
    }
    ranges.push({
      startVertexIndex: impactStart,
      endVertexIndex: impactEnd,
      kind: span.kind,
    });
    cursor = impactEnd;
  }
  if (cursor < subpathEnd - 1) {
    ranges.push({
      startVertexIndex: cursor,
      endVertexIndex: subpathEnd - 1,
      kind: undefined,
    });
  }
  return ranges;
}

/**
 * Scene-owned traffic range cache. A new cache is created only when the
 * traffic spans source changes; subpath lookups during animation are weak-map
 * reads and do not allocate.
 */
export class TransportMapTrafficRangeIndex {
  private spansSource?: readonly TransportMapTrafficPathSpan[];
  private grouped = new Map<string, TransportMapTrafficPathSpan[]>();
  private rangesBySubpath = new WeakMap<object, RenderTrafficRange[]>();

  update(spans: readonly TransportMapTrafficPathSpan[] | undefined): void {
    if (this.spansSource === spans) return;
    this.spansSource = spans;
    this.grouped = groupTrafficPathSpans(spans ?? []);
    this.rangesBySubpath = new WeakMap();
  }

  getGrouped(pathId: string): readonly TransportMapTrafficPathSpan[] {
    return this.grouped.get(pathId) ?? EMPTY_TRAFFIC_PATH_SPANS;
  }

  getForSubpath(
    subpathKey: object,
    start: number,
    end: number,
    pathId: string,
  ): readonly RenderTrafficRange[] {
    const cached = this.rangesBySubpath.get(subpathKey);
    if (cached) return cached;
    const ranges = createSubpathTrafficRanges(start, end, this.grouped.get(pathId) ?? EMPTY_TRAFFIC_PATH_SPANS);
    this.rangesBySubpath.set(subpathKey, ranges);
    return ranges;
  }
}

const EMPTY_TRAFFIC_PATH_SPANS: readonly TransportMapTrafficPathSpan[] = [];
