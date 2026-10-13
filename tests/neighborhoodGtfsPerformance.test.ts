import { afterEach, describe, expect, it, vi } from "vitest";
import { createNeighborhoodGtfsTaskQueue } from "../src/services/travelRoutes/neighborhoodGtfsTaskQueue";
import { createNeighborhoodGtfsAssetReader } from "../src/services/travelRoutes/neighborhoodGtfsAssets";
import { createNeighborhoodGtfsWalkingMatrix } from "../src/services/travelRoutes/neighborhoodGtfsWalkingMatrix";
import { createNeighborhoodTimetableCache, selectNeighborhoodCivilTimetable, selectNeighborhoodServiceTimetable } from "../src/services/travelRoutes/neighborhoodTimetableCache";
import { createGtfsTimetableLoader } from "../shared/gtfs/timetableRuntime";
import { computeGtfsLineFrequency } from "../shared/gtfs/frequencyComputation";
import { findGtfsLastService } from "../shared/gtfs/lastService";
import type { GtfsManifest } from "../server/services/gtfs/types";
import type { GtfsTimetableLineIndex, GtfsTimetableChunk, GtfsTimetableLoadResult } from "../shared/gtfs/timetableTypes";

afterEach(() => vi.useRealTimers());
function fixture() {
  const manifest = { schemaVersion: 1, cacheGeneration: 1, timetable: { schemaVersion: 1, path: `timetables/v1/${"a".repeat(64)}/test`, startDate: "20261001", endDate: "20261013" } } as GtfsManifest;
  const index: GtfsTimetableLineIndex = { schemaVersion: 1, lineId: "IDFM:test", stops: [{ id: "S", name: "Station" }], services: [{ id: "daily", weekdays: 127, startDate: "20261001", endDate: "20261013", exceptions: {} }],
    chunks: [{ file: "0.json", serviceIds: ["daily"], bytes: 100, tripCount: 3 }], startDate: "20261001", endDate: "20261013", maxTimeSeconds: 25 * 3600, tripCount: 3 };
  const chunk: GtfsTimetableChunk = { schemaVersion: 1, trips: [8, 24, 25].map(hour => ({ id: `trip-${hour}`, serviceId: "daily", calls: [[0, 1, hour * 3600, hour * 3600, 0, 0]] })) };
  const read = vi.fn(async (_context: string, path: string) => path.endsWith("index.json") ? index : chunk);
  const loader = createGtfsTimetableLoader<string>({ getManifest: async () => manifest, isEnabled: () => true, cacheEpoch: () => 0,
    readJson: async <T>(context: string, path: string) => await read(context, path) as T });
  return { loader, read };
}
describe("shared frequency and last-departure timetable", () => {
  it("normalizes once while preserving both original views, including previous-day spillovers and departures after 24:00", async () => {
    const { loader, read } = fixture();
    const expectedCivil = await loader.loadForDate("host", "IDFM:test", "20261013");
    const expectedService = await loader.loadForDate("host", "IDFM:test", "20261013", { serviceDayOnly: true });
    const load = vi.fn(loader.loadForDate), cached = createNeighborhoodTimetableCache(load);
    read.mockClear();
    const first = await cached("host", "IDFM:test", "20261013", "v1");
    const second = await cached("host", "line:IDFM:test", "20261013", "v1");
    expect(second).toBe(first); expect(load).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(1);
    const civil = selectNeighborhoodCivilTimetable(first), service = selectNeighborhoodServiceTimetable(second, "20261013");
    expect(civil).toEqual(expectedCivil); expect(service).toEqual(expectedService);
    expect(service.trips.some(trip => trip.calls[0]!.departure === 25 * 3600)).toBe(true);
    expect(civil.trips.some(trip => trip.serviceDate === "20261012" && trip.calls[0]!.departure === 0)).toBe(true);
    expect(computeGtfsLineFrequency({ lineId: "IDFM:test", serviceDate: "20261013", timetable: civil }))
      .toEqual(computeGtfsLineFrequency({ lineId: "IDFM:test", serviceDate: "20261013", timetable: expectedCivil }));
    const last = (data: GtfsTimetableLoadResult) => findGtfsLastService({ status: data.status, stops: data.index?.stops ?? [], trips: data.trips });
    expect(last(service)).toEqual(last(expectedService)); expect(last(service)?.seconds).toBe(25 * 3600);
  });
  it("keeps the last departure outside service-day coverage unavailable even when the previous day still serves the civil day", async () => {
    const { loader } = fixture();
    const extended = await loader.loadForDate("host", "IDFM:test", "20261014", { retainServiceDayTrips: true });
    expect(selectNeighborhoodCivilTimetable(extended)).toEqual(await loader.loadForDate("host", "IDFM:test", "20261014"));
    expect(selectNeighborhoodServiceTimetable(extended, "20261014")).toEqual(await loader.loadForDate("host", "IDFM:test", "20261014", { serviceDayOnly: true }));
  });
  it("invalidates on date, dataset or host changes and retries missing data", async () => {
    const load = vi.fn(async () => ({ status: "ready", trips: [] }) as GtfsTimetableLoadResult), cached = createNeighborhoodTimetableCache(load);
    await cached("one", "line", "20261013", "v1"); await cached("one", "line", "20261014", "v1");
    await cached("one", "line", "20261014", "v2"); await cached("two", "line", "20261014", "v2");
    expect(load).toHaveBeenCalledTimes(4);
    load.mockResolvedValue({ status: "line-missing", trips: [] });
    await cached("one", "missing", "20261013", "v1"); await cached("one", "missing", "20261013", "v1");
    expect(load).toHaveBeenCalledTimes(6);
  });
});

