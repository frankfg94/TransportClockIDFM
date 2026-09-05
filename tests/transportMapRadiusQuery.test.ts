import { describe, expect, it } from "vitest";
import type { GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import { lonLatToWorld } from "../src/features/transport-map/geo/coordinateKernel";
import { queryStationsWithinRadius } from "../src/features/transport-map/spatial/radiusQuery";
import { buildStationSpatialIndex } from "../src/features/transport-map/spatial/packedIndex";

const station = (id: string, lon: number, lat: number): GlobalMapStation => ({
  id,
  index: Number(id.slice(-1)),
  name: id,
  normalizedName: id,
  aliases: [],
  rawRefs: [],
  lineIds: [],
  ownerChunkId: "fixture",
  isHub: false,
  sourceCrs: "EPSG:2154",
  sourceX: 650000,
  sourceY: 6800000,
  lon,
  lat,
  worldX: lonLatToWorld({ lon, lat }).x,
  worldY: lonLatToWorld({ lon, lat }).y,
  coordinateSource: "netex",
  transformVersion: "lambert93-ntf-v1",
});

describe("transport map WGS84 radius query", () => {
  it("uses geodesic distance, deterministic ties and pagination", () => {
    const stations = [station("station:0", 2.3522, 48.8566), station("station:1", 2.353, 48.8566), station("station:2", 2.36, 48.8566)];
    const result = queryStationsWithinRadius(stations, { lon: 2.3522, lat: 48.8566 }, 1_000, 2);
    expect(result.map((item) => item.station.id)).toEqual(["station:0", "station:1"]);
    expect(result[0]!.distanceMeters).toBe(0);
    expect(queryStationsWithinRadius(stations, { lon: 2.3522, lat: 48.8566 }, 1_000, 1, 1).map((item) => item.station.id)).toEqual(["station:1"]);
    expect(queryStationsWithinRadius(stations, { lon: 2.3522, lat: 48.8566 }, 1_000, 2, 0, buildStationSpatialIndex(stations))).toEqual(result);
  });

  it("rejects invalid radius and points", () => {
    expect(() => queryStationsWithinRadius([], { lon: 0, lat: 0 }, -1)).toThrow();
    expect(() => queryStationsWithinRadius([], { lon: Number.NaN, lat: 0 }, 100)).toThrow();
  });
});
