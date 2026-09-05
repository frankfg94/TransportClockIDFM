import type { H3Event } from "h3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrequencyCache } from "../server/services/gtfs/frequencyCache";
import { clearGtfsFrequencyCache, getGtfsLineFrequency } from "../server/services/gtfs/frequency";
import type { GtfsTimetableLoadResult } from "../server/services/gtfs/timetableTypes";
import type { GtfsLineArtifact, GtfsManifest } from "../server/services/gtfs/types";
import type { LineTopology } from "../server/services/topology/types";
import endpoint from "../server/api/lines/[lineId]/frequency.get";

const mocks = vi.hoisted(() => ({
  manifest: vi.fn(),
  enabled: vi.fn(),
  epoch: vi.fn(),
  artifact: vi.fn(),
  timetable: vi.fn(),
  topology: vi.fn(),
  attach: vi.fn(),
  env: vi.fn(),
}));
vi.mock("../server/services/gtfs/runtime", () => ({
  getGtfsManifest: mocks.manifest,
  isGtfsEnabled: mocks.enabled,
  getGtfsRuntimeCacheEpoch: mocks.epoch,
  loadGtfsLineArtifact: mocks.artifact,
}));
vi.mock("../server/services/gtfs/timetableRuntime", () => ({
  loadGtfsTimetableForDate: mocks.timetable,
}));
vi.mock("../server/services/topology/getLineTopology", () => ({ getLineTopology: mocks.topology }));
vi.mock("../server/services/topology/attachGtfsMonitoringRefs", () => ({
  attachGtfsMonitoringRefs: mocks.attach,
}));
vi.mock("../server/services/topology/netexCache", () => ({
  getNetexRuntimeEnv: mocks.env,
  createNetexCacheEnvironmentKey: (env: { scope?: string }) => env.scope ?? "local",
}));

let manifest: GtfsManifest;
let timetable: GtfsTimetableLoadResult;
let topology: LineTopology;
let artifact: GtfsLineArtifact;
const monday = new Date("2026-08-31T10:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  clearGtfsFrequencyCache();
  manifest = {
    schemaVersion: 1,
    sha256: "a".repeat(64),
    datasetVersion: "v1",
    cacheGeneration: 1,
    installedAt: monday.toISOString(),
    sourceUpdatedAt: "2026-08-30T10:00:00Z",
    lineCount: 1,
    timetable: {
      schemaVersion: 1,
      path: `timetables/v1/${"a".repeat(64)}/one`,
      startDate: "20260801",
      endDate: "20260930",
      lineCount: 1,
      tripCount: 2,
      fileCount: 1,
      bytes: 200,
    },
  };
  topology = {
    line: { id: "L", aliases: [], name: "Line", shortName: "L", mode: "rail" },
    stations: [
      { id: "a", name: "A", degree: 1 },
      { id: "b", name: "B", degree: 1 },
    ],
    patterns: [{ id: "p", stops: ["a", "b"], terminalFrom: "a", terminalTo: "b", tripCount: 2 }],
    segments: [{ id: "ab", from: "a", to: "b", patterns: [] }],
    terminals: ["a", "b"],
    branchPoints: [],
    branches: [],
    loops: [],
  };
  timetable = {
    status: "ready",
    manifest,
    index: {
      schemaVersion: 1,
      lineId: "L",
      stops: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      services: [],
      chunks: [],
      startDate: "20260815",
      endDate: "20260915",
      maxTimeSeconds: 86400,
      tripCount: 2,
    },
    trips: [430, 436].map((minute, i) => ({
      id: `t${i}`,
      serviceDate: "20260831",
      directionId: "0",
      calls: ["a", "b"].map((stopId, sequence) => ({
        stopId,
        sequence,
        arrival: minute * 60,
        departure: minute * 60,
        pickupType: 0,
        dropOffType: 0,
      })),
    })),
  };
  artifact = {
    schemaVersion: 1,
    lineId: "L",
    routeIds: [],
    labels: [],
    routeTypes: [],
    routeColor: "#000000",
    routeTextColor: "#ffffff",
    patterns: [],
    shapes: {},
    entrances: [],
  };
  mocks.manifest.mockImplementation(async () => manifest);
  mocks.enabled.mockReturnValue(true);
  mocks.epoch.mockReturnValue(0);
  mocks.artifact.mockImplementation(async () => artifact);
  mocks.topology.mockImplementation(async () => topology);
  mocks.timetable.mockImplementation(async () => timetable);
  mocks.attach.mockImplementation((value: LineTopology) => value);
  mocks.env.mockReturnValue({ scope: "local" });
});
afterEach(() => vi.useRealTimers());

