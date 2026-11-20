import { afterEach, describe, expect, it, vi } from "vitest";
import { createGtfsNeighborhoodTravelRoutesProvider } from "../src/services/travelRoutes/gtfsNeighborhoodTravelRoutesProvider";
import * as browserGtfs from "../src/services/travelRoutes/browserNeighborhoodGtfs";
const origin = { lon: 2.3, lat: 48.8 };
const request = (id = "a") => ({ origin, destination: { id, lon: 2.4, lat: 48.9 }, datetime: "20261012T090000" });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("verdict GTFS provider", () => {
  it("delivers a completed heavy-access batch while another is still waiting", async () => {
    vi.spyOn(browserGtfs, "canUseBrowserNeighborhoodGtfs").mockReturnValue(true);
    let release!: () => void;
    const slowBatch = new Promise<void>(resolve => { release = resolve; });
    const router = vi.spyOn(browserGtfs, "routeBrowserNeighborhoodGtfs").mockImplementation(async ({ destinations }) => {
      if (destinations.length === 16) await slowBatch;
      return { source: "gtfs", serviceDate: "20261012", searchHorizonSeconds: 14400, destinations: destinations.map(destination => ({
        id: destination.id, status: "ready", journeys: [{ durationSeconds: 600, sections: [] }],
      })) };
    });
    const provider = createGtfsNeighborhoodTravelRoutesProvider();
    const results = Array.from({ length: 17 }, (_, i) => provider.findJourneys({
      ...request(), purpose: "transport", arrivalAtPlatform: true,
      destination: { id: String(i), lon: 2.4 + i / 1000, lat: 48.9 },
    }));
    try {
      await expect(results[16]).resolves.toHaveLength(1);
      expect(router.mock.calls.map(([batch]) => batch.destinations.length)).toEqual([16, 1]);
    } finally {
      release();
      await Promise.allSettled(results);
    }
  });
  it("publishes each browser reference result even when another destination is still waiting for a walk", async () => {
    vi.spyOn(browserGtfs, "canUseBrowserNeighborhoodGtfs").mockReturnValue(true);
    let release!: () => void;
    const walk = new Promise<void>(resolve => { release = resolve; });
    const router = vi.spyOn(browserGtfs, "routeBrowserNeighborhoodGtfs").mockImplementation(async batch => {
      const [target] = batch.destinations;
      expect(batch.destinations).toHaveLength(1);
      if (target!.lon === 2.4) await walk;
      return { source: "gtfs", serviceDate: "20261012", searchHorizonSeconds: 14400, destinations: [
        { id: target!.id, status: "ready", journeys: [{ id: String(target!.lon), durationSeconds: 600, sections: [] }] },
      ] };
    });
    const provider = createGtfsNeighborhoodTravelRoutesProvider();
    const first = { ...request(), purpose: "transport-benchmark" as const };
    const slow = provider.findJourneys(first);
    const duplicate = provider.findJourneys(first, new AbortController().signal);
    const fast = provider.findJourneys({ ...first, destination: { ...first.destination, lon: 2.5 } });
    await expect(fast).resolves.toMatchObject([{ id: "2.5" }]);
    release();
    expect(await duplicate).toEqual(await slow);
    expect(router).toHaveBeenCalledTimes(2);
  });
  it("forwards the target line and keeps each line's access separate in batching and caches", async () => {
    const fetcher = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      return Response.json({ source: "gtfs", datasetVersion: "v1", destinations: body.destinations.map((d: { id: string; destinationLineId?: string }) => ({
        id: d.id, status: "ready", journeys: [{ id: d.destinationLineId ?? "whole-station", sections: [] }],
      })) });
    });
    vi.stubGlobal("fetch", fetcher);
    const provider = createGtfsNeighborhoodTravelRoutesProvider();
    const requests = ["line-a", "line-b", undefined].map(destinationLineId => ({ ...request(), arrivalAtPlatform: true, destinationLineId }));
    const results = await Promise.all(requests.map(input => provider.findJourneys(input)));
    expect(results.map(journeys => journeys[0]?.id)).toEqual(["line-a", "line-b", "whole-station"]);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).destinations).toHaveLength(3);
    expect((await provider.findJourneys(requests[0]!))[0]?.id).toBe("line-a");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps unrestricted and locally eligible feeder probes separate for the same platform", async () => {
    const router = vi.spyOn(browserGtfs, "routeBrowserNeighborhoodGtfs").mockImplementation(async batch => ({
      source: "gtfs", serviceDate: "20261012", searchHorizonSeconds: 14400,
      destinations: batch.destinations.map(d => ({ id: d.id, status: "ready", journeys: [{
        id: d.nearbyAccessFeeders?.lineCodes.join(",") ?? "all", durationSeconds: 900, sections: [],
      }] })),
    }));
    vi.spyOn(browserGtfs, "canUseBrowserNeighborhoodGtfs").mockReturnValue(true);
    const platform = { ...request(), destinationLineId: "L", arrivalAtPlatform: true };
    const scoped = { ...platform, nearbyAccessFeeders: { lineIds: ["official-162"], lineCodes: ["162"] } };
    const provider = createGtfsNeighborhoodTravelRoutesProvider();
    const result = await Promise.all([provider.findJourneys(platform), provider.findJourneys(scoped)]);
    expect(result.map(routes => routes[0]?.id)).toEqual(["all", "162"]);
    expect((await provider.findJourneys(scoped))[0]?.id).toBe("162");
    expect(router).toHaveBeenCalledTimes(1);
  });
  it("keeps platform arrival and coordinate arrival in separate cache entries", async () => {
    const fetcher = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      return Response.json({ source: "gtfs", datasetVersion: "v1", destinations: body.destinations.map((d: {id: string; arrivalAtPlatform?: boolean}) => ({
        id: d.id, status: "ready", journeys: [{ id: String(d.arrivalAtPlatform), sections: [], durationSeconds: d.arrivalAtPlatform ? 600 : 720 }],
      })) });
    });
    vi.stubGlobal("fetch", fetcher);
    const provider = createGtfsNeighborhoodTravelRoutesProvider();
    const [platform, coordinate] = await Promise.all([provider.findJourneys({ ...request(), arrivalAtPlatform: true }), provider.findJourneys(request())]);
    expect(platform[0]?.durationSeconds).toBe(600); expect(coordinate[0]?.durationSeconds).toBe(720);
    await provider.findJourneys({ ...request(), arrivalAtPlatform: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("batches destinations and deduplicates concurrent probes without any PRIM call", async () => {
    const fetcher = vi.fn(async (url, init) => {
      expect(String(url)).toContain("/api/neighborhood-journeys");
      const body = JSON.parse(init.body);
      return Response.json({ source: "gtfs", datasetVersion: "v1", destinations: body.destinations.map((d: {id: string}) => ({ id: d.id, status: "ready", journeys: [{ id: d.id, sections: [], durationSeconds: 600, source: "gtfs" }] })) });
    });
    vi.stubGlobal("fetch", fetcher);
    const provider = createGtfsNeighborhoodTravelRoutesProvider();
    const [one, same, second] = await Promise.all([provider.findJourneys(request()), provider.findJourneys(request()), provider.findJourneys({ ...request("b"), destination: { id: "b", lon: 2.45, lat: 48.95 } })]);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(one).toEqual(same); expect(second).toHaveLength(1);
    await provider.findJourneys(request()); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("deduplicates cancellable subscribers and ignores unrelated origin metadata", async () => {
    const fetcher = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body); expect(body.destinations).toHaveLength(1);
      return Response.json({ source: "gtfs", destinations: [{ id: "0", status: "ready", journeys: [] }] });
    });
    vi.stubGlobal("fetch", fetcher);
    const provider = createGtfsNeighborhoodTravelRoutesProvider(), controller = new AbortController();
    await Promise.all([provider.findJourneys(request(), controller.signal),
      provider.findJourneys({ ...request(), origin: { ...origin, label: "same point" } } as ReturnType<typeof request>, controller.signal)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("separates scheduling purposes without removing any destinations or journeys", async () => {
    const fetcher = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      return Response.json({ source: "gtfs", datasetVersion: "v1", destinations: body.destinations.map((d: { id: string }) => ({ id: d.id, status: "ready", journeys: [{ id: d.id, durationSeconds: 600, sections: [] }] })) });
    });
    vi.stubGlobal("fetch", fetcher);
    const provider = createGtfsNeighborhoodTravelRoutesProvider();
    const results = await Promise.all([provider.findJourneys({ ...request(), purpose: "transport" }), provider.findJourneys({ ...request("b"), destination: { id: "b", lon: 2.45, lat: 48.95 }, purpose: "places" }),
      provider.findJourneys({ ...request("c"), datetime: "20261013T030000", purpose: "night-transport" })]);
    expect(fetcher).toHaveBeenCalledTimes(3); expect(results.map(routes => routes.length)).toEqual([1, 1, 1]);
    expect(fetcher.mock.calls.map(([, init]) => JSON.parse(init.body).purpose).sort()).toEqual(["night-transport", "places", "transport"]);
  });
  it("never falls back when GTFS has no coverage or fails", async () => {
    const fetcher = vi.fn(async () => Response.json({ source: "gtfs", destinations: [{ id: "0", status: "missing", journeys: [] }] }));
    vi.stubGlobal("fetch", fetcher); const provider = createGtfsNeighborhoodTravelRoutesProvider();
    await expect(provider.findJourneys(request())).rejects.toThrow("missing");
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockImplementationOnce(async () => new Response("", { status: 503 }));
    await expect(provider.findJourneys(request())).rejects.toThrow("503");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("cancels old addresses independently from other subscribers", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      return Response.json({ source: "gtfs", destinations: body.destinations.map((d: {id: string}) => ({ id: d.id, status: "ready", journeys: [] })) });
    }));
    const provider = createGtfsNeighborhoodTravelRoutesProvider(), controller = new AbortController();
    const old = provider.findJourneys(request(), controller.signal); const next = provider.findJourneys(request("b"));
    controller.abort(new Error("address changed"));
    await expect(old).rejects.toThrow("address changed"); await expect(next).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
