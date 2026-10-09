import type { CameraState } from "../geo/camera";
import { worldScaleAtZoom, type WorldPoint } from "../geo/coordinateKernel";
import type { SelectedLineLabelOrientation } from "./selectedLineLabelLayout";
import { TRANSPORT_MAP_STATION_LABEL_OFFSETS } from "./labelRenderTokens";
import { packScreenIntervals } from "./screenIntervalPacking";

export type TransportMapLabelTextAnchor = "start" | "middle" | "end";

export interface TransportMapLabelPlacementCandidate {
  id: string;
  text: string;
  worldPosition: WorldPoint;
  sizeCssPx: number;
  priority: number;
  order: number;
  selectedLineLabelOrientation?: SelectedLineLabelOrientation;
}

export type TransportMapLabelPlacementCamera = Pick<
  CameraState,
  "centerWorldX" | "centerWorldY" | "zoom" | "viewportWidthCssPx" | "viewportHeightCssPx"
>;

export interface TransportMapLabelPlacement {
  pixelOffsetCssPx: readonly [number, number];
  textAnchor: TransportMapLabelTextAnchor;
}

export interface TransportMapLabelScreenBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

type ScreenRect = TransportMapLabelScreenBounds;

const LABEL_FONT_WEIGHT = 800;
const LABEL_FONT_FAMILY = "system-ui, sans-serif";
const LABEL_HORIZONTAL_PADDING_CSS_PX = 8;
const LABEL_VERTICAL_PADDING_CSS_PX = 18;
const LABEL_COLLISION_PADDING_CSS_PX = 4;

let measurementContext: CanvasRenderingContext2D | undefined;

/**
 * Place transport labels in screen space using the same candidate-offset and
 * rectangle collision policy as the legacy Canvas2D renderer. The result is
 * backend-neutral: Deck receives only the accepted labels and their chosen
 * anchor/offset, so it does not need to guess about geographic distances or
 * implement a second, renderer-specific decluttering policy.
 *
 * Pairwise screen positions are invariant under a camera pan. The caller can
 * therefore cache this result by zoom/viewport while MapLibre continues to
 * move the prepared world records every frame.
 */
export function resolveTransportMapLabelPlacements(
  candidates: readonly TransportMapLabelPlacementCandidate[],
  camera: TransportMapLabelPlacementCamera,
  obstacles: readonly ScreenRect[] = [],
): ReadonlyMap<string, TransportMapLabelPlacement> {
  const placed: ScreenRect[] = [...obstacles];
  const placements = new Map<string, TransportMapLabelPlacement>();
  const scale = worldScaleAtZoom(camera.zoom);
  placeVerticalSelectedLineLabels(candidates, camera, obstacles, placements, placed);
  const orderedCandidates = [...candidates].sort((left, right) =>
    right.priority - left.priority ||
    left.order - right.order ||
    left.id.localeCompare(right.id),
  );
  const widestLabel = orderedCandidates.reduce(
    (widest, candidate) => Math.max(
      widest,
      measureTransportMapLabelTextWidth(candidate.text.trim(), Math.max(1, candidate.sizeCssPx)) + LABEL_HORIZONTAL_PADDING_CSS_PX,
    ),
    0,
  );

  for (const candidate of orderedCandidates) {
    const text = candidate.text.trim();
    if (!text || placements.has(candidate.id)) continue;

    const sizeCssPx = Math.max(1, candidate.sizeCssPx);
    const labelWidth = measureTransportMapLabelTextWidth(text, sizeCssPx) + LABEL_HORIZONTAL_PADDING_CSS_PX;
    const labelHeight = LABEL_VERTICAL_PADDING_CSS_PX * sizeCssPx / 13;
    const anchor = {
      x: (candidate.worldPosition.x - camera.centerWorldX) * scale + camera.viewportWidthCssPx / 2,
      y: (candidate.worldPosition.y - camera.centerWorldY) * scale + camera.viewportHeightCssPx / 2,
    };
    let acceptedOffset: readonly [number, number] | undefined;
    let acceptedAnchor: TransportMapLabelTextAnchor = "start";
    const rect: ScreenRect = { left: 0, top: 0, right: 0, bottom: 0 };

    const offsets = candidate.selectedLineLabelOrientation === "horizontal"
      ? horizontalSelectedLineOffsets(
          labelWidth,
          labelHeight,
          widestLabel,
          orderedCandidates.length,
        )
      : TRANSPORT_MAP_STATION_LABEL_OFFSETS;
    for (const offset of offsets) {
      const textAnchor = textAnchorForOffset(offset[0]);
      setLabelRect(
        rect,
        anchor.x + offset[0],
        anchor.y + offset[1],
        labelWidth,
        labelHeight,
        textAnchor,
      );
      if (placed.some((other) => rectanglesOverlap(rect, other, LABEL_COLLISION_PADDING_CSS_PX))) {
        continue;
      }
      acceptedOffset = offset;
      acceptedAnchor = textAnchor;
      break;
    }

    // Generic map labels can be omitted if every candidate collides. Selected
    // line labels instead get enough side-constrained lanes for every station
    // to remain present without colliding with its correspondence list.
    if (!acceptedOffset) continue;
    placed.push({ ...rect });
    placements.set(candidate.id, {
      pixelOffsetCssPx: acceptedOffset,
      textAnchor: acceptedAnchor,
    });
  }

  return placements;
}

