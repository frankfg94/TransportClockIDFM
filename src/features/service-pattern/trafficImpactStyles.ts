import type { PatternTrafficImpact } from "./trafficImpactAnalysis";

export const TRAFFIC_INTERRUPTION_COLOR = "#ef4444";
export const TRAFFIC_DISTURBANCE_COLOR = "#f59e0b";

export function getTrafficImpactColor(
  impact?: Pick<PatternTrafficImpact, "kind">,
): string | undefined {
  if (impact?.kind === "interruption") {
    return TRAFFIC_INTERRUPTION_COLOR;
  }

  if (impact?.kind === "disturbance") {
    return TRAFFIC_DISTURBANCE_COLOR;
  }

  return undefined;
}
