const DISTANCE_KM_FORMATTER = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

export function getCoordinatesDistanceKm(
  sourceLatValue: number,
  sourceLonValue: number,
  targetLatValue: number,
  targetLonValue: number,
): number {
  return getCoordinatesDistanceMeters(
    sourceLatValue,
    sourceLonValue,
    targetLatValue,
    targetLonValue,
  ) / 1_000;
}

/** Shared geodesic primitive for V1 line maps and V2 spatial queries. */
export function getCoordinatesDistanceMeters(
  sourceLatValue: number,
  sourceLonValue: number,
  targetLatValue: number,
  targetLonValue: number,
): number {
  const earthRadiusMeters = 6_371_000;
  const sourceLat = toRadians(sourceLatValue);
  const targetLat = toRadians(targetLatValue);
  const deltaLat = toRadians(targetLatValue - sourceLatValue);
  const deltaLon = toRadians(targetLonValue - sourceLonValue);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(sourceLat) * Math.cos(targetLat) * Math.sin(deltaLon / 2) ** 2;

  return (
    2 * earthRadiusMeters * Math.atan2(
      Math.sqrt(haversine),
      Math.sqrt(Math.max(0, 1 - haversine)),
    )
  );
}

export function formatTransitDistanceMeters(distanceMeters: number): string {
  return formatTransitDistance(distanceMeters / 1_000);
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
