import { describe, expect, it } from "vitest";
import { buildNeighborMap } from "../server/services/topology/buildLineTopology";
import { getLineTopology } from "../server/services/topology/getLineTopology";
import { loadNetexLineCache } from "../server/services/topology/netexCache";
import { createDetailedLineMapViewModel } from "../src/features/line-map/lineMapData";
import type { LineMapViewModel } from "../src/features/line-map/types";
import { createPatternFlowStructure } from "../src/features/service-pattern/patternFlowStructure";
import { createPatternStationKey } from "../src/features/service-pattern/stationKeys";
import { convertServerTopologyToLineRouteSequences } from "../src/services/idfm";
import type { LineSearchOption } from "../src/types/transit";

const cacheCases = [
  {
    id: "line:IDFM:C01743",
    label: "RER B",
    stationCount: 47,
    branchPoints: ["Aulnay-sous-Bois", "Bourg-la-Reine"],
    terminals: [
      "Aeroport Charles de Gaulle 2 (Terminal 2)",
      "Mitry - Claye",
      "Robinson",
      "Saint-Rémy-lès-Chevreuse",
    ],
  },
  {
    id: "rer-d",
    label: "RER D",
    stationCount: 59,
    branchPoints: [
      "Corbeil-Essonnes",
      "Le Mée",
      "Viry-Châtillon",
      "Villeneuve-Saint-Georges",
    ],
    terminals: ["Creil", "Malesherbes", "Melun"],
  },
  {
    id: "transilien-j",
    label: "Transilien J",
    stationCount: 54,
    branchPoints: [
      "Argenteuil",
      "Asnières-sur-Seine",
      "Conflans-Sainte-Honorine",
      "Mantes Station",
    ],
    terminals: ["Ermont - Eaubonne", "Gare Saint-Lazare", "Gisors", "Vernon - Giverny"],
  },
  {
    id: "tram-t10",
    label: "Tram T10",
    stationCount: 13,
    branchPoints: [],
    terminals: ["Jardin Parisien", "Croix de Berny"],
  },
  {
    id: "metro-4",
    label: "Metro 4",
    stationCount: 29,
    branchPoints: [],
    terminals: ["Bagneux - Lucie Aubrac", "Porte de Clignancourt"],
  },
] as const;

const RER_B_LINE: LineSearchOption = {
  family: "RER",
  id: "line:IDFM:C01743",
  label: "B",
  navitiaId: "line:IDFM:C01743",
  ref: "line:IDFM:C01743",
  color: "#4b65c8",
  textColor: "#ffffff",
};

