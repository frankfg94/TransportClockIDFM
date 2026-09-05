import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import type { GlobalMapLine, GlobalMapMode, GlobalMapStation } from "../transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../transport-map/contracts/network";
import type { RadiusQueryResult } from "../transport-map/spatial/radiusQuery";
import {
  GLOBAL_MAP_SEARCH_SAME_NAME_MERGE_MAX_DISTANCE_M,
  groupGlobalMapStations,
  type GlobalMapStationSearchGroup,
} from "../transport-map/search/globalMapSearch";
import { getCoordinatesDistanceMeters } from "../../services/distance";
import type { GlobalMapDashboardTarget } from "../transport-map/adapters/dashboard";

export const NEARBY_RADIUS_MIN_METERS = 200;
export const NEARBY_RADIUS_MAX_METERS = 1_500;
export const NEARBY_RADIUS_STEP_METERS = 100;
export const NEARBY_RADIUS_DEFAULT_METERS = 600;
export const NEARBY_MAP_MARGIN_METERS = 200;
export const NEARBY_CLUSTER_GROUPING_MIN_METERS = 0;
export const NEARBY_CLUSTER_GROUPING_MAX_METERS = 500;
export const NEARBY_CLUSTER_GROUPING_STEP_METERS = 50;
export const NEARBY_CLUSTER_GROUPING_DEFAULT_METERS = GLOBAL_MAP_SEARCH_SAME_NAME_MERGE_MAX_DISTANCE_M;

export const NEARBY_SUPPORTED_MODES: GlobalMapMode[] = [
  "METRO", "RER", "TRAIN", "TRANSILIEN", "TRAM", "CABLE", "BUS", "NOCTILIEN",
];

export interface NearbyStationEntry {
  id: string;
  station: GlobalMapStationSearchGroup;
  memberStations: GlobalMapStation[];
  lines: GlobalMapLine[];
  distanceMeters: number;
  /** Distance from the origin to the closest physical member serving a line. */
  lineDistanceMeters?: Readonly<Record<string, number>>;
  /** Per-line radius eligibility, so a nearby physical hub cannot leak a distant line. */
  lineInsideRadius?: Readonly<Record<string, boolean>>;
  insideRadius: boolean;
}

export interface NearbyStationSelection {
  stationId: string;
  lineIds: string[];
}

export function normalizeNearbyRadius(value: number): number {
  if (!Number.isFinite(value)) return NEARBY_RADIUS_DEFAULT_METERS;
  const rounded = Math.round(value / NEARBY_RADIUS_STEP_METERS) * NEARBY_RADIUS_STEP_METERS;
  return Math.min(NEARBY_RADIUS_MAX_METERS, Math.max(NEARBY_RADIUS_MIN_METERS, rounded));
}

export function normalizeNearbyClusterGrouping(value: number): number {
  if (!Number.isFinite(value)) return NEARBY_CLUSTER_GROUPING_DEFAULT_METERS;
  const rounded = Math.round(value / NEARBY_CLUSTER_GROUPING_STEP_METERS) * NEARBY_CLUSTER_GROUPING_STEP_METERS;
  return Math.min(NEARBY_CLUSTER_GROUPING_MAX_METERS, Math.max(NEARBY_CLUSTER_GROUPING_MIN_METERS, rounded));
}

export interface NearbyStationEntryBuildOptions {
  clusterGroupingDistanceMeters?: number;
}

export function buildNearbyStationEntries(
  results: RadiusQueryResult[],
  network: TransportMapNetwork,
  origin: Pick<GeocoderPoint, "lon" | "lat">,
  radiusMeters: number,
  options: NearbyStationEntryBuildOptions = {},
): NearbyStationEntry[] {
  const candidates = results.map((result) => result.station);
  const candidateIds = new Set(candidates.map((station) => station.id));
  const clusterGroupingDistanceMeters = normalizeNearbyClusterGrouping(
    options.clusterGroupingDistanceMeters ?? NEARBY_CLUSTER_GROUPING_DEFAULT_METERS,
  );
  return groupGlobalMapStations(candidates, network.lines, { sameNameMergeMaxDistanceM: clusterGroupingDistanceMeters })
    .map((station) => {
      const memberStations = station.memberStationIds
        .map((id) => network.stationsById.get(id))
        .filter((member): member is GlobalMapStation => Boolean(member && candidateIds.has(member.id)));
      const lineIds = new Set(memberStations.flatMap((member) => member.lineIds));
      const lines = [...lineIds]
        .map((id) => network.linesById.get(id))
        .filter((line): line is GlobalMapLine => Boolean(line && NEARBY_SUPPORTED_MODES.includes(line.mode)))
        .sort(compareLines);
      const lineDistanceMeters: Record<string, number> = {};
      for (const member of memberStations) {
        const memberDistanceMeters = getCoordinatesDistanceMeters(origin.lat, origin.lon, member.lat, member.lon);
        for (const lineId of member.lineIds) {
          lineDistanceMeters[lineId] = Math.min(
            lineDistanceMeters[lineId] ?? Number.POSITIVE_INFINITY,
            memberDistanceMeters,
          );
        }
      }
      const distanceMeters = Math.min(...Object.values(lineDistanceMeters));
      const lineInsideRadius = Object.fromEntries(
        Object.entries(lineDistanceMeters).map(([lineId, distance]) => [lineId, distance <= radiusMeters]),
      );
      return {
        id: station.id,
        station,
        memberStations,
        lines,
        distanceMeters,
        lineDistanceMeters,
        lineInsideRadius,
        insideRadius: distanceMeters <= radiusMeters,
      } satisfies NearbyStationEntry;
    })
    .filter((entry) => entry.memberStations.length > 0 && entry.lines.length > 0)
    .sort((left, right) => left.distanceMeters - right.distanceMeters || left.station.name.localeCompare(right.station.name));
}

export function selectionToDashboardTargets(
  entries: NearbyStationEntry[],
  selections: NearbyStationSelection[],
): GlobalMapDashboardTarget[] {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  return selections.flatMap((selection) => {
    const entry = entryById.get(selection.stationId);
    if (!entry) return [];
    return selection.lineIds.flatMap((lineId) => {
      const line = entry.lines.find((candidate) => candidate.id === lineId);
      const station = entry.memberStations
        .filter((candidate) => candidate.lineIds.includes(lineId))
        .sort((left, right) => distanceBetweenStations(left, entry.station) - distanceBetweenStations(right, entry.station))[0];
      return line && station ? [{ line, station }] : [];
    });
  });
}

function compareLines(left: GlobalMapLine, right: GlobalMapLine): number {
  const modeDifference = NEARBY_SUPPORTED_MODES.indexOf(left.mode) - NEARBY_SUPPORTED_MODES.indexOf(right.mode);
  return modeDifference || left.code.localeCompare(right.code, "fr", { numeric: true });
}

function distanceBetweenStations(left: Pick<GlobalMapStation, "lat" | "lon">, right: Pick<GlobalMapStation, "lat" | "lon">): number {
  return getCoordinatesDistanceMeters(left.lat, left.lon, right.lat, right.lon);
}
