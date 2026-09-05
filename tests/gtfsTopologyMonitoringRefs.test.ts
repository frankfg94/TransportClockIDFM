import { describe, expect, it } from "vitest";
import type { GtfsLineArtifact } from "../server/services/gtfs/types";
import { attachGtfsMonitoringRefs } from "../server/services/topology/attachGtfsMonitoringRefs";
import type { LineTopology } from "../server/services/topology/types";

describe("GTFS monitoring refs on NeTEx topology", () => {
  it("keeps direction order while attaching SIRI stop-area refs", () => {
    const topology: LineTopology = {
      line: { id: "line:IDFM:C00001", aliases: [], name: "Test", shortName: "T", mode: "TRAM" },
      stations: [
        { id: "a", name: "A", lat: 48.8, lon: 2.2, degree: 1 },
        { id: "b", name: "B", lat: 48.81, lon: 2.21, degree: 2 },
        { id: "c", name: "C", lat: 48.82, lon: 2.22, degree: 1 },
      ],
      segments: [],
      patterns: [
        { id: "out", terminalFrom: "A", terminalTo: "C", stops: ["a", "b", "c"], tripCount: 1 },
        { id: "back", terminalFrom: "C", terminalTo: "A", stops: ["c", "b", "a"], tripCount: 1 },
      ],
      branches: [],
      loops: [],
      branchPoints: [],
      terminals: ["a", "c"],
    };
    const artifact: GtfsLineArtifact = {
      schemaVersion: 1,
      lineId: "IDFM:C00001",
      routeIds: [],
      labels: ["T"],
      routeTypes: ["0"],
      routeColor: "#000000",
      routeTextColor: "#ffffff",
      shapes: {},
      entrances: [],
      patterns: [
        createGtfsPattern("forward", [
          ["IDFM:100", 2.2, 48.8],
          ["IDFM:200", 2.21, 48.81],
          ["IDFM:300", 2.22, 48.82],
        ]),
        createGtfsPattern("reverse", [
          ["IDFM:301", 2.22, 48.82],
          ["IDFM:201", 2.21, 48.81],
          ["IDFM:101", 2.2, 48.8],
        ]),
      ],
    };

    expect(attachGtfsMonitoringRefs(topology, artifact).patterns).toMatchObject([
      { monitoringRefs: ["STIF:StopArea:SP:100:", "STIF:StopArea:SP:200:", "STIF:StopArea:SP:300:"] },
      { monitoringRefs: ["STIF:StopArea:SP:301:", "STIF:StopArea:SP:201:", "STIF:StopArea:SP:101:"] },
    ]);
  });

  it("uses entrance coordinates when a GTFS pattern has no stop projections", () => {
    const topology: LineTopology = {
      line: { id: "line:IDFM:C00002", aliases: [], name: "Test", shortName: "T", mode: "METRO" },
      stations: [
        { id: "a", name: "A", lat: 48.8, lon: 2.2, degree: 1 },
        { id: "b", name: "B", lat: 48.81, lon: 2.21, degree: 1 },
      ],
      segments: [],
      patterns: [{ id: "out", terminalFrom: "A", terminalTo: "B", stops: ["a", "b"], tripCount: 1 }],
      branches: [],
      loops: [],
      branchPoints: [],
      terminals: ["a", "b"],
    };
    const artifact: GtfsLineArtifact = {
      schemaVersion: 1,
      lineId: "IDFM:C00002",
      routeIds: [],
      labels: ["T"],
      routeTypes: ["1"],
      routeColor: "#000000",
      routeTextColor: "#ffffff",
      shapes: {},
      entrances: [
        { id: "entrance:a", parentStopId: "IDFM:100", name: "A", lon: 2.2, lat: 48.8 },
        { id: "entrance:b", parentStopId: "IDFM:200", name: "B", lon: 2.21, lat: 48.81 },
      ],
      patterns: [{
        id: "gtfs-out",
        stopIds: ["IDFM:100", "IDFM:200"],
        shapeId: "shape",
        shapeDirection: "forward",
        projections: [],
      }],
    };

    expect(attachGtfsMonitoringRefs(topology, artifact).patterns).toMatchObject([{
      monitoringRefs: ["STIF:StopArea:SP:100:", "STIF:StopArea:SP:200:"],
    }]);
  });
});

function createGtfsPattern(
  id: string,
  stops: Array<[string, number, number]>,
): GtfsLineArtifact["patterns"][number] {
  return {
    id,
    stopIds: stops.map(([stopId]) => stopId),
    shapeId: id,
    shapeDirection: "forward",
    projections: stops.map(([stopId, lon, lat], index) => ({
      stopId,
      shapePointIndex: index,
      segmentProgress: 0,
      distanceAlongMeters: index * 1_000,
      errorMeters: 0,
      coordinate: { lon, lat },
    })),
  };
}
