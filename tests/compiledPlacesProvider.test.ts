import { describe, expect, it, vi } from "vitest";
import { createCompiledPlacesProvider } from "../src/services/places/compiledPlacesProvider";
import type { CompiledPlacesCityFile, CompiledPlacesManifest, PlacesRankingDocument } from "../src/services/places/compiledPlaces";

const city: CompiledPlacesCityFile = {
  schemaVersion: 1,
  datasetId: "osm-places-by-commune",
  generatedAt: "2026-09-14T00:00:00.000Z",
  scope: "idf",
  city: { code: "92019", name: "Châtenay-Malabry", departmentCode: "92", bbox: [2.2, 48.7, 2.3, 48.8], centroid: [2.25, 48.75] },
  places: [{ id: "node:1", name: "Boulangerie", lon: 2.25, lat: 48.75, category: "shop", kind: "bakery", rankingCategory: "commerce", cityCode: "92019", tags: { shop: "bakery" } }],
  categoryCounts: { "sports-leisure": 0, commerce: 1, security: 0, health: 0, culture: 0 },
  neighborhoodCommerceCounts: { "920190000": 1 },
};
const manifest: CompiledPlacesManifest = {
  schemaVersion: 1,
  datasetId: "osm-places-by-commune",
  generatedAt: "2026-09-14T00:00:00.000Z",
  scope: "idf",
  attribution: "© OpenStreetMap contributors",
  license: "ODbL",
  normalizationVersion: "osm-places-normalization-v1",
  source: { provider: "OpenStreetMap", overpassEndpoint: "docker", overpassImage: "wiktorn/overpass-api:0.7.62", boundaryUrl: "geo", boundarySha256: "test" },
  cities: [{ ...city.city, asset: "92019.json", bytes: 1, checksumSha256: "test", placeCount: 1, categoryCounts: city.categoryCounts, neighborhoodCommerceCount: 1 }],
  ranking: { asset: "places_ranking.json", scope: "idf", cityCount: 1, categories: ["sports-leisure", "commerce", "security", "health", "culture"] },
  unassigned: { asset: "unassigned.json", count: 0, bytes: 1, checksumSha256: "test" },
  totals: { cities: 1, places: 1, unassigned: 0, categoryCounts: city.categoryCounts },
};
const ranking: PlacesRankingDocument = {
  schemaVersion: 1,
  datasetId: "osm-places-by-commune",
  generatedAt: "2026-09-14T00:00:00.000Z",
  scope: "idf",
  categories: ["sports-leisure", "commerce", "security", "health", "culture"],
  cityCount: 1,
  cities: [{ code: "92019", name: "Châtenay-Malabry", departmentCode: "92", categories: {
    "sports-leisure": { count: 0, rank: 1, topPercent: 100, scorePercent: 100 },
    commerce: { count: 1, rank: 1, topPercent: 100, scorePercent: 100 },
    security: { count: 0, rank: 1, topPercent: 100, scorePercent: 100 },
    health: { count: 0, rank: 1, topPercent: 100, scorePercent: 100 },
    culture: { count: 0, rank: 1, topPercent: 100, scorePercent: 100 },
  } }],
};

describe("compiled places provider", () => {
  it("loads the manifest and only the selected commune JSON", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("manifest.json")) return new Response(JSON.stringify(manifest), { status: 200 });
      if (url.endsWith("92019.json")) return new Response(JSON.stringify(city), { status: 200 });
      throw new Error(`unexpected asset ${url}`);
    });
    const provider = createCompiledPlacesProvider({ fetcher, basePath: "/data/places" });

    await expect(provider.searchNearby({ origin: { lon: 2.25, lat: 48.75, city: "Chatenay-Malabry" }, radiusMeters: 600 })).resolves.toEqual([
      expect.objectContaining({ id: "node:1", distanceMeters: 0 }),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toBe("/data/places/92019.json");
    expect(fetcher).not.toHaveBeenCalledWith(expect.stringContaining("api/places/nearby"), expect.anything());
  });

  it("batches unique served communes and loads the ranking lazily", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("manifest.json")) return new Response(JSON.stringify(manifest), { status: 200 });
      if (url.endsWith("92019.json")) return new Response(JSON.stringify(city), { status: 200 });
      if (url.endsWith("places_ranking.json")) return new Response(JSON.stringify(ranking), { status: 200 });
      throw new Error(`unexpected asset ${url}`);
    });
    const provider = createCompiledPlacesProvider({ fetcher });
    await expect(provider.searchNearbyCities({
      cities: [{ name: "Chatenay-Malabry", lat: 48.75, lon: 2.25 }, { name: "Châtenay-Malabry" }],
      origins: [{ lon: 2.25, lat: 48.75 }],
      radiusMeters: 600,
    })).resolves.toHaveLength(1);
    await expect(provider.loadPlacesRanking()).resolves.toEqual(ranking);
    expect(fetcher.mock.calls.filter(([input]) => String(input).endsWith("92019.json"))).toHaveLength(1);
  });

  it("loads every suffixed city chunk and restores names kept in legacy tags", async () => {
    const firstChunk = city;
    const secondChunk: CompiledPlacesCityFile = {
      ...city,
      places: [{
        ...city.places[0]!,
        id: "node:2",
        name: undefined as unknown as string,
        tags: { shop: "bakery", name: "Ancienne boulangerie" },
      }],
    };
    const chunkManifest: CompiledPlacesManifest = {
      ...manifest,
      cities: [{
        ...manifest.cities[0]!,
        assets: ["92019.json", "92019-2.json"],
        assetMetadata: [
          { asset: "92019.json", bytes: 1, checksumSha256: "a".repeat(64), placeCount: 1 },
          { asset: "92019-2.json", bytes: 1, checksumSha256: "b".repeat(64), placeCount: 1 },
        ],
        placeCount: 2,
        categoryCounts: { ...city.categoryCounts, commerce: 2 },
      }],
      totals: { ...manifest.totals, places: 2, categoryCounts: { ...city.categoryCounts, commerce: 2 } },
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("manifest.json")) return new Response(JSON.stringify(chunkManifest), { status: 200 });
      if (url.endsWith("92019.json")) return new Response(JSON.stringify(firstChunk), { status: 200 });
      if (url.endsWith("92019-2.json")) return new Response(JSON.stringify(secondChunk), { status: 200 });
      throw new Error(`unexpected asset ${url}`);
    });
    const provider = createCompiledPlacesProvider({ fetcher });

    await expect(provider.searchNearby({ origin: { lon: 2.25, lat: 48.75, city: "Chatenay-Malabry" }, radiusMeters: 600 })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "node:1", name: "Boulangerie" }),
        expect.objectContaining({ id: "node:2", name: "Ancienne boulangerie" }),
      ]),
    );
    expect(fetcher.mock.calls.filter(([input]) => String(input).endsWith("92019.json"))).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([input]) => String(input).endsWith("92019-2.json"))).toHaveLength(1);
  });
});
