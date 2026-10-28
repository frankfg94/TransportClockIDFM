import type { GlobalMapLine, GlobalMapPath, GlobalMapStation } from "../transport-map/contracts/manifest";

export interface CitiesLinePatternCity {
  name: string;
  departureStation?: string;
  terminalStation?: string;
  highlighted?: boolean;
}

export type CitiesLinePatternStation = Pick<GlobalMapStation, "name" | "city">;

export function normalizeCityPatternLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

export function buildCitiesLinePatternCities(
  stations: readonly CitiesLinePatternStation[],
  highlightedCityNames: readonly string[] = [],
  showEndpoints = true,
): CitiesLinePatternCity[] {
  const highlightedKeys = new Set(
    highlightedCityNames
      .map(normalizeCityPatternLabel)
      .filter(Boolean),
  );
  const firstCityStation = stations.find((station) => Boolean(station.city?.trim()));
  const lastCityStation = [...stations]
    .reverse()
    .find((station) => Boolean(station.city?.trim()));
  const seenCities = new Set<string>();
  const cities: CitiesLinePatternCity[] = [];

  for (const station of stations) {
    const city = station.city?.trim();
    if (!city) continue;

    const cityKey = normalizeCityPatternLabel(city);
    if (!cityKey || seenCities.has(cityKey)) continue;
    seenCities.add(cityKey);
    cities.push({
      name: city,
      ...(highlightedKeys.has(cityKey) ? { highlighted: true } : {}),
    });
  }

  const firstCity = cities[0];
  const lastCity = cities.at(-1);
  if (showEndpoints && firstCity && firstCityStation) firstCity.departureStation = firstCityStation.name;
  if (showEndpoints && lastCity && lastCityStation) lastCity.terminalStation = lastCityStation.name;

  return cities;
}

/** Catalogue membership has no route order. Only a complete, unbranched path
 * can supply endpoints for a merged line; branches and loops stay unlabelled. */
export function orderLineCityStations(
  line: GlobalMapLine,
  stations: readonly GlobalMapStation[],
  paths: readonly GlobalMapPath[],
): { stations: GlobalMapStation[]; ordered: boolean } {
  const byId = new Map(stations.map((station) => [station.id, station]));
  const ids = new Set(line.stationIds);
  const neighbors = new Map<string, Set<string>>();
  let repeatedStop = false;
  for (const path of paths) {
    if (path.lineId !== line.id) continue;
    const sequence = path.stationIds.filter((id, index, values) => index === 0 || id !== values[index - 1]);
    if (new Set(sequence).size !== sequence.length) repeatedStop = true;
    for (let index = 1; index < path.stationIds.length; index++) {
      const a = path.stationIds[index - 1]!;
      const b = path.stationIds[index]!;
      if (a === b || !ids.has(a) || !ids.has(b)) continue;
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    }
  }
  const endpoints = [...neighbors.keys()].filter((id) => neighbors.get(id)!.size === 1);
  if (!repeatedStop && endpoints.length === 2 && neighbors.size === ids.size && [...neighbors.values()].every((edges) => edges.size <= 2)) {
    // Keep the provider's orientation when both reverse patterns are present.
    const start = paths.flatMap((path) => path.lineId === line.id ? path.stationIds : [])
      .find((id) => endpoints.includes(id))!;
    const orderedIds: string[] = [];
    let current: string | undefined = start;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      orderedIds.push(current);
      seen.add(current);
      current = [...neighbors.get(current)!].find((id) => !seen.has(id));
    }
    if (seen.size === ids.size && orderedIds.every((id) => byId.has(id))) {
      return { stations: orderedIds.map((id) => byId.get(id)!), ordered: true };
    }
  }
  return {
    stations: [...ids].flatMap((id) => byId.has(id) ? [byId.get(id)!] : [])
      .sort((a, b) => (a.city ?? a.name).localeCompare(b.city ?? b.name, "fr")),
    ordered: false,
  };
}
