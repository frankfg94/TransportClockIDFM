export interface MercatorPoint {
  x: number;
  y: number;
}

export interface GeographicViewport {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface GeographicViewportOptions {
  viewBoxWidth: number;
  viewBoxHeight: number;
  paddingX: number;
  paddingY: number;
  coordinatePadding?: number;
}

export interface TransitCoordinate {
  lon?: number;
  lat?: number;
  projectedX?: number;
  projectedY?: number;
}

const DEFAULT_COORDINATE_PADDING = 0.08;
const LAMBERT93_E = 0.0818191910428158;
const LAMBERT93_N = 0.725607765053267;
const LAMBERT93_C = 11754255.426096;
const LAMBERT93_XS = 700000;
const LAMBERT93_YS = 12655612.049876;
const LAMBERT93_LON0_RAD = (3 * Math.PI) / 180;

export function createGeographicViewport(
  coordinates: TransitCoordinate[],
  options: GeographicViewportOptions,
): GeographicViewport | undefined {
  const points = coordinates.flatMap((coordinate) => {
    const lonLat = resolveTransitLonLat(coordinate);

    return lonLat ? [projectLonLat(lonLat.lon, lonLat.lat)] : [];
  });

  if (points.length < 2) {
    return undefined;
  }

  const paddedBounds = padMercatorBounds({
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  });
  const innerWidth = options.viewBoxWidth - options.paddingX * 2;
  const innerHeight = options.viewBoxHeight - options.paddingY * 2;
  const spanX = Math.max(paddedBounds.maxX - paddedBounds.minX, 0.000001);
  const spanY = Math.max(paddedBounds.maxY - paddedBounds.minY, 0.000001);
  const centerX = (paddedBounds.minX + paddedBounds.maxX) / 2;
  const centerY = (paddedBounds.minY + paddedBounds.maxY) / 2;
  const coordinatePadding =
    options.coordinatePadding ?? DEFAULT_COORDINATE_PADDING;
  const availableX = innerWidth * (1 - coordinatePadding * 2);
  const availableY = innerHeight * (1 - coordinatePadding * 2);
  const scale = Math.min(availableX / spanX, availableY / spanY);
  const visibleWidth = innerWidth / scale;
  const visibleHeight = innerHeight / scale;

  return {
    minX: centerX - visibleWidth / 2,
    maxX: centerX + visibleWidth / 2,
    minY: centerY - visibleHeight / 2,
    maxY: centerY + visibleHeight / 2,
  };
}

export function projectTransitCoordinate(
  coordinate: TransitCoordinate,
  viewport: GeographicViewport,
): { x: number; y: number } | undefined {
  const lonLat = resolveTransitLonLat(coordinate);

  return lonLat
    ? projectMercatorPointToViewport(
        projectLonLat(lonLat.lon, lonLat.lat),
        viewport,
      )
    : undefined;
}

export function projectMercatorPointToViewport(
  point: MercatorPoint,
  viewport: GeographicViewport,
): { x: number; y: number } {
  return {
    x: normalizeCoordinate(point.x, viewport.minX, viewport.maxX),
    y: normalizeCoordinate(point.y, viewport.minY, viewport.maxY),
  };
}

export function resolveTransitLonLat(
  coordinate: TransitCoordinate,
): { lon: number; lat: number } | undefined {
  if (
    typeof coordinate.lon === "number" &&
    Number.isFinite(coordinate.lon) &&
    typeof coordinate.lat === "number" &&
    Number.isFinite(coordinate.lat)
  ) {
    return {
      lon: coordinate.lon,
      lat: coordinate.lat,
    };
  }

  if (
    typeof coordinate.projectedX === "number" &&
    typeof coordinate.projectedY === "number"
  ) {
    return convertLambert93ToWgs84(
      coordinate.projectedX,
      coordinate.projectedY,
    );
  }

  return undefined;
}

export function projectLonLat(lon: number, lat: number): MercatorPoint {
  const boundedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const latRadians = (boundedLat * Math.PI) / 180;

  return {
    x: (lon + 180) / 360,
    y:
      (1 -
        Math.log(Math.tan(latRadians) + 1 / Math.cos(latRadians)) / Math.PI) /
      2,
  };
}

export function convertLambert93ToWgs84(
  x: number,
  y: number,
): { lon: number; lat: number } | undefined {
  if (!isLikelyLambert93Coordinate(x, y)) {
    return undefined;
  }

  const radius = Math.hypot(x - LAMBERT93_XS, y - LAMBERT93_YS);
  const gamma = Math.atan2(x - LAMBERT93_XS, LAMBERT93_YS - y);
  const latIso = -(1 / LAMBERT93_N) * Math.log(radius / LAMBERT93_C);
  const lonRad = LAMBERT93_LON0_RAD + gamma / LAMBERT93_N;
  let latRad = 2 * Math.atan(Math.exp(latIso)) - Math.PI / 2;

  for (let index = 0; index < 6; index += 1) {
    const eSinLat = LAMBERT93_E * Math.sin(latRad);
    latRad =
      2 *
        Math.atan(
          Math.pow((1 + eSinLat) / (1 - eSinLat), LAMBERT93_E / 2) *
            Math.exp(latIso),
        ) -
      Math.PI / 2;
  }

  const lon = (lonRad * 180) / Math.PI;
  const lat = (latRad * 180) / Math.PI;

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return undefined;
  }

  return { lon, lat };
}

function isLikelyLambert93Coordinate(x: number, y: number): boolean {
  return x >= 100000 && x <= 1300000 && y >= 6000000 && y <= 7200000;
}

function padMercatorBounds(bounds: GeographicViewport): GeographicViewport {
  const width = Math.max(bounds.maxX - bounds.minX, 0.000001);
  const height = Math.max(bounds.maxY - bounds.minY, 0.000001);

  return {
    minX: Math.max(0, bounds.minX - width * 0.12),
    maxX: Math.min(1, bounds.maxX + width * 0.12),
    minY: Math.max(0, bounds.minY - height * 0.16),
    maxY: Math.min(1, bounds.maxY + height * 0.16),
  };
}

function normalizeCoordinate(
  value: number,
  minValue: number,
  maxValue: number,
): number {
  const span = maxValue - minValue;

  return span > 0.000001 ? (value - minValue) / span : 0.5;
}
