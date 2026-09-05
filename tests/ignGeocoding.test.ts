import { afterEach, describe, expect, it, vi } from "vitest";
import {
  autocompleteIgnAddress,
  reverseIgnAddress,
  searchIgnAddress,
} from "../server/services/geocoding/ign";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IGN geocoding normalization", () => {
  it("normalizes completion results without leaking the provider payload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      results: [{
        x: 2.2671,
        y: 48.7652,
        fulltext: "16 avenue de la Division Leclerc, Châtenay-Malabry",
        city: "Châtenay-Malabry",
        zipcode: "92290",
        kind: "StreetAddress",
      }],
    }), { status: 200 })));

    await expect(autocompleteIgnAddress("16 avenue de la Division Leclerc")).resolves.toEqual([
      expect.objectContaining({
        lon: 2.2671,
        lat: 48.7652,
        city: "Châtenay-Malabry",
        postcode: "92290",
        provider: "ign-geoplateforme",
        type: "address",
      }),
    ]);
  });

  it("normalizes GeoJSON for forward and reverse searches", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      features: [{
        geometry: { coordinates: [2.3522, 48.8566] },
        properties: { id: "address:1", label: "Paris", city: "Paris", postcode: "75001", type: "municipality" },
      }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect((await searchIgnAddress("Paris"))[0]).toMatchObject({ id: "address:1", lon: 2.3522, lat: 48.8566 });
    expect((await reverseIgnAddress(2.3522, 48.8566))[0]).toMatchObject({ label: "Paris", type: "municipality" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps rate limits distinguishable from provider failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429, statusText: "Too Many Requests" })));
    await expect(searchIgnAddress("Paris centre")).rejects.toMatchObject({ statusCode: 429 });
  });
});
