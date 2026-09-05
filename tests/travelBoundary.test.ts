import { describe, expect, it } from "vitest";
import type { GlobalMapLine, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";
import { lonLatToWorld } from "../src/features/transport-map/geo/coordinateKernel";
import { buildStationSpatialIndex } from "../src/features/transport-map/spatial/packedIndex";
import {
  createRouteExitsForStation,
  resolveTravelBoundaryStation,
  selectFastestRouteExit,
} from "../src/features/nearby-stations/travelBoundary";

function station(id: string, name: string, lineIds: string[], lon: number, lat: number): GlobalMapStation {
  return {
    id,
    index: 0,
    name,
    normalizedName: name,
    aliases: [],
    rawRefs: [],
    lineIds,
    ownerChunkId: "chunk",
    isHub: false,
    sourceCrs: "EPSG:2154",
    sourceX: 0,
    sourceY: 0,
    lon,
    lat,
    worldX: 0,
    worldY: 0,
    coordinateSource: "official-open-data",
    transformVersion: "lambert93-ntf-v1",
  };
}

function line(id: string, code: string): GlobalMapLine {
  return {
    id,
    index: 0,
    code,
    label: code,
    mode: "METRO",
    color: "#000",
    textColor: "#fff",
    aliases: [],
    stationIds: [],
    geometryIds: [],
  };
}

function network(stations: GlobalMapStation[], lines: GlobalMapLine[]): TransportMapNetwork {
  return {
    stations,
    lines,
    entrances: [],
    regionalPaths: [],
    pathsById: new Map(),
    linesById: new Map(lines.map((item) => [item.id, item])),
    stationsById: new Map(stations.map((item) => [item.id, item])),
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  };
}

describe("travel boundary station resolver", () => {
  it("requires an exact station name and a matching served line", () => {
    const metro4 = line("line:4", "4");
    const metro13 = line("line:13", "13");
    const target = station("station:target", "Mairie", [metro4.id], 2.2, 48.8);
    const falsePositive = station("station:other", "Mairie", [metro13.id], 2.21, 48.81);
    const resolved = resolveTravelBoundaryStation({
      network: network([target, falsePositive], [metro4, metro13]),
      section: {
        lineCode: "4",
        lineMode: "METRO",
        toName: "Mairie",
        toPoint: { lon: 2.2, lat: 48.8 },
        durationSeconds: 60,
      },
      side: "to",
      fallback: { lon: 2.2, lat: 48.8 },
    });

    expect(resolved?.id).toBe("station:target");
  });

  it("matches provider locality suffixes without broadening homonym matching", () => {
    const metro4 = line("line:4", "4");
    const target = station("station:target", "Etienne Marcel", [metro4.id], 2.2, 48.8);
    const resolved = resolveTravelBoundaryStation({
      network: network([target], [metro4]),
      section: {
        lineCode: "4",
        lineMode: "METRO",
        toName: "Étienne Marcel (Paris)",
        toPoint: { lon: 2.2, lat: 48.8 },
        durationSeconds: 60,
      },
      side: "to",
      fallback: { lon: 2.2, lat: 48.8 },
    });

    expect(resolved?.id).toBe("station:target");
  });

  it("can resolve a named boundary when the provider omits its coordinate", () => {
    const metro4 = line("line:4", "4");
    const target = station("station:target", "Etienne Marcel", [metro4.id], 2.2, 48.8);

    expect(resolveTravelBoundaryStation({
      network: network([target], [metro4]),
      section: {
        lineCode: "4",
        lineMode: "METRO",
        toName: "Étienne Marcel (Paris)",
        durationSeconds: 60,
      },
      side: "to",
    })?.id).toBe("station:target");
  });

  it("returns no station when the coordinate guard rejects a distant same-name station", () => {
    const metro4 = line("line:4", "4");
    const target = station("station:target", "Mairie", [metro4.id], 2.2, 48.8);
    expect(resolveTravelBoundaryStation({
      network: network([target], [metro4]),
      section: { lineCode: "4", lineMode: "METRO", toName: "Mairie", durationSeconds: 60 },
      side: "to",
      fallback: { lon: 2.3, lat: 48.9 },
    })).toBeUndefined();
  });

  it("uses the spatial index to narrow a full catalogue before matching names", () => {
    const metro4 = line("line:4", "4");
    const targetPoint = { lon: 2.2, lat: 48.8 };
    const target = {
      ...station("station:target", "Mairie", [metro4.id], targetPoint.lon, targetPoint.lat),
      ...(() => {
        const world = lonLatToWorld(targetPoint);
        return { worldX: world.x, worldY: world.y };
      })(),
    };
    const distantSameName = {
      ...station("station:other", "Mairie", [metro4.id], 2.21, 48.81),
      index: 1,
      ...(() => {
        const world = lonLatToWorld({ lon: 2.21, lat: 48.81 });
        return { worldX: world.x, worldY: world.y };
      })(),
    };
    const currentNetwork = network([target, distantSameName], [metro4]);

    expect(resolveTravelBoundaryStation({
      network: currentNetwork,
      stationIndex: buildStationSpatialIndex(currentNetwork.stations),
      section: {
        lineCode: "4",
        lineMode: "METRO",
        toName: "Mairie",
        toPoint: targetPoint,
        durationSeconds: 60,
      },
      side: "to",
      fallback: targetPoint,
    })?.id).toBe("station:target");
  });

  it("normalizes and sorts exits once for every route consumer", () => {
    const target = station("station:target", "Mairie", ["line:4"], 2.2, 48.8);
    const currentNetwork = network([target], []);
    currentNetwork.entrances = [
      {
        id: "exit-b",
        stationIndex: 0,
        stationId: target.id,
        name: "Bourse",
        code: "B",
        lon: 2.201,
        lat: 48.801,
        worldX: 0,
        worldY: 0,
      },
      {
        id: "exit-2",
        stationIndex: 0,
        stationId: target.id,
        name: "Centrale",
        code: "2",
        lon: 2.202,
        lat: 48.802,
        worldX: 0,
        worldY: 0,
      },
      {
        id: "exit-a",
        stationIndex: 0,
        stationId: target.id,
        name: "Avenue",
        code: "A",
        lon: 2.203,
        lat: 48.803,
        worldX: 0,
        worldY: 0,
      },
      {
        id: "exit-empty",
        stationIndex: 0,
        stationId: target.id,
        name: " ",
        lon: 2.204,
        lat: 48.804,
        worldX: 0,
        worldY: 0,
      },
    ];

    expect(createRouteExitsForStation(currentNetwork, target.id).map((exit) => exit.code)).toEqual([
      "2",
      "A",
      "B",
    ]);
  });

  it("uses nearby entrance geometry when the resolved station has no direct exits", () => {
    const metro1 = line("line:1", "1");
    const target = station("station:metro", "Château de Vincennes", [metro1.id], 2.438792, 48.844660);
    const nearbyQuay = station("station:nearby-quay", "Avenue du Château", [], 2.437033, 48.844823);
    const currentNetwork = network([target, nearbyQuay], [metro1]);
    currentNetwork.entrances = [{
      id: "exit-1",
      stationIndex: nearbyQuay.index,
      stationId: nearbyQuay.id,
      name: "Avenue de Paris",
      code: "1",
      lon: 2.437033,
      lat: 48.844823,
      worldX: 0,
      worldY: 0,
    }];

    expect(createRouteExitsForStation(currentNetwork, target.id)).toMatchObject([{
      code: "1",
      name: "Avenue de Paris",
    }]);
  });

  it("selects the exit closest to the journey destination", () => {
    const exits = [
      {
        id: "exit-a",
        stationId: "station:target",
        name: "Avenue éloignée",
        code: "1",
        lon: 2.3,
        lat: 48.8,
      },
      {
        id: "exit-b",
        stationId: "station:target",
        name: "Avenue proche",
        code: "2",
        lon: 2.301,
        lat: 48.801,
      },
    ];

    expect(selectFastestRouteExit(exits, { lon: 2.301, lat: 48.801 })?.id).toBe("exit-b");
    expect(selectFastestRouteExit(exits)?.id).toBe("exit-a");
  });
});
