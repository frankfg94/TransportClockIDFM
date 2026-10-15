import { clamp, saturatingNeighborhoodBonus, weightedAverage } from "../primitives";
import type { TransportFactsContext } from "./context";

export function calculateTransportScore(context: TransportFactsContext): number {
  const { scoredAccessSignals, linesByKey, structuralLineWeight, accessibleModeWeight, journeySummary, readyFrequencies, serviceQuality,
    structuralLineCount, sharedHubEvidence, reliableConnectionEvidence, effectiveFutureProjects } = context;
  const nearestAccess = scoredAccessSignals[0];
  const scoreParts: Array<{ value: number; weight: number }> = [];

  if (nearestAccess) {
    scoreParts.push({
      value: nearestAccess.source === "route"
        ? clamp(10 * (1 - nearestAccess.minutes / 30))
        : clamp(10 * (1 - nearestAccess.distanceMeters / 2_000)),
      weight: 0.4 * 0.85,
    });
  }
  if (linesByKey.size > 0) {
    scoreParts.push({ value: saturatingNeighborhoodBonus(structuralLineWeight, 4, 10), weight: 0.25 * 0.85 });
  }
  if (accessibleModeWeight > 0) {
    scoreParts.push({ value: saturatingNeighborhoodBonus(accessibleModeWeight, 3, 10), weight: 0.15 * 0.85 });
  }
  if (journeySummary) {
    scoreParts.push({
      value: clamp(10 * (1 - Math.max(0, journeySummary.durationMinutes - 15) / 75)),
      weight: 0.15 * 0.85,
    });
  }
  if (readyFrequencies.length > 0) {
    const relevanceTotal = readyFrequencies.reduce((sum, entry) => sum + entry.relevanceWeight, 0);
    const frequencyScore = readyFrequencies.reduce(
      (sum, entry) => sum + clamp(10 * (1 - Math.max(0, entry.minutes - 2) / 13)) * entry.relevanceWeight,
      0,
    ) / relevanceTotal;
    scoreParts.push({
      value: frequencyScore,
      weight: 0.05 * 0.85 * Math.min(1, relevanceTotal),
    });
  }

  if (serviceQuality) scoreParts.push({ value: serviceQuality.score / 10, weight: 0.15 });

  const weightedScore = scoreParts.length > 0 ? weightedAverage(scoreParts) : 1.5;
  const exceptionalTransport = structuralLineCount >= 3
    && (sharedHubEvidence || reliableConnectionEvidence || effectiveFutureProjects.length > 0);
  return exceptionalTransport ? Math.max(9, weightedScore) : weightedScore;
}
