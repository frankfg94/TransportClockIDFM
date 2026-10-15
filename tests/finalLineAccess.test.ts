import { describe, expect, it, vi } from "vitest";
import { createFinalLineAccessResolver } from "../shared/gtfs/finalLineAccess";
import type { GtfsRoutingIndex } from "../shared/gtfs/routingTypes";
import { routingSections, type ConnectionScanResult, type RoutingNode } from "../shared/gtfs/connectionScan";
import { getNearbyHeavyAccessContributionWeight } from "../src/features/nearby-stations/nearbyHeavyTransportRules";
import type { NearbyWalkingMatrixDestination, NearbyWalkingRoute } from "../src/features/nearby-stations/nearbyWalkingRoutes";

function fixture() {
  const index: GtfsRoutingIndex = { schemaVersion: 1, pedestrianGraphVersion: 1, services: [], lines: [], boardingStops: [0, 1], hours: {}, maxTimeSeconds: 0, hasConditionalService: false, scopedTransfers: [],
    stops: [
      { id: "BUS", name: "Bus arrival", parentId: "PA", lat: 48.8, lon: 2.3, locationType: 0, stopAccess: 1 },
      { id: "RAIL", name: "Rail", parentId: "PB", lat: 48.8, lon: 2.31, locationType: 0, stopAccess: 0 },
      { id: "E1", name: "Near entrance", parentId: "PB", lat: 48.8, lon: 2.3001, locationType: 2 },
      { id: "E2", name: "Other entrance", parentId: "PB", lat: 48.8, lon: 2.3003, locationType: 2 },
    ], transfers: [[0, 1, 364]], pathways: [
      { id: "long-inside", from: 2, to: 1, mode: 1, bidirectional: true, seconds: 180 },
      { id: "short-inside", from: 3, to: 1, mode: 1, bidirectional: true, seconds: 30 },
    ] };
  const node: RoutingNode = { arrival: 1000, walkingSeconds: 0, transferOrigin: { stop: 0, arrival: 1000, routeId: "FEEDER" },
    section: { type: "public_transport", durationSeconds: 900, lineId: "FEEDER", lineMode: "BUS", toStopPointId: "BUS" } };
  const tree: ConnectionScanResult = { labels: new Map(), transitLabels: new Map(), platformLabels: new Map([[0, node]]), tramLabels: new Map(), tramPlatformLabels: new Map(), nightLabels: new Map(), feederLabels: new Map(), accessLabels: new Map(), scannedConnections: 1, stopsByLine: new Map([["TARGET", new Set([1])]]), excludedFeederAccesses: [] };
  const matrix = vi.fn(async (_from: unknown, targets: NearbyWalkingMatrixDestination[]) => targets.map(to => ({ id: to.id, provider: "ign-bdtopo", fallback: false,
    durationSeconds: to.id === "E1" ? 5 : 50, distanceMeters: to.id === "E1" ? 5 : 50, coordinates: [to] } satisfies NearbyWalkingRoute)));
  const input = { tree, stationStops: [1], lineId: "TARGET", origin: { lat: 48.8, lon: 2.2 }, start: 0, end: 10000, matrix, assertCurrent: vi.fn(), transferRule: () => 364 as number | undefined };
  return { index, node, tree, matrix, input };
}

