export type TransportPositionSource = "idfm-siri-estimated-timetable";

export type TransportPositionKind = "estimated" | "exact";

export type TransportIdentityQuality = "reliable" | "inferred";

export type TransportPositionConfidence = "high" | "medium" | "low";

export type TransportSegmentDistanceSource =
  | "netex_measured"
  | "line_profile_gtfs"
  | "gtfs_shape"
  | "geodesic_fallback";

export interface TransitVehicleSegmentMetric {
  id: string;
  sourceStationId: string;
  targetStationId: string;
  distanceMeters: number;
  fallbackDistanceMeters: number;
  distanceSource: TransportSegmentDistanceSource;
  projectionErrorMeters?: number;
}

export type TransportSnapshotUnavailableReason =
  | "unsupported_mode"
  | "missing_topology"
  | "missing_line_ref"
  | "no_data";

export type TransportSnapshotDiagnosticStage =
  | "topology"
  | "upstream"
  | "reconstruction";

export interface TransitVehicleSnapshotDiagnostics {
  stage: TransportSnapshotDiagnosticStage;
  missing: string[];
  lineRef?: string;
  cacheTransportMode?: string;
  topologyNodeCount?: number;
  topologyPatternCount?: number;
  deliveryCount?: number;
  estimatedJourneyCount?: number;
  estimatedLineJourneyCount?: number;
  monitoredVisitCount?: number;
  monitoredLineVisitCount?: number;
  mappedRawJourneyCount?: number;
  navitiaStopPointAliasSourceAvailable?: boolean;
  navitiaStopPointCount?: number;
  resolvedStopPointAliasCount?: number;
  reconstructedJourneyCount?: number;
  responseTimestampPresent?: boolean;
  payloadComplete?: boolean;
  segmentMetricCount?: number;
  gtfsShapeMetricCount?: number;
  segmentMetricFallbackCount?: number;
  lineTraceStatus?: "fresh" | "stale" | "unavailable";
  providerId?: string;
  providerExactCoordinates?: boolean;
}

export type TransportCallTimeQuality =
  | "recorded"
  | "estimated"
  | "aimed";

export interface TransitVehicleCallEstimate {
  stationId: string;
  order: number;
  arrivalAt?: string;
  departureAt?: string;
  aimedArrivalAt?: string;
  aimedDepartureAt?: string;
  timeQuality: TransportCallTimeQuality;
  vehicleAtStop: boolean;
  cancelled: boolean;
}

export interface TransitVehicleJourneyEstimate {
  snapshotId: string;
  journeyRef?: string;
  serviceDate?: string;
  identityQuality: TransportIdentityQuality;
  confidence: TransportPositionConfidence;
  patternId: string;
  directionRef?: string;
  destination?: string;
  vehicleVisualProfileId?: string;
  /** Ordered topology used to bridge SIRI windows that omit earlier/later calls. */
  patternStationIds?: string[];
  calls: TransitVehicleCallEstimate[];
}

export interface TransitVehicleSnapshot {
  available: boolean;
  reason?: TransportSnapshotUnavailableReason;
  lineId: string;
  source: TransportPositionSource;
  positionKind: TransportPositionKind;
  generatedAt: string;
  complete: boolean;
  pollAfterMs: number;
  journeys: TransitVehicleJourneyEstimate[];
  segmentMetrics?: TransitVehicleSegmentMetric[];
  diagnostics?: TransitVehicleSnapshotDiagnostics;
}

export type TransportPositionState = "at_stop" | "moving" | "correcting";

export interface TransportPosition {
  trackId: string;
  snapshotJourneyId: string;
  journeyRef?: string;
  patternId: string;
  directionRef?: string;
  destination?: string;
  sourceStationId: string;
  targetStationId: string;
  progress: number;
  state: TransportPositionState;
  identityQuality: TransportIdentityQuality;
  confidence: TransportPositionConfidence;
  segmentDistanceMeters?: number;
  segmentDistanceSource?: TransportSegmentDistanceSource;
  estimatedSpeedKph?: number;
  segmentRuntimeSeconds?: number;
  lineProfileId?: string;
  activeParameterIds?: string[];
  vehicleVisualProfileId?: string;
  snapshotGeneratedAt: string;
}

export type TransportPositionsStatus =
  | "idle"
  | "loading"
  | "live"
  | "stale"
  | "rate_limited"
  | "unavailable"
  | "error";
