import { describe, expect, it, vi } from "vitest";
import { fetchStationTransfersFromArretsLignes } from "../src/services/idfmOpenDataTransfers";
import type { StationSearchOption } from "../src/types/transit";

interface ArretsLignesFixtureRow {
  id: string;
  mode: string;
  route_long_name: string;
  shortname: string;
  stop_id: string;
  stop_name: string;
}

interface RerBExpectation {
  compatibleStopNames?: string[];
  expected: string[];
  forbidden?: string[];
  station: string;
}

const RER_B_LINE_ID = "line:IDFM:C01743";

const RER_B_STATIONS = [
  "Aéroport CDG 1 (Terminal 3) - RER",
  "Aéroport Charles de Gaulle 2 (Terminal 2)",
  "Antony",
  "Arcueil - Cachan",
  "Aulnay-sous-Bois",
  "Bagneux",
  "Bourg-la-Reine",
  "Bures-sur-Yvette",
  "Châtelet - Les Halles",
  "Cité Universitaire",
  "Courcelle-sur-Yvette",
  "Denfert-Rochereau",
  "Drancy",
  "Fontaine Michalon",
  "Fontenay-aux-Roses",
  "Gare du Nord",
  "Gentilly",
  "Gif-sur-Yvette",
  "La Courneuve - Aubervilliers",
  "La Croix de Berny",
  "La Hacquinière",
  "La Plaine Stade de France",
  "Laplace",
  "Le Blanc-Mesnil",
  "Le Bourget",
  "Le Guichet",
  "Les Baconnets",
  "Lozère",
  "Luxembourg",
  "Massy - Palaiseau",
  "Massy - Verrières",
  "Mitry - Claye",
  "Orsay Ville",
  "Palaiseau",
  "Palaiseau - Villebon",
  "Parc de Sceaux",
  "Parc des Expositions",
  "Port Royal",
  "Robinson",
  "Saint-Michel Notre-Dame",
  "Saint-Rémy-lès-Chevreuse",
  "Sceaux",
  "Sevran - Livry",
  "Sevran Beaudottes",
  "Vert Galant",
  "Villeparisis - Mitry-le-Neuf",
  "Villepinte",
];

const RER_B_EXPECTATIONS: RerBExpectation[] = [
  { station: "Aéroport CDG 1 (Terminal 3) - RER", expected: ["CDGVAL"] },
  { station: "Aéroport Charles de Gaulle 2 (Terminal 2)", expected: ["CDGVAL"] },
  { station: "Antony", expected: ["ORLYVAL"] },
  { station: "Arcueil - Cachan", expected: [] },
  { station: "Aulnay-sous-Bois", expected: ["K", "T4"] },
  { station: "Bagneux", expected: [] },
  { station: "Bourg-la-Reine", expected: [] },
  { station: "Bures-sur-Yvette", expected: [] },
  {
    station: "Châtelet - Les Halles",
    expected: ["1", "4", "7", "11", "14", "A", "D"],
  },
  { station: "Cité Universitaire", expected: ["T3a"] },
  { station: "Courcelle-sur-Yvette", expected: [] },
  { station: "Denfert-Rochereau", expected: ["4", "6"] },
  { station: "Drancy", expected: ["K"] },
  { station: "Fontaine Michalon", expected: [] },
  {
    station: "Fontenay-aux-Roses",
    expected: [],
    forbidden: ["3", "3B"],
  },
  {
    station: "Gare du Nord",
    expected: ["2", "4", "5", "D", "E", "H", "K"],
  },
  { station: "Gentilly", expected: [] },
  { station: "Gif-sur-Yvette", expected: [] },
  { station: "La Courneuve - Aubervilliers", expected: [] },
  { station: "La Croix de Berny", expected: ["T10"] },
  { station: "La Hacquinière", expected: [] },
  { station: "La Plaine Stade de France", expected: [] },
  { station: "Laplace", expected: [] },
  { station: "Le Blanc-Mesnil", expected: ["K"] },
  { station: "Le Bourget", expected: ["K", "T11"] },
  { station: "Le Guichet", expected: [] },
  { station: "Les Baconnets", expected: [] },
  { station: "Lozère", expected: [] },
  { station: "Luxembourg", expected: [] },
  { station: "Massy - Palaiseau", expected: ["C", "T12", "V"] },
  { station: "Massy - Verrières", expected: ["C"] },
  { station: "Mitry - Claye", expected: ["K"] },
  { station: "Orsay Ville", expected: [] },
  { station: "Palaiseau", expected: [] },
  { station: "Palaiseau - Villebon", expected: [] },
  { station: "Parc de Sceaux", expected: [] },
  { station: "Parc des Expositions", expected: [] },
  { station: "Port Royal", expected: [] },
  { station: "Robinson", expected: [] },
  {
    station: "Saint-Michel Notre-Dame",
    compatibleStopNames: ["Saint-Michel", "Cluny - La Sorbonne"],
    expected: ["4", "10", "C"],
  },
  { station: "Saint-Rémy-lès-Chevreuse", expected: [] },
  { station: "Sceaux", expected: [] },
  { station: "Sevran - Livry", expected: [] },
  { station: "Sevran Beaudottes", expected: [] },
  { station: "Vert Galant", expected: [] },
  { station: "Villeparisis - Mitry-le-Neuf", expected: [] },
  { station: "Villepinte", expected: [] },
];

