import { describe, expect, it } from "vitest";
import type { IrisDataset, IrisNeighborhood } from "../src/features/transport-map/iris/irisApi";
import {
  boundsForIrisNeighborhoods,
  countIrisTransport,
  countIrisTransportInNeighborhoods,
  groupIrisNeighborhoods,
  scoreIrisNeighborhoodsFromGrid,
  selectIrisNeighborhoodsForPoint,
} from "../src/features/transport-map/iris/irisGeometry";
import { buildIrisNeighborhoodRevealOrder } from "../src/features/transport-map/iris/irisNeighborhoodTransition";

function neighborhood(
  codeIris: string,
  communeCode: string,
  name: string,
  minLon: number,
): IrisNeighborhood {
  return {
    id: `IRIS____${codeIris}`,
    codeIris,
    communeCode,
    communeName: communeCode === "A" ? "Commune A" : "Commune B",
    departmentCode: "92",
    name,
    type: "D",
    centroid: [minLon + 0.005, 48.005],
    geometry: {
      type: "Polygon",
      coordinates: [[[minLon, 48], [minLon + 0.01, 48], [minLon + 0.01, 48.01], [minLon, 48.01], [minLon, 48]]],
    },
  };
}

function dataset(neighborhoods: IrisNeighborhood[]): IrisDataset {
  return {
    schemaVersion: "1.3",
    generatedAt: "2026-09-09T00:00:00.000Z",
    sourceId: "insee-iris",
    bbox: [2, 48, 2.11, 48.01],
    neighborhoods,
    source: {
      id: "insee-iris",
      title: "IRIS fixture",
      producer: "fixture",
      pageUrl: "https://example.test",
      licence: { label: "Fixture", attribution: "Fixture" },
      limitations: [],
    },
    airNoiseSource: {
      id: "air-noise-statistics",
      title: "Air/noise fixture",
      producer: "fixture",
      pageUrl: "https://example.test/air-noise",
      referencePeriod: "2024",
      licence: { label: "Fixture", attribution: "Fixture" },
      limitations: [],
    },
    airNoiseCommunes: {},
  };
}

