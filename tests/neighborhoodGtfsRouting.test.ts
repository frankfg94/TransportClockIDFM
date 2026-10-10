import { gzipSync } from "fflate";
import type { H3Event } from "h3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeNeighborhoodJourneys } from "../server/services/gtfs/routing";
import { scanConnections, routingSections, type RoutingConnection, type RoutingNode } from "../server/services/gtfs/connectionScan";
import { parisCivilEpoch, parisDateTime, gtfsServiceEpoch } from "../server/services/gtfs/routingTime";
import type { GtfsRoutingIndex } from "../server/services/gtfs/routingTypes";
import type { GtfsManifest } from "../server/services/gtfs/types";
import { createStraightLineWalkingRoute } from "../src/features/nearby-stations/nearbyWalkingRoutes";

const mocks = vi.hoisted(() => ({ manifest: vi.fn(), read: vi.fn(), matrix: vi.fn(), epoch: 0 }));
vi.mock("../server/services/gtfs/runtime", () => ({
  getGtfsManifest: mocks.manifest, readGtfsJson: mocks.read, isGtfsEnabled: () => true, getGtfsRuntimeCacheEpoch: () => mocks.epoch,
}));
vi.mock("../server/services/walking/openRouteService", () => ({ matrixWalkingWithOpenRouteService: mocks.matrix }));
let index: GtfsRoutingIndex, manifest: GtfsManifest, rows: number[][];
beforeEach(() => {
  mocks.epoch++; vi.clearAllMocks();
  // Any network attempt (including PRIM) fails this test.
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Automatic network forbidden"); }));
  index = { schemaVersion: 1, stops: [
    { id: "IDFM:A", parentId: "IDFM:PA", name: "A", lon: 2.3, lat: 48.8 },
    { id: "IDFM:B", name: "B", lon: 2.35, lat: 48.8 },
    { id: "IDFM:C", parentId: "IDFM:PC", name: "C", lon: 2.4, lat: 48.8 },
  ], boardingStops: [0, 1, 2], services: [{ id: "S", weekdays: 31, startDate: "20260101", endDate: "20261231", exceptions: {} }],
  lines: [{ id: "IDFM:L", code: "4", mode: "METRO" }], transfers: [], scopedTransfers: [], hasConditionalService: false,
  hours: { "9": ["9-0.json"] }, maxTimeSeconds: 90000 };
  rows = [[0, 1, 9 * 3600 + 300, 9 * 3600 + 600, 0, 0, 0, 0], [1, 2, 9 * 3600 + 660, 9 * 3600 + 900, 0, 0, 0, 16]];
  manifest = { schemaVersion: 1, sha256: "a".repeat(64), datasetVersion: "fixture", cacheGeneration: 1, installedAt: "", lineCount: 1,
    routing: { schemaVersion: 1, path: `routing/v1/${"a".repeat(64)}/test`, startDate: "20260101", endDate: "20261231", connectionCount: 2, fileCount: 2, bytes: 100 } };
  mocks.manifest.mockImplementation(async () => manifest);
  mocks.read.mockImplementation(async (_event, path: string) => {
    if (path.endsWith("index.json")) return { value: index };
    const bytes = new Uint8Array(rows.length * 32), view = new DataView(bytes.buffer);
    rows.forEach((row, i) => row.forEach((value, j) => view.setUint32(i * 32 + j * 4, value, true)));
    return { value: { schemaVersion: 1, encoding: "gzip-base64-u32le", count: rows.length, trips: [[0, "T", "C"], [1, "U", "C"]],
      data: Buffer.from(gzipSync(bytes)).toString("base64") } };
  });
  mocks.matrix.mockImplementation(async (_event, origin, destinations, options) => destinations.map((destination: { lon: number; lat: number; id: string }) => {
    const route = options?.reverse ? createStraightLineWalkingRoute(destination, origin, destination.id) : createStraightLineWalkingRoute(origin, destination, destination.id);
    return { ...route, durationSeconds: 0, fallback: false, provider: "openrouteservice" };
  }));
});
afterEach(() => vi.unstubAllGlobals());
const request = () => ({ origin: { lon: 2.3, lat: 48.8 }, datetime: "20261012T090000",
  destinations: [{ id: "c", lon: 2.4, lat: 48.8, destinationRef: "stop_area:IDFM:PC" }] });

