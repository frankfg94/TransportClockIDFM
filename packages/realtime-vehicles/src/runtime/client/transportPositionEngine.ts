import type {
  TransitVehicleCallEstimate,
  TransitVehicleJourneyEstimate,
  TransitVehicleSegmentMetric,
  TransitVehicleSnapshot,
  TransportPosition,
  TransportPositionState,
} from "./transportPositions";
import {
  createDefaultTransportPositionParameterSettings,
  normalizeTransportPositionParameterSettings,
  type TransportPositionParameterSettings,
} from "./transportPositionParameters";
import {
  getTransportPositionLineProfile,
  resolveTransportPositionLineProfileSegment,
  type ResolvedTransportPositionLineProfileSegment,
  type TransportPositionLineProfile,
} from "./transportPositionLineProfiles";

const SAME_EDGE_MIN_CORRECTION_MS = 600;
const INFERRED_MATCH_MAX_DISTANCE = 3.25;
const PROGRESS_EPSILON = 0.005;

export interface JourneyPositionProjection {
  sourceStationId: string;
  targetStationId: string;
  progress: number;
  state: TransportPositionState;
  segmentDistanceMeters?: number;
  segmentDistanceSource?: TransitVehicleSegmentMetric["distanceSource"];
  estimatedSpeedKph?: number;
  segmentRuntimeSeconds?: number;
  lineProfileId?: string;
  activeParameterIds?: string[];
}

export interface JourneyPositionProjectionOptions {
  parameters?: TransportPositionParameterSettings;
  segmentMetrics?: TransitVehicleSegmentMetric[];
  lineProfile?: TransportPositionLineProfile;
}

export interface TransportPositionEngine {
  configure(parameters: TransportPositionParameterSettings): void;
  reconcile(
    snapshot: TransitVehicleSnapshot,
    atMs?: number,
    reduceMotion?: boolean,
  ): TransportPosition[];
  positionsAt(atMs?: number, reduceMotion?: boolean): TransportPosition[];
  reset(): void;
}

interface Track {
  trackId: string;
  journey: TransitVehicleJourneyEstimate;
  snapshotGeneratedAt: string;
  correction?: PositionCorrection;
  missingUntil?: number;
}

interface PositionCorrection {
  kind: "same_edge" | "adjacent_forward" | "adjacent_backward";
  from: JourneyPositionProjection;
  startedAt: number;
  endsAt: number;
}

interface MatchCandidate {
  incomingIndex: number;
  track: Track;
  distance: number;
}

/**
 * Smooth interpolation with zero velocity and acceleration at both ends.
 * This is deliberately a visual model: every new snapshot remains authoritative.
 */
export function minimumJerk(progress: number): number {
  const t = clamp01(progress);

  return t * t * t * (10 + t * (-15 + 6 * t));
}

/**
 * Projects one journey onto a pair of adjacent stations at a specific instant.
 * Normalized observed/estimated values are preferred over aimed values.
 */
