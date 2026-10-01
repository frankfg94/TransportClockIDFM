import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../src/services/idfm", () => ({ fetchNavitiaJourneys: mocks.fetch }));
const request = { origin: { lon: 2.3, lat: 48.8 }, destination: { lon: 2.4, lat: 48.9 }, datetime: "20260930T090000" };
beforeEach(() => { vi.resetModules(); mocks.fetch.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("shared Navitia journeys", () => {
  it("reuses persistent successes after reload and refreshes them after expiry", async () => {
    vi.useFakeTimers();
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) });
    mocks.fetch.mockResolvedValue([]);
    let module = await import("../src/services/travelRoutes/navitiaTravelRoutesProvider");
    await module.createNavitiaTravelRoutesProvider().findJourneys(request);
    vi.resetModules();
    module = await import("../src/services/travelRoutes/navitiaTravelRoutesProvider");
    await module.createNavitiaTravelRoutesProvider().findJourneys(request);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15 * 60_000);
    await module.createNavitiaTravelRoutesProvider().findJourneys(request);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("aborts the upstream only when every subscriber has cancelled", async () => {
    mocks.fetch.mockImplementation((_request, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason))));
    const { createNavitiaTravelRoutesProvider } = await import("../src/services/travelRoutes/navitiaTravelRoutesProvider");
    const first = new AbortController();
    const second = new AbortController();
    const a = createNavitiaTravelRoutesProvider().findJourneys(request, first.signal);
    const b = createNavitiaTravelRoutesProvider().findJourneys(request, second.signal);
    const rejected = Promise.all([expect(a).rejects.toMatchObject({ name: "AbortError" }), expect(b).rejects.toMatchObject({ name: "AbortError" })]);
    first.abort();
    second.abort();
    await rejected;
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("deduplicates across providers and keeps other consumers alive when one aborts", async () => {
    let complete!: (value: never[]) => void;
    mocks.fetch.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const { createNavitiaTravelRoutesProvider } = await import("../src/services/travelRoutes/navitiaTravelRoutesProvider");
    const first = new AbortController();
    const second = new AbortController();
    const a = createNavitiaTravelRoutesProvider().findJourneys(request, first.signal);
    const b = createNavitiaTravelRoutesProvider().findJourneys(request, second.signal);
    const rejected = expect(a).rejects.toMatchObject({ name: "AbortError" });
    first.abort();
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(false);
    complete([]);
    await rejected;
    await expect(b).resolves.toEqual([]);
    await expect(createNavitiaTravelRoutesProvider().findJourneys(request)).resolves.toEqual([]);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries failures instead of caching a false empty journey list", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("429")).mockResolvedValueOnce([]);
    const { createNavitiaTravelRoutesProvider } = await import("../src/services/travelRoutes/navitiaTravelRoutesProvider");
    const provider = createNavitiaTravelRoutesProvider();
    await expect(provider.findJourneys(request)).rejects.toThrow("429");
    await expect(provider.findJourneys(request)).resolves.toEqual([]);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
});