describe("IRIS neighborhood geometry", () => {
  const neighborhoods = [
    neighborhood("920010001", "A", "A1", 2),
    neighborhood("920010002", "A", "A2", 2.01),
    neighborhood("920020001", "B", "B1", 2.1),
  ];

  it("selects the complete commune containing the origin", () => {
    const selection = selectIrisNeighborhoodsForPoint(dataset(neighborhoods), { lon: 2.005, lat: 48.005 });
    expect(selection.exact).toBe(true);
    expect(selection.communeName).toBe("Commune A");
    expect(selection.neighborhoods.map((item) => item.codeIris)).toEqual(["920010001", "920010002"]);
  });

  it("falls back to the nearest commune when the point is outside the polygons", () => {
    const selection = selectIrisNeighborhoodsForPoint(dataset(neighborhoods), { lon: 2.021, lat: 48.005 });
    expect(selection.exact).toBe(false);
    expect(selection.neighborhoods).toHaveLength(2);
  });

  it("groups Paris arrondissements into the city view", () => {
    const paris = [
      { ...neighborhood("751010001", "75101", "P1", 2), communeName: "Paris 1er Arrondissement" },
      { ...neighborhood("751030001", "75103", "P3", 2.01), communeName: "Paris 3e Arrondissement" },
    ];
    const selection = selectIrisNeighborhoodsForPoint(dataset(paris), { lon: 2.005, lat: 48.005 });
    expect(selection.neighborhoods).toHaveLength(2);
  });

  it("can keep Paris neighborhoods inside the containing arrondissement", () => {
    const paris = [
      { ...neighborhood("751010001", "75101", "P1", 2), communeName: "Paris 1er Arrondissement" },
      { ...neighborhood("751010002", "75101", "P1 bis", 2.01), communeName: "Paris 1er Arrondissement" },
      { ...neighborhood("751030001", "75103", "P3", 2.02), communeName: "Paris 3e Arrondissement" },
    ];
    const selection = selectIrisNeighborhoodsForPoint(
      dataset(paris),
      { lon: 2.005, lat: 48.005 },
      { scope: "commune" },
    );

    expect(selection.neighborhoods.map((item) => item.codeIris)).toEqual(["751010001", "751010002"]);
  });

  it("groups numbered IRIS by prefix without crossing communes", () => {
    const groups = groupIrisNeighborhoods([
      neighborhood("920010101", "A", "Picpus 1", 2),
      neighborhood("920010102", "A", "Picpus 2", 2.01),
      neighborhood("920010103", "A", "Jardin de Bercy", 2.02),
      neighborhood("920020101", "B", "Picpus 1", 2.1),
    ]);

    expect(groups.map((group) => [group.communeCode, group.name, group.neighborhoods.length])).toEqual([
      ["A", "Picpus", 2],
      ["A", "Jardin de Bercy", 1],
      ["B", "Picpus 1", 1],
    ]);
  });

  it("counts unique transport lines per IRIS and mode", () => {
    const counts = countIrisTransport(neighborhoods, [
      { lon: 2.004, lat: 48.004, lineIds: ["metro-1", "bus-1"], lines: [{ id: "metro-1", mode: "METRO" }, { id: "bus-1", mode: "BUS" }] },
      { lon: 2.006, lat: 48.006, lineIds: ["metro-1"], lines: [{ id: "metro-1", mode: "METRO" }] },
      { lon: 2.014, lat: 48.004, lineIds: ["tram-1"], lines: [{ id: "tram-1", mode: "TRAM" }] },
    ]);

    expect(counts.get("IRIS____920010001")).toEqual({
      stationCount: 2,
      lineCount: 2,
      modes: { METRO: 1, BUS: 1 },
      lineIds: ["metro-1", "bus-1"],
    });
    expect(counts.get("IRIS____920010002")).toEqual({
      stationCount: 1,
      lineCount: 1,
      modes: { TRAM: 1 },
      lineIds: ["tram-1"],
    });
    expect(boundsForIrisNeighborhoods(neighborhoods)).toMatchObject({ minX: expect.any(Number), maxX: expect.any(Number) });
  });

  it("counts each line id once across a multi-neighborhood scope", () => {
    const counts = countIrisTransportInNeighborhoods(neighborhoods.slice(0, 2), [
      { lon: 2.004, lat: 48.004, lineIds: ["metro-1", "bus-1"], lines: [{ id: "metro-1", mode: "METRO" }, { id: "bus-1", mode: "BUS" }] },
      { lon: 2.014, lat: 48.004, lineIds: ["metro-1", "tram-1"], lines: [{ id: "metro-1", mode: "METRO" }, { id: "tram-1", mode: "TRAM" }] },
      { lon: 2.104, lat: 48.004, lineIds: ["outside-1"], lines: [{ id: "outside-1", mode: "TRAIN" }] },
    ]);

    expect(counts).toEqual({
      stationCount: 2,
      lineCount: 3,
      modes: { METRO: 1, BUS: 1, TRAM: 1 },
      lineIds: ["metro-1", "bus-1", "tram-1"],
    });
  });

  it("aggregates air and noise classes inside each IRIS polygon", () => {
    const scores = scoreIrisNeighborhoodsFromGrid(neighborhoods.slice(0, 2), {
      bbox: [2, 48, 2.02, 48.01],
      cellSizeDegrees: 0.005,
      columns: 4,
      rows: 2,
      cells: [
        { column: 0, row: 0, value: "11" },
        { column: 1, row: 0, value: "33" },
        { column: 2, row: 0, value: "13" },
        { column: 3, row: 0, value: "22" },
      ],
    });

    expect(scores.get("IRIS____920010001")).toEqual({
      airScore: 5,
      noiseScore: 5,
      dominantClass: "11",
      cellCount: 2,
    });
    expect(scores.get("IRIS____920010002")).toEqual({
      airScore: 2.5,
      noiseScore: 7.5,
      dominantClass: "13",
      cellCount: 2,
    });
  });

  it("reveals the containing neighborhood, then its adjacent waves", () => {
    const chain = [
      neighborhood("920010001", "A", "A1", 2),
      neighborhood("920010002", "A", "A2", 2.01),
      neighborhood("920010003", "A", "A3", 2.02),
      neighborhood("920010004", "A", "A4", 2.1),
    ];

    expect(buildIrisNeighborhoodRevealOrder(chain, { lon: 2.015, lat: 48.005 })).toEqual([
      "IRIS____920010002",
      "IRIS____920010001",
      "IRIS____920010003",
      "IRIS____920010004",
    ]);
  });

  it("supports a cheap distance order for interactive city transitions", () => {
    const chain = [
      neighborhood("920010001", "A", "A1", 2),
      neighborhood("920010002", "A", "A2", 2.01),
      neighborhood("920010003", "A", "A3", 2.02),
    ];

    expect(buildIrisNeighborhoodRevealOrder(chain, { lon: 2.014, lat: 48.005 }, { adjacency: "fast" })).toEqual([
      "IRIS____920010002",
      "IRIS____920010001",
      "IRIS____920010003",
    ]);
  });
});
