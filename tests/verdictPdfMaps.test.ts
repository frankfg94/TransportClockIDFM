import type { LineTopology } from "../server/services/topology/types";
import { describe, expect, it } from "vitest";
import type { GlobalMapLine, GlobalMapPath, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";
import type { NeighborhoodScoreResult } from "../src/features/nearby-stations/neighborhood/contracts";
import { boundsAroundPoint, collectVerdictGreenReferences, collectVerdictHeavyAccess, groupVerdictHeavyStations, verdictPdfBusTermini, projectVerdictPdfStation, createRadiusGeometry,
  createVerdictPdfStationFeatures, createVerdictPdfTransitFeatures, createVerdictPdfTransitLegend } from "../src/features/nearby-stations/verdictPdfMaps";
import { buildNearbyNoiseWmsUrl } from "../src/features/nearby-stations/useNearbyNoiseWms";
import { lonLatToWorld } from "../src/features/transport-map/geo/coordinateKernel";

describe("Verdict PDF map data", () => {
  it("collects each cited park or woodland once and skips canopy-wide references", () => {
    const park = { scope: "park", id: "way:100", version: "v1" } as const;
    const woodland = { scope: "woodland", id: "forest:200", lat: 48.8, lon: 2.3, version: "v1" } as const;
    const result = {
      positiveFacts: [{ greenMap: woodland, labelValues: { name: "Bois" } }],
      categories: [{ positiveFacts: [{ greenMap: park, labelValues: { name: "Parc" } }], negativeFacts: [{ greenMap: { ...park, id: "way:999" } }],
        neutralFacts: [{ greenMap: { scope: "commune", code: "92019", version: "v1" } }] }],
    } as unknown as NeighborhoodScoreResult;
    expect(collectVerdictGreenReferences(result)).toEqual([{ reference: park, name: "Parc" }, { reference: woodland, name: "Bois" }]);
  });

  it("lists only termini reachable by boarding the bus at the selected stop", () => {
    const station = { id: "map-stop", name: "Les Coccinelles", rawRefs: ["quay-A"], lat: 48.8, lon: 2.3 } as GlobalMapStation;
    const topology = {
      stations: [
        { id: "a", name: "Les Coccinelles", aliases: ["quay-A"], lat: 48.8, lon: 2.3 },
        { id: "b", name: "Les Coccinelles", lat: 48.8002, lon: 2.3 },
        { id: "c", name: "Gare" },
        { id: "d", name: "Mairie" },
        { id: "z", name: "Autre branche" },
      ],
      patterns: [
        { terminalTo: "c", stops: ["a", "c"], tripCount: 10 },
        { terminalTo: "d", stops: ["b", "d"], tripCount: 4 },
        { terminalTo: "a", stops: ["c", "a"], tripCount: 2 },
        { terminalTo: "z", stops: ["d", "z"], tripCount: 3 },
      ],
    } as LineTopology;
    expect(verdictPdfBusTermini(topology, station)).toEqual(["Gare", "Mairie"]);
  });

  it("groups matching platforms and lines at a hub while preserving each access route in the legend", () => {
    const station = { name: "Massy - Palaiseau", lat: 48.725, lon: 2.26 };
    const line = (id: string) => ({ id }) as GlobalMapLine;
    const base = { station, minutes: 22, via: "T12" };
    const facts = [
      { transportMapAccess: { ...base, lines: [line("C"), line("18")] } },
      { transportMapAccess: { ...base, station: { ...station, name: "Massy-Palaiseau - BV voie 3" }, lines: [line("C"), line("V")] } },
      { transportMapAccess: { ...base, via: "Bus 196", lines: [line("T12")] } },
      { transportMapAccess: { ...base, minutes: 26, lines: [line("T12")] } },
      { transportMapAccess: { ...base, minutes: 27, lines: [line("B")] } },
      { transportMapAccess: { ...base, station: { ...station, name: "Massy-Palaiseau Sud" }, minutes: 23, lines: [line("N")] } },
    ];
    const accesses = collectVerdictHeavyAccess(facts);
    expect(accesses.map(access => access.lines.map(item => item.id))).toEqual([["C", "18", "V"], ["T12"], ["T12"], ["B"], ["N"]]);
    const groups = groupVerdictHeavyStations(accesses);
    expect(groups.map(({ station, minMinutes, maxMinutes, routes, lines }) =>
      [station.name, minMinutes, maxMinutes, routes.length, lines.map(item => item.id)])).toEqual([
      ["Massy-Palaiseau", 22, 26, 3, ["C", "18", "V", "T12"]],
      ["Massy-Palaiseau Sud", 23, 23, 1, ["N"]],
      ["Massy-Palaiseau", 27, 27, 1, ["B"]],
    ]);
  });

  it("places Metro 13 and 15 for Châtillon–Montrouge in one station cell when the walks differ by under five minutes", () => {
    const station = { name: "Châtillon–Montrouge", lat: 48.810, lon: 2.300 };
    const line = (id: string) => ({ id }) as GlobalMapLine;
    const groups = groupVerdictHeavyStations([
      { station, minutes: 18, lines: [line("M13")] },
      { station: { ...station, name: "Chatillon - Montrouge — voie 2" }, minutes: 22, lines: [line("M15")] },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ station: { name: "Châtillon-Montrouge" }, minMinutes: 18, maxMinutes: 22 });
    expect(groups[0]?.lines.map(item => item.id)).toEqual(["M13", "M15"]);
  });

  it("pins a northwestern station to the top edge when its bearing intersects that edge first", () => {
    const point = projectVerdictPdfStation({ x: 180, y: -280 }, { x: 350, y: 450 }, 700, 600);
    expect(point.outside).toBe(true);
    expect(point.anchor.y).toBeCloseTo(12);
    expect(point.anchor.x).toBeCloseTo(248);
    expect(point.angle).toBeLessThan(-90);
    const inside = { x: 50, y: 100 };
    expect(projectVerdictPdfStation(inside, { x: 350, y: 450 }, 700, 600).anchor).toEqual(inside);
  });

  it("builds a 1 km report frame and a closed radius outline around the address", () => {
    const origin = { lon: 2.3, lat: 48.8 };
    const bounds = boundsAroundPoint(origin, 1_000);
    const ring = createRadiusGeometry(origin, 1_000).coordinates[0]!;
    expect(bounds.maxX - bounds.minX).toBeGreaterThan(0);
    expect(bounds.maxY - bounds.minY).toBeGreaterThan(0);
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring.at(-1));
  });

  it("requests the high-resolution Bruitparif WMS image within the service image limit", () => {
    const url = new URL(buildNearbyNoiseWmsUrl(boundsAroundPoint({ lon: 2.3, lat: 48.8 }, 1_000), 4_096, 2_048));
    expect(url.searchParams.get("SERVICE")).toBe("WMS");
    expect(url.searchParams.get("REQUEST")).toBe("GetMap");
    expect(url.searchParams.get("LAYERS")).toBe("CSAB_2024_wCSAB_cl_idf");
    expect(url.searchParams.get("WIDTH")).toBe("2048");
    expect(url.searchParams.get("HEIGHT")).toBe("2048");
    expect(url.searchParams.get("FORMAT")).toBe("image/png");
    expect(url.searchParams.get("BBOX")?.split(",").map(Number).every(Number.isFinite)).toBe(true);
  });

  it("keeps rail and bus paths and stops while excluding bike facilities", () => {
    const start = lonLatToWorld({ lon: 2.29, lat: 48.8 });
    const end = lonLatToWorld({ lon: 2.31, lat: 48.81 });
    const metro = { id: "metro-14", code: "14", label: "M14", mode: "METRO", color: "#6e1e78" } as GlobalMapLine;
    const bike = { id: "bike-1", code: "1", label: "Vélib’", mode: "BIKE", color: "#008f78" } as GlobalMapLine;
    const path = (id: string, lineId: string, vertices = [{ x: start.x, y: start.y }, { x: end.x, y: end.y }]): GlobalMapPath => ({
      id, lineId, geometrySource: "gtfs", sourceVersion: "test", quality: {} as GlobalMapPath["quality"],
      stationIds: [], vertices, minX: Math.min(...vertices.map(vertex => vertex.x)), minY: Math.min(...vertices.map(vertex => vertex.y)),
      maxX: Math.max(...vertices.map(vertex => vertex.x)), maxY: Math.max(...vertices.map(vertex => vertex.y)), chunkIds: [],
    });
    const station = { id: "station-1", lineIds: [metro.id, bike.id], lon: 2.3, lat: 48.805,
      worldX: lonLatToWorld({ lon: 2.3, lat: 48.805 }).x, worldY: lonLatToWorld({ lon: 2.3, lat: 48.805 }).y } as GlobalMapStation;
    const network = {
      lines: [metro, bike], stations: [station], entrances: [], regionalPaths: [path("metro-path", metro.id), path("bike-path", bike.id)],
      pathsById: new Map(), linesById: new Map([[metro.id, metro], [bike.id, bike]]), stationsById: new Map([[station.id, station]]),
      bounds: { minX: start.x, minY: start.y, maxX: end.x, maxY: end.y },
    } as unknown as TransportMapNetwork;
    const paths = createVerdictPdfTransitFeatures(network, [path("metro-path", metro.id)]).features;
    const stops = createVerdictPdfStationFeatures(network).features;
    const legend = createVerdictPdfTransitLegend(network, [
      path("metro-path-a", metro.id), path("metro-path-b", metro.id), path("bike-path", bike.id),
    ]);
    expect(paths).toHaveLength(1);
    expect(paths[0]?.properties.mode).toBe("METRO");
    expect(stops).toHaveLength(1);
    expect(stops[0]?.properties.code).toBe("14");
    expect(legend.map(({ mode, count }) => ({ mode, count }))).toEqual([{ mode: "METRO", count: 1 }]);
  });

  it("uses only detailed viewport paths and never draws regional or schematic fallbacks", () => {
    const start = lonLatToWorld({ lon: 2.29, lat: 48.8 });
    const middle = lonLatToWorld({ lon: 2.30, lat: 48.805 });
    const end = lonLatToWorld({ lon: 2.31, lat: 48.81 });
    const bus = { id: "bus-1", code: "194", label: "194", mode: "BUS", color: "#008f78" } as GlobalMapLine;
    const regional = { id: "regional", lineId: bus.id, geometrySource: "netex-schematic-fallback",
      sourceVersion: "test", quality: {} as GlobalMapPath["quality"], stationIds: [],
      vertices: [{ x: start.x, y: start.y }, { x: end.x, y: end.y }], minX: start.x,
      minY: Math.min(start.y, end.y), maxX: end.x, maxY: Math.max(start.y, end.y), chunkIds: [],
    } as GlobalMapPath;
    const detailed = { ...regional, id: "detailed", geometrySource: "gtfs" as const,
      vertices: [{ x: start.x, y: start.y }, { x: middle.x, y: middle.y }, { x: end.x, y: end.y }],
      minX: Math.min(start.x, middle.x, end.x), minY: Math.min(start.y, middle.y, end.y),
      maxX: Math.max(start.x, middle.x, end.x), maxY: Math.max(start.y, middle.y, end.y),
    };
    const network = {
      lines: [bus], stations: [], entrances: [], regionalPaths: [regional], pathsById: new Map([[regional.id, regional]]),
      linesById: new Map([[bus.id, bus]]), stationsById: new Map(),
      bounds: { minX: start.x, minY: start.y, maxX: end.x, maxY: end.y },
    } as unknown as TransportMapNetwork;

    expect(createVerdictPdfTransitFeatures(network, undefined).features).toHaveLength(0);
    const features = createVerdictPdfTransitFeatures(network, [regional, detailed]).features;
    expect(features).toHaveLength(1);
    expect(features[0]?.geometry.coordinates).toHaveLength(3);
  });
});
