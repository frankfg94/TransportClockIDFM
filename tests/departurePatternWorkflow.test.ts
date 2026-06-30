import { describe, expect, it, vi } from "vitest";
import { createBoardFromDraft } from "../src/services/boardBuilder";
import { createPatternFlowStructure } from "../src/features/service-pattern/patternFlowStructure";
import { createPatternStationKey } from "../src/features/service-pattern/stationKeys";
import { getFlowLightEdgeClass } from "../src/features/service-pattern/flowDirection";
import { hydrateDeparturePatternTransfers } from "../src/features/service-pattern/patternTransfers";
import { transitBoards } from "../src/config/transitBoards";
import type {
  DirectionGroupConfig,
  LineSearchOption,
  StationSearchOption,
  TransferLineOption,
  TransitFamilyOption,
} from "../src/types/transit";
import {
  assertPatternHasNoOrphanStations,
  buildLinePatternView,
  buildLinePatternViewFromTopology,
} from "../server/services/servicePattern/buildLinePatternView";
import type { LineTopology } from "../server/services/topology/types";

describe("station add to service-pattern modal workflow", () => {
  it("adds Transilien J / Cormeilles-en-Parisis from the NeTEx cache", async () => {
    const selectedLine = createTransilienJLine();
    const selectedStation = createCormeillesStation();
    const directionGroups = createCormeillesDirectionGroups();
    const addedBoard = createBoardFromDraft(
      {
        family: "TRANSILIEN",
        line: selectedLine,
        station: selectedStation,
      },
      directionGroups,
    );

    expect(addedBoard.title).toBe("Cormeilles-en-Parisis");
    expect(addedBoard.line.shortName).toBe("J");
    expect(addedBoard.schedule?.lineRef).toBe("line:IDFM:C01739");

    const response = await buildLinePatternView({
      transportType: "transilien",
      lineId: "J",
      directionId: "Gisors",
      startStationId: "Cormeilles-en-Parisis",
    });
    const servedLabels = servedCallLabels(response.pattern);
    const graph = createPatternFlowStructure(response.pattern.lineTopology ?? []);

    expect(response.pattern.destination).toBe("Gisors");
    expectCurrentCall(response.pattern, "Cormeilles-en-Parisis");
    expect(servedLabels.slice(0, 4)).toEqual([
      "Cormeilles-en-Parisis",
      "La Frette - Montigny",
      "Herblay",
      "Conflans-Sainte-Honorine",
    ]);
    expect(servedLabels.at(-1)).toBe("Gisors");
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
        edgeKey("Conflans-Sainte-Honorine", "Éragny - Neuville"),
        edgeKey("Conflans-Sainte-Honorine", "Herblay"),
      ]),
    );
  });

  it("keeps the default RER B board on the Saint-Remy branch without Navitia topology calls", async () => {
    const board = transitBoards.find(
      (candidate) => candidate.title === "La Croix de Berny",
    );

    expect(board).toBeDefined();

    const response = await buildLinePatternView({
      transportType: "rer",
      lineId: "B",
      directionId: "Saint-Rémy-lès-Chevreuse",
      startStationId: "La Croix de Berny",
    });
    const servedLabels = servedCallLabels(response.pattern);
    const graph = createPatternFlowStructure(response.pattern.lineTopology ?? []);

    expect(response.board.line.shortName).toBe("B");
    expect(response.pattern.serviceType).toBe("semi-direct");
    expect(response.pattern.destination).toBe("Saint-Rémy-lès-Chevreuse");
    expectCurrentCall(response.pattern, "La Croix de Berny");
    expect(servedLabels[0]).toBe("La Croix de Berny");
    expect(servedLabels).toContain("Massy - Palaiseau");
    expect(servedLabels).toContain("Gif-sur-Yvette");
    expect(servedLabels.at(-1)).toBe("Saint-Rémy-lès-Chevreuse");
    expect(graph.orphanKeys).toEqual([]);
    expect(graph.branchKeys).toEqual(
      expect.arrayContaining([stationKey("Aulnay-sous-Bois"), stationKey("Bourg-la-Reine")]),
    );
    expect(assertPatternHasNoOrphanStations(response)).toEqual([]);
    expectLightClassForTripDirection({
      expectedClass: "pattern-flow-edge--light",
      sourceLabel: "La Croix de Berny",
      targetLabel: "Antony",
      visualSourceX: 0,
      visualTargetX: 100,
    });
  });

  it("marks topology patterns with skipped corridor stops as semi-direct", () => {
    const response = buildLinePatternViewFromTopology(
      {
        transportType: "rer",
        lineId: "X",
        directionId: "Echo",
        startStationId: "Alpha",
      },
      createSkippedStopTopologyFixture(),
    );

    expect(response.pattern.serviceType).toBe("semi-direct");
    expect(servedCallLabels(response.pattern)).toEqual([
      "Alpha",
      "Delta",
      "Echo",
    ]);
    expect(
      response.pattern.calls.find((call) => call.label === "Bravo")?.served,
    ).toBe(false);
    expect(
      response.pattern.calls.find((call) => call.label === "Charlie")?.served,
    ).toBe(false);
  });

  it("resolves RER E by transport family and line letter from the generated cache", async () => {
    const response = await buildLinePatternView({
      transportType: "rer",
      lineId: "E",
      directionId: "all-directions",
      startStationId: "Gagny",
    });
    const servedLabels = servedCallLabels(response.pattern);

    expect(response.lineId).toBe("line:IDFM:C01729");
    expect(response.board.line.shortName).toBe("E");
    expect(response.board.line.longName).toBe("RER E");
    expect(response.board.line.mode).toBe("rer");
    expect(response.board.line.iconUrls).toEqual(
      expect.arrayContaining([
        "https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/rer/picto-ligne-LIGIDFMC01729.svg",
      ]),
    );
    expectCurrentCall(response.pattern, "Gagny");
    expect(servedLabels[0]).toBe("Gagny");
    expect(servedLabels).toContain("Chelles - Gournay");
    expect(assertPatternHasNoOrphanStations(response)).toEqual([]);
  });

  it("uses Navitia line metadata to color cached RER patterns like the home page", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.includes("/datasets/arrets-lignes/records")) {
        return new Response(JSON.stringify({ results: [] }), {
          headers: {
            "Content-Type": "application/json",
          },
          status: 200,
        });
      }

      if (!url.includes("/v2/navitia/lines/line%3AIDFM%3AC01729")) {
        throw new Error(`Unexpected line presentation fetch: ${url}`);
      }

      return new Response(
        JSON.stringify({
          lines: [
            {
              id: "line:IDFM:C01729",
              code: "E",
              color: "B94E9A",
              text_color: "FFFFFF",
              commercial_mode: {
                name: "RER",
              },
            },
          ],
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
          status: 200,
        },
      );
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const response = await buildLinePatternView({
        transportType: "rer",
        lineId: "E",
        directionId: "all-directions",
        startStationId: "Gagny",
        runtimeEnv: {
          IDFM_API_KEY: "test-key",
        },
      });

      expect(response.board.line.color).toBe("#b94e9a");
      expect(response.board.line.textColor).toBe("#ffffff");
      expect(response.board.line.iconUrls).toEqual(
        expect.arrayContaining([
          "https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/rer/picto-ligne-LIGIDFMC01729.svg",
        ]),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses NeTEx Town city names from the line topology", () => {
    const topology = createCityTopologyFixture();
    const response = buildLinePatternViewFromTopology(
      {
        transportType: "tram",
        lineId: "T6",
        directionId: "Viroflay - Rive Droite",
        startStationId: "Chatillon - Montrouge",
      },
      topology,
    );
    const callsByLabel = new Map(
      response.pattern.calls.map((call) => [call.label, call]),
    );
    const stopsByLabel = new Map(
      response.pattern.lineTopology
        ?.flatMap((sequence) => sequence.stops)
        .map((stop) => [stop.label, stop]),
    );

    expect(response.board.city).toBe("Chatillon");
    expect(callsByLabel.get("Louvois")?.city).toBe(
      "Vélizy-Villacoublay",
    );
    expect(callsByLabel.get("Pavé Blanc (Parc Novéos)")?.city).toBe(
      "Clamart",
    );
    expect(stopsByLabel.get("Louvois")?.city).toBe(
      "Vélizy-Villacoublay",
    );
    expect(stopsByLabel.get("Pavé Blanc (Parc Novéos)")?.station.city).toBe(
      "Clamart",
    );
  });

  it("keeps T10 as a linear cached pattern from Les Peintres", async () => {
    const response = await buildLinePatternView({
      transportType: "tram",
      lineId: "T10",
      directionId: "Jardin Parisien",
      startStationId: "Les Peintres",
    });
    const servedLabels = servedCallLabels(response.pattern);
    const graph = createPatternFlowStructure(response.pattern.lineTopology ?? []);

    expect(response.board.line.shortName).toBe("T10");
    expect(response.pattern.destination).toBe("Jardin Parisien");
    expectCurrentCall(response.pattern, "Les Peintres");
    expect(servedLabels[0]).toBe("Les Peintres");
    expect(servedLabels.at(-1)).toBe("Jardin Parisien");
    expect(graph.branchKeys).toEqual([]);
    expect(graph.orphanKeys).toEqual([]);
    expect(assertPatternHasNoOrphanStations(response)).toEqual([]);
  });

  it("resolves metro 13 from the generated NeTEx cache", async () => {
    const response = await buildLinePatternView({
      transportType: "metro",
      lineId: "13",
      directionId: "asnieres-gennevilliers-les-courtilles",
      startStationId: "Châtillon - Montrouge",
    });
    const servedLabels = servedCallLabels(response.pattern);
    const graph = createPatternFlowStructure(response.pattern.lineTopology ?? []);

    expect(response.lineId).toBe("line:IDFM:C01383");
    expect(response.board.line.mode).toBe("metro");
    expect(response.board.line.shortName).toBe("13");
    expect(response.board.line.color).toBe("#6ec4e8");
    expect(response.board.line.textColor).toBe("#111827");
    expect(response.board.line.iconUrls).toEqual(
      expect.arrayContaining([
        "https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/metro/picto-ligne-LIGIDFMC01383.svg",
      ]),
    );
    expect(response.pattern.destination).toBe("Asnières-Gennevilliers Les Courtilles");
    expectCurrentCall(response.pattern, "Châtillon Montrouge");
    expect(servedLabels.slice(0, 3)).toEqual([
      "Châtillon Montrouge",
      "Malakoff-Rue Etienne Dolet",
      "Malakoff-Plateau de Vanves",
    ]);
    expect(servedLabels.at(-1)).toBe("Asnières-Gennevilliers Les Courtilles");
    expect(graph.orphanKeys).toEqual([]);
    expect(assertPatternHasNoOrphanStations(response)).toEqual([]);
  });

  it("hydrates line-pattern transfers with an injected local client", async () => {
    const response = await buildLinePatternView({
      transportType: "metro",
      lineId: "4",
      directionId: "Bagneux - Lucie Aubrac",
      startStationId: "Barbès - Rochechouart",
    });
    const searches: Array<{ family: string; query: string }> = [];
    const transferLookups: string[] = [];
    const transferScopes: Array<string | undefined> = [];
    const hydrated = await hydrateDeparturePatternTransfers(
      response.board,
      response.pattern,
      {
        async getTransitFamilies() {
          return [
            {
              id: "commercial_mode:Metro",
              label: "Metro",
              family: "METRO",
            },
          ];
        },
        async searchLines(network: TransitFamilyOption, query: string) {
          searches.push({ family: network.family, query });

          return [createMetro4Line()];
        },
        async searchStations() {
          return [
            createPatternStationOption("Porte de Clignancourt", "71426"),
            createPatternStationOption("Montparnasse-Bienvenue", "71139"),
            createPatternStationOption("Bagneux - Lucie Aubrac", "71592"),
          ];
        },
        async fetchTransfers(station, _currentLineId, options) {
          transferLookups.push(station.label);
          transferScopes.push(options?.transferScope);

          if (station.label === "Montparnasse-Bienvenue") {
            return [
              createTransfer("6", "METRO"),
              createTransfer("12", "METRO"),
              createTransfer("13", "METRO"),
            ];
          }

          return [];
        },
      },
    );
    const montparnasseCall = hydrated.calls.find(
      (call) => call.label === "Montparnasse-Bienvenue",
    );

    expect(searches).toEqual([]);
    expect(transferLookups).toContain("Montparnasse-Bienvenue");
    expect(new Set(transferScopes)).toEqual(new Set(["connected"]));
    expect(montparnasseCall?.transferLines?.map((line) => line.label)).toEqual(
      expect.arrayContaining(["6", "12", "13"]),
    );
  });

  it("matches live stop-area labels with cached topology station keys", () => {
    expect(
      createPatternStationKey({
        id: "FR::monomodalStopPlace:58566:FR1",
        label: "Cormeilles-en-Parisis",
      }),
    ).toBe(
      createPatternStationKey({
        id: "call:sample",
        label: "Cormeilles-en-Parisis",
        stopAreaRef: "stop_area:IDFM:68244",
      }),
    );
  });
});

