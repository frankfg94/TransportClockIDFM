import type { TransportMapNetwork } from "../transport-map/contracts/network";
import type { NearbyJourneySection, NearbyJourneyServiceType } from "./nearbyHeavyTransports";

/**
 * Infer a rail/service pattern only when both endpoints and every served stop
 * can be matched to the loaded ordered line topology. This keeps the UI
 * data-driven and avoids guessing from a line code or a stop count alone.
 */
export function inferTravelServiceType(
  section: NearbyJourneySection,
  network: TransportMapNetwork | undefined,
  resolvedLineId?: string,
): NearbyJourneyServiceType | undefined {
  if (section.serviceType) return section.serviceType;
  if (!network || !resolvedLineId) return undefined;

  const stopNames = section.stopNames
    ?.map((name) => normalizeTravelStationName(name))
    .filter(Boolean);
  if (!stopNames || stopNames.length < 2) return undefined;

  const line = resolvedLineId ? network.linesById.get(resolvedLineId) : undefined;
  const resolvedLine = line ?? [...network.linesById.values()].find((candidate) => {
    const wanted = [section.lineId, section.lineCode, ...(section.lineAliases ?? [])]
      .filter((value): value is string => Boolean(value))
      .map(normalizeTravelLineReference);
    const references = [candidate.id, candidate.code, candidate.label, ...candidate.aliases]
      .map(normalizeTravelLineReference);
    return wanted.some((reference) => references.includes(reference));
  });
  if (!resolvedLine) return undefined;

  const stations = resolvedLine.stationIds
    .map((stationId) => network.stationsById.get(stationId))
    .filter((station): station is NonNullable<typeof station> => Boolean(station));
  if (stations.length < 2) return undefined;

  const indexesForName = (name: string): number[] => stations.flatMap((station, index) =>
    stationNameKeys(station).has(name) ? [index] : [],
  );
  const firstIndexes = indexesForName(stopNames[0]!);
  const lastIndexes = indexesForName(stopNames.at(-1)!);
  if (firstIndexes.length === 0 || lastIndexes.length === 0) return undefined;

  let best: { start: number; end: number; served: Set<number> } | undefined;
  for (const first of firstIndexes) {
    for (const last of lastIndexes) {
      if (first === last) continue;
      const start = Math.min(first, last);
      const end = Math.max(first, last);
      const served = new Set<number>();
      let allMatched = true;
      for (const name of stopNames) {
        const matches = indexesForName(name).filter((index) => index >= start && index <= end);
        if (matches.length === 0) {
          allMatched = false;
          break;
        }
        served.add(matches[0]!);
      }
      if (!allMatched || served.size < 2) continue;
      if (!best || end - start < best.end - best.start) best = { start, end, served };
    }
  }
  if (!best) return undefined;
  return best.end - best.start + 1 > best.served.size ? "semi-direct" : "omnibus";
}

function normalizeTravelStationName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/\s*\([^)]*\)\s*/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function normalizeTravelLineReference(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/^(?:line:)?idfm:/u, "")
    .replace(/[^a-z0-9]+/gu, "");
}

function stationNameKeys(station: { name: string; normalizedName: string; aliases: string[] }): Set<string> {
  return new Set([station.name, station.normalizedName, ...station.aliases]
    .map(normalizeTravelStationName)
    .filter(Boolean));
}
