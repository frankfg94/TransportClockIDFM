import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ARRETS_LIGNES_PROXY_RECORDS_URL,
  ARRETS_LIGNES_RECORDS_URL,
  ARRETS_LIGNES_SELECT_FIELDS,
  createArretsLignesWhereClauses,
  fetchStationTransfersFromArretsLignes,
  normalizeArretsLignesTransfers,
  resolveArretsLignesRecordsUrl,
} from "../src/services/idfmOpenDataTransfers";
import { fetchStationTransfers } from "../src/services/idfm";
import type { StationSearchOption } from "../src/types/transit";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IDFM arrets-lignes transfers", () => {
  it("uses the current IDFM Open Data host", () => {
    expect(ARRETS_LIGNES_RECORDS_URL).toBe(
      "https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/arrets-lignes/records",
    );
  });

  it("uses the same-origin proxy in the browser to avoid CORS failures", () => {
    vi.stubGlobal("window", { document: {} });
    vi.stubGlobal("document", {});

    expect(resolveArretsLignesRecordsUrl()).toBe(ARRETS_LIGNES_PROXY_RECORDS_URL);
  });

  it("keeps explicit API bases untouched", () => {
    expect(resolveArretsLignesRecordsUrl("https://example.test/records")).toBe(
      "https://example.test/records",
    );
  });

  it("keeps transfers attached to the exact station name instead of a nearby hub", () => {
    const transfers = normalizeArretsLignesTransfers(
      [
        {
          route_id: "line:IDFM:C01373",
          route_short_name: "3",
          route_long_name: "Metro 3",
          route_type: 1,
          stop_name: "Saint-Lazare",
          stop_id: "IDFM:stop:saint-lazare",
        },
        {
          route_id: "line:IDFM:C01383",
          route_short_name: "13",
          route_long_name: "Metro 13",
          route_type: 1,
          stop_name: "Li\u00e8ge",
          stop_id: "IDFM:stop:liege",
        },
      ],
      "Li\u00e8ge",
      new Set(["id:line:IDFM:C01383"]),
    );

    expect(transfers).toEqual([]);
  });

  it("infers rail families from route metadata without line-name tables", () => {
    const transfers = normalizeArretsLignesTransfers(
      [
        {
          route_id: "line:IDFM:C01743",
          route_short_name: "B",
          route_long_name: "RER B",
          route_type: 2,
          stop_name: "Ch\u00e2telet - Les Halles",
        },
        {
          route_id: "line:IDFM:C01739",
          route_short_name: "J",
          route_long_name: "Train J",
          route_type: 2,
          stop_name: "Ch\u00e2telet - Les Halles",
        },
      ],
      "Chatelet - Les Halles",
    );

    expect(transfers.map((transfer) => [transfer.label, transfer.family])).toEqual([
      ["B", "RER"],
      ["J", "TRANSILIEN"],
    ]);
  });

  it("deduplicates unresolved TER rows before Navitia presentation enrichment", () => {
    const transfers = normalizeArretsLignesTransfers(
      [
        {
          id: "IDFM:C09998",
          shortname: "TER",
          route_long_name: "TER",
          mode: "LocalTrain",
          stop_name: "Gare Saint-Lazare",
        },
        {
          id: "IDFM:C09999",
          shortname: "TER",
          route_long_name: "TER",
          mode: "LocalTrain",
          stop_name: "Gare Saint-Lazare",
        },
      ],
      "Gare Saint-Lazare",
    );

    expect(transfers.map((transfer) => transfer.label)).toEqual(["TER"]);
  });

  it("supports the current data.iledefrance.fr arrets-lignes schema", () => {
    const transfers = normalizeArretsLignesTransfers(
      [
        {
          id: "IDFM:C01742",
          shortname: "A",
          route_long_name: "A",
          mode: "RapidTransit",
          stop_name: "Nanterre Pr\u00e9fecture",
          stop_id: "IDFM:monomodalStopPlace:43169",
        },
        {
          id: "IDFM:C02745",
          shortname: "363",
          route_long_name: "363",
          mode: "Bus",
          stop_name: "Nanterre - Pr\u00e9fecture RER",
          stop_id: "IDFM:413111",
        },
      ],
      "Nanterre Pr\u00e9fecture",
      new Set(["id:line:IDFM:C01742"]),
    );

    expect(transfers.map((transfer) => [transfer.label, transfer.family])).toEqual([
      ["363", "BUS"],
    ]);
  });

  it("fetches the dataset and removes the current line by route id", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: "IDFM:C01383",
              shortname: "13",
              route_long_name: "13",
              mode: "Metro",
              stop_name: "Porte de Vanves",
            },
            {
              id: "IDFM:C02532",
              shortname: "T3a",
              route_long_name: "T3a",
              mode: "Tram",
              stop_name: "Porte de Vanves",
            },
          ],
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      ),
    );
    const station: StationSearchOption = {
      id: "stop_area:IDFM:example",
      label: "Porte de Vanves",
      monitoringRef: "",
      scheduleStopAreaRef: "stop_area:IDFM:example",
    };

    const transfers = await fetchStationTransfersFromArretsLignes(
      station,
      "line:IDFM:C01383",
      { fetcher: fetchMock as unknown as typeof fetch },
    );

    const requestedUrl = fetchMock.mock.calls[0]?.[0]?.toString() ?? "";

    expect(requestedUrl).toContain("data.iledefrance.fr");
    expect(requestedUrl).toContain("arrets-lignes");
    expect(requestedUrl).toContain(encodeURIComponent(ARRETS_LIGNES_SELECT_FIELDS));
    expect(new URL(requestedUrl).searchParams.get("where")).toBe(
      'stop_name = "Porte de Vanves"',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(transfers.map((transfer) => transfer.label)).toEqual(["T3a"]);
  });

  it("tries the exact stop name before the punctuation-safe search fallback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "IDFM:C01742",
                shortname: "A",
                mode: "RapidTransit",
                stop_name: "Bry-sur-Marne",
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      );

    const transfers = await fetchStationTransfersFromArretsLignes(
      {
        id: "stop_area:IDFM:bry",
        label: "Bry-sur-Marne",
        monitoringRef: "",
        scheduleStopAreaRef: "stop_area:IDFM:bry",
      },
      undefined,
      { fetcher: fetchMock as unknown as typeof fetch },
    );

    const exactUrl = fetchMock.mock.calls[0]?.[0]?.toString() ?? "";
    const fallbackUrl = fetchMock.mock.calls[1]?.[0]?.toString() ?? "";

    expect(new URL(exactUrl).searchParams.get("where")).toBe(
      'stop_name = "Bry-sur-Marne"',
    );
    expect(new URL(fallbackUrl).searchParams.get("where")).toBe(
      'search(stop_name, "Bry sur Marne")',
    );
    expect(transfers.map((transfer) => transfer.label)).toEqual(["A"]);
  });

  it("merges exact component stop names for compound station hubs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "IDFM:C01742",
                shortname: "A",
                mode: "RapidTransit",
                stop_name: "Ch\u00e2telet - Les Halles",
              },
              {
                id: "IDFM:C01743",
                shortname: "B",
                mode: "RapidTransit",
                stop_name: "Ch\u00e2telet - Les Halles",
              },
              {
                id: "IDFM:C01728",
                shortname: "D",
                mode: "RapidTransit",
                stop_name: "Ch\u00e2telet - Les Halles",
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "IDFM:C01371",
                shortname: "1",
                mode: "Metro",
                stop_name: "Ch\u00e2telet",
              },
              {
                id: "IDFM:C01384",
                shortname: "14",
                mode: "Metro",
                stop_name: "Ch\u00e2telet",
              },
              {
                id: "IDFM:C02032",
                shortname: "3547",
                mode: "Bus",
                stop_name: "Petit Ch\u00e2telet",
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "IDFM:C01371",
                shortname: "1",
                mode: "Metro",
                stop_name: "Ch\u00e2telet",
              },
              {
                id: "IDFM:C01384",
                shortname: "14",
                mode: "Metro",
                stop_name: "Ch\u00e2telet",
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "IDFM:C01374",
                shortname: "4",
                mode: "Metro",
                stop_name: "Les Halles",
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "IDFM:C01374",
                shortname: "4",
                mode: "Metro",
                stop_name: "Les Halles",
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      );

    const transfers = await fetchStationTransfersFromArretsLignes(
      {
        id: "stop_area:IDFM:chatelet-les-halles",
        label: "Ch\u00e2telet - Les Halles",
        monitoringRef: "",
        scheduleStopAreaRef: "stop_area:IDFM:chatelet-les-halles",
      },
      "line:IDFM:C01742",
      { fetcher: fetchMock as unknown as typeof fetch },
    );

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(transfers.map((transfer) => transfer.label)).toEqual([
      "1",
      "4",
      "14",
      "B",
      "D",
    ]);
  });

  it("uses coherent alias search for single-token hubs without accepting weak neighbours", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "IDFM:C01742",
                shortname: "A",
                mode: "RapidTransit",
                stop_name: "Vincennes",
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "IDFM:C01371",
                shortname: "1",
                mode: "Metro",
                stop_name: "Ch\u00e2teau de Vincennes",
              },
              {
                id: "IDFM:C01153",
                shortname: "124",
                mode: "Bus",
                stop_name: "Vincennes RER",
              },
              {
                id: "IDFM:C01391",
                shortname: "T3a",
                mode: "Tramway",
                stop_name: "Porte de Vincennes",
              },
              {
                id: "IDFM:C01147",
                shortname: "118",
                mode: "Bus",
                stop_name: "Mairie de Vincennes",
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      );

    const transfers = await fetchStationTransfersFromArretsLignes(
      {
        id: "stop_area:IDFM:vincennes",
        label: "Vincennes",
        monitoringRef: "",
        scheduleStopAreaRef: "stop_area:IDFM:vincennes",
      },
      "line:IDFM:C01742",
      { fetcher: fetchMock as unknown as typeof fetch },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(transfers.map((transfer) => transfer.label)).toEqual(["1", "124"]);
  });

  it("expands La Defense to the Grande Arche interchange without importing weak bus stops", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "IDFM:C01742",
                shortname: "A",
                mode: "RapidTransit",
                stop_name: "La D\u00e9fense",
              },
              {
                id: "IDFM:C01729",
                shortname: "E",
                mode: "RapidTransit",
                stop_name: "La D\u00e9fense",
              },
              {
                id: "IDFM:C01740",
                shortname: "L",
                mode: "LocalTrain",
                stop_name: "La D\u00e9fense",
              },
              {
                id: "IDFM:C01741",
                shortname: "U",
                mode: "LocalTrain",
                stop_name: "La D\u00e9fense",
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "IDFM:C01371",
                shortname: "1",
                mode: "Metro",
                stop_name: "La D\u00e9fense (Grande Arche)",
              },
              {
                id: "IDFM:C01390",
                shortname: "T2",
                mode: "Tramway",
                stop_name: "La D\u00e9fense (Grande Arche)",
              },
              {
                id: "IDFM:C01108",
                shortname: "73",
                mode: "Bus",
                stop_name: "La D\u00e9fense (Calder - Miro)",
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      );

    const transfers = await fetchStationTransfersFromArretsLignes(
      {
        id: "FR::monomodalStopPlace:470549:FR1",
        label: "La D\u00e9fense",
        monitoringRef: "",
        scheduleStopAreaRef: "FR::monomodalStopPlace:470549:FR1",
      },
      "line:IDFM:C01742",
      {
        compatibleStopNames: ["La D\u00e9fense (Grande Arche)"],
        fetcher: fetchMock as unknown as typeof fetch,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(transfers.map((transfer) => transfer.label)).toEqual([
      "1",
      "E",
      "L",
      "U",
      "T2",
    ]);
    expect(transfers.map((transfer) => transfer.label)).not.toContain("73");
  });

  it("uses official compatible stop names for Nanterre Prefecture without merging sibling RER A stations", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "IDFM:C01742",
                shortname: "A",
                mode: "RapidTransit",
                stop_name: "Nanterre Pr\u00e9fecture",
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "IDFM:C01729",
                shortname: "E",
                mode: "RapidTransit",
                stop_name: "Nanterre-La-Folie",
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "IDFM:C02000",
                shortname: "259",
                mode: "Bus",
                stop_name: "Nanterre - Pr\u00e9fecture RER",
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      );

    const transfers = await fetchStationTransfersFromArretsLignes(
      {
        id: "FR::monomodalStopPlace:43169:FR1",
        label: "Nanterre Pr\u00e9fecture",
        monitoringRef: "",
        scheduleStopAreaRef: "FR::monomodalStopPlace:43169:FR1",
      },
      "line:IDFM:C01742",
      {
        compatibleStopNames: [
          "Nanterre-La-Folie",
          "Nanterre - Pr\u00e9fecture RER",
        ],
        fetcher: fetchMock as unknown as typeof fetch,
      },
    );

    expect(transfers.map((transfer) => transfer.label)).toEqual(["E"]);
    expect(transfers.map((transfer) => transfer.label)).not.toContain("L");
    expect(transfers.map((transfer) => transfer.label)).not.toContain("259");
  });

  it("expands official compatible hub names with safe display-name variants", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString(), "http://localhost");
      const where = url.searchParams.get("where") ?? "";

      if (where.includes('"Auber"')) {
        return createArretsLignesResponse([
          {
            id: "IDFM:C01742",
            shortname: "A",
            mode: "RapidTransit",
            stop_name: "Auber",
          },
        ]);
      }

      if (
        where.includes('"Gare Saint-Lazare"') ||
        where.includes('"Gare Saint Lazare"')
      ) {
        return createArretsLignesResponse([
          {
            id: "IDFM:C01739",
            shortname: "J",
            mode: "LocalTrain",
            stop_name: "Gare Saint-Lazare",
          },
          {
            id: "IDFM:C01740",
            shortname: "L",
            mode: "LocalTrain",
            stop_name: "Gare Saint-Lazare",
          },
        ]);
      }

      if (
        where.includes('"Saint-Lazare"') ||
        where.includes('"Saint Lazare"')
      ) {
        return createArretsLignesResponse([
          {
            id: "IDFM:C01382",
            shortname: "12",
            mode: "Metro",
            stop_name: "Saint-Lazare",
          },
          {
            id: "IDFM:C01383",
            shortname: "13",
            mode: "Metro",
            stop_name: "Saint-Lazare",
          },
          {
            id: "IDFM:C01384",
            shortname: "14",
            mode: "Metro",
            stop_name: "Saint-Lazare",
          },
        ]);
      }

      if (
        where.includes('"Havre-Caumartin"') ||
        where.includes('"Havre Caumartin"')
      ) {
        return createArretsLignesResponse([
          {
            id: "IDFM:C01373",
            shortname: "3",
            mode: "Metro",
            stop_name: "Havre-Caumartin",
          },
          {
            id: "IDFM:C01379",
            shortname: "9",
            mode: "Metro",
            stop_name: "Havre-Caumartin",
          },
        ]);
      }

      if (
        where.includes('"Haussmann Saint-Lazare"') ||
        where.includes('"Haussmann Saint Lazare"')
      ) {
        return createArretsLignesResponse([
          {
            id: "IDFM:C01729",
            shortname: "E",
            mode: "RapidTransit",
            stop_name: "Haussmann Saint-Lazare",
          },
        ]);
      }

      return createArretsLignesResponse([]);
    });

    const transfers = await fetchStationTransfersFromArretsLignes(
      {
        id: "FR::monomodalStopPlace:45873:FR1",
        label: "Auber",
        monitoringRef: "",
        scheduleStopAreaRef: "FR::monomodalStopPlace:45873:FR1",
      },
      "line:IDFM:C01742",
      {
        compatibleStopNames: [
          "Gare Saint-Lazare",
          "Havre - Caumartin",
          "Haussmann Saint-Lazare",
        ],
        currentLineLabel: "RER A",
        fetcher: fetchMock as unknown as typeof fetch,
      },
    );
    const labels = transfers.map((transfer) => transfer.label);

    ["3", "9", "12", "13", "14", "E", "J", "L"].forEach((label) =>
      expect(labels).toContain(label),
    );
    expect(labels).not.toContain("A");
  });

  it("derives safe Open Data variants from official compound connection names", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const where =
        new URL(input.toString(), "http://localhost").searchParams.get("where") ??
        "";

      if (
        where.includes('"Gare Saint-Lazare"') ||
        where.includes('"Saint-Lazare"')
      ) {
        return createArretsLignesResponse([
          {
            id: "IDFM:C01739",
            shortname: "J",
            mode: "LocalTrain",
            stop_name: "Gare Saint-Lazare",
          },
          {
            id: "IDFM:C01384",
            shortname: "14",
            mode: "Metro",
            stop_name: "Saint-Lazare",
          },
        ]);
      }

      return createArretsLignesResponse([]);
    });

    const transfers = await fetchStationTransfersFromArretsLignes(
      {
        id: "FR::monomodalStopPlace:auber:FR1",
        label: "Auber",
        monitoringRef: "",
        scheduleStopAreaRef: "FR::monomodalStopPlace:auber:FR1",
      },
      "line:IDFM:C01742",
      {
        compatibleStopNames: ["Gare Saint-Lazare - Havre"],
        currentLineLabel: "RER A",
        fetcher: fetchMock as unknown as typeof fetch,
      },
    );

    expect(transfers.map((transfer) => transfer.label)).toEqual(["14", "J"]);
  });

  it("does not turn generic Gare de names into city-only compatible queries", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const where = new URL(input.toString(), "http://localhost").searchParams.get(
        "where",
      ) ?? "";

      if (where === 'stop_name = "Lyon"' || where === 'search(stop_name, "Lyon")') {
        return createArretsLignesResponse([
          {
            id: "IDFM:C99999",
            shortname: "X",
            mode: "Metro",
            stop_name: "Lyon",
          },
        ]);
      }

      return createArretsLignesResponse([]);
    });

    const transfers = await fetchStationTransfersFromArretsLignes(
      {
        id: "FR::monomodalStopPlace:test:FR1",
        label: "Auber",
        monitoringRef: "",
        scheduleStopAreaRef: "FR::monomodalStopPlace:test:FR1",
      },
      "line:IDFM:C01742",
      {
        compatibleStopNames: ["Gare de Lyon"],
        currentLineLabel: "RER A",
        fetcher: fetchMock as unknown as typeof fetch,
      },
    );
    const calledWheres = fetchMock.mock.calls.map((call) =>
      new URL(call[0].toString(), "http://localhost").searchParams.get("where"),
    );

    expect(calledWheres).not.toContain('stop_name = "Lyon"');
    expect(calledWheres).not.toContain('search(stop_name, "Lyon")');
    expect(transfers).toEqual([]);
  });

  it("does not merge Maisons-Laffitte with Maisons-Alfort while using exact stop names", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "IDFM:C01742",
                shortname: "A",
                mode: "RapidTransit",
                stop_name: "Maisons-Laffitte",
              },
              {
                id: "IDFM:C01739",
                shortname: "J",
                mode: "LocalTrain",
                stop_name: "Maisons-Laffitte",
              },
              {
                id: "IDFM:C01740",
                shortname: "L",
                mode: "LocalTrain",
                stop_name: "Maisons-Laffitte",
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      );

    const transfers = await fetchStationTransfersFromArretsLignes(
      {
        id: "FR::monomodalStopPlace:43830:FR1",
        label: "Maisons-Laffitte",
        monitoringRef: "",
        scheduleStopAreaRef: "FR::monomodalStopPlace:43830:FR1",
      },
      "line:IDFM:C01742",
      { fetcher: fetchMock as unknown as typeof fetch },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(transfers.map((transfer) => transfer.label)).toEqual(["J", "L"]);
    expect(transfers.map((transfer) => transfer.label)).not.toContain("8");
    expect(transfers.map((transfer) => transfer.label)).not.toContain("D");
  });

  it("passes official compatible stop names through the per-station resolver", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "IDFM:C01742",
                shortname: "A",
                mode: "RapidTransit",
                stop_name: "Vincennes",
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "IDFM:C01371",
                shortname: "1",
                mode: "Metro",
                stop_name: "Ch\u00e2teau de Vincennes",
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      );

    const transfers = await fetchStationTransfers(
      {
        id: "FR::monomodalStopPlace:478044:FR1",
        label: "Vincennes",
        monitoringRef: "",
        scheduleStopAreaRef: "FR::monomodalStopPlace:478044:FR1",
      },
      "line:IDFM:C01742",
      {
        compatibleStopNames: ["Ch\u00e2teau de Vincennes"],
        currentLineLabel: "RER A",
        fetcher: fetchMock as unknown as typeof fetch,
        transferScope: "per_station",
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(transfers.map((transfer) => transfer.label)).toEqual(["1"]);
  });

  it("builds stable exact and fallback queries for punctuation-heavy station names", () => {
    expect(createArretsLignesWhereClauses("Bry-sur-Marne")).toEqual([
      'stop_name = "Bry-sur-Marne"',
      'search(stop_name, "Bry sur Marne")',
    ]);
    expect(createArretsLignesWhereClauses("Nanterre Pr\u00e9fecture")).toEqual([
      'stop_name = "Nanterre Pr\u00e9fecture"',
      'search(stop_name, "Nanterre Pr\u00e9fecture")',
    ]);
  });

  it("does not keep retrying forever when exact and fallback both return no transfers", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ results: [] }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );

    await fetchStationTransfersFromArretsLignes(
      {
        id: "stop_area:IDFM:bry",
        label: "Bry-sur-Marne",
        monitoringRef: "",
        scheduleStopAreaRef: "stop_area:IDFM:bry",
      },
      undefined,
      { fetcher: fetchMock as unknown as typeof fetch },
    );

    const exactUrl = fetchMock.mock.calls[0]?.[0]?.toString() ?? "";
    const fallbackUrl = fetchMock.mock.calls[1]?.[0]?.toString() ?? "";

    expect(new URL(exactUrl).searchParams.get("where")).toBe(
      'stop_name = "Bry-sur-Marne"',
    );
    expect(new URL(fallbackUrl).searchParams.get("where")).toBe(
      'search(stop_name, "Bry sur Marne")',
    );
  });
});

function createArretsLignesResponse(results: unknown[]): Response {
  return new Response(JSON.stringify({ results }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
