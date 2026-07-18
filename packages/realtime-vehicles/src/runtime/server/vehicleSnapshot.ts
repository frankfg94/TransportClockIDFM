import type {
  TransitVehicleCallEstimate,
  TransitVehicleJourneyEstimate,
  TransitVehicleSnapshot,
  TransitVehicleSnapshotDiagnostics,
  TransportSnapshotUnavailableReason,
} from "../client/transportPositions";
import {
  createIdfmStopReferenceKeys,
  fetchIdfmMarketplaceWithRetry,
  IDFM_MARKETPLACE_BASE_URL,
  type NetexLineCache,
  type NetexPattern,
} from "#transport-clock/plugin-server";
import type {
  IdfmLineStopPoint,
  IdfmLineStopPointResult,
} from "./lineStopPoints";
import {
  clearIdfmLineStopPointCache,
  loadIdfmLineStopPoints,
} from "./lineStopPoints";

export const REALTIME_VEHICLE_POLL_AFTER_MS = 60_000;

const SNAPSHOT_CACHE_TTL_MS = 60_000;
const MAX_RESPONSE_AGE_MS = 3 * REALTIME_VEHICLE_POLL_AFTER_MS;
const MAX_INTERSTATION_DURATION_MS = 45 * 60_000;

type JsonRecord = Record<string, unknown>;

interface RealtimeTopologyPattern {
  destination?: string;
  direction?: string;
  id: string;
  serviceCount: number;
  stops: string[];
}

interface RealtimeTopologyIndex {
  lineId: string;
  lineRef: string;
  navitiaStopPointAliasSourceAvailable?: boolean;
  navitiaStopPointCount: number;
  patterns: RealtimeTopologyPattern[];
  resolvedStopPointAliasCount: number;
  resolveStationRef: (value: unknown) => string | undefined;
}

interface RawVehicleCall extends TransitVehicleCallEstimate {
  effectiveTimeMs?: number;
  upstreamOrder?: number;
}

interface RawVehicleJourney {
  calls: RawVehicleCall[];
  cancelled: boolean;
  destination?: string;
  destinationStationId?: string;
  directionRef?: string;
  journeyRef?: string;
  serviceDate?: string;
}

interface RawVehicleJourneyParseResult {
  journeys: RawVehicleJourney[];
  estimatedJourneyCount: number;
  estimatedLineJourneyCount: number;
  monitoredVisitCount?: number;
  monitoredLineVisitCount?: number;
}

interface PatternMatch {
  pattern: RealtimeTopologyPattern;
  score: number;
}

interface InferenceObservation {
  call: RawVehicleCall;
  id: string;
  serviceDate?: string;
  timeMs: number;
}

interface InferencePool {
  destination?: string;
  directionRef?: string;
  observations: InferenceObservation[];
  pattern: RealtimeTopologyPattern;
}

interface SnapshotCacheEntry {
  expiresAt: number;
  snapshot: TransitVehicleSnapshot;
}

interface GlobalPayloadCacheEntry {
  expiresAt: number;
  payload: unknown;
}

export interface RealtimeVehicleSnapshotOptions {
  apiKey: string;
  cacheTtlMs?: number;
  fetchImpl?: typeof fetch;
  lineCache: NetexLineCache;
  now?: Date;
}

export interface BuildRealtimeVehicleSnapshotOptions {
  now?: Date;
}

export class RealtimeVehicleUpstreamError extends Error {
  readonly retryAfter?: string;
  readonly statusCode: number;
  readonly upstreamStatus: number;

  constructor(response: Response) {
    const statusCode =
      response.status === 429
        ? 429
        : response.status >= 500
          ? 503
          : 502;

    super(`IDFM Estimated Timetable request failed (${response.status}).`);
    this.name = "RealtimeVehicleUpstreamError";
    this.retryAfter = response.headers.get("retry-after") ?? undefined;
    this.statusCode = statusCode;
    this.upstreamStatus = response.status;
  }
}

const snapshotCache = new Map<string, SnapshotCacheEntry>();
const inFlightSnapshots = new Map<string, Promise<TransitVehicleSnapshot>>();
let globalPayloadCache: GlobalPayloadCacheEntry | undefined;
let inFlightGlobalPayload: Promise<unknown> | undefined;

export function isGuidedRealtimeMode(value: string | null | undefined): boolean {
  return isGuidedRealtimeTransportType(value);
}

export function isGuidedRealtimeTransportType(
  value: string | null | undefined,
): boolean {
  return [
    "cable",
    "cableway",
    "funicular",
    "metro",
    "rail",
    "rer",
    "train",
    "tram",
    "tramway",
    "transilien",
  ].includes(normalizeMode(value));
}

export function clearRealtimeVehicleSnapshotCache(): void {
  snapshotCache.clear();
  inFlightSnapshots.clear();
  globalPayloadCache = undefined;
  inFlightGlobalPayload = undefined;
  clearIdfmLineStopPointCache();
}

export function createUnavailableVehicleSnapshot(
  lineId: string,
  reason: TransportSnapshotUnavailableReason,
  now = new Date(),
  complete = true,
  diagnostics?: TransitVehicleSnapshotDiagnostics,
): TransitVehicleSnapshot {
  return {
    available: false,
    reason,
    lineId,
    source: "idfm-siri-estimated-timetable",
    positionKind: "estimated",
    generatedAt: now.toISOString(),
    complete,
    pollAfterMs: REALTIME_VEHICLE_POLL_AFTER_MS,
    journeys: [],
    ...(diagnostics ? { diagnostics } : {}),
  };
}