describe("worker walking matrix reuse", () => {
  const origin = { lon: 2.3, lat: 48.8 }, destination = { id: "first", lon: 2.31, lat: 48.81 };
  it("shares concurrent and day/night reads, remaps subscriber ids and retains direction/coordinate distinctions", async () => {
    const fetcher = vi.fn(async (_url, init) => { const body = JSON.parse(String(init?.body)); return Response.json({ routes: body.destinations.map((point: typeof destination) => ({ ...point, provider: "idfm-navitia", durationSeconds: 600, distanceMeters: 800, coordinates: [body.origin, point] })) }); });
    const matrix = createNeighborhoodGtfsWalkingMatrix(fetcher);
    const [one, two] = await Promise.all([matrix("https://host.test", origin, [destination]), matrix("https://host.test", origin, [{ ...destination, id: "second" }])]);
    expect(one[0]?.id).toBe("first"); expect(two[0]?.id).toBe("second");
    expect(two[0]?.durationSeconds).toBe(600); expect(fetcher).toHaveBeenCalledTimes(1);
    await matrix("https://host.test", origin, [destination]); expect(fetcher).toHaveBeenCalledTimes(1);
    await matrix("https://host.test", origin, [destination], { reverse: true });
    await matrix("https://host.test", origin, [{ ...destination, lon: 2.32 }]); expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("never turns failed walking into verified access and retries approximations after one minute", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => Response.json({}, { status: 503 })), matrix = createNeighborhoodGtfsWalkingMatrix(fetcher);
    const one = await matrix("https://host.test", origin, [destination]);
    expect(one[0]).toMatchObject({ fallback: true, provider: "straight-line" });
    await matrix("https://host.test", origin, [destination]); expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 60001);
    await matrix("https://host.test", origin, [destination]); expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("overlapping walking matrices", () => {
  it("shares reordered and overlapping stop pairs while fetching only new coordinates", async () => {
    const fetcher = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return Response.json({ routes: body.destinations.map((point: { id: string; lon: number; lat: number }) => ({ id: point.id, provider: "idfm-navitia", durationSeconds: 600, distanceMeters: 800, coordinates: [body.origin, { lon: point.lon, lat: point.lat }] })) });
    });
    const matrix = createNeighborhoodGtfsWalkingMatrix(fetcher), origin = { lon: 2.3, lat: 48.8 };
    const first = { lon: 2.31, lat: 48.81, id: "first" }, second = { ...first, lon: 2.32, id: "second" }, third = { ...first, lon: 2.33, id: "third" };
    await matrix("https://host.test", origin, [first, second]);
    const routes = await matrix("https://host.test", origin, [second, third, { ...first, id: "remapped" }]);
    expect(routes.map(route => route.id)).toEqual(["second", "third", "remapped"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body)).destinations).toEqual([third]);
    await matrix("https://host.test", first, [{ ...origin, id: "reverse-equivalent" }], { reverse: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("cancelled GTFS work", () => {
  it("overlaps waits within a fixed bound, retains every result and waits for active and queued work", async () => {
    const queue = createNeighborhoodGtfsTaskQueue(4), releases: (() => void)[] = [], replies: number[] = [];
    let active = 0, peak = 0;
    for (let id = 0; id < 9; id++) queue.enqueue(id, async cancelled => {
      peak = Math.max(peak, ++active);
      await new Promise<void>(resolve => { releases.push(resolve); });
      active--; if (!cancelled()) replies.push(id);
    });
    await Promise.resolve(); expect(active).toBe(4);
    queue.cancel(6); queue.cancel(1);
    let finished = false; const idle = queue.idle().then(() => { finished = true; });
    while (!finished) {
      for (const release of releases.splice(0)) release();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await idle; expect(peak).toBe(4); expect(replies.sort()).toEqual([0, 2, 3, 4, 5, 7, 8]);
  });
  it("skips cancelled queued work and preserves serialization", async () => {
    const queue = createNeighborhoodGtfsTaskQueue(), calls: number[] = [];
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    queue.enqueue(1, async () => { calls.push(1); await gate; });
    queue.enqueue(2, async () => { calls.push(2); }); queue.enqueue(3, async () => { calls.push(3); });
    await Promise.resolve(); expect(calls).toEqual([1]); queue.cancel(2); release();
    await queue.idle(); expect(calls).toEqual([1, 3]);
  });
  it("suppresses a cancelled active reply, ignores late cancellation and continues after failure", async () => {
    const queue = createNeighborhoodGtfsTaskQueue(), reply = vi.fn();
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    queue.enqueue(1, async cancelled => { await gate; if (!cancelled()) reply(); });
    await Promise.resolve(); queue.cancel(1); release(); await queue.idle(); expect(reply).not.toHaveBeenCalled();
    queue.cancel(999); queue.enqueue(999, async () => { reply(); });
    queue.enqueue(2, async () => { throw new Error("failed"); }); queue.enqueue(3, async () => { reply(); });
    await queue.idle(); expect(reply).toHaveBeenCalledTimes(2);
  });
});

describe("GTFS public asset reads", () => {
  it("joins only in-flight reads, preserves complete content and retries failures", async () => {
    const value = { services: [1, 2, 3], trips: [{ id: "all", calls: [0, 120, 240] }] };
    const fetcher = vi.fn(async () => Response.json(value)), read = createNeighborhoodGtfsAssetReader(fetcher);
    const results = await Promise.all([read("https://host.test", "routing/index.json", true), read("https://host.test", "routing/index.json", true)]);
    expect(results).toEqual([value, value]); expect(fetcher).toHaveBeenCalledTimes(1);
    await read("https://host.test", "routing/index.json", true); expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockRejectedValueOnce(new Error("unavailable"));
    await expect(read("https://host.test", "routing/index.json", true)).rejects.toThrow("unavailable");
    expect(await read("https://host.test", "routing/index.json", true)).toEqual(value);
  });
  it("ignores CacheStorage and HTTP cache at cold start without touching existing entries", async () => {
    const open = vi.fn(), storage = { open } as unknown as CacheStorage;
    const fetcher = vi.fn(async () => Response.json({ full: true }));
    const read = createNeighborhoodGtfsAssetReader(fetcher, storage);
    await read("https://host.test", "current.json", true);
    expect(open).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cache: "no-store" }));
  });
});
