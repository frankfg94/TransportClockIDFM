import { describe, expect, it } from "vitest";
import { getLineTopology } from "../server/services/topology/getLineTopology";
import { loadNetexLineCache } from "../server/services/topology/netexCache";
import { createPatternFlowStructure } from "../src/features/service-pattern/patternFlowStructure";
import { createPatternStationKey } from "../src/features/service-pattern/stationKeys";
import { convertServerTopologyToLineRouteSequences } from "../src/services/idfm";

describe("VueFlow graph structure from generated NeTEx cache", () => {
  it("renders the RER B as one graph with the expected north and south branches", async () => {
    const graph = await createGraph("rer-b");
    const cache = await loadNetexLineCache("rer-b");
    const topology = await getLineTopology("rer-b");
    const aulnayFork = cache.schematic.branchGroups.find((group) =>
      normalizeName(group.junction?.name ?? "") === normalizeName("Aulnay-sous-Bois"),
    );
    const aulnayLayouts = topology.branches
      .filter((branch) => branch.from === aulnayFork?.junctionStationId)
      .map((branch) => branch.layout);

    expect(graph.componentCount).toBe(1);
    expect(graph.orphanKeys).toEqual([]);
    expect(graph.branchKeys).toEqual(
      expect.arrayContaining([stationKey("Aulnay-sous-Bois"), stationKey("Bourg-la-Reine")]),
    );
    expect(graph.terminalKeys).toEqual(
      expect.arrayContaining([
        stationKey("Aéroport Charles de Gaulle 2 (Terminal 2)"),
        stationKey("Mitry - Claye"),
        stationKey("Robinson"),
        stationKey("Saint-Rémy-lès-Chevreuse"),
      ]),
    );
    expect(graph.edgeKeys).toEqual(
      expect.arrayContaining([
        edgeKey("Aulnay-sous-Bois", "Sevran Beaudottes"),
        edgeKey("Aulnay-sous-Bois", "Sevran - Livry"),
        edgeKey("Bourg-la-Reine", "Sceaux"),
        edgeKey("Bourg-la-Reine", "Parc de Sceaux"),
      ]),
    );
    expect(aulnayFork?.layout?.kind).toBe("same-direction-fork");
    expect(aulnayLayouts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "same-direction-fork",
          side: "upper",
          direction: "forward",
        }),
        expect.objectContaining({
          kind: "same-direction-fork",
          side: "lower",
          direction: "forward",
        }),
      ]),
    );
  });

  it("keeps the RER D lasso as a connected visual graph with cycle metadata", async () => {
    const graph = await createGraph("rer-d");
    const cache = await loadNetexLineCache("rer-d");
    const cycle = cache.schematic.loops.find((loop) => loop.kind === "cycle");
    const cycleNames = namesForSchematicIds(cache, cycle?.anchorStationIds ?? []);

    expect(graph.componentCount).toBe(1);
    expect(graph.orphanKeys).toEqual([]);
    expect(graph.branchKeys).toEqual(
      [
        stationKey("Corbeil-Essonnes"),
        stationKey("Le Mée"),
        stationKey("Viry-Châtillon"),
        stationKey("Villeneuve-Saint-Georges"),
      ].sort(),
    );
    expect(graph.terminalKeys).toEqual(
      [
        stationKey("Creil"),
        stationKey("Malesherbes"),
        stationKey("Melun"),
      ].sort(),
    );
    expect(graph.terminalKeys).not.toContain(stationKey("Évry - Courcouronnes"));
    expect(graph.terminalKeys).not.toContain(stationKey("Évry - Val de Seine"));
    expect(graph.degreeByKey[stationKey("Évry - Courcouronnes")]).toBe(2);
    expect(graph.degreeByKey[stationKey("Évry - Val de Seine")]).toBe(2);
    expect(graph.edgeKeys).toEqual(
      expect.arrayContaining([
        edgeKey("Viry-Châtillon", "Grigny Centre"),
        edgeKey("Viry-Châtillon", "Ris-Orangis"),
        edgeKey("Orangis Bois de l'Épine", "Évry - Courcouronnes"),
        edgeKey("Évry - Courcouronnes", "Le Bras de Fer"),
        edgeKey("Ris-Orangis", "Grand Bourg"),
        edgeKey("Grand Bourg", "Évry - Val de Seine"),
        edgeKey("Corbeil-Essonnes", "Évry - Val de Seine"),
        edgeKey("Corbeil-Essonnes", "Le Bras de Fer"),
        edgeKey("Corbeil-Essonnes", "Moulin Galant"),
        edgeKey("Le Mée", "Melun"),
        edgeKey("Le Mée", "Cesson"),
        edgeKey("Le Mée", "Vosves"),
      ]),
    );
    expect(cycleNames.map(normalizeName)).toEqual(
      expect.arrayContaining([
        normalizeName("Villeneuve-Saint-Georges"),
        normalizeName("Viry-Châtillon"),
        normalizeName("Corbeil-Essonnes"),
      ]),
    );
  });

  it("keeps Transilien J as a multi-branch visual graph", async () => {
    const graph = await createGraph("transilien-j");

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
        edgeKey("Argenteuil", "Val d'Argenteuil"),
        edgeKey("Argenteuil", "Sannois"),
        edgeKey("Conflans-Sainte-Honorine", "Conflans Fin d'Oise"),
        edgeKey("Conflans-Sainte-Honorine", "Éragny - Neuville"),
        edgeKey("Mantes Station", "Limay"),
        edgeKey("Mantes Station", "Mantes-la-Jolie"),
      ]),
    );
  });

  it("keeps Paris Saint-Lazare as a single-connection terminus on Transilien J", async () => {
    const graph = await createGraph("transilien-j");
    const saintLazareKey = stationKey("Gare Saint-Lazare");
    const saintLazareEdges = graph.edgeKeys.filter((edge) =>
      edge.split("--").includes(saintLazareKey),
    );

    expect(graph.terminalKeys).toContain(saintLazareKey);
    expect(graph.degreeByKey[saintLazareKey]).toBe(1);
    expect(saintLazareEdges).toEqual([edgeKey("Asnières-sur-Seine", "Gare Saint-Lazare")]);
    expect(saintLazareEdges).not.toContain(
      edgeKey("Gare Saint-Lazare", "Houilles - Carrières-sur-Seine"),
    );
  });
  it("exposes metro 13 La Fourche as a two-branch same-direction fork", async () => {
    const graph = await createGraph("metro-13");
    const topology = await getLineTopology("metro-13");
    const laFourcheId = findStationId(topology, "La Fourche");
    const placeDeClichyId = findStationId(topology, "Place de Clichy");
    const laFourcheBranches = topology.branches.filter(
      (branch) => branch.from === laFourcheId && branch.layout,
    );
    const layoutTerminals = laFourcheBranches.map((branch) =>
      stationLabelById(topology, branch.to),
    );

    expect(graph.componentCount).toBe(1);
    expect(graph.orphanKeys).toEqual([]);
    expect(graph.branchKeys).toContain(stationKey("La Fourche"));
    expect(graph.edgeKeys).toEqual(
      expect.arrayContaining([
        edgeKey("La Fourche", "Brochant"),
        edgeKey("La Fourche", "Guy-Môquet"),
        edgeKey("La Fourche", "Place de Clichy"),
      ]),
    );
    expect(laFourcheBranches).toHaveLength(2);
    expect(layoutTerminals).toEqual(
      expect.arrayContaining([
        "Asnières-Gennevilliers Les Courtilles",
        "Saint-Denis-Université",
      ]),
    );
    expect(layoutTerminals).not.toContain("Châtillon Montrouge");
    expect(laFourcheBranches.map((branch) => branch.layout)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "same-direction-fork",
          side: "upper",
          trunkStationId: placeDeClichyId,
        }),
        expect.objectContaining({
          kind: "same-direction-fork",
          side: "lower",
          trunkStationId: placeDeClichyId,
        }),
      ]),
    );
  });
});

async function createGraph(lineId: string) {
  const topology = await getLineTopology(lineId);
  const sequences = convertServerTopologyToLineRouteSequences(topology);

  return createPatternFlowStructure(sequences);
}

function namesForSchematicIds(
  cache: Awaited<ReturnType<typeof loadNetexLineCache>>,
  ids: string[],
): string[] {
  const nodeById = new Map(cache.schematic.nodes.map((node) => [node.id, node.name]));

  return ids.map((id) => nodeById.get(id) ?? id);
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

function findStationId(
  topology: Awaited<ReturnType<typeof getLineTopology>>,
  label: string,
): string {
  const station = topology.stations.find((candidate) =>
    normalizeName(candidate.name) === normalizeName(label),
  );

  expect(station, `Missing station ${label}`).toBeDefined();
  return station!.id;
}

function stationLabelById(
  topology: Awaited<ReturnType<typeof getLineTopology>>,
  stationId: string,
): string {
  return topology.stations.find((station) => station.id === stationId)?.name ?? stationId;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/giu, "")
    .toLowerCase();
}
