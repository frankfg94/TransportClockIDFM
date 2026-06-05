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

interface RerAExpectation {
  compatibleStopNames?: string[];
  expected: string[];
  station: string;
}

const RER_A_LINE_ID = "line:IDFM:C01742";

const RER_A_STATIONS = [
  "Achères Grand Cormier",
  "Achères Ville",
  "Auber",
  "Boissy-Saint-Léger",
  "Bry-sur-Marne",
  "Bussy-Saint-Georges",
  "Cergy le Haut",
  "Cergy Préfecture",
  "Cergy Saint-Christophe",
  "Châtelet - Les Halles",
  "Champigny",
  "Charles de Gaulle - Étoile",
  "Chatou - Croissy",
  "Conflans Fin d'Oise",
  "Fontenay-sous-Bois",
  "Gare de Lyon",
  "Houilles - Carrières-sur-Seine",
  "Joinville-le-Pont",
  "La Défense",
  "La Varenne - Chennevières",
  "Le Parc de Saint-Maur",
  "Le Vésinet - Centre",
  "Le Vésinet - Le Pecq",
  "Lognes",
  "Maisons-Laffitte",
  "Marne-la-Vallée Chessy",
  "Nanterre Préfecture",
  "Nanterre Université",
  "Nanterre Ville",
  "Nation",
  "Neuilly-Plaisance",
  "Neuville Université",
  "Nogent-sur-Marne",
  "Noisiel",
  "Noisy - Champs",
  "Noisy-le-Grand - Mont d'Est",
  "Poissy",
  "Rueil-Malmaison",
  "Saint-Germain-en-Laye",
  "Saint-Maur - Créteil",
  "Sartrouville",
  "Sucy - Bonneuil",
  "Torcy",
  "Val de Fontenay",
  "Val d'Europe",
  "Vincennes",
];

const RER_A_EXPECTATIONS: RerAExpectation[] = [
  { station: "Achères Grand Cormier", expected: [] },
  { station: "Achères Ville", expected: ["L"] },
  {
    station: "Auber",
    compatibleStopNames: [
      "Opéra",
      "Havre-Caumartin",
      "Haussmann Saint-Lazare",
      "Saint-Lazare",
    ],
    expected: ["3", "7", "8", "9", "12", "13", "14", "E", "J", "L"],
  },
  { station: "Boissy-Saint-Léger", expected: [] },
  { station: "Bry-sur-Marne", expected: [] },
  { station: "Bussy-Saint-Georges", expected: [] },
  { station: "Cergy le Haut", expected: ["L"] },
  { station: "Cergy Préfecture", expected: ["L"] },
  { station: "Cergy Saint-Christophe", expected: ["L"] },
  {
    station: "Châtelet - Les Halles",
    expected: ["1", "4", "7", "11", "14", "B", "D"],
  },
  { station: "Champigny", expected: [] },
  { station: "Charles de Gaulle - Étoile", expected: ["1", "2", "6"] },
  { station: "Chatou - Croissy", expected: [] },
  { station: "Conflans Fin d'Oise", expected: ["J", "L"] },
  { station: "Fontenay-sous-Bois", expected: [] },
  { station: "Gare de Lyon", expected: ["1", "14", "D", "R"] },
  { station: "Houilles - Carrières-sur-Seine", expected: ["J", "L"] },
  { station: "Joinville-le-Pont", expected: [] },
  {
    station: "La Défense",
    compatibleStopNames: ["La Défense (Grande Arche)"],
    expected: ["1", "E", "L", "U", "T2"],
  },
  { station: "La Varenne - Chennevières", expected: [] },
  { station: "Le Parc de Saint-Maur", expected: [] },
  { station: "Le Vésinet - Centre", expected: [] },
  { station: "Le Vésinet - Le Pecq", expected: [] },
  { station: "Lognes", expected: [] },
  { station: "Maisons-Laffitte", expected: ["J", "L"] },
  { station: "Marne-la-Vallée Chessy", expected: [] },
  {
    station: "Nanterre Préfecture",
    compatibleStopNames: ["Nanterre-La-Folie"],
    expected: ["E"],
  },
  { station: "Nanterre Université", expected: ["L"] },
  { station: "Nanterre Ville", expected: [] },
  { station: "Nation", expected: ["1", "2", "6", "9"] },
  { station: "Neuilly-Plaisance", expected: [] },
  { station: "Neuville Université", expected: ["L"] },
  { station: "Nogent-sur-Marne", expected: [] },
  { station: "Noisiel", expected: [] },
  { station: "Noisy - Champs", expected: [] },
  { station: "Noisy-le-Grand - Mont d'Est", expected: [] },
  { station: "Poissy", expected: ["J"] },
  { station: "Rueil-Malmaison", expected: [] },
  { station: "Saint-Germain-en-Laye", expected: ["T13"] },
  { station: "Saint-Maur - Créteil", expected: [] },
  { station: "Sartrouville", expected: ["J", "L"] },
  { station: "Sucy - Bonneuil", expected: [] },
  { station: "Torcy", expected: [] },
  { station: "Val de Fontenay", expected: ["E"] },
  { station: "Val d'Europe", expected: [] },
  {
    station: "Vincennes",
    compatibleStopNames: ["Château de Vincennes"],
    expected: ["1"],
  },
];

