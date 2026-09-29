import { COORDINATE_SYSTEM, type Layer } from "@deck.gl/core";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { DvfMapGridCell } from "../../../services/real-estate/realEstateMapLayer";
import type { DvfMarketScope, DvfPurchasePoint, DvfRentalEstimate } from "../../../services/real-estate/compiledRealEstate";
import { DVF_METRIC_INTERPOLATION_RADIUS_METERS } from "../real-estate/realEstateGridGeometry";
import { REAL_ESTATE_METRIC_DECK_COLOR_RANGE, getRealEstateMetricColor } from "../real-estate/realEstateMetricColors";

export const REAL_ESTATE_PRICE_LAYER_ID = "real-estate-price-heatmap";
export const REAL_ESTATE_HIT_LAYER_ID = "real-estate-price-hit-targets";
export const REAL_ESTATE_PURCHASE_POINTS_LAYER_ID = "real-estate-purchase-points";
export const REAL_ESTATE_PURCHASE_POINT_HOVER_HALO_LAYER_ID = "real-estate-purchase-point-hover-halo";
export const REAL_ESTATE_PURCHASE_POINT_HOVER_LAYER_ID = "real-estate-purchase-point-hover";

export interface DvfMapMetricRange {
  low: number;
  high: number;
}

/** Kept for the price-only layer API and its existing callers. */
export type DvfMapPriceRange = DvfMapMetricRange;

export type DvfMapMetricMode = "price" | "rent" | "yield";

export interface DvfMapMetricCell extends DvfMapGridCell {
  /** Raw active metric value used by the mean-interpolation surface. */
  metricValue: number;
  /** Value scaled to [0, 1] for stable color transitions between metrics. */
  normalizedMetric: number;
}

export interface DvfMapMetricCandidate {
  cell: DvfMapGridCell;
  distanceMeters: number;
}

/** Runtime-only join between a parcel-centre dot and its nearest aggregate cell. */
export interface DvfMapPurchasePointMark {
  id: string;
  cityCode: string;
  coordinates: DvfPurchasePoint;
  context?: DvfMapGridCell;
  /** Value scaled to [0, 1] for the selected metric. */
  normalizedMetric?: number;
}

const DECK_PRICE_COLORS = REAL_ESTATE_METRIC_DECK_COLOR_RANGE;

export function getDvfMapMetricValue(
  cell: DvfMapGridCell,
  mode: DvfMapMetricMode,
  rentalEstimatesByCityCode: Readonly<Record<string, DvfRentalEstimate>>,
): number | undefined {
  if (mode === "price") return Number.isFinite(cell.medianPriceM2) ? cell.medianPriceM2 : undefined;
  const estimate = rentalEstimatesByCityCode[cell.cityCode];
  const rent = estimate?.rentPerSquareMeter;
  if (!Number.isFinite(rent) || rent! <= 0) return undefined;
  if (mode === "rent") return rent;
  if (!Number.isFinite(cell.medianPriceM2) || cell.medianPriceM2 <= 0) return undefined;
  return rent! * 12 / cell.medianPriceM2 * 100;
}

/** Robust 4th–96th percentile range for the selected metric within the chosen market scope. */
export function getDvfMapMetricRange(
  cells: readonly DvfMapGridCell[],
  mode: DvfMapMetricMode,
  rentalEstimatesByCityCode: Readonly<Record<string, DvfRentalEstimate>>,
  cityCodesByMarketScope: Readonly<Partial<Record<DvfMarketScope, readonly string[]>>>,
  scope: DvfMarketScope,
): DvfMapMetricRange | undefined {
  const cityCodes = cityCodesByMarketScope[scope];
  if (!cityCodes?.length) return undefined;

  const includedCityCodes = new Set(cityCodes);
  const values: number[] = [];
  for (const cell of cells) {
    if (!includedCityCodes.has(cell.cityCode)) continue;
    const value = getDvfMapMetricValue(cell, mode, rentalEstimatesByCityCode);
    if (value === undefined || !Number.isFinite(value)) continue;
    values.push(value);
  }

  if (!values.length) return undefined;
  values.sort((left, right) => left - right);
  return { low: quantile(values, 0.04), high: quantile(values, 0.96) };
}

export function normalizeDvfMapMetricValue(value: number, range: DvfMapMetricRange): number {
  if (range.high <= range.low) return 0.5;
  return Math.max(0, Math.min(1, (value - range.low) / (range.high - range.low)));
}

/** Collapse cells split by IRIS at the same coordinate into one weighted sample. */
export function createDvfMapMetricCells(
  cells: readonly DvfMapGridCell[],
  mode: DvfMapMetricMode,
  range: DvfMapMetricRange,
  rentalEstimatesByCityCode: Readonly<Record<string, DvfRentalEstimate>>,
): DvfMapMetricCell[] {
  const candidates = cells.map((cell) => ({ cell, distanceMeters: 0 }));
  return coalesceMetricCandidates(
    candidates,
    (cell) => getDvfMapMetricValue(cell, mode, rentalEstimatesByCityCode),
  ).map(({ cell, metricValue }) => ({
    ...cell,
    metricValue,
    normalizedMetric: normalizeDvfMapMetricValue(metricValue, range),
  }));
}

