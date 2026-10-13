import { pointInIrisGeometry } from "../../../src/features/transport-map/iris/irisGeometry";
import type { CompiledIrisData, CompiledIrisNeighborhood } from "./contracts";

// The compiled artifact is immutable and replaced on a new generation/ETag.
// Bounds are shared by all points; no address-specific result is cached.
const boundsByDataset = new WeakMap<CompiledIrisData, Float64Array>();
function boundsFor(data: CompiledIrisData): Float64Array {
  const cached = boundsByDataset.get(data);
  if (cached) return cached;
  const bounds = new Float64Array(data.neighborhoods.length * 4);
  data.neighborhoods.forEach((neighborhood, index) => {
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity, invalid = false;
    const polygons = neighborhood.geometry.type === "Polygon" ? [neighborhood.geometry.coordinates] : neighborhood.geometry.coordinates;
    for (const polygon of polygons) for (const ring of polygon) for (const [lon, lat] of ring) {
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) { invalid = true; continue; }
      minLon = Math.min(minLon, lon!); minLat = Math.min(minLat, lat!);
      maxLon = Math.max(maxLon, lon!); maxLat = Math.max(maxLat, lat!);
    }
    // Invalid geometry still follows the existing exact predicate.
    bounds.set(invalid ? [-Infinity,-Infinity,Infinity,Infinity] : [minLon,minLat,maxLon,maxLat], index * 4);
  });
  boundsByDataset.set(data, bounds);
  return bounds;
}
export function findPointIrisNeighborhoods(data: CompiledIrisData, point: { lon: number; lat: number }): CompiledIrisNeighborhood[] {
  const bounds = boundsFor(data);
  return data.neighborhoods.filter((neighborhood, index) => {
    const offset = index * 4;
    return point.lon >= bounds[offset]! && point.lat >= bounds[offset+1]! && point.lon <= bounds[offset+2]! && point.lat <= bounds[offset+3]!
      && pointInIrisGeometry(point, neighborhood.geometry);
  });
}
