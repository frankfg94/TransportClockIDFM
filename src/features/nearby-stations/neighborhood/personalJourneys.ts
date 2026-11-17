import type { AddressBookEntry } from "../../address-book/addressBook";
import type { GeocoderPoint } from "../../transport-map/contracts/geocoder";
import type { NearbyJourney } from "../nearbyHeavyTransports";
import type { NeighborhoodFact, NeighborhoodFactPolarity, NeighborhoodScoreDetailGroup, NeighborhoodScoreDetailRow } from "./contracts";
import { chooseFastestJourney } from "./journeys";
import { analyzeNearbyJourneyTiming } from "../nearbyJourneyTiming";
import type { NeighborhoodQualification } from "./qualification";

import type { PersonalJourneyPreference, PersonalJourneyThresholds } from "./personalJourneyPreferences";
export * from "./personalJourneyPreferences";
export interface PersonalJourneyResult extends PersonalJourneyPreference {
  id: string;
  destination?: AddressBookEntry;
  origin?: GeocoderPoint;
  commute: boolean;
  status: "loading" | "ready" | "unavailable" | "error";
  journey?: NearbyJourney;
}

/** Use coordinates as well as IDs: the directory can contain two names for the same place. */
export function samePersonalJourneyDestination(a: Pick<GeocoderPoint, "lon" | "lat">, b: Pick<GeocoderPoint, "lon" | "lat">): boolean {
  return Math.abs(a.lon - b.lon) < 0.000001 && Math.abs(a.lat - b.lat) < 0.000001;
}

export const PERSONAL_JOURNEY_SCORES = { bonus: 10, neutral: 5, penalty: 0 } as const;

export function qualifyPersonalJourney(minutes: number, thresholds: PersonalJourneyThresholds): NeighborhoodQualification {
  return minutes < thresholds.positiveBelowMinutes ? { kind: "bonus" }
    : minutes <= thresholds.neutralThroughMinutes ? { kind: "neutral" } : { kind: "penalty" };
}

export function personalJourneyPolarity(minutes: number, thresholds: PersonalJourneyThresholds): NeighborhoodFactPolarity {
  const qualification = qualifyPersonalJourney(minutes, thresholds);
  return qualification.kind === "bonus" ? "positive" : qualification.kind === "penalty" ? "negative" : "neutral";
}

export function personalJourneyFact(row: PersonalJourneyResult): NeighborhoodFact {
  const minutes = row.journey ? analyzeNearbyJourneyTiming(row.journey).scoreSeconds / 60 : undefined;
  const values = {
    destination: row.destination?.name ?? row.destinationId,
    origin: row.origin?.label ?? "",
    minutes: minutes === undefined ? 0 : Math.ceil(minutes),
    positive: row.positiveBelowMinutes,
    neutral: row.neutralThroughMinutes,
  };
  return {
    id: `personal-journey:${row.id}`, kind: "external", category: "transport",
    family: `personal-journey:${row.id}`, priority: 80,
    polarity: row.status === "ready" && minutes !== undefined ? personalJourneyPolarity(minutes, row) : "neutral",
    labelKey: row.status === "ready" ? row.commute ? "nearbyStations.neighborhoodScore.personalJourneys.commuteResult" : "nearbyStations.neighborhoodScore.personalJourneys.result" : `nearbyStations.neighborhoodScore.personalJourneys.${row.status}`,
    labelValues: values,
    tooltipKey: "nearbyStations.neighborhoodScore.personalJourneys.rule",
    tooltipValues: values,
    ...(row.journey ? { travel: { journey: row.journey } } : {}),
    evidence: { proof: row.journey?.status === "partial" || row.journey?.sections.some(section => section.timingSource === "estimated" || section.walkingUnavailabilityReason) ? "derived" : "direct", observedAt: Date.now(),
      sourceKey: "nearbyStations.neighborhoodScore.datasets.gtfs-journeys",
      ruleKey: "nearbyStations.neighborhoodScore.personalJourneys.rule", ruleValues: values },
  };
}

/** Each measured personal criterion has equal weight; missing journeys have no invented score. */
export function scoreWithPersonalJourneys(baseScore: number | undefined, rows: readonly PersonalJourneyResult[]): number | undefined {
  return personalJourneyScoreDetails(baseScore, rows).score;
}

export function personalJourneyScoreDetails(baseScore: number | undefined, rows: readonly PersonalJourneyResult[]): { score?: number; group?: NeighborhoodScoreDetailGroup } {
  const measured = rows.filter(row => row.status === "ready" && row.journey).map(row => {
    const minutes = analyzeNearbyJourneyTiming(row.journey!).scoreSeconds / 60;
    const polarity = personalJourneyPolarity(minutes, row);
    return { row, minutes, value: polarity === "positive" ? PERSONAL_JOURNEY_SCORES.bonus : polarity === "negative" ? PERSONAL_JOURNEY_SCORES.penalty : PERSONAL_JOURNEY_SCORES.neutral };
  });
  const count = measured.length + (baseScore === undefined ? 0 : 1);
  const score = count ? ((baseScore ?? 0) + measured.reduce<number>((sum, entry) => sum + entry.value, 0)) / count : undefined;
  if (!rows.length) return { score };
  const detailRows: NeighborhoodScoreDetailRow[] = [];
  if (baseScore !== undefined) detailRows.push({ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.transportBase", value: baseScore, weight: 1 / count, points: baseScore / count });
  for (const row of rows) {
    const found = measured.find(entry => entry.row === row);
    detailRows.push({ labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.personalJourney", label: row.destination?.name ?? row.destinationId,
      ...(found ? { measurement: found.minutes, measurementUnit: "minutes" as const, value: found.value, weight: 1 / count, points: found.value / count } : {}),
      thresholds: { positive: row.positiveBelowMinutes, neutral: row.neutralThroughMinutes } });
  }
  return { score, group: { labelKey: "nearbyStations.neighborhoodScore.scoreHelp.detail.personalGroup", method: "average", rows: detailRows, score } };
}

export function resolvedPersonalJourney(journeys: readonly NearbyJourney[]): NearbyJourney | undefined {
  return chooseFastestJourney(journeys.filter(journey => Number.isFinite(journey.durationSeconds) && journey.durationSeconds >= 0));
}
