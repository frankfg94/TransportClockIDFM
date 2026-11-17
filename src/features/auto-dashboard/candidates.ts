import type { NearbyStationEntry } from "../nearby-stations/nearbyStations";
import { getCoordinatesDistanceMeters } from "../../services/distance";
import type { GlobalMapDashboardTarget } from "../transport-map/adapters/dashboard";
import { autoDashboardLimitSeconds } from "./eligibility";

export interface AutoDashboardCandidate extends GlobalMapDashboardTarget {
  key: string;
  straightLineMeters: number;
}

/** Select an actual physical stop for each supported line, independently. */
export function collectAutoDashboardCandidates(
  entries: readonly NearbyStationEntry[],
  origin: { lat: number; lon: number },
  maxDistanceMeters: number,
): AutoDashboardCandidate[] {
  const candidates = new Map<string, AutoDashboardCandidate>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (autoDashboardLimitSeconds(line.mode) === undefined) continue;
      for (const station of entry.memberStations) {
        if (!station.lineIds.includes(line.id)) continue;
        const distance = getCoordinatesDistanceMeters(origin.lat, origin.lon, station.lat, station.lon);
        if (!Number.isFinite(distance) || distance > maxDistanceMeters) continue;
        const key = JSON.stringify([station.id, line.id]);
        candidates.set(key, { key, line, station, straightLineMeters: distance });
      }
    }
  }
  return [...candidates.values()].sort((a, b) =>
    a.straightLineMeters - b.straightLineMeters || a.key.localeCompare(b.key),
  );
}
