import type { GlobalMapStation } from "../transport-map/contracts/manifest";
import { getCoordinatesDistanceMeters } from "../../services/distance";

/** Retain the official namespace; a monomodal stop place is not a quay with the same number. */
export function getOfficialStationReference(station: Pick<GlobalMapStation, "rawRefs">): string | undefined {
  const refs = station.rawRefs.map(ref => ref.trim());
  const reference = refs.find(ref => ref.startsWith("stop_area:"))
    ?? refs.find(ref => /^IDFM:(?:(?:stopPlace|monomodalStopPlace|quay):)?\d+$/u.test(ref))
    ?? refs.find(ref => /^\d+$/u.test(ref));
  if (!reference) return undefined;
  return reference.startsWith("stop_area:") ? reference : `stop_area:${reference.startsWith("IDFM:") ? reference : `IDFM:${reference}`}`;
}

type StationReferenceQuery = Pick<GlobalMapStation, "rawRefs" | "name" | "aliases" | "lat" | "lon">;
export type NeighborhoodStationReferenceResolver = (station: StationReferenceQuery) => string | undefined;

function normalizeStationName(name: string): string {
  return name.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr-FR").replace(/[^\p{Letter}\p{Number}]+/gu, " ").trim();
}

/** Build the official name index once for a batch, rather than scanning every station per target. */
export function createNeighborhoodStationReferenceResolver(
  stations: readonly GlobalMapStation[],
  radiusMeters: number,
): NeighborhoodStationReferenceResolver {
  let byName: Map<string, Array<{ station: GlobalMapStation; reference: string }>> | undefined;
  return (station) => {
    const direct = getOfficialStationReference(station);
    if (direct) return direct;
    if (!byName) {
      byName = new Map();
      for (const candidate of stations) {
        const reference = getOfficialStationReference(candidate);
        if (!reference) continue;
        const names = new Set([candidate.name, ...candidate.aliases].map(normalizeStationName).filter(Boolean));
        for (const name of names) {
          const entries = byName.get(name) ?? [];
          entries.push({ station: candidate, reference });
          byName.set(name, entries);
        }
      }
    }
    const names = new Set([station.name, ...station.aliases].map(normalizeStationName).filter(Boolean));
    const references = new Set<string>();
    for (const name of names) {
      for (const candidate of byName.get(name) ?? []) {
        if (getCoordinatesDistanceMeters(station.lat, station.lon, candidate.station.lat, candidate.station.lon) <= radiusMeters) {
          references.add(candidate.reference);
        }
      }
    }
    return references.size === 1 ? references.values().next().value : undefined;
  };
}

/** Resolve a NeTEx-only quay through an unambiguous co-located named station. */
export function resolveNeighborhoodStationReference(
  station: StationReferenceQuery,
  stations: readonly GlobalMapStation[],
  radiusMeters: number,
): string | undefined {
  return createNeighborhoodStationReferenceResolver(stations, radiusMeters)(station);
}
