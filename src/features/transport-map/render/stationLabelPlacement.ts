import type { CameraState } from "../geo/camera";
import { worldScaleAtZoom, type WorldPoint } from "../geo/coordinateKernel";
import { TRANSPORT_MAP_STATION_LABEL_OFFSETS } from "./labelRenderTokens";

export type TransportMapLabelTextAnchor = "start" | "middle" | "end";

export interface TransportMapLabelPlacementCandidate {
  id: string;
  text: string;
  worldPosition: WorldPoint;
  sizeCssPx: number;
  priority: number;
  order: number;
}

export type TransportMapLabelPlacementCamera = Pick<
  CameraState,
  "centerWorldX" | "centerWorldY" | "zoom" | "viewportWidthCssPx" | "viewportHeightCssPx"
>;

export interface TransportMapLabelPlacement {
  pixelOffsetCssPx: readonly [number, number];
  textAnchor: TransportMapLabelTextAnchor;
}

interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

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
): ReadonlyMap<string, TransportMapLabelPlacement> {
  const placed: ScreenRect[] = [];
  const placements = new Map<string, TransportMapLabelPlacement>();
  const scale = worldScaleAtZoom(camera.zoom);
  const orderedCandidates = [...candidates].sort((left, right) =>
    right.priority - left.priority ||
    left.order - right.order ||
    left.id.localeCompare(right.id),
  );

  for (const candidate of orderedCandidates) {
    const text = candidate.text.trim();
    if (!text || placements.has(candidate.id)) continue;

    const sizeCssPx = Math.max(1, candidate.sizeCssPx);
    const labelWidth = measureLabelWidth(text, sizeCssPx) + LABEL_HORIZONTAL_PADDING_CSS_PX;
    const labelHeight = LABEL_VERTICAL_PADDING_CSS_PX * sizeCssPx / 13;
    const anchor = {
      x: (candidate.worldPosition.x - camera.centerWorldX) * scale + camera.viewportWidthCssPx / 2,
      y: (candidate.worldPosition.y - camera.centerWorldY) * scale + camera.viewportHeightCssPx / 2,
    };
    let acceptedOffset: readonly [number, number] | undefined;
    let acceptedAnchor: TransportMapLabelTextAnchor = "start";
    const rect: ScreenRect = { left: 0, top: 0, right: 0, bottom: 0 };

    for (const offset of TRANSPORT_MAP_STATION_LABEL_OFFSETS) {
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

    // A lower-priority label is intentionally omitted if all six candidates
    // collide. Keeping an overlapping fallback would defeat the purpose of
    // the layout at the exact zoom levels where stations are densest.
    if (!acceptedOffset) continue;
    placed.push({ ...rect });
    placements.set(candidate.id, {
      pixelOffsetCssPx: acceptedOffset,
      textAnchor: acceptedAnchor,
    });
  }

  return placements;
}

function measureLabelWidth(text: string, sizeCssPx: number): number {
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