describe("offline neighborhood routing", () => {
  it("uses a pathway for walking while still enforcing the official minimum change time", async () => {
    index.stops.push({ id: "IDFM:D", parentId: "IDFM:PD", name: "D", lon: 2.45, lat: 48.8 });
    index.boardingStops.push(3);
    index.transfers = [[1, 2, 306], [1, 2, 210]]; index.pathwayTransferIndices = [1];
    rows = [[0, 1, 32500, 32600, 0, 0, 0, 16], [2, 3, 32850, 32900, 1, 0, 0, 16], [2, 3, 32920, 33000, 1, 0, 0, 16]];
    const result = await routeNeighborhoodJourneys({} as H3Event, { ...request(), destinations: [{ id: "d", lon: 2.45, lat: 48.8, destinationRef: "stop_area:IDFM:PD", arrivalAtPlatform: true }] });
    const journey = result.destinations[0]!.journeys[0]!;
    expect(journey.durationSeconds).toBe(600);
    const walkway = journey.sections.find(section => section.fromStopPointId === "IDFM:B" && section.toStopPointId === "IDFM:C");
    expect(walkway?.durationSeconds).toBe(210); expect(walkway?.transferDurationSource).toBeUndefined();
    expect(journey.sections.filter(section => section.type === "waiting").map(section => section.durationSeconds)).toEqual([100, 110]);
  });
  it("ends a station benchmark at its official platform without any egress matrix", async () => {
    index.stops[2]!.id = "IDFM:monomodalStopPlace:42";
    mocks.matrix.mockImplementation(async (_event, origin, destinations, options) => destinations.map((destination: { lon: number; lat: number; id: string }) => ({
      ...createStraightLineWalkingRoute(origin, destination, destination.id), durationSeconds: options?.reverse ? 180 : 0, fallback: false, provider: "openrouteservice",
    })));
    const destination = { ...request().destinations[0]!, destinationRef: "stop_area:IDFM:monomodalStopPlace:42", arrivalAtPlatform: true };
    const result = await routeNeighborhoodJourneys({} as H3Event, { ...request(), destinations: [destination] });
    expect(result.destinations[0]!.journeys[0]!.durationSeconds).toBe(900);
    expect(result.destinations[0]!.journeys[0]!.sections.at(-1)?.type).toBe("public_transport");
    expect(mocks.matrix).toHaveBeenCalledTimes(1);
    const coordinate = await routeNeighborhoodJourneys({} as H3Event, { ...request(), destinations: [{ ...destination, arrivalAtPlatform: false }] });
    expect(coordinate.destinations[0]!.journeys[0]!.durationSeconds).toBe(1080);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("merges a direct trip, dwell, initial wait and official stop references", async () => {
    const result = await routeNeighborhoodJourneys({} as H3Event, request());
    const journey = result.destinations[0]!.journeys[0]!;
    expect(journey.source).toBe("gtfs"); expect(journey.durationSeconds).toBe(900);
    expect(journey.sections.filter(s => s.type === "public_transport")).toHaveLength(1);
    expect(journey.sections.find(s => s.type === "public_transport")?.durationSeconds).toBe(600);
    expect(journey.sections.find(s => s.type === "public_transport")?.toStopAreaId).toBe("IDFM:PC");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps the actual vehicle change when an express then local train arrives before the direct service", async () => {
    index.stops.push({ id: "IDFM:D", name: "Express destination", lon: 2.45, lat: 48.8 });
    index.boardingStops.push(3);
    rows = [[0, 1, 32500, 32600, 0, 0, 0, 0], [1, 3, 32630, 32800, 0, 0, 0, 16],
      [1, 2, 32750, 32850, 1, 0, 0, 16], [0, 2, 32800, 33000, 2, 0, 0, 16]];
    const read = mocks.read.getMockImplementation()!;
    mocks.read.mockImplementation(async (event, path) => {
      const response = await read(event, path);
      if (!path.endsWith("index.json")) response.value.trips.push([2, "direct", "C"]);
      return response;
    });
    const result = await routeNeighborhoodJourneys({} as H3Event, { ...request(),
      destinations: [{ ...request().destinations[0]!, arrivalAtPlatform: true }] });
    const journey = result.destinations[0]!.journeys[0]!;
    expect(journey.durationSeconds).toBe(450);
    expect(journey.transferCount).toBe(1);
    expect(journey.sections.filter(section => section.type === "public_transport").map(section => section.vehicleJourneyId)).toEqual(["20261012:T", "20261012:U"]);
    expect(journey.sections.filter(section => section.type === "waiting").map(section => section.durationSeconds)).toEqual([100, 150]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("shares scans between simultaneous destinations and invalidates on manifest replacement", async () => {
    const [one, two] = await Promise.all([routeNeighborhoodJourneys({} as H3Event, request()), routeNeighborhoodJourneys({} as H3Event, { ...request(), destinations: [{ id: "b", lon: 2.35, lat: 48.8 }] })]);
    expect(two.diagnostics?.cacheHit).toBe(true); expect(one.diagnostics?.scannedConnections).toBe(2);
    expect(mocks.read.mock.calls.filter(([, path]) => path.endsWith("9-0.json"))).toHaveLength(1);
    manifest = { ...manifest, cacheGeneration: 2 };
    expect((await routeNeighborhoodJourneys(undefined, request())).diagnostics?.cacheHit).toBe(false);
  });
  it("applies calendars, removals and additions", async () => {
    index.services[0]!.exceptions["20261012"] = 2;
    expect((await routeNeighborhoodJourneys(undefined, request())).destinations[0]!.journeys).toHaveLength(0);
    mocks.epoch++; index.services[0]!.weekdays = 0; index.services[0]!.exceptions["20261012"] = 1;
    expect((await routeNeighborhoodJourneys(undefined, request())).destinations[0]!.journeys).toHaveLength(1);
  });
  it("uses previous service days for times beyond midnight", async () => {
    index.hours = { "25": ["25-0.json"] }; rows = [[0, 2, 90000, 90600, 0, 0, 0, 16]];
    const result = await routeNeighborhoodJourneys(undefined, { ...request(), datetime: "20261013T005800" });
    expect(result.destinations[0]!.journeys[0]?.arrivalDateTime).toBe("20261013T011100"); // estimated terminal walk is one minute
  });
  it.each([1, 2, 3])("does not board pickup restriction %i", async restriction => {
    rows[0]![7] = restriction;
    expect((await routeNeighborhoodJourneys(undefined, request())).destinations[0]!.journeys).toHaveLength(0);
  });
  it("continues on board through a forbidden intermediate drop-off", async () => {
    rows[0]![7] = 4;
    const result = await routeNeighborhoodJourneys(undefined, request());
    expect(result.destinations[0]!.journeys).toHaveLength(1);
  });
  it("discloses ORS failure as estimated, without invoking PRIM", async () => {
    mocks.matrix.mockImplementation(async (_e, origin, destinations) => destinations.map((d: { lon: number; lat: number; id: string }) => createStraightLineWalkingRoute(origin, d, d.id)));
    expect((await routeNeighborhoodJourneys({} as H3Event, request())).destinations[0]!.status).toBe("partial");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reports missing and out-of-coverage artifacts without fallback", async () => {
    expect((await routeNeighborhoodJourneys(undefined, { ...request(), datetime: "20270102T090000" })).destinations[0]!.status).toBe("out-of-coverage");
    manifest.routing = undefined;
    expect((await routeNeighborhoodJourneys(undefined, request())).destinations[0]!.status).toBe("missing");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not hide a missing shard behind a live provider", async () => {
    const read = mocks.read.getMockImplementation()!;
    mocks.read.mockImplementation((event, path) => path.endsWith("index.json") ? read(event, path) : Promise.resolve({ value: undefined }));
    await expect(routeNeighborhoodJourneys(undefined, request())).rejects.toThrow("shard unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("respects the permitted modes", async () => {
    const result = await routeNeighborhoodJourneys(undefined, { ...request(), allowedModes: ["TRAM"] });
    expect(result.destinations[0]!.journeys).toHaveLength(0);
  });
  it("uses a specific official permission to override a generic forbidden transfer", async () => {
    index.stops.push({ id: "IDFM:B2", name: "B2", lon: 2.3501, lat: 48.8 }); index.boardingStops.push(3);
    index.transfers = [[1, 3, -1]];
    index.scopedTransfers = [{ from: 1, to: 3, seconds: 120, fromTrip: "T", toTrip: "U" }];
    rows = [[0, 1, 32700, 33000, 0, 0, 0, 16], [3, 2, 33120, 33300, 1, 0, 0, 16]];
    const result = await routeNeighborhoodJourneys({} as H3Event, request());
    expect(result.destinations[0]!.journeys[0]?.transferCount).toBe(1);
    mocks.epoch++; index.scopedTransfers[0]!.fromTrip = "other";
    expect((await routeNeighborhoodJourneys({} as H3Event, request())).destinations[0]!.journeys).toHaveLength(0);
  });
  it("preserves Noctilien service alternatives when a direct walk is faster", async () => {
    index.stops[1]!.lon = 2.301;
    index.lines[0]!.mode = "NOCTILIEN"; index.lines[0]!.code = "N63";
    const result = await routeNeighborhoodJourneys({} as H3Event, { ...request(), destinations: [{ id: "near", lon: 2.301, lat: 48.8 }] });
    expect(result.destinations[0]!.journeys.some(j => j.sections.some(s => s.lineCode === "N63"))).toBe(true);
    expect(result.destinations[0]!.journeys[0]?.sections.some(s => s.type === "public_transport")).toBe(false);
  });
});

describe("connection scan transfers and branches", () => {
  const seed = new Map<number, RoutingNode>([[0, { arrival: 0, section: { type: "walking", durationSeconds: 0 } }]]);
  const connection = (from: number, to: number, dep: number, arr: number, tripKey: string): RoutingConnection =>
    ({ from, to, departure: dep, arrival: arr, tripKey, routeId: tripKey, tripId: tripKey, pickup: 0, dropOff: 0, last: true,
      section: { type: "public_transport", lineId: tripKey, vehicleJourneyId: tripKey, durationSeconds: arr - dep } });
  async function* stream(values: RoutingConnection[]) { yield* values; }
  it("retains a genuine platform arrival when an earlier footpath masks its general label", async () => {
    const paths = new Map([[1, [{ to: 2, seconds: 10, section: { type: "walking", durationSeconds: 10 } }]]]);
    const result = await scanConnections(stream([connection(0, 1, 10, 100, "nearby"), connection(0, 2, 20, 200, "platform")]), seed, paths);
    expect(result.labels.get(2)?.arrival).toBe(110);
    expect(result.platformLabels.get(2)?.arrival).toBe(200);
    expect(result.platformLabels.get(2)?.section.lineId).toBe("platform");
  });
  it("keeps transfer waiting in total and chooses the reachable branch", async () => {
    const result = await scanConnections(stream([connection(0, 1, 10, 100, "a"), connection(1, 3, 110, 200, "miss"), connection(1, 2, 250, 350, "b")]), seed, new Map());
    expect(result.labels.has(3)).toBe(false); expect(result.labels.get(2)?.arrival).toBe(350);
    expect(routingSections(result.labels.get(2)!).filter(s => s.type === "waiting").map(s => s.durationSeconds)).toEqual([10, 150]);
  });
  it("retains later allowed transfers when the earliest arriving route is forbidden", async () => {
    const result = await scanConnections(stream([connection(0, 1, 10, 100, "a"), connection(0, 1, 20, 110, "b"), connection(1, 2, 300, 400, "c")]), seed, new Map(), new Map(),
      (from, to) => from.routeId === "a" && to.routeId === "c" ? -1 : 120, from => from.routeId!);
    expect(routingSections(result.labels.get(2)!).filter(s => s.type === "public_transport").map(s => s.lineId)).toEqual(["b", "c"]);
  });
});

describe("Europe/Paris GTFS time", () => {
  it("uses real calendar dates and rejects nonexistent spring clock times", () => {
    expect(() => parisCivilEpoch("20260329T023000")).toThrow();
    expect(() => parisCivilEpoch("20260230T090000")).toThrow();
    expect(parisDateTime(parisCivilEpoch("20261025T023000"))).toBe("20261025T023000");
  });
  it("anchors service seconds at local noon minus twelve hours on both DST transitions", () => {
    expect(gtfsServiceEpoch("20260329") + 43200).toBe(Date.parse("2026-03-29T10:00:00Z") / 1000);
    expect(gtfsServiceEpoch("20261025") + 43200).toBe(Date.parse("2026-10-25T11:00:00Z") / 1000);
  });
});