describe("RER B Open Data transfer matrix", () => {
  it.each(RER_B_EXPECTATIONS)(
    "$station includes the expected structural transfers",
    async ({ compatibleStopNames, expected, forbidden = [], station }) => {
      const fetchMock = createArretsLignesFixtureFetch(createRerBFixtureRows());
      const transfers = await fetchStationTransfersFromArretsLignes(
        createStation(station),
        RER_B_LINE_ID,
        {
          compatibleStopNames,
          currentLineLabel: "RER B",
          fetcher: fetchMock as unknown as typeof fetch,
        },
      );
      const labels = transfers.map((transfer) => transfer.label);

      expect(labels).not.toContain("B");

      expected.forEach((label) => expect(labels).toContain(label));
      forbidden.forEach((label) => expect(labels).not.toContain(label));

      if (expected.length === 0) {
        expect(labels.filter((label) => !forbidden.includes(label))).toEqual([]);
      }
    },
  );

  it("covers every RER B station in the regression matrix", () => {
    expect(RER_B_EXPECTATIONS.map((expectation) => expectation.station)).toEqual(
      RER_B_STATIONS,
    );
  });
});

function createRerBFixtureRows(): ArretsLignesFixtureRow[] {
  return [
    ...RER_B_STATIONS.map((station) =>
      createFixtureRow("B", "RapidTransit", station, "IDFM:C01743"),
    ),
    ...createFixtureRows("Aéroport CDG 1 (Terminal 3) - RER", [
      ["CDGVAL", "Cable"],
    ]),
    ...createFixtureRows("Aéroport Charles de Gaulle 2 (Terminal 2)", [
      ["CDGVAL", "Cable"],
    ]),
    ...createFixtureRows("Antony", [["ORLYVAL", "Cable"]]),
    ...createFixtureRows("Aulnay-sous-Bois", [
      ["K", "LocalTrain"],
      ["T4", "Tramway"],
    ]),
    ...createFixtureRows("Le Blanc-Mesnil", [["K", "LocalTrain"]]),
    ...createFixtureRows("Drancy", [["K", "LocalTrain"]]),
    ...createFixtureRows("Le Bourget", [
      ["K", "LocalTrain"],
      ["T11", "Tramway"],
    ]),
    ...createFixtureRows("Gare du Nord", [
      ["2", "Metro"],
      ["4", "Metro"],
      ["5", "Metro"],
      ["D", "RapidTransit"],
      ["E", "RapidTransit"],
      ["H", "LocalTrain"],
      ["K", "LocalTrain"],
    ]),
    ...createFixtureRows("Châtelet - Les Halles", [
      ["A", "RapidTransit"],
      ["D", "RapidTransit"],
    ]),
    ...createFixtureRows("Châtelet", [
      ["1", "Metro"],
      ["4", "Metro"],
      ["7", "Metro"],
      ["11", "Metro"],
      ["14", "Metro"],
    ]),
    ...createFixtureRows("Les Halles", [["4", "Metro"]]),
    ...createFixtureRows("Saint-Michel Notre-Dame", [["C", "RapidTransit"]]),
    ...createFixtureRows("Saint-Michel", [["4", "Metro"]]),
    ...createFixtureRows("Cluny - La Sorbonne", [["10", "Metro"]]),
    ...createFixtureRows("Denfert-Rochereau", [
      ["4", "Metro"],
      ["6", "Metro"],
    ]),
    ...createFixtureRows("Cité Universitaire", [["T3a", "Tramway"]]),
    ...createFixtureRows("La Croix de Berny", [["T10", "Tramway"]]),
    ...createFixtureRows("Massy - Palaiseau", [
      ["C", "RapidTransit"],
      ["T12", "Tramway"],
      ["V", "LocalTrain"],
    ]),
    ...createFixtureRows("Massy - Verrières", [["C", "RapidTransit"]]),
    ...createFixtureRows("Mitry - Claye", [["K", "LocalTrain"]]),
    ...createFixtureRows("Gambetta", [
      ["3", "Metro"],
      ["3B", "Metro"],
    ]),
    ...createFixtureRows("Porte des Lilas", [
      ["3B", "Metro"],
      ["11", "Metro"],
    ]),
    ...createFixtureRows("Fontenay", [["3", "Metro"]]),
  ];
}