export async function getRealtimeVehicleSnapshot(
  options: RealtimeVehicleSnapshotOptions,
): Promise<TransitVehicleSnapshot> {
  const now = options.now ?? new Date();
  const topology = createRealtimeTopologyIndex(options.lineCache);

  if (!isGuidedRealtimeMode(resolveCacheMode(options.lineCache))) {
    return createUnavailableVehicleSnapshot(
      topology?.lineId ?? resolveCanonicalLineId(options.lineCache) ?? "unknown",
      "unsupported_mode",
      now,
      true,
      createTopologyDiagnostics(options.lineCache, "supported_guided_transport_mode"),
    );
  }

  if (!topology) {
    const lineId = resolveCanonicalLineId(options.lineCache) ?? "unknown";
    const reason = resolvePrimLineCode(options.lineCache)
      ? "missing_topology"
      : "missing_line_ref";

    return createUnavailableVehicleSnapshot(
      lineId,
      reason,
      now,
      true,
      createTopologyDiagnostics(
        options.lineCache,
        reason === "missing_line_ref"
          ? "prim_line_ref"
          : "mapped_topology_patterns",
      ),
    );
  }

  const nowMs = now.getTime();
  const cached = snapshotCache.get(topology.lineRef);

  if (cached && cached.expiresAt > nowMs) {
    return cached.snapshot;
  }

  const inFlight = inFlightSnapshots.get(topology.lineRef);

  if (inFlight) {
    return inFlight;
  }

  const request = loadGlobalRealtimePayload(options, nowMs).then((payload) =>
    buildSnapshotWithStopPointAliases(payload, topology, options, now, nowMs),
  );
  inFlightSnapshots.set(topology.lineRef, request);

  try {
    const snapshot = await request;
    const ttl = options.cacheTtlMs ?? SNAPSHOT_CACHE_TTL_MS;

    if (ttl > 0) {
      snapshotCache.set(topology.lineRef, {
        expiresAt: nowMs + ttl,
        snapshot,
      });
    }

    return snapshot;
  } finally {
    if (inFlightSnapshots.get(topology.lineRef) === request) {
      inFlightSnapshots.delete(topology.lineRef);
    }
  }
}

export function buildRealtimeVehicleSnapshot(
  payload: unknown,
  lineCache: NetexLineCache,
  options: BuildRealtimeVehicleSnapshotOptions = {},
): TransitVehicleSnapshot {
  const now = options.now ?? new Date();
  const topology = createRealtimeTopologyIndex(lineCache);

  if (!isGuidedRealtimeMode(resolveCacheMode(lineCache))) {
    return createUnavailableVehicleSnapshot(
      topology?.lineId ?? resolveCanonicalLineId(lineCache) ?? "unknown",
      "unsupported_mode",
      now,
      true,
      createTopologyDiagnostics(lineCache, "supported_guided_transport_mode"),
    );
  }

  if (!topology) {
    const lineId = resolveCanonicalLineId(lineCache) ?? "unknown";
    const reason = resolvePrimLineCode(lineCache)
      ? "missing_topology"
      : "missing_line_ref";

    return createUnavailableVehicleSnapshot(
      lineId,
      reason,
      now,
      true,
      createTopologyDiagnostics(
        lineCache,
        reason === "missing_line_ref"
          ? "prim_line_ref"
          : "mapped_topology_patterns",
      ),
    );
  }

  return buildSnapshotFromPayload(payload, topology, now);
}

async function loadGlobalRealtimePayload(
  options: RealtimeVehicleSnapshotOptions,
  nowMs: number,
): Promise<unknown> {
  if (globalPayloadCache && globalPayloadCache.expiresAt > nowMs) {
    return globalPayloadCache.payload;
  }

  if (inFlightGlobalPayload) {
    return inFlightGlobalPayload;
  }

  const request = fetchGlobalRealtimePayload(options);
  inFlightGlobalPayload = request;

  try {
    const payload = await request;
    const ttl = options.cacheTtlMs ?? SNAPSHOT_CACHE_TTL_MS;

    if (ttl > 0) {
      globalPayloadCache = {
        expiresAt: nowMs + ttl,
        payload,
      };
    }

    return payload;
  } finally {
    if (inFlightGlobalPayload === request) {
      inFlightGlobalPayload = undefined;
    }
  }
}

async function buildSnapshotWithStopPointAliases(
  payload: unknown,
  topology: RealtimeTopologyIndex,
  options: RealtimeVehicleSnapshotOptions,
  now: Date,
  nowMs: number,
): Promise<TransitVehicleSnapshot> {
  const initialSnapshot = buildSnapshotFromPayload(payload, topology, now);

  if (
    initialSnapshot.available ||
    !initialSnapshot.diagnostics?.missing.includes(
      "mapped_station_calls_or_valid_times",
    )
  ) {
    return initialSnapshot;
  }

  const lineStopPoints = await loadIdfmLineStopPoints({
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
    lineId: topology.lineId,
    nowMs,
  });
  const enrichedTopology = createRealtimeTopologyIndex(
    options.lineCache,
    lineStopPoints,
  );

  return enrichedTopology
    ? buildSnapshotFromPayload(payload, enrichedTopology, now)
    : initialSnapshot;
}