function createTransilienJLine(): LineSearchOption {
  return {
    id: "line:IDFM:C01739",
    navitiaId: "line:IDFM:C01739",
    ref: "STIF:Line::C01739:",
    label: "J",
    displayName: "J",
    family: "TRANSILIEN",
    color: "#d6cd00",
    textColor: "#111827",
  };
}

function createMetro4Line(): LineSearchOption {
  return {
    id: "line:IDFM:C01374",
    navitiaId: "line:IDFM:C01374",
    ref: "STIF:Line::C01374:",
    label: "4",
    displayName: "4 · Metro 4",
    family: "METRO",
    color: "#be418d",
    textColor: "#ffffff",
  };
}

function createCormeillesStation(): StationSearchOption {
  return {
    id: "stop_area:IDFM:68244",
    label: "Cormeilles-en-Parisis",
    city: "Cormeilles-en-Parisis",
    monitoringRef: "STIF:StopArea:SP:68244:",
    scheduleStopAreaRef: "stop_area:IDFM:68244",
  };
}

function createCormeillesDirectionGroups(): DirectionGroupConfig[] {
  return [
    {
      id: "gisors",
      label: "Gisors",
      match: {
        destinationIncludes: ["Gisors"],
        navitiaStopPointRefs: ["stop_point:IDFM:477364"],
      },
    },
  ];
}

