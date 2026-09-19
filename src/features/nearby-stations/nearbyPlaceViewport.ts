import type { NearbyPlace } from "./nearbyPlaces";
import type { CameraState } from "../transport-map/geo/camera";
import { lonLatToWorld, worldScaleAtZoom } from "../transport-map/geo/coordinateKernel";

/** Immutable source index: projection/sorting happen on data changes, never on pan. */
export function indexNearbyPlaceViewport(places: readonly NearbyPlace[]) {
  return places.map((place, order) => ({ place, order, ...lonLatToWorld(place) }))
    .sort((a, b) => a.x - b.x);
}

export function queryNearbyPlaceViewport(index: ReturnType<typeof indexNearbyPlaceViewport>, camera: CameraState, padding = 0) {
  const scale = worldScaleAtZoom(camera.zoom);
  const halfWidth = camera.viewportWidthCssPx / 2;
  const halfHeight = camera.viewportHeightCssPx / 2;
  const minX = camera.centerWorldX - (halfWidth + padding) / scale;
  const maxX = camera.centerWorldX + (halfWidth + padding) / scale;
  const minY = camera.centerWorldY - (halfHeight + padding) / scale;
  const maxY = camera.centerWorldY + (halfHeight + padding) / scale;
  let low = 0;
  let high = index.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (index[mid]!.x < minX) low = mid + 1;
    else high = mid;
  }
  const visible = [];
  for (let i = low; i < index.length; i++) {
    const item = index[i]!;
    if (item.x > maxX) break;
    if (item.y < minY || item.y > maxY) continue;
    visible.push({ place: item.place, order: item.order, worldX: item.x, worldY: item.y,
      x: (item.x - camera.centerWorldX) * scale + halfWidth,
      y: (item.y - camera.centerWorldY) * scale + halfHeight });
  }
  // Preserve source order for stable stacking and entry animations.
  return visible.sort((a, b) => a.order - b.order);
}
