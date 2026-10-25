import type {
  Departure,
  DepartureServiceSection,
  DepartureServiceType,
  LineRouteSequence,
  LineRouteStop,
  TransitBoardConfig,
} from "../../types/transit";

/** Counts include the observation stop and the destination, on the same corridor. */
export function classifyRemainingStops(served: number, corridor: number): DepartureServiceType {
  if (served < 2 || corridor < served) return "inconnu";
  if (served === corridor) return "omnibus";
  return served === 2 ? "direct" : "semi-direct";
}

/** Optional geographic context, independent of travel direction and mission codes. */
export function inferSkippedStopSection(
  skippedStops: LineRouteStop[],
  lineTopology: LineRouteSequence[],
): DepartureServiceSection | undefined {
  const stops = [...new Map(lineTopology.flatMap((sequence) => sequence.stops)
    .map((stop) => [stop.id, stop])).values()];
  if (!skippedStops.length || stops.length < 3) return undefined;

  const hasGeographic = (stop: LineRouteStop) => Number.isFinite(stop.lon) && Number.isFinite(stop.lat) &&
    Math.abs(stop.lon!) <= 180 && Math.abs(stop.lat!) <= 90;
  const hasProjected = (stop: LineRouteStop) => Number.isFinite(stop.projectedX) && Number.isFinite(stop.projectedY);
  const geographic = stops.every(hasGeographic) && skippedStops.every(hasGeographic);
  if (!geographic && !(stops.every(hasProjected) && skippedStops.every(hasProjected))) return undefined;
  const latitudeScale = geographic ? Math.cos(stops.reduce((sum, stop) => sum + stop.lat!, 0) / stops.length * Math.PI / 180) : 1;
  const point = (stop: LineRouteStop): [number, number] => geographic
    ? [stop.lon! * latitudeScale, stop.lat!]
    : [stop.projectedX!, stop.projectedY!];
  const points = stops.map(point);
  // A date-line crossing cannot be represented by this local geographic frame.
  if (geographic && Math.max(...stops.map((stop) => stop.lon!)) - Math.min(...stops.map((stop) => stop.lon!)) > 180) return undefined;
  const xMin = Math.min(...points.map(([x]) => x));
  const xMax = Math.max(...points.map(([x]) => x));
  const yMin = Math.min(...points.map(([, y]) => y));
  const yMax = Math.max(...points.map(([, y]) => y));
  const center = [(xMin + xMax) / 2, (yMin + yMax) / 2];
  const halfSpans = [(xMax - xMin) / 2, (yMax - yMin) / 2];
  const scale = Math.max(...halfSpans);
  if (!(scale > 0)) return undefined;
  const skippedPoints = skippedStops.map(point);
  const directions: Array<{ section: DepartureServiceSection; axis: number; sign: number }> = [
    { section: "north", axis: 1, sign: 1 }, { section: "south", axis: 1, sign: -1 },
    { section: "east", axis: 0, sign: 1 }, { section: "west", axis: 0, sign: -1 },
  ];
  const candidates = directions
    // Small lateral bends on an almost horizontal/vertical line are not sections.
    .filter(({ axis }) => halfSpans[axis] >= scale / 2)
    .map(({ section, axis, sign }) => ({
      section,
      clearance: Math.min(...skippedPoints.map((coordinates) => sign * (coordinates[axis] - center[axis]))) / scale,
    }))
    .sort((left, right) => right.clearance - left.clearance);
  const best = candidates[0];
  // Keep the generic label around the center, across opposite sides, or when
  // two cardinal interpretations are too close (for example a diagonal line).
  if (!best || best.clearance < 0.1 || (candidates[1] && best.clearance - candidates[1].clearance < 0.05)) return undefined;
  return best.section;
}

/** A destination or mission alone cannot identify an individual departure. */
export function createDepartureServiceIdentity(board: TransitBoardConfig, departure: Departure): string {
  return JSON.stringify([
    board.schedule?.lineRef ?? board.line.ref,
    board.schedule?.stopAreaRef ?? board.title,
    departure.monitoringRef,
    departure.destination,
    departure.journeyRef || departure.id,
    departure.aimedDepartureTime,
  ]);
}

export function createDeparturePatternCacheKey(board: TransitBoardConfig, departure: Departure): string {
  return JSON.stringify([
    createDepartureServiceIdentity(board, departure),
    Math.floor(Date.now() / 30_000),
  ]);
}
