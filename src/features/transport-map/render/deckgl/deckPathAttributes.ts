import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../../config/globalTransportPlanConfig";
import type { TransportMapPathRenderRecord } from "../transportMapRenderModel";

/**
 * Deck's object and binary PathLayer strategies must resolve exactly the same
 * visual attributes. Keeping the resolver next to the Deck packet contract
 * prevents a worker packet from silently changing alpha or dash semantics.
 */
export function resolveDeckPathColor(
  record: Pick<TransportMapPathRenderRecord, "color" | "alpha">,
): readonly [number, number, number, number] {
  const color = record.color;
  return record.alpha >= 0.7
    ? [color[0], color[1], color[2], 255]
    : [color[0], color[1], color[2], color[3]];
}

export function resolveDeckPathDashArray(
  record: Pick<TransportMapPathRenderRecord, "dash" | "widthCssPx">,
): readonly [number, number] {
  if (record.dash === "traffic-interruption") {
    // PathStyleExtension consumes dash values in half-stroke-width units,
    // while the shared traffic token is defined in CSS pixels (as it is for
    // Canvas2D). Convert per record so every mode keeps the same pixel rhythm.
    const effectiveWidth = Math.max(1, record.widthCssPx);
    const halfStrokeWidth = effectiveWidth / 2;
    const [dashPx, gapPx] = GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.trafficInterruptionDashArray;
    return [dashPx / halfStrokeWidth, gapPx / halfStrokeWidth];
  }
  return [0, 0];
}
