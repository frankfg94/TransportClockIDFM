import metro13Mf77Json from "./line-profiles/metro-13-mf77.json";

export interface TransportPositionRollingStockProfile {
  model: string;
  maxOperatingSpeedKph?: number | null;
  accelerationMps2?: number | null;
  serviceBrakingMps2?: number | null;
  doorCloseSeconds?: number | null;
  provenance: string;
  sourceUrls: string[];
}

export interface TransportPositionLineProfileSegment {
  sourceStationId: string;
  sourceName: string;
  targetStationId: string;
  targetName: string;
  distanceMeters?: number | null;
  sourceToTargetRuntimeSeconds?: number | null;
  targetToSourceRuntimeSeconds?: number | null;
}

export interface TransportPositionLineProfile {
  schemaVersion: 1;
  id: string;
  lineRefs: string[];
  label: string;
  rollingStock: TransportPositionRollingStockProfile;
  schedule: {
    kind: "idfm_navitia_theoretical_stop_times";
    generatedAt: string;
    vehicleJourneySampleCount: number;
    sourceUrlTemplate: string;
    notes: string;
  };
  segments: TransportPositionLineProfileSegment[];
}

export interface ResolvedTransportPositionLineProfileSegment {
  profileId: string;
  distanceMeters?: number;
  runtimeSeconds?: number;
  maxOperatingSpeedKph?: number;
}

const LINE_PROFILES: readonly TransportPositionLineProfile[] = [
  metro13Mf77Json as TransportPositionLineProfile,
];

export function getTransportPositionLineProfile(
  lineRef: string | undefined,
): TransportPositionLineProfile | undefined {
  if (!lineRef) {
    return undefined;
  }

  const normalized = normalizeLineRef(lineRef);
  return LINE_PROFILES.find((profile) =>
    profile.lineRefs.some((candidate) => normalizeLineRef(candidate) === normalized),
  );
}

export function resolveTransportPositionLineProfileSegment(
  profile: TransportPositionLineProfile | undefined,
  sourceStationId: string,
  targetStationId: string,
): ResolvedTransportPositionLineProfileSegment | undefined {
  if (!profile) {
    return undefined;
  }

  const segment = profile.segments.find(
    (candidate) =>
      (candidate.sourceStationId === sourceStationId &&
        candidate.targetStationId === targetStationId) ||
      (candidate.sourceStationId === targetStationId &&
        candidate.targetStationId === sourceStationId),
  );

  if (!segment) {
    return undefined;
  }

  const forward = segment.sourceStationId === sourceStationId;
  const runtimeSeconds = forward
    ? segment.sourceToTargetRuntimeSeconds
    : segment.targetToSourceRuntimeSeconds;
  const maxOperatingSpeedKph = profile.rollingStock.maxOperatingSpeedKph;

  return {
    profileId: profile.id,
    ...(isPositive(segment.distanceMeters)
      ? { distanceMeters: segment.distanceMeters }
      : {}),
    ...(isPositive(runtimeSeconds) ? { runtimeSeconds } : {}),
    ...(isPositive(maxOperatingSpeedKph)
      ? { maxOperatingSpeedKph }
      : {}),
  };
}

export function listTransportPositionLineProfiles(): readonly TransportPositionLineProfile[] {
  return LINE_PROFILES;
}

function normalizeLineRef(value: string): string {
  const code = value.match(/C\d{5}/iu)?.[0]?.toUpperCase();
  return code ?? value.trim().toLowerCase();
}

function isPositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
