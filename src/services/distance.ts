const DISTANCE_KM_FORMATTER = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

export function getCoordinatesDistanceKm(
  sourceLatValue: number,
  sourceLonValue: number,
  targetLatValue: number,
  targetLonValue: number,
): number {
  const earthRadiusKm = 6371;
  const sourceLat = toRadians(sourceLatValue);
  const targetLat = toRadians(targetLatValue);
  const deltaLat = toRadians(targetLatValue - sourceLatValue);
  const deltaLon = toRadians(targetLonValue - sourceLonValue);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(sourceLat) * Math.cos(targetLat) * Math.sin(deltaLon / 2) ** 2;

  return (
    2 *
    earthRadiusKm *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function formatTransitDistance(distanceKm: number): string {
  if (distanceKm <= 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }

  return `${DISTANCE_KM_FORMATTER.format(distanceKm)} km`;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
