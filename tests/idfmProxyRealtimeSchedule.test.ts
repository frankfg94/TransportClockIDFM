import { createApp, defineEventHandler, toWebHandler } from "h3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upstream: vi.fn() }));
vi.mock("../server/services/idfm/resolveStopArea", () => ({ getServerIdfmApiKey: () => "test-key" }));
vi.mock("../server/services/idfm/distributedRateGate", () => ({ getIdfmRateGateBinding: () => undefined }));
vi.mock("../server/services/idfm/marketplaceClient", () => ({
  IDFM_MARKETPLACE_BASE_URL: "https://prim.iledefrance-mobilites.fr/marketplace",
  fetchIdfmMarketplaceWithRetry: mocks.upstream,
}));

async function createProxyRequest(path: string) {
  const { default: handler } = await import("../server/api/idfm/[...path]");
  const app = createApp().use(defineEventHandler((event) => {
    event.context.params = { path: path.split("?")[0] };
    return handler(event);
  }));
  const serve = toWebHandler(app);
  return () => serve(new Request(`http://localhost/api/idfm/${path}`));
}

describe("IDFM proxy realtime route schedule cache", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.upstream.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T18:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it.each(["routes/route:test", "lines/line:test"])("refreshes %s realtime calls after eight seconds", async (scope) => {
    let generation = 0;
    mocks.upstream.mockImplementation(async () => Response.json({ generation: ++generation }));
    const request = await createProxyRequest(`v2/navitia/${scope}/route_schedules?data_freshness=realtime`);
    expect(await (await request()).json()).toEqual({ generation: 1 });
    vi.setSystemTime(Date.now() + 7_999);
    expect(await (await request()).json()).toEqual({ generation: 1 });
    expect(mocks.upstream).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 2);
    expect(await (await request()).json()).toEqual({ generation: 2 });
    expect(mocks.upstream).toHaveBeenCalledTimes(2);
  });

  it("returns the rate limit rather than stale calls after the realtime table expires", async () => {
    mocks.upstream.mockResolvedValueOnce(Response.json({ stops: ["A", "B", "C"] }))
      .mockResolvedValueOnce(Response.json({ error: "rate limited" }, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ stops: ["A", "C"] }));
    const request = await createProxyRequest("v2/navitia/routes/test/route_schedules?data_freshness=realtime");
    expect((await request()).status).toBe(200);
    vi.setSystemTime(Date.now() + 8_001);
    const unavailable = await request();
    expect(unavailable.status).toBe(429);
    expect(unavailable.headers.get("x-idfm-cache")).toBeNull();
    expect(await (await request()).json()).toEqual({ stops: ["A", "C"] });
    expect(mocks.upstream).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["v2/navitia/routes/test/route_schedules?data_freshness=base_schedule", 6 * 3_600_000],
    ["v2/navitia/lines/test/routes", 6 * 3_600_000],
    ["v2/navitia/stop_areas/test/stop_schedules?data_freshness=realtime", 5 * 60_000],
    ["stop-monitoring?MonitoringRef=test", 8_000],
  ])("preserves the neighboring cache and stale policy for %s", async (path, ttl) => {
    mocks.upstream.mockResolvedValueOnce(Response.json({ original: true }))
      .mockResolvedValueOnce(Response.json({ error: "rate limited" }, { status: 429 }));
    const request = await createProxyRequest(path);
    await request();
    vi.setSystemTime(Date.now() + ttl - 1);
    expect(await (await request()).json()).toEqual({ original: true });
    expect(mocks.upstream).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 2);
    const stale = await request();
    expect(stale.status).toBe(200);
    expect(stale.headers.get("x-idfm-cache")).toBe("stale-rate-limit");
    expect(await stale.json()).toEqual({ original: true });
  });
});
