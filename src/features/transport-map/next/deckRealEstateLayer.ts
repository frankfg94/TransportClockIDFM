import { COORDINATE_SYSTEM, type Layer } from "@deck.gl/core";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { DvfMapGridCell } from "../../../services/real-estate/realEstateMapLayer";

export const REAL_ESTATE_PRICE_LAYER_ID = "real-estate-price-heatmap";
export const REAL_ESTATE_HIT_LAYER_ID = "real-estate-price-hit-targets";

export interface DvfMapPriceRange {
  low: number;
  high: number;
}

const PRICE_COLORS = [
  [22, 163, 74, 238],
  [132, 204, 22, 238],
  [250, 204, 21, 238],
  [249, 115, 22, 238],
  [220, 38, 38, 238],
  [127, 29, 29, 245],
] as const;

/** Use robust tails so a few exceptional sales do not flatten the regional contrast. */
export function getDvfMapPriceRange(cells: readonly DvfMapGridCell[]): DvfMapPriceRange {
  const prices = cells.map((cell) => cell.medianPriceM2).filter(Number.isFinite).sort((a, b) => a - b);
  if (!prices.length) return { low: 0, high: 1 };
  return {
    low: quantile(prices, 0.04),
    high: quantile(prices, 0.96),
  };
}

/**
 * The visible layer is deck.gl's GPU Gaussian KDE. MEAN aggregation keeps
 * color tied to €/m² instead of transaction density; a transparent GPU point
 * layer preserves exact per-cell hover values.
 */
export function createDeckRealEstatePriceLayers(
  cells: readonly DvfMapGridCell[],
  range: DvfMapPriceRange,
  radiusPixels = 28,
): Layer[] {
  return [
    new HeatmapLayer<DvfMapGridCell>({
      id: REAL_ESTATE_PRICE_LAYER_ID,
      data: cells,
      coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
      aggregation: "MEAN",
      radiusPixels,
      colorDomain: [range.low, range.high],
      colorRange: PRICE_COLORS.map((color) => [...color]),
      weightsTextureSize: 1024,
      debounceTimeout: 120,
      opacity: 0.78,
      getPosition: (cell) => [cell.lon, cell.lat],
      // Clamp outliers to the legend endpoints so every valid cell remains
      // visible, including the cheapest cells below the robust 4th percentile.
      getWeight: (cell) => Math.max(range.low, Math.min(range.high, cell.medianPriceM2)),
      updateTriggers: { getWeight: [range.low, range.high] },
    }),
    new ScatterplotLayer<DvfMapGridCell>({
      id: REAL_ESTATE_HIT_LAYER_ID,
      data: cells,
      coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
      pickable: true,
      stroked: false,
      filled: true,
      opacity: 0,
      radiusUnits: "meters",
      radiusMinPixels: 6,
      radiusMaxPixels: 12,
      getPosition: (cell) => [cell.lon, cell.lat],
      getRadius: 95,
      getFillColor: [0, 0, 0, 0],
    }),
  ];
}

function quantile(values: readonly number[], q: number): number {
  const index = Math.max(0, Math.min(values.length - 1, Math.round((values.length - 1) * q)));
  return values[index];
}
