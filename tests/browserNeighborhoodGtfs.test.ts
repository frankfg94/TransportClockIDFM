import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
const instances: FakeWorker[] = [];
class FakeWorker {
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  messages: unknown[] = [];
  terminate = vi.fn();
  constructor() { instances.push(this); }
  postMessage(message: unknown) { this.messages.push(structuredClone(message)); }
}
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); instances.length = 0; });
async function setup() {
  vi.stubGlobal("window", { location: { href: "https://transportclockidfm.pages.dev/verdict" } });
  vi.stubGlobal("Worker", FakeWorker);
  return await import("../src/services/travelRoutes/browserNeighborhoodGtfs");
}
const request = () => reactive({ origin: { lat: 48.8, lon: 2.3 }, datetime: "20261013T090000", destinations: [{ id: "a", lat: 48.9, lon: 2.4 }] });
describe("browser neighborhood GTFS", () => {
  it("sends a cloneable JSON contract for reactive coordinates and resolves the theoretical payload", async () => {
    const router = await setup();
    const result = router.routeBrowserNeighborhoodGtfs(request(), new AbortController().signal);
    const worker = instances[0]!, message = worker.messages[0] as { id: number; baseUrl: string; request: unknown };
    expect(message.baseUrl).toBe("https://transportclockidfm.pages.dev/"); expect(message.request).toEqual(request());
    const payload = { source: "gtfs", destinations: [] };
    worker.onmessage!({ data: { id: message.id, payload } });
    await expect(result).resolves.toEqual(payload);
  });
  it("ignores a cancelled old address while resolving other requests", async () => {
    const router = await setup(), controller = new AbortController();
    const old = router.routeBrowserNeighborhoodGtfs(request(), controller.signal);
    const next = router.routeBrowserNeighborhoodGtfs(request(), new AbortController().signal);
    const worker = instances[0]!, messages = worker.messages as { id: number }[];
    controller.abort(new Error("address changed")); await expect(old).rejects.toThrow("address changed");
    worker.onmessage!({ data: { id: messages[0]!.id, payload: { source: "gtfs", destinations: [] } } });
    worker.onmessage!({ data: { id: messages[1]!.id, payload: { source: "gtfs", destinations: [] } } });
    await expect(next).resolves.toMatchObject({ source: "gtfs" }); expect(instances).toHaveLength(1);
  });
  it("rejects failed workers and permits a fresh worker on the next request", async () => {
    const router = await setup();
    const failed = router.routeBrowserNeighborhoodGtfs(request(), new AbortController().signal);
    instances[0]!.onerror!(); await expect(failed).rejects.toThrow("worker failed"); expect(instances[0]!.terminate).toHaveBeenCalled();
    const next = router.routeBrowserNeighborhoodGtfs(request(), new AbortController().signal);
    const worker = instances[1]!, message = worker.messages[0] as { id: number };
    worker.onmessage!({ data: { id: message.id, payload: { source: "gtfs", destinations: [] } } });
    await expect(next).resolves.toMatchObject({ source: "gtfs" });
  });
});