/** Match deck.gl's Gaussian heatmap kernel to return the value visible under the pointer. */
export function interpolateDvfMapMetricValue(
  candidates: readonly DvfMapMetricCandidate[],
  mode: DvfMapMetricMode,
  rentalEstimatesByCityCode: Readonly<Record<string, DvfRentalEstimate>>,
  radiusMeters = DVF_METRIC_INTERPOLATION_RADIUS_METERS,
): number | undefined {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return undefined;
  const groups = coalesceMetricCandidates(
    candidates,
    (cell) => getDvfMapMetricValue(cell, mode, rentalEstimatesByCityCode),
  );
  let weightedValue = 0;
  let totalWeight = 0;

  for (const group of groups) {
    if (group.distanceMeters > radiusMeters) continue;
    const normalizedDistance = group.distanceMeters / radiusMeters;
    // deck.gl's HeatmapLayer uses exp(-18 * d²) inside its radius.
    const distanceWeight = Math.exp(-18 * normalizedDistance * normalizedDistance);
    weightedValue += group.metricValue * distanceWeight;
    totalWeight += distanceWeight;
  }

  return totalWeight > 0 ? weightedValue / totalWeight : undefined;
}

interface CoalescedMetricCandidate {
  cell: DvfMapGridCell;
  metricValue: number;
  distanceMeters: number;
}

function coalesceMetricCandidates(
  candidates: readonly DvfMapMetricCandidate[],
  getValue: (cell: DvfMapGridCell) => number | undefined,
): CoalescedMetricCandidate[] {
  const groups = new Map<string, {
    cell: DvfMapGridCell;
    weightedValue: number;
    totalSampleWeight: number;
    distanceMeters: number;
  }>();

  for (const candidate of candidates) {
    const value = getValue(candidate.cell);
    if (value === undefined || !Number.isFinite(value)) continue;
    const key = `${candidate.cell.lon},${candidate.cell.lat}`;
    const transactionWeight = Number.isFinite(candidate.cell.transactionCount)
      && candidate.cell.transactionCount > 0
      ? candidate.cell.transactionCount
      : 1;
    const group = groups.get(key);
    if (group) {
      group.weightedValue += value * transactionWeight;
      group.totalSampleWeight += transactionWeight;
    } else {
      groups.set(key, {
        cell: candidate.cell,
        weightedValue: value * transactionWeight,
        totalSampleWeight: transactionWeight,
        distanceMeters: candidate.distanceMeters,
      });
    }
  }

  return [...groups.values()].map((group) => ({
    cell: group.cell,
    metricValue: group.weightedValue / group.totalSampleWeight,
    distanceMeters: group.distanceMeters,
  }));
}

/** Render the active metric as a continuous, local mean-interpolation surface. */
export function createDeckRealEstateMetricLayers(
  metricCells: readonly DvfMapMetricCell[],
  range: DvfMapMetricRange,
  radiusPixels: number,
  transitionDurationMs: number,
  beforeId?: string,
): Layer[] {
  if (!metricCells.length) return [];
  const colorDomain: [number, number] = range.high > range.low
    ? [range.low, range.high]
    : [range.low - 0.5, range.high + 0.5];
  return [new HeatmapLayer<DvfMapMetricCell>({
    id: REAL_ESTATE_PRICE_LAYER_ID,
    data: metricCells,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    aggregation: "MEAN",
    radiusPixels,
    colorDomain,
    colorRange: DECK_PRICE_COLORS,
    weightsTextureSize: 1024,
    debounceTimeout: 120,
    opacity: 0.78,
    getPosition: getDvfCellPosition,
    getWeight: getMetricWeight,
    updateTriggers: { getWeight: [range.low, range.high] },
    transitions: { getWeight: { duration: transitionDurationMs } },
    ...(beforeId ? { beforeId } : {}),
  })];
}

function getMetricWeight(cell: DvfMapMetricCell): number {
  return cell.metricValue;
}

function metricColor(value: number | undefined, opacity = 1): [number, number, number, number] {
  return getRealEstateMetricColor(value, Math.round(238 * opacity));
}

export function createDeckRealEstateMetricPurchasePointsLayer(
  points: readonly DvfMapPurchasePointMark[],
  metricMode: DvfMapMetricMode,
  transitionDurationMs: number,
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
    getFillColor: (mark) => metricColor(mark.normalizedMetric),
    getLineColor: [255, 255, 255, 245],
    updateTriggers: { getFillColor: metricMode },
    transitions: { getFillColor: { duration: transitionDurationMs } },
    ...(beforeId ? { beforeId } : {}),
  });
}

export function createDeckRealEstateMetricPurchasePointHoverLayers(
  mark: DvfMapPurchasePointMark | undefined,
  metricMode: DvfMapMetricMode,
  transitionDurationMs: number,
  beforeId?: string,
): Layer[] {
  if (!mark) return [];
  const data = [mark];
  const color = metricColor(mark.normalizedMetric);
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
      updateTriggers: { getFillColor: metricMode },
      transitions: { getFillColor: { duration: transitionDurationMs } },
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
      updateTriggers: { getFillColor: metricMode },
      transitions: { getFillColor: { duration: transitionDurationMs } },
      ...(beforeId ? { beforeId } : {}),
    }),
  ];
}

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
  return getRealEstateMetricColor(normalized, Math.round(238 * opacity));
}

function quantile(values: readonly number[], q: number): number {
  const index = Math.max(0, Math.min(values.length - 1, Math.round((values.length - 1) * q)));
  return values[index];
}
