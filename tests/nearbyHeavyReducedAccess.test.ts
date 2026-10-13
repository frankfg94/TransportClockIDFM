import { describe, expect, it } from "vitest";
import { evaluateNearbyHeavyJourney, getNearbyHeavyAccessContributionWeight } from "../src/features/nearby-stations/nearbyHeavyTransportRules";
import { getNeighborhoodFactMarker } from "../src/features/nearby-stations/neighborhood/facts";
import { buildTransportCategory } from "../src/features/nearby-stations/neighborhood/criteria/transport";
import type { NeighborhoodScoreInput } from "../src/features/nearby-stations/neighborhood/contracts";
import type { GlobalMapLine } from "../src/features/transport-map/contracts/manifest";
import type { NearbyHeavyTransportCandidate } from "../src/features/nearby-stations/nearbyHeavyTransports";

function line(id: string, mode: GlobalMapLine["mode"]): GlobalMapLine {
  return { id, mode, code: id, label: id, index: 1, color: "#123456", textColor: "#fff", aliases: [], stationIds: [], geometryIds: [] };
}
function candidate(target: GlobalMapLine, seconds: number): NearbyHeavyTransportCandidate {
  const access = { kind: "connection" as const, feederMode: "BUS" as const, feederLineCode: "feeder", walkingSeconds: 60, totalSeconds: seconds, scoreSeconds: seconds };
  return { id: target.id, lines: [target], distanceMeters: 3000, access, accessByLine: { [target.id]: access }, projected: true } as NearbyHeavyTransportCandidate;
}
function score(candidates: NearbyHeavyTransportCandidate[]) {
  return buildTransportCategory({ stationsLoaded: true, stations: [], heavyCandidates: candidates, places: [], placesLoaded: false } as NeighborhoodScoreInput);
}
describe("reduced bus station access", () => {
  it.each([[900, 1], [901, 0.5], [1620, 0.5], [1800, 0.5], [1801, 0]])("assigns the common contribution at %i seconds", (seconds, weight) => {
    expect(getNearbyHeavyAccessContributionWeight({ totalSeconds: seconds, feederMode: "BUS" })).toBe(weight);
  });
  it("uses GTFS scoring time rather than the initial wait, and leaves rail/tram weight unchanged", () => {
    expect(getNearbyHeavyAccessContributionWeight({ totalSeconds: 2000, scoreSeconds: 900, feederMode: "BUS" })).toBe(1);
    expect(getNearbyHeavyAccessContributionWeight({ totalSeconds: 1620, feederMode: "TRAM" })).toBe(1);
  });
  it("retains one-bus routes at 27 minutes for every heavy target, without accepting routes beyond 30 minutes", () => {
    const resolve = (ride: number) => evaluateNearbyHeavyJourney({ stationDistanceMeters: 3500, localLineCodes: new Set(["generic-feeder"]),
      journey: { source: "gtfs", durationSeconds: 600 + ride, sections: [{ type: "walking", durationSeconds: 600 }, { type: "public_transport", mode: "bus", lineMode: "BUS", lineCode: "generic-feeder", durationSeconds: ride }] } });
    expect(resolve(1020)).toMatchObject({ scoreSeconds: 1620, feederMode: "BUS" });
    expect(resolve(1260)).toBeUndefined();
  });
  it("adds exactly half the marginal line/mode bonus while retaining a positive fact and its marker", () => {
    const existing = candidate(line("existing", "RER"), 600);
    const additional = line("additional", "TRANSILIEN");
    const baseline = score([existing]);
    const full = score([existing, candidate(additional, 840)]);
    const reduced = score([existing, candidate(additional, 1620)]);
    expect(reduced.score! - baseline.score!).toBeCloseTo((full.score! - baseline.score!) / 2, 8);
    const fact = reduced.positiveFacts.find(f => f.labelValues?.line === "Transilien additional")!;
    expect(fact.contributionWeight).toBe(0.5);
    expect(getNeighborhoodFactMarker(fact)).toBe("½+");
    expect(fact.evidence.ruleKey).toBe("nearbyStations.neighborhoodScore.rules.transportBusReduced");
    expect(getNeighborhoodFactMarker(full.positiveFacts.find(f => f.labelValues?.line === "Transilien additional")!)).toBe("+");
  });
  it("keeps feeder alternatives from different stations of the same heavy line", () => {
    const target = line("shared-heavy", "RER");
    const accessCandidate = (bus: string, seconds: number) => {
      const c = candidate(target, seconds);
      const access = { ...c.access, feederLineCode: bus, journey: { source: "gtfs" as const, durationSeconds: seconds,
        sections: [{ type: "walking", durationSeconds: 60 }, { type: "public_transport", lineMode: "BUS" as const, lineCode: bus, durationSeconds: seconds - 60 }] } };
      return { ...c, id: bus, access, accessByLine: { [target.id]: access }, accessAlternativesByLine: { [target.id]: [access] } };
    };
    const result = score([accessCandidate("short", 840), accessCandidate("long", 1769)]);
    const fact = result.positiveFacts.find(f => f.labelValues?.line === "RER shared-heavy")!;
    expect(fact.travel?.routes?.map(route => route.line)).toEqual(["BUS short", "BUS long"]);
    expect(fact.travel?.routes?.map(route => route.accessMinutes)).toEqual([14, 30]);
    expect(fact.labelValues?.minutes).toBe(14);
  });
});
