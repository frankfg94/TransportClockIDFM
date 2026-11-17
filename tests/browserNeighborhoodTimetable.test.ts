import { afterEach, describe, expect, it, vi } from "vitest";

const instances: FakeWorker[] = [];
class FakeWorker {
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  messages: Array<{ id: number; kind: string; lineId?: string; stationId?: string; serviceDate?: string }> = [];
  terminate = vi.fn();
  constructor() { instances.push(this); }
  postMessage(message: FakeWorker["messages"][number]) { this.messages.push(structuredClone(message)); }
}
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); instances.length = 0; });
async function setup() {
  vi.stubGlobal("window", { location: { href: "https://transportclockidfm.pages.dev/verdict" } });
  vi.stubGlobal("Worker", FakeWorker);
  return await import("../src/services/travelRoutes/browserNeighborhoodTimetable");
}

describe("browser verdict timetable", () => {
  it("preserves HTTP coverage errors, successful empty timetables and subsequent published departures", async () => {
    const adapter = await import("../src/services/travelRoutes/browserNeighborhoodTimetable");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const payload = { lineId: "T6", serviceDate: "20261217", source: "gtfs", stops: [{ id: "stop", name: "Stop" }], trips: [] };
    fetcher.mockResolvedValueOnce(Response.json({ ...payload, status: "out-of-coverage" }))
      .mockResolvedValueOnce(Response.json({ ...payload, status: "missing" }))
      .mockResolvedValueOnce(Response.json({ ...payload, status: "ready" }))
      .mockResolvedValueOnce(Response.json({ ...payload, status: "ready", trips: [{ calls: [{ stopId: "stop", departure: 90000, pickupType: 0 }] }] }));
    const last = () => adapter.fetchNeighborhoodGtfsLastService("T6", "stop", { serviceDate: payload.serviceDate });
    await expect(last()).rejects.toMatchObject({ name: "NeighborhoodGtfsCoverageError", serviceDate: "20261217" });
    await expect(last()).rejects.toThrow("unavailable");
    await expect(last()).resolves.toBeUndefined();
    await expect(last()).resolves.toMatchObject({ seconds: 90000 });
  });
  it("shares one worker for frequencies and the last service, keeping station and date constraints", async () => {
    const adapter = await setup();
    const frequency = adapter.fetchNeighborhoodGtfsFrequency("IDFM:C01743");
    const last = adapter.fetchNeighborhoodGtfsLastService("IDFM:C01743", "stop:123", { serviceDate: "20261013" });
    expect(instances).toHaveLength(1);
    const worker = instances[0]!;
    expect(worker.messages[0]).toMatchObject({ kind: "frequency", lineId: "IDFM:C01743" });
    expect(worker.messages[1]).toMatchObject({ kind: "last-service", lineId: "IDFM:C01743", stationId: "stop:123", serviceDate: "20261013" });
    const profile = { source: "gtfs", lineId: "IDFM:C01743", status: "ready" };
    worker.onmessage!({ data: { id: worker.messages[0]!.id, payload: profile } });
    worker.onmessage!({ data: { id: worker.messages[1]!.id, payload: { seconds: 90000, stopName: "Station" } } });
    await expect(frequency).resolves.toEqual(profile);
    await expect(last).resolves.toEqual({ seconds: 90000, stopName: "Station" });
  });

  it("rejects a frequency response for another line", async () => {
    const adapter = await setup();
    const result = adapter.fetchNeighborhoodGtfsFrequency("IDFM:C01743");
    const worker = instances[0]!;
    worker.onmessage!({ data: { id: worker.messages[0]!.id, payload: { source: "gtfs", lineId: "another" } } });
    await expect(result).rejects.toThrow("Unsupported browser GTFS frequency contract");
  });

  it("does not send an already cancelled timetable request", async () => {
    const adapter = await setup(), controller = new AbortController();
    controller.abort(new Error("address changed"));
    await expect(adapter.fetchNeighborhoodGtfsLastService("line", undefined, { signal: controller.signal })).rejects.toThrow("address changed");
    expect(instances).toHaveLength(0);
  });
});