function createFixtureRows(
  stopName: string,
  routes: Array<[string, string]>,
): ArretsLignesFixtureRow[] {
  return routes.map(([shortname, mode]) =>
    createFixtureRow(shortname, mode, stopName),
  );
}

function createFixtureRow(
  shortname: string,
  mode: string,
  stopName: string,
  id = `line:fixture:${mode}:${shortname}`,
): ArretsLignesFixtureRow {
  return {
    id,
    mode,
    route_long_name: shortname,
    shortname,
    stop_id: `stop:${normalizeForFixture(stopName)}:${shortname}`,
    stop_name: stopName,
  };
}

function createStation(label: string): StationSearchOption {
  return {
    id: `FR::monomodalStopPlace:${normalizeForFixture(label)}:FR1`,
    label,
    monitoringRef: "",
    scheduleStopAreaRef: `FR::monomodalStopPlace:${normalizeForFixture(
      label,
    )}:FR1`,
  };
}

function createArretsLignesFixtureFetch(rows: ArretsLignesFixtureRow[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(getFetchInputUrl(input));
    const where = url.searchParams.get("where") ?? "";
    const results = rows.filter((row) => fixtureRowMatchesWhere(row, where));

    return new Response(JSON.stringify({ results }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  });
}

function getFetchInputUrl(input: RequestInfo | URL): string {
  if (typeof input === "string" || input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function fixtureRowMatchesWhere(
  row: ArretsLignesFixtureRow,
  where: string,
): boolean {
  const exact = where.match(/^stop_name = "(.+)"$/u)?.[1];

  if (exact) {
    return normalizeForFixture(row.stop_name) === normalizeForFixture(exact);
  }

  const search = where.match(/^search\(stop_name, "(.+)"\)$/u)?.[1];

  if (!search) {
    return false;
  }

  const stopName = normalizeForFixture(row.stop_name);
  const tokens = normalizeForFixture(search)
    .split(" ")
    .filter(Boolean);

  return tokens.every((token) => stopName.includes(token));
}

function normalizeForFixture(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[\u2019']/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
