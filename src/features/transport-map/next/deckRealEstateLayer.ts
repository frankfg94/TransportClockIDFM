import { COORDINATE_SYSTEM, type Layer } from "@deck.gl/core";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { DvfMapGridCell } from "../../../services/real-estate/realEstateMapLayer";
import type { DvfPurchasePoint } from "../../../services/real-estate/compiledRealEstate";

export const REAL_ESTATE_PRICE_LAYER_ID = "real-estate-price-heatmap";
export const REAL_ESTATE_HIT_LAYER_ID = "real-estate-price-hit-targets";
export const REAL_ESTATE_PURCHASE_POINTS_LAYER_ID = "real-estate-purchase-points";
export const REAL_ESTATE_PURCHASE_POINTS_HALO_LAYER_ID = "real-estate-purchase-point-halos";
export const REAL_ESTATE_PURCHASE_POINT_HOVER_HALO_LAYER_ID = "real-estate-purchase-point-hover-halo";
export const REAL_ESTATE_PURCHASE_POINT_HOVER_LAYER_ID = "real-estate-purchase-point-hover";

export interface DvfMapPriceRange {
  low: number;
  high: number;
}

/** Runtime-only join between a parcel-centre dot and its nearest aggregate cell. */
export interface DvfMapPurchasePointMark {
  id: string;
  cityCode: string;
  coordinates: DvfPurchasePoint;
  context?: DvfMapGridCell;
}

const PRICE_COLORS = [
  [22, 163, 74, 238],
  [132, 204, 22, 238],
  [250, 204, 21, 238],
  [249, 115, 22, 238],
  [220, 38, 38, 238],
  [127, 29, 29, 245],
] as const;
const DECK_PRICE_COLORS: [number, number, number, number][] = PRICE_COLORS.map((color) => [
  color[0], color[1], color[2], color[3],
]);

interface PriceRangeAccessors {
  low: number;
  high: number;
  getWeight: (cell: DvfMapGridCell) => number;
  colorDomain: [number, number];
  updateTriggers: { getWeight: readonly [number, number] };
}

const priceRangeAccessors = new WeakMap<DvfMapPriceRange, PriceRangeAccessors>();

function getPriceRangeAccessors(range: DvfMapPriceRange): PriceRangeAccessors {
  const cached = priceRangeAccessors.get(range);
  if (cached && cached.low === range.low && cached.high === range.high) return cached;

  const accessors: PriceRangeAccessors = {
    low: range.low,
    high: range.high,
    getWeight: (cell) => Math.max(range.low, Math.min(range.high, cell.medianPriceM2)),
    colorDomain: [range.low, range.high],
    updateTriggers: { getWeight: [range.low, range.high] },
  };
  priceRangeAccessors.set(range, accessors);
  return accessors;
}

function getDvfCellPosition(cell: DvfMapGridCell): [number, number] {
  return [cell.lon, cell.lat];
}

/** Use robust tails of cell medians so a few exceptional sales do not flatten the regional contrast. */
export function getDvfMapPriceRange(cells: readonly DvfMapGridCell[]): DvfMapPriceRange {
  const prices = cells.map((cell) => cell.medianPriceM2).filter(Number.isFinite).sort((a, b) => a - b);
  if (!prices.length) return { low: 0, high: 1 };
  return {
    low: quantile(prices, 0.04),
    high: quantile(prices, 0.96),
  };
}

/**
 * The visible layer smooths each cell's median €/m² with deck.gl's GPU
 * Gaussian KDE; a transparent GPU point layer preserves exact hover values.
 */
export function createDeckRealEstatePriceLayers(
  cells: readonly DvfMapGridCell[],
  range: DvfMapPriceRange,
  radiusPixels = 28,
  beforeId?: string,
): Layer[] {
  const accessors = getPriceRangeAccessors(range);
  return [
    new HeatmapLayer<DvfMapGridCell>({
      id: REAL_ESTATE_PRICE_LAYER_ID,
      data: cells,
      coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
      aggregation: "MEAN",
      radiusPixels,
      colorDomain: accessors.colorDomain,
      colorRange: DECK_PRICE_COLORS,
      weightsTextureSize: 1024,
      debounceTimeout: 120,
      opacity: 0.78,
      getPosition: getDvfCellPosition,
      // Clamp outliers to the legend endpoints so every valid cell remains
      // visible, including the cheapest cells below the robust 4th percentile.
      getWeight: accessors.getWeight,
      updateTriggers: accessors.updateTriggers,
      ...(beforeId ? { beforeId } : {}),
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
      getPosition: getDvfCellPosition,
      getRadius: 95,
      getFillColor: [0, 0, 0, 0],
      ...(beforeId ? { beforeId } : {}),
    }),
  ];
}