export function projectJourneyPosition(
  journey: TransitVehicleJourneyEstimate,
  atMs: number,
  options: JourneyPositionProjectionOptions = {},
): JourneyPositionProjection | undefined {
  const parameters = options.parameters ??
    createDefaultTransportPositionParameterSettings();
  const calls = expandJourneyProjectionCalls(journey, {
    ...options,
    parameters,
  });

  if (calls.length < 2 || !Number.isFinite(atMs)) {
    return undefined;
  }

  const vehicleAtStopIndex = calls.findIndex((call) => call.vehicleAtStop);

  if (vehicleAtStopIndex >= 0) {
    return projectStation(calls, vehicleAtStopIndex);
  }

  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index];
    const arrivalAt = getArrivalAt(
      call,
      parameters.dwell.useRealtimeTimes,
    );
    const departureAt = getDepartureAt(
      call,
      parameters.dwell.useRealtimeTimes,
    );
    const fallbackWindow = parameters.dwell.enabled
      ? getFallbackDwellWindow(
          arrivalAt,
          departureAt,
          parameters.dwell.fallbackSeconds,
        )
      : undefined;
    const dwellStartsAt = arrivalAt ?? fallbackWindow?.startsAt;
    const dwellEndsAt = departureAt ?? fallbackWindow?.endsAt;

    if (
      parameters.dwell.enabled &&
      dwellStartsAt !== undefined &&
      dwellEndsAt !== undefined &&
      dwellEndsAt >= dwellStartsAt &&
      atMs >= dwellStartsAt &&
      atMs <= dwellEndsAt
    ) {
      return projectStation(calls, index);
    }
  }

  for (let index = 0; index < calls.length - 1; index += 1) {
    const source = calls[index];
    const target = calls[index + 1];
    const departureAt =
      getDepartureAt(source, parameters.dwell.useRealtimeTimes) ??
      getArrivalAt(source, parameters.dwell.useRealtimeTimes);
    const arrivalAt =
      getArrivalAt(target, parameters.dwell.useRealtimeTimes) ??
      getDepartureAt(target, parameters.dwell.useRealtimeTimes);

    if (
      departureAt === undefined ||
      arrivalAt === undefined ||
      arrivalAt <= departureAt ||
      atMs < departureAt ||
      atMs > arrivalAt
    ) {
      continue;
    }

    const lineProfileSegment = resolveTransportPositionLineProfileSegment(
      options.lineProfile,
      source.stationId,
      target.stationId,
    );
    const profileRuntimeSeconds =
      parameters.metro13Profile.enabled &&
      parameters.metro13Profile.useScheduledRuntimes
        ? lineProfileSegment?.runtimeSeconds
        : undefined;
    const movementDepartureAt = profileRuntimeSeconds
      ? Math.max(departureAt, arrivalAt - profileRuntimeSeconds * 1_000)
      : departureAt;

    if (atMs < movementDepartureAt) {
      return projectStation(calls, index);
    }

    const linearProgress =
      (atMs - movementDepartureAt) / (arrivalAt - movementDepartureAt);

    if (linearProgress >= 1) {
      return projectStation(calls, index + 1);
    }

    const metric = selectSegmentMetric(
      source.stationId,
      target.stationId,
      options.segmentMetrics ?? [],
      parameters,
      lineProfileSegment,
    );
    const durationSeconds = (arrivalAt - movementDepartureAt) / 1_000;
    const movementProgress = applyMovementParameters(
      linearProgress,
      metric?.distanceMeters,
      durationSeconds,
      parameters,
    );
    const configuredSpeedCap =
      parameters.metro13Profile.enabled &&
      parameters.metro13Profile.useRollingStockSpeedCap &&
      lineProfileSegment?.maxOperatingSpeedKph
        ? Math.min(
            parameters.speed.maxPlausibleKph,
            lineProfileSegment.maxOperatingSpeedKph,
          )
        : parameters.speed.maxPlausibleKph;
    const estimatedSpeedKph =
      parameters.speed.enabled && metric && durationSeconds > 0
        ? Math.min(
            configuredSpeedCap,
            (metric.distanceMeters / durationSeconds) * 3.6,
          )
        : undefined;

    return {
      sourceStationId: source.stationId,
      targetStationId: target.stationId,
      progress: movementProgress,
      state: "moving",
      ...(metric
        ? {
            segmentDistanceMeters: metric.distanceMeters,
            segmentDistanceSource: metric.distanceSource,
          }
        : {}),
      ...(estimatedSpeedKph !== undefined ? { estimatedSpeedKph } : {}),
      ...(profileRuntimeSeconds ? { segmentRuntimeSeconds: durationSeconds } : {}),
      ...(lineProfileSegment ? { lineProfileId: lineProfileSegment.profileId } : {}),
      activeParameterIds: getActiveMovementParameterIds(
        parameters,
        metric,
        lineProfileSegment,
      ),
    };
  }

  return undefined;
}

