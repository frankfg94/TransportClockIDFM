import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { createServer } from "node:http";
import { createApp, defineEventHandler, toNodeListener } from "h3";
import { strToU8, zipSync } from "fflate";
import handler from "../server/api/map/isochrones.get";
import { IndexedIsochroneArchive } from "../server/services/isochrones/indexedArchive";
import { openIsochroneSource, type IsochroneRangeSource } from "../server/services/isochrones/rangeSource";
import { clearIsochroneServerCache } from "../server/services/isochrones/radarService";
import { parseGlobalIsochroneQuery } from "../src/features/transport-map/isochrones/protocol";
import { walkingArchiveFixture, walkingPolygon } from "./fixtures/walkingIsochrones";
import type { GlobalIsochroneRequest } from "../src/features/transport-map/isochrones/contracts";

const metro: GlobalIsochroneRequest[] = [{ key: "mode:METRO", mode: "METRO", minutes: 10 }];
function memorySource(bytes: Uint8Array): IsochroneRangeSource & { reads: Array<[number, number]> } {
  const reads: Array<[number, number]> = [];
  return { size: bytes.length, identity: "test", reads, close: async () => {}, async read(start, length) { reads.push([start, length]); return bytes.slice(start, start + length); } };
}
afterEach(() => { clearIsochroneServerCache(); vi.unstubAllGlobals(); });

