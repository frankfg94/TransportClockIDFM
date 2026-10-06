import { appendRoundedPolylineToPath } from "../../line-map/lineGeometry";
import type { RoundedPolylineOptions } from "../../line-map/lineGeometry";
import type { GlobalMapMode } from "../contracts/manifest";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../config/globalTransportPlanConfig";
import { lonLatToWorld, worldToLonLat, worldScaleAtZoom } from "../geo/coordinateKernel";

export function createTransportMapPathRoundingOptions(
  activeLine: boolean,
  effectiveLineWidth: number,
  mode?: GlobalMapMode,
): RoundedPolylineOptions {
  const pathRounding = GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.pathRounding;
  const preserveRailCurve = mode === "TRAIN" || mode === "TRANSILIEN";
  const microSegmentLengthMultiplier = activeLine
    ? pathRounding.activeLineMicroSegmentLengthMultiplier
    : preserveRailCurve
      ? pathRounding.railMicroSegmentLengthMultiplier
      : pathRounding.microSegmentLengthMultiplier;

  return {
    minimumPointDistance: activeLine
      ? pathRounding.activeLineMinimumPointDistanceCssPx
      : pathRounding.minimumPointDistanceCssPx,
    minimumCornerSegmentLength: pathRounding.minimumCornerSegmentLengthCssPx,
    maximumCornerRadius: mode === "METRO"
      ? pathRounding.metroMaximumCornerRadiusCssPx
      : pathRounding.maximumCornerRadiusCssPx,
    cornerRadiusRatio: pathRounding.cornerRadiusRatio,
    maximumShortSegmentLength: microSegmentLengthMultiplier > 0
      ? Math.max(
        pathRounding.minimumCornerSegmentLengthCssPx * 4,
        effectiveLineWidth * microSegmentLengthMultiplier,
      )
      : undefined,
    maximumShortSegmentRatio: pathRounding.microSegmentMaxRatio,
  };
}

/** Sample the shared Canvas curves for Deck, without changing source vertex indices. */
export function roundTransportMapPositions(positions: Float64Array, zoom: number, mode?: GlobalMapMode): Float64Array {
  const scale = worldScaleAtZoom(zoom);
  const points = Array.from({ length: positions.length / 2 }, (_, index) => {
    const world = lonLatToWorld({ lon: positions[index * 2]!, lat: positions[index * 2 + 1]! });
    return { x: world.x * scale, y: world.y * scale };
  });
  const output: number[] = [];
  let previous = { x: 0, y: 0 };
  const append = (x: number, y: number) => {
    const point = worldToLonLat({ x: x / scale, y: y / scale });
    output.push(point.lon, point.lat);
    previous = { x, y };
  };
  appendRoundedPolylineToPath({
    moveTo: append,
    lineTo: append,
    quadraticCurveTo: (cx, cy, x, y) => {
      const from = previous;
      for (let step = 1; step <= 8; step += 1) {
        const t = step / 8;
        const u = 1 - t;
        append(u * u * from.x + 2 * u * t * cx + t * t * x,
          u * u * from.y + 2 * u * t * cy + t * t * y);
      }
    },
  }, points, createTransportMapPathRoundingOptions(true, 0, mode));
  if (output.length >= 4) {
    output[0] = positions[0]!;
    output[1] = positions[1]!;
    output[output.length - 2] = positions[positions.length - 2]!;
    output[output.length - 1] = positions[positions.length - 1]!;
  }
  return new Float64Array(output);
}