function createCityTopologyFixture(): LineTopology {
  return {
    line: {
      id: "line:IDFM:C01794",
      aliases: ["T6", "tram-t6"],
      name: "Tram T6",
      shortName: "T6",
      mode: "tram",
    },
    stations: [
      {
        id: "chatillon",
        name: "Chatillon - Montrouge",
        city: "Chatillon",
        degree: 1,
      },
      {
        id: "louvois",
        name: "Louvois",
        city: "Vélizy-Villacoublay",
        degree: 2,
      },
      {
        id: "pave-blanc",
        name: "Pavé Blanc (Parc Novéos)",
        city: "Clamart",
        degree: 2,
      },
      {
        id: "viroflay",
        name: "Viroflay - Rive Droite",
        city: "Viroflay",
        degree: 1,
      },
    ],
    segments: [
      {
        id: "chatillon__louvois",
        from: "chatillon",
        to: "louvois",
        patterns: ["pattern:t6"],
      },
      {
        id: "louvois__pave-blanc",
        from: "louvois",
        to: "pave-blanc",
        patterns: ["pattern:t6"],
      },
      {
        id: "pave-blanc__viroflay",
        from: "pave-blanc",
        to: "viroflay",
        patterns: ["pattern:t6"],
      },
    ],
    patterns: [
      {
        id: "pattern:t6",
        terminalFrom: "Chatillon - Montrouge",
        terminalTo: "Viroflay - Rive Droite",
        stops: ["chatillon", "louvois", "pave-blanc", "viroflay"],
        tripCount: 1,
      },
    ],
    branches: [],
    loops: [],
    branchPoints: [],
    terminals: ["chatillon", "viroflay"],
  };
}

