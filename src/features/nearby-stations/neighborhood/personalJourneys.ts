import type { AddressBookEntry } from "../../address-book/addressBook";
import type { GeocoderPoint } from "../../transport-map/contracts/geocoder";
import type { NearbyJourney } from "../nearbyHeavyTransports";
import type { NeighborhoodFact, NeighborhoodFactPolarity } from "./contracts";
import { chooseFastestJourney } from "./journeys";
import { analyzeNearbyJourneyTiming } from "../nearbyJourneyTiming";

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

export function personalJourneyPolarity(minutes: number, thresholds: PersonalJourneyThresholds): NeighborhoodFactPolarity {
  return minutes < thresholds.positiveBelowMinutes ? "positive"
    : minutes <= thresholds.neutralThroughMinutes ? "neutral" : "negative";
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
  const scores = rows.filter(row => row.status === "ready" && row.journey).map(row => {
    const polarity = personalJourneyPolarity(analyzeNearbyJourneyTiming(row.journey!).scoreSeconds / 60, row);
    return polarity === "positive" ? 10 : polarity === "negative" ? 0 : 5;
  });
  const count = scores.length + (baseScore === undefined ? 0 : 1);
  return count ? ((baseScore ?? 0) + scores.reduce<number>((sum, score) => sum + score, 0)) / count : undefined;
}

export function resolvedPersonalJourney(journeys: readonly NearbyJourney[]): NearbyJourney | undefined {
  return chooseFastestJourney(journeys.filter(journey => Number.isFinite(journey.durationSeconds) && journey.durationSeconds >= 0));
}