describe("frequency runtime cache", () => {
  it("reuses computations without reloading schedules or repeating alignment on hot requests", async () => {
    const [first, second] = await Promise.all([
      getGtfsLineFrequency(undefined, "L", monday),
      getGtfsLineFrequency(undefined, "L", monday),
    ]);
    expect(first).toBe(second);
    expect(first.average.peakMinutes).toBe(6);
    expect(first.coverage).toEqual({ startDate: "20260815", endDate: "20260915" });
    expect(first.sourceUpdatedAt).toBe(manifest.sourceUpdatedAt);
    expect(mocks.timetable).toHaveBeenCalledTimes(1);
    expect(mocks.attach).toHaveBeenCalledTimes(1);
    expect(mocks.timetable).toHaveBeenCalledWith(undefined, "L", "20260831");
  });

  it.each([
    "sha256",
    "cacheGeneration",
    "datasetVersion",
    "sourceUpdatedAt",
    "timetable",
    "epoch",
    "topology",
    "mapping",
    "environment",
  ])("invalidates when %s changes", async (changed) => {
    const first = await getGtfsLineFrequency(undefined, "L", monday);
    if (changed === "sha256") manifest.sha256 = "b".repeat(64);
    if (changed === "cacheGeneration") manifest.cacheGeneration++;
    if (changed === "datasetVersion") manifest.datasetVersion = "v2";
    if (changed === "sourceUpdatedAt") manifest.sourceUpdatedAt = "2026-08-31T11:00:00Z";
    if (changed === "timetable") manifest.timetable!.path += "-rebuilt";
    if (changed === "epoch") mocks.epoch.mockReturnValue(1);
    if (changed === "topology") topology.stations[0]!.name = "Renamed A";
    if (changed === "mapping")
      artifact.entrances.push({
        id: "entrance",
        parentStopId: "a",
        name: "A",
        lat: 48.8,
        lon: 2.3,
      });
    if (changed === "environment") mocks.env.mockReturnValue({ scope: "different" });
    const second = await getGtfsLineFrequency(undefined, "L", monday);
    expect(second).not.toBe(first);
    expect(mocks.timetable).toHaveBeenCalledTimes(2);
  });

  it("keys by line and civil reference date, keeping Tuesday on Tuesday", async () => {
    await getGtfsLineFrequency(undefined, "L", monday);
    await getGtfsLineFrequency(undefined, "M", monday);
    await getGtfsLineFrequency(undefined, "L", new Date("2026-09-01T10:00:00Z"));
    expect(mocks.timetable).toHaveBeenCalledTimes(3);
    expect(mocks.timetable).toHaveBeenLastCalledWith(undefined, "L", "20260901");
  });

  it("does not return a cached ready response after disabling GTFS", async () => {
    await getGtfsLineFrequency(undefined, "L", monday);
    mocks.enabled.mockReturnValue(false);
    timetable = { ...timetable, status: "disabled", trips: [] };
    expect((await getGtfsLineFrequency(undefined, "L", monday)).status).toBe("disabled");
    expect(mocks.attach).toHaveBeenCalledTimes(1);
  });

  it.each(["missing", "line-missing", "out-of-coverage"] as const)(
    "retries a negative %s result without waiting for cache expiry",
    async (status) => {
      timetable.status = status;
      expect((await getGtfsLineFrequency(undefined, "L", monday)).status).toBe(status);
      timetable.status = "ready";
      expect((await getGtfsLineFrequency(undefined, "L", monday)).status).toBe("ready");
      expect(mocks.timetable).toHaveBeenCalledTimes(2);
    },
  );

  it("provides overall frequencies on topology failure and recovers section data", async () => {
    mocks.topology.mockRejectedValueOnce(new Error("Missing cache"));
    const first = await getGtfsLineFrequency(undefined, "L", monday);
    expect(first.topologyAvailable).toBe(false);
    expect(first.average.peakMinutes).toBe(6);
    expect(first.sections).toEqual([]);
    const second = await getGtfsLineFrequency(undefined, "L", monday);
    expect(second.topologyAvailable).toBe(true);
    expect(second.sections).toHaveLength(1);
  });

  it("still uses exact topology ids if the GTFS geometry artifact is unavailable", async () => {
    mocks.artifact.mockRejectedValue(new Error("No geometry"));
    const response = await getGtfsLineFrequency(undefined, "L", monday);
    expect(response.average.peakMinutes).toBe(6);
    expect(response.topologyAvailable).toBe(true);
    expect(mocks.attach).not.toHaveBeenCalled();
  });

  it("can explicitly clear results and expire them without a manifest change", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(monday);
    await getGtfsLineFrequency(undefined, "L", monday);
    clearGtfsFrequencyCache();
    await getGtfsLineFrequency(undefined, "L", monday);
    vi.setSystemTime(new Date(monday.getTime() + 5 * 60_000));
    await getGtfsLineFrequency(undefined, "L", monday);
    expect(mocks.timetable).toHaveBeenCalledTimes(3);
  });
});

