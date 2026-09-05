import type {
  GlobalMapLine,
  GlobalMapMode,
} from "../contracts/manifest";
import type {
  TransportMapRenderScene,
  TransportMapTrafficImpactKind,
} from "../contracts/renderer";
import { GLOBAL_MAP_MODE_ORDER } from "../contracts/manifest";
import {
  GLOBAL_TRANSPORT_PLAN_CONFIG,
  globalTransportPlanLineWidth,
} from "../config/globalTransportPlanConfig";

export type TransportMapPathDash = "solid" | "traffic-interruption";

export interface MutableTransportMapPathStyle {
  visible: boolean;
  active: boolean;
  ghost: boolean;
  hovered: boolean;
  trafficKind: TransportMapTrafficImpactKind | undefined;
  alpha: number;
  lineWidthCssPx: number;
  nativeColor: string;
  dash: TransportMapPathDash;
  order: number;
}

export interface TransportMapPathStyleInputs {
  line: GlobalMapLine;
  scene: Pick<
    TransportMapRenderScene,
    "activeLineId" | "hoveredLineId"
  >;
  highlighted: boolean;
  ghostLineIds: ReadonlySet<string>;
  interruptionLines: ReadonlySet<string>;
  disturbanceLines: ReadonlySet<string>;
  visibleLineIds: ReadonlySet<string>;
  zoom: number;
}

/** Resolve semantic path styling without creating a style object. */
export function resolveTransportMapPathStyle(
  inputs: TransportMapPathStyleInputs,
  output: MutableTransportMapPathStyle,
): boolean {
  const { line, scene } = inputs;
  if (!inputs.visibleLineIds.has(line.id)) {
    output.visible = false;
    return false;
  }

  const active = line.id === scene.activeLineId;
  const ghost = inputs.ghostLineIds.has(line.id) && !active;
  const hovered = inputs.highlighted && line.id === scene.hoveredLineId;
  const hoveredGhost = hovered && ghost;
  const trafficKind = inputs.interruptionLines.has(line.id)
    ? "interruption"
    : inputs.disturbanceLines.has(line.id)
      ? "disturbance"
      : undefined;
  const baseLineWidth = globalTransportPlanLineWidth(line.mode, active, inputs.zoom);

  output.visible = true;
  output.active = active;
  output.ghost = ghost;
  output.hovered = hovered;
  output.trafficKind = trafficKind;
  output.lineWidthCssPx = hovered && !active
    ? baseLineWidth + GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.hoveredLineWidthBoostCssPx
    : baseLineWidth;
  output.alpha = hoveredGhost
    ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.hoveredGhostLineAlpha
    : hovered
      ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.hoveredLineAlpha
      : active
        ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.modePathAlpha.ACTIVE
        : ghost
          ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.ghostLineAlpha
          : line.mode === "BUS" || line.mode === "NOCTILIEN"
            ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.modePathAlpha.BUS
            : GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.modePathAlpha.DEFAULT;
  output.nativeColor = line.color;
  output.dash = trafficKind === "interruption" ? "traffic-interruption" : "solid";
  // Hovered paths are rendered after the ordinary path pass by Canvas2D. A
  // future renderer can use the same order value in its own pipeline.
  output.order = hovered ? 1 : 0;
  return true;
}

export function isTransportMapModeVisible(mode: GlobalMapMode, mask: number): boolean {
  const modeIndex = GLOBAL_MAP_MODE_ORDER.indexOf(mode);
  return modeIndex >= 0 && (mask & (1 << modeIndex)) !== 0;
}
