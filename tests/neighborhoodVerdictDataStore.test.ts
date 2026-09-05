import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCompiledNeighborhoodVerdictData } from "../server/services/neighborhoodVerdict/dataStore";
const data = { schemaVersion: "1.1", generatedAt: "2026-09-05", sources: [], greenSpaces: [{}], gpeStations: [{}], airNoiseCommunes: { a: {} }, security: { communes: { a: {} } } };
afterEach(() => vi.unstubAllGlobals());
describe("verdict remote cache", () => {
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
