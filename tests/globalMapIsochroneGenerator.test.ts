import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import {
  parseIsochroneBuildOptions, requestedIsochroneOrigins, runIsochroneBuild, writeIsochroneArchiveAtomic,
  type IsochroneBuildOptions,
} from "../../idfm-node-backend/src/transport/isochrones/build-isochrones";
import { buildIsochroneCatalogue, containedPath, readIsochroneCatalogue } from "../../idfm-node-backend/src/transport/isochrones/catalogue";
import { IsochroneOrsClient, normalizeIsochroneBatch } from "../../idfm-node-backend/src/transport/isochrones/openRouteService";
import { GlobalIsochroneArchive } from "../src/features/transport-map/isochrones/archive";
import { GLOBAL_ISOCHRONE_PARAMETERS } from "../src/features/transport-map/isochrones/contracts";
import { walkingCatalogueFixture, walkingOrsPayload, walkingPolygon } from "./fixtures/walkingIsochrones";

describe("offline walking radar generator", () => {
  let temporary: string;
  let options: IsochroneBuildOptions;
  const report = vi.fn();
  const sleep = async () => {};
  const env = { ORS_API_KEY: "test-only-key", ORS_API_URL: "https://ors.test" };
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { locations: [number, number][] };
    return Response.json(walkingOrsPayload(body.locations, true));
  });

  async function installCatalogue(extraStations = 0) {
    const fixture = walkingCatalogueFixture(extraStations);
    await fs.mkdir(options.mapDir, { recursive: true });
    await Promise.all([
      fs.writeFile(join(options.mapDir, "manifest.json"), JSON.stringify(fixture.manifest)),
      fs.writeFile(join(options.mapDir, "bootstrap.json"), JSON.stringify(fixture.bootstrap)),
      fs.writeFile(join(options.mapDir, "catalog.json"), JSON.stringify(fixture.catalogue)),
    ]);
    return fixture;
  }
  async function archive() { return new GlobalIsochroneArchive(await fs.readFile(options.output), "test-v1"); }

  beforeEach(async () => {
    temporary = await fs.mkdtemp(join(tmpdir(), "walking-radar-test-"));
    options = { mapDir: join(temporary, "map"), output: join(temporary, "walking-isochrones.zip"), cacheDir: join(temporary, "cache"), all: false, dryRun: false, requestsPerMinute: 6000, keepArchives: true };
    fetcher.mockClear();
    report.mockClear();
  });
  afterEach(async () => {
    if (!basename(temporary).startsWith("walking-radar-test-")) throw new Error("Unsafe test cleanup target");
    await fs.rm(temporary, { recursive: true, force: true });
  });

  it("uses canonical station-line memberships even when bootstrap line station lists are empty", async () => {
    const fixture = await installCatalogue();
    expect(fixture.bootstrap.lines.every((line) => (line[6] as unknown[]).length === 0)).toBe(true);
    const catalogue = await readIsochroneCatalogue(options.mapDir);
    expect(catalogue.scopes.get("line:line:METRO:1")?.stationIds).toEqual(["s1", "s2"]);
    expect(catalogue.scopes.get("mode:RER")?.stationIds).toEqual(["s1", "s1-platform"]);
    expect(requestedIsochroneOrigins(catalogue, options)).toHaveLength(3);
    expect(requestedIsochroneOrigins(catalogue, { ...options, all: true })).toHaveLength(5);
    expect(requestedIsochroneOrigins(catalogue, { ...options, lineId: "line:METRO:1" })).toHaveLength(2);
    expect(() => requestedIsochroneOrigins(catalogue, { ...options, lineId: "not-a-line" })).toThrow("canonical");
    expect(() => containedPath(options.mapDir, "../outside.json")).toThrow("inside");
    fixture.catalogue.stations[0]![11] = [9999];
    expect(() => buildIsochroneCatalogue("test-v1", fixture.bootstrap, fixture.catalogue)).toThrow("relation");
  });

  it("supports CLI selectors and dry-run without a key, cache writes or quota", async () => {
    await installCatalogue();
    const parsed = parseIsochroneBuildOptions(["--modes=BUS,NOCTILIEN", "--dry-run", "--output", options.output]);
    expect(parsed.modes).toEqual(["BUS", "NOCTILIEN"]);
    expect(parsed.dryRun).toBe(true);
    expect(parseIsochroneBuildOptions(["--line=line:METRO:1"]).lineId).toBe("line:METRO:1");
    expect(() => parseIsochroneBuildOptions(["--all", "--modes=BUS"])).toThrow("only one");
    expect(() => parseIsochroneBuildOptions(["--modes=PLANE"])).toThrow("Unknown");
    const result = await runIsochroneBuild({ ...options, dryRun: true }, { env: {}, fetcher, report });
    expect(result).toEqual({ requested: 3, pending: 3, requests: 0, partial: false });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(fs.stat(options.output)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(options.cacheDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requests destination walking contours once per origin and pre-unions all six durations", async () => {
    await installCatalogue();
    const result = await runIsochroneBuild(options, { env, fetcher, report, sleep });
    expect(result.requests).toBe(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://ors.test/v2/isochrones/foot-walking");
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.locations).toHaveLength(3);
    expect(body).toMatchObject({ location_type: "destination", range_type: "time", range: [300, 600, 900, 1200, 1500, 1800] });
    const atlas = await archive();
    expect(atlas.index.scopes["mode:METRO"]?.coveredStationIds).toEqual(["s1", "s2", "s3"]);
    expect(atlas.index.scopes["line:line:METRO:1"]?.stationIds).toEqual(["s1", "s2"]);
    expect(atlas.index.scopes["mode:BUS"]?.coveredStationIds).toEqual([]);
    expect(Object.keys(atlas.index.scopes["mode:METRO"]!.zones)).toHaveLength(6);
    const geometry = atlas.select([{ key: "mode:RER", mode: "RER", minutes: 30 }]).surfaces[0]!.geometry;
    expect(geometry.type).toBe("MultiPolygon");
    if (geometry.type === "MultiPolygon") expect(geometry.coordinates[0]).toHaveLength(2); // exterior + hole
    const metro = atlas.select([{ key: "mode:METRO", mode: "METRO", minutes: 10 }]).surfaces[0]!.geometry;
    if (metro.type === "MultiPolygon") expect(metro.coordinates).toHaveLength(2); // overlapping M1 + disconnected M2
    const second = await runIsochroneBuild(options, { env: { ORS_API_URL: env.ORS_API_URL }, fetcher, report, sleep });
    expect(second.pending).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("cleans per-origin checkpoints after a complete publication unless explicitly retained", async () => {
    await installCatalogue();
    const result = await runIsochroneBuild({ ...options, keepArchives: false }, { env, fetcher, report, sleep });
    expect(result).toMatchObject({ requested: 3, pending: 3, requests: 1, partial: false });
    expect(await fs.readdir(options.cacheDir)).toEqual([]);
    expect((await archive()).index.scopes["mode:METRO"]?.coveredStationIds).toEqual(["s1", "s2", "s3"]);
  });

  it("uses local Docker without an API key and invalidates checkpoints when the OSM revision changes", async () => {
    await installCatalogue();
    const localEnv = { ORS_API_URL: "http://127.0.0.1:8080/ors", ORS_DATA_VERSION: "osm-v1" };
    const localFetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("/v2/health")) return Response.json({ status: "ready" });
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      return fetcher(url, init);
    });
    await runIsochroneBuild({ ...options, lineId: "line:METRO:1" }, { env: localEnv, fetcher: localFetcher, report, sleep });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).locations).toHaveLength(2);
    expect((await archive()).index.sourceRevision).toBe("osm-v1");
    await runIsochroneBuild({ ...options, lineId: "line:METRO:1" }, { env: localEnv, fetcher: localFetcher, report, sleep });
    expect(localFetcher).toHaveBeenCalledTimes(2); // health + batch, then entirely cached
    await runIsochroneBuild({ ...options, lineId: "line:METRO:1" }, { env: { ...localEnv, ORS_DATA_VERSION: "osm-v2" }, fetcher: localFetcher, report, sleep });
    expect(localFetcher).toHaveBeenCalledTimes(4);
    expect((await archive()).index.sourceRevision).toBe("osm-v2");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not calculate or publish while the local pedestrian graph is still building", async () => {
    await installCatalogue();
    const healthFetcher = vi.fn<typeof fetch>(async () => Response.json({ status: "not ready" }));
    await expect(runIsochroneBuild(options, {
      env: { ORS_API_URL: "http://127.0.0.1:8080/ors", ORS_DATA_VERSION: "osm-v1" },
      fetcher: healthFetcher, report, sleep,
    })).rejects.toThrow("Local ORS is not ready");
    expect(healthFetcher).toHaveBeenCalledTimes(1);
    await expect(fs.stat(options.output)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("adds Bus/Noctilien without losing existing non-bus data, even without the old raw cache", async () => {
    await installCatalogue();
    await runIsochroneBuild(options, { env, fetcher, report, sleep });
    const before = (await archive()).select([{ key: "mode:METRO", mode: "METRO", minutes: 10 }]);
    // A new cache directory simulates moving the generated atlas to a different machine.
    const result = await runIsochroneBuild({ ...options, cacheDir: join(temporary, "new-cache"), modes: ["BUS", "NOCTILIEN"] }, { env, fetcher, report, sleep });
    expect(result.requested).toBe(2);
    const after = await archive();
    expect(after.select([{ key: "mode:METRO", mode: "METRO", minutes: 10 }]).surfaces).toEqual(before.surfaces);
    expect(after.index.scopes["mode:BUS"]?.coveredStationIds).toEqual(["b1"]);
    expect(after.index.scopes["mode:NOCTILIEN"]?.coveredStationIds).toEqual(["n1"]);
  });

  it("publishes partial progress after a request budget and resumes only unfinished origins", async () => {
    await installCatalogue(7);
    const first = await runIsochroneBuild({ ...options, maxRequests: 1 }, { env, fetcher, report, sleep });
    expect(first).toMatchObject({ requested: 10, requests: 1, partial: true });
    const partial = (await archive()).select([{ key: "mode:METRO", mode: "METRO", minutes: 10 }]);
    expect(partial.coverage.missing).toBeGreaterThan(0);
    const second = await runIsochroneBuild(options, { env, fetcher, report, sleep });
    expect(second).toMatchObject({ pending: 5, requests: 1, partial: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await archive()).select([{ key: "mode:METRO", mode: "METRO", minutes: 10 }]).coverage.missing).toBe(0);
    const locations = fetcher.mock.calls.flatMap(([, init]) => JSON.parse(String(init?.body)).locations as [number, number][]);
    expect(new Set(locations.map(String)).size).toBe(10);
    expect(fetcher.mock.calls.every(([, init]) => JSON.parse(String(init?.body)).locations.length <= 5)).toBe(true);
  });

  it("repairs corrupt archives from valid checkpoints without making new ORS requests", async () => {
    await installCatalogue();
    await runIsochroneBuild(options, { env, fetcher, report, sleep });
    await fs.writeFile(options.output, "corrupt archive");
    await runIsochroneBuild(options, { env: { ORS_API_URL: env.ORS_API_URL }, fetcher, report, sleep });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await archive()).index.scopes["mode:METRO"]?.coveredStationIds).toHaveLength(3);
  });

  it("keeps the previous file intact on publication failure or an oversized replacement", async () => {
    await fs.writeFile(options.output, "previous-valid-file");
    async function* failedEntries() { yield ["zone.json", strToU8("data")] as const; throw new Error("union failed"); }
    await expect(writeIsochroneArchiveAtomic(options.output, failedEntries())).rejects.toThrow("union failed");
    async function* entries() { yield ["zone.json", strToU8("data")] as const; }
    await expect(writeIsochroneArchiveAtomic(options.output, entries(), 1)).rejects.toThrow();
    expect(await fs.readFile(options.output, "utf8")).toBe("previous-valid-file");
    expect(await fs.readdir(temporary)).toEqual(["walking-isochrones.zip"]);
  });

  it("skips HTTP 500/3099 stations, publishes the remaining zones and reports their names and lines", async () => {
    await installCatalogue();
    const mixed = vi.fn<typeof fetch>(async (url, init) => {
      const { locations } = JSON.parse(String(init?.body));
      if (locations.some(([lon]: number[]) => lon === 2.351)) return Response.json({ error: { code: 3099, message: "Unable to build an isochrone map." } }, { status: 500 });
      return fetcher(url, init);
    });
    const first = await runIsochroneBuild(options, { env, fetcher: mixed, report, sleep });
    expect(first).toMatchObject({ requests: 4, partial: true });
    expect((await archive()).index.scopes["mode:METRO"]?.coveredStationIds).toEqual(["s1", "s3"]);
    expect(report.mock.calls.flat().join("\n")).toContain("s2 [s2; line:METRO:1]");
    expect(report.mock.calls.flat().join("\n")).toContain("code 3099");
    const second = await runIsochroneBuild(options, { env, fetcher, report, sleep });
    expect(second).toMatchObject({ pending: 1, requests: 1, partial: false });
    expect((await archive()).index.scopes["mode:METRO"]?.coveredStationIds).toHaveLength(3);
  });

  it("does not checkpoint far-snapped successes and retries them without losing verified origins", async () => {
    await installCatalogue();
    const farSnapped = vi.fn<typeof fetch>(async (_url, init) => {
      const { locations } = JSON.parse(String(init?.body));
      const payload = walkingOrsPayload(locations);
      for (const feature of payload.features) if (feature.properties.group_index === 0) feature.properties.center = [1.4490734, 49.0333181];
      return Response.json(payload);
    });
    const first = await runIsochroneBuild(options, { env, fetcher: farSnapped, report, sleep });
    expect(first.partial).toBe(true);
    expect((await archive()).index.scopes["mode:METRO"]?.coveredStationIds).toEqual(["s2", "s3"]);
    const second = await runIsochroneBuild(options, { env, fetcher, report, sleep });
    expect(second).toMatchObject({ pending: 1, requests: 1, partial: false });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).locations).toEqual([[2.35, 48.85]]);
  });

  it.each([false, true])("never publishes an index-only atlas, retaining an existing file: %s", async (existing) => {
    await installCatalogue();
    if (existing) await runIsochroneBuild(options, { env, fetcher, report, sleep });
    const before = existing ? await fs.readFile(options.output) : undefined;
    const unavailable = vi.fn<typeof fetch>(async () => Response.json({ error: { code: 3099, message: "Unable to build an isochrone map." } }, { status: 500 }));
    await expect(runIsochroneBuild(options, { env: { ...env, ORS_DATA_VERSION: "different-dataset" }, fetcher: unavailable, report, sleep })).rejects.toThrow("No usable isochrones");
    if (before) expect(await fs.readFile(options.output)).toEqual(before);
    else await expect(fs.stat(options.output)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await fs.readdir(temporary)).filter((name) => name.endsWith(".tmp") || name.endsWith(".lock"))).toEqual([]);
  });

  it("does not publish on a quota stop before any usable origin, or overwrite an old atlas", async () => {
    await installCatalogue();
    const quota = vi.fn<typeof fetch>(async () => new Response(null, { status: 429, headers: { "retry-after": "3600" } }));
    await expect(runIsochroneBuild(options, { env, fetcher: quota, report, sleep })).rejects.toThrow("No usable isochrones");
    await expect(fs.stat(options.output)).rejects.toMatchObject({ code: "ENOENT" });
    expect(quota).toHaveBeenCalledTimes(1);
    expect(report.mock.calls.flat().join("\n")).toContain("quota/rate limit reached");
  });

  it("publishes and resumes successes checkpointed before a quota interrupts a 3099 split", async () => {
    await installCatalogue();
    const interrupted = vi.fn<typeof fetch>(async (url, init) => {
      const { locations } = JSON.parse(String(init?.body));
      if (locations.length > 1) return Response.json({ error: { code: 3099 } }, { status: 500 });
      if (locations[0][0] === 2.351) return new Response(null, { status: 429, headers: { "retry-after": "3600" } });
      return fetcher(url, init);
    });
    const first = await runIsochroneBuild(options, { env, fetcher: interrupted, report, sleep });
    expect(first).toMatchObject({ partial: true, requests: 3 });
    expect((await archive()).index.scopes["mode:METRO"]?.coveredStationIds).toEqual(["s1"]);
    expect(await runIsochroneBuild(options, { env, fetcher, report, sleep })).toMatchObject({ pending: 2, requests: 1, partial: false });
  });

  it("does not reuse legacy checkpoints or atlas unions without snapped-center validation", async () => {
    await installCatalogue();
    await runIsochroneBuild(options, { env, fetcher, report, sleep });
    const [currentNamespace] = await fs.readdir(options.cacheDir);
    const legacyNamespace = createHash("sha256").update(JSON.stringify({ root: env.ORS_API_URL, revision: "", parameters: GLOBAL_ISOCHRONE_PARAMETERS })).digest("hex").slice(0, 24);
    expect(currentNamespace).not.toBe(legacyNamespace);
    await fs.rename(join(options.cacheDir, currentNamespace!), join(options.cacheDir, legacyNamespace));
    const entries = unzipSync(await fs.readFile(options.output));
    const index = JSON.parse(strFromU8(entries["index.json"]!));
    index.calculationKey = legacyNamespace;
    entries["index.json"] = strToU8(JSON.stringify(index));
    await fs.writeFile(options.output, zipSync(entries));
    const legacyFiles = await fs.readdir(join(options.cacheDir, legacyNamespace));
    const result = await runIsochroneBuild({ ...options, lineId: "line:METRO:1" }, { env, fetcher, report, sleep });
    expect(result).toMatchObject({ pending: 2, requests: 1 });
    expect((await archive()).index.scopes["mode:METRO"]?.coveredStationIds).toEqual(["s1", "s2"]);
    expect(await fs.readdir(join(options.cacheDir, legacyNamespace))).toEqual(legacyFiles);
  });
});

