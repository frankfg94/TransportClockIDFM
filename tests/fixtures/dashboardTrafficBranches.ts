import { buildLineTopologyFromFixture } from "../../server/services/topology/buildLineTopology";
import type { TrafficDisruption } from "../../src/features/traffic/types";
import type { TransitBoardConfig } from "../../src/types/transit";

export const rerALineRef = "line:IDFM:C01742";
const stations = [
  ["poissy", "Poissy"],
  ["cergy", "Cergy le Haut"],
  ["maisons", "Maisons-Laffitte"],
  ["sartrouville", "Sartrouville"],
  ["germain", "Saint-Germain-en-Laye"],
  ["nanterre", "Nanterre - Préfecture"],
  ["chatelet", "Châtelet-Les Halles"],
  ["vincennes", "Vincennes"],
  ["boissy", "Boissy-Saint-Léger"],
  ["marne", "Marne-la-Vallée - Chessy"],
] as const;

export const rerABranchTopology = buildLineTopologyFromFixture({
  line: { id: rerALineRef, aliases: [], name: "RER A", shortName: "A", mode: "rer" },
  stations: stations.map(([id, name]) => ({
    id,
    name,
    aliases: id === "boissy" ? ["stop_area:IDFM:test-boissy"] : [],
  })),
  patterns: [
    ["poissy", "maisons", "sartrouville", "nanterre", "chatelet", "vincennes", "boissy"],
    ["cergy", "maisons", "sartrouville", "nanterre", "chatelet", "vincennes", "marne"],
    ["germain", "nanterre", "chatelet", "vincennes", "boissy"],
  ].map((stops) => ({
    id: stops.join("-"),
    terminalFrom: stops[0]!,
    terminalTo: stops.at(-1)!,
    stops,
    tripCount: 1,
  })),
});

export function rerABoard(id: string): TransitBoardConfig {
  return {
    id,
    title: stations.find(([station]) => station === id)?.[1] ?? id,
    city: "",
    line: { ref: rerALineRef, shortName: "A", longName: "RER A", mode: "rer", color: "#e3051c", textColor: "#fff" },
    monitoringPoints: [],
    directionGroups: [],
    maxDepartures: 8,
  };
}

export function rerADisruption(
  id: string,
  message: string,
  overrides: Partial<TrafficDisruption> = {},
): TrafficDisruption {
  return {
    id,
    title: id,
    message,
    kind: "incident",
    applicationPeriods: [],
    impactedLineRefs: [rerALineRef],
    impactedStopNames: [],
    ...overrides,
  };
}
