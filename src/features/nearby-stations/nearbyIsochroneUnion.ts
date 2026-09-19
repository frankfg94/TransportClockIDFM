import polygonClipping from "polygon-clipping";
import type { MultiPolygon, Pair } from "polygon-clipping";

import type {
  NearbyIsochroneGeometry,
  NearbyIsochronePosition,
} from "./nearbyIsochrones";

/**
 * Merge contours from several origins into one geometry for a walking
 * threshold. Keeping the boolean operation in WGS84 means the result can be
 * reused by the existing map projection without introducing another canvas
 * or raster layer.
 */
export function mergeNearbyIsochroneGeometries(
  geometries: readonly NearbyIsochroneGeometry[],
): NearbyIsochroneGeometry | undefined {
  const operands = geometries
    .map(toPolygonClippingMultiPolygon)
    .filter((geometry): geometry is MultiPolygon => geometry.length > 0);
  if (operands.length === 0) return undefined;

  try {
    const [first, ...rest] = operands;
    const merged = polygonClipping.union(first!, ...rest);
    if (merged.length === 0) return undefined;
    return merged.length === 1
      ? { type: "Polygon", coordinates: merged[0]! }
      : { type: "MultiPolygon", coordinates: merged };
  } catch {
    // Invalid provider geometry must not bring down the whole city map. The
    // caller can omit this threshold instead of rendering misleading seams.
    return undefined;
  }
}

function toPolygonClippingMultiPolygon(
  geometry: NearbyIsochroneGeometry,
): MultiPolygon {
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
  return polygons.map((polygon) => polygon.map((ring) => ring.map(clonePosition)));
}

function clonePosition(position: NearbyIsochronePosition): Pair {
  return [position[0], position[1]];
}
