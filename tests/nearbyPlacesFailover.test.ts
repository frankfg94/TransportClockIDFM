import { afterEach, describe, expect, it, vi } from "vitest";
import { loadNearbyPlaces } from "../server/services/places/overpass";

afterEach(() => vi.unstubAllGlobals());

describe("Overpass availability", () => {
  it("uses a second instance after HTTP 521 and caches its real places", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("down", { status: 521 }))
      .mockResolvedValueOnce(Response.json({ elements: [{ type: "node", id: 1, lat: 48.8, lon: 2.28, tags: { name: "Test shop", shop: "supermarket" } }] }));
    vi.stubGlobal("fetch", fetcher);
    const places = await loadNearbyPlaces(48.8, 2.28, 600);
    expect(places[0]?.name).toBe("Test shop");
    expect(fetcher.mock.calls[1]?.[0]).toBe("https://overpass.private.coffee/api/interpreter");
    expect(await loadNearbyPlaces(48.8, 2.28, 600)).toEqual(places);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not cache an Overpass runtime error as an empty neighborhood", async () => {
    const fetcher = vi.fn(async () => Response.json({ remark: "runtime error: Query timed out", elements: [] }));
    vi.stubGlobal("fetch", fetcher);
    await expect(loadNearbyPlaces(48.81, 2.29, 600)).rejects.toThrow("incomplete results");
    fetcher.mockImplementation(async () => Response.json({ elements: [] }));
    await expect(loadNearbyPlaces(48.81, 2.29, 600)).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
