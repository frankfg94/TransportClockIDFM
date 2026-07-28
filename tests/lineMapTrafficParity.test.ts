import { describe, expect, it } from "vitest";
import {
  analyzeTrafficImpacts,
  getDisturbedStations,
  getInterruptedStations,
  type PatternTrafficEdge,
  type PatternTrafficStation,
} from "../src/features/service-pattern/trafficImpactAnalysis";
import { createLineMapTrafficGraph } from "../src/features/line-map/lineMapTrafficGraph";
import type { LineMapViewModel } from "../src/features/line-map/types";
import type { TrafficDisruption } from "../src/features/traffic/types";

describe("line map traffic parity", () => {
  it("shows the same interrupted and disturbed station count in Schéma and Carte for Transilien P", () => {
    const stationDefinitions = [
      ["paris-est", "Gare de l'Est"],
      ["tournan", "Tournan"],
      ["faremoutiers", "Faremoutiers - Pommeuse"],
      ["coulommiers", "Coulommiers"],
    ] as const;
    const schemaStations: PatternTrafficStation[] = stationDefinitions.map(
      ([key, label], index) => ({
        key,
        label,
        branchEnd: index === 0 || index === stationDefinitions.length - 1,
      }),
    );
    const schemaEdges: PatternTrafficEdge[] = stationDefinitions
      .slice(0, -1)
      .map(([source], index) => ({
        id: `${source}--${stationDefinitions[index + 1][0]}`,
        source,
        target: stationDefinitions[index + 1][0],
      }));
    const map: LineMapViewModel = {
      lineId: "line:IDFM:C01730",
      lineLabel: "P",
      lineColor: "#ef8c2f",
      textColor: "#ffffff",
      geometrySource: "gtfs",
      geometryAttempts: [{ source: "gtfs", status: "success" }],
      entrances: [],
      tiles: [],
      branches: [
        {
          id: "tournan-coulommiers",
          label: "Tournan - Coulommiers",
          stopIds: stationDefinitions.map(([id]) => id),
        },
      ],
      stops: stationDefinitions.map(([id, label], index) => ({
        id,
        label,
        lon: 2.3 + index * 0.01,
        lat: 48.8 + index * 0.01,
        x: 0.2 + index * 0.2,
        y: 0.5,
        routeIds: ["tournan-coulommiers"],
        routeLabels: ["Tournan - Coulommiers"],
        station: { id, label, monitoringRef: id },
      })),
      segments: schemaEdges.map((edge) => ({
        id: edge.id!,
        fromStopId: edge.source,
        toStopId: edge.target,
      })),
    };
    const disruption: TrafficDisruption = {
      id: "transilien-p-summer-works",
      title: "Tournan <> Coulommiers : Trafic interrompu",
      message:
        "Tournan <> Coulommiers : Trafic interrompu. Des bus de remplacement circulent.",
      kind: "works",
      severity: "perturbée",
      applicationPeriods: [],
      impactedLineRefs: ["line:IDFM:C01730"],
      impactedStopNames: ["Tournan", "Coulommiers"],
    };

    const schemaAnalysis = analyzeTrafficImpacts(
      [disruption],
      schemaStations,
      schemaEdges,
    );
    const mapGraph = createLineMapTrafficGraph(map);
    const mapAnalysis = analyzeTrafficImpacts(
      [disruption],
      mapGraph.stations,
      mapGraph.edges,
    );
    const getDisplayedImpactCount = (analysis: typeof schemaAnalysis) =>
      new Set([
        ...getInterruptedStations(analysis),
        ...getDisturbedStations(analysis),
      ]).size;

    expect(getDisplayedImpactCount(schemaAnalysis)).toBeGreaterThan(0);
    expect(getDisplayedImpactCount(mapAnalysis)).toBe(
      getDisplayedImpactCount(schemaAnalysis),
    );
    expect(getInterruptedStations(mapAnalysis).sort()).toEqual(
      getInterruptedStations(schemaAnalysis).sort(),
    );
  });
});
