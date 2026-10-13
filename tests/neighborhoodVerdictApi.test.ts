import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNeighborhoodVerdict } from "../src/features/nearby-stations/neighborhoodVerdictApi";
afterEach(() => vi.unstubAllGlobals());
const payload = { schemaVersion: "1.3", generatedAt: "2026-10-13", categories: [], sources: [], warnings: [] };
describe("documentary verdict transient failures", () => {
  it.each([502, 503, 504])("retries one HTTP %s and returns the real recovered payload", async status => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchNeighborhoodVerdict(48.8, 2.3)).resolves.toEqual(payload);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]![0]).toBe(fetcher.mock.calls[1]![0]);
  });
  it("still reports a persistent failure after one retry", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchNeighborhoodVerdict(48.8, 2.3)).rejects.toThrow("503");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not retry an authorization failure", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchNeighborhoodVerdict(48.8, 2.3)).rejects.toThrow("401");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not retry a cancelled address", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async () => { controller.abort(); return new Response(null, { status: 503 }); });
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchNeighborhoodVerdict(48.8, 2.3, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
