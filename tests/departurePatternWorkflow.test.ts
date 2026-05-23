import { describe, expect, it } from "vitest";
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
} from "../server/services/servicePattern/buildLinePatternView";

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
    expectCurrentCall(response.pattern, "Gagny");
    expect(servedLabels[0]).toBe("Gagny");
    expect(servedLabels).toContain("Chelles - Gournay");
    expect(assertPatternHasNoOrphanStations(response)).toEqual([]);
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
        async fetchTransfers(station) {
          transferLookups.push(station.label);

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