export function createTransportPositionEngine(
  initialParameters = createDefaultTransportPositionParameterSettings(),
): TransportPositionEngine {
  let tracks = new Map<string, Track>();
  let inferredTrackSequence = 0;
  let parameters = normalizeTransportPositionParameterSettings(
    initialParameters,
  );
  let segmentMetrics: TransitVehicleSegmentMetric[] = [];
  let lineRef: string | undefined;
  let lineProfile: TransportPositionLineProfile | undefined;

  function configure(next: TransportPositionParameterSettings): void {
    parameters = normalizeTransportPositionParameterSettings(next);
    lineProfile = parameters.metro13Profile.enabled
      ? getTransportPositionLineProfile(lineRef)
      : undefined;
  }

  function positionsAt(
    atMs = Date.now(),
    reduceMotion = false,
  ): TransportPosition[] {
    const positions: TransportPosition[] = [];

    for (const [trackId, track] of tracks) {
      if (track.missingUntil !== undefined && atMs > track.missingUntil) {
        tracks.delete(trackId);
        continue;
      }

      const authoritative = projectJourneyPosition(track.journey, atMs, {
        parameters,
        segmentMetrics,
        lineProfile,
      });

      if (!authoritative) {
        continue;
      }

      const projection = reduceMotion
        ? authoritative
        : applyCorrection(track, authoritative, atMs);

      positions.push(toTransportPosition(track, projection));
    }

    return positions.sort((left, right) =>
      left.trackId.localeCompare(right.trackId),
    );
  }

  function reconcile(
    snapshot: TransitVehicleSnapshot,
    atMs = Date.now(),
    reduceMotion = false,
  ): TransportPosition[] {
    if (!snapshot.available) {
      tracks.clear();
      return [];
    }

    segmentMetrics = snapshot.segmentMetrics ?? [];
    lineRef = snapshot.lineId;
    lineProfile = parameters.metro13Profile.enabled
      ? getTransportPositionLineProfile(lineRef)
      : undefined;

    const previousTracks = Array.from(tracks.values()).filter(
      (track) => track.missingUntil === undefined || atMs <= track.missingUntil,
    );
    const previousPositions = new Map(
      previousTracks.flatMap((track) => {
        const position = positionForTrack(
          track,
          atMs,
          reduceMotion,
          parameters,
          segmentMetrics,
          lineProfile,
        );
        return position ? [[track.trackId, position] as const] : [];
      }),
    );
    const journeys = snapshot.journeys.filter(hasUsableJourneyCalls);
    const assignments = matchJourneys(
      previousTracks,
      journeys,
      atMs,
      parameters,
      segmentMetrics,
      lineProfile,
    );
    const matchedTrackIds = new Set(
      Array.from(assignments.values(), (track) => track.trackId),
    );
    const nextTracks = new Map<string, Track>();

    journeys.forEach((journey, incomingIndex) => {
      const existingTrack = assignments.get(incomingIndex);
      const track = existingTrack
        ? updateTrack(
            existingTrack,
            previousPositions.get(existingTrack.trackId),
            journey,
            snapshot.generatedAt,
            atMs,
            reduceMotion,
            parameters,
            segmentMetrics,
            lineProfile,
          )
        : createTrack(journey, snapshot.generatedAt);

      nextTracks.set(track.trackId, track);
    });

    if (!snapshot.complete) {
      const retentionMs = getPartialSnapshotRetentionMs(snapshot.pollAfterMs);

      for (const track of previousTracks) {
        if (matchedTrackIds.has(track.trackId)) {
          continue;
        }

        track.missingUntil ??= atMs + retentionMs;

        if (atMs <= track.missingUntil) {
          nextTracks.set(track.trackId, track);
        }
      }
    }

    tracks = nextTracks;
    return positionsAt(atMs, reduceMotion);
  }

  function createTrack(
    journey: TransitVehicleJourneyEstimate,
    snapshotGeneratedAt: string,
  ): Track {
    const preferredTrackId =
      journey.identityQuality === "reliable" && journey.journeyRef
        ? `journey:${journey.serviceDate ?? "unknown"}:${journey.journeyRef}`
        : `inferred:${++inferredTrackSequence}`;
    const trackId = makeUniqueTrackId(preferredTrackId, tracks);

    return {
      trackId,
      journey,
      snapshotGeneratedAt,
    };
  }

  function reset(): void {
    tracks.clear();
    inferredTrackSequence = 0;
    segmentMetrics = [];
    lineRef = undefined;
    lineProfile = undefined;
  }

  return { configure, positionsAt, reconcile, reset };
}

function updateTrack(
  track: Track,
  previousPosition: TransportPosition | undefined,
  journey: TransitVehicleJourneyEstimate,
  snapshotGeneratedAt: string,
  atMs: number,
  reduceMotion: boolean,
  parameters: TransportPositionParameterSettings,
  segmentMetrics: TransitVehicleSegmentMetric[],
  lineProfile?: TransportPositionLineProfile,
): Track {
  const authoritative = projectJourneyPosition(journey, atMs, {
    parameters,
    segmentMetrics,
    lineProfile,
  });

  track.journey = journey;
  track.snapshotGeneratedAt = snapshotGeneratedAt;
  track.missingUntil = undefined;
  track.correction =
    reduceMotion ||
    !parameters.reconciliation.enabled ||
    !previousPosition ||
    !authoritative
      ? undefined
      : createCorrection(
          previousPosition,
          authoritative,
          atMs,
          parameters,
        );

  return track;
}