describe("NeTEx cache topology adapter", () => {
  it.each(cacheCases)(
    "loads $label from the generated backend JSON cache",
    async ({ id, stationCount, branchPoints, terminals }) => {
      const topology = await getLineTopology(id);
      const neighbors = buildNeighborMap(
        topology.stations.map((station) => station.id),
        topology.segments,
      );
      const orphanStations = topology.stations.filter(
        (station) => (neighbors.get(station.id)?.size ?? 0) === 0,
      );

      expect(topology.stations).toHaveLength(stationCount);
      expect(orphanStations).toEqual([]);
      expect(namesForIds(topology, topology.branchPoints)).toEqualNames(branchPoints);
      expect(namesForIds(topology, topology.terminals)).toEqualNames(terminals);
      expect(countComponents(neighbors)).toBe(1);
    },
  );

  it("keeps RER B north and south split points readable for the frontend", async () => {
    const topology = await getLineTopology("rer-b");
    const neighbors = buildNeighborMap(
      topology.stations.map((station) => station.id),
      topology.segments,
    );

    expect(neighborNames(topology, neighbors, "Aulnay-sous-Bois")).toEqualNames([
      "Le Blanc-Mesnil",
      "Sevran - Livry",
      "Sevran Beaudottes",
    ]);
    expect(neighborNames(topology, neighbors, "Bourg-la-Reine")).toEqualNames([
      "Bagneux",
      "Parc de Sceaux",
      "Sceaux",
    ]);
  });

  it("keeps the RER B airport branch connected on the detailed map model", async () => {
    const topology = await getLineTopology("rer-b");
    const sequences = convertServerTopologyToLineRouteSequences(topology);
    const map = createDetailedLineMapViewModel(RER_B_LINE, sequences);

    expect(
      topologyHasEdge(topology, "Parc des Expositions", "Aéroport CDG 1"),
    ).toBe(true);
    expect(mapHasSegment(map, "Parc des Expositions", "Aéroport CDG 1")).toBe(true);
    expect(
      mapHasSegment(
        map,
        "Aéroport CDG 1",
        "Aéroport Charles de Gaulle 2 (Terminal 2)",
      ),
    ).toBe(true);
  });

  it("exposes RER D lasso and parallel alternatives from schematic JSON", async () => {
    const cache = await loadNetexLineCache("rer-d");
    const lasso = cache.schematic.loops.find((loop) => {
      const names = namesForSchematicIds(cache, loop.anchorStationIds);

      return (
        loop.kind === "cycle" &&
        includesName(names, "Villeneuve-Saint-Georges") &&
        includesName(names, "Viry-Châtillon") &&
        includesName(names, "Corbeil-Essonnes")
      );
    });
    const southParallel = cache.schematic.parallelGroups.find((group) => {
      const names = namesForSchematicIds(cache, [group.from, group.to]);

      return (
        includesName(names, "Viry-Châtillon") &&
        includesName(names, "Corbeil-Essonnes")
      );
    });

    expect(lasso?.segmentIds.length).toBeGreaterThanOrEqual(3);
    expect(southParallel?.alternatives).toHaveLength(2);
    expect(
      southParallel?.alternatives.some((alternative) =>
        includesName(namesForSchematicIds(cache, alternative.stationIds), "Grigny Centre"),
      ),
    ).toBe(true);
    expect(
      southParallel?.alternatives.some((alternative) =>
        includesName(namesForSchematicIds(cache, alternative.stationIds), "Ris-Orangis"),
      ),
    ).toBe(true);
  });

  it("verifies every RER D terminus, branch and loop from the generated cache", async () => {
    const cache = await loadNetexLineCache("rer-d");
    const topology = await getLineTopology("rer-d");
    const sequences = convertServerTopologyToLineRouteSequences(topology);
    const graph = createPatternFlowStructure(sequences);
    const terminals = cache.schematic.nodes
      .filter((node) => node.isTerminal)
      .map((node) => node.name);
    const branchTerminalsByJunction = new Map(
      cache.schematic.branchGroups.map((group) => [
        normalizeName(namesForSchematicIds(cache, [group.junctionStationId])[0]),
        group.branches.map((branch) =>
          namesForSchematicIds(cache, [branch.terminalStationId])[0],
        ),
      ]),
    );
    const parallelLoop = cache.schematic.loops.find((loop) => {
      const anchors = namesForSchematicIds(cache, loop.anchorStationIds);

      return (
        loop.kind === "parallel" &&
        includesName(anchors, "Viry-Châtillon") &&
        includesName(anchors, "Corbeil-Essonnes")
      );
    });
    const cycleLoop = cache.schematic.loops.find((loop) => {
      const anchors = namesForSchematicIds(cache, loop.anchorStationIds);

      return (
        loop.kind === "cycle" &&
        includesName(anchors, "Villeneuve-Saint-Georges") &&
        includesName(anchors, "Viry-Châtillon") &&
        includesName(anchors, "Corbeil-Essonnes") &&
        includesName(anchors, "Le Mée")
      );
    });

    expect(terminals).toEqualNames(["Creil", "Malesherbes", "Melun"]);
    expect(graph.terminalKeys).toEqual(
      [stationKey("Creil"), stationKey("Malesherbes"), stationKey("Melun")].sort(),
    );
    expect(graph.terminalKeys).not.toContain(stationKey("Évry - Courcouronnes"));
    expect(graph.terminalKeys).not.toContain(stationKey("Évry - Val de Seine"));
    expect(graph.branchKeys).toEqual(
      [
        stationKey("Corbeil-Essonnes"),
        stationKey("Le Mée"),
        stationKey("Viry-Châtillon"),
        stationKey("Villeneuve-Saint-Georges"),
      ].sort(),
    );
    expect(graph.degreeByKey[stationKey("Corbeil-Essonnes")]).toBe(4);
    expect(graph.degreeByKey[stationKey("Le Mée")]).toBe(3);
    expect(graph.degreeByKey[stationKey("Viry-Châtillon")]).toBe(3);
    expect(graph.degreeByKey[stationKey("Villeneuve-Saint-Georges")]).toBe(3);
    expect(branchTerminalsByJunction.get(normalizeName("Villeneuve-Saint-Georges"))).toEqualNames(["Creil"]);
    expect(branchTerminalsByJunction.get(normalizeName("Corbeil-Essonnes"))).toEqualNames(["Malesherbes"]);
    expect(branchTerminalsByJunction.get(normalizeName("Le Mée"))).toEqualNames(["Melun"]);
    expect(parallelLoop, "RER D doit exposer la double boucle Viry / Corbeil").toBeDefined();
    expect(cycleLoop, "RER D doit exposer le grand cycle sud").toBeDefined();
    const commonLane = parallelLoop?.laneHints?.find((hint) => hint.role === "common");
    const lowerLane = parallelLoop?.laneHints?.find(
      (hint) => hint.role === "alternative" && hint.side === "lower",
    );
    const commonLaneNames = namesForSchematicIds(cache, commonLane?.stationIds ?? []);
    const lowerLaneNames = namesForSchematicIds(cache, lowerLane?.stationIds ?? []);
    const cycleNames = namesForSchematicIds(cache, cycleLoop?.orderedStationIds ?? []);

    expect(commonLane?.lane).toBe(0);
    expect(commonLane?.side).toBe("center");
    expect(includesName(commonLaneNames, "Grand Bourg")).toBe(true);
    expect(includesName(commonLaneNames, "Ris-Orangis")).toBe(true);
    expect(includesName(commonLaneNames, "Evry - Val de Seine")).toBe(true);
    expect(includesName(commonLaneNames, "Grigny Centre")).toBe(false);
    expect(lowerLane?.lane).toBeGreaterThan(0);
    expect(includesName(lowerLaneNames, "Grigny Centre")).toBe(true);
    expect(includesName(lowerLaneNames, "Le Bras de Fer")).toBe(true);
    expect(includesName(lowerLaneNames, "Grand Bourg")).toBe(false);
    expect(includesName(cycleNames, "Grand Bourg")).toBe(true);
    expect(includesName(cycleNames, "Grigny Centre")).toBe(false);
    expect(includesName(cycleNames, "Le Bras de Fer")).toBe(false);
    expect(namesForSchematicIds(cache, parallelLoop?.stationIds ?? [])).toEqual(
      expect.arrayContaining([
        "Grigny Centre",
        "Orangis Bois de l'Épine",
        "Évry - Courcouronnes",
        "Le Bras de Fer",
        "Ris-Orangis",
        "Grand Bourg",
        "Évry - Val de Seine",
      ]),
    );
    expect(namesForSchematicIds(cache, cycleLoop?.stationIds ?? [])).toEqual(
      expect.arrayContaining([
        "Villeneuve-Saint-Georges",
        "Vigneux-sur-Seine",
        "Juvisy",
        "Viry-Châtillon",
        "Corbeil-Essonnes",
        "Le Mée",
        "Montgeron - Crosne",
      ]),
    );
  });

  it("exposes Transilien H cycle loops for schematic corridor layout", async () => {
    const topology = await getLineTopology("transilien-h");
    const cycleLoops = topology.loops.filter((loop) => loop.kind === "cycle");
    const findAnchoredLoop = (expectedAnchors: string[], rejectedAnchors: string[] = []) =>
      cycleLoops.find((loop) => {
        const anchors = namesForIds(topology, loop.anchorStationIds);

        return (
          expectedAnchors.every((anchor) => includesName(anchors, anchor)) &&
          rejectedAnchors.every((anchor) => !includesName(anchors, anchor))
        );
      });
    const northLoop = findAnchoredLoop([
      "Ermont - Eaubonne",
      "Epinay - Villetaneuse",
      "Montsoult - Maffliers",
      "Persan - Beaumont",
      "Valmondois",
    ], ["Saint-Ouen-l'Aumone"]);
    const pontoiseLoop = findAnchoredLoop([
      "Ermont - Eaubonne",
      "Saint-Ouen-l'Aumone",
      "Valmondois",
    ]);
    const chordedLoop = findAnchoredLoop([
      "Epinay - Villetaneuse",
      "Montsoult - Maffliers",
      "Persan - Beaumont",
      "Saint-Ouen-l'Aumone",
    ]);
    const hasAnchoredLoop = (expectedAnchors: string[]) =>
      expectedAnchors.length > 5 ? chordedLoop === undefined : Boolean(northLoop);

    expect(cycleLoops).toHaveLength(2);
    expect(northLoop).toBeDefined();
    expect(pontoiseLoop).toBeDefined();
    expect(chordedLoop).toBeUndefined();

    for (const loop of [northLoop, pontoiseLoop]) {
      expect(loop?.orderedAnchorStationIds).toEqual(loop?.anchorStationIds);
      expect(loop?.orderedSegmentIds).toEqual(loop?.segmentIds);
      expect(loop?.orderedStationIds).toEqual(loop?.stationIds);
      expect(loop?.laneHints).toHaveLength(2);

      const common = loop?.laneHints.find((hint) => hint.role === "common");
      const alternative = loop?.laneHints.find((hint) => hint.role === "alternative");

      expect(common?.lane).toBe(0);
      expect(namesForIds(topology, common?.anchorStationIds ?? [])).toEqualNames([
        "Ermont - Eaubonne",
        "Valmondois",
      ]);
      expect(namesForIds(topology, common?.stationIds ?? [])).toEqual(
        expect.arrayContaining(["Taverny"]),
      );
      expect(alternative?.lane).not.toBe(0);
      expect(alternative?.segmentIds.length).toBeGreaterThanOrEqual(2);
    }
    expect(
      hasAnchoredLoop([
        "Ermont - Eaubonne",
        "Épinay - Villetaneuse",
        "Montsoult - Maffliers",
        "Persan - Beaumont",
        "Valmondois",
      ]),
    ).toBe(true);
    expect(
      hasAnchoredLoop([
        "Ermont - Eaubonne",
        "Épinay - Villetaneuse",
        "Montsoult - Maffliers",
        "Persan - Beaumont",
        "Valmondois",
        "Saint-Ouen-l'Aumône",
      ]),
    ).toBe(true);
    expect(cycleLoops.every((loop) => loop.stationIds.length > 6)).toBe(true);
    expect(cycleLoops.every((loop) => loop.segmentIds.length > 0)).toBe(true);
  });

  it("keeps Transilien J multiple branch junctions from the generated cache", async () => {
    const topology = await getLineTopology("transilien-j");
    const neighbors = buildNeighborMap(
      topology.stations.map((station) => station.id),
      topology.segments,
    );

    expect(neighborNames(topology, neighbors, "Argenteuil")).toEqualNames([
      "Le Stade",
      "Sannois",
      "Val d'Argenteuil",
    ]);
    expect(neighborNames(topology, neighbors, "Conflans-Sainte-Honorine")).toEqualNames([
      "Conflans Fin d'Oise",
      "Herblay",
      "Éragny - Neuville",
    ]);
    expect(neighborNames(topology, neighbors, "Mantes Station")).toEqualNames([
      "Épône - Mézières",
      "Limay",
      "Mantes-la-Jolie",
    ]);
  });

  it("orients the Transilien J cycle around the long Asnieres / Mantes corridor", async () => {
    const cache = await loadNetexLineCache("transilien-j");
    const cycle = cache.schematic.loops.find((loop) => {
      const anchors = namesForSchematicIds(cache, loop.anchorStationIds);

      return (
        loop.kind === "cycle" &&
        includesName(anchors, "Asnieres-sur-Seine") &&
        includesName(anchors, "Mantes Station") &&
        includesName(anchors, "Conflans-Sainte-Honorine") &&
        includesName(anchors, "Argenteuil")
      );
    });
    const laneHints = cycle?.laneHints ?? [];
    const common = laneHints.find((hint) => hint.role === "common");
    const alternative = laneHints.find((hint) => hint.role === "alternative");

    expect(cycle).toBeDefined();
    expect(namesForSchematicIds(cache, common?.anchorStationIds ?? [])).toEqualNames([
      "Asnieres-sur-Seine",
      "Mantes Station",
    ]);
    expect(namesForSchematicIds(cache, alternative?.anchorStationIds ?? [])).toEqualNames([
      "Asnieres-sur-Seine",
      "Mantes Station",
    ]);
    expect(namesForSchematicIds(cache, common?.stationIds ?? [])).toEqual(
      expect.arrayContaining(["Poissy", "Les Mureaux"]),
    );
    expect(namesForSchematicIds(cache, alternative?.stationIds ?? [])).toEqual(
      expect.arrayContaining(["Argenteuil", "Conflans-Sainte-Honorine"]),
    );
  });

  it("attaches raw NeTEx quays to their consolidated station", async () => {
    const topology = await getLineTopology("line:IDFM:C00025");
    const beauregard = topology.stations.find(
      (station) => normalizeName(station.name) === normalizeName("Beauregard"),
    );

    expect(beauregard?.quays).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "FR::Quay:50187203:FR1",
          projectedX: 692475,
          projectedY: 6850339,
        }),
        expect.objectContaining({
          id: "FR::Quay:50187204:FR1",
          projectedX: 692518,
          projectedY: 6850363,
        }),
      ]),
    );
  });

  it("converts cache topology into VueFlow input without orphan nodes", async () => {
    const topology = await getLineTopology("transilien-j");
    const sequences = convertServerTopologyToLineRouteSequences(topology);
    const graph = createPatternFlowStructure(sequences);

    expect(sequences.every((sequence) => sequence.topologySource === "server")).toBe(true);
    expect(graph.componentCount).toBe(1);
    expect(graph.orphanKeys).toEqual([]);
    expect(graph.branchKeys).toEqual(
      expect.arrayContaining([
        stationKey("Argenteuil"),
        stationKey("Conflans-Sainte-Honorine"),
        stationKey("Mantes Station"),
      ]),
    );
    expect(graph.edgeKeys).toEqual(
      expect.arrayContaining([
        edgeKey("Bonnières", "Vernon - Giverny"),
        edgeKey("Limay", "Mantes Station"),
        edgeKey("Conflans Fin d'Oise", "Conflans-Sainte-Honorine"),
      ]),
    );
  });

  it("throws for an unknown line instead of performing a network fallback", async () => {
    await expect(getLineTopology("line:IDFM:UNKNOWN")).rejects.toThrow(
      /No stable NeTEx cache line mapping/,
    );
  });
});

