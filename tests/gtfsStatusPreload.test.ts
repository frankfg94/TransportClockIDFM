import { afterEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
const mocks = vi.hoisted(() => ({ gtfs: vi.fn(), netex: vi.fn(), ridership: vi.fn(), env: vi.fn(() => ({})) }));
vi.mock("../server/services/gtfs/runtime", () => ({ getGtfsPublicStatus: mocks.gtfs }));
vi.mock("../server/services/topology/netexCache", () => ({ getNetexCacheStatus: mocks.netex, getNetexRuntimeEnv: mocks.env }));
vi.mock("../server/services/ridership/ridershipCache", () => ({ getRidershipStatus: mocks.ridership }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function requestHook() {
  vi.resetModules(); vi.clearAllMocks();
  let request!: (event: H3Event) => Promise<void>;
  vi.stubGlobal("defineNitroPlugin", (plugin: (app: unknown) => void) => plugin({ hooks: { hook: (name: string, callback: typeof request) => { expect(name).toBe("request"); request = callback; } } }));
  await import("../server/plugins/gtfs");
  return request;
}
describe("dataset diagnostic preload", () => {
  it("lets pages, assets, walking, topology and individual status APIs proceed without unrelated status reads", async () => {
    const request = await requestHook();
    for (const path of ["/", "/nearby-neighborhood-score?debugVerdict=1", "/_nuxt/app.js", "/_gtfs-data/current.json", "/api/walking/matrix", "/api/service-quality", "/api/lines/one/topology", "/api/gtfs/status"])
      await request({ path } as H3Event);
    expect(mocks.gtfs).not.toHaveBeenCalled(); expect(mocks.netex).not.toHaveBeenCalled(); expect(mocks.ridership).not.toHaveBeenCalled();
  });
  it("retains all three status reads once for the explicit diagnostic", async () => {
    const request = await requestHook();
    mocks.gtfs.mockResolvedValue({ available: true, enabled: true, storage: "local", lineCount: 10 });
    mocks.netex.mockResolvedValue({ available: true, source: { kind: "directory" }, lineCount: 10 });
    mocks.ridership.mockResolvedValue({ available: true, source: { kind: "directory" }, counts: {} });
    vi.spyOn(console, "info").mockImplementation(() => {});
    await request({ path: "/api/datasets?fresh=1" } as H3Event);
    await request({ path: "/api/datasets" } as H3Event);
    expect(mocks.gtfs).toHaveBeenCalledTimes(1); expect(mocks.netex).toHaveBeenCalledTimes(1); expect(mocks.ridership).toHaveBeenCalledTimes(1);
  });
});
