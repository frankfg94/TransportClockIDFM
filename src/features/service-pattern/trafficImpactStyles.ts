import type { PatternTrafficImpact } from "./trafficImpactAnalysis";
export {
  TRAFFIC_DISTURBANCE_COLOR,
  TRAFFIC_INTERRUPTION_COLOR,
  TRAFFIC_INTERRUPTION_GAP_COLOR,
} from "../transport-map/render/trafficStyleTokens";

import {
  TRAFFIC_DISTURBANCE_COLOR,
  TRAFFIC_INTERRUPTION_COLOR,
} from "../transport-map/render/trafficStyleTokens";

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