async function fetchGlobalRealtimePayload(
  options: RealtimeVehicleSnapshotOptions,
): Promise<unknown> {
  const upstreamUrl = new URL(
    `${IDFM_MARKETPLACE_BASE_URL}/estimated-timetable`,
  );
  upstreamUrl.searchParams.set("LineRef", "ALL");

  const response = await fetchIdfmMarketplaceWithRetry(
    upstreamUrl,
    {
      headers: {
        Accept: "application/json",
        apikey: options.apiKey,
      },
      method: "GET",
      redirect: "follow",
    },
    {
      fetchImpl: options.fetchImpl,
      retryDelaysMs: [],
    },
  );

  if (!response.ok) {
    throw new RealtimeVehicleUpstreamError(response);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch (cause) {
    const error = new Error("IDFM Estimated Timetable returned invalid JSON.", {
      cause,
    });

    Object.assign(error, { statusCode: 502 });
    throw error;
  }

  return payload;
}

function buildSnapshotFromPayload(
  payload: unknown,
  topology: RealtimeTopologyIndex,
  now: Date,
): TransitVehicleSnapshot {
  const serviceDelivery = getNestedRecord(payload, "Siri", "ServiceDelivery");
  const deliveries = asArray(serviceDelivery?.EstimatedTimetableDelivery).filter(
    isRecord,
  );
  const responseTimestamp = firstIsoValue(
    serviceDelivery?.ResponseTimestamp,
    getNestedValue(payload, "Siri", "ServiceDelivery", "ResponseTimestamp"),
  );
  const generatedAt = responseTimestamp ?? now.toISOString();
  const complete = isPayloadComplete(
    serviceDelivery,
    deliveries,
    generatedAt,
    now,
  );
  const rawJourneyResult = parseRawVehicleJourneys(
    payload,
    serviceDelivery,
    deliveries,
    topology,
  );
  const journeys = reconstructJourneys(rawJourneyResult.journeys, topology);
  const diagnostics = createPayloadDiagnostics({
    complete,
    deliveryCount: deliveries.length,
    journeys,
    rawJourneyResult,
    responseTimestamp,
    serviceDelivery,
    topology,
  });

  if (journeys.length === 0) {
    return createUnavailableVehicleSnapshot(
      topology.lineId,
      "no_data",
      new Date(generatedAt),
      complete,
      diagnostics,
    );
  }

  return {
    available: true,
    lineId: topology.lineId,
    source: "idfm-siri-estimated-timetable",
    positionKind: "estimated",
    generatedAt,
    complete,
    pollAfterMs: REALTIME_VEHICLE_POLL_AFTER_MS,
    journeys,
    diagnostics,
  };
}

function createPayloadDiagnostics({
  complete,
  deliveryCount,
  journeys,
  rawJourneyResult,
  responseTimestamp,
  serviceDelivery,
  topology,
}: {
  complete: boolean;
  deliveryCount: number;
  journeys: TransitVehicleJourneyEstimate[];
  rawJourneyResult: RawVehicleJourneyParseResult;
  responseTimestamp?: string;
  serviceDelivery?: JsonRecord;
  topology: RealtimeTopologyIndex;
}): TransitVehicleSnapshotDiagnostics {
  const missing: string[] = [];
  const monitoredVisitCount = rawJourneyResult.monitoredVisitCount ?? 0;
  const monitoredLineVisitCount =
    rawJourneyResult.monitoredLineVisitCount ?? 0;
  const upstreamRecordCount =
    rawJourneyResult.estimatedJourneyCount + monitoredVisitCount;
  const upstreamLineRecordCount =
    rawJourneyResult.estimatedLineJourneyCount + monitoredLineVisitCount;

  if (!serviceDelivery) {
    missing.push("siri_service_delivery");
  }

  if (!responseTimestamp) {
    missing.push("response_timestamp");
  }

  if (upstreamRecordCount === 0) {
    missing.push("upstream_vehicle_records");
  } else if (upstreamLineRecordCount === 0) {
    missing.push("upstream_line_records");
  }

  if (
    upstreamLineRecordCount > 0 &&
    rawJourneyResult.journeys.length === 0
  ) {
    missing.push("mapped_station_calls_or_valid_times");
  }

  if (rawJourneyResult.journeys.length > 0 && journeys.length === 0) {
    missing.push("reconstructable_journeys");
  }

  return {
    stage:
      upstreamRecordCount === 0 || upstreamLineRecordCount === 0
        ? "upstream"
        : "reconstruction",
    missing,
    lineRef: topology.lineRef,
    topologyPatternCount: topology.patterns.length,
    deliveryCount,
    estimatedJourneyCount: rawJourneyResult.estimatedJourneyCount,
    estimatedLineJourneyCount: rawJourneyResult.estimatedLineJourneyCount,
    monitoredVisitCount,
    monitoredLineVisitCount,
    mappedRawJourneyCount: rawJourneyResult.journeys.length,
    navitiaStopPointAliasSourceAvailable:
      topology.navitiaStopPointAliasSourceAvailable,
    navitiaStopPointCount: topology.navitiaStopPointCount,
    resolvedStopPointAliasCount: topology.resolvedStopPointAliasCount,
    reconstructedJourneyCount: journeys.length,
    responseTimestampPresent: Boolean(responseTimestamp),
    payloadComplete: complete,
  };
}

function createRealtimeTopologyIndex(
  cache: NetexLineCache,
  lineStopPoints?: IdfmLineStopPointResult,
): RealtimeTopologyIndex | undefined {
  const code = resolvePrimLineCode(cache);

  if (!code) {
    return undefined;
  }

  const bindingByKey = new Map<string, string | null>();

  for (const node of cache.schematic.nodes) {
    bindStationReference(bindingByKey, node.id, node.id);

    for (const rawRef of node.rawRefs ?? []) {
      bindStationReference(bindingByKey, rawRef, node.id);
    }
  }

  for (const station of cache.stations ?? []) {
    const candidates = [station.id, ...(station.rawRefs ?? [])]
      .flatMap(referenceKeys)
      .map((key) => bindingByKey.get(key))
      .filter((value): value is string => typeof value === "string");
    const stationId = uniqueValue(candidates);

    if (!stationId) {
      continue;
    }

    bindStationReference(bindingByKey, station.id, stationId);

    for (const rawRef of station.rawRefs ?? []) {
      bindStationReference(bindingByKey, rawRef, stationId);
    }
  }

  const resolvedStopPointAliasCount = bindLineStopPointReferences(
    bindingByKey,
    cache.schematic.nodes,
    lineStopPoints?.stopPoints ?? [],
  );

  const resolveStationRef = (value: unknown): string | undefined => {
    const candidates = referenceKeys(textValue(value))
      .map((key) => bindingByKey.get(key))
      .filter((candidate): candidate is string => typeof candidate === "string");

    return uniqueValue(candidates);
  };
  const patterns = (cache.patterns ?? [])
    .map((pattern) => normalizeTopologyPattern(pattern, resolveStationRef))
    .filter((pattern): pattern is RealtimeTopologyPattern => Boolean(pattern));

  if (patterns.length === 0 || bindingByKey.size === 0) {
    return undefined;
  }

  return {
    lineId: `line:IDFM:${code}`,
    lineRef: `STIF:Line::${code}:`,
    navitiaStopPointAliasSourceAvailable: lineStopPoints?.available,
    navitiaStopPointCount: lineStopPoints?.stopPoints.length ?? 0,
    patterns,
    resolvedStopPointAliasCount,
    resolveStationRef,
  };
}

function bindLineStopPointReferences(
  bindings: Map<string, string | null>,
  nodes: NetexLineCache["schematic"]["nodes"],
  stopPoints: IdfmLineStopPoint[],
): number {
  const stationByName = new Map<string, string | null>();

  for (const node of nodes) {
    const key = normalizeText(node.name);

    if (!key) {
      continue;
    }

    const current = stationByName.get(key);
    stationByName.set(
      key,
      current === undefined || current === node.id ? node.id : null,
    );
  }

  let resolvedCount = 0;

  for (const stopPoint of stopPoints) {
    const referenceCandidates = stopPoint.references
      .flatMap(referenceKeys)
      .map((key) => bindings.get(key))
      .filter((value): value is string => typeof value === "string");
    const stationId =
      uniqueValue(referenceCandidates) ??
      stationByName.get(normalizeText(stopPoint.name)) ??
      undefined;

    if (!stationId) {
      continue;
    }

    resolvedCount += 1;
    bindStationReference(bindings, stopPoint.id, stationId);

    for (const reference of stopPoint.references) {
      bindStationReference(bindings, reference, stationId);
    }
  }

  return resolvedCount;
}

function normalizeTopologyPattern(
  pattern: NetexPattern,
  resolveStationRef: (value: unknown) => string | undefined,
): RealtimeTopologyPattern | undefined {
  const stops = dedupeConsecutive(
    (pattern.stopIds ?? pattern.stops?.map((stop) => stop.id) ?? [])
      .map(resolveStationRef)
      .filter((stationId): stationId is string => Boolean(stationId)),
  );

  if (stops.length < 2) {
    return undefined;
  }

  return {
    id: pattern.id,
    destination: cleanText(pattern.destination),
    direction: cleanText(pattern.direction),
    serviceCount: pattern.serviceCount ?? 0,
    stops,
  };
}

function resolvePrimLineCode(cache: NetexLineCache): string | undefined {
  const primLineId =
    cache.line.primLineId ?? cache.schematic.line.primLineId ?? undefined;

  return primLineId?.match(/^line:IDFM:(C\d{5})$/iu)?.[1].toUpperCase();
}

function resolveCanonicalLineId(cache: NetexLineCache): string | undefined {
  const code = resolvePrimLineCode(cache);

  return code ? `line:IDFM:${code}` : undefined;
}

function resolveCacheMode(cache: NetexLineCache): string | null | undefined {
  return cache.line.transportMode ?? cache.schematic.line.transportMode;
}

function createTopologyDiagnostics(
  cache: NetexLineCache,
  missing: string,
): TransitVehicleSnapshotDiagnostics {
  const code = resolvePrimLineCode(cache);

  return {
    stage: "topology",
    missing: [missing],
    ...(code ? { lineRef: `STIF:Line::${code}:` } : {}),
    cacheTransportMode: cleanText(resolveCacheMode(cache)) ?? "unknown",
    topologyNodeCount: cache.schematic.nodes.length,
    topologyPatternCount: cache.patterns?.length ?? 0,
  };
}

function bindStationReference(
  bindings: Map<string, string | null>,
  reference: string,
  stationId: string,
): void {
  for (const key of referenceKeys(reference)) {
    const current = bindings.get(key);

    if (current === undefined) {
      bindings.set(key, stationId);
    } else if (current !== stationId) {
      bindings.set(key, null);
    }
  }
}

function referenceKeys(value: string | undefined): string[] {
  return createIdfmStopReferenceKeys(value);
}

function parseRawVehicleJourneys(
  payload: unknown,
  serviceDelivery: JsonRecord | undefined,
  deliveries: JsonRecord[],
  topology: RealtimeTopologyIndex,
): RawVehicleJourneyParseResult {
  const roots: unknown[] = deliveries.length > 0 ? deliveries : [serviceDelivery ?? payload];
  const estimatedJourneys = roots.flatMap((root) =>
    collectNamedRecords(root, "EstimatedVehicleJourney"),
  );
  const estimatedLineJourneys = estimatedJourneys.filter((journey) =>
    hasCompatibleLineRef(journey.LineRef, topology),
  );
  const parsed = estimatedLineJourneys
    .map((journey) => parseEstimatedVehicleJourney(journey, topology))
    .filter((journey): journey is RawVehicleJourney => Boolean(journey));

  if (parsed.length > 0) {
    return {
      journeys: parsed,
      estimatedJourneyCount: estimatedJourneys.length,
      estimatedLineJourneyCount: estimatedLineJourneys.length,
    };
  }

  const monitoredVisits = roots.flatMap((root) =>
    collectNamedRecords(root, "MonitoredStopVisit"),
  );
  const monitoredLineVisits = monitoredVisits.filter((visit) => {
    const journey = asRecord(visit.MonitoredVehicleJourney);
    return Boolean(journey && hasCompatibleLineRef(journey.LineRef, topology));
  });
  const monitoredJourneys = monitoredLineVisits
    .map((visit) => parseMonitoredStopVisit(visit, topology))
    .filter((journey): journey is RawVehicleJourney => Boolean(journey));

  return {
    journeys: monitoredJourneys,
    estimatedJourneyCount: estimatedJourneys.length,
    estimatedLineJourneyCount: estimatedLineJourneys.length,
    monitoredVisitCount: monitoredVisits.length,
    monitoredLineVisitCount: monitoredLineVisits.length,
  };
}

function parseEstimatedVehicleJourney(
  journey: JsonRecord,
  topology: RealtimeTopologyIndex,
): RawVehicleJourney | undefined {
  const lineRef = textValue(journey.LineRef);

  if (!hasCompatibleLineRef(lineRef, topology)) {
    return undefined;
  }

  const framedRef = asRecord(journey.FramedVehicleJourneyRef);
  const calls = collectNamedRecords(journey, "EstimatedCall")
    .map((call) => parseVehicleCall(call, undefined, topology))
    .filter((call): call is RawVehicleCall => Boolean(call));

  if (calls.length === 0) {
    return undefined;
  }

  const journeyRef = cleanText(
    textValue(framedRef?.DatedVehicleJourneyRef) ??
      textValue(journey.DatedVehicleJourneyRef),
  );
  const destinationRef = textValue(journey.DestinationRef);

  return {
    calls,
    cancelled: isCancelled(journey),
    destination: firstText(journey.DestinationName, journey.DestinationDisplay),
    destinationStationId: topology.resolveStationRef(destinationRef),
    directionRef:
      cleanText(textValue(journey.DirectionRef)) ??
      firstText(journey.DirectionName),
    journeyRef,
    serviceDate: extractServiceDate(
      textValue(framedRef?.DataFrameRef),
      journeyRef,
    ),
  };
}

function parseMonitoredStopVisit(
  visit: JsonRecord,
  topology: RealtimeTopologyIndex,
): RawVehicleJourney | undefined {
  const journey = asRecord(visit.MonitoredVehicleJourney);

  if (!journey) {
    return undefined;
  }

  const lineRef = textValue(journey.LineRef);

  if (!hasCompatibleLineRef(lineRef, topology)) {
    return undefined;
  }

  const monitoredCall = asRecord(journey.MonitoredCall);
  const call = monitoredCall
    ? parseVehicleCall(monitoredCall, visit.MonitoringRef, topology)
    : undefined;

  if (!call) {
    return undefined;
  }

  const framedRef = asRecord(journey.FramedVehicleJourneyRef);
  const journeyRef = cleanText(textValue(framedRef?.DatedVehicleJourneyRef));
  const destinationRef = textValue(journey.DestinationRef);

  return {
    calls: [call],
    cancelled: isCancelled(journey),
    destination: firstText(journey.DestinationName, journey.DestinationDisplay),
    destinationStationId: topology.resolveStationRef(destinationRef),
    directionRef:
      cleanText(textValue(journey.DirectionRef)) ??
      firstText(journey.DirectionName),
    journeyRef,
    serviceDate: extractServiceDate(
      textValue(framedRef?.DataFrameRef),
      journeyRef,
    ),
  };
}

function hasCompatibleLineRef(
  value: unknown,
  topology: RealtimeTopologyIndex,
): boolean {
  const lineRef = textValue(value);

  return (
    !lineRef ||
    normalizeReference(lineRef) === normalizeReference(topology.lineRef)
  );
}

function parseVehicleCall(
  call: JsonRecord,
  fallbackStopRef: unknown,
  topology: RealtimeTopologyIndex,
): RawVehicleCall | undefined {
  const stationId = topology.resolveStationRef(
    call.StopPointRef ?? call.StopPointId ?? fallbackStopRef,
  );

  if (!stationId) {
    return undefined;
  }

  const recordedArrival = firstIsoValue(
    call.ActualArrivalTime,
    call.RecordedArrivalTime,
  );
  const recordedDeparture = firstIsoValue(
    call.ActualDepartureTime,
    call.RecordedDepartureTime,
  );
  const expectedArrival = firstIsoValue(call.ExpectedArrivalTime);
  const expectedDeparture = firstIsoValue(call.ExpectedDepartureTime);
  const aimedArrivalAt = firstIsoValue(call.AimedArrivalTime);
  const aimedDepartureAt = firstIsoValue(call.AimedDepartureTime);
  const arrivalAt = recordedArrival ?? expectedArrival ?? aimedArrivalAt;
  const departureAt = recordedDeparture ?? expectedDeparture ?? aimedDepartureAt;
  const timeQuality =
    recordedArrival || recordedDeparture
      ? "recorded"
      : expectedArrival || expectedDeparture
        ? "estimated"
        : "aimed";
  const arrivalStatus = cleanText(textValue(call.ArrivalStatus));
  const departureStatus = cleanText(textValue(call.DepartureStatus));
  const upstreamOrder = finiteNumber(call.Order ?? call.VisitNumber);
  const effectiveTimeMs = timeMilliseconds(
    arrivalAt ?? departureAt ?? aimedArrivalAt ?? aimedDepartureAt,
  );

  if (effectiveTimeMs === undefined) {
    return undefined;
  }

  return {
    stationId,
    order: upstreamOrder ?? 0,
    ...(arrivalAt ? { arrivalAt } : {}),
    ...(departureAt ? { departureAt } : {}),
    ...(aimedArrivalAt ? { aimedArrivalAt } : {}),
    ...(aimedDepartureAt ? { aimedDepartureAt } : {}),
    timeQuality,
    vehicleAtStop:
      booleanValue(call.VehicleAtStop) ??
      normalizeMode(arrivalStatus) === "arrived",
    cancelled:
      isCancelled(call) ||
      [arrivalStatus, departureStatus].some(
        (status) => normalizeMode(status) === "cancelled",
      ),
    effectiveTimeMs,
    upstreamOrder,
  };
}

function reconstructJourneys(
  rawJourneys: RawVehicleJourney[],
  topology: RealtimeTopologyIndex,
): TransitVehicleJourneyEstimate[] {
  const groupedByReference = new Map<string, RawVehicleJourney[]>();
  const anonymous: RawVehicleJourney[] = [];

  for (const journey of rawJourneys) {
    if (!journey.journeyRef) {
      anonymous.push(journey);
      continue;
    }

    const key = `${journey.serviceDate ?? "unknown"}:${journey.journeyRef}`;
    groupedByReference.set(key, [
      ...(groupedByReference.get(key) ?? []),
      journey,
    ]);
  }

  const result: TransitVehicleJourneyEstimate[] = [];
  const needsInference: RawVehicleJourney[] = [];

  for (const group of groupedByReference.values()) {
    if (group.length === 1) {
      const direct = createDirectJourney(group[0], topology, "reliable");

      if (direct) {
        result.push(direct);
        continue;
      }
    }

    needsInference.push(...group);
  }

  for (const journey of anonymous) {
    const direct = createDirectJourney(journey, topology, "inferred");

    if (direct) {
      result.push(direct);
    } else {
      needsInference.push(journey);
    }
  }

  result.push(...inferCollidingJourneys(needsInference, topology));

  return result
    .filter((journey) => journey.confidence !== "low")
    .sort((left, right) => {
      const leftTime = firstJourneyTime(left);
      const rightTime = firstJourneyTime(right);

      return leftTime - rightTime || left.snapshotId.localeCompare(right.snapshotId);
    });
}

function createDirectJourney(
  journey: RawVehicleJourney,
  topology: RealtimeTopologyIndex,
  identityQuality: "reliable" | "inferred",
): TransitVehicleJourneyEstimate | undefined {
  if (journey.cancelled) {
    return undefined;
  }

  const match = findPatternMatch(journey, topology.patterns, 2);

  if (!match) {
    return undefined;
  }

  const calls = normalizeCallsForPattern(journey.calls, match.pattern);
  const activeCalls = calls.filter((call) => !call.cancelled);

  if (
    activeCalls.length < 2 ||
    !hasConsecutiveCalls(activeCalls) ||
    !hasTemporalContinuity(activeCalls)
  ) {
    return undefined;
  }

  const journeyRef =
    identityQuality === "reliable" ? journey.journeyRef : undefined;
  const snapshotId = createJourneySnapshotId(
    identityQuality,
    match.pattern.id,
    calls,
    journeyRef,
    journey.serviceDate,
  );

  return {
    snapshotId,
    ...(journeyRef ? { journeyRef } : {}),
    ...(journey.serviceDate ? { serviceDate: journey.serviceDate } : {}),
    identityQuality,
    confidence: activeCalls.length >= 3 ? "high" : "medium",
    patternId: match.pattern.id,
    ...(journey.directionRef ? { directionRef: journey.directionRef } : {}),
    ...(journey.destination ? { destination: journey.destination } : {}),
    patternStationIds: [...match.pattern.stops],
    calls: calls.map(stripInternalCallFields),
  };
}

function inferCollidingJourneys(
  journeys: RawVehicleJourney[],
  topology: RealtimeTopologyIndex,
): TransitVehicleJourneyEstimate[] {
  const pools = new Map<string, InferencePool>();
  let observationSequence = 0;

  for (const journey of journeys) {
    if (journey.cancelled) {
      continue;
    }

    const match = findPatternMatch(journey, topology.patterns, 1);

    if (!match) {
      continue;
    }

    const poolKey = [
      match.pattern.id,
      normalizeText(journey.directionRef),
      normalizeText(journey.destination),
    ].join("|");
    const pool = pools.get(poolKey) ?? {
      destination: journey.destination,
      directionRef: journey.directionRef,
      observations: [],
      pattern: match.pattern,
    };

    for (const call of normalizeCallsForPattern(journey.calls, match.pattern)) {
      if (call.cancelled || call.effectiveTimeMs === undefined) {
        continue;
      }

      pool.observations.push({
        call,
        id: `${poolKey}:${observationSequence}`,
        serviceDate: journey.serviceDate,
        timeMs: call.effectiveTimeMs,
      });
      observationSequence += 1;
    }

    pools.set(poolKey, pool);
  }

  return [...pools.values()].flatMap(reconstructInferencePool);
}

function reconstructInferencePool(
  pool: InferencePool,
): TransitVehicleJourneyEstimate[] {
  const deduped = dedupeObservations(pool.observations);
  const byOrder = new Map<number, InferenceObservation[]>();

  for (const observation of deduped) {
    byOrder.set(observation.call.order, [
      ...(byOrder.get(observation.call.order) ?? []),
      observation,
    ]);
  }

  for (const observations of byOrder.values()) {
    observations.sort((left, right) => left.timeMs - right.timeMs);
  }

  const parent = new Map(deduped.map((observation) => [observation.id, observation.id]));

  for (let order = 0; order < pool.pattern.stops.length - 1; order += 1) {
    const left = byOrder.get(order) ?? [];
    const right = byOrder.get(order + 1) ?? [];

    for (const [source, target] of matchAdjacentObservations(left, right)) {
      union(parent, source.id, target.id);
    }
  }

  const components = new Map<string, InferenceObservation[]>();

  for (const observation of deduped) {
    const root = findRoot(parent, observation.id);
    components.set(root, [...(components.get(root) ?? []), observation]);
  }

  const journeys: TransitVehicleJourneyEstimate[] = [];

  for (const component of components.values()) {
    const calls = component
      .sort((left, right) => left.call.order - right.call.order)
      .map((observation) => observation.call);

    if (
      calls.length < 2 ||
      !hasConsecutiveCalls(calls) ||
      !hasTemporalContinuity(calls)
    ) {
      continue;
    }

    const serviceDate = uniqueValue(
      component
        .map((observation) => observation.serviceDate)
        .filter((value): value is string => Boolean(value)),
    );

    journeys.push({
      snapshotId: createJourneySnapshotId(
        "inferred",
        pool.pattern.id,
        calls,
        undefined,
        serviceDate,
      ),
      ...(serviceDate ? { serviceDate } : {}),
      identityQuality: "inferred",
      confidence: "medium",
      patternId: pool.pattern.id,
      ...(pool.directionRef ? { directionRef: pool.directionRef } : {}),
      ...(pool.destination ? { destination: pool.destination } : {}),
      patternStationIds: [...pool.pattern.stops],
      calls: calls.map(stripInternalCallFields),
    });
  }

  return journeys;
}

function findPatternMatch(
  journey: RawVehicleJourney,
  patterns: RealtimeTopologyPattern[],
  minimumStations: number,
): PatternMatch | undefined {
  const orderedCalls = [...journey.calls].sort(compareUpstreamCalls);
  const stationSequence = dedupeConsecutive(
    orderedCalls.map((call) => call.stationId),
  );

  if (new Set(stationSequence).size < minimumStations) {
    return undefined;
  }

  const candidates = patterns
    .map((pattern) => {
      const indices = findMonotonicIndices(pattern.stops, stationSequence);

      if (!indices) {
        return undefined;
      }

      let score = stationSequence.length * 100_000;
      const terminal = pattern.stops.at(-1);

      if (
        journey.destinationStationId &&
        terminal === journey.destinationStationId
      ) {
        score += 50_000;
      }

      if (
        journey.destination &&
        pattern.destination &&
        normalizeText(journey.destination) === normalizeText(pattern.destination)
      ) {
        score += 20_000;
      }

      if (
        journey.directionRef &&
        pattern.direction &&
        normalizeText(journey.directionRef) === normalizeText(pattern.direction)
      ) {
        score += 5_000;
      }

      score += Math.min(pattern.serviceCount, 4_999);
      score += Math.min(pattern.stops.length, 999);

      return { pattern, score };
    })
    .filter((match): match is PatternMatch => Boolean(match))
    .sort(
      (left, right) =>
        right.score - left.score || left.pattern.id.localeCompare(right.pattern.id),
    );

  if (candidates.length === 0) {
    return undefined;
  }

  if (
    candidates.length > 1 &&
    candidates[0].score === candidates[1].score &&
    candidates[0].pattern.stops.join("|") !==
      candidates[1].pattern.stops.join("|")
  ) {
    return undefined;
  }

  return candidates[0];
}

function normalizeCallsForPattern(
  calls: RawVehicleCall[],
  pattern: RealtimeTopologyPattern,
): RawVehicleCall[] {
  const stationOrder = new Map(
    pattern.stops.map((stationId, order) => [stationId, order]),
  );
  const byIdentity = new Map<string, RawVehicleCall>();

  for (const call of calls) {
    const order = stationOrder.get(call.stationId);

    if (order === undefined) {
      continue;
    }

    const normalizedCall = {
      ...call,
      order,
    };
    const key = [
      normalizedCall.stationId,
      normalizedCall.arrivalAt,
      normalizedCall.departureAt,
      normalizedCall.cancelled,
    ].join("|");
    const current = byIdentity.get(key);

    if (!current || callQualityScore(normalizedCall) > callQualityScore(current)) {
      byIdentity.set(key, normalizedCall);
    }
  }

  return [...byIdentity.values()].sort(
    (left, right) =>
      left.order - right.order ||
      (left.effectiveTimeMs ?? 0) - (right.effectiveTimeMs ?? 0),
  );
}

function matchAdjacentObservations(
  left: InferenceObservation[],
  right: InferenceObservation[],
): Array<[InferenceObservation, InferenceObservation]> {
  const pairs: Array<[InferenceObservation, InferenceObservation]> = [];
  let rightIndex = 0;

  for (const source of left) {
    while (
      rightIndex < right.length &&
      right[rightIndex].timeMs <= source.timeMs
    ) {
      rightIndex += 1;
    }

    const target = right[rightIndex];

    if (!target) {
      break;
    }

    if (target.timeMs - source.timeMs <= MAX_INTERSTATION_DURATION_MS) {
      pairs.push([source, target]);
      rightIndex += 1;
    }
  }

  return pairs;
}

function dedupeObservations(
  observations: InferenceObservation[],
): InferenceObservation[] {
  const byKey = new Map<string, InferenceObservation>();

  for (const observation of observations) {
    const key = [
      observation.call.order,
      observation.call.arrivalAt,
      observation.call.departureAt,
      observation.call.timeQuality,
    ].join("|");
    const current = byKey.get(key);

    if (
      !current ||
      callQualityScore(observation.call) > callQualityScore(current.call)
    ) {
      byKey.set(key, observation);
    }
  }

  return [...byKey.values()];
}

function hasConsecutiveCalls(calls: RawVehicleCall[]): boolean {
  return calls.some(
    (call, index) => index > 0 && call.order === calls[index - 1].order + 1,
  );
}

function hasTemporalContinuity(calls: RawVehicleCall[]): boolean {
  let previous: number | undefined;

  for (const call of calls) {
    if (call.cancelled || call.effectiveTimeMs === undefined) {
      continue;
    }

    if (
      previous !== undefined &&
      (call.effectiveTimeMs <= previous ||
        call.effectiveTimeMs - previous > MAX_INTERSTATION_DURATION_MS)
    ) {
      return false;
    }

    previous = call.effectiveTimeMs;
  }

  return true;
}

function findMonotonicIndices(
  patternStops: string[],
  stationSequence: string[],
): number[] | undefined {
  const indices: number[] = [];
  let cursor = 0;

  for (const stationId of stationSequence) {
    const index = patternStops.indexOf(stationId, cursor);

    if (index < 0) {
      return undefined;
    }

    indices.push(index);
    cursor = index + 1;
  }

  return indices;
}

function isPayloadComplete(
  serviceDelivery: JsonRecord | undefined,
  deliveries: JsonRecord[],
  generatedAt: string,
  now: Date,
): boolean {
  if (deliveries.length === 0 || explicitFalse(serviceDelivery?.Status)) {
    return false;
  }

  if (
    deliveries.some(
      (delivery) =>
        explicitFalse(delivery.Status) ||
        booleanValue(delivery.MoreData) === true ||
        hasMeaningfulValue(delivery.ErrorCondition),
    )
  ) {
    return false;
  }

  const generatedMs = timeMilliseconds(generatedAt);

  return (
    generatedMs !== undefined &&
    now.getTime() - generatedMs <= MAX_RESPONSE_AGE_MS &&
    generatedMs - now.getTime() <= MAX_RESPONSE_AGE_MS
  );
}

function collectNamedRecords(root: unknown, targetKey: string): JsonRecord[] {
  const result: JsonRecord[] = [];
  const visited = new Set<object>();

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (!isRecord(value) || visited.has(value)) {
      return;
    }

    visited.add(value);

    for (const [key, child] of Object.entries(value)) {
      if (key === targetKey) {
        result.push(...asArray(child).filter(isRecord));
      } else {
        visit(child);
      }
    }
  };

  visit(root);
  return result;
}