function createSkippedStopTopologyFixture(): LineTopology {
  return {
    line: {
      id: "line:IDFM:test-express",
      aliases: ["X"],
      name: "RER X",
      shortName: "X",
      mode: "rer",
    },
    stations: [
      {
        id: "alpha",
        name: "Alpha",
        degree: 1,
      },
      {
        id: "bravo",
        name: "Bravo",
        degree: 2,
      },
      {
        id: "charlie",
        name: "Charlie",
        degree: 2,
      },
      {
        id: "delta",
        name: "Delta",
        degree: 2,
      },
      {
        id: "echo",
        name: "Echo",
        degree: 1,
      },
    ],
    segments: [
      {
        id: "alpha__bravo",
        from: "alpha",
        to: "bravo",
        patterns: ["pattern:x"],
      },
      {
        id: "bravo__charlie",
        from: "bravo",
        to: "charlie",
        patterns: ["pattern:x"],
      },
      {
        id: "charlie__delta",
        from: "charlie",
        to: "delta",
        patterns: ["pattern:x"],
      },
      {
        id: "delta__echo",
        from: "delta",
        to: "echo",
        patterns: ["pattern:x"],
      },
    ],
    patterns: [
      {
        id: "pattern:x",
        terminalFrom: "Alpha",
        terminalTo: "Echo",
        stops: ["alpha", "delta", "echo"],
        tripCount: 1,
      },
    ],
    branches: [],
    loops: [],
    branchPoints: [],
    terminals: ["alpha", "echo"],
  };
}

