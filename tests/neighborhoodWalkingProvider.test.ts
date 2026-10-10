import { afterEach, describe, expect, it, vi } from "vitest";
import { createNeighborhoodWalkingRoutesProvider } from "../src/services/neighborhoodWalkingRoutesProvider";
import { createStraightLineWalkingRoute } from "../src/features/nearby-stations/nearbyWalkingRoutes";

afterEach(() => vi.unstubAllGlobals());
const origin = { lon: 2.3, lat: 48.8 };
describe("verdict station walking matrices", () => {
  it("groups many station probes into ORS-only matrices and deduplicates coordinates", async () => {
    const fetcher = vi.fn(async (url, init) => {
      expect(String(url)).toContain("/api/walking/matrix");
      const body = JSON.parse(init.body); expect(body.routingPolicy).toBe("ors-only");
      expect(body.destinations.length).toBeLessThanOrEqual(64);
      return Response.json({ routes: body.destinations.map((p: { lon: number; lat: number; id: string }) => createStraightLineWalkingRoute(body.origin, p, p.id)) });
    });
    vi.stubGlobal("fetch", fetcher);
    const provider = createNeighborhoodWalkingRoutesProvider();
    const destinations = Array.from({ length: 80 }, (_, i) => ({ lon: 2.31 + i / 10000, lat: 48.8 }));
    const routes = await Promise.all([...destinations, destinations[0]!].map(destination => provider(origin, destination)));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(routes).toHaveLength(81); expect(routes[0]).toEqual(routes.at(-1));
    expect(routes.every(route => route?.fallback)).toBe(true);
  });
  it("cancels old resolution scopes without cancelling the new address", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      return Response.json({ routes: body.destinations.map((p: { lon: number; lat: number; id: string }) => createStraightLineWalkingRoute(body.origin, p, p.id)) });
    }));
    const provider = createNeighborhoodWalkingRoutesProvider(), oldScope = new AbortController();
    const old = provider(origin, { lon: 2.31, lat: 48.8 }, oldScope.signal);
    const current = provider({ ...origin, lon: 2.301 }, { lon: 2.31, lat: 48.8 });
    oldScope.abort(new Error("address changed"));
    await expect(old).rejects.toThrow("address changed");
    await expect(current).resolves.toMatchObject({ fallback: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
