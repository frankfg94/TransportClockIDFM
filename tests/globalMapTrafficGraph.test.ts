import { describe, expect, it } from "vitest";
import { createGlobalMapTrafficGraph } from "../src/features/line-map/globalMapTrafficGraph";
import type {
  GlobalMapLine,
  GlobalMapPath,
  GlobalMapStation,
} from "../src/features/transport-map/contracts/manifest";

const station = (id: string, name: string): GlobalMapStation => ({
  id,
  index: 0,
  name,
  normalizedName: name.toLowerCase(),
  aliases: [],
  rawRefs: [],
  lineIds: ["line:metro:1"],
  ownerChunkId: "chunk:0",
  isHub: false,
  sourceCrs: "EPSG:2154",
  sourceX: 0,
  sourceY: 0,
  lon: 0,
  lat: 0,
  worldX: 0,
  worldY: 0,
  coordinateSource: "netex",
  transformVersion: "lambert93-ntf-v1",
});

const line: GlobalMapLine = {
  id: "line:metro:1",
  index: 0,
  code: "1",
  label: "1",
  mode: "METRO",
  color: "#f00",
  textColor: "#fff",
  aliases: [],
  stationIds: ["station:a", "station:b", "station:c"],
  geometryIds: ["path:1"],
};

const path: GlobalMapPath = {
  id: "path:1",
  lineId: line.id,
  geometrySource: "gtfs",
  sourceVersion: "fixture",
  quality: { complete: true, fallback: false, gapMeters: 0, stationDistanceMaxMeters: 0 },
  stationIds: ["station:a", "station:b", "station:c"],
  vertices: [
    { stationId: "station:a", x: 0, y: 0 },
    { stationId: "station:b", x: 1, y: 0 },
    { stationId: "station:c", x: 2, y: 0 },
  ],
  minX: 0,
  minY: 0,
  maxX: 2,
  maxY: 0,
  chunkIds: [],
};

describe("createGlobalMapTrafficGraph", () => {
  it("builds a deduplicated route graph and marks terminal stations", () => {
    const graph = createGlobalMapTrafficGraph(
      line,
      [station("station:a", "A"), station("station:b", "B"), station("station:c", "C")],
      [path],
    );

    expect(graph.edges).toHaveLength(2);
    expect(graph.edges.map(({ source, target }) => [source, target])).toEqual([
      ["station:a", "station:b"],
      ["station:b", "station:c"],
    ]);
    expect(graph.stations.map(({ key, branchEnd }) => [key, branchEnd])).toEqual([
      ["station:a", true],
      ["station:b", false],
      ["station:c", true],
    ]);
  });

  it("recovers station edges from vertex anchors when stationIds are absent", () => {
    const graph = createGlobalMapTrafficGraph(line, [], [{
      ...path,
      stationIds: [],
    }]);

    expect(graph.edges).toHaveLength(2);
    expect(graph.stations.map((item) => item.key)).toEqual([
      "station:a",
      "station:b",
      "station:c",
    ]);
  });
});
