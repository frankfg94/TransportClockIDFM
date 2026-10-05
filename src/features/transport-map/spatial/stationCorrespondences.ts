import type { GlobalMapLine, GlobalMapMode, GlobalMapStation } from "../contracts/manifest.js";
import type { TransportMapNetwork } from "../contracts/network.js";
import { queryStationsWithinRadius, type RadiusQueryResult } from "./radiusQuery.js";
import { GEODESIC_EARTH_RADIUS_METERS } from "../../../services/distance.js";

/**
 * Keep station correspondences aligned with the radius used by the global map
 * when a station is selected. This is deliberately separate from the nearby
 * address radius: it describes the physical interchange around a target
 * station, not the distance from the user's address.
 */
export const STATION_CORRESPONDENCE_RADIUS_METERS = 350;

export interface StationCorrespondenceOptions {
  excludedStationIds?: ReadonlySet<string>;
  allowedModes?: readonly GlobalMapMode[];
}

export interface StationCorrespondenceContext {
  stationIds: string[];
  lineIds: string[];
  lines: GlobalMapLine[];
  nearbyStations: RadiusQueryResult[];
}

/**
 * Query the physical station records around an anchor using the same WGS84
 * radius algorithm as the global map data source. The anchor itself is left
 * in the result so callers can decide whether its own line should be kept.
 */
export function queryStationCorrespondenceStations(
  network: Pick<TransportMapNetwork, "stations">,
  anchor: Pick<GlobalMapStation, "lon" | "lat">,
  radiusMeters = STATION_CORRESPONDENCE_RADIUS_METERS,
): RadiusQueryResult[] {
  // On a sphere the latitude separation is a lower bound on geodesic
  // distance. Reject impossible candidates before allocating radius-query
  // results and computing trigonometry for the entire network per hub.
  // Retain the exact shared radius calculation and ordering for survivors.
  // The tolerance protects points on the boundary from floating-point drift.
  const latitudeDelta = radiusMeters / GEODESIC_EARTH_RADIUS_METERS * 180 / Math.PI + 1e-10;
  const minLatitude = anchor.lat - latitudeDelta;
  const maxLatitude = anchor.lat + latitudeDelta;
  const candidates = Number.isFinite(radiusMeters) && radiusMeters >= 0 && Number.isFinite(anchor.lat)
    ? network.stations.filter((station) => station.lat >= minLatitude && station.lat <= maxLatitude)
    : network.stations;
  return queryStationsWithinRadius(
    candidates,
    { lon: anchor.lon, lat: anchor.lat },
    radiusMeters,
  );
}

/**
 * Build the common station/line context used by the global station sidebar
 * and by nearby heavy access resolution. `anchorStations` may contain the
 * physical members of a grouped station result; nearby results are the
 * additional stops returned by the shared radius query.
 */
export function buildStationCorrespondenceContext(
  anchorStations: readonly Pick<GlobalMapStation, "id" | "lineIds">[],
  nearbyResults: readonly RadiusQueryResult[],
  linesById: ReadonlyMap<string, GlobalMapLine>,
  options: Pick<StationCorrespondenceOptions, "excludedStationIds" | "allowedModes"> = {},
): StationCorrespondenceContext {
  const anchorIds = new Set(anchorStations.map((station) => station.id));
  const excludedStationIds = new Set([
    ...anchorIds,
    ...(options.excludedStationIds ?? []),
  ]);
  const nearbyStations = nearbyResults.filter((result) => !excludedStationIds.has(result.station.id));
  const stationIds = [...new Set([
    ...anchorStations.map((station) => station.id),
    ...nearbyStations.map((result) => result.station.id),
  ])];
  const lineIds = [...new Set([
    ...anchorStations.flatMap((station) => station.lineIds),
    ...nearbyStations.flatMap((result) => result.station.lineIds),
  ])];
  const allowedModes = options.allowedModes ? new Set(options.allowedModes) : undefined;
  const lines = lineIds
    .map((lineId) => linesById.get(lineId))
    .filter((line): line is GlobalMapLine => Boolean(line))
    .filter((line) => !allowedModes || allowedModes.has(line.mode));

  return {
    stationIds,
    lineIds: lines.map((line) => line.id),
    lines,
    nearbyStations,
  };
}
