import type { TransportMapNetwork } from "../transport-map/contracts/network";
import type { GlobalMapStation } from "../transport-map/contracts/manifest";
import { getCoordinatesDistanceMeters } from "../../services/distance";
import { normalizeStationName } from "./neighborhoodStationReferences";
import type { PublicFutureGpeStation, PublicNeighborhoodVerdict } from "./neighborhoodVerdictApi";

// Historical project points and current platforms can differ within one hub.
// Require both a compatible name and the same metro line within this radius.
const STATION_MATCH_RADIUS_METERS = 500;

function metroLineCode(value: string): string {
  return normalizeStationName(value).replace(/^(?:metro|ligne|m)\s*(?=\d)/u, "").replace(/\s+/gu, "");
}

/** Index only the current catalogue; a different line at the same hub is not proof of opening. */
export function createFutureGpeProjectFilter(network: TransportMapNetwork | undefined): (project: PublicFutureGpeStation) => boolean {
  const stationsByLineAndName = new Map<string, GlobalMapStation[]>();
  for (const line of network?.lines ?? []) {
    if (line.mode !== "METRO") continue;
    const codes = new Set([line.code, line.label, ...line.aliases].map(metroLineCode).filter(Boolean));
    if (!codes.size) continue;
    const stationIds = new Set(line.stationIds);
    for (const station of network?.stations ?? []) {
      if (!stationIds.has(station.id) && !station.lineIds.includes(line.id)) continue;
      for (const name of new Set([station.name, ...station.aliases].map(normalizeStationName).filter(Boolean))) {
        for (const code of codes) {
          const key = code + ":" + name;
          const stations = stationsByLineAndName.get(key) ?? [];
          stations.push(station);
          stationsByLineAndName.set(key, stations);
        }
      }
    }
  }
  return project => project.projectStatus !== "open" && !(stationsByLineAndName
    .get(metroLineCode(project.line) + ":" + normalizeStationName(project.name)) ?? [])
    .some(station => getCoordinatesDistanceMeters(project.lat, project.lon, station.lat, station.lon) <= STATION_MATCH_RADIUS_METERS);
}

/** Reconcile documentary facts and their capped bonus as well as route targets. */
export function reconcileFutureGpeVerdict(
  verdict: PublicNeighborhoodVerdict | undefined,
  isFutureProject: (project: PublicFutureGpeStation) => boolean,
): PublicNeighborhoodVerdict | undefined {
  if (!verdict) return verdict;
  const removedFactIds = new Set((verdict.futureProjects ?? []).filter(project => !isFutureProject(project)).map(project => "gpe-" + project.id));
  if (!removedFactIds.size) return verdict;
  return {
    ...verdict,
    futureProjects: verdict.futureProjects?.filter(isFutureProject),
    categories: verdict.categories.map(category => {
      if (category.id !== "transport") return category;
      const positiveFacts = category.positiveFacts.filter(fact => !removedFactIds.has(fact.id));
      const oldBonus = Math.min(1, category.positiveFacts.filter(fact => fact.family === "future-gpe").length);
      const newBonus = Math.min(1, positiveFacts.filter(fact => fact.family === "future-gpe").length);
      return {
        ...category,
        positiveFacts,
        negativeFacts: category.negativeFacts.filter(fact => !removedFactIds.has(fact.id)),
        neutralFacts: category.neutralFacts?.filter(fact => !removedFactIds.has(fact.id)),
        scoreDelta: category.scoreDelta === undefined ? undefined : category.scoreDelta - oldBonus + newBonus,
      };
    }),
  };
}
