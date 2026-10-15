import { describe, expect, it } from "vitest";
import { buildLineTopologyFromFixture } from "../server/services/topology/buildLineTopology";
import type { LineTopology } from "../server/services/topology/types";
import { resolveTransportSection } from "../src/features/nearby-stations/neighborhood/transportSections";
import { buildTransportFactsContext } from "../src/features/nearby-stations/neighborhood/verdict-transport-facts/context";
import { buildNeighborhoodScore, type NeighborhoodScoreInput } from "../src/features/nearby-stations/neighborhood";
import { getNeighborhoodFactMarker } from "../src/features/nearby-stations/neighborhood/facts";
import { getNearbyHeavyAccessContributionWeight } from "../src/features/nearby-stations/nearbyHeavyTransportRules";
import type { NearbyHeavyTransportCandidate, NearbyJourney } from "../src/features/nearby-stations/nearbyHeavyTransports";
import type { GlobalMapLine, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";

const rail: GlobalMapLine = { id: "line:rail", code: "RAIL", label: "RAIL", mode: "RER", index: 1,
  color: "#000", textColor: "#fff", aliases: [], stationIds: [], geometryIds: [] };

function topology(paths = [["root", "trunk", "fork", "a", "aa"], ["root", "trunk", "fork", "b", "bb"]]): LineTopology {
  return buildLineTopologyFromFixture({ line: { id: rail.id, name: rail.label, shortName: rail.code, mode: rail.mode, aliases: [] },
    stations: [...new Set(paths.flat())].map(id => ({ id, name: id.toUpperCase() })),
    patterns: paths.map((stops, i) => ({ id: String(i), terminalFrom: stops[0]!, terminalTo: stops.at(-1)!, stops, tripCount: 1 })),
  });
}

function candidate(id: string, seconds: number, mode: "TRAM" | "BUS" = "TRAM", targetLine = rail): NearbyHeavyTransportCandidate {
  const station: GlobalMapStation = { id, name: id.toUpperCase(), index: 1, normalizedName: id, aliases: [], rawRefs: [id],
    lineIds: [targetLine.id], ownerChunkId: "fixture", isHub: false, sourceCrs: "EPSG:2154", sourceX: 0, sourceY: 0,
    lon: 2, lat: 48, worldX: 0, worldY: 0, coordinateSource: "gtfs", transformVersion: "lambert93-ntf-v1" };
  const journey: NearbyJourney = { source: "gtfs", durationSeconds: seconds, sections: [
    { type: "walking", durationSeconds: 60, timingSource: "schedule" },
    { type: "public_transport", lineCode: "FEEDER", lineMode: mode, durationSeconds: seconds - 120, toStopPointId: "bus-platform" },
    { type: "transfer", durationSeconds: 60, toStopPointId: id, toName: station.name, timingSource: "schedule" },
  ] };
  const access = { kind: "connection" as const, walkingSeconds: 60, totalSeconds: seconds,
    scoreSeconds: seconds, feederMode: mode, feederLineCode: "FEEDER", journey };
  return { id, station, lines: [targetLine], distanceMeters: 2500, access, accessByLine: { [targetLine.id]: access }, projected: true,
    entry: { id, station: { ...station, memberStationIds: [id] }, memberStations: [station], lines: [targetLine], distanceMeters: 2500, insideRadius: false } };
}

function input(candidates: NearbyHeavyTransportCandidate[], graph: LineTopology | null = topology()): NeighborhoodScoreInput {
  return { places: [], placesLoaded: true, stations: [], stationsLoaded: true, heavyCandidates: candidates,
    lineTopologies: graph ? new Map([[rail.id, graph]]) : undefined };
}

const section = (graph: LineTopology | undefined, id: string) => resolveTransportSection(graph, { id, name: id.toUpperCase() });
const accesses = (value: NeighborhoodScoreInput) => {
  const result = buildNeighborhoodScore(value);
  return [...result.positiveFacts, ...result.neutralFacts].filter(fact => fact.family.startsWith("transport-proximity:"));
};

describe("physical transport access sections", () => {
  it("splits a Y into two branches and a common trunk, counting its fork once", () => {
    const graph = topology();
    expect(section(graph, "a")).toMatchObject({ kind: "branch", label: "AA" });
    expect(section(graph, "b")).toMatchObject({ kind: "branch", label: "BB" });
    expect(section(graph, "trunk")).toMatchObject({ kind: "shared" });
    expect(section(graph, "fork")?.id).toBe(section(graph, "trunk")?.id);
    const facts = accesses(input([candidate("a", 600), candidate("aa", 800), candidate("b", 720), candidate("fork", 900), candidate("trunk", 1000)], graph));
    expect(facts).toHaveLength(3);
    expect(new Set(facts.map(fact => fact.family)).size).toBe(3);
    expect(facts.some(fact => fact.labelValues?.station === "AA")).toBe(false);
    expect(buildTransportFactsContext(input([candidate("a", 600), candidate("aa", 800), candidate("b", 720)], graph))).toMatchObject({ structuralLineWeight: 2, structuralLineCount: 1, accessibleModeWeight: 1 });
  });

  it("keeps stable identities despite segment order, reverse directions, express calls and intermediate termini", () => {
    const graph = topology(), modified = structuredClone(graph);
    modified.segments.reverse().forEach(edge => { [edge.from, edge.to] = [edge.to, edge.from]; });
    modified.patterns.push({ id: "short", terminalFrom: "a", terminalTo: "root", stops: ["a", "fork", "trunk", "root"], tripCount: 999 },
      { id: "express", terminalFrom: "root", terminalTo: "aa", stops: ["root", "aa"], tripCount: 999 });
    expect(section(modified, "a")).toEqual(section(graph, "a"));
    expect(section(modified, "fork")).toEqual(section(graph, "fork"));
  });

  it("uses a distinct junction when more than one common trunk meets", () => {
    const graph = topology([["left", "j1", "middle", "j2", "right"], ["leaf1", "j1"], ["leaf2", "j2"], ["top", "middle"]]);
    expect(section(graph, "middle")).toMatchObject({ id: "junction:middle", kind: "junction" });
  });

  it("groups a simple line and a closed loop as one access", () => {
    for (const graph of [topology([["a", "b", "c"]]), topology([["a", "b", "c", "a"]])]) {
      expect(section(graph, "a")?.kind).toBe("shared");
      expect(section(graph, "a")?.id).toBe(section(graph, "c")?.id);
      expect(accesses(input([candidate("a", 600), candidate("c", 800)], graph))).toHaveLength(1);
    }
  });

  it("uses the final walked-to platform and existing explicit identifier mappings", () => {
    const graph = topology();
    graph.stations.find(station => station.id === "b")!.aliases = ["platform:b"];
    const access = candidate("a", 600);
    access.access.journey!.sections.at(-1)!.toStopPointId = "platform:b";
    access.access.journey!.sections.at(-1)!.toName = "B";
    expect(resolveTransportSection(graph, access.station, access.access.journey)?.id).toBe(section(graph, "b")?.id);
  });

  it("falls back per line without topology and retains ambiguous accesses without adding a branch bonus", () => {
    expect(accesses(input([candidate("a", 600), candidate("b", 800)], null))).toHaveLength(1);
    const graph = topology();
    graph.stations.find(station => station.id === "a")!.aliases = ["ambiguous"];
    graph.stations.find(station => station.id === "b")!.aliases = ["ambiguous"];
    expect(section(graph, "ambiguous")).toMatchObject({ kind: "unclassified" });
    const value = input([candidate("a", 600), candidate("ambiguous", 500)], graph);
    expect(buildTransportFactsContext(value).structuralLineWeight).toBe(1);
    expect(accesses(value).find(fact => fact.transportSection?.kind === "unclassified")).toMatchObject({ polarity: "neutral", contributionWeight: 0 });
  });

  it("suppresses at-address alternatives only on the same section", () => {
    const immediate = candidate("a", 60);
    immediate.entry.insideRadius = true;
    immediate.entry.distanceMeters = 80;
    const value = { ...input([candidate("aa", 900), candidate("b", 1200)]), stations: [immediate.entry] };
    expect(accesses(value).map(fact => fact.transportSection?.label)).toEqual(expect.arrayContaining(["AA", "BB"]));
    expect(accesses(value)).toHaveLength(2);
  });

  it.each([[900, 1, "+"], [901, 0.5, "½+"], [1800, 0.5, "½+"], [1801, 0, "•"]] as const)("scores a bus access of %s seconds correctly", (seconds, weight, marker) => {
    const value = input([candidate("a", seconds, "BUS")]);
    const [fact] = accesses(value);
    expect(fact?.contributionWeight).toBe(weight);
    expect(getNeighborhoodFactMarker(fact!)).toBe(marker);
    expect(buildTransportFactsContext(value).structuralLineWeight).toBe(weight);
  });

  it("adds branch coefficients once, while frequencies and exceptional eligibility stay per line", () => {
    const value = input([candidate("a", 600), candidate("aa", 800), candidate("b", 1200, "BUS"), candidate("trunk", 1300)]);
    value.frequencyProfiles = new Map([[rail.id, { lineId: rail.id, serviceDate: "20261015", source: "gtfs", status: "ready", topologyAvailable: true, branched: true,
      average: { peakMinutes: 4 }, directions: [], sections: [], stationCount: 8, sampledStationCount: 8 }]]);
    const context = buildTransportFactsContext(value);
    expect(context.structuralLineWeight).toBe(2.5);
    expect(context.structuralLineCount).toBe(1);
    expect(context.readyFrequencies).toHaveLength(1);
    expect(context.readyFrequencies[0]?.accessSeconds).toBe(600);
    expect(buildNeighborhoodScore(value).categories.find(category => category.id === "transport")!.score).toBeLessThan(9);
  });

  it("keeps neutral branches and independent long bus options without changing any score component", () => {
    const short = candidate("a", 600), long = candidate("b", 2000, "BUS");
    const before = input([short]), after = input([short, long]);
    const newLine = { ...rail, id: "line:other", code: "OTHER" };
    before.serviceQuality = after.serviceQuality = { schemaVersion: "1.2", generatedAt: "2026-10-15", availableYears: [2025], sources: [], warnings: [],
      lines: [rail, newLine].map((line, index) => ({ lineId: line.id, lineName: line.code, mode: "RER", aliases: [line.code.toLowerCase()],
        reliabilityScore: index ? 10 : 95, weightedValue: index ? 10 : 95, labelKey: "reliable", scoreMethod: "threshold", trend: "stable", trendDelta: 0, yearsUsed: [2025], indicators: [] })) };
    after.heavyCandidates = [...after.heavyCandidates!, candidate("bb", 2100, "BUS", newLine)];
    const a = buildTransportFactsContext(before), b = buildTransportFactsContext(after);
    expect(b.structuralLineWeight).toBe(a.structuralLineWeight);
    expect(b.structuralLineCount).toBe(a.structuralLineCount);
    expect(b.accessibleModeWeight).toBe(a.accessibleModeWeight);
    expect(b.linesByKey.size).toBe(a.linesByKey.size);
    expect(b.readyFrequencies).toEqual(a.readyFrequencies);
    expect(b.serviceQuality).toEqual(a.serviceQuality);
    expect(buildNeighborhoodScore(after).score).toBe(buildNeighborhoodScore(before).score);
    expect(accesses(after).filter(fact => fact.polarity === "neutral")).toHaveLength(2);
    short.accessAlternativesByLine = { [rail.id]: [short.access, { ...long.access, feederLineCode: "OTHER-FEEDER" }] };
    const fact = accesses(input([short]))[0]!;
    expect(fact.travel?.routes?.map(route => route.accessMinutes)).toEqual([10, 34]);
    expect(getNearbyHeavyAccessContributionWeight(long.access)).toBe(0);
  });

  it("rejects a current-line access that already rode the target line", () => {
    const access = candidate("a", 800);
    access.access.journey!.sections.splice(2, 0, { type: "public_transport", lineId: rail.id, lineMode: rail.mode, durationSeconds: 200 });
    expect(accesses(input([access]))).toEqual([]);
  });
  it("keeps estimated final walks neutral and does not replace a documented access with a faster estimate", () => {
    const documented = candidate("a", 900), estimated = candidate("aa", 600);
    estimated.access.journey!.sections.at(-1)!.finalLineAccess = { status: "estimated", entranceIds: ["entrance"] };
    const before = input([documented]), after = input([documented, estimated, candidate("b", 1801, "BUS")]);
    expect(accesses(after).find(fact => fact.transportSection?.label === "AA")?.labelValues?.minutes).toBe(15);
    expect(buildNeighborhoodScore(after).score).toBe(buildNeighborhoodScore(before).score);
    const alone = accesses(input([estimated]))[0]!;
    expect(alone.polarity).toBe("neutral");
    expect(alone.contributionWeight).toBe(0);
    expect(alone.labelValues?.minutes).toBe("≈10");
    expect(alone.evidence.ruleKey).toBe("nearbyStations.neighborhoodScore.rules.transportFinalAccessUnverified");
  });

  it("keeps GPE destinations without masking another branch or promoting a slower station on the covered branch", () => {
    const a = candidate("a", 600), aa = candidate("aa", 800), b = candidate("b", 720);
    aa.station.lon = 2.02; b.station.lon = 2.04;
    const futureLine = { ...rail, id: "line:future", code: "FUTURE", label: "FUTURE", mode: "METRO" as const };
    const otherPlatformLine = { ...rail, id: "line:platform", code: "PLATFORM", label: "PLATFORM", mode: "TRAM" as const };
    const otherPlatform = candidate("other-platform", 1500, "TRAM", otherPlatformLine);
    const future = candidate("hub", 1200, "TRAM", futureLine);
    const project = { id: "project", name: "HUB", line: "FUTURE", lat: 48, lon: 2, coLocatedCurrentLineCodes: [rail.code, otherPlatformLine.code] };
    future.futureProjectsByLine = { [futureLine.id]: project };
    future.coLocatedHeavyLines = [rail, otherPlatformLine];
    future.access.journey!.sections.splice(2, 0, { type: "public_transport", lineId: rail.id, lineCode: rail.code, lineMode: rail.mode, durationSeconds: 200 });
    const value = input([a, aa, b, future, otherPlatform]);
    value.backendVerdict = { schemaVersion: "1.3", generatedAt: "2026-10-15", warnings: [], sources: [], categories: [], futureProjects: [project] };
    const result = buildNeighborhoodScore(value);
    const facts = accesses(value);
    expect(facts.filter(fact => fact.labelValues?.line === "RER RAIL")).toHaveLength(1);
    expect(facts.find(fact => fact.labelValues?.line === "RER RAIL")?.transportSection?.label).toBe("BB");
    expect(result.positiveFacts.filter(fact => fact.kind === "transportHub")).toHaveLength(1);
    expect(result.positiveFacts.find(fact => fact.kind === "transportHub")?.labelValues?.currentLines).toBe("RER RAIL");
    expect(facts.find(fact => fact.labelValues?.line === "Tramway PLATFORM")?.labelValues?.minutes).toBe(25);
    expect(buildTransportFactsContext(value).structuralLineWeight).toBe(4);
  });
});