describe("bounded frequency cache", () => {
  it("bounds cardinality and evicts the least recently used result", async () => {
    const cache = new FrequencyCache<number>(2, 100);
    const load = vi.fn(() => 1);
    await cache.getOrLoad("a", load, 0);
    await cache.getOrLoad("b", load, 1);
    await cache.getOrLoad("a", load, 2);
    await cache.getOrLoad("c", load, 3);
    expect(cache.size).toBe(2);
    await cache.getOrLoad("a", load, 4);
    expect(load).toHaveBeenCalledTimes(3);
    await cache.getOrLoad("b", load, 5);
    expect(load).toHaveBeenCalledTimes(4);
    await cache.getOrLoad("b", load, 106);
    expect(cache.size).toBe(1);
    expect(load).toHaveBeenCalledTimes(5);
  });

  it("coalesces concurrent work, and retries rejected loads", async () => {
    const cache = new FrequencyCache<number>();
    const load = vi.fn(() => Promise.resolve(1));
    const first = cache.getOrLoad("a", load);
    expect(cache.getOrLoad("a", load)).toBe(first);
    await first;
    expect(load).toHaveBeenCalledTimes(1);
    await expect(
      cache.getOrLoad("bad", () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");
    expect(await cache.getOrLoad("bad", () => 2)).toBe(2);
  });

  it("does not let an evicted failing request delete its replacement", async () => {
    const cache = new FrequencyCache<number>(1);
    let reject!: (reason: Error) => void;
    const old = cache.getOrLoad(
      "a",
      () =>
        new Promise<number>((_, fail) => {
          reject = fail;
        }),
    );
    await Promise.resolve();
    await cache.getOrLoad("b", () => 2);
    const replacement = cache.getOrLoad("a", () => 3);
    reject(new Error("old failed"));
    await expect(old).rejects.toThrow("old failed");
    expect(cache.getOrLoad("a", () => 4)).toBe(replacement);
    expect(await replacement).toBe(3);
  });
});

describe("line frequency endpoint", () => {
  function event(lineId?: string) {
    const headers = new Map<string, string>();
    return {
      headers,
      event: {
        context: { params: lineId === undefined ? {} : { lineId } },
        node: {
          req: { url: "/api/lines/L/frequency" },
          res: { setHeader: (name: string, value: string) => headers.set(name, value) },
        },
      } as unknown as H3Event,
    };
  }

  it("returns the shared DTO and requires revalidation across dataset/date changes", async () => {
    const request = event("L");
    const result = await endpoint(request.event);
    expect(result).toMatchObject({
      source: "gtfs",
      status: "ready",
      lineId: "L",
      average: { peakMinutes: 6 },
    });
    expect(request.headers.get("Cache-Control")).toBe("no-cache");
  });

  it.each([undefined, " ", "../L", "L\\bad", "L\u0000bad", "L".repeat(201)])(
    "rejects invalid line id %s",
    async (lineId) => {
      await expect(endpoint(event(lineId).event)).rejects.toMatchObject({ statusCode: 400 });
      expect(mocks.timetable).not.toHaveBeenCalled();
    },
  );
});