function getNestedRecord(
  value: unknown,
  ...path: string[]
): JsonRecord | undefined {
  return asRecord(getNestedValue(value, ...path));
}

function getNestedValue(value: unknown, ...path: string[]): unknown {
  let current = value;

  for (const key of path) {
    const record = asRecord(current);

    if (!record) {
      return undefined;
    }

    current = record[key];
  }

  return current;
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    for (const candidate of asArray(value)) {
      const text = cleanText(textValue(candidate));

      if (text) {
        return text;
      }
    }
  }

  return undefined;
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(textValue).find(Boolean);
  }

  const record = asRecord(value);

  return record ? textValue(record.value ?? record.Value) : undefined;
}

function firstIsoValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = textValue(value);
    const milliseconds = timeMilliseconds(text);

    if (milliseconds !== undefined) {
      return new Date(milliseconds).toISOString();
    }
  }

  return undefined;
}

function timeMilliseconds(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const milliseconds = Date.parse(value);

  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  const text = textValue(value)?.trim().toLowerCase();

  if (text === "true") {
    return true;
  }

  if (text === "false") {
    return false;
  }

  return undefined;
}

function explicitFalse(value: unknown): boolean {
  return booleanValue(value) === false;
}

function isCancelled(record: JsonRecord): boolean {
  if (
    [record.Cancellation, record.Cancelled, record.IsCancelled].some(
      (value) => booleanValue(value) === true,
    )
  ) {
    return true;
  }

  return [record.ArrivalStatus, record.DepartureStatus, record.Status].some(
    (value) => normalizeMode(textValue(value)) === "cancelled",
  );
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(hasMeaningfulValue);
  }

  if (isRecord(value)) {
    return Object.values(value).some(hasMeaningfulValue);
  }

  return true;
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(textValue(value));

  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractServiceDate(
  dataFrameRef: string | undefined,
  journeyRef: string | undefined,
): string | undefined {
  const value = `${dataFrameRef ?? ""} ${journeyRef ?? ""}`;
  const separated = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/u);

  if (separated) {
    return `${separated[1]}-${separated[2]}-${separated[3]}`;
  }

  const compact = value.match(/\b(20\d{2})(\d{2})(\d{2})\b/u);

  return compact
    ? `${compact[1]}-${compact[2]}-${compact[3]}`
    : undefined;
}

