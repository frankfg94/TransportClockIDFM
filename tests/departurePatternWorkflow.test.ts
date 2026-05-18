import { describe, expect, it, vi } from "vitest";
import { createBoardFromDraft } from "../src/services/boardBuilder";
import {
  createPatternStationKey,
  type PatternStationKeySource,
} from "../src/features/service-pattern/stationKeys";
import { getFlowLightEdgeClass } from "../src/features/service-pattern/flowDirection";
import { hydrateDeparturePatternTransfers } from "../src/features/service-pattern/patternTransfers";
import {
  convertServerTopologyToLineRouteSequences,
  fetchDepartureCallingPattern,
} from "../src/services/idfm";
import type {
  Departure,
  DepartureCall,
  DepartureCallingPattern,
  DirectionGroupConfig,
  LineSearchOption,
  StationSearchOption,
  TransferLineOption,
  TransitFamilyOption,
  TransitBoardConfig,
} from "../src/types/transit";
import { transitBoards } from "../src/config/transitBoards";
import { getLineTopology } from "../server/services/topology/getLineTopology";
import { resolveStopAreaPatternCandidates } from "../server/services/idfm/resolveStopArea";
import type { LineTopology, TopologyStation } from "../server/services/topology/types";
import {
  assertPatternHasNoOrphanStations,
  buildLinePatternView,
} from "../server/services/servicePattern/buildLinePatternView";
import { buildLiveLinePatternView } from "../server/services/servicePattern/buildLiveLinePatternView";

const terminalLabels = [
  "Boissy-Saint-Léger",
  "Cergy le Haut",
  "Marne-la-Vallée Chessy",
  "Poissy",
  "Saint-Germain-en-Laye",
];
const westboundRerATerminals = [
  "Cergy le Haut",
  "Poissy",
  "Saint-Germain-en-Laye",
];

