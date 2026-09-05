import { describe, expect, it } from "vitest";
import type {
  LineRouteSequence,
  LineRouteStop,
} from "../src/types/transit";
import type {
  GlobalMapLine,
  GlobalMapPath,
  GlobalMapStation,
} from "../src/features/transport-map/contracts/manifest";
import {
  createGlobalBusLineSearchOption,
  filterPathsForGlobalBusDirection,
  getGlobalBusDirectionEdgeKeys,
  getGlobalBusDirectionOrderedStopIds,
  getGlobalBusDirectionQuays,
  getGlobalBusDirectionStationIds,
  pathMatchesGlobalBusDirection,
  resolveGlobalDirection,
  resolveGlobalBusDirection,
} from "../src/features/line-map/globalBusDirections";
import { defaultGlobalDirectionMerge, selectGlobalMapDirection } from "../src/features/line-map/lineMapData";

const line = {
  id: "line:IDFM:C99999",
  index: 0,
  code: "C99999",
  label: "99",
  mode: "BUS",
  color: "#4f6f9d",
  textColor: "#ffffff",
  aliases: ["99"],
  stationIds: [
    "station:a",
    "station:b",
    "station:c",
    "station:d",
    "station:e",
  ],
  geometryIds: ["path:99"],
} satisfies GlobalMapLine;

function stop(id: string, index: number): LineRouteStop {
  const stationId = id.replace(/^stop-point:/u, "station:");
  return {
    id,
    label: id,
    lon: 2.3 + index / 100,
    lat: 48.8 + index / 100,
    station: {
      id: stationId,
      label: id,
      lon: 2.3 + index / 100,
      lat: 48.8 + index / 100,
      monitoringRef: stationId,
    },
  };
}

function sequence(
  id: string,
  direction: string,
  stopIds: string[],
): LineRouteSequence {
  return {
    id,
    label: direction,
    direction,
    stops: stopIds.map((stopId, index) => stop(stopId, index)),
  };
}

function path(stationIds: string[]): GlobalMapPath {
  return {
    id: "path:" + stationIds.join("-"),
    lineId: line.id,
    geometrySource: "gtfs",
    sourceVersion: "fixture",
    quality: {
      complete: true,
      fallback: false,
      gapMeters: 0,
      stationDistanceMaxMeters: 0,
    },
    stationIds,
    vertices: stationIds.map((stationId, index) => ({
      stationId,
      x: index / 100,
      y: index / 100,
    })),
    minX: 0,
    minY: 0,
    maxX: 1,
    maxY: 1,
    chunkIds: [],
  };
}

