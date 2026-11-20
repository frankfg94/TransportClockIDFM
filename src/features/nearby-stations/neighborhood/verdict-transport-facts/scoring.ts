import { clamp, saturatingNeighborhoodBonus, weightedAverage } from "../primitives";
import type { NeighborhoodScoreDetailRow, NeighborhoodScoreDetailGroup } from "../contracts";
import type { TransportFactsContext } from "./context";

export const TRANSPORT_SCORE_RULES = { baseShare: 0.85, accessWeight: 0.4, linesWeight: 0.25, modesWeight: 0.15, journeyWeight: 0.15, frequencyWeight: 0.05, qualityWeight: 0.15, accessMinutes: 30, accessMeters: 2000, linesTarget: 4, modesTarget: 3, journeyFullMinutes: 15, journeyRangeMinutes: 75, frequencyFullMinutes: 2, frequencyRangeMinutes: 13, noSignals: 1.5, exceptionalLines: 3, exceptionalFloor: 9 } as const;

export function calculateTransportScore(context: TransportFactsContext): number {
  return calculateTransportScoreDetails(context).score;
}

export function calculateTransportScoreDetails(context: TransportFactsContext): { score: number; group: NeighborhoodScoreDetailGroup } {
  const { scoredAccessSignals, linesByKey, structuralLineWeight, accessibleModeWeight, journeySummary, readyFrequencies, serviceQuality, passengerSatisfaction,
    structuralLineCount, sharedHubEvidence, reliableConnectionEvidence, effectiveFutureProjects } = context;
  const nearestAccess = scoredAccessSignals[0];
  const scoreParts: Array<NeighborhoodScoreDetailRow & { value: number; weight: number }> = [];

  if (nearestAccess) {
    scoreParts.push({
      labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.transportAccess",
      measurement: nearestAccess.source === "route" ? nearestAccess.minutes : nearestAccess.distanceMeters,
      measurementUnit: nearestAccess.source === "route" ? "minutes" : "meters",
      value: nearestAccess.source === "route"
        ? clamp(10 * (1 - nearestAccess.minutes / TRANSPORT_SCORE_RULES.accessMinutes))
        : clamp(10 * (1 - nearestAccess.distanceMeters / TRANSPORT_SCORE_RULES.accessMeters)),
      weight: TRANSPORT_SCORE_RULES.accessWeight * TRANSPORT_SCORE_RULES.baseShare,
    });
  }
  if (linesByKey.size > 0) {
    scoreParts.push({ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.transportLines", measurement: structuralLineWeight, measurementUnit: "count", value: saturatingNeighborhoodBonus(structuralLineWeight, TRANSPORT_SCORE_RULES.linesTarget, 10), weight: TRANSPORT_SCORE_RULES.linesWeight * TRANSPORT_SCORE_RULES.baseShare });
  }
  if (accessibleModeWeight > 0) {
    scoreParts.push({ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.transportModes", measurement: accessibleModeWeight, measurementUnit: "count", value: saturatingNeighborhoodBonus(accessibleModeWeight, TRANSPORT_SCORE_RULES.modesTarget, 10), weight: TRANSPORT_SCORE_RULES.modesWeight * TRANSPORT_SCORE_RULES.baseShare });
  }
  if (journeySummary) {
    scoreParts.push({
      labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.transportJourney", measurement: journeySummary.durationMinutes, measurementUnit: "minutes",
      value: clamp(10 * (1 - Math.max(0, journeySummary.durationMinutes - TRANSPORT_SCORE_RULES.journeyFullMinutes) / TRANSPORT_SCORE_RULES.journeyRangeMinutes)),
      weight: TRANSPORT_SCORE_RULES.journeyWeight * TRANSPORT_SCORE_RULES.baseShare,
    });
  }
  if (readyFrequencies.length > 0) {
    const relevanceTotal = readyFrequencies.reduce((sum, entry) => sum + entry.relevanceWeight, 0);
    const frequencyScore = readyFrequencies.reduce(
      (sum, entry) => sum + clamp(10 * (1 - Math.max(0, entry.minutes - TRANSPORT_SCORE_RULES.frequencyFullMinutes) / TRANSPORT_SCORE_RULES.frequencyRangeMinutes)) * entry.relevanceWeight,
      0,
    ) / relevanceTotal;
    scoreParts.push({
      labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.transportFrequency",
      value: frequencyScore,
      weight: TRANSPORT_SCORE_RULES.frequencyWeight * TRANSPORT_SCORE_RULES.baseShare * Math.min(1, relevanceTotal),
    });
  }

  // The survey composite includes perceived regularity. Use one quality share.
  if (passengerSatisfaction?.score !== undefined) {
    scoreParts.push({ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.transportSatisfaction", measurement: passengerSatisfaction.percent,
      measurementUnit: "percent", value: passengerSatisfaction.score, weight: TRANSPORT_SCORE_RULES.qualityWeight });
  } else if (serviceQuality) scoreParts.push({ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.transportQuality", measurement: serviceQuality.score, measurementUnit: "percent", value: serviceQuality.score / 10, weight: TRANSPORT_SCORE_RULES.qualityWeight });

  const weightedScore = scoreParts.length > 0 ? weightedAverage(scoreParts) : TRANSPORT_SCORE_RULES.noSignals;
  const exceptionalTransport = structuralLineCount >= TRANSPORT_SCORE_RULES.exceptionalLines
    && (sharedHubEvidence || reliableConnectionEvidence || effectiveFutureProjects.length > 0);
  const score = exceptionalTransport ? Math.max(TRANSPORT_SCORE_RULES.exceptionalFloor, weightedScore) : weightedScore;
  const totalWeight = scoreParts.filter(part => Number.isFinite(part.value) && part.weight > 0).reduce((sum, part) => sum + part.weight, 0);
  const rows: NeighborhoodScoreDetailRow[] = scoreParts.map(part => ({ ...part, weight: totalWeight && part.weight > 0 && Number.isFinite(part.value) ? part.weight / totalWeight : 0, points: totalWeight && part.weight > 0 && Number.isFinite(part.value) ? part.value * part.weight / totalWeight : 0 }));
  const labels = ["transportAccess", "transportLines", "transportModes", "transportJourney", "transportFrequency", "transportQuality",
    ...(passengerSatisfaction ? ["transportSatisfaction"] as const : [])] as const;
  for (const label of labels) {
    const key = `nearbyStations.neighborhoodScore.scoreHelp.detail.${label}` as const;
    if (!rows.some(row => row.labelKey === key)) rows.push({ labelKey: key });
  }
  if (!scoreParts.length) rows.push({ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.noTransportSignals", points: weightedScore });
  if (score !== weightedScore) rows.push({ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.exceptionalFloor", points: score - weightedScore });
  return { score, group: { labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.transportBase", method: "average", rows, score } };
}