function compareUpstreamCalls(
  left: RawVehicleCall,
  right: RawVehicleCall,
): number {
  if (left.upstreamOrder !== undefined && right.upstreamOrder !== undefined) {
    return left.upstreamOrder - right.upstreamOrder;
  }

  return (left.effectiveTimeMs ?? 0) - (right.effectiveTimeMs ?? 0);
}

function stripInternalCallFields(
  call: RawVehicleCall,
): TransitVehicleCallEstimate {
  const { effectiveTimeMs: _effectiveTimeMs, upstreamOrder: _upstreamOrder, ...publicCall } = call;

  return publicCall;
}

function callQualityScore(call: RawVehicleCall): number {
  return call.timeQuality === "recorded"
    ? 3
    : call.timeQuality === "estimated"
      ? 2
      : 1;
}

function createJourneySnapshotId(
  identityQuality: "reliable" | "inferred",
  patternId: string,
  calls: RawVehicleCall[],
  journeyRef?: string,
  serviceDate?: string,
): string {
  const timingAnchor = calls
    .map(
      (call) =>
        call.aimedArrivalAt ??
        call.aimedDepartureAt ??
        roundIsoToMinute(call.arrivalAt ?? call.departureAt),
    )
    .find(Boolean);
  const seed = [
    identityQuality,
    patternId,
    journeyRef,
    serviceDate,
    calls[0]?.stationId,
    timingAnchor,
  ].join("|");

  return `${identityQuality}:${hashString(seed)}`;
}

