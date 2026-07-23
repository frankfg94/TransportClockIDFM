import type {
  LineGeometryEntrance,
  LineGeometryStopRequest,
} from "../../../src/features/line-map/lineGeometry";
import type { GtfsIndexedPattern } from "../gtfs/types";

const MAX_PARENT_STATION_DISTANCE_METERS = 300;

/**
 * Converts GTFS parent_station IDs to the station IDs used by the requested
 * topology. The parent station's shape projection is used deliberately:
 * an entrance coordinate can be closer to a neighbouring station.
 */
export function matchGtfsEntrancesToRequestStops(
  entrances: LineGeometryEntrance[],
  patterns: GtfsIndexedPattern[],
  requestStops: LineGeometryStopRequest[],
): LineGeometryEntrance[] {
  const projectionsByParent = new Map<string, Array<{ lon: number; lat: number }>>();

  for (const projection of patterns.flatMap((pattern) => pattern.projections)) {
    const projections = projectionsByParent.get(projection.stopId) ?? [];
    projections.push(projection.coordinate);
    projectionsByParent.set(projection.stopId, projections);
  }

  return entrances.flatMap((entrance) => {
    const exact = requestStops.find((stop) =>
      areSameStopReferences(entrance.parentStopId, stop.id),
    );
    if (exact) return [{ ...entrance, parentStopId: exact.id }];

    const parentProjections = projectionsByParent.get(entrance.parentStopId);
    if (!parentProjections?.length) return [];

    const nearest = requestStops
      .map((stop) => ({
        stop,
        distance: Math.min(
          ...parentProjections.map((projection) => distanceMeters(projection, stop)),
        ),
      }))
      .sort((left, right) => left.distance - right.distance)[0];

    return nearest && nearest.distance <= MAX_PARENT_STATION_DISTANCE_METERS
      ? [{ ...entrance, parentStopId: nearest.stop.id }]
      : [];
  });
}

function areSameStopReferences(left: string, right: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/gu, "");
  return normalize(left) === normalize(right);
}

function distanceMeters(
  left: { lon: number; lat: number },
  right: { lon: number; lat: number },
): number {
  const latitudeRadians = (((left.lat + right.lat) / 2) * Math.PI) / 180;
  return (
    Math.hypot((right.lon - left.lon) * Math.cos(latitudeRadians), right.lat - left.lat) * 111_320
  );
}
