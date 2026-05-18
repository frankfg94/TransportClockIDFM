import { describe, expect, it } from "vitest";
import {
  buildLineTopologyFromFixture,
  buildNeighborMap,
} from "../server/services/topology/buildLineTopology";
import {
  loadExpectedTopologyFixture,
  loadRawLineFixture,
} from "../server/services/topology/fixtures";
import { getLineTopology } from "../server/services/topology/getLineTopology";
import { validateLineTopology } from "../server/services/topology/validateLineTopology";
import { createPatternStationKey } from "../src/features/service-pattern/stationKeys";
import { convertServerTopologyToLineRouteSequences } from "../src/services/idfm";

const fixtureSlugs = ["transilien-j", "rer-a", "rer-b", "rer-d", "metro-4"] as const;

const transilienJBranchNodeNeighbors: Record<string, string[]> = {
  "asnieres-sur-seine": [
    "bois-colombes",
    "houilles-carrieres-sur-seine",
    "paris-saint-lazare",
  ],
  argenteuil: ["le-stade", "sannois", "val-argenteuil"],
  "conflans-sainte-honorine": [
    "conflans-fin-oise",
    "eragny-neuville",
    "herblay",
  ],
  "mantes-station": ["epone-mezieres", "limay", "mantes-la-jolie"],
  "mantes-la-jolie": ["breval", "mantes-station", "rosny-sur-seine"],
};

describe("offline IDFM topology builder", () => {
  it.each(fixtureSlugs)("builds a coherent %s topology", async (slug) => {
    const raw = await loadRawLineFixture(slug);
    const expected = await loadExpectedTopologyFixture(slug);
    const topology = buildLineTopologyFromFixture(raw);
    const failures = validateLineTopology(topology, expected);

    expect(failures).toEqual([]);
    expect(topology.stations.map((station) => station.id).sort()).toEqual(
      expected.requiredStations.sort(),
    );
    expect(topology.branchPoints).toEqual(
      [...expected.expectedBranchPoints].sort(),
    );
  });

  it("keeps Argenteuil and Val d'Argenteuil as distinct Transilien J stations", async () => {
    const topology = await getLineTopology("transilien-j");
    const argenteuilStations = topology.stations.filter((station) =>
      station.name.includes("Argenteuil"),
    );

    expect(argenteuilStations.map((station) => station.id).sort()).toEqual([
      "argenteuil",
      "val-argenteuil",
    ]);
  });

  it("keeps Gare Saint-Lazare as a served Transilien J terminal", async () => {
    const topology = await getLineTopology("line:IDFM:C01795");
    const saintLazare = topology.stations.find(
      (station) => station.id === "paris-saint-lazare",
    );

    expect(saintLazare?.degree).toBe(1);
    expect(topology.patterns.some((pattern) => pattern.stops[0] === "paris-saint-lazare")).toBe(
      true,
    );
  });

  it("keeps the Transilien J Mantes and Vernon branch connected without orphan stations", async () => {
    const topology = await getLineTopology("transilien-j");
    const neighbors = buildNeighborMap(
      topology.stations.map((station) => station.id),
      topology.segments,
    );
    const orphanStationIds = topology.stations
      .filter((station) => (neighbors.get(station.id)?.size ?? 0) === 0)
      .map((station) => station.id);
    const mantesPattern = topology.patterns.find(
      (pattern) => pattern.id === "j-saint-lazare-mantes-conflans",
    );

    expect(orphanStationIds).toEqual([]);
    expect(mantesPattern?.stops).toContain("limay");
    expect([...neighbors.get("limay")!].sort()).toEqual([
      "issou-porcheville",
      "mantes-station",
    ]);
    expect(neighbors.get("vernon-giverny")?.has("bonnieres")).toBe(true);
    expect(neighbors.get("breval")?.has("mantes-la-jolie")).toBe(true);
  });


  it("matches the official Transilien J branch nodes from the line map", async () => {
    const topology = await getLineTopology("transilien-j");
    const neighbors = buildNeighborMap(
      topology.stations.map((station) => station.id),
      topology.segments,
    );

    expect(topology.branchPoints).toEqual(
      Object.keys(transilienJBranchNodeNeighbors).sort(),
    );

    for (const [branchNode, expectedNeighbors] of Object.entries(
      transilienJBranchNodeNeighbors,
    )) {
      expect([...neighbors.get(branchNode)!].sort()).toEqual(
        [...expectedNeighbors].sort(),
      );
    }
  });

  it("keeps validated Transilien J server topology intact for the service pattern modal", async () => {
    const topology = await getLineTopology("transilien-j");
    const sequences = convertServerTopologyToLineRouteSequences(topology);
    const edgeKeys = new Set(
      sequences.flatMap((sequence) =>
        sequence.stops.slice(0, -1).map((stop, index) => {
          const nextStop = sequence.stops[index + 1];
          return [stop.id, nextStop.id].sort().join("--");
        }),
      ),
    );

    expect(sequences.every((sequence) => sequence.topologySource === "server")).toBe(
      true,
    );
    expect(edgeKeys).toContain("bonnieres--vernon-giverny");
    expect(edgeKeys).toContain("breval--mantes-la-jolie");
    expect(edgeKeys).toContain("limay--mantes-station");
    expect(edgeKeys).toContain("conflans-sainte-honorine--eragny-neuville");
    expect(edgeKeys).toContain("conflans-fin-oise--conflans-sainte-honorine");
  });

  it("matches live stop-area calls with validated topology stations by label", () => {
    expect(
      createPatternStationKey({
        id: "vernon-giverny",
        label: "Vernon - Giverny",
      }),
    ).toBe(
      createPatternStationKey({
        id: "call:sample",
        label: "Vernon - Giverny",
        stopAreaRef: "stop_area:IDFM:74127",
      }),
    );

    expect(
      createPatternStationKey({
        id: "val-argenteuil",
        label: "Val d'Argenteuil",
      }),
    ).not.toBe(
      createPatternStationKey({
        id: "argenteuil",
        label: "Argenteuil",
      }),
    );
  });

  it("detects the RER B north and south branch split stations", async () => {
    const topology = await getLineTopology("rer-b");

    expect(topology.branchPoints).toContain("aulnay-sous-bois");
    expect(topology.branchPoints).toContain("bourg-la-reine");
  });

  it("detects Corbeil-Essonnes as a complex RER D branch node", async () => {
    const topology = await getLineTopology("rer-d");
    const corbeil = topology.stations.find(
      (station) => station.id === "corbeil-essonnes",
    );

    expect(corbeil?.degree).toBe(4);
    expect(topology.branchPoints).toContain("corbeil-essonnes");
  });

  it("keeps Metro 4 as a simple linear line without branch points", async () => {
    const topology = await getLineTopology("metro-4");

    expect(topology.branchPoints).toEqual([]);
    expect(topology.terminals.sort()).toEqual([
      "bagneux-lucie-aubrac",
      "porte-de-clignancourt",
    ]);
    expect(topology.segments).toHaveLength(topology.stations.length - 1);
  });

  it("throws for an unknown line fixture instead of performing a network call", async () => {
    await expect(getLineTopology("line:IDFM:UNKNOWN")).rejects.toThrow();
  });
});