export function getTransportMapLabelScreenBounds(
  candidate: Pick<TransportMapLabelPlacementCandidate, "text" | "worldPosition" | "sizeCssPx">,
  camera: TransportMapLabelPlacementCamera,
  placement: TransportMapLabelPlacement,
): TransportMapLabelScreenBounds {
  const sizeCssPx = Math.max(1, candidate.sizeCssPx);
  const width = measureTransportMapLabelTextWidth(candidate.text.trim(), sizeCssPx) + LABEL_HORIZONTAL_PADDING_CSS_PX;
  const height = LABEL_VERTICAL_PADDING_CSS_PX * sizeCssPx / 13;
  const scale = worldScaleAtZoom(camera.zoom);
  const anchorX = (candidate.worldPosition.x - camera.centerWorldX) * scale + camera.viewportWidthCssPx / 2;
  const anchorY = (candidate.worldPosition.y - camera.centerWorldY) * scale + camera.viewportHeightCssPx / 2;
  const [offsetX, offsetY] = placement.pixelOffsetCssPx;
  const x = anchorX + offsetX;
  const y = anchorY + offsetY;
  const left = placement.textAnchor === "end"
    ? x - width
    : placement.textAnchor === "middle"
      ? x - width / 2
      : x;
  return {
    left,
    top: y - height / 2,
    right: left + width,
    bottom: y + height / 2,
  };
}

function horizontalSelectedLineOffsets(
  labelWidth: number,
  labelHeight: number,
  widestLabel: number,
  candidateCount: number,
): readonly (readonly [number, number])[] {
  const offsets: Array<readonly [number, number]> = [];
  const horizontalSlots = [0, 1, -1, 2, -2];
  const xSpacing = Math.max(labelWidth, widestLabel) + 12;
  const ySpacing = labelHeight + LABEL_COLLISION_PADDING_CSS_PX * 2;
  for (let lane = 0; lane <= candidateCount; lane += 1) {
    const y = -30 - lane * ySpacing;
    for (const slot of horizontalSlots) offsets.push([slot * xSpacing, y]);
  }
  return offsets;
}