/** Show parcel-centre dots joined at runtime to their nearest aggregate cell. */
export function createDeckRealEstatePurchasePointsLayer(
  points: readonly DvfMapPurchasePointMark[],
  range: DvfMapPriceRange,
  beforeId?: string,
): Layer {
  return new ScatterplotLayer<DvfMapPurchasePointMark>({
    id: REAL_ESTATE_PURCHASE_POINTS_LAYER_ID,
    data: points,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    pickable: true,
    stroked: true,
    filled: true,
    radiusUnits: "pixels",
    radiusMinPixels: 4,
    radiusMaxPixels: 5.5,
    lineWidthUnits: "pixels",
    lineWidthMinPixels: 1,
    getPosition: (mark) => [mark.coordinates[0], mark.coordinates[1]],
    getRadius: 4.5,
    getFillColor: (mark) => mark.context
      ? getDvfMapPriceColor(mark.context.medianPriceM2, range)
      : [71, 85, 105, 220],
    getLineColor: [255, 255, 255, 245],
    ...(beforeId ? { beforeId } : {}),
  });
}

/** Subtle price-coloured halos make parcel dots distinguishable at close zoom. */
export function createDeckRealEstatePurchasePointsHaloLayer(
  points: readonly DvfMapPurchasePointMark[],
  range: DvfMapPriceRange,
  beforeId?: string,
): Layer {
  return new ScatterplotLayer<DvfMapPurchasePointMark>({
    id: REAL_ESTATE_PURCHASE_POINTS_HALO_LAYER_ID,
    data: points,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    pickable: false,
    stroked: false,
    filled: true,
    radiusUnits: "pixels",
    radiusMinPixels: 7,
    radiusMaxPixels: 9,
    getPosition: (mark) => [mark.coordinates[0], mark.coordinates[1]],
    getRadius: 7.5,
    getFillColor: (mark) => mark.context
      ? getDvfMapPriceColor(mark.context.medianPriceM2, range, 0.2)
      : [71, 85, 105, 38],
    ...(beforeId ? { beforeId } : {}),
  });
}

/** Add a soft halo and a slightly larger marker for the currently hovered dot. */
export function createDeckRealEstatePurchasePointHoverLayers(
  mark: DvfMapPurchasePointMark | undefined,
  range: DvfMapPriceRange,
  beforeId?: string,
): Layer[] {
  if (!mark) return [];
  const data = [mark];
  const color: [number, number, number, number] = mark.context
    ? getDvfMapPriceColor(mark.context.medianPriceM2, range)
    : [71, 85, 105, 220];
  return [
    new ScatterplotLayer<DvfMapPurchasePointMark>({
      id: REAL_ESTATE_PURCHASE_POINT_HOVER_HALO_LAYER_ID,
      data,
      coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
      pickable: false,
      stroked: false,
      filled: true,
      radiusUnits: "pixels",
      radiusMinPixels: 12,
      radiusMaxPixels: 14,
      getPosition: (point) => [point.coordinates[0], point.coordinates[1]],
      getRadius: 12.5,
      getFillColor: [color[0], color[1], color[2], 90],
      ...(beforeId ? { beforeId } : {}),
    }),
    new ScatterplotLayer<DvfMapPurchasePointMark>({
      id: REAL_ESTATE_PURCHASE_POINT_HOVER_LAYER_ID,
      data,
      coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
      pickable: false,
      stroked: true,
      filled: true,
      radiusUnits: "pixels",
      radiusMinPixels: 6,
      radiusMaxPixels: 7,
      lineWidthUnits: "pixels",
      lineWidthMinPixels: 1.5,
      getPosition: (point) => [point.coordinates[0], point.coordinates[1]],
      getRadius: 6.5,
      getFillColor: color,
      getLineColor: [255, 255, 255, 255],
      ...(beforeId ? { beforeId } : {}),
    }),
  ];
}

/** Keep the point palette aligned with the price heatmap and its legend. */
export function getDvfMapPriceColor(
  value: number,
  range: DvfMapPriceRange,
  opacity = 1,
): [number, number, number, number] {
  const normalized = range.high > range.low
    ? Math.max(0, Math.min(1, (value - range.low) / (range.high - range.low)))
    : 0.5;
  const colorIndex = normalized * (PRICE_COLORS.length - 1);
  const lowerIndex = Math.floor(colorIndex);
  const upperIndex = Math.min(PRICE_COLORS.length - 1, lowerIndex + 1);
  const blend = colorIndex - lowerIndex;
  const lower = PRICE_COLORS[lowerIndex]!;
  const upper = PRICE_COLORS[upperIndex]!;
  return [
    Math.round(lower[0] + (upper[0] - lower[0]) * blend),
    Math.round(lower[1] + (upper[1] - lower[1]) * blend),
    Math.round(lower[2] + (upper[2] - lower[2]) * blend),
    Math.round((lower[3] + (upper[3] - lower[3]) * blend) * opacity),
  ];
}

function quantile(values: readonly number[], q: number): number {
  const index = Math.max(0, Math.min(values.length - 1, Math.round((values.length - 1) * q)));
  return values[index];
}
