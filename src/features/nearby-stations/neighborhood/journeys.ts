import type { GtfsLineFrequencyResponse } from "../../../types/lineFrequency";
import type { GlobalMapLine, GlobalMapMode } from "../../transport-map/contracts/manifest";
import type { NearbyHeavyTransportCandidate, NearbyJourney } from "../nearbyHeavyTransports";
import { analyzeNearbyJourneyTiming, compareNearbyTramBoardingWalk, isNearbyJourneyTransitSection, isNearbyJourneyWalkingSection } from "../nearbyJourneyTiming";
import type { NearbyStationEntry } from "../nearbyStations";
import type { NeighborhoodScoreInput } from "./contracts";
import { getNeighborhoodFrequencyRelevanceWeight, HEAVY_SCORE_MODES } from "./contracts";
import { finiteNonNegative, finitePositive } from "./primitives";
import type { NeighborhoodTransportAccessSignal } from "./transportAccess";
import { formatTransportLineName, lineKey } from "./transportAccess";

export function chooseFastestJourney(journeys: readonly NearbyJourney[] | undefined): NearbyJourney | undefined {
  const byPattern = new Map<string, NearbyJourney>();
  for (const journey of journeys ?? []) {
    const pattern = journey.sections.filter(isNearbyJourneyTransitSection).map(section => section.lineId ?? section.lineCode).join("|");
    const previous = byPattern.get(pattern);
    if (!previous || compareJourneyPreference(journey, previous) < 0) byPattern.set(pattern, journey);
  }
  return [...byPattern.values()]
    .filter((journey) => finiteNonNegative(analyzeNearbyJourneyTiming(journey).scoreSeconds) !== undefined)
    .sort(compareJourneyPreference)[0];
}

function compareJourneyPreference(left: NearbyJourney, right: NearbyJourney): number {
  const leftTiming = analyzeNearbyJourneyTiming(left);
  const rightTiming = analyzeNearbyJourneyTiming(right);
  const transfers = (journey: NearbyJourney) => journey.transferCount
    ?? Math.max(0, journey.sections.filter(isNearbyJourneyTransitSection).length - 1);
  return leftTiming.scoreSeconds - rightTiming.scoreSeconds
    || leftTiming.elapsedSeconds - rightTiming.elapsedSeconds
    || transfers(left) - transfers(right)
    || compareNearbyTramBoardingWalk(left, right)
    || (left.id ?? "").localeCompare(right.id ?? "");
}

interface JourneySummary {
  durationMinutes: number;
  elapsedMinutes: number;
  initialWaitMinutes: number;
  walkingMinutes: number;
  transfers: number;
  transitSectionCount: number;
  lines: string;
}

export function summarizeJourney(journey: NearbyJourney): JourneySummary {
  const timing = analyzeNearbyJourneyTiming(journey);
  const transitSections = journey.sections.filter(isNearbyJourneyTransitSection);
  const walkingSeconds = journey.sections
    .filter(isNearbyJourneyWalkingSection)
    .reduce((sum, section) => sum + (finiteNonNegative(section.durationSeconds) ?? 0), 0);
  const lineLabels = [...new Set(transitSections
    .map((section) => section.lineCode || section.lineId)
    .filter((value): value is string => Boolean(value)))].slice(0, 5);
  return {
    durationMinutes: Math.max(1, Math.ceil(timing.scoreSeconds / 60)),
    elapsedMinutes: Math.max(1, Math.ceil(timing.elapsedSeconds / 60)),
    initialWaitMinutes: Math.max(0, Math.ceil(timing.initialWaitSeconds / 60)),
    // Walking is a human-facing aggregate: round the total instead of
    // rounding each leg up, so a route such as 4m44 + 3m40 is displayed as
    // the approximately 8 minutes shown by journey planners.
    walkingMinutes: Math.max(0, Math.round(walkingSeconds / 60)),
    transfers: Number.isFinite(journey.transferCount)
      ? Math.max(0, journey.transferCount ?? 0)
      : Math.max(0, transitSections.length - 1),
    transitSectionCount: transitSections.length,
    lines: lineLabels.join(" · ") || "—",
  };
}

export function getReadyFrequencyEntries(
  profiles: ReadonlyMap<string, GtfsLineFrequencyResponse | undefined> | undefined,
  stations: readonly NearbyStationEntry[],
  candidates: readonly NearbyHeavyTransportCandidate[] | undefined,
  accessSignals: readonly NeighborhoodTransportAccessSignal[],
): Array<{
  lineId: string;
  minutes: number;
  label: string;
  mode: GlobalMapMode;
  accessSeconds: number;
  relevanceWeight: number;
}> {
  const lines = [...stations.flatMap((entry) => entry.lines), ...(candidates ?? []).flatMap((candidate) => candidate.lines)];
  const linesById = new Map(lines.map((line) => [line.id, line]));
  // Frequency belongs to the line once, using its fastest scored access.
  const fastestFirst = [...accessSignals].sort((a, b) => b.totalSeconds - a.totalSeconds);
  const accessByLineId = new Map(fastestFirst.map((signal) => [signal.line.id, signal]));
  const accessByLineKey = new Map(fastestFirst.map((signal) => [lineKey(signal.line), signal]));
  return [...(profiles?.values() ?? [])]
    .filter((profile): profile is GtfsLineFrequencyResponse =>
      profile?.status === "ready" && finitePositive(profile.average.peakMinutes) !== undefined)
    .map((profile) => {
      const line = linesById.get(profile.lineId);
      if (!line || !HEAVY_SCORE_MODES.has(line.mode)) return undefined;
      const access = accessByLineId.get(line.id) ?? accessByLineKey.get(lineKey(line));
      if (!access) return undefined;
      // Frequency relevance uses the elapsed access route, including transfer
      // time. Removing only the initial wait is useful for route labels, but
      // would make a remote line look artificially close in this diagnostic.
      const accessSeconds = Math.max(0, access.totalSeconds);
      const relevanceWeight = getNeighborhoodFrequencyRelevanceWeight(accessSeconds);
      if (relevanceWeight <= 0) return undefined;
      return {
        lineId: profile.lineId,
        minutes: profile.average.peakMinutes!,
        label: formatTransportLineName(line),
        mode: line.mode,
        accessSeconds,
        relevanceWeight,
      };
    })
    .filter((entry): entry is { lineId: string; minutes: number; label: string; mode: GlobalMapMode; accessSeconds: number; relevanceWeight: number } => Boolean(entry))
    .filter((entry): entry is { lineId: string; minutes: number; label: string; mode: GlobalMapMode; accessSeconds: number; relevanceWeight: number } => Number.isFinite(entry.minutes))
    .filter((entry, index, entries) => entries.findIndex(other => lineKey(linesById.get(other.lineId)!) === lineKey(linesById.get(entry.lineId)!)) === index);
}

export function findLineById(input: NeighborhoodScoreInput, lineId: string): GlobalMapLine | undefined {
  return [
    ...input.stations.flatMap((entry) => entry.lines),
    ...(input.heavyCandidates ?? []).flatMap((candidate) => candidate.lines),
  ].find((line) => line.id === lineId);
}

export function formatServiceTime(seconds: number): string {
  const normalized = ((Math.round(seconds) % (24 * 60 * 60)) + 24 * 60 * 60) % (24 * 60 * 60);
  return `${String(Math.floor(normalized / 3_600)).padStart(2, "0")}:${String(Math.floor((normalized % 3_600) / 60)).padStart(2, "0")}`;
}
