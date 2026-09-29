export interface RealEstateMetricColorStop {
  position: number;
  hex: string;
  rgb: readonly [number, number, number];
}

/** Shared value ramp for the interpolated field, parcel dots, and legend. */
export const REAL_ESTATE_METRIC_COLOR_STOPS: readonly RealEstateMetricColorStop[] = [
  { position: 0, hex: "#55c83b", rgb: [85, 200, 59] },
  { position: 0.25, hex: "#b6df24", rgb: [182, 223, 36] },
  { position: 0.5, hex: "#f4ed20", rgb: [244, 237, 32] },
  { position: 0.75, hex: "#f49a1b", rgb: [244, 154, 27] },
  { position: 1, hex: "#e4483c", rgb: [228, 72, 60] },
];

export const REAL_ESTATE_METRIC_CSS_GRADIENT = `linear-gradient(90deg, ${REAL_ESTATE_METRIC_COLOR_STOPS.map(
  (stop) => `${stop.hex} ${Math.round(stop.position * 100)}%`,
).join(", ")})`;

export const REAL_ESTATE_METRIC_DECK_COLOR_RANGE: [number, number, number, number][] =
  REAL_ESTATE_METRIC_COLOR_STOPS.map(({ rgb }) => [rgb[0], rgb[1], rgb[2], 255]);

export function getRealEstateMetricColor(
  normalizedValue: number | undefined,
  alpha = 238,
): [number, number, number, number] {
  if (normalizedValue === undefined || !Number.isFinite(normalizedValue)) {
    return [71, 85, 105, alpha];
  }

  const value = Math.max(0, Math.min(1, normalizedValue));
  const upperIndex = REAL_ESTATE_METRIC_COLOR_STOPS.findIndex((stop) => stop.position >= value);
  if (upperIndex <= 0) {
    const rgb =
      REAL_ESTATE_METRIC_COLOR_STOPS[
        upperIndex < 0 ? REAL_ESTATE_METRIC_COLOR_STOPS.length - 1 : 0
      ]!.rgb;
    return [rgb[0], rgb[1], rgb[2], alpha];
  }

  const lower = REAL_ESTATE_METRIC_COLOR_STOPS[upperIndex - 1]!;
  const upper = REAL_ESTATE_METRIC_COLOR_STOPS[upperIndex]!;
  const blend = (value - lower.position) / (upper.position - lower.position);
  return [
    Math.round(lower.rgb[0] + (upper.rgb[0] - lower.rgb[0]) * blend),
    Math.round(lower.rgb[1] + (upper.rgb[1] - lower.rgb[1]) * blend),
    Math.round(lower.rgb[2] + (upper.rgb[2] - lower.rgb[2]) * blend),
    alpha,
  ];
}