describe("ORS batch validation and quota handling", () => {
  const origins = [{ key: "first", lon: 2.35, lat: 48.85 }, { key: "second", lon: 2.4, lat: 48.9 }];
  it("matches unordered responses by group_index and duration, rejecting incomplete/duplicate groups", () => {
    const payload = walkingOrsPayload(origins.map((origin) => [origin.lon, origin.lat]));
    const result = normalizeIsochroneBatch(payload, origins);
    expect(result.get("first")?.[30]).toEqual(walkingPolygon());
    expect(result.get("second")?.[5]).toEqual(walkingPolygon(2.4, 48.9));
    payload.features.push(payload.features[0]!);
    expect([...normalizeIsochroneBatch(payload, origins).keys()]).toEqual(["first"]);
    payload.features[0]!.properties.group_index = 10;
    expect(normalizeIsochroneBatch(payload, origins).size).toBe(0);
  });

  it.each([undefined, null, [], [NaN, 48.9], [2.4, Infinity], [181, 48.9], [2.4, 91], ["2.4", 48.9], [2.4, 48.9, 0], [2.4, 48.91]])("rejects an invalid or distant center (%j) for the entire affected origin only", (center) => {
    const payload = walkingOrsPayload(origins.map((origin) => [origin.lon, origin.lat]));
    Object.assign(payload.features[0]!.properties, { center });
    const unavailable = vi.fn();
    expect([...normalizeIsochroneBatch(payload, origins, unavailable).keys()]).toEqual(["first"]);
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(unavailable.mock.calls[0]?.[0]).toEqual(origins[1]);
  });

  it("accepts a nearby walking-network snap but rejects the observed 22 km Evreux snap", () => {
    const nearby = walkingOrsPayload([[2.35, 48.8505]]);
    expect(normalizeIsochroneBatch(nearby, [origins[0]!]).size).toBe(1);
    const evreux = { key: "evreux", lon: 1.14986, lat: 49.01841 };
    const response = walkingOrsPayload([[1.4490734, 49.0333181]]);
    const unavailable = vi.fn();
    expect(normalizeIsochroneBatch(response, [evreux], unavailable).size).toBe(0);
    expect(unavailable.mock.calls[0]?.[1]).toContain("maximum 250 m");
  });

  it.each([500, 502, 503])("bounds retries for generic HTTP %s without splitting stations or claiming quota", async (status) => {
    const unavailable = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async () => new Response("<html>Server unavailable</html>", { status }));
    const client = new IsochroneOrsClient({ root: "https://ors.test", apiKey: "", requestsPerMinute: 6000, sleep: async () => {}, fetcher, onUnavailable: unavailable });
    await expect(client.fetchBatch(origins)).rejects.toThrow(`ORS ${status}: service unavailable`);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.every(([, init]) => JSON.parse(String(init?.body)).locations.length === 2)).toBe(true);
    expect(unavailable).not.toHaveBeenCalled();
  });

  it("bounds retries, respects Retry-After and rate-limits every request", async () => {
    const sleep = vi.fn(async (_milliseconds: number) => {});
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 429, headers: { "retry-after": "2" } }));
    const client = new IsochroneOrsClient({ root: "https://ors.test", apiKey: "test", requestsPerMinute: 15, now: () => 0, sleep, fetcher });
    await expect(client.fetchBatch(origins)).rejects.toThrow("quota");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([2000, 4000, 2000, 4000]);
    fetcher.mockClear();
    fetcher.mockImplementation(async () => new Response(null, { status: 429, headers: { "retry-after": "3600" } }));
    await expect(client.fetchBatch(origins)).rejects.toThrow("quota");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("isolates unsnappable stations and saves successes before a quota interrupts a split batch", async () => {
    const saved = vi.fn(async (_origin: unknown, _zones: unknown) => {});
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const { locations } = JSON.parse(String(init?.body));
      if (locations.length > 1) return new Response(null, { status: 400 });
      if (locations[0][0] === 2.4) return new Response(null, { status: 429, headers: { "retry-after": "3600" } });
      return Response.json(walkingOrsPayload(locations));
    });
    const client = new IsochroneOrsClient({ root: "https://ors.test", apiKey: "test", requestsPerMinute: 6000, sleep: async () => {}, fetcher, onOrigin: saved });
    await expect(client.fetchBatch(origins)).rejects.toThrow("quota");
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0]?.[0]).toEqual(origins[0]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
