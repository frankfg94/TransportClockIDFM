import type { TransportMapTrafficImpactKind } from "../contracts/renderer";

/**
 * Traffic colours are renderer tokens, not service-pattern presentation
 * details. Keeping them here lets Canvas2D and a future GPU renderer consume
 * the same semantic palette without importing a Vue feature.
 */
export const TRAFFIC_INTERRUPTION_COLOR = "#ef4444";
export const TRAFFIC_INTERRUPTION_GAP_COLOR = "#fee2e2";
export const TRAFFIC_DISTURBANCE_COLOR = "#f59e0b";

export function getTransportMapTrafficImpactColor(
  kind?: TransportMapTrafficImpactKind,
): string | undefined {
  if (kind === "interruption") return TRAFFIC_INTERRUPTION_COLOR;
  if (kind === "disturbance") return TRAFFIC_DISTURBANCE_COLOR;
  return undefined;
}