describe("global bus direction adaptation", () => {
  it("keeps the existing passenger-facing direction groups", () => {
    const sequences = [
      sequence("branch-a", "Gare", ["stop-point:a", "stop-point:b"]),
      sequence("branch-b", "Gare", ["stop-point:a", "stop-point:c"]),
      sequence("branch-c", "Centre", ["stop-point:c", "stop-point:d"]),
    ];

    const selection = selectGlobalMapDirection(sequences, "branch-b");
    expect(selection?.options.map((option) => option.id)).toEqual([
      "branch-a",
      "branch-c",
    ]);
    expect(selection?.selectedDirectionId).toBe("branch-b");
    expect(selection?.variants.map((variant) => variant.id)).toEqual([
      "branch-a",
      "branch-b",
    ]);
  });

  it("defaults fusion on for rail families and off for road night services", () => {
    for (const mode of ["TRANSILIEN", "TRAIN", "RER", "METRO", "TRAM", "CABLE", "BIKE"]) {
      expect(defaultGlobalDirectionMerge(mode)).toBe(true);
    }
    expect(defaultGlobalDirectionMerge("BUS")).toBe(false);
    expect(defaultGlobalDirectionMerge("NOCTILIEN")).toBe(false);
    expect(resolveGlobalDirection([])).toBeUndefined();
  });

  it("reuses the V1 terminal direction selection and maps it to V2 paths", () => {
    const sequences = [
      sequence("outbound", "Centre", [
        "stop-point:a",
        "stop-point:b",
        "stop-point:c",
      ]),
      sequence("return", "Gare", [
        "stop-point:c",
        "stop-point:d",
        "stop-point:e",
        "stop-point:a",
      ]),
    ];
    const selection = resolveGlobalBusDirection(sequences, "stop-point:c");

    expect(selection?.options).toHaveLength(2);
    expect(selection?.selectedDirectionId).toBe("outbound");
    expect(getGlobalBusDirectionStationIds(line, selection!)).toEqual([
      "station:a",
      "station:b",
      "station:c",
    ]);

    const edges = getGlobalBusDirectionEdgeKeys(line, selection!);
    expect(pathMatchesGlobalBusDirection(
      path(["station:a", "station:b"]),
      edges,
    )).toBe(true);
    expect(pathMatchesGlobalBusDirection(
      path(["station:d", "station:e"]),
      edges,
    )).toBe(false);
  });

  it("keeps repeated loop stations in the edge sequence", () => {
    const selection = resolveGlobalBusDirection(
      [
        sequence("loop", "Boucle", [
          "stop-point:a",
          "stop-point:b",
          "stop-point:c",
          "stop-point:b",
          "stop-point:d",
        ]),
        sequence("short", "Court", [
          "stop-point:a",
          "stop-point:b",
        ]),
      ],
      "stop-point:d",
    );
    const edges = getGlobalBusDirectionEdgeKeys(line, selection!);

    expect(edges.has("station:b::station:c")).toBe(true);
    expect(edges.has("station:b::station:d")).toBe(true);
    expect(edges.has("station:c::station:d")).toBe(false);
  });

  it("keeps opposite road geometries and loop visits direction-specific", () => {
    const outbound = sequence("outbound", "Centre", [
      "stop-point:a",
      "stop-point:b",
      "stop-point:c",
    ]);
    const inbound = sequence("inbound", "Gare", [
      "stop-point:c",
      "stop-point:b",
      "stop-point:a",
    ]);
    const loop = sequence("loop", "Boucle", [
      "stop-point:a",
      "stop-point:b",
      "stop-point:c",
      "stop-point:b",
      "stop-point:d",
    ]);
    const outboundSelection = resolveGlobalBusDirection([outbound, inbound], "outbound");
    const loopSelection = resolveGlobalBusDirection([loop], "loop");
    const outboundPath = path(["station:a", "station:b", "station:c"]);
    outboundPath.id = "path:outbound#anchor";
    const outboundContinuation = {
      ...path([]),
      id: "path:outbound#continuation",
      stationIds: [],
      vertices: [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }],
    };
    const inboundPath = path(["station:c", "station:b", "station:a"]);
    inboundPath.id = "path:inbound#anchor";

    const outboundEdges = getGlobalBusDirectionEdgeKeys(line, outboundSelection!);
    expect(outboundEdges).toEqual(new Set([
      "station:a::station:b",
      "station:b::station:c",
    ]));
    expect(pathMatchesGlobalBusDirection(outboundPath, outboundEdges)).toBe(true);
    expect(pathMatchesGlobalBusDirection(inboundPath, outboundEdges)).toBe(false);
    expect(filterPathsForGlobalBusDirection(
      [outboundPath, outboundContinuation, inboundPath],
      outboundEdges,
      new Set(["station:a", "station:b", "station:c"]),
    )).toEqual([outboundPath, outboundContinuation]);

    expect(getGlobalBusDirectionOrderedStopIds(line, loopSelection!)).toEqual([
      "station:a",
      "station:b",
      "station:c",
      "station:b",
      "station:d",
    ]);
    expect(getGlobalBusDirectionEdgeKeys(line, loopSelection!)).toEqual(new Set([
      "station:a::station:b",
      "station:b::station:c",
      "station:c::station:b",
      "station:b::station:d",
    ]));
  });

  it("keeps a short-turn under its containing commercial direction", () => {
    const trunk = [
      "gp",
      "voltaire",
      "leon-blum",
      "danielle-casanova",
      "mairie",
      "jaures",
      "victor-hugo",
      "porte-clichy",
      "boulay",
      "brochant",
      "fourche",
      "ganneron",
      "place-clichy",
      "blanche",
      "pigalle",
      "anvers",
      "rochechouart",
      "barbes",
      "magenta",
      "gare-du-nord",
      "porte-aubervilliers",
    ].map((id) => `stop-point:${id}`);
    const returnTrunk = [...trunk].reverse();
    const sequences = [
      sequence("pattern:3", "Porte d'Aubervilliers", trunk),
      sequence("pattern:2", "Gabriel Péri-Métro", returnTrunk),
      sequence("pattern:1", "Porte de Clichy", trunk.slice(0, 8)),
      sequence("pattern:4", "Gabriel Péri-Métro", returnTrunk.slice(-8)),
    ];

    const selection = resolveGlobalBusDirection(sequences);
    expect(selection?.options).toHaveLength(2);
    expect(selection?.options.map((option) => option.label)).toEqual(
      expect.arrayContaining(["Porte d'Aubervilliers", "Gabriel Péri-Métro"]),
    );

    const shortTurnSelection = resolveGlobalBusDirection(sequences, "pattern:1");
    expect(shortTurnSelection?.selectedDirectionId).toBe("pattern:1");
    expect(shortTurnSelection?.selectedMainDirectionId).toBe("pattern:3");
    expect(shortTurnSelection?.variants.map((variant) => variant.id)).toContain("pattern:1");
  });

  it("keeps an inserted school detour as a variant instead of making it the main direction", () => {
    const regular = sequence("pattern:2", "Clamart", [
      "stop-point:acacias",
      "stop-point:centre-commercial-du-moulin",
      "stop-point:aerodrome-morane",
      "stop-point:roseraie",
      "stop-point:georges-pompidou",
    ]);
    const schoolDetour = sequence("pattern:1", "Clamart", [
      "stop-point:acacias",
      "stop-point:centre-commercial-du-moulin",
      "stop-point:lycee-de-villebon",
      "stop-point:aerodrome-morane",
      "stop-point:roseraie",
      "stop-point:georges-pompidou",
    ]);
    const opposite = sequence("pattern:3", "Boulogne", [
      "stop-point:georges-pompidou",
      "stop-point:roseraie",
      "stop-point:aerodrome-morane",
      "stop-point:centre-commercial-du-moulin",
      "stop-point:acacias",
    ]);

    const defaultSelection = resolveGlobalBusDirection([schoolDetour, regular, opposite]);
    expect(defaultSelection?.selectedDirectionId).toBe("pattern:2");
    expect(defaultSelection?.selectedMainDirectionId).toBe("pattern:2");
    expect(defaultSelection?.variants.map((variant) => variant.id)).toEqual([
      "pattern:2",
      "pattern:1",
    ]);

    const specialSelection = resolveGlobalBusDirection(
      [schoolDetour, regular, opposite],
      "pattern:1",
    );
    expect(specialSelection?.selectedDirectionId).toBe("pattern:1");
    expect(specialSelection?.selectedMainDirectionId).toBe("pattern:2");
  });

  it("can match a canonical reverse path without accepting divergent roads", () => {
    const outbound = sequence("outbound", "Centre", [
      "stop-point:a",
      "stop-point:b",
      "stop-point:c",
    ]);
    const selection = resolveGlobalBusDirection([outbound], "outbound");
    const edgeKeys = getGlobalBusDirectionEdgeKeys(line, selection!);
    const canonicalReverse = path(["station:c", "station:b", "station:a"]);
    canonicalReverse.id = "path:canonical-reverse";
    const divergent = path(["station:a", "station:d", "station:c"]);
    divergent.id = "path:divergent";

    expect(pathMatchesGlobalBusDirection(canonicalReverse, edgeKeys)).toBe(false);
    expect(pathMatchesGlobalBusDirection(
      canonicalReverse,
      edgeKeys,
      new Set(["station:a", "station:b", "station:c"]),
      { allowReversedPathStorage: true },
    )).toBe(true);
    expect(filterPathsForGlobalBusDirection(
      [canonicalReverse, divergent],
      edgeKeys,
      new Set(["station:a", "station:b", "station:c"]),
      { allowReversedPathStorage: true },
    )).toEqual([canonicalReverse]);
  });

  it("keeps an unanchored clipped fragment belonging to a selected segment", () => {
    const anchored = path(["station:a", "station:b"]);
    anchored.id = "path:segment:1#tile-a";
    const clippedMiddle = {
      ...path([]),
      id: "path:segment:1#tile-b",
      stationIds: [],
      vertices: [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }],
    };

    expect(filterPathsForGlobalBusDirection(
      [anchored, clippedMiddle],
      new Set(["station:a::station:b"]),
      new Set(["station:a", "station:b"]),
    )).toEqual([anchored, clippedMiddle]);
  });

  it("keeps an anchored continuation belonging to a selected segment", () => {
    const anchored = path(["station:a", "station:b"]);
    anchored.id = "path:segment:4#tile-station";
    const continuation = path(["station:c", "station:d"]);
    continuation.id = "path:segment:4#tile-continuation";

    expect(filterPathsForGlobalBusDirection(
      [anchored, continuation],
      new Set(["station:a::station:b"]),
      new Set(["station:a", "station:b"]),
    )).toEqual([anchored, continuation]);
  });

  it("does not select a divergent branch from a shared terminal anchor", () => {
    const selectedEdge = path(["station:b", "station:c"]);
    selectedEdge.id = "path:selected-branch#edge";
    const selectedContinuation = {
      ...path([]),
      id: "path:selected-branch#continuation",
      stationIds: [],
      vertices: [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }],
    };
    const divergentTerminal = path(["station:a"]);
    divergentTerminal.id = "path:other-branch#terminal";
    const divergentEdge = path(["station:d", "station:e"]);
    divergentEdge.id = "path:other-branch#edge";

    expect(filterPathsForGlobalBusDirection(
      [selectedEdge, selectedContinuation, divergentTerminal, divergentEdge],
      new Set(["station:b::station:c"]),
      new Set(["station:a", "station:b", "station:c"]),
    )).toEqual([selectedEdge, selectedContinuation]);
  });

  it("keeps the quay attached to the selected direction", () => {
    const outbound = sequence("outbound", "Centre", [
      "stop-point:a",
      "stop-point:b",
      "stop-point:c",
    ]);
    outbound.stops[1]!.quays = [{
      id: "quay:outbound-b",
      name: "Quai B vers Centre",
      projectedX: 650000,
      projectedY: 6860000,
    }];
    const returnSequence = sequence("return", "Gare", [
      "stop-point:c",
      "stop-point:b",
      "stop-point:a",
    ]);
    returnSequence.stops[1]!.quays = [{
      id: "quay:return-b",
      name: "Quai A vers Gare",
      projectedX: 650100,
      projectedY: 6860100,
    }];

    const outboundSelection = resolveGlobalBusDirection([outbound, returnSequence], "stop-point:c");
    const returnSelection = resolveGlobalBusDirection([outbound, returnSequence], "stop-point:a");

    expect(getGlobalBusDirectionQuays(line, outboundSelection!)).toEqual([{
      stationId: "station:b",
      quay: outbound.stops[1]!.quays![0],
    }]);
    expect(getGlobalBusDirectionQuays(line, returnSelection!)).toEqual([{
      stationId: "station:b",
      quay: returnSequence.stops[1]!.quays![0],
    }]);
  });

  it("resolves topology ids synthesized from station names against V2 catalog stations", () => {
    const labels = ["Alpha", "Bêta", "Gamma"];
    const topology = sequence("topology", "Gamma", [
      "station:synthetic-alpha",
      "station:synthetic-beta",
      "station:synthetic-gamma",
    ]);
    topology.stops.forEach((item, index) => {
      item.label = labels[index]!;
      item.station.label = labels[index]!;
    });
    const catalogStations = line.stationIds.slice(0, 3).map((id, index) => ({
      id,
      index,
      name: labels[index]!,
      normalizedName: labels[index]!.toLowerCase(),
      city: "Test",
      aliases: [],
      rawRefs: [],
      lineIds: [line.id],
      ownerChunkId: "fixture",
      isHub: false,
      sourceCrs: "EPSG:2154",
      sourceX: 0,
      sourceY: 0,
      lon: 2.3 + index / 100,
      lat: 48.8 + index / 100,
      worldX: 0,
      worldY: 0,
      coordinateSource: "gtfs",
      transformVersion: "lambert93-ntf-v1",
    })) as GlobalMapStation[];
    const selection = resolveGlobalBusDirection([topology]);

    expect(getGlobalBusDirectionStationIds(
      line,
      selection!,
      catalogStations,
    )).toEqual(line.stationIds.slice(0, 3));
  });

  it("builds a server-search line option from the global line without a hardcoded id", () => {
    expect(createGlobalBusLineSearchOption(line)).toMatchObject({
      id: line.id,
      navitiaId: line.id,
      label: line.label,
      family: "BUS",
    });
  });
});