describe("final access to a line, separate from intermediate transfer rules", () => {
  it("chooses the shortest complete documented path across different station parents", async () => {
    const f = fixture(), result = await createFinalLineAccessResolver(f.index)!(f.input);
    expect(result).toHaveLength(1);
    expect(result[0]!.arrival).toBe(1080);
    const sections = routingSections(result[0]!);
    expect(sections.at(-1)).toMatchObject({ durationSeconds: 30, toStopPointId: "RAIL", walkingProvider: "gtfs-pathways",
      finalLineAccess: { status: "documented", entranceIds: ["E2"], pathwayIds: ["short-inside"] } });
    expect(sections.some(section => section.transferDurationSource)).toBe(false);
    expect(f.matrix).toHaveBeenCalledTimes(1);
    expect(f.matrix.mock.calls[0]![1]).toHaveLength(2);
  });

  it("lets an outdoor detour change the preferred entrance", async () => {
    const f = fixture();
    f.matrix.mockImplementation(async (_from, targets) => targets.map(to => ({ id: to.id, provider: "ign-bdtopo", fallback: false, durationSeconds: to.id === "E1" ? 10 : 300, distanceMeters: 10, coordinates: [to] })));
    const result = await createFinalLineAccessResolver(f.index)!(f.input);
    expect(result[0]?.arrival).toBe(1190);
    expect(result[0]?.section.finalLineAccess?.entranceIds).toEqual(["E1"]);
  });

  it("keeps a street estimate in seconds as context, without creating a bonus", async () => {
    const f = fixture(); f.matrix.mockRejectedValue(new Error("offline"));
    const result = await createFinalLineAccessResolver(f.index)!(f.input);
    const sections = routingSections(result[0]!);
    expect(result[0]?.section.finalLineAccess?.status).toBe("estimated");
    expect(sections.find(section => section.walkingProvider === "straight-line")?.durationSeconds).toBeLessThan(60);
    expect(getNearbyHeavyAccessContributionWeight({ totalSeconds: result[0]!.arrival, feederMode: "BUS", journey: { durationSeconds: result[0]!.arrival, sections } })).toBe(0);
  });

  it("must leave an internal platform through its directed pathway before using the street", async () => {
    const f = fixture(); f.index.stops[0]!.stopAccess = 0;
    f.index.stops.push({ id: "EXIT", name: "Exit", parentId: "PA", lat: 48.8, lon: 2.3002, locationType: 2 });
    f.index.pathways!.push({ id: "exit", from: 0, to: 4, seconds: 20, mode: 7, bidirectional: false });
    const result = await createFinalLineAccessResolver(f.index)!(f.input);
    expect(result[0]?.arrival).toBe(1100);
    expect(f.matrix.mock.calls[0]?.[0]).toMatchObject({ id: "EXIT" });
    expect(result[0]?.section.finalLineAccess?.pathwayIds).toEqual(["exit", "short-inside"]);
    const reverse = fixture(); reverse.index.stops[0]!.stopAccess = 0;
    reverse.index.stops.push(f.index.stops[4]!);
    reverse.index.pathways!.push({ id: "wrong-direction", from: 4, to: 0, seconds: 20, mode: 1, bidirectional: false });
    const incomplete = await createFinalLineAccessResolver(reverse.index)!(reverse.input);
    expect(incomplete[0]?.section.finalLineAccess?.status).toBe("incomplete");
    expect(reverse.matrix).not.toHaveBeenCalled();
  });

  it("follows multi-edge interior paths and does not invent durations for untimed edges", async () => {
    const f = fixture(); f.index.stops.push({ id: "NODE", name: "Hall", parentId: "PB", locationType: 3 });
    f.index.pathways = [{ id: "first", from: 2, to: 4, seconds: 15, mode: 1, bidirectional: false },
      { id: "second", from: 4, to: 1, seconds: 25, mode: 1, bidirectional: false },
      { id: "untimed", from: 3, to: 1, lengthMeters: 1, mode: 1, bidirectional: false }];
    const result = await createFinalLineAccessResolver(f.index)!(f.input);
    expect(result[0]?.arrival).toBe(1045);
    expect(result[0]?.section.finalLineAccess?.pathwayIds).toEqual(["first", "second"]);
  });

  it("deduplicates concurrent physical pairs and caches them across address changes", async () => {
    const f = fixture(), resolve = createFinalLineAccessResolver(f.index)!;
    await Promise.all([resolve(f.input), resolve({ ...f.input, origin: { lat: 48.9, lon: 2.2 } })]);
    expect(f.matrix).toHaveBeenCalledTimes(1);
    await resolve(f.input); expect(f.matrix).toHaveBeenCalledTimes(1);
  });

  it("overlaps street searches for independent arrivals instead of accumulating network latency", async () => {
    const f = fixture();
    f.index.stops.push({ id: "OTHER_BUS", name: "Other arrival", lat: 48.8001, lon: 2.3, locationType: 0, stopAccess: 1 });
    f.index.transfers.push([4, 1, 400]);
    f.tree.platformLabels.set(4, { ...f.node, arrival: 1050,
      transferOrigin: { stop: 4, arrival: 1050, routeId: "OTHER_FEEDER" },
      section: { ...f.node.section, lineId: "OTHER_FEEDER", toStopPointId: "OTHER_BUS" } });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    f.matrix.mockImplementation(async (_from, targets) => {
      await gate;
      return targets.map(to => ({ id: to.id, provider: "ign-bdtopo", fallback: false,
        durationSeconds: 10, distanceMeters: 10, coordinates: [to] }));
    });
    const pending = createFinalLineAccessResolver(f.index)!(f.input);
    try { await vi.waitFor(() => expect(f.matrix).toHaveBeenCalledTimes(2)); }
    finally { release(); }
    expect(await pending).toHaveLength(2);
  });

  it("groups different target searches from the same street origin into one matrix", async () => {
    const f = fixture();
    f.index.stops.push({ id: "OTHER_RAIL", name: "Other rail", parentId: "PC", lat: 48.8, lon: 2.32, locationType: 0, stopAccess: 0 },
      { id: "E3", name: "Other station entrance", parentId: "PC", lat: 48.8, lon: 2.3004, locationType: 2 });
    f.index.transfers.push([0, 4, 400]);
    f.index.pathways!.push({ id: "other-interior", from: 5, to: 4, seconds: 30, mode: 1, bidirectional: true });
    f.tree.stopsByLine.set("OTHER_TARGET", new Set([4]));
    const resolve = createFinalLineAccessResolver(f.index)!;
    const results = await Promise.all([resolve(f.input), resolve({ ...f.input, lineId: "OTHER_TARGET", stationStops: [4] })]);
    expect(results.map(nodes => nodes[0]!.arrival)).toEqual([1080, 1080]);
    expect(f.matrix).toHaveBeenCalledTimes(1);
    expect(f.matrix.mock.calls[0]![1].map(point => point.id)).toEqual(["E1", "E2", "E3"]);
  });

  it("examines every compatible entrance, splitting street matrices at 64 destinations", async () => {
    const f = fixture(); f.index.stops.splice(2); f.index.pathways = [];
    for (let i = 0; i < 70; i++) {
      f.index.stops.push({ id: `E${i}`, name: `Entrance ${i}`, parentId: "PB", locationType: 2, lat: 48.8, lon: 2.30001 + i / 100000 });
      f.index.pathways.push({ id: `P${i}`, from: i + 2, to: 1, seconds: 100 - i, mode: 1, bidirectional: false });
    }
    f.matrix.mockImplementation(async (_from, targets) => targets.map(to => ({ id: to.id, provider: "ign-bdtopo", fallback: false, durationSeconds: 1, distanceMeters: 1, coordinates: [to] })));
    const result = await createFinalLineAccessResolver(f.index)!(f.input);
    expect(f.matrix.mock.calls.map(call => call[1].length)).toEqual([64, 6]);
    expect(result[0]?.section.finalLineAccess?.entranceIds).toEqual(["E69"]);
  });

  it("does not admit forbidden changes or arrivals that already rode the target line", async () => {
    const f = fixture(), resolve = createFinalLineAccessResolver(f.index)!;
    expect(await resolve({ ...f.input, transferRule: () => -1 })).toEqual([]);
    f.node.previous = { arrival: 0, section: { type: "public_transport", lineId: "TARGET", durationSeconds: 0 } };
    expect(await resolve(f.input)).toEqual([]);
  });

  it("supports cancellation and leaves old artifacts to the compatibility path", async () => {
    const f = fixture(); delete f.index.pedestrianGraphVersion;
    expect(createFinalLineAccessResolver(f.index)).toBeUndefined();
    f.index.pedestrianGraphVersion = 1;
    await expect(createFinalLineAccessResolver(f.index)!({ ...f.input, assertCurrent() { throw new DOMException("obsolete", "AbortError"); } })).rejects.toMatchObject({ name: "AbortError" });
  });
});
