import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCompiledNeighborhoodVerdictData } from "../server/services/neighborhoodVerdict/dataStore";
const data = { schemaVersion: "1.3", generatedAt: "2026-09-05", sources: [], greenSpaces: [{}], gpeStations: [{}], airNoiseCommunes: { a: {} }, security: { communes: { a: {} } }, serviceQuality: { lines: [{ lineId: "IDFM:test", lineName: "Test", reliabilityScore: 95 }] }, iris: { sourceId: "insee-iris", bbox: [2, 48, 3, 49], neighborhoods: [{}] } };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("verdict remote cache", () => {
  it("revalidates unchanged remote artifacts using their ETag without parsing them again", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(data), { headers: { ETag: '"version-one"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...data, generatedAt: "2026-10-13" }), { headers: { ETag: '"version-two"' } }));
    vi.stubGlobal("fetch", fetcher);
    const env = { IDFM_NEIGHBORHOOD_VERDICT_CACHE_REMOTE: "https://example.test/conditional.json" };
    const first = await loadCompiledNeighborhoodVerdictData(env);
    vi.advanceTimersByTime(60_001);
    expect(await loadCompiledNeighborhoodVerdictData(env)).toBe(first);
    expect(new Headers(fetcher.mock.calls[1]![1].headers).get("If-None-Match")).toBe('"version-one"');
    vi.advanceTimersByTime(60_001);
    expect((await loadCompiledNeighborhoodVerdictData(env)).generatedAt).toBe("2026-10-13");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("rejects redirects without forwarding R2 credentials on Workers", async () => {
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      return new Response(null, { status: 302, headers: { Location: "https://other.test/data" } });
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(loadCompiledNeighborhoodVerdictData({ IDFM_NEIGHBORHOOD_VERDICT_CACHE_REMOTE: "https://example.test/redirect.json" })).rejects.toThrow("HTTP 302");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("shares concurrent loads and caches the validated snapshot", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(data)));
    vi.stubGlobal("fetch", fetcher);
    const env = { IDFM_NEIGHBORHOOD_VERDICT_CACHE_REMOTE: "https://example.test/concurrent.json" };
    const [a, b] = await Promise.all([loadCompiledNeighborhoodVerdictData(env), loadCompiledNeighborhoodVerdictData(env)]);
    expect(a).toBe(b);
    expect(await loadCompiledNeighborhoodVerdictData(env)).toBe(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not fall back locally when an explicit remote fails; retries failures", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    const env = { IDFM_NEIGHBORHOOD_VERDICT_CACHE_REMOTE: "https://example.test/missing.json" };
    await expect(loadCompiledNeighborhoodVerdictData(env, "missing-local.json")).rejects.toThrow("HTTP 404");
    await expect(loadCompiledNeighborhoodVerdictData(env)).rejects.toThrow("HTTP 404");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("signs private R2 requests and preserves encoded object keys", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(data)));
    vi.stubGlobal("fetch", fetcher);
    await loadCompiledNeighborhoodVerdictData({ IDFM_NEIGHBORHOOD_VERDICT_CACHE_REMOTE: "r2://bucket/verdict/a%20b.json", R2_ACCOUNT_ID: "account", R2_ACCESS_KEY_ID: "test", R2_SECRET_ACCESS_KEY: "test" });
    const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe("https://account.r2.cloudflarestorage.com/bucket/verdict/a%20b.json");
    expect(new Headers(options.headers).get("Authorization")).toContain("AWS4-HMAC-SHA256");
  });
  it("rejects incompatible snapshots", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...data, schemaVersion: "old" }))));
    await expect(loadCompiledNeighborhoodVerdictData({ IDFM_NEIGHBORHOOD_VERDICT_CACHE_REMOTE: "https://example.test/invalid.json" })).rejects.toThrow("Unsupported verdict schema");
  });
});
