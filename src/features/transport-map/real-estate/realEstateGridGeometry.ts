import { DVF_GRID_CELL_SIZE_METERS } from "../../../services/real-estate/compiledRealEstate.js";
import type { DvfMapGridCell } from "../../../services/real-estate/realEstateMapLayer.js";
import {
  lonLatToWorld,
  WEB_MERCATOR_EARTH_RADIUS_METERS,
  worldScaleAtZoom,
  worldUnitsPerMeterAt,
  worldToLonLat,
} from "../geo/coordinateKernel.js";

const WEB_MERCATOR_CIRCUMFERENCE_METERS = 2 * Math.PI * WEB_MERCATOR_EARTH_RADIUS_METERS;
const HALF_CELL_WORLD_UNITS = DVF_GRID_CELL_SIZE_METERS / 2 / WEB_MERCATOR_CIRCUMFERENCE_METERS;

export const DVF_METRIC_INTERPOLATION_RADIUS_METERS = 500;

/** Rebuild the square represented by a compiled cell's Web Mercator centre. */
export function getDvfGridCellPolygon(cell: DvfMapGridCell): [number, number][] {
  const center = lonLatToWorld({ lon: cell.lon, lat: cell.lat });
  return [
    [center.x - HALF_CELL_WORLD_UNITS, center.y - HALF_CELL_WORLD_UNITS],
    [center.x + HALF_CELL_WORLD_UNITS, center.y - HALF_CELL_WORLD_UNITS],
    [center.x + HALF_CELL_WORLD_UNITS, center.y + HALF_CELL_WORLD_UNITS],
    [center.x - HALF_CELL_WORLD_UNITS, center.y + HALF_CELL_WORLD_UNITS],
  ].map((point) => {
    const lonLat = worldToLonLat({ x: point[0], y: point[1] });
    return [lonLat.lon, lonLat.lat] as [number, number];
  });
}

/** Maximum CSS-pixel distance from a cell centre to one of its corners. */
export function getDvfGridCellHalfDiagonalCssPixels(zoom: number): number {
  const halfDiagonalMeters = DVF_GRID_CELL_SIZE_METERS / Math.SQRT2;
  return (halfDiagonalMeters / WEB_MERCATOR_CIRCUMFERENCE_METERS) * worldScaleAtZoom(zoom);
}

/** Convert a local ground distance to its approximate screen radius at latitude. */
export function getDvfMetricInterpolationRadiusCssPixels(zoom: number, latitude: number): number {
  const reference = lonLatToWorld({ lon: 0, lat: latitude });
  return (
    DVF_METRIC_INTERPOLATION_RADIUS_METERS *
    worldUnitsPerMeterAt(reference) *
    worldScaleAtZoom(zoom)
  );
}
