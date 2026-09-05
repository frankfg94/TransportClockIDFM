import {
  getCoordinatesDistanceMeters,
} from "../../services/distance";
import type { LonLatPoint } from "../transport-map/geo/coordinateKernel";

export interface GlobalMapDistanceMeasurement {
  start: LonLatPoint;
  end: LonLatPoint;
  distanceMeters: number;
}

/**
 * Keep the distance calculation independent from the map renderer and Vue.
 * The UI can therefore update the segment while the pointer moves without
 * coupling the business calculation to a DOM coordinate system.
 */
export function createGlobalMapDistanceMeasurement(
  start: LonLatPoint,
  end: LonLatPoint,
): GlobalMapDistanceMeasurement {
  return {
    start,
    end,
    distanceMeters: getCoordinatesDistanceMeters(
      start.lat,
      start.lon,
      end.lat,
      end.lon,
    ),
  };
}