function placeVerticalSelectedLineLabels(
  candidates: readonly TransportMapLabelPlacementCandidate[],
  camera: TransportMapLabelPlacementCamera,
  obstacles: readonly ScreenRect[],
  placements: Map<string, TransportMapLabelPlacement>,
  placed: ScreenRect[],
): void {
  const scale = worldScaleAtZoom(camera.zoom);
  const seen = new Set<string>();
  const rows = candidates.filter((candidate) => {
    if (candidate.selectedLineLabelOrientation !== "vertical" || !candidate.text.trim() || seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  }).map((candidate) => ({
    candidate,
    x: (candidate.worldPosition.x - camera.centerWorldX) * scale + camera.viewportWidthCssPx / 2,
    y: (candidate.worldPosition.y - camera.centerWorldY) * scale + camera.viewportHeightCssPx / 2,
    width: measureTransportMapLabelTextWidth(candidate.text.trim(), Math.max(1, candidate.sizeCssPx)) + LABEL_HORIZONTAL_PADDING_CSS_PX,
    height: LABEL_VERTICAL_PADDING_CSS_PX * Math.max(1, candidate.sizeCssPx) / 13,
  })).sort((left, right) => left.y - right.y || left.candidate.order - right.candidate.order || left.candidate.id.localeCompare(right.candidate.id));
  if (!rows.length) return;
  const gap = LABEL_COLLISION_PADDING_CSS_PX * 2;
  const centers = packScreenIntervals(rows.map((row) => row.y), rows.map((row) => row.height), gap);
  const xOffset = 22;
  const forbidden = rows.map((row) => mergeIntervals(obstacles.flatMap((obstacle) => {
    const left = row.x + xOffset;
    const right = left + row.width;
    if (right + LABEL_COLLISION_PADDING_CSS_PX < obstacle.left || left - LABEL_COLLISION_PADDING_CSS_PX > obstacle.right) return [];
    const margin = row.height / 2 + LABEL_COLLISION_PADDING_CSS_PX + .01;
    return [{ lower: obstacle.top - margin, upper: obstacle.bottom + margin }];
  })));
  // Try both directions to avoid pushing a whole cluster unnecessarily down.
  const forward = [...centers];
  const backward = [...centers];
  for (let index = 0; index < rows.length; index += 1) {
    const lower = index ? forward[index - 1]! + (rows[index - 1]!.height + rows[index]!.height) / 2 + gap : -Infinity;
    forward[index] = nearestFreeCenter(centers[index]!, lower, Infinity, forbidden[index]!);
  }
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const upper = index < rows.length - 1 ? backward[index + 1]! - (rows[index + 1]!.height + rows[index]!.height) / 2 - gap : Infinity;
    backward[index] = nearestFreeCenter(centers[index]!, -Infinity, upper, forbidden[index]!);
  }
  const cost = (values: readonly number[]) => values.reduce((sum, value, index) => sum + (value - rows[index]!.y) ** 2, 0);
  const packed = cost(forward) <= cost(backward) ? forward : backward;
  rows.forEach((row, index) => {
    const center = packed[index]!;
    placements.set(row.candidate.id, { pixelOffsetCssPx: [xOffset, center - row.y], textAnchor: "start" });
    placed.push({ left: row.x + xOffset, right: row.x + xOffset + row.width, top: center - row.height / 2, bottom: center + row.height / 2 });
  });
}

interface ScreenInterval { lower: number; upper: number }

function mergeIntervals(intervals: ScreenInterval[]): ScreenInterval[] {
  const result: ScreenInterval[] = [];
  for (const interval of intervals.sort((left, right) => left.lower - right.lower)) {
    const previous = result.at(-1);
    if (previous && interval.lower <= previous.upper) previous.upper = Math.max(previous.upper, interval.upper);
    else result.push({ ...interval });
  }
  return result;
}

function nearestFreeCenter(preferred: number, lower: number, upper: number, blocked: readonly ScreenInterval[]): number {
  const center = Math.max(lower, Math.min(upper, preferred));
  const interval = blocked.find((entry) => center > entry.lower && center < entry.upper);
  if (!interval) return center;
  const above = interval.lower >= lower ? interval.lower : -Infinity;
  const below = interval.upper <= upper ? interval.upper : Infinity;
  return Math.abs(above - preferred) <= Math.abs(below - preferred) ? above : below;
}

export function measureTransportMapLabelTextWidth(text: string, sizeCssPx: number): number {
  const context = getMeasurementContext();
  if (context) {
    context.font = `${LABEL_FONT_WEIGHT} ${sizeCssPx}px ${LABEL_FONT_FAMILY}`;
    const measured = context.measureText(text).width;
    if (Number.isFinite(measured) && measured > 0) return measured;
  }

  // The fallback keeps SSR/tests deterministic and is deliberately a little
  // conservative for bold system-ui text, avoiding false non-collisions when
  // a real canvas measurement is unavailable.
  return Array.from(text).length * sizeCssPx * 0.58;
}

function getMeasurementContext(): CanvasRenderingContext2D | undefined {
  if (measurementContext || typeof document === "undefined") return measurementContext;
  const canvas = document.createElement("canvas");
  measurementContext = canvas.getContext("2d") ?? undefined;
  return measurementContext;
}

function textAnchorForOffset(x: number): TransportMapLabelTextAnchor {
  return x < -4 ? "end" : x > 4 ? "start" : "middle";
}

function setLabelRect(
  target: ScreenRect,
  x: number,
  y: number,
  width: number,
  height: number,
  anchor: TransportMapLabelTextAnchor,
): void {
  const left = anchor === "end" ? x - width : anchor === "middle" ? x - width / 2 : x;
  target.left = left;
  target.top = y - height / 2;
  target.right = left + width;
  target.bottom = y + height / 2;
}

function rectanglesOverlap(left: ScreenRect, right: ScreenRect, padding: number): boolean {
  return !(
    left.right + padding < right.left ||
    left.left - padding > right.right ||
    left.bottom + padding < right.top ||
    left.top - padding > right.bottom
  );
}
