import { describe, expect, it, vi } from "vitest";
import { createCurrentPlacesProvider } from "../src/services/places/currentPlacesProvider";
import type { PlacesProvider } from "../src/features/nearby-stations/nearbyPlaces";

const compiledPlace = {
  id: "node:compiled",
  name: "Commerce compilé",
  lon: 2.3,
  lat: 48.81,
  category: "shop" as const,
  kind: "supermarket",
  distanceMeters: 120,
};

function compiledProvider(overrides: Partial<PlacesProvider> = {}): PlacesProvider {
  return {
    searchDestinations: vi.fn(async () => []),
    searchNearby: vi.fn(async () => [compiledPlace]),
    ...overrides,
  };
}

describe("current places provider", () => {
  it("keeps the compiled city dataset authoritative without calling the API", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = createCurrentPlacesProvider({
      fetcher,
      compiledProvider: compiledProvider(),
    });

    await expect(provider.searchNearby({
      origin: { lon: 2.3, lat: 48.81, city: "Fixture" },
      radiusMeters: 600,
    })).resolves.toEqual([compiledPlace]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses the legacy endpoint only after a compiled lookup fails", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ places: [{
      ...compiledPlace,
      id: "node:fallback",
    }] }), { status: 200 }));
    const provider = createCurrentPlacesProvider({
      fetcher,
      compiledProvider: compiledProvider({
        searchNearby: vi.fn(async () => { throw new Error("missing-city-file"); }),
      }),
    });

    await expect(provider.searchNearby({
      origin: { lon: 2.3, lat: 48.81, city: "Fixture" },
      radiusMeters: 600,
    })).resolves.toMatchObject([{ id: "node:fallback" }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("/api/places/nearby?");
  });
});
