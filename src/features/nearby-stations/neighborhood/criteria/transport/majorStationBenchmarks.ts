import type { TransportMapNetwork } from "../../../../transport-map/contracts/network";
import { NEARBY_HEAVY_TRANSPORT_MODES } from "../../../nearbyHeavyTransportRules";
import { createNeighborhoodStationReferenceResolver, normalizeStationName } from "../../../neighborhoodStationReferences";

export interface JourneyReferenceBenchmark {
  id: string;
  label: string;
  names: readonly string[];
  employment?: boolean;
}

export const MAJOR_STATION_BENCHMARKS: readonly JourneyReferenceBenchmark[] = [
  { id: "montparnasse", label: "Gare Montparnasse", names: ["gare montparnasse", "montparnasse bienvenue", "montparnasse"] },
  { id: "saint-lazare", label: "Gare Saint-Lazare", names: ["gare saint lazare", "saint lazare"] },
  { id: "gare-de-lyon", label: "Gare de Lyon", names: ["gare de lyon", "lyon"] },
  { id: "gare-du-nord", label: "Gare du Nord", names: ["gare du nord", "du nord"] },
];

/** Economic poles identified by INSEE (Flores 2022), not an exhaustive ranking.
 * https://www.insee.fr/fr/statistiques/8637336
 * Coordinates and station references are always resolved from the live catalog.
 */
export const EMPLOYMENT_HUB_BENCHMARKS: readonly JourneyReferenceBenchmark[] = [
  { id: "employment-la-defense", label: "La Défense", names: ["la defense", "la defense grande arche"], employment: true },
  { id: "employment-val-de-fontenay", label: "Val de Fontenay", names: ["val de fontenay"], employment: true },
  { id: "employment-plaine-saint-denis", label: "La Plaine Saint-Denis", names: ["saint denis pleyel"], employment: true },
  { id: "employment-nanterre", label: "Nanterre La Folie", names: ["nanterre la folie"], employment: true },
];

export const JOURNEY_REFERENCE_BENCHMARKS = [...MAJOR_STATION_BENCHMARKS, ...EMPLOYMENT_HUB_BENCHMARKS];
export function resolveReferenceBenchmarkDestinations(network: TransportMapNetwork) {
  const resolveReference = createNeighborhoodStationReferenceResolver(network.stations, 250);
  const heavyStations = network.stations.filter(station => station.lineIds.some(id => {
    const mode = network.linesById.get(id)?.mode;
    return mode && NEARBY_HEAVY_TRANSPORT_MODES.includes(mode);
  })).sort((left, right) => Number(right.isHub) - Number(left.isHub)
    || right.lineIds.length - left.lineIds.length || left.id.localeCompare(right.id))
    .map(station => ({ station, names: [station.name, ...station.aliases].map(normalizeStationName) }));
  return JOURNEY_REFERENCE_BENCHMARKS.flatMap(benchmark => {
    const destination = heavyStations.find(({ names }) => {
      return benchmark.names.some(candidate => names.some(name => name === candidate || (!benchmark.employment && name.includes(candidate))));
    })?.station;
    return destination ? [{ id: benchmark.id, label: benchmark.label, stationLabel: destination.name,
      lon: destination.lon, lat: destination.lat, destinationRef: resolveReference(destination) }] : [];
  });
}
