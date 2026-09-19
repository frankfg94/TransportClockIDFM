import {
  getCoordinatesDistanceMeters,
} from "../../services/distance";
import type { LonLatPoint } from "../transport-map/geo/coordinateKernel";

export type GlobalMapDistanceMeasurementShape = "segment" | "circle";

export interface GlobalMapDistanceMeasurement {
  start: LonLatPoint;
  end: LonLatPoint;
  shape: GlobalMapDistanceMeasurementShape;
  distanceMeters: number;
}

export interface GlobalMapDistanceMeasurementOverlayItem {
  id: number;
  start: LonLatPoint;
  end: LonLatPoint;
  shape: GlobalMapDistanceMeasurementShape;
  distanceLabel?: string;
  active?: boolean;
}

/**
 * Keep the distance calculation independent from the map renderer and Vue.
 * The UI can therefore update the segment or circle while the pointer moves
 * without coupling the business calculation to a DOM coordinate system. In
 * circle mode, distanceMeters is the radius from the center to the edge.
 */
export function createGlobalMapDistanceMeasurement(
  start: LonLatPoint,
  end: LonLatPoint,
  shape: GlobalMapDistanceMeasurementShape = "segment",
): GlobalMapDistanceMeasurement {
  return {
    start,
    end,
    shape,
    distanceMeters: getCoordinatesDistanceMeters(
      start.lat,
      start.lon,
      end.lat,
      end.lon,
    ),
  };
}
