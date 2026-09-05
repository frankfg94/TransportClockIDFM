import {
  isNearbyJourneyWalkingSection,
  type NearbyJourneyPoint,
  type NearbyJourneySection,
} from "./nearbyHeavyTransports";

export interface NearbyWalkingMapSegment {
  id: string;
  from: NearbyJourneyPoint;
  to: NearbyJourneyPoint;
  coordinates?: NearbyJourneyPoint[];
  distanceMeters?: number;
  durationSeconds?: number;
}

export function alignNearbyWalkingGeometryToEndpoints(
  coordinates: readonly NearbyJourneyPoint[],
  from: NearbyJourneyPoint,
  to: NearbyJourneyPoint,
): NearbyJourneyPoint[] {
  if (coordinates.length < 2) return [...coordinates];
  const nearestIndex = (target: NearbyJourneyPoint): number => coordinates.reduce((bestIndex, point, index) => {
    const best = coordinates[bestIndex]!;
    return squaredCoordinateDistance(point, target) < squaredCoordinateDistance(best, target) ? index : bestIndex;
  }, 0);
  let start = nearestIndex(from);
  let end = nearestIndex(to);
  let ordered = [...coordinates];
  if (start > end) {
    ordered = ordered.reverse();
    start = ordered.length - 1 - start;
    end = ordered.length - 1 - end;
  }
  const clipped = ordered.slice(start, end + 1);
  const result = [from, ...clipped, to];
  return result.filter((point, index) => index === 0 || point.lon !== result[index - 1]!.lon || point.lat !== result[index - 1]!.lat);
}

function squaredCoordinateDistance(left: NearbyJourneyPoint, right: NearbyJourneyPoint): number {
  const latitudeScale = 111_320;
  const longitudeScale = Math.max(1, latitudeScale * Math.cos((right.lat * Math.PI) / 180));
  const deltaLon = (left.lon - right.lon) * longitudeScale;
  const deltaLat = (left.lat - right.lat) * latitudeScale;
  return deltaLon ** 2 + deltaLat ** 2;
}

function isLineBearingSection(section: NearbyJourneySection): boolean {
  return !isNearbyJourneyWalkingSection(section) && Boolean(
    section.lineId || section.lineCode || section.lineMode,
  );
}

function previousTransitSection(
  sections: readonly NearbyJourneySection[],
  index: number,
): NearbyJourneySection | undefined {
  for (let candidateIndex = index - 1; candidateIndex >= 0; candidateIndex -= 1) {
    const candidate = sections[candidateIndex];
    if (candidate && isLineBearingSection(candidate)) return candidate;
  }
  return undefined;
}

function nextTransitSection(
  sections: readonly NearbyJourneySection[],
  index: number,
): NearbyJourneySection | undefined {
  for (let candidateIndex = index + 1; candidateIndex < sections.length; candidateIndex += 1) {
    const candidate = sections[candidateIndex];
    if (candidate && isLineBearingSection(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Build only the walk links in a journey. Transit section endpoints are the
 * authoritative correspondence boundaries: a malformed/missing street
 * network endpoint must never turn the whole journey into one direct line.
 */
export function createNearbyTravelWalkingSegments(
  route: { id: string; sections: readonly NearbyJourneySection[] } | undefined,
  origin: NearbyJourneyPoint | undefined,
  destination: NearbyJourneyPoint | undefined,
  options: {
    resolveTransitBoundaryPoint?: (
      section: NearbyJourneySection,
      side: "from" | "to",
      fallback?: NearbyJourneyPoint,
    ) => NearbyJourneyPoint | undefined;
    /** Resolve the best exit for any walk leaving a transit section. */
    resolveTransitExitPoint?: (
      section: NearbyJourneySection,
      target?: NearbyJourneyPoint,
    ) => NearbyJourneyPoint | undefined;
    /** Resolve the egress point for the final walk after the last transit leg. */
    resolveFinalTransitExitPoint?: (
      section: NearbyJourneySection,
      destination?: NearbyJourneyPoint,
    ) => NearbyJourneyPoint | undefined;
  } = {},
): NearbyWalkingMapSegment[] {
  if (!route || !origin) return [];

  const sections = route.sections;
  const hasTransit = sections.some(isLineBearingSection);
  const segments: NearbyWalkingMapSegment[] = [];

  sections.forEach((section, index) => {
    if (!isNearbyJourneyWalkingSection(section)) return;

    const previousTransit = previousTransitSection(sections, index);
    const nextTransit = nextTransitSection(sections, index);
    const nextTransitBoundaryPoint = nextTransit
      ? options.resolveTransitBoundaryPoint?.(nextTransit, "from", nextTransit.fromPoint)
        ?? nextTransit.fromPoint
      : undefined;
    const selectedTransitExit = previousTransit
      ? options.resolveTransitExitPoint?.(previousTransit, nextTransitBoundaryPoint ?? destination)
        ?? (!nextTransit ? options.resolveFinalTransitExitPoint?.(previousTransit, destination) : undefined)
      : undefined;
    const from = selectedTransitExit
      ?? (previousTransit
        ? options.resolveTransitBoundaryPoint?.(previousTransit, "to", previousTransit.toPoint)
          ?? previousTransit.toPoint
        : undefined)
      ?? section.fromPoint
      ?? (index === 0 ? origin : undefined);
    const to = nextTransitBoundaryPoint
      ?? section.toPoint
      ?? (!hasTransit || index === sections.length - 1 ? destination : undefined);

    if (!from || !to || (from.lon === to.lon && from.lat === to.lat)) return;
    const segment: NearbyWalkingMapSegment = {
      id: `${route.id}:walk:${index}`,
      from,
      to,
    };
    if (section.geometry && section.geometry.length >= 2) {
      segment.coordinates = alignNearbyWalkingGeometryToEndpoints(section.geometry, from, to);
      if (section.distanceMeters !== undefined) segment.distanceMeters = section.distanceMeters;
      if (section.durationSeconds !== undefined) segment.durationSeconds = section.durationSeconds;
    }
    segments.push(segment);
  });

  return segments;
}
