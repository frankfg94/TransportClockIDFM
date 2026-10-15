import type { TransportMapNetwork } from "../../../transport-map/contracts/network";
import { NEARBY_HEAVY_TRANSPORT_MODES } from "../../nearbyHeavyTransportRules";
import { createNeighborhoodStationReferenceResolver, normalizeStationName } from "../../neighborhoodStationReferences";

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

/**
 * Employment poles in the Grand Paris Express study (INSEE, Flores 2022), plus
 * Vélizy represented by its T6 Vélizy 2 station. This is not an exhaustive
 * ranking. Coordinates and station references are resolved from the live catalog.
 * https://www.insee.fr/fr/statistiques/8637336
 */
export const EMPLOYMENT_HUB_BENCHMARKS: readonly JourneyReferenceBenchmark[] = [
  { id: "employment-la-defense", label: "La Défense", names: ["la defense", "la defense grande arche"], employment: true },
  { id: "employment-val-de-fontenay", label: "Val de Fontenay", names: ["val de fontenay"], employment: true },
  { id: "employment-plaine-saint-denis", label: "La Plaine Saint-Denis", names: ["saint denis pleyel"], employment: true },
  { id: "employment-nanterre", label: "Nanterre La Folie", names: ["nanterre la folie"], employment: true },
  { id: "employment-velizy", label: "Vélizy", names: ["velizy 2"], employment: true },
];

export const JOURNEY_REFERENCE_BENCHMARKS = [...MAJOR_STATION_BENCHMARKS, ...EMPLOYMENT_HUB_BENCHMARKS];
export function resolveReferenceBenchmarkDestinations(network: TransportMapNetwork) {
  const resolveReference = createNeighborhoodStationReferenceResolver(network.stations, 250);
  // Keep major-station references on heavy modes; configured employment hubs
  // may also resolve to a tram stop such as T6 Vélizy 2.
  const referenceStations = network.stations.map(station => {
    const modes = station.lineIds.map(id => network.linesById.get(id)?.mode);
    return {
      station,
      names: [station.name, ...station.aliases].map(normalizeStationName),
      hasHeavyMode: modes.some(mode => mode !== undefined && NEARBY_HEAVY_TRANSPORT_MODES.includes(mode)),
      hasTramMode: modes.some(mode => mode === "TRAM"),
    };
  }).filter(({ hasHeavyMode, hasTramMode }) => hasHeavyMode || hasTramMode)
    .sort((left, right) => Number(right.station.isHub) - Number(left.station.isHub)
      || right.station.lineIds.length - left.station.lineIds.length || left.station.id.localeCompare(right.station.id));
  return JOURNEY_REFERENCE_BENCHMARKS.flatMap(benchmark => {
    const destination = referenceStations.find(({ names, hasHeavyMode, hasTramMode }) => {
      const supportsBenchmarkMode = hasHeavyMode || (benchmark.employment === true && hasTramMode);
      return supportsBenchmarkMode && benchmark.names.some(candidate => names.some(name => name === candidate || (!benchmark.employment && name.includes(candidate))));
    })?.station;
    return destination ? [{ id: benchmark.id, label: benchmark.label, stationLabel: destination.name,
      lon: destination.lon, lat: destination.lat, destinationRef: resolveReference(destination) }] : [];
  });
}