function roundIsoToMinute(value: string | undefined): string | undefined {
  const milliseconds = timeMilliseconds(value);

  if (milliseconds === undefined) {
    return undefined;
  }

  return String(Math.round(milliseconds / 60_000));
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

function firstJourneyTime(journey: TransitVehicleJourneyEstimate): number {
  for (const call of journey.calls) {
    const milliseconds = timeMilliseconds(call.arrivalAt ?? call.departureAt);

    if (milliseconds !== undefined) {
      return milliseconds;
    }
  }

  return Number.MAX_SAFE_INTEGER;
}

function findRoot(parent: Map<string, string>, value: string): string {
  const current = parent.get(value);

  if (!current || current === value) {
    return current ?? value;
  }

  const root = findRoot(parent, current);
  parent.set(value, root);
  return root;
}

function union(parent: Map<string, string>, left: string, right: string): void {
  const leftRoot = findRoot(parent, left);
  const rightRoot = findRoot(parent, right);

  if (leftRoot !== rightRoot) {
    parent.set(rightRoot, leftRoot);
  }
}

function dedupeConsecutive<T>(values: T[]): T[] {
  return values.filter((value, index) => index === 0 || value !== values[index - 1]);
}

function uniqueValue<T>(values: T[]): T | undefined {
  const unique = [...new Set(values)];

  return unique.length === 1 ? unique[0] : undefined;
}

function normalizeReference(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeMode(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeText(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/giu, "")
    .toLowerCase();
}

function cleanText(value: string | null | undefined): string | undefined {
  const text = value?.replace(/\s+/gu, " ").trim();

  return text || undefined;
}

function asArray(value: unknown): unknown[] {
  if (value === null || value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function asRecord(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
