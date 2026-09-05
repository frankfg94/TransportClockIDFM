import { describe, expect, it, vi } from "vitest";
import { fetchNavitiaJourneys, searchNavitiaDestinationPoints } from "../src/services/idfm";

describe("Navitia nearby journeys adapter", () => {
  it("uses the same-origin journeys endpoint and normalizes sections", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      expect(url.pathname).toContain("/api/idfm/v2/navitia/journeys");
      expect(url.searchParams.get("count")).toBe("16");
      expect(url.searchParams.get("from")).toBe("2.3;48.8");
      expect(url.searchParams.get("to")).toBe("2.31;48.81");
      return new Response(JSON.stringify({
        journeys: [{
          duration: 1_200,
          sections: [
            {
              type: "street_network",
              mode: "walking",
              duration: 600,
              length: 800,
              departure_date_time: "20260821T080000",
              arrival_date_time: "20260821T081000",
              from: { name: "Origine", address: { coord: { lon: "2.3", lat: "48.8" } } },
              to: { name: "Parc André Malraux", stop_point: { coord: { lon: "2.301", lat: "48.801" } } },
            },
            {
              type: "public_transport",
              mode: "tram",
              duration: 600,
              departure_date_time: "20260821T081000",
              arrival_date_time: "20260821T082000",
              display_informations: {
                line: {
                  id: "line:IDFM:T10",
                  code: "T10",
                  commercial_mode: { name: "Tramway" },
                },
              },
              from: { name: "Parc André Malraux" },
              to: { name: "La Ferme" },
              stop_date_times: [
                { stop_point: { name: "Parc André Malraux" } },
                { stop_point: { name: "Centre de Châtillon" } },
                { stop_point: { name: "La Ferme" } },
              ],
            },
          ],
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const journeys = await fetchNavitiaJourneys({
      origin: { lon: 2.3, lat: 48.8 },
      destination: { lon: 2.31, lat: 48.81 },
    }, { fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(journeys[0]).toMatchObject({ durationSeconds: 1_200 });
    expect(journeys[0]?.sections[1]).toMatchObject({
      lineId: "line:IDFM:T10",
      lineCode: "T10",
      lineMode: "TRAM",
      departureDateTime: "20260821T081000",
      arrivalDateTime: "20260821T082000",
      stopNames: ["Parc André Malraux", "Centre de Châtillon", "La Ferme"],
    });
    expect(journeys[0]?.sections[0]).toMatchObject({
      fromPoint: { lon: 2.3, lat: 48.8 },
      toPoint: { lon: 2.301, lat: 48.801 },
    });
  });

  it("preserves the line identity from section links with flat display information", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      journeys: [{ duration: 900, sections: [{
        type: "public_transport",
        duration: 900,
        display_informations: { code: "X", commercial_mode: "Train" },
        links: [{ type: "vehicle_journey", id: "vehicle:example" }, { type: "line", id: "line:example" }],
      }] }],
    }), { status: 200 }));

    const journeys = await fetchNavitiaJourneys({
      origin: { lon: 2.3, lat: 48.8 },
      destination: { lon: 2.31, lat: 48.81 },
    }, { fetcher });

    expect(journeys[0]?.sections[0]).toMatchObject({ lineId: "line:example", lineCode: "X", lineMode: "TRANSILIEN" });
  });

  it("routes a stop-area destination by reference instead of its map centroid", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      expect(url.searchParams.get("to")).toBe("stop_area:IDFM:71139");
      return new Response(JSON.stringify({ journeys: [] }), { status: 200 });
    });

    await fetchNavitiaJourneys({
      origin: { lon: 2.3, lat: 48.8 },
      destination: { id: "station:FR::monomodalStopPlace:43238:FR1", lon: 2.316, lat: 48.838 },
      destinationRef: "stop_area:IDFM:71139",
    }, { fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("uses a searched Navitia stop-area id when no explicit destination ref is supplied", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      expect(url.searchParams.get("to")).toBe("stop_area:IDFM:71139");
      return new Response(JSON.stringify({ journeys: [] }), { status: 200 });
    });

    await fetchNavitiaJourneys({
      origin: { lon: 2.3, lat: 48.8 },
      destination: { id: "stop_area:IDFM:71139", lon: 2.319, lat: 48.841 },
    }, { fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("recognizes a Noctilien line even when Navitia reports a bus physical mode", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      journeys: [{
        duration: 900,
        sections: [{
          type: "public_transport",
          mode: "bus",
          duration: 900,
          display_informations: {
            line: {
              id: "line:IDFM:C01414",
              code: "N14",
              physical_mode: { name: "Bus" },
            },
          },
        }],
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const journeys = await fetchNavitiaJourneys({
      origin: { lon: 2.3, lat: 48.8 },
      destination: { lon: 2.31, lat: 48.81 },
    }, { fetcher });

    expect(journeys[0]?.sections[0]).toMatchObject({ lineCode: "N14", lineMode: "NOCTILIEN" });
  });

  it("turns Navitia stop areas into WGS84 station destinations", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      expect(url.pathname).toContain("/api/idfm/v2/navitia/places");
      expect(url.searchParams.get("q")).toBe("Châtelet les Halles");
      return new Response(JSON.stringify({
        places: [{
          id: "stop_area:474151",
          embedded_type: "stop_area",
          stop_area: {
            id: "stop_area:474151",
            name: "Châtelet - Les Halles (Paris)",
            coord: { lon: "2.3469765", lat: "48.861745" },
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    await expect(searchNavitiaDestinationPoints("Châtelet les Halles", {
      includeStations: true,
      includePlaces: false,
    }, { fetcher })).resolves.toEqual([expect.objectContaining({
      id: "stop_area:474151",
      label: "Châtelet - Les Halles (Paris)",
      lon: 2.3469765,
      lat: 48.861745,
      type: "station",
    })]);
  });

  it("keeps a Navitia POI type and broad category on place destinations", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      expect(url.searchParams.getAll("type[]")).toEqual(["poi"]);
      return new Response(JSON.stringify({
        places: [{
          id: "poi:fnac:ivry",
          embedded_type: "poi",
          poi: {
            id: "poi:fnac:ivry",
            name: "CFA Technique Fnac Darty",
            coord: { lon: "2.385", lat: "48.815" },
            poi_type: { id: "poi_type:shop:books", name: "Books" },
            administrative_regions: [{ name: "Ivry-sur-Seine" }],
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    await expect(searchNavitiaDestinationPoints("fnac", {
      includeStations: false,
      includePlaces: true,
      count: 8,
    }, { fetcher })).resolves.toEqual([expect.objectContaining({
      id: "poi:fnac:ivry",
      label: "CFA Technique Fnac Darty",
      city: "Ivry-sur-Seine",
      lon: 2.385,
      lat: 48.815,
      type: "place",
      kind: "books",
      category: "shop",
    })]);
  });
});
