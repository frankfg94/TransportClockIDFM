import type { GlobalMapBounds, GlobalMapPath, GlobalMapStation } from "../contracts/manifest.js";

export interface PackedSpatialEntry {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  index: number;
}

export class PackedSpatialIndex {
  readonly ids: string[];
  readonly minX: Float64Array;
  readonly minY: Float64Array;
  readonly maxX: Float64Array;
  readonly maxY: Float64Array;
  readonly indices: Uint32Array;

  constructor(entries: PackedSpatialEntry[]) {
    const sorted = [...entries].sort((left, right) => left.id.localeCompare(right.id));
    this.ids = sorted.map((entry) => entry.id);
    this.minX = Float64Array.from(sorted.map((entry) => entry.minX));
    this.minY = Float64Array.from(sorted.map((entry) => entry.minY));
    this.maxX = Float64Array.from(sorted.map((entry) => entry.maxX));
    this.maxY = Float64Array.from(sorted.map((entry) => entry.maxY));
    this.indices = Uint32Array.from(sorted.map((entry) => entry.index));
  }

  query(bounds: GlobalMapBounds): number[] {
    const results: number[] = [];
    for (let index = 0; index < this.ids.length; index += 1) {
      if (
        this.maxX[index]! < bounds.minX ||
        this.minX[index]! > bounds.maxX ||
        this.maxY[index]! < bounds.minY ||
        this.minY[index]! > bounds.maxY
      ) continue;
      results.push(this.indices[index]!);
    }
    return results;
  }

  get size(): number {
    return this.ids.length;
  }
}

export function buildStationSpatialIndex(stations: GlobalMapStation[]): PackedSpatialIndex {
  return new PackedSpatialIndex(stations.map((station) => ({
    id: station.id,
    minX: station.worldX,
    minY: station.worldY,
    maxX: station.worldX,
    maxY: station.worldY,
    index: station.index,
  })));
}

export function buildPathSpatialIndex(paths: GlobalMapPath[]): PackedSpatialIndex {
  return new PackedSpatialIndex(paths.map((path, index) => ({
    id: path.id,
    minX: path.minX,
    minY: path.minY,
    maxX: path.maxX,
    maxY: path.maxY,
    index,
  })));
}
