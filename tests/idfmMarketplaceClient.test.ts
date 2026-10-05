import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchIdfmMarketplaceWithRetry,
  getIdfmRetryDelayMs,
  IdfmMarketplaceRateGate,
} from "../server/services/idfm/marketplaceClient";

describe("IDFM Marketplace rate gate", () => {
  afterEach(() => vi.useRealTimers());
  it("cancels queued work without preventing later requests from starting", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const gate = new IdfmMarketplaceRateGate();
    const fetcher = vi.fn(async () => new Response("{}"));
    await gate.fetch(new URL("https://idfm.test/first"), {}, fetcher);
    const controller = new AbortController();
    const cancelled = gate.fetch(new URL("https://idfm.test/cancelled"), { signal: controller.signal }, fetcher);
    const rejected = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    const next = gate.fetch(new URL("https://idfm.test/next"), {}, fetcher);
    await vi.advanceTimersByTimeAsync(520);
    expect((await next).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("paces concurrent request starts below the five-per-second PRIM ceiling", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const starts: number[] = [];
    const fetchImpl = vi.fn(async () => {
      starts.push(Date.now());
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const gate = new IdfmMarketplaceRateGate({
      minRequestIntervalMs: 260,
    });

    const requests = Promise.all([
      fetchIdfmMarketplaceWithRetry(new URL("https://idfm.test/one"), {}, { fetchImpl, rateGate: gate }),
      fetchIdfmMarketplaceWithRetry(new URL("https://idfm.test/two"), {}, { fetchImpl, rateGate: gate }),
      fetchIdfmMarketplaceWithRetry(new URL("https://idfm.test/three"), {}, { fetchImpl, rateGate: gate }),
    ]);
    await vi.advanceTimersByTimeAsync(520);
    await requests;

    expect(starts).toEqual([0, 260, 520]);
  });

  it("opens a shared cooldown after one 429 instead of retrying upstream", async () => {
    let now = 0;
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{"message":"limited"}', {
        status: 429,
        headers: { "retry-after": "2" },
      }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const gate = new IdfmMarketplaceRateGate({
      minRequestIntervalMs: 0,
      now: () => now,
      wait: async (durationMs) => {
        now += durationMs;
      },
    });
    const url = new URL("https://idfm.test/stop-monitoring");

    const first = await fetchIdfmMarketplaceWithRetry(url, {}, { fetchImpl, rateGate: gate });
    const blocked = await fetchIdfmMarketplaceWithRetry(url, {}, { fetchImpl, rateGate: gate });

    expect(first.status).toBe(429);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("x-idfm-rate-limit-source")).toBe("shared-cooldown");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now = 2_000;
    const recovered = await fetchIdfmMarketplaceWithRetry(url, {}, { fetchImpl, rateGate: gate });
    expect(recovered.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps the SIRI unit quota usable when only Navitia is exhausted", async () => {
    let now = 0;
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("limited", {
        status: 429,
        headers: { "retry-after": "60" },
      }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const gate = new IdfmMarketplaceRateGate({
      minRequestIntervalMs: 0,
      now: () => now,
      wait: async (durationMs) => {
        now += durationMs;
      },
    });

    const navitia = await fetchIdfmMarketplaceWithRetry(
      new URL("https://prim.test/marketplace/v2/navitia/lines"),
      {},
      { fetchImpl, rateGate: gate },
    );
    const siri = await fetchIdfmMarketplaceWithRetry(
      new URL("https://prim.test/marketplace/stop-monitoring"),
      {},
      { fetchImpl, rateGate: gate },
    );

    expect(navitia.status).toBe(429);
    expect(siri.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("honors long Retry-After values and uses a safe fallback for Cloudflare Retry-After 0", () => {
    expect(getIdfmRetryDelayMs(
      new Response(null, { status: 429, headers: { "retry-after": "5458" } }),
      30_000,
    )).toBe(5_458_000);
    expect(getIdfmRetryDelayMs(
      new Response(null, { status: 429, headers: { "retry-after": "0" } }),
      30_000,
    )).toBe(30_000);
  });
});
