import { describe, expect, it } from "vitest";
import type { GlobalMapStation } from "../src/features/transport-map/contracts/manifest";
import { buildStationSpatialIndex } from "../src/features/transport-map/spatial/packedIndex";

const stations: GlobalMapStation[] = Array.from({ length: 32 }, (_, index) => ({
  id: `station:${String(index).padStart(2, "0")}`,
  index,
  name: `Station ${index}`,
  normalizedName: `station ${index}`,
  aliases: [],
  rawRefs: [],
  lineIds: [],
  ownerChunkId: "fixture",
  isHub: false,
  sourceCrs: "EPSG:2154",
  sourceX: 650000 + index,
  sourceY: 6800000 + index,
  lon: 2.3 + index * 0.001,
  lat: 48.8 + index * 0.001,
  worldX: 0.5 + index * 0.001,
  worldY: 0.35 + index * 0.001,
  coordinateSource: "netex",
  transformVersion: "lambert93-ntf-v1",
}));

describe("transport map packed spatial index", () => {
  it("matches a brute-force bounds query and preserves deterministic ids", () => {
    const index = buildStationSpatialIndex(stations);
    const bounds = { minX: 0.505, minY: 0.355, maxX: 0.512, maxY: 0.362 };
    const expected = stations.filter((station) => station.worldX >= bounds.minX && station.worldX <= bounds.maxX && station.worldY >= bounds.minY && station.worldY <= bounds.maxY).map((station) => station.index).sort((a, b) => a - b);
    expect(index.query(bounds).sort((a, b) => a - b)).toEqual(expected);
    expect(index.ids).toEqual([...index.ids].sort());
  });

  it("includes a point exactly on every requested boundary", () => {
    const index = buildStationSpatialIndex(stations);
    const station = stations[7]!;
    expect(index.query({ minX: station.worldX, minY: station.worldY, maxX: station.worldX, maxY: station.worldY })).toContain(station.index);
  });
});