function createCorrection(
  previous: TransportPosition,
  authoritative: JourneyPositionProjection,
  atMs: number,
  parameters: TransportPositionParameterSettings,
): PositionCorrection | undefined {
  const maximumDurationMs = Math.round(
    parameters.reconciliation.maxCorrectionSeconds * 1_000,
  );

  if (maximumDurationMs <= 0) {
    return undefined;
  }

  const from = toProjection(previous);

  if (isSameEdge(from, authoritative)) {
    const distance = Math.abs(from.progress - authoritative.progress);

    if (distance <= PROGRESS_EPSILON) {
      return undefined;
    }

    const minimumDurationMs = Math.min(
      SAME_EDGE_MIN_CORRECTION_MS,
      maximumDurationMs,
    );
    const duration = Math.min(
      maximumDurationMs,
      Math.round(
        minimumDurationMs + distance * (maximumDurationMs - minimumDurationMs),
      ),
    );

    return {
      kind: "same_edge",
      from,
      startedAt: atMs,
      endsAt: atMs + duration,
    };
  }

  if (
    parameters.reconciliation.snapAfterSegments >= 1 &&
    from.targetStationId === authoritative.sourceStationId
  ) {
    const distance = 1 - from.progress + authoritative.progress;
    const duration = Math.min(
      maximumDurationMs,
      Math.round(1_200 + distance * 900),
    );

    return {
      kind: "adjacent_forward",
      from,
      startedAt: atMs,
      endsAt: atMs + duration,
    };
  }

  if (
    parameters.reconciliation.snapAfterSegments >= 1 &&
    from.sourceStationId === authoritative.targetStationId
  ) {
    const distance = from.progress + 1 - authoritative.progress;
    const duration = Math.min(
      maximumDurationMs,
      Math.round(1_200 + distance * 900),
    );

    return {
      kind: "adjacent_backward",
      from,
      startedAt: atMs,
      endsAt: atMs + duration,
    };
  }

  return undefined;
}

function applyCorrection(
  track: Track,
  authoritative: JourneyPositionProjection,
  atMs: number,
): JourneyPositionProjection {
  const correction = track.correction;

  if (!correction) {
    return authoritative;
  }

  if (atMs >= correction.endsAt) {
    track.correction = undefined;
    return authoritative;
  }

  if (atMs <= correction.startedAt) {
    return { ...correction.from, state: "correcting" };
  }

  const elapsed = minimumJerk(
    (atMs - correction.startedAt) /
      (correction.endsAt - correction.startedAt),
  );

  if (correction.kind === "same_edge") {
    if (!isSameEdge(correction.from, authoritative)) {
      track.correction = undefined;
      return authoritative;
    }

    return {
      ...authoritative,
      progress: lerp(
        correction.from.progress,
        authoritative.progress,
        elapsed,
      ),
      state: "correcting",
    };
  }

  if (
    correction.kind === "adjacent_forward" &&
    correction.from.targetStationId === authoritative.sourceStationId
  ) {
    const firstEdgeDistance = 1 - correction.from.progress;
    const totalDistance = firstEdgeDistance + authoritative.progress;
    const travelled = elapsed * totalDistance;

    if (travelled <= firstEdgeDistance) {
      return {
        ...correction.from,
        progress: clamp01(correction.from.progress + travelled),
        state: "correcting",
      };
    }

    return {
      ...authoritative,
      progress: clamp01(travelled - firstEdgeDistance),
      state: "correcting",
    };
  }

  if (
    correction.kind === "adjacent_backward" &&
    correction.from.sourceStationId === authoritative.targetStationId
  ) {
    const firstEdgeDistance = correction.from.progress;
    const totalDistance = firstEdgeDistance + 1 - authoritative.progress;
    const travelled = elapsed * totalDistance;

    if (travelled <= firstEdgeDistance) {
      return {
        ...correction.from,
        progress: clamp01(correction.from.progress - travelled),
        state: "correcting",
      };
    }

    return {
      ...authoritative,
      progress: clamp01(1 - (travelled - firstEdgeDistance)),
      state: "correcting",
    };
  }

  track.correction = undefined;
  return authoritative;
}

function matchJourneys(
  previousTracks: Track[],
  journeys: TransitVehicleJourneyEstimate[],
  atMs: number,
  parameters: TransportPositionParameterSettings,
  segmentMetrics: TransitVehicleSegmentMetric[],
  lineProfile?: TransportPositionLineProfile,
): Map<number, Track> {
  const assignments = new Map<number, Track>();
  const usedTrackIds = new Set<string>();
  const reliableJourneyRefCounts = countReliableJourneyRefs(journeys);

  journeys.forEach((journey, incomingIndex) => {
    const key = getReliableJourneyKey(journey);

    if (!key || reliableJourneyRefCounts.get(key) !== 1) {
      return;
    }

    const matchingTrack = previousTracks.find(
      (track) =>
        !usedTrackIds.has(track.trackId) &&
        getReliableJourneyKey(track.journey) === key,
    );

    if (matchingTrack) {
      assignments.set(incomingIndex, matchingTrack);
      usedTrackIds.add(matchingTrack.trackId);
    }
  });

  const candidates: MatchCandidate[] = [];

  journeys.forEach((journey, incomingIndex) => {
    if (assignments.has(incomingIndex)) {
      return;
    }

    const incomingPosition = projectJourneyPosition(journey, atMs, {
      parameters,
      segmentMetrics,
      lineProfile,
    });

    if (!incomingPosition) {
      return;
    }

    for (const track of previousTracks) {
      if (
        usedTrackIds.has(track.trackId) ||
        !areJourneysCompatible(track.journey, journey)
      ) {
        continue;
      }

      const previousPosition = projectJourneyPosition(track.journey, atMs, {
        parameters,
        segmentMetrics,
        lineProfile,
      });

      if (!previousPosition) {
        continue;
      }

      const distance = getPositionDistance(
        previousPosition,
        incomingPosition,
        journey.calls,
      );

      if (distance <= INFERRED_MATCH_MAX_DISTANCE) {
        candidates.push({ incomingIndex, track, distance });
      }
    }
  });

  candidates
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        left.track.trackId.localeCompare(right.track.trackId) ||
        left.incomingIndex - right.incomingIndex,
    )
    .forEach((candidate) => {
      if (
        assignments.has(candidate.incomingIndex) ||
        usedTrackIds.has(candidate.track.trackId)
      ) {
        return;
      }

      assignments.set(candidate.incomingIndex, candidate.track);
      usedTrackIds.add(candidate.track.trackId);
    });

  return assignments;
}

