import type { GlobalMapMode } from "../transport-map/contracts/manifest";

export interface LineOptimizerConfig {
  transportType: string;
  lineCode: string;
  mode: GlobalMapMode;
  connectingLineCode: string;
  connectingMode: GlobalMapMode;
  transferName: string;
  defaultOrigin: string;
  defaultDestination: string;
}

// V1 is deliberately explicit about supported corridors. New lines can reuse
// the engine and route without inheriting assumptions about the T10 corridor.
const configs: LineOptimizerConfig[] = [
  {
    transportType: "tram",
    lineCode: "T10",
    mode: "TRAM",
    connectingLineCode: "B",
    connectingMode: "RER",
    transferName: "La Croix de Berny",
    defaultOrigin: "277 avenue de la Division Leclerc, Châtenay-Malabry",
    defaultDestination: "Châtelet les Halles",
  },
];

export function resolveLineOptimizerConfig(transportType: string, lineCode: string) {
  return configs.find(
    (config) =>
      config.transportType === transportType.toLowerCase() &&
      config.lineCode === lineCode.toUpperCase(),
  );
}

export function optimizerNameKey(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\([^)]*\)/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}
