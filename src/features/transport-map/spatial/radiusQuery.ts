import type { GlobalMapStation } from "../contracts/manifest.js";
import { assertLonLat, lonLatToWorld } from "../geo/coordinateKernel.js";
import { getCoordinatesDistanceMeters } from "../../../services/distance.js";
import type { PackedSpatialIndex } from "./packedIndex.js";

export interface RadiusQueryResult {
  station: GlobalMapStation;
  distanceMeters: number;
}

export function queryStationsWithinRadius(
  stations: GlobalMapStation[],
  point: { lon: number; lat: number },
  radiusMeters: number,
  limit = Number.POSITIVE_INFINITY,
  offset = 0,
  spatialIndex?: PackedSpatialIndex,
): RadiusQueryResult[] {
  if (!Number.isFinite(radiusMeters) || radiusMeters < 0) throw new Error("Invalid radius");
  assertLonLat(point);
  const candidates = spatialIndex
    ? spatialIndex
      .query(radiusWorldBounds(point, radiusMeters))
      .map((index) => stations[index])
      .filter((station): station is GlobalMapStation => Boolean(station))
    : stations;
  return candidates
    .map((station) => ({
      station,
      distanceMeters: getCoordinatesDistanceMeters(point.lat, point.lon, station.lat, station.lon),
    }))
    .filter((result) => result.distanceMeters <= radiusMeters)
    .sort((left, right) => left.distanceMeters - right.distanceMeters || left.station.id.localeCompare(right.station.id))
    .slice(offset, offset + limit);
}

function radiusWorldBounds(point: { lon: number; lat: number }, radiusMeters: number): { minX: number; minY: number; maxX: number; maxY: number } {
  const earthRadius = 6_378_137;
  const angularRadius = radiusMeters / earthRadius;
  const latitudeDelta = (angularRadius * 180) / Math.PI;
  const minLat = Math.max(-85.0511287798066, point.lat - latitudeDelta);
  const maxLat = Math.min(85.0511287798066, point.lat + latitudeDelta);
  const cosineLatitude = Math.cos((point.lat * Math.PI) / 180);
  const longitudeDelta = cosineLatitude > 1e-12 && angularRadius < Math.PI
    ? (Math.asin(Math.min(1, Math.sin(angularRadius) / cosineLatitude)) * 180) / Math.PI
    : 180;
  // A single axis-aligned world rectangle cannot represent a dateline wrap;
  // use the complete normalized world in that rare case to avoid false negatives.
  if (longitudeDelta >= 180 || point.lon - longitudeDelta < -180 || point.lon + longitudeDelta > 180) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  const corners = [
    lonLatToWorld({ lon: point.lon - longitudeDelta, lat: minLat }),
    lonLatToWorld({ lon: point.lon - longitudeDelta, lat: maxLat }),
    lonLatToWorld({ lon: point.lon + longitudeDelta, lat: minLat }),
    lonLatToWorld({ lon: point.lon + longitudeDelta, lat: maxLat }),
  ];
  return {
    minX: Math.min(...corners.map((corner) => corner.x)),
    minY: Math.min(...corners.map((corner) => corner.y)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    maxY: Math.max(...corners.map((corner) => corner.y)),
  };
}
