import { describe, expect, it } from "vitest";
import { createFutureGpeProjectFilter, reconcileFutureGpeVerdict } from "../src/features/nearby-stations/futureGpeProjects";
import type { PublicFutureGpeStation, PublicNeighborhoodVerdict, PublicVerdictEvidence } from "../src/features/nearby-stations/neighborhoodVerdictApi";
import type { GlobalMapLine, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";

function project(line = "14", name = "Pont Cardinet"): PublicFutureGpeStation {
  return { id: line + ":" + name, name, line, lon: 2.314, lat: 48.891, walkingMinutes: 3, projectStatus: "under-construction" };
}
function network(code = "14", mode: GlobalMapLine["mode"] = "METRO"): TransportMapNetwork {
  const station: GlobalMapStation = { id: "station", index: 0, name: "Pont Cardinet", aliases: ["Pont-Cardinét"], normalizedName: "pont cardinet", rawRefs: [],
    lineIds: ["line"], ownerChunkId: "test", isHub: true, sourceCrs: "EPSG:2154", sourceX: 0, sourceY: 0, lon: 2.314, lat: 48.891,
    worldX: 0, worldY: 0, coordinateSource: "gtfs", transformVersion: "lambert93-ntf-v1" };
  const line: GlobalMapLine = { id: "line", index: 0, code, label: "Métro " + code, mode, color: "#000", textColor: "#fff", aliases: [], stationIds: [station.id], geometryIds: [] };
  return { lines: [line], stations: [station], entrances: [], regionalPaths: [], pathsById: new Map(), linesById: new Map([[line.id, line]]),
    stationsById: new Map([[station.id, station]]), bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } };
}
function verdict(projects: PublicFutureGpeStation[]): PublicNeighborhoodVerdict {
  const facts: PublicVerdictEvidence[] = projects.map(p => ({ id: "gpe-" + p.id, category: "transport", polarity: "positive", family: "future-gpe", priority: 9,
    label: "Future gare " + p.name, explanation: "Projet", rule: "bonus plafonné", proof: "direct", observedAt: "2026-10-23", sourceIds: [] }));
  return { schemaVersion: "1.3", generatedAt: "2026-10-23", futureProjects: projects, sources: [], warnings: [],
    categories: [{ id: "transport", status: "available", scoreDelta: 1, positiveFacts: facts, negativeFacts: [], neutralFacts: [], limitations: [] }] };
}

describe("future GPE reconciliation against the current metro catalogue", () => {
  it("removes an obsolete project only for an existing station on the same metro line", () => {
    expect(createFutureGpeProjectFilter(network())(project())).toBe(false);
    expect(createFutureGpeProjectFilter(network("13"))(project())).toBe(true);
    expect(createFutureGpeProjectFilter(network("114"))(project())).toBe(true);
    expect(createFutureGpeProjectFilter(network("14", "TRAIN"))(project())).toBe(true);
  });
  it.each(["15", "16", "17", "18"])("retains line %s projects at current metro interchanges", code => {
    expect(createFutureGpeProjectFilter(network())(project(code))).toBe(true);
  });
  it("works for any newly opened line and preserves its unopened extension", () => {
    const isFuture = createFutureGpeProjectFilter(network("42"));
    expect(isFuture(project("42"))).toBe(false);
    expect(isFuture(project("42", "Nouvelle station"))).toBe(true);
  });
  it("matches normalized names and aliases without accepting unrelated or distant namesakes", () => {
    const current = network("M14");
    current.stations[0]!.aliases.push("Cardinet – Batignolles");
    const isFuture = createFutureGpeProjectFilter(current);
    expect(isFuture(project("Métro 14", "PONT-CARDINÉT"))).toBe(false);
    expect(isFuture(project("14", "Cardinet Batignolles"))).toBe(false);
    expect(isFuture(project("14", "Pont"))).toBe(true);
    expect(isFuture({ ...project(), lat: 48.95 })).toBe(true);
  });
  it("resolves a technical line code through its public label or aliases", () => {
    const current = network("C01384");
    current.lines[0]!.label = "14";
    expect(createFutureGpeProjectFilter(current)(project())).toBe(false);
    current.lines[0]!.label = "Technical metro name";
    current.lines[0]!.aliases = ["Métro 14"];
    expect(createFutureGpeProjectFilter(current)(project())).toBe(false);
  });
  it("uses line station membership as well as station line membership", () => {
    const current = network();
    current.stations[0]!.lineIds = [];
    expect(createFutureGpeProjectFilter(current)(project())).toBe(false);
    current.stations[0]!.lineIds = ["line"];
    current.lines[0]!.stationIds = [];
    expect(createFutureGpeProjectFilter(current)(project())).toBe(false);
  });
  it("preserves unknown projects until the catalogue arrives and respects explicit open status", () => {
    expect(createFutureGpeProjectFilter(undefined)(project())).toBe(true);
    expect(createFutureGpeProjectFilter(undefined)({ ...project(), projectStatus: "open" })).toBe(false);
  });
  it("removes the obsolete documentary fact and bonus without mutating the response", () => {
    const original = verdict([project()]);
    const result = reconcileFutureGpeVerdict(original, createFutureGpeProjectFilter(network()));
    expect(result?.futureProjects).toEqual([]);
    expect(result?.categories[0]).toMatchObject({ positiveFacts: [], scoreDelta: 0 });
    expect(original.futureProjects).toHaveLength(1);
    expect(original.categories[0]?.positiveFacts).toHaveLength(1);
    expect(original.categories[0]?.scoreDelta).toBe(1);
  });
  it("retains other future lines and their capped bonus at the same interchange", () => {
    const future = project("15");
    const original = verdict([project(), future]);
    const result = reconcileFutureGpeVerdict(original, createFutureGpeProjectFilter(network()));
    expect(result?.futureProjects).toEqual([future]);
    expect(result?.categories[0]?.positiveFacts.map(fact => fact.id)).toEqual(["gpe-" + future.id]);
    expect(result?.categories[0]?.scoreDelta).toBe(1);
  });
});
