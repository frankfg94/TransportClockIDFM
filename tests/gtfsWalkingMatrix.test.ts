import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
const origin = { lon: 2.35, lat: 48.85 };
const destination = { id: "one", lon: 2.36, lat: 48.86 };
const event = (env: Record<string, string>) => ({ context: { cloudflare: { env } } }) as unknown as H3Event;
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
const walkingResponse = (url: unknown) => {
  const query = new URL(String(url)).searchParams;
  const from = query.get("from")!.split(";").map(Number), to = query.get("to")!.split(";").map(Number);
  return Response.json({ journeys: [{ duration: 840, sections: [{ type: "street_network", mode: "walking", length: 1000, duration: 840, geojson: { coordinates: [from, to] } }] }] });
};
describe("GTFS pedestrian matrix", () => {
  it("keeps one ORS batch when the street matrix succeeds", async () => {
    const fetcher = vi.fn(async () => Response.json({ durations: [[600]], distances: [[800]] }));
    vi.stubGlobal("fetch", fetcher);
    const { matrixWalkingForGtfs } = await import("../server/services/walking/openRouteService");
    const routes = await matrixWalkingForGtfs(event({ NUXT_ORS_API_KEY: "fixture", NUXT_IDFM_API_KEY: "fixture" }), origin, [destination]);
    expect(routes[0]).toMatchObject({ provider: "openrouteservice", durationSeconds: 600 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("deduplicates fallback coordinates and concurrent subscribers, preserves ids and caches the street result", async () => {
    const fetcher = vi.fn(async url => walkingResponse(url));
    vi.stubGlobal("fetch", fetcher);
    const { matrixWalkingForGtfs } = await import("../server/services/walking/openRouteService");
    const env = event({ NUXT_ORS_API_KEY: "", NUXT_IDFM_API_KEY: "fixture" });
    const [first, second] = await Promise.all([
      matrixWalkingForGtfs(env, origin, [destination, { ...destination, id: "two" }]),
      matrixWalkingForGtfs(env, origin, [{ ...destination, id: "subscriber" }, { ...destination, id: "other" }]),
    ]);
    expect(first.map(route => route.id)).toEqual(["one", "two"]);
    expect(second.map(route => route.id)).toEqual(["subscriber", "other"]);
    expect(first.every(route => route.provider === "idfm-navitia" && route.durationSeconds === 840 && !route.fallback)).toBe(true);
    await matrixWalkingForGtfs(env, origin, [destination, { ...destination, id: "third" }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("routes egress in the correct direction and retains explicit approximations on failure", async () => {
    const fetcher = vi.fn(async url => walkingResponse(url));
    vi.stubGlobal("fetch", fetcher);
    const { matrixWalkingForGtfs } = await import("../server/services/walking/openRouteService");
    const env = event({ NUXT_ORS_API_KEY: "", NUXT_IDFM_API_KEY: "fixture" });
    const routes = await matrixWalkingForGtfs(env, origin, [destination], { reverse: true });
    const query = new URL(String(fetcher.mock.calls[0]![0])).searchParams;
    expect(query.get("from")).toBe(`${destination.lon};${destination.lat}`);
    expect(query.get("to")).toBe(`${origin.lon};${origin.lat}`);
    expect(routes[0]?.coordinates[0]).toEqual({ lon: destination.lon, lat: destination.lat });
    fetcher.mockImplementation(async () => Response.json({}, { status: 503 }));
    const failed = await matrixWalkingForGtfs(env, { ...origin, lon: 2.37 }, [destination]);
    expect(failed[0]).toMatchObject({ provider: "straight-line", fallback: true });
  });
  it("shares a pending street route between overlapping matrices with different stop lists", async () => {
    const fetcher = vi.fn(async url => walkingResponse(url));
    vi.stubGlobal("fetch", fetcher);
    const { matrixWalkingForGtfs } = await import("../server/services/walking/openRouteService");
    const env = event({ NUXT_ORS_API_KEY: "", NUXT_IDFM_API_KEY: "fixture" });
    const extra = { ...destination, id: "extra", lon: 2.38 };
    const [one, two] = await Promise.all([
      matrixWalkingForGtfs(env, origin, [destination, extra]),
      matrixWalkingForGtfs(env, origin, [{ ...destination, id: "remapped" }]),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(one.map(route => route.id)).toEqual(["one", "extra"]);
    expect(two[0]).toMatchObject({ id: "remapped", provider: "idfm-navitia", durationSeconds: 840 });
  });
});