describe("RER A Open Data transfer matrix", () => {
  it.each(RER_A_EXPECTATIONS)(
    "$station includes the expected structural transfers",
    async ({ compatibleStopNames, expected, station }) => {
      const fetchMock = createArretsLignesFixtureFetch(createRerAFixtureRows());
      const transfers = await fetchStationTransfersFromArretsLignes(
        createStation(station),
        RER_A_LINE_ID,
        {
          compatibleStopNames,
          currentLineLabel: "RER A",
          fetcher: fetchMock as unknown as typeof fetch,
        },
      );
      const labels = transfers.map((transfer) => transfer.label);

      expect(labels).not.toContain("A");

      if (expected.length === 0) {
        expect(labels).toEqual([]);
      } else {
        expected.forEach((label) => expect(labels).toContain(label));
      }
    },
  );

  it("covers every RER A station in the regression matrix", () => {
    expect(RER_A_EXPECTATIONS.map((expectation) => expectation.station)).toEqual(
      RER_A_STATIONS,
    );
  });

  it("does not leak similarly named but unrelated stations into RER A transfers", async () => {
    const fetchMock = createArretsLignesFixtureFetch(createRerAFixtureRows());
    const transfers = await fetchStationTransfersFromArretsLignes(
      createStation("Maisons-Laffitte"),
      RER_A_LINE_ID,
      {
        currentLineLabel: "RER A",
        fetcher: fetchMock as unknown as typeof fetch,
      },
    );
    const labels = transfers.map((transfer) => transfer.label);

    expect(labels).toEqual(["J", "L"]);
    expect(labels).not.toContain("8");
    expect(labels).not.toContain("D");
  });
});

function createRerAFixtureRows(): ArretsLignesFixtureRow[] {
  return [
    ...RER_A_STATIONS.map((station) =>
      createFixtureRow("A", "RapidTransit", station, "IDFM:C01742"),
    ),
    ...createFixtureRows("Achères Ville", [["L", "LocalTrain"]]),
    ...createFixtureRows("Opéra", [
      ["3", "Metro"],
      ["7", "Metro"],
      ["8", "Metro"],
    ]),
    ...createFixtureRows("Havre-Caumartin", [
      ["3", "Metro"],
      ["9", "Metro"],
    ]),
    ...createFixtureRows("Haussmann Saint-Lazare", [["E", "RapidTransit"]]),
    ...createFixtureRows("Saint-Lazare", [
      ["3", "Metro"],
      ["9", "Metro"],
      ["12", "Metro"],
      ["13", "Metro"],
      ["14", "Metro"],
      ["J", "LocalTrain"],
      ["L", "LocalTrain"],
    ]),
    ...createFixtureRows("Cergy le Haut", [["L", "LocalTrain"]]),
    ...createFixtureRows("Cergy Préfecture", [["L", "LocalTrain"]]),
    ...createFixtureRows("Cergy Saint-Christophe", [["L", "LocalTrain"]]),
    ...createFixtureRows("Châtelet - Les Halles", [
      ["B", "RapidTransit"],
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
    ...createFixtureRows("Charles de Gaulle - Étoile", [
      ["1", "Metro"],
      ["2", "Metro"],
      ["6", "Metro"],
    ]),
    ...createFixtureRows("Conflans Fin d'Oise", [
      ["J", "LocalTrain"],
      ["L", "LocalTrain"],
    ]),
    ...createFixtureRows("Gare de Lyon", [
      ["1", "Metro"],
      ["14", "Metro"],
      ["D", "RapidTransit"],
      ["R", "LocalTrain"],
    ]),
    ...createFixtureRows("Houilles - Carrières-sur-Seine", [
      ["J", "LocalTrain"],
      ["L", "LocalTrain"],
    ]),
    ...createFixtureRows("La Défense", [
      ["E", "RapidTransit"],
      ["L", "LocalTrain"],
      ["U", "LocalTrain"],
    ]),
    ...createFixtureRows("La Défense (Grande Arche)", [
      ["1", "Metro"],
      ["T2", "Tramway"],
    ]),
    ...createFixtureRows("La Défense (Calder - Miro)", [["73", "Bus"]]),
    ...createFixtureRows("Maisons-Laffitte", [
      ["J", "LocalTrain"],
      ["L", "LocalTrain"],
    ]),
    ...createFixtureRows("Maisons-Alfort - Alfortville", [
      ["8", "Metro"],
      ["D", "RapidTransit"],
    ]),
    ...createFixtureRows("Nanterre-La-Folie", [["E", "RapidTransit"]]),
    ...createFixtureRows("Nanterre Université", [["L", "LocalTrain"]]),
    ...createFixtureRows("Nation", [
      ["1", "Metro"],
      ["2", "Metro"],
      ["6", "Metro"],
      ["9", "Metro"],
    ]),
    ...createFixtureRows("Neuville Université", [["L", "LocalTrain"]]),
    ...createFixtureRows("Poissy", [["J", "LocalTrain"]]),
    ...createFixtureRows("Saint-Germain-en-Laye", [["T13", "Tramway"]]),
    ...createFixtureRows("Sartrouville", [
      ["J", "LocalTrain"],
      ["L", "LocalTrain"],
    ]),
    ...createFixtureRows("Val de Fontenay", [["E", "RapidTransit"]]),
    ...createFixtureRows("Château de Vincennes", [["1", "Metro"]]),
    ...createFixtureRows("Porte de Vincennes", [["T3a", "Tramway"]]),
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
