import { describe, expect, it } from "vitest";
import type { GlobalMapLine, GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";
import { lonLatToWorld } from "../src/features/transport-map/geo/coordinateKernel";
import {
  buildNearbyStationEntries,
  normalizeNearbyClusterGrouping,
  normalizeNearbyRadius,
  selectionToDashboardTargets,
} from "../src/features/nearby-stations/nearbyStations";

const line = (id: string, code: string): GlobalMapLine => ({
  id,
  index: Number(code),
  code,
  label: code,
  mode: code === "1" ? "METRO" : "BUS",
  color: "#5146ff",
  textColor: "#ffffff",
  aliases: [],
  stationIds: [],
  geometryIds: [],
});

const station = (id: string, name: string, lon: number, lineIds: string[]): GlobalMapStation => {
  const world = lonLatToWorld({ lon, lat: 48.8566 });
  return {
    id,
    index: Number(id.at(-1)),
    name,
    normalizedName: name.toLowerCase(),
    city: "Paris",
    aliases: [],
    rawRefs: [`FR::monomodalStopPlace:${id.at(-1)}:FR1`],
    lineIds,
    ownerChunkId: "fixture",
    isHub: lineIds.length > 1,
    sourceCrs: "EPSG:2154",
    sourceX: 650000,
    sourceY: 6860000,
    lon,
    lat: 48.8566,
    worldX: world.x,
    worldY: world.y,
    coordinateSource: "netex",
    transformVersion: "lambert93-ntf-v1",
  };
};

describe("nearby station selection utilities", () => {
  it("clamps and rounds the interactive radius", () => {
    expect(normalizeNearbyRadius(99)).toBe(200);
    expect(normalizeNearbyRadius(649)).toBe(600);
    expect(normalizeNearbyRadius(651)).toBe(700);
    expect(normalizeNearbyRadius(9_000)).toBe(1_500);
  });

  it("clamps and rounds the station cluster grouping distance", () => {
    expect(normalizeNearbyClusterGrouping(-1)).toBe(0);
    expect(normalizeNearbyClusterGrouping(124)).toBe(100);
    expect(normalizeNearbyClusterGrouping(126)).toBe(150);
    expect(normalizeNearbyClusterGrouping(900)).toBe(500);
  });

  it("groups physical records, keeps the visual margin non-selectable and targets the right member per line", () => {
    const metro = line("line:metro:1", "1");
    const bus = line("line:bus:2", "2");
    const metroMember = station("station:1", "République", 2.3522, [metro.id]);
    const busMember = station("station:2", "République", 2.3523, [bus.id]);
    const marginStation = station("station:3", "Temple", 2.358, [metro.id]);
    metro.stationIds = [metroMember.id, marginStation.id];
    bus.stationIds = [busMember.id];
    const stations = [metroMember, busMember, marginStation];
    const lines = [metro, bus];
    const network: TransportMapNetwork = {
      lines,
      stations,
      entrances: [],
      regionalPaths: [],
      pathsById: new Map(),
      linesById: new Map(lines.map((item) => [item.id, item])),
      stationsById: new Map(stations.map((item) => [item.id, item])),
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    };
    const entries = buildNearbyStationEntries(
      stations.map((item, index) => ({ station: item, distanceMeters: index * 25 })),
      network,
      { lon: 2.3522, lat: 48.8566 },
      250,
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ insideRadius: true });
    expect(entries[0]!.station.memberStationIds).toEqual([metroMember.id, busMember.id]);
    expect(entries[0]!.lines.map((item) => item.id)).toEqual([metro.id, bus.id]);
    expect(entries[1]).toMatchObject({ insideRadius: false });

    const ungroupedEntries = buildNearbyStationEntries(
      stations.map((item, index) => ({ station: item, distanceMeters: index * 25 })),
      network,
      { lon: 2.3522, lat: 48.8566 },
      250,
      { clusterGroupingDistanceMeters: 0 },
    );
    expect(ungroupedEntries).toHaveLength(3);

    const targets = selectionToDashboardTargets(entries, [{
      stationId: entries[0]!.id,
      lineIds: [metro.id, bus.id],
    }]);
    expect(targets.map((target) => [target.station.id, target.line.id])).toEqual([
      [metroMember.id, metro.id],
      [busMember.id, bus.id],
    ]);
  });
});
