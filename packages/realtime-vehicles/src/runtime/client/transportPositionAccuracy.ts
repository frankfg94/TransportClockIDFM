import type {
  TransitVehicleCallEstimate,
  TransitVehicleJourneyEstimate,
  TransitVehicleSnapshot,
  TransportPosition,
} from "./transportPositions";
import { projectJourneyPosition } from "./transportPositionEngine";
import type { TransportPositionParameterSettings } from "./transportPositionParameters";
import { getTransportPositionLineProfile } from "./transportPositionLineProfiles";

export interface TransportPositionAccuracySample {
  trackId: string;
  journeyRef?: string;
  simulatedRemainingSeconds: number;
  authoritativeRemainingSeconds: number;
  remainingErrorSeconds: number;
  positionDeltaSegments?: number;
  teleported: boolean;
}

export interface TransportPositionAccuracyReport {
  lineId: string;
  measuredAt: string;
  profileId?: string;
  profileEnabled: boolean;
  sampleCount: number;
  score: number;
  meanAbsoluteRemainingErrorSeconds: number;
  p95AbsoluteRemainingErrorSeconds: number;
  meanPositionDeltaSegments?: number;
  teleportationCount: number;
  samples: TransportPositionAccuracySample[];
}

export function measureTransportPositionAccuracy(options: {
  previousSnapshot: TransitVehicleSnapshot;
  freshSnapshot: TransitVehicleSnapshot;
  simulatedPositions: TransportPosition[];
  parameters: TransportPositionParameterSettings;
  atMs: number;
}): TransportPositionAccuracyReport | undefined {
  const { previousSnapshot, freshSnapshot, simulatedPositions, parameters, atMs } = options;
  const lineProfile = parameters.metro13Profile.enabled
    ? getTransportPositionLineProfile(freshSnapshot.lineId)
    : undefined;
  const samples = simulatedPositions.flatMap((position) => {
    const previousJourney = previousSnapshot.journeys.find(
      (journey) => journey.snapshotId === position.snapshotJourneyId,
    );
    const freshJourney = previousJourney
      ? findFreshJourney(previousJourney, freshSnapshot.journeys, position, atMs)
      : undefined;

    if (!previousJourney || !freshJourney) {
      return [];
    }

    const previousTargetTime = getCallTime(
      previousJourney.calls,
      position.targetStationId,
    );
    const freshTargetTime = getCallTime(
      freshJourney.calls,
      position.targetStationId,
    );

    if (previousTargetTime === undefined || freshTargetTime === undefined) {
      return [];
    }

    const freshProjection = projectJourneyPosition(freshJourney, atMs, {
      parameters,
      segmentMetrics: freshSnapshot.segmentMetrics,
      lineProfile,
    });
    const positionDeltaSegments = freshProjection
      ? getPositionDelta(position, freshProjection, freshJourney.calls)
      : undefined;
    const simulatedRemainingSeconds = (previousTargetTime - atMs) / 1_000;
    const authoritativeRemainingSeconds = (freshTargetTime - atMs) / 1_000;
    const remainingErrorSeconds = Math.abs(
      simulatedRemainingSeconds - authoritativeRemainingSeconds,
    );

    return [{
      trackId: position.trackId,
      ...(position.journeyRef ? { journeyRef: position.journeyRef } : {}),
      simulatedRemainingSeconds: round(simulatedRemainingSeconds, 2),
      authoritativeRemainingSeconds: round(authoritativeRemainingSeconds, 2),
      remainingErrorSeconds: round(remainingErrorSeconds, 2),
      ...(positionDeltaSegments !== undefined
        ? { positionDeltaSegments: round(positionDeltaSegments, 3) }
        : {}),
      teleported: (positionDeltaSegments ?? 0) >= 0.5,
    }];
  });

  if (samples.length === 0) {
    return undefined;
  }

  const remainingErrors = samples
    .map((sample) => sample.remainingErrorSeconds)
    .sort((left, right) => left - right);
  const positionDeltas = samples
    .map((sample) => sample.positionDeltaSegments)
    .filter((value): value is number => value !== undefined);
  const meanRemainingError = mean(remainingErrors);
  const meanPositionDelta = positionDeltas.length
    ? mean(positionDeltas)
    : undefined;
  // 120 seconds of remaining-time error or five station intervals consume
  // the full score. Both terms are logged separately to keep comparisons honest.
  const score = Math.max(
    0,
    100 - meanRemainingError * (100 / 120) - (meanPositionDelta ?? 0) * 20,
  );

  return {
    lineId: freshSnapshot.lineId,
    measuredAt: new Date(atMs).toISOString(),
    ...(lineProfile ? { profileId: lineProfile.id } : {}),
    profileEnabled: Boolean(lineProfile),
    sampleCount: samples.length,
    score: round(score, 1),
    meanAbsoluteRemainingErrorSeconds: round(meanRemainingError, 2),
    p95AbsoluteRemainingErrorSeconds: round(
      percentile(remainingErrors, 0.95),
      2,
    ),
    ...(meanPositionDelta !== undefined
      ? { meanPositionDeltaSegments: round(meanPositionDelta, 3) }
      : {}),
    teleportationCount: samples.filter((sample) => sample.teleported).length,
    samples,
  };
}