function createPatternStationOption(
  label: string,
  id: string,
): StationSearchOption {
  return {
    id: `stop_area:IDFM:${id}`,
    label,
    monitoringRef: `STIF:StopArea:SP:${id}:`,
    scheduleStopAreaRef: `stop_area:IDFM:${id}`,
  };
}

function createTransfer(
  label: string,
  family: TransferLineOption["family"],
): TransferLineOption {
  return {
    id: `${family}:${label}`,
    label,
    family,
    mode: family === "METRO" ? "metro" : undefined,
  };
}

function servedCallLabels(pattern: { calls: Array<{ label: string; served: boolean }> }): string[] {
  return pattern.calls.filter((call) => call.served).map((call) => call.label);
}

function expectCurrentCall(
  pattern: { calls: Array<{ label: string; current: boolean; served: boolean }> },
  expectedLabel: string,
): void {
  const currentCalls = pattern.calls.filter((call) => call.current);

  expect(currentCalls.map((call) => call.label)).toEqual([expectedLabel]);
  expect(currentCalls[0]?.served).toBe(true);
}

function expectLightClassForTripDirection(params: {
  expectedClass: string;
  sourceLabel: string;
  targetLabel: string;
  visualSourceX: number;
  visualTargetX: number;
}): void {
  const source = stationKey(params.sourceLabel);
  const target = stationKey(params.targetLabel);
  const visualEdge =
    params.visualSourceX <= params.visualTargetX
      ? { source, target }
      : { source: target, target: source };

  expect(
    getFlowLightEdgeClass({
      direction: { source, target },
      visualEdge,
    }),
  ).toBe(params.expectedClass);
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

