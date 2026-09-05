import type { GlobalMapStation } from "../transport-map/contracts/manifest";

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
  if (firstCity && firstCityStation) firstCity.departureStation = firstCityStation.name;
  if (lastCity && lastCityStation) lastCity.terminalStation = lastCityStation.name;

  return cities;
}