expect.extend({
  toEqualNames(actual: string[], expected: readonly string[]) {
    const normalizedActual = actual.map(normalizeName).sort();
    const normalizedExpected = expected.map(normalizeName).sort();
    const pass = this.equals(normalizedActual, normalizedExpected);

    return {
      pass,
      message: () =>
        `expected ${JSON.stringify(actual)} to equal names ${JSON.stringify(expected)}`,
    };
  },
});

declare module "vitest" {
  interface Assertion<T = any> {
    toEqualNames(expected: readonly string[]): T;
  }
}

function namesForIds(topology: Awaited<ReturnType<typeof getLineTopology>>, ids: string[]): string[] {
  const stationById = new Map(
    topology.stations.map((station) => [station.id, station.name]),
  );

  return ids.map((id) => stationById.get(id) ?? id);
}

function neighborNames(
  topology: Awaited<ReturnType<typeof getLineTopology>>,
  neighbors: Map<string, Set<string>>,
  stationName: string,
): string[] {
  const station = topology.stations.find(
    (candidate) => normalizeName(candidate.name) === normalizeName(stationName),
  );

  expect(station, `Station ${stationName} should exist`).toBeDefined();

  return namesForIds(topology, [...(neighbors.get(station!.id) ?? [])]);
}

function topologyHasEdge(
  topology: Awaited<ReturnType<typeof getLineTopology>>,
  leftName: string,
  rightName: string,
): boolean {
  const stationById = new Map(topology.stations.map((station) => [station.id, station.name]));

  return topology.segments.some((segment) =>
    namesMatchEdge(
      stationById.get(segment.from) ?? "",
      stationById.get(segment.to) ?? "",
      leftName,
      rightName,
    ),
  );
}