function getPositionDistance(
  previous: JourneyPositionProjection,
  incoming: JourneyPositionProjection,
  incomingCalls: TransitVehicleCallEstimate[],
): number {
  if (isSameEdge(previous, incoming)) {
    return Math.abs(previous.progress - incoming.progress);
  }

  if (previous.targetStationId === incoming.sourceStationId) {
    return 1 - previous.progress + incoming.progress;
  }

  if (previous.sourceStationId === incoming.targetStationId) {
    return previous.progress + 1 - incoming.progress;
  }

  const stationIndexes = new Map(
    getUsableCalls(incomingCalls).map((call, index) => [call.stationId, index]),
  );
  const previousRank = getProjectionRank(previous, stationIndexes);
  const incomingRank = getProjectionRank(incoming, stationIndexes);

  return previousRank === undefined || incomingRank === undefined
    ? Number.POSITIVE_INFINITY
    : Math.abs(previousRank - incomingRank);
}

function getProjectionRank(
  projection: JourneyPositionProjection,
  stationIndexes: Map<string, number>,
): number | undefined {
  const sourceIndex = stationIndexes.get(projection.sourceStationId);
  const targetIndex = stationIndexes.get(projection.targetStationId);

  if (sourceIndex === undefined || targetIndex === undefined) {
    return undefined;
  }

  return lerp(sourceIndex, targetIndex, projection.progress);
}

function areJourneysCompatible(
  previous: TransitVehicleJourneyEstimate,
  incoming: TransitVehicleJourneyEstimate,
): boolean {
  if (previous.patternId !== incoming.patternId) {
    return false;
  }

  return !(
    previous.directionRef &&
    incoming.directionRef &&
    previous.directionRef !== incoming.directionRef
  );
}

