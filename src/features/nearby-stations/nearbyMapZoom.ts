export const NEARBY_NOISE_DETAIL_MIN_ZOOM_PERCENT = 300;

export function nearbyMapZoomPercent(cameraZoom: number, referenceZoom: number): number {
  return Math.round((2 ** (cameraZoom - referenceZoom)) * 100);
}

export function isNearbyNoiseDetailZoomActive(cameraZoom: number, referenceZoom: number): boolean {
  return nearbyMapZoomPercent(cameraZoom, referenceZoom) >= NEARBY_NOISE_DETAIL_MIN_ZOOM_PERCENT;
}