function mapHasSegment(
  map: LineMapViewModel,
  leftName: string,
  rightName: string,
): boolean {
  const stopById = new Map(map.stops.map((stop) => [stop.id, stop.label]));

  return map.segments.some((segment) =>
    namesMatchEdge(
      stopById.get(segment.fromStopId) ?? "",
      stopById.get(segment.toStopId) ?? "",
      leftName,
      rightName,
    ),
  );
}

function namesMatchEdge(
  actualLeft: string,
  actualRight: string,
  expectedLeft: string,
  expectedRight: string,
): boolean {
  return (
    stationNameMatches(actualLeft, expectedLeft) &&
    stationNameMatches(actualRight, expectedRight)
  ) || (
    stationNameMatches(actualLeft, expectedRight) &&
    stationNameMatches(actualRight, expectedLeft)
  );
}

function stationNameMatches(actual: string, expected: string): boolean {
  return normalizeName(actual).includes(normalizeName(expected));
}

function countComponents(neighbors: Map<string, Set<string>>): number {
  const remaining = new Set(neighbors.keys());
  let count = 0;

  while (remaining.size > 0) {
    count += 1;
    const [start] = remaining;
    const queue = [start];

    remaining.delete(start);

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const neighbor of neighbors.get(current) ?? []) {
        if (remaining.delete(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
  }

  return count;
}

function namesForSchematicIds(
  cache: Awaited<ReturnType<typeof loadNetexLineCache>>,
  ids: string[],
): string[] {
  const nodeById = new Map(cache.schematic.nodes.map((node) => [node.id, node.name]));

  return ids.map((id) => nodeById.get(id) ?? id);
}

function includesName(names: string[], expected: string): boolean {
  const normalizedExpected = normalizeName(expected);

  return names.some((name) => normalizeName(name).includes(normalizedExpected));
}

function stationKey(label: string): string {
  return createPatternStationKey({
    id: `test:${label}`,
    label,
  });
}

function edgeKey(left: string, right: string): string {
  return [stationKey(left), stationKey(right)].sort().join("--");
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/giu, "")
    .toLowerCase();
}