describe("Nuxt indexed walking atlas", () => {
  it("reads index and only selected contours, preserving holes and caching geometry", async () => {
    const fixture = walkingArchiveFixture();
    const source = memorySource(fixture.bytes());
    const archive = await IndexedIsochroneArchive.open(source);
    const before = source.reads.length;
    const result = await archive.select(source, metro, "test-v1");
    expect(source.reads.length - before).toBe(3);
    expect(result.surfaces[0]?.geometry.coordinates).toHaveLength(2);
    expect(result.coverage).toMatchObject({ total: 2, available: 1, missing: 1 });
    const after = source.reads.length;
    expect((await archive.select(source, metro, "test-v1")).surfaces[0]?.geometry).toBe(result.surfaces[0]?.geometry);
    expect(source.reads).toHaveLength(after);
    expect(source.reads.every(([, length]) => length < source.size)).toBe(true);
    await expect(archive.select(source, metro, "other-version")).rejects.toMatchObject({ code: "incompatible" });
  });

  it("returns only the selected line, with missing scopes reported separately", async () => {
    const fixture = walkingArchiveFixture([
      { kind: "line", id: "line:1", mode: "METRO", stationIds: ["s1"], coveredStationIds: ["s1"] },
      { kind: "mode", id: "METRO", mode: "METRO", stationIds: ["s1", "s2"], coveredStationIds: ["s1", "s2"] },
    ]);
    const source = memorySource(fixture.bytes());
    const archive = await IndexedIsochroneArchive.open(source);
    const result = await archive.select(source, [{ key: "line:line:1", mode: "METRO", minutes: 15 }], "test-v1");
    expect(result.surfaces).toHaveLength(1);
    expect(result.coverage.total).toBe(1);
    expect((await archive.select(source, [{ key: "mode:BUS", mode: "BUS", minutes: 5 }], "test-v1")).coverage.missingScopes).toEqual(["mode:BUS"]);
  });

  it("rejects corrupted metadata, unsupported versions, CRC and invalid geometry", async () => {
    await expect(IndexedIsochroneArchive.open(memorySource(strToU8("not a zip")))).rejects.toMatchObject({ code: "invalid" });
    const fixture = walkingArchiveFixture();
    const badIndex = { ...fixture.index, schemaVersion: 99 };
    await expect(IndexedIsochroneArchive.open(memorySource(zipSync({ ...fixture.entries, "index.json": strToU8(JSON.stringify(badIndex)) })))).rejects.toMatchObject({ code: "incompatible" });
    const asset = fixture.index.scopes["mode:METRO"]!.zones[10]!.asset;
    const invalid = strToU8(JSON.stringify({ type: "Polygon", coordinates: [[[2, 48], [2, 48]]] }));
    fixture.entries[asset] = invalid;
    fixture.index.scopes["mode:METRO"]!.zones[10]!.bytes = invalid.length;
    const source = memorySource(fixture.bytes());
    await expect((await IndexedIsochroneArchive.open(source)).select(source, metro, "test-v1")).rejects.toMatchObject({ code: "invalid" });
    const valid = walkingArchiveFixture();
    const bytes = zipSync({ ...valid.entries, "index.json": strToU8(JSON.stringify(valid.index)) }, { level: 0 });
    const text = strToU8('"Polygon"');
    const position = bytes.findIndex((_b, i) => text.every((b, j) => bytes[i + j] === b));
    bytes[position + 2] ^= 1;
    const corrupt = memorySource(bytes);
    await expect((await IndexedIsochroneArchive.open(corrupt)).select(corrupt, [{ ...metro[0]!, minutes: 5 }], "test-v1")).rejects.toMatchObject({ code: "invalid" });
  });

  it("rejects unbounded and malformed public selectors before reading any source", () => {
    for (const scopes of [[], Array(10).fill(metro[0]), [metro[0], metro[0]], [{ ...metro[0], minutes: 3 }], [{ ...metro[0], key: "../../secret" }]]) {
      expect(() => parseGlobalIsochroneQuery({ mapVersion: "test-v1", scopes: JSON.stringify(scopes) })).toThrow();
    }
    expect(() => parseGlobalIsochroneQuery({ mapVersion: "../file", scopes: JSON.stringify(metro) })).toThrow();
  });

  it("reads exact HTTP ranges and refuses a server ignoring Range or replacing the object", async () => {
    const bytes = walkingArchiveFixture().bytes();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === "HEAD") return new Response(null, { headers: { "content-length": String(bytes.length), etag: '"v1"' } });
      const headers = new Headers(init?.headers);
      expect(headers.get("if-match")).toBe('"v1"');
      const [, from, to] = /^bytes=(\d+)-(\d+)$/u.exec(headers.get("range")!)!;
      return new Response(bytes.slice(Number(from), Number(to) + 1), { status: 206, headers: { "content-range": `bytes ${from}-${to}/${bytes.length}`, etag: '"v1"' } });
    });
    const source = await openIsochroneSource({ IDFM_MAP_ISOCHRONES_REMOTE: "https://assets.test/walking.zip" }, fetcher);
    const archive = await IndexedIsochroneArchive.open(source);
    expect((await archive.select(source, metro, "test-v1")).surfaces).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method !== "HEAD").every(([, init]) => new Headers(init?.headers).has("range"))).toBe(true);
    fetcher.mockResolvedValueOnce(new Response(bytes));
    await expect(source.read(0, 10)).rejects.toMatchObject({ code: "invalid" });
    fetcher.mockResolvedValueOnce(new Response(null, { status: 412 }));
    await expect(source.read(0, 10)).rejects.toMatchObject({ code: "unavailable" });
  });

  it("signs private R2 HEAD and GET without exposing credentials in URLs", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(init?.redirect).toBe("manual");
      expect(String(url)).toBe("https://account.r2.cloudflarestorage.com/bucket/radar/walking.zip");
      expect(new Headers(init?.headers).get("authorization")).toContain("AWS4-HMAC-SHA256");
      return init?.method === "HEAD"
        ? new Response(null, { headers: { "content-length": "100", etag: '"v1"' } })
        : new Response(new Uint8Array(22), { status: 206, headers: { "content-range": "bytes 78-99/100", etag: '"v1"' } });
    });
    const source = await openIsochroneSource({ IDFM_MAP_ISOCHRONES_REMOTE: "r2://bucket/radar/walking.zip", R2_ACCOUNT_ID: "account", R2_ACCESS_KEY_ID: "test-access", R2_SECRET_ACCESS_KEY: "test-secret" }, fetcher);
    expect(await source.read(78, 22)).toHaveLength(22);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects redirected archives without following the new URL", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, {
      status: 302, headers: { location: "https://other.test/archive.zip" },
    }));
    await expect(openIsochroneSource({ IDFM_MAP_ISOCHRONES_REMOTE: "https://assets.test/redirect.zip" }, fetcher)).rejects.toMatchObject({ code: "unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("serves compact partial data and safe errors through the actual Nuxt handler", async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), "radar-api-test-"));
    const path = join(dir, "walking.zip");
    const app = createApp().use(defineEventHandler((event) => { event.context.cloudflare = { env: { IDFM_MAP_ISOCHRONES_LOCAL: path, IDFM_MAP_ISOCHRONES_REMOTE: "" } }; })).use("/api/map/isochrones", handler);
    const server = createServer(toNodeListener(app));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}/api/map/isochrones?mapVersion=test-v1&scopes=${encodeURIComponent(JSON.stringify(metro))}`;
    try {
      expect((await fetch(url)).status).toBe(404);
      await fs.writeFile(path, walkingArchiveFixture().bytes());
      const response = await fetch(url + "&retry=1");
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.result.coverage.missing).toBe(1);
      expect(body.result.surfaces).toHaveLength(1);
      expect(JSON.stringify(body)).not.toContain("stationIds");
      expect(JSON.stringify(body)).not.toContain(dir);
      expect((await fetch(url.replace("test-v1", "test-v2"))).status).toBe(409);
      expect((await fetch(url.replace("scopes=", "invalid="))).status).toBe(400);
      await fs.writeFile(path, "invalid");
      expect((await fetch(url + "&retry=2")).status).toBe(422);
    } finally {
      await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
      if (!basename(dir).startsWith("radar-api-test-")) throw new Error("Unsafe cleanup");
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
