import { describe, expect, it } from "vitest";
import { scanConnections, routingSections, type RoutingConnection, type RoutingNode } from "../shared/gtfs/connectionScan";
import { listTransportAccessSignals, makeTransportAccessFact } from "../src/features/nearby-stations/neighborhood/transportAccess";
import { analyzeNearbyJourneyTiming } from "../src/features/nearby-stations/nearbyJourneyTiming";
import type { GlobalMapLine } from "../src/features/transport-map/contracts/manifest";
import type { NeighborhoodScoreInput } from "../src/features/nearby-stations/neighborhood/contracts";
import type { NearbyHeavyTransportAccess, NearbyJourney } from "../src/features/nearby-stations/nearbyHeavyTransports";

const bus = (line: string, dep: number, arr: number, from = 0, to = 1, last = true): RoutingConnection => ({
  from, to, departure: dep, arrival: arr, tripKey: line, routeId: line, pickup: 0, dropOff: 0, last,
  section: { type: "public_transport", lineMode: "BUS", lineId: line, lineCode: line, vehicleJourneyId: line, durationSeconds: arr - dep },
});
async function* stream(values: RoutingConnection[]) { yield values; }
const seed = (seconds = 600) => new Map<number, RoutingNode>([[0, {
  arrival: seconds, walkingSeconds: seconds, section: { type: "walking", durationSeconds: seconds },
}]]);

describe("shared direct bus alternatives", () => {
  it("retains a later arriving but faster bus in the same scan without expanding transfer contexts", async () => {
    const values = [bus("ordinary", 720, 1620), bus("express", 960, 1740)];
    const result = await scanConnections(stream(values), seed(), new Map());
    expect(result.platformLabels.get(1)?.section.lineId).toBe("ordinary");
    expect([...result.feederLabels.get(1)!.keys()]).toEqual(["ordinary", "express"]);
    const times = [...result.feederLabels.get(1)!.values()].map(node => {
      const timing = analyzeNearbyJourneyTiming({ durationSeconds: node.arrival, sections: routingSections(node) });
      return timing.scoreSeconds;
    });
    expect(times).toEqual([1500, 1380]);
    expect(result.scannedConnections).toBe(values.length);
  });
  it("keeps first service per line and respects the walking/travel and drop-off limits", async () => {
    const later = { ...bus("ordinary", 1800, 1860), tripKey: "ordinary-later" };
    const forbidden = { ...bus("no-drop-off", 960, 1080), dropOff: 1 };
    const result = await scanConnections(stream([bus("ordinary", 720, 1620), forbidden, bus("too-long", 1000, 2300), later]), seed(), new Map(), new Map(), undefined, undefined,
      { feederWalkingSeconds: 900, feederTravelSeconds: 1800 });
    expect([...result.feederLabels.get(1)!.keys()]).toEqual(["ordinary"]);
    expect(result.feederLabels.get(1)!.get("ordinary")!.arrival).toBe(1620);
    const longWalk = await scanConnections(stream([bus("bus", 1000, 1100)]), seed(901), new Map(), new Map(), undefined, undefined,
      { feederWalkingSeconds: 900, feederTravelSeconds: 1800 });
    expect(longWalk.feederLabels.size).toBe(0);
  });
  it("can board the same vehicle at a closer downstream stop and keeps only one bus leg", async () => {
    const access = seed(600);
    access.set(1, { arrival: 180, walkingSeconds: 180, section: { type: "walking", durationSeconds: 180 } });
    const result = await scanConnections(stream([bus("bus", 720, 900, 0, 1, false), bus("bus", 960, 1200, 1, 2)]), access, new Map());
    const sections = routingSections(result.feederLabels.get(2)!.get("bus")!);
    expect(sections.filter(s => s.type === "public_transport")).toHaveLength(1);
    expect(sections.find(s => s.type === "walking")!.durationSeconds).toBe(180);
    expect(sections.find(s => s.type === "public_transport")!.durationSeconds).toBe(240);
  });
});

const target: GlobalMapLine = { id: "target", code: "target", label: "A", mode: "RER", index: 1, color: "#123456", textColor: "#fff", aliases: [], stationIds: [], geometryIds: [] };
function access(line: string, seconds: number): NearbyHeavyTransportAccess {
  const journey: NearbyJourney = { source: "gtfs", durationSeconds: seconds + 120, sections: [
    { type: "walking", durationSeconds: 600 }, { type: "waiting", durationSeconds: 120 },
    { type: "public_transport", lineMode: "BUS", lineCode: line, durationSeconds: seconds - 600 },
  ] };
  return { kind: "connection", feederMode: "BUS", feederLineCode: line, walkingSeconds: 600, totalSeconds: seconds + 120, scoreSeconds: seconds, journey };
}
describe("transport access choice facts", () => {
  it("lists unique bus choices with separate durations and keeps one weighted signal for the heavy line", () => {
    const fast = access("express", 1380), slow = access("ordinary", 1500);
    const signals = listTransportAccessSignals({ stations: [], heavyCandidates: [{
      lines: [target], access: fast, accessByLine: { target: fast }, distanceMeters: 3500,
      accessAlternativesByLine: { target: [fast, slow, access("ordinary", 1620), access("too-long", 1860)] },
    }] } as unknown as NeighborhoodScoreInput);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.minutes).toBe(23);
    expect(signals[0]!.contributionWeight).toBe(0.5);
    const fact = makeTransportAccessFact(signals[0]!);
    expect(fact.labelValues?.via).toBe(" via BUS express, BUS ordinary");
    expect(fact.tooltipValues?.via).toBe(" via BUS express");
    expect(fact.travel?.routes?.map(r => [r.line, r.accessMinutes])).toEqual([["BUS express", 23], ["BUS ordinary", 25]]);
  });
});