function countReliableJourneyRefs(
  journeys: TransitVehicleJourneyEstimate[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const journey of journeys) {
    const key = getReliableJourneyKey(journey);

    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return counts;
}

function getReliableJourneyKey(
  journey: TransitVehicleJourneyEstimate,
): string | undefined {
  if (journey.identityQuality !== "reliable" || !journey.journeyRef) {
    return undefined;
  }

  return `${journey.serviceDate ?? "unknown"}\u0000${journey.journeyRef}`;
}

function positionForTrack(
  track: Track,
  atMs: number,
  reduceMotion: boolean,
  parameters: TransportPositionParameterSettings,
  segmentMetrics: TransitVehicleSegmentMetric[],
  lineProfile?: TransportPositionLineProfile,
): TransportPosition | undefined {
  const authoritative = projectJourneyPosition(track.journey, atMs, {
    parameters,
    segmentMetrics,
    lineProfile,
  });

  if (!authoritative) {
    return undefined;
  }

  const projection = reduceMotion
    ? authoritative
    : applyCorrection(track, authoritative, atMs);

  return toTransportPosition(track, projection);
}

function toTransportPosition(
  track: Track,
  projection: JourneyPositionProjection,
): TransportPosition {
  return {
    trackId: track.trackId,
    snapshotJourneyId: track.journey.snapshotId,
    journeyRef: track.journey.journeyRef,
    patternId: track.journey.patternId,
    directionRef: track.journey.directionRef,
    destination: track.journey.destination,
    sourceStationId: projection.sourceStationId,
    targetStationId: projection.targetStationId,
    progress: clamp01(projection.progress),
    state: projection.state,
    identityQuality: track.journey.identityQuality,
    confidence: track.journey.confidence,
    segmentDistanceMeters: projection.segmentDistanceMeters,
    segmentDistanceSource: projection.segmentDistanceSource,
    estimatedSpeedKph: projection.estimatedSpeedKph,
    segmentRuntimeSeconds: projection.segmentRuntimeSeconds,
    lineProfileId: projection.lineProfileId,
    activeParameterIds:
      projection.state === "correcting"
        ? [...new Set([...(projection.activeParameterIds ?? []), "reconciliation"])]
        : projection.activeParameterIds,
    vehicleVisualProfileId: track.journey.vehicleVisualProfileId,
    snapshotGeneratedAt: track.snapshotGeneratedAt,
  };
}

function toProjection(
  position: TransportPosition,
): JourneyPositionProjection {
  return {
    sourceStationId: position.sourceStationId,
    targetStationId: position.targetStationId,
    progress: position.progress,
    state: position.state === "at_stop" ? "at_stop" : "moving",
    segmentDistanceMeters: position.segmentDistanceMeters,
    segmentDistanceSource: position.segmentDistanceSource,
    estimatedSpeedKph: position.estimatedSpeedKph,
    segmentRuntimeSeconds: position.segmentRuntimeSeconds,
    lineProfileId: position.lineProfileId,
    activeParameterIds: position.activeParameterIds,
  };
}

function projectStation(
  calls: TransitVehicleCallEstimate[],
  index: number,
): JourneyPositionProjection | undefined {
  const current = calls[index];
  const next = calls[index + 1];

  if (next) {
    return {
      sourceStationId: current.stationId,
      targetStationId: next.stationId,
      progress: 0,
      state: "at_stop",
    };
  }

  const previous = calls[index - 1];

  return previous
    ? {
        sourceStationId: previous.stationId,
        targetStationId: current.stationId,
        progress: 1,
        state: "at_stop",
      }
    : undefined;
}

function getUsableCalls(
  calls: TransitVehicleCallEstimate[],
): TransitVehicleCallEstimate[] {
  return calls
    .filter((call) => !call.cancelled && Boolean(call.stationId))
    .sort((left, right) => left.order - right.order);
}

/**
 * SIRI EstimatedTimetable is a rolling window: a vehicle can have a valid
 * journey identity while its previous call has already disappeared from the
 * payload. Rebuild only the omitted topology intervals. Real SIRI calls stay
 * untouched and remain the temporal anchors on every refresh.
 */
export function expandJourneyProjectionCalls(
  journey: TransitVehicleJourneyEstimate,
  options: JourneyPositionProjectionOptions = {},
): TransitVehicleCallEstimate[] {
  const observed = getUsableCalls(journey.calls);
  const pattern = journey.patternStationIds;

  if (!pattern || pattern.length < 2 || observed.length === 0) {
    return observed;
  }

  const parameters = options.parameters ??
    createDefaultTransportPositionParameterSettings();
  const validObserved = observed.filter(
    (call) =>
      call.order >= 0 &&
      call.order < pattern.length &&
      pattern[call.order] === call.stationId,
  );

  if (validObserved.length === 0) {
    return observed;
  }

  const synthetic = new Map<number, TransitVehicleCallEstimate>();
  const observedOrders = new Set(validObserved.map((call) => call.order));
  const addSynthetic = (order: number, timeMs: number): void => {
    if (
      observedOrders.has(order) ||
      synthetic.has(order) ||
      !Number.isFinite(timeMs) ||
      !pattern[order]
    ) {
      return;
    }

    const aimedAt = new Date(timeMs).toISOString();
    synthetic.set(order, {
      stationId: pattern[order],
      order,
      aimedArrivalAt: aimedAt,
      aimedDepartureAt: aimedAt,
      timeQuality: "aimed",
      vehicleAtStop: false,
      cancelled: false,
    });
  };

  for (let index = 0; index < validObserved.length - 1; index += 1) {
    const source = validObserved[index];
    const target = validObserved[index + 1];

    if (target.order <= source.order + 1) {
      continue;
    }

    const startsAt =
      getDepartureAt(source, parameters.dwell.useRealtimeTimes) ??
      getArrivalAt(source, parameters.dwell.useRealtimeTimes);
    const endsAt =
      getArrivalAt(target, parameters.dwell.useRealtimeTimes) ??
      getDepartureAt(target, parameters.dwell.useRealtimeTimes);

    if (
      startsAt === undefined ||
      endsAt === undefined ||
      endsAt <= startsAt
    ) {
      continue;
    }

    const weights = Array.from(
      { length: target.order - source.order },
      (_, offset) =>
        estimateSegmentRuntimeSeconds(
          pattern[source.order + offset],
          pattern[source.order + offset + 1],
          parameters,
          options,
        ) ?? 1,
    );
    const totalWeight = weights.reduce((total, value) => total + value, 0);
    let elapsedWeight = 0;

    for (let order = source.order + 1; order < target.order; order += 1) {
      elapsedWeight += weights[order - source.order - 1];
      addSynthetic(
        order,
        startsAt + ((endsAt - startsAt) * elapsedWeight) / totalWeight,
      );
    }
  }

  const first = validObserved[0];
  let backwardTime =
    getArrivalAt(first, parameters.dwell.useRealtimeTimes) ??
    getDepartureAt(first, parameters.dwell.useRealtimeTimes);

  for (
    let order = first.order - 1;
    order >= 0 && backwardTime !== undefined;
    order -= 1
  ) {
    const runtimeSeconds = estimateSegmentRuntimeSeconds(
      pattern[order],
      pattern[order + 1],
      parameters,
      options,
    );

    if (runtimeSeconds === undefined) {
      break;
    }

    backwardTime -= runtimeSeconds * 1_000;
    addSynthetic(order, backwardTime);
  }

  const last = validObserved.at(-1)!;
  let forwardTime =
    getDepartureAt(last, parameters.dwell.useRealtimeTimes) ??
    getArrivalAt(last, parameters.dwell.useRealtimeTimes);

  for (
    let order = last.order + 1;
    order < pattern.length && forwardTime !== undefined;
    order += 1
  ) {
    const runtimeSeconds = estimateSegmentRuntimeSeconds(
      pattern[order - 1],
      pattern[order],
      parameters,
      options,
    );

    if (runtimeSeconds === undefined) {
      break;
    }

    forwardTime += runtimeSeconds * 1_000;
    addSynthetic(order, forwardTime);
  }

  return [...validObserved, ...synthetic.values()].sort(
    (left, right) => left.order - right.order,
  );
}

function estimateSegmentRuntimeSeconds(
  sourceStationId: string | undefined,
  targetStationId: string | undefined,
  parameters: TransportPositionParameterSettings,
  options: JourneyPositionProjectionOptions,
): number | undefined {
  if (!sourceStationId || !targetStationId) {
    return undefined;
  }

  const lineProfileSegment = resolveTransportPositionLineProfileSegment(
    options.lineProfile,
    sourceStationId,
    targetStationId,
  );

  if (
    parameters.metro13Profile.enabled &&
    parameters.metro13Profile.useScheduledRuntimes &&
    lineProfileSegment?.runtimeSeconds
  ) {
    return lineProfileSegment.runtimeSeconds;
  }

  if (!parameters.speed.enabled || parameters.speed.commercialKph <= 0) {
    return undefined;
  }

  const metric = selectSegmentMetric(
    sourceStationId,
    targetStationId,
    options.segmentMetrics ?? [],
    parameters,
    lineProfileSegment,
  );

  return metric
    ? (metric.distanceMeters / parameters.speed.commercialKph) * 3.6
    : undefined;
}

function hasUsableJourneyCalls(
  journey: TransitVehicleJourneyEstimate,
): boolean {
  return getUsableCalls(journey.calls).length >= 2;
}

function getArrivalAt(
  call: TransitVehicleCallEstimate,
  useRealtimeTimes = true,
): number | undefined {
  return useRealtimeTimes
    ? parseTimestamp(call.arrivalAt) ?? parseTimestamp(call.aimedArrivalAt)
    : parseTimestamp(call.aimedArrivalAt) ?? parseTimestamp(call.arrivalAt);
}

function getDepartureAt(
  call: TransitVehicleCallEstimate,
  useRealtimeTimes = true,
): number | undefined {
  return useRealtimeTimes
    ? parseTimestamp(call.departureAt) ?? parseTimestamp(call.aimedDepartureAt)
    : parseTimestamp(call.aimedDepartureAt) ?? parseTimestamp(call.departureAt);
}

function getFallbackDwellWindow(
  arrivalAt: number | undefined,
  departureAt: number | undefined,
  fallbackSeconds: number,
): { startsAt: number; endsAt: number } | undefined {
  const durationMs = Math.max(0, fallbackSeconds) * 1_000;

  if (arrivalAt !== undefined && departureAt === undefined) {
    return { startsAt: arrivalAt, endsAt: arrivalAt + durationMs };
  }

  if (departureAt !== undefined && arrivalAt === undefined) {
    return { startsAt: departureAt - durationMs, endsAt: departureAt };
  }

  return undefined;
}

function selectSegmentMetric(
  sourceStationId: string,
  targetStationId: string,
  metrics: TransitVehicleSegmentMetric[],
  parameters: TransportPositionParameterSettings,
  lineProfileSegment?: ResolvedTransportPositionLineProfileSegment,
): TransitVehicleSegmentMetric | undefined {
  if (!parameters.trackDistance.enabled) {
    return undefined;
  }

  if (
    parameters.metro13Profile.enabled &&
    parameters.metro13Profile.useProfileTrackDistances &&
    lineProfileSegment?.distanceMeters
  ) {
    return {
      id: `line-profile:${lineProfileSegment.profileId}:${sourceStationId}:${targetStationId}`,
      sourceStationId,
      targetStationId,
      distanceMeters: lineProfileSegment.distanceMeters,
      fallbackDistanceMeters: lineProfileSegment.distanceMeters,
      distanceSource: "line_profile_gtfs",
    };
  }

  const metric = metrics.find(
    (candidate) =>
      (candidate.sourceStationId === sourceStationId &&
        candidate.targetStationId === targetStationId) ||
      (candidate.sourceStationId === targetStationId &&
        candidate.targetStationId === sourceStationId),
  );

  if (!metric) {
    return undefined;
  }

  const gtfsUsable =
    metric.distanceSource === "gtfs_shape" &&
    (metric.projectionErrorMeters ?? 0) <=
      parameters.trackDistance.maxProjectionErrorMeters;

  if (parameters.trackDistance.source === "gtfs" && !gtfsUsable) {
    return undefined;
  }

  if (
    parameters.trackDistance.source === "geodesic" ||
    (parameters.trackDistance.source === "auto" && !gtfsUsable)
  ) {
    return {
      ...metric,
      distanceMeters: metric.fallbackDistanceMeters,
      distanceSource: "geodesic_fallback",
    };
  }

  return metric;
}

function applyMovementParameters(
  linearProgress: number,
  distanceMeters: number | undefined,
  durationSeconds: number,
  parameters: TransportPositionParameterSettings,
): number {
  const linear = clamp01(linearProgress);

  if (!parameters.acceleration.enabled || parameters.acceleration.curve === "linear") {
    return linear;
  }

  const distanceRatio = distanceMeters
    ? clamp01(distanceMeters / parameters.speed.longSegmentMeters)
    : 0;
  const accelerationShare = clamp01(
    parameters.acceleration.accelerationShare * (1 - distanceRatio * 0.55),
  );
  const curved = parameters.acceleration.curve === "trapezoidal"
    ? trapezoidalProgress(linear, accelerationShare)
    : minimumJerk(linear);

  if (!parameters.speed.enabled || !distanceMeters || durationSeconds <= 0) {
    return curved;
  }

  const averageSpeedKph = (distanceMeters / durationSeconds) * 3.6;
  const plausibility = Math.min(
    1,
    parameters.speed.maxPlausibleKph / Math.max(1, averageSpeedKph),
  );
  const blend = clamp01(
    parameters.speed.smoothing * (0.35 + distanceRatio * 0.65) * plausibility,
  );
  return lerp(linear, curved, blend);
}

export function trapezoidalProgress(
  progress: number,
  accelerationShare: number,
): number {
  const t = clamp01(progress);
  const share = Math.min(0.49, Math.max(0.001, accelerationShare));
  const plateauVelocity = 1 / (1 - share);

  if (t < share) {
    return 0.5 * (plateauVelocity / share) * t * t;
  }

  if (t > 1 - share) {
    const remaining = 1 - t;
    return 1 - 0.5 * (plateauVelocity / share) * remaining * remaining;
  }

  return plateauVelocity * (t - share / 2);
}

function getActiveMovementParameterIds(
  parameters: TransportPositionParameterSettings,
  metric: TransitVehicleSegmentMetric | undefined,
  lineProfileSegment?: ResolvedTransportPositionLineProfileSegment,
): string[] {
  return [
    metric && "trackDistance",
    metric &&
      parameters.speed.enabled &&
      !(
        parameters.metro13Profile.enabled &&
        parameters.metro13Profile.useScheduledRuntimes &&
        lineProfileSegment?.runtimeSeconds
      ) &&
      "speed",
    parameters.acceleration.enabled && "acceleration",
    parameters.metro13Profile.enabled && lineProfileSegment && "metro13Profile",
  ].filter((value): value is string => Boolean(value));
}

function parseTimestamp(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function getPartialSnapshotRetentionMs(pollAfterMs: number): number {
  const normalizedPollAfterMs =
    Number.isFinite(pollAfterMs) && pollAfterMs > 0 ? pollAfterMs : 60_000;

  return normalizedPollAfterMs * 2;
}

function isSameEdge(
  left: JourneyPositionProjection,
  right: JourneyPositionProjection,
): boolean {
  return (
    left.sourceStationId === right.sourceStationId &&
    left.targetStationId === right.targetStationId
  );
}

function makeUniqueTrackId(
  preferredTrackId: string,
  existingTracks: Map<string, Track>,
): string {
  if (!existingTracks.has(preferredTrackId)) {
    return preferredTrackId;
  }

  let suffix = 2;

  while (existingTracks.has(`${preferredTrackId}:${suffix}`)) {
    suffix += 1;
  }

  return `${preferredTrackId}:${suffix}`;
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