function findFreshJourney(
  previous: TransitVehicleJourneyEstimate,
  candidates: TransitVehicleJourneyEstimate[],
  position: TransportPosition,
  atMs: number,
): TransitVehicleJourneyEstimate | undefined {
  if (previous.journeyRef) {
    const reliable = candidates.find(
      (candidate) =>
        candidate.journeyRef === previous.journeyRef &&
        candidate.serviceDate === previous.serviceDate,
    );

    if (reliable) {
      return reliable;
    }
  }

  const previousTargetTime = getCallTime(previous.calls, position.targetStationId);
  return candidates
    .filter(
      (candidate) =>
        candidate.patternId === previous.patternId &&
        (!previous.directionRef ||
          !candidate.directionRef ||
          candidate.directionRef === previous.directionRef) &&
        candidate.calls.some(
          (call) => call.stationId === position.targetStationId,
        ),
    )
    .map((candidate) => ({
      candidate,
      distance: Math.abs(
        (getCallTime(candidate.calls, position.targetStationId) ?? atMs) -
          (previousTargetTime ?? atMs),
      ),
    }))
    .sort((left, right) => left.distance - right.distance)[0]?.candidate;
}

function getCallTime(
  calls: TransitVehicleCallEstimate[],
  stationId: string,
): number | undefined {
  const call = calls.find((candidate) => candidate.stationId === stationId);
  return parseTime(
    call?.arrivalAt ??
      call?.departureAt ??
      call?.aimedArrivalAt ??
      call?.aimedDepartureAt,
  );
}

function getPositionDelta(
  simulated: Pick<TransportPosition, "sourceStationId" | "targetStationId" | "progress">,
  authoritative: { sourceStationId: string; targetStationId: string; progress: number },
  calls: TransitVehicleCallEstimate[],
): number | undefined {
  const indexes = new Map(
    [...calls]
      .filter((call) => !call.cancelled)
      .sort((left, right) => left.order - right.order)
      .map((call, index) => [call.stationId, index]),
  );
  const simulatedRank = getPositionRank(simulated, indexes);
  const authoritativeRank = getPositionRank(authoritative, indexes);
  return simulatedRank === undefined || authoritativeRank === undefined
    ? undefined
    : Math.abs(simulatedRank - authoritativeRank);
}

function getPositionRank(
  position: { sourceStationId: string; targetStationId: string; progress: number },
  indexes: Map<string, number>,
): number | undefined {
  const source = indexes.get(position.sourceStationId);
  const target = indexes.get(position.targetStationId);
  return source === undefined || target === undefined
    ? undefined
    : source + (target - source) * position.progress;
}

function parseTime(value: string | undefined): number | undefined {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function percentile(values: number[], ratio: number): number {
  return values[Math.min(values.length - 1, Math.floor(values.length * ratio))] ?? 0;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