describe("station add to service-pattern modal workflow", () => {
  it("adds Transilien J / Cormeilles-en-Parisis and passes coherent VueFlow modal props", async () => {
    const homeBoards = [...transitBoards];
    expect(homeBoards.map((board) => board.title)).toContain("Les Peintres");
    expect(homeBoards.map((board) => board.title)).toContain("La Croix de Berny");

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
    expect(addedBoard.schedule?.lineRef).toBe("line:IDFM:C01795");

    const mantesDeparture = createMantesDeparture(addedBoard);
    const mantesGroup = directionGroups[0];
    const pattern = await createCormeillesMantesPattern(mantesDeparture);
    const modalProps = createDeparturePatternModalProps(
      addedBoard,
      mantesGroup,
      mantesDeparture,
      pattern,
    );

    expect(modalProps.board.title).toBe("Cormeilles-en-Parisis");
    expect(modalProps.departure.destination).toBe("Mantes-la-Jolie");
    expect(modalProps.pattern.destination).toBe("Mantes-la-Jolie");
    expect(modalProps.pattern.lineTopology?.length).toBeGreaterThan(0);
    expectCurrentCall(modalProps.pattern, "Cormeilles-en-Parisis");

    const modalGraph = createModalInputGraph(modalProps.pattern);
    expect(modalGraph.orphanKeys).toEqual([]);
    expect(modalGraph.shouldPruneTopologyEdges).toBe(false);
    expect(modalGraph.edgeKeys).toContain("bonnieres--vernongiverny");
    expect(modalGraph.edgeKeys).toContain("limay--mantesstation");
    expect(modalGraph.edgeKeys).toContain("manteslajolie--rosnysurseine");
    expect(modalGraph.edgeKeys).toContain("conflansfindoise--conflanssaintehonorine");
    expect(modalGraph.edgeKeys).toContain("conflanssaintehonorine--eragnyneuville");

    const cormeillesCallKey = createPatternStationKey(
      pattern.calls.find((call) => call.label === "Cormeilles-en-Parisis")!,
    );
    const cormeillesTopologyKey = createPatternStationKey(
      modalProps.pattern.lineTopology!
        .flatMap((sequence) => sequence.stops)
        .find((stop) => stop.label === "Cormeilles-en-Parisis")!,
    );

    expect(cormeillesCallKey).toBe(cormeillesTopologyKey);
  });

  it("keeps the RER B Saint-Remy branch complete when opening the VueFlow modal", async () => {
    const board = transitBoards.find(
      (candidate) => candidate.title === "La Croix de Berny",
    );

    expect(board).toBeDefined();
    expect(board?.line.shortName).toBe("B");

    const saintRemyGroup = createRerBSaintRemyDirectionGroup();
    const departure = createRerBSaintRemyDeparture(board!);
    const pattern = await createRerBSaintRemyPattern(departure);
    const modalProps = createDeparturePatternModalProps(
      board!,
      saintRemyGroup,
      departure,
      pattern,
    );
    const modalGraph = createModalInputGraph(modalProps.pattern);

    expect(modalProps.pattern.lineTopology?.length).toBeGreaterThan(0);
    expectCurrentCall(modalProps.pattern, "La Croix de Berny");
    expect(modalGraph.orphanKeys).toEqual([]);
    expect(modalGraph.shouldPruneTopologyEdges).toBe(false);
    expect(modalGraph.stationKeys).toContain("gifsuryvette");
    expect(modalGraph.edgeKeys).toContain("massypalaiseau--palaiseau");
    expect(modalGraph.edgeKeys).toContain("palaiseau--palaiseauvillebon");
    expect(modalGraph.edgeKeys).toContain("lozere--palaiseauvillebon");
    expect(modalGraph.edgeKeys).toContain("leguichet--lozere");
    expect(modalGraph.edgeKeys).toContain("leguichet--orsayville");
    expect(modalGraph.edgeKeys).toContain("buressuryvette--orsayville");
    expect(modalGraph.edgeKeys).toContain("buressuryvette--lahacquiniere");
    expect(modalGraph.edgeKeys).toContain("gifsuryvette--lahacquiniere");
    expect(modalGraph.edgeKeys).toContain("courcellesuryvette--gifsuryvette");
    expect(modalGraph.edgeKeys).toContain(
      "courcellesuryvette--saintremyleschevreuse",
    );

    const gifCallKey = createPatternStationKey(
      pattern.calls.find((call) => call.label === "Gif-sur-Yvette")!,
    );
    const gifTopologyKey = createPatternStationKey(
      modalProps.pattern.lineTopology!
        .flatMap((sequence) => sequence.stops)
        .find((stop) => stop.label === "Gif-sur-Yvette")!,
    );

    expect(gifCallKey).toBe(gifTopologyKey);
  });

  it("fetches the RER B Saint-Remy pattern through the app service with every branch station intact", async () => {
    const board = transitBoards.find(
      (candidate) => candidate.title === "La Croix de Berny",
    );

    expect(board).toBeDefined();

    const topology = await getLineTopology("rer-b");
    const saintRemyPattern = topology.patterns.find(
      (pattern) => pattern.id === "b-cdg-saint-remy",
    );

    expect(saintRemyPattern).toBeDefined();

    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.startsWith("/api/lines/")) {
        return jsonResponse(topology);
      }

      if (url.includes("/lines/line%3AIDFM%3AC01743/routes")) {
        return jsonResponse({
          routes: [
            {
              id: "route:rer-b:cdg-saint-remy",
              name: "Aéroport Charles de Gaulle 2 - Saint-Rémy-lès-Chevreuse",
              direction: {
                name: "Saint-Rémy-lès-Chevreuse",
              },
            },
          ],
        });
      }

      if (url.includes("/lines/line%3AIDFM%3AC01743/stop_areas")) {
        return jsonResponse({
          stop_areas: topology.stations.map((station) => ({
            id: `stop_area:IDFM:${station.id}`,
            name: station.name,
            label: station.name,
          })),
        });
      }

      if (url.includes("/routes/route%3Arer-b%3Acdg-saint-remy/route_schedules")) {
        return jsonResponse({
          route_schedules: [
            {
              display_informations: {
                direction: "Saint-Rémy-lès-Chevreuse",
              },
              table: {
                rows: saintRemyPattern!.stops.map((stationId, index) => {
                  const station = topology.stations.find(
                    (candidate) => candidate.id === stationId,
                  )!;
                  const servedIndex = saintRemyPattern!.stops.indexOf(
                    "la-croix-de-berny",
                  );

                  return {
                    stop_point: {
                      id: `stop_point:IDFM:${station.id}`,
                      name: station.name,
                      label: station.name,
                      stop_area: {
                        id: `stop_area:IDFM:${station.id}`,
                        name: station.name,
                        label: station.name,
                      },
                    },
                    date_times:
                      index >= servedIndex
                        ? [
                            {
                              date_time: formatNavitiaFixtureTime(index - servedIndex),
                              links: [
                                {
                                  id: "vehicle_journey:rer-b:test-saint-remy",
                                  rel: "vehicle_journey",
                                  type: "vehicle_journey",
                                },
                              ],
                            },
                          ]
                        : [],
                  };
                }),
              },
            },
          ],
        });
      }

      if (url.includes("/stop_areas/") && url.includes("/lines")) {
        return jsonResponse({ lines: [] });
      }

      throw new Error(`Unexpected fetch in RER B service test: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const departure = createRerBSaintRemyDeparture(board!);
      const pattern = await fetchDepartureCallingPattern(board!, departure);
      const modalGraph = createModalInputGraph(pattern);

      expect(pattern.destination).toBe("Saint-Rémy-lès-Chevreuse");
      expect(pattern.lineTopology?.every((sequence) => sequence.topologySource === "server")).toBe(
        true,
      );
      expectCurrentCall(pattern, "La Croix de Berny");
      expect(pattern.calls.filter((call) => call.served).map((call) => call.label)).toEqual([
        "La Croix de Berny",
        "Antony",
        "Fontaine Michalon",
        "Les Baconnets",
        "Massy - Verrières",
        "Massy - Palaiseau",
        "Palaiseau",
        "Palaiseau - Villebon",
        "Lozère",
        "Le Guichet",
        "Orsay-Ville",
        "Bures-sur-Yvette",
        "La Hacquinière",
        "Gif-sur-Yvette",
        "Courcelle-sur-Yvette",
        "Saint-Rémy-lès-Chevreuse",
      ]);
      expect(modalGraph.orphanKeys).toEqual([]);
      expect(modalGraph.stationKeys).toContain("gifsuryvette");
      expect(modalGraph.edgeKeys).toContain("gifsuryvette--lahacquiniere");
      expect(modalGraph.edgeKeys).toContain("courcellesuryvette--gifsuryvette");
      expectLightClassForTripDirection({
        expectedClass: "pattern-flow-edge--light",
        pattern,
        sourceLabel: "La Croix de Berny",
        targetLabel: "Antony",
        visualSourceX: 0,
        visualTargetX: 100,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/lines/line%3AIDFM%3AC01743/topology",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps every RER A service direction on its own terminal branch", async () => {
    const board = createRerALaDefenseBoard();
    const topology = await getLineTopology("rer-a");
    const originalFetch = globalThis.fetch;
    const routePatterns = {
      "route:rer-a:cergy": {
        direction: "Cergy le Haut",
        stops: reversePatternStops(topology, "a-cergy-marne"),
      },
      "route:rer-a:saint-germain": {
        direction: "Saint-Germain-en-Laye",
        stops: reversePatternStops(topology, "a-saint-germain-boissy"),
      },
      "route:rer-a:poissy": {
        direction: "Poissy",
        stops: reversePatternStops(topology, "a-poissy-marne"),
      },
      "route:rer-a:marne": {
        direction: "Marne-la-Vallée Chessy",
        stops: topology.patterns.find((pattern) => pattern.id === "a-cergy-marne")!
          .stops,
      },
      "route:rer-a:boissy": {
        direction: "Boissy-Saint-Léger",
        stops: topology.patterns.find(
          (pattern) => pattern.id === "a-saint-germain-boissy",
        )!.stops,
      },
    } as const;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.startsWith("/api/lines/")) {
        return jsonResponse(topology);
      }

      if (url.includes("/lines/line%3AIDFM%3AC01742/routes")) {
        return jsonResponse({
          routes: Object.entries(routePatterns).map(([id, pattern]) => ({
            id,
            name: pattern.direction,
            direction: {
              name: pattern.direction,
            },
          })),
        });
      }

      if (url.includes("/lines/line%3AIDFM%3AC01742/stop_areas")) {
        return jsonResponse({
          stop_areas: topology.stations.map((station) => ({
            id: `stop_area:IDFM:${station.id}`,
            name: station.name,
            label: station.name,
          })),
        });
      }

      const routeId = Object.keys(routePatterns).find((id) =>
        url.includes(encodeURIComponent(id)),
      );

      if (routeId && url.includes("/route_schedules")) {
        const routePattern = routePatterns[routeId as keyof typeof routePatterns];

        return jsonResponse({
          route_schedules: [
            {
              display_informations: {
                direction: routePattern.direction,
              },
              table: {
                rows: routePattern.stops.map((stationId, index) => {
                  const station = topology.stations.find(
                    (candidate) => candidate.id === stationId,
                  )!;
                  return {
                    stop_point: createMockStopPoint(station),
                    date_times:
                      routeId === "route:rer-a:cergy" &&
                      station.id === "vincennes"
                        ? []
                        : [
                            {
                              date_time: formatNavitiaFixtureTime(index),
                              links: [
                                {
                                  id: `vehicle_journey:rer-a:${routeId}`,
                                  rel: "vehicle_journey",
                                  type: "vehicle_journey",
                                },
                              ],
                            },
                          ],
                  };
                }),
              },
            },
          ],
        });
      }

      if (url.includes("/stop_areas/") && url.includes("/lines")) {
        return jsonResponse({ lines: [] });
      }

      throw new Error(`Unexpected fetch in RER A service test: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      for (const expectedTerminal of [
        "Cergy le Haut",
        "Saint-Germain-en-Laye",
        "Poissy",
        "Marne-la-Vallée Chessy",
        "Boissy-Saint-Léger",
      ]) {
        const pattern = await fetchDepartureCallingPattern(
          board,
          createRerADeparture(board, expectedTerminal),
        );
        const servedLabels = pattern.calls
          .filter((call) => call.served)
          .map((call) => call.label);
        const modalGraph = createModalInputGraph(pattern);

        expect(pattern.destination).toBe(expectedTerminal);
        expectCurrentCall(pattern, "La Défense");
        expect(servedLabels.at(-1)).toBe(expectedTerminal);
        expect(servedLabels.filter((label) => terminalLabels.includes(label))).toEqual([
          expectedTerminal,
        ]);
        expect(modalGraph.orphanKeys).toEqual([]);
        expect(modalGraph.edgeKeys).not.toContain("cergylehaut--saintgermainenlaye");
        expectLightClassForTripDirection({
          expectedClass: westboundRerATerminals.includes(expectedTerminal)
            ? "pattern-flow-edge--light pattern-flow-edge--light-reverse"
            : "pattern-flow-edge--light",
          pattern,
          sourceLabel: "La Défense",
          targetLabel: westboundRerATerminals.includes(expectedTerminal)
            ? "Nanterre Préfecture"
            : "Charles de Gaulle - Étoile",
          visualSourceX: westboundRerATerminals.includes(expectedTerminal) ? 100 : 0,
          visualTargetX: westboundRerATerminals.includes(expectedTerminal) ? 0 : 100,
        });
      }

      const vincennesBoard = createRerAVincennesBoard();
      const vincennesToCergyPattern = await fetchDepartureCallingPattern(
        vincennesBoard,
        createRerADeparture(
          vincennesBoard,
          "Cergy le Haut",
          "Châtelet - Les Halles",
        ),
      );
      const vincennesToCergyServedLabels = vincennesToCergyPattern.calls
        .filter((call) => call.served)
        .map((call) => call.label);

      expect(vincennesToCergyPattern.destination).toBe("Cergy le Haut");
      expectCurrentCall(vincennesToCergyPattern, "Vincennes");
      expect(vincennesToCergyServedLabels[0]).toBe("Vincennes");
      expect(vincennesToCergyServedLabels.slice(0, 4)).toEqual([
        "Vincennes",
        "Nation",
        "Gare de Lyon",
        "Châtelet - Les Halles",
      ]);
      expect(vincennesToCergyServedLabels).toContain("Vincennes");
      expect(vincennesToCergyServedLabels.at(-1)).toBe("Cergy le Haut");
      expect(
        vincennesToCergyServedLabels.filter((label) =>
          terminalLabels.includes(label),
        ),
      ).toEqual(["Cergy le Haut"]);
      expect(vincennesToCergyServedLabels).not.toContain("Saint-Germain-en-Laye");
      expectLightClassForTripDirection({
        expectedClass: "pattern-flow-edge--light",
        pattern: vincennesToCergyPattern,
        sourceLabel: "Vincennes",
        targetLabel: "Nation",
        visualSourceX: 0,
        visualTargetX: 100,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, 30_000);

  it("builds the dedicated Metro 4 line pattern API without skipped stations", async () => {
    const response = await buildLinePatternView({
      transportType: "metro",
      lineId: "4",
      directionId: "porte-de-clignancourt",
      startStationId: "bagneux-lucie-aubrac",
    });
    const statuses = response.stationStatuses.map((station) => station.status);
    const servedLabels = response.pattern.calls
      .filter((call) => call.served)
      .map((call) => call.label);

    expect(response.board.line.shortName).toBe("4");
    expect(response.pattern.destination).toBe("Porte de Clignancourt");
    expect(response.startStationId).toBe("bagneux-lucie-aubrac");
    expect(statuses).not.toContain("not_served");
    expect(response.stationStatuses.every((station) => station.served)).toBe(true);
    expect(servedLabels[0]).toBe("Bagneux - Lucie Aubrac");
    expect(servedLabels.at(-1)).toBe("Porte de Clignancourt");
    expect(servedLabels).toContain("Châtelet");
    expect(assertPatternHasNoOrphanStations(response)).toEqual([]);
    expectCurrentCall(response.pattern, "Bagneux - Lucie Aubrac");

    const southbound = await buildLinePatternView({
      transportType: "metro",
      lineId: "4",
      directionId: "bagneux-lucie-aubrac",
      startStationId: "stop_area:IDFM:71426",
      startStationCandidates: [
        "Barbès - Rochechouart",
        "Barbès - Rochechouart (Paris)",
      ],
    });
    const montparnasse = southbound.stationStatuses.find(
      (station) => station.label === "Montparnasse Bienvenüe",
    );
    const southboundServedLabels = southbound.pattern.calls
      .filter((call) => call.served)
      .map((call) => call.label);

    expect(southbound.pattern.destination).toBe("Bagneux - Lucie Aubrac");
    expect(southbound.startStationId).toBe("barbes-rochechouart");
    expect(southboundServedLabels[0]).toBe("Barbès - Rochechouart");
    expect(southboundServedLabels).not.toContain("Porte de Clignancourt");
    expectCurrentCall(southbound.pattern, "Barbès - Rochechouart");
    expect(montparnasse?.status).toBe("served");
    expect(montparnasse?.served).toBe(true);
    expect(
      southbound.pattern.lineTopology
        ?.flatMap((sequence) => sequence.stops)
        .some((stop) => (stop.transferLines?.length ?? 0) > 0),
    ).toBe(false);
    const southboundNotServedLabels = southbound.stationStatuses
      .filter((station) => station.status === "not_served")
      .map((station) => station.label);

    expect(southboundNotServedLabels).toEqual(
      expect.arrayContaining([
        "Porte de Clignancourt",
        "Simplon",
        "Marcadet - Poissonniers",
        "Château Rouge",
      ]),
    );
    expect(southboundNotServedLabels).toHaveLength(4);
  });

  it("falls back to live Navitia topology when a local fixture does not exist", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.includes("/pt_objects")) {
        return jsonResponse({
          pt_objects: [
            {
              embedded_type: "line",
              line: {
                id: "line:IDFM:C02528",
                name: "T10",
                code: "T10",
                commercial_mode: {
                  name: "Tramway",
                },
                routes: [
                  {
                    id: "route:t10:jardin",
                    name: "Jardin Parisien",
                    direction: {
                      name: "Jardin Parisien",
                    },
                  },
                  {
                    id: "route:t10:croix",
                    name: "Croix de Berny",
                    direction: {
                      name: "Croix de Berny",
                    },
                  },
                ],
              },
            },
          ],
        });
      }

      if (url.includes(encodeURIComponent("route:t10:jardin"))) {
        return jsonResponse({
          route_schedules: [
            createLiveRouteSchedule("Jardin Parisien", [
              createLiveStopPoint("stop_area:IDFM:69813", "La Croix de Berny"),
              createLiveStopPoint("stop_area:IDFM:69839", "Les Peintres"),
              createLiveStopPoint("stop_area:IDFM:70163", "Jardin Parisien"),
            ]),
          ],
        });
      }

      if (url.includes(encodeURIComponent("route:t10:croix"))) {
        return jsonResponse({
          route_schedules: [
            createLiveRouteSchedule("Croix de Berny", [
              createLiveStopPoint("stop_area:IDFM:70163", "Jardin Parisien"),
              createLiveStopPoint("stop_area:IDFM:69839", "Les Peintres"),
              createLiveStopPoint("stop_area:IDFM:69813", "La Croix de Berny"),
            ]),
          ],
        });
      }

      throw new Error(`Unexpected fetch in T10 live topology test: ${url}`);
    });
    const response = await buildLiveLinePatternView({
      transportType: "tram",
      lineId: "T10",
      directionId: "Jardin Parisien",
      startStationId: "stop_area:IDFM:69839",
      startStationCandidates: ["Les Peintres", "Les Peintres (Châtenay-Malabry)"],
      apiKey: "test-api-key",
      fetcher: fetchMock as unknown as typeof fetch,
    });
    const servedLabels = response.pattern.calls
      .filter((call) => call.served)
      .map((call) => call.label);

    expect(response.board.line.shortName).toBe("T10");
    expect(response.pattern.destination).toBe("Jardin Parisien");
    expect(response.startStationId).toBe("stop_area:IDFM:69839");
    expectCurrentCall(response.pattern, "Les Peintres");
    expect(servedLabels).toEqual(["Les Peintres", "Jardin Parisien"]);
    expect(assertPatternHasNoOrphanStations(response)).toEqual([]);
  });

  it("hydrates line-pattern transfers on the fly without hardcoding them in topology JSON", async () => {
    const response = await buildLinePatternView({
      transportType: "metro",
      lineId: "4",
      directionId: "bagneux-lucie-aubrac",
      startStationId: "stop_area:IDFM:71426",
      startStationCandidates: [
        "Barbès - Rochechouart",
        "Barbès - Rochechouart (Paris)",
      ],
    });
    const searches: Array<{ family: string; query: string }> = [];
    const transferLookups: string[] = [];
    const hydrated = await hydrateDeparturePatternTransfers(
      response.board,
      response.pattern,
      {
        async searchLines(network: TransitFamilyOption, query: string) {
          searches.push({ family: network.family, query });

          return [createMetro4Line()];
        },
        async searchStations() {
          return [
            createPatternStationOption("Porte de Clignancourt", "71426"),
            createPatternStationOption("Gare Montparnasse", "71139"),
            createPatternStationOption("Bagneux - Lucie Aubrac", "71592"),
          ];
        },
        async fetchTransfers(station) {
          transferLookups.push(station.label);

          if (station.label === "Gare Montparnasse") {
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
    const montparnasseTopologyStop = hydrated.lineTopology
      ?.flatMap((sequence) => sequence.stops)
      .find((stop) => stop.label === "Montparnasse Bienvenüe");
    const montparnasseCall = hydrated.calls.find(
      (call) => call.label === "Montparnasse Bienvenüe",
    );

    expect(searches).toEqual([{ family: "METRO", query: "4" }]);
    expect(transferLookups).toContain("Gare Montparnasse");
    expect(montparnasseTopologyStop?.transferLines?.map((line) => line.label)).toEqual(
      expect.arrayContaining(["6", "12", "13"]),
    );
    expect(montparnasseCall?.transferLines?.map((line) => line.label)).toEqual(
      expect.arrayContaining(["6", "12", "13"]),
    );
  });

  it("falls back to commercial-mode lines when IDFM text search misses the current line", async () => {
    const response = await buildLinePatternView({
      transportType: "metro",
      lineId: "4",
      directionId: "bagneux-lucie-aubrac",
      startStationId: "stop_area:IDFM:71426",
      startStationCandidates: [
        "Barbes - Rochechouart",
        "Barbes - Rochechouart (Paris)",
      ],
    });
    const searches: Array<{ networkId: string; family: string; query: string }> = [];
    const transferLookups: string[] = [];
    const board = {
      ...response.board,
      line: {
        ...response.board.line,
        shortName: "M4",
      },
    };
    const hydrated = await hydrateDeparturePatternTransfers(
      board,
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
          searches.push({ networkId: network.id, family: network.family, query });

          return query
            ? []
            : [
                {
                  ...createMetro4Line(),
                  id: "line:IDFM:C01374:fallback-test",
                },
              ];
        },
        async searchStations() {
          return [
            createPatternStationOption("Barbes - Rochechouart", "71426"),
            createPatternStationOption("Chatelet", "71264"),
            createPatternStationOption("Bagneux - Lucie Aubrac", "71592"),
          ];
        },
        async fetchTransfers(station) {
          transferLookups.push(station.label);

          if (station.label === "Chatelet") {
            return [createTransfer("1", "METRO"), createTransfer("7", "METRO")];
          }

          return [];
        },
      },
    );
    const chateletCall = hydrated.calls.find(
      (call) => createPatternStationKey(call) === "chatelet",
    );

    expect(searches).toEqual([
      { networkId: "commercial_mode:Metro", family: "METRO", query: "M4" },
      { networkId: "commercial_mode:Metro", family: "METRO", query: "" },
    ]);
    expect(transferLookups).toContain("Chatelet");
    expect(chateletCall?.transferLines?.map((line) => line.label)).toEqual(
      expect.arrayContaining(["1", "7"]),
    );
  });

  it("builds a dedicated RER B pattern API with Croix de Berny as the current station", async () => {
    const response = await buildLinePatternView({
      transportType: "rer",
      lineId: "B",
      directionId: "mitry-claye",
      startStationId: "la-croix-de-berny",
    });
    const servedLabels = response.pattern.calls
      .filter((call) => call.served)
      .map((call) => call.label);

    expect(response.pattern.destination).toBe("Mitry - Claye");
    expect(servedLabels[0]).toBe("La Croix de Berny");
    expect(servedLabels).toContain("Gare du Nord");
    expectCurrentCall(response.pattern, "La Croix de Berny");
    expect(assertPatternHasNoOrphanStations(response)).toEqual([]);
  });

  it("keeps Croix de Berny current for the exact RER B northbound pattern API URL", async () => {
    const startStationCandidates = await resolveStopAreaPatternCandidates(
      "stop_area:IDFM:69813",
      "test-api-key",
      (async () =>
        jsonResponse({
          stop_area: {
            id: "stop_area:IDFM:69813",
            name: "La Croix de Berny",
            label: "La Croix de Berny (Antony)",
          },
        })) as typeof fetch,
    );
    const response = await buildLinePatternView({
      transportType: "rer",
      lineId: "B",
      directionId: "Aéroport Charles de Gaulle 2 (Terminal 2)",
      startStationId: "stop_area:IDFM:69813",
      startStationCandidates,
    });
    const servedLabels = response.pattern.calls
      .filter((call) => call.served)
      .map((call) => call.label);
    const notServedLabels = response.pattern.calls
      .filter((call) => !call.served)
      .map((call) => call.label);

    expect(startStationCandidates).toEqual(
      expect.arrayContaining(["La Croix de Berny", "La Croix de Berny (Antony)"]),
    );
    expect(response.pattern.destination).toBe("Aéroport Charles de Gaulle 2");
    expect(response.startStationId).toBe("la-croix-de-berny");
    expectCurrentCall(response.pattern, "La Croix de Berny");
    expect(servedLabels[0]).toBe("La Croix de Berny");
    expect(servedLabels.slice(0, 6)).toEqual([
      "La Croix de Berny",
      "Parc de Sceaux",
      "Bourg-la-Reine",
      "Bagneux",
      "Arcueil - Cachan",
      "Laplace",
    ]);
    expect(servedLabels).toContain("Gare du Nord");
    expect(servedLabels.at(-1)).toBe("Aéroport Charles de Gaulle 2");
    expect(notServedLabels).toContain("Saint-Rémy-lès-Chevreuse");
    expect(notServedLabels).toContain("Massy - Palaiseau");
  });
});

function createTransilienJLine(): LineSearchOption {
  return {
    id: "line:IDFM:C01795",
    navitiaId: "line:IDFM:C01795",
    ref: "STIF:Line::C01795:",
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
    displayName: "4 · Métro 4",
    family: "METRO",
    color: "#be418d",
    textColor: "#ffffff",
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

function createRerALaDefenseBoard(): TransitBoardConfig {
  return {
    id: "rer-a-la-defense-test",
    title: "La Défense",
    city: "Puteaux",
    line: {
      ref: "STIF:Line::C01742:",
      shortName: "A",
      longName: "RER A",
      mode: "rer",
      color: "#e2231a",
      textColor: "#ffffff",
    },
    monitoringPoints: [
      {
        ref: "STIF:StopArea:SP:test-la-defense:",
        label: "Tous quais",
      },
    ],
    directionGroups: [],
    schedule: {
      lineRef: "line:IDFM:C01742",
      stopAreaRef: "stop_area:IDFM:la-defense",
    },
    maxDepartures: 10,
  };
}

function createRerAVincennesBoard(): TransitBoardConfig {
  return {
    ...createRerALaDefenseBoard(),
    id: "rer-a-vincennes-test",
    title: "Vincennes",
    city: "Vincennes",
    schedule: {
      lineRef: "line:IDFM:C01742",
      stopAreaRef: "stop_area:IDFM:vincennes",
    },
  };
}

function createRerADeparture(
  board: TransitBoardConfig,
  destination: string,
  stopName = "La Défense",
): Departure {
  return {
    id: `test-rer-a-${createTestId(stopName)}-${createTestId(destination)}`,
    lineRef: board.schedule?.lineRef ?? "line:IDFM:C01742",
    monitoringRef: board.schedule?.stopAreaRef ?? "",
    stopName,
    monitoringLabel: "Tous quais",
    destination,
    expectedDepartureTime: "2026-05-17T16:12:00.000Z",
    platform: "1",
    vehicleAtStop: false,
  };
}

function reversePatternStops(topology: LineTopology, patternId: string): string[] {
  return [
    ...topology.patterns.find((pattern) => pattern.id === patternId)!.stops,
  ].reverse();
}

function createMockStopPoint(station: TopologyStation) {
  return {
    id: `stop_point:IDFM:${station.id}`,
    name: station.name,
    label: station.name,
    stop_area: {
      id: `stop_area:IDFM:${station.id}`,
      name: station.name,
      label: station.name,
    },
  };
}

function createTestId(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
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
      id: "mantes-la-jolie",
      label: "Mantes-la-Jolie",
      match: {
        destinationIncludes: ["Mantes-la-Jolie"],
        navitiaStopPointRefs: ["stop_point:IDFM:477365"],
      },
    },
    {
      id: "gare-saint-lazare",
      label: "Gare Saint-Lazare",
      match: {
        destinationIncludes: ["Gare Saint-Lazare", "Paris Saint-Lazare"],
        navitiaStopPointRefs: ["stop_point:IDFM:477364"],
      },
    },
  ];
}

function createMantesDeparture(board: TransitBoardConfig): Departure {
  return {
    id: "test-j-cormeilles-mantes",
    lineRef: board.schedule?.lineRef ?? "line:IDFM:C01795",
    monitoringRef: board.schedule?.stopAreaRef ?? "",
    stopName: "Cormeilles-en-Parisis",
    monitoringLabel: "Quai B",
    destination: "Mantes-la-Jolie",
    expectedDepartureTime: "2026-05-17T16:09:00.000Z",
    platform: "B",
    vehicleAtStop: false,
  };
}

async function createCormeillesMantesPattern(
  departure: Departure,
): Promise<DepartureCallingPattern> {
  const topology = await getLineTopology("transilien-j");
  const lineTopology = convertServerTopologyToLineRouteSequences(topology);
  const calls = [
    createLiveCall("Cormeilles-en-Parisis", "stop_area:IDFM:68244", true, true),
    createLiveCall("Villennes-sur-Seine", "stop_area:IDFM:65965", false, true),
    createLiveCall("Vernouillet - Verneuil", "stop_area:IDFM:65963", false, true),
    createLiveCall(
      "Les Clairières de Verneuil",
      "stop_area:IDFM:65971",
      false,
      true,
    ),
    createLiveCall("Les Mureaux", "stop_area:IDFM:65958", false, true),
    createLiveCall(
      "Aubergenville Élisabethville",
      "stop_area:IDFM:65364",
      false,
      true,
    ),
    createLiveCall("Mantes Station", "stop_area:IDFM:65770", false, true),
    createLiveCall("Mantes-la-Jolie", "stop_area:IDFM:65931", false, true),
  ];

  return {
    departureId: departure.id,
    destination: departure.destination,
    serviceType: "semi-direct",
    calls,
    lineTopology,
  };
}

function createRerBSaintRemyDirectionGroup(): DirectionGroupConfig {
  return {
    id: "saint-remy-les-chevreuse",
    label: "Saint-Remy-les-Chevreuse",
    match: {
      destinationIncludes: ["Saint-Remy", "Saint-Rémy"],
      navitiaStopPointRefs: ["stop_point:IDFM:463696"],
    },
  };
}

function createRerBSaintRemyDeparture(board: TransitBoardConfig): Departure {
  return {
    id: "test-rer-b-croix-saint-remy",
    lineRef: board.schedule?.lineRef ?? "line:IDFM:C01743",
    monitoringRef: board.schedule?.stopAreaRef ?? "",
    stopName: "La Croix de Berny",
    monitoringLabel: "Quai 1",
    destination: "Saint-Rémy-lès-Chevreuse",
    expectedDepartureTime: "2026-05-17T16:12:00.000Z",
    platform: "1",
    vehicleAtStop: false,
  };
}

async function createRerBSaintRemyPattern(
  departure: Departure,
): Promise<DepartureCallingPattern> {
  const topology = await getLineTopology("rer-b");
  const lineTopology = convertServerTopologyToLineRouteSequences(topology);
  const calls = [
    createLiveCall("La Croix de Berny", "stop_area:IDFM:463501", true, true),
    createLiveCall("Antony", "stop_area:IDFM:463508", false, true),
    createLiveCall("Fontaine Michalon", "stop_area:IDFM:463507", false, true),
    createLiveCall("Les Baconnets", "stop_area:IDFM:463506", false, true),
    createLiveCall("Massy - Verrières", "stop_area:IDFM:463505", false, true),
    createLiveCall("Massy - Palaiseau", "stop_area:IDFM:463504", false, true),
    createLiveCall("Palaiseau", "stop_area:IDFM:test-palaiseau", false, true),
    createLiveCall(
      "Palaiseau - Villebon",
      "stop_area:IDFM:test-palaiseau-villebon",
      false,
      true,
    ),
    createLiveCall("Lozère", "stop_area:IDFM:test-lozere", false, true),
    createLiveCall("Le Guichet", "stop_area:IDFM:test-le-guichet", false, true),
    createLiveCall("Orsay-Ville", "stop_area:IDFM:test-orsay-ville", false, true),
    createLiveCall(
      "Bures-sur-Yvette",
      "stop_area:IDFM:test-bures-sur-yvette",
      false,
      true,
    ),
    createLiveCall(
      "La Hacquinière",
      "stop_area:IDFM:test-la-hacquiniere",
      false,
      true,
    ),
    createLiveCall("Gif-sur-Yvette", "stop_area:IDFM:test-gif-sur-yvette", false, true),
    createLiveCall(
      "Courcelle-sur-Yvette",
      "stop_area:IDFM:test-courcelle-sur-yvette",
      false,
      true,
    ),
    createLiveCall(
      "Saint-Rémy-lès-Chevreuse",
      "stop_area:IDFM:463696",
      false,
      true,
    ),
  ];

  return {
    departureId: departure.id,
    destination: departure.destination,
    serviceType: "omnibus",
    calls,
    lineTopology,
  };
}

function createLiveCall(
  label: string,
  stopAreaRef: string,
  current: boolean,
  served: boolean,
): DepartureCall {
  return {
    id: `call:${stopAreaRef}`,
    label,
    current,
    served,
    stopAreaRef,
    time: current ? "2026-05-17T16:09:00.000Z" : undefined,
  };
}

function createDeparturePatternModalProps(
  board: TransitBoardConfig,
  directionGroup: DirectionGroupConfig,
  departure: Departure,
  pattern: DepartureCallingPattern,
) {
  return {
    open: true,
    board,
    directionGroup,
    departure,
    error: "",
    loading: false,
    pattern,
  };
}

function createModalInputGraph(pattern: DepartureCallingPattern): {
  edgeKeys: string[];
  orphanKeys: string[];
  stationKeys: string[];
  shouldPruneTopologyEdges: boolean;
} {
  const stationKeys = new Set<string>();
  const edgeKeys = new Set<string>();

  pattern.lineTopology?.forEach((sequence) => {
    const stops = sequence.stops.map((stop) =>
      createPatternStationKey(stop as PatternStationKeySource),
    );

    stops.forEach((stop) => stationKeys.add(stop));
    stops.slice(0, -1).forEach((source, index) => {
      const target = stops[index + 1];

      if (source !== target) {
        edgeKeys.add([source, target].sort().join("--"));
      }
    });
  });

  const degree = new Map<string, number>(
    [...stationKeys].map((stationKey) => [stationKey, 0]),
  );

  edgeKeys.forEach((edgeKey) => {
    const [source, target] = edgeKey.split("--");

    degree.set(source, (degree.get(source) ?? 0) + 1);
    degree.set(target, (degree.get(target) ?? 0) + 1);
  });

  return {
    edgeKeys: [...edgeKeys],
    stationKeys: [...stationKeys],
    shouldPruneTopologyEdges: (pattern.lineTopology?.length ?? 0) === 0,
    orphanKeys: [...degree.entries()]
      .filter(([, value]) => value === 0)
      .map(([stationKey]) => stationKey),
  };
}

function expectLightClassForTripDirection(params: {
  expectedClass: string;
  pattern: DepartureCallingPattern;
  sourceLabel: string;
  targetLabel: string;
  visualSourceX: number;
  visualTargetX: number;
}): void {
  const sourceCall = params.pattern.calls.find(
    (call) => call.label === params.sourceLabel,
  );
  const targetCall = params.pattern.calls.find(
    (call) => call.label === params.targetLabel,
  );

  expect(sourceCall).toBeDefined();
  expect(targetCall).toBeDefined();

  const source = createPatternStationKey(sourceCall!);
  const target = createPatternStationKey(targetCall!);
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

function expectCurrentCall(
  pattern: DepartureCallingPattern,
  expectedLabel: string,
): void {
  const currentCalls = pattern.calls.filter((call) => call.current);

  expect(currentCalls.map((call) => call.label)).toEqual([expectedLabel]);
  expect(currentCalls[0]?.served).toBe(true);
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
    },
    status: 200,
  });
}

function createLiveRouteSchedule(direction: string, stops: unknown[]) {
  return {
    display_informations: {
      direction,
    },
    table: {
      rows: stops.map((stopPoint) => ({
        stop_point: stopPoint,
      })),
    },
  };
}

function createLiveStopPoint(id: string, name: string) {
  return {
    id: `stop_point:${id}`,
    name,
    label: name,
    stop_area: {
      id,
      name,
      label: name,
    },
  };
}

function formatNavitiaFixtureTime(offsetMinutes: number): string {
  const date = new Date(2026, 4, 17, 22, 56 + offsetMinutes * 2, 0);
  const pad = (value: number) => value.toString().padStart(2, "0");

  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
