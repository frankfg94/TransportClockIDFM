import { describe, expect, it } from "vitest";
import {
  createDeckRealEstateMetricLayers,
  createDeckRealEstateMetricLayer,
  createDeckRealEstateMetricPurchasePointsLayer,
  createDvfMapMetricCells,
  interpolateDvfMapMetricValue,
  REAL_ESTATE_PRICE_LAYER_ID,
} from "../src/features/transport-map/next/deckRealEstateLayer";
import {
  DVF_METRIC_INTERPOLATION_RADIUS_METERS,
  getDvfMetricInterpolationRadiusCssPixels,
} from "../src/features/transport-map/real-estate/realEstateGridGeometry";
import { findRealEstateCellsWithinRadius } from "../src/features/transport-map/real-estate/realEstateViewportSelection";
import {
  REAL_ESTATE_METRIC_CSS_GRADIENT,
  REAL_ESTATE_METRIC_DECK_COLOR_RANGE,
  REAL_ESTATE_METRIC_COLOR_STOPS,
  getRealEstateMetricColor,
} from "../src/features/transport-map/real-estate/realEstateMetricColors";
import type { DvfMapGridCell } from "../src/services/real-estate/realEstateMapLayer";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { Layer } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import { RealEstateHeatmapExtension } from "../src/features/transport-map/next/realEstateHeatmapExtension";

function cell(lon: number, medianPriceM2: number, transactionCount = 5): DvfMapGridCell {
  return {
    cityCode: "75056",
    cityName: "Paris",
    lon,
    lat: 48.86,
    transactionCount,
    meanPriceM2: medianPriceM2,
    medianPriceM2,
  };
}

describe("real-estate metric interpolation", () => {
  it("coalesces duplicate IRIS centres with transaction-weighted values", () => {
    const samples = createDvfMapMetricCells(
      [cell(2.35, 3000, 2), cell(2.35, 5000, 6), cell(2.36, 7000, 5)],
      "price",
      { low: 1000, high: 9000 },
      {},
    );

    expect(samples).toHaveLength(2);
    expect(samples[0]!.metricValue).toBe(4500);
    expect(samples[0]!.normalizedMetric).toBe(0.4375);
  });

  it("interpolates between nearby values with the same Gaussian weights as the surface", () => {
    const value = interpolateDvfMapMetricValue(
      [
        { cell: cell(2.35, 3000, 2), distanceMeters: 0 },
        { cell: cell(2.35, 6000, 6), distanceMeters: 0 },
        { cell: cell(2.36, 8000), distanceMeters: 250 },
      ],
      "price",
      {},
    );
    const duplicateCentreValue = (3000 * 2 + 6000 * 6) / 8;
    const neighborWeight = Math.exp(-18 * (250 / DVF_METRIC_INTERPOLATION_RADIUS_METERS) ** 2);

    expect(value).toBeCloseTo(
      (duplicateCentreValue + 8000 * neighborWeight) / (1 + neighborWeight),
      8,
    );
  });

  it("leaves locations with no valid sample within 500 m transparent", () => {
    expect(
      interpolateDvfMapMetricValue(
        [{ cell: cell(2.35, 4000), distanceMeters: 500.01 }],
        "price",
        {},
      ),
    ).toBeUndefined();
  });

  it("queries the spatial index within the ground-distance radius", () => {
    const nearby = cell(2.35, 4000);
    const outside = cell(2.36, 5000);
    const cells = [nearby, outside];
    const found = findRealEstateCellsWithinRadius(cells, 2.35, 48.86, 500);

    expect(found.map((result) => result.cell)).toContain(nearby);
    expect(found.map((result) => result.cell)).not.toContain(outside);
    expect(found[0]!.distanceMeters).toBe(0);
  });

  it("uses one green-to-red palette for the surface, parcel dots, and legend", () => {
    const range = { low: 1000, high: 9000 };
    const metricCells = createDvfMapMetricCells([cell(2.35, 5000)], "price", range, {});
    const [surface] = createDeckRealEstateMetricLayers(metricCells, range, 64, 0);
    const surfaceProps = surface!.props as unknown as {
      aggregation: string;
      colorRange: readonly unknown[];
      colorDomain: readonly number[];
      getWeight: (sample: (typeof metricCells)[number]) => number;
      radiusPixels: number;
    };
    const points = createDeckRealEstateMetricPurchasePointsLayer(
      [
        {
          id: "75056:1",
          cityCode: "75056",
          coordinates: [2.35, 48.86],
          normalizedMetric: 0.5,
        },
      ],
      "price",
      0,
    );
    const pointProps = points.props as unknown as {
      getFillColor: (mark: { normalizedMetric?: number }) => readonly number[];
    };

    expect(surface).toBeDefined();
    expect(surface!.id).toBe(REAL_ESTATE_PRICE_LAYER_ID);
    expect(surfaceProps.aggregation).toBe("MEAN");
    expect(surfaceProps.radiusPixels).toBe(64);
    expect(surfaceProps.colorDomain).toEqual([0, 1]);
    expect(surfaceProps.colorRange).toBe(REAL_ESTATE_METRIC_DECK_COLOR_RANGE);
    expect(surfaceProps.getWeight(metricCells[0]!)).toBe(0.5);
    expect(pointProps.getFillColor({ normalizedMetric: 0.5 })).toEqual(
      getRealEstateMetricColor(0.5),
    );
    expect(REAL_ESTATE_METRIC_CSS_GRADIENT).toContain(REAL_ESTATE_METRIC_COLOR_STOPS[0]!.hex);
    expect(REAL_ESTATE_METRIC_CSS_GRADIENT).toContain(
      REAL_ESTATE_METRIC_COLOR_STOPS[REAL_ESTATE_METRIC_COLOR_STOPS.length - 1]!.hex,
    );
  });

  it("scales the 500 m kernel with zoom and latitude", () => {
    const lowZoom = getDvfMetricInterpolationRadiusCssPixels(10, 48.86);
    const nextZoom = getDvfMetricInterpolationRadiusCssPixels(11, 48.86);

    expect(nextZoom).toBeCloseTo(lowZoom * 2, 8);
    expect(getDvfMetricInterpolationRadiusCssPixels(10, 48.86)).toBeGreaterThan(
      getDvfMetricInterpolationRadiusCssPixels(10, 0),
    );
  });

  it("routes the antialiasing preference to the display shader without changing aggregation", () => {
    const range = { low: 1000, high: 9000 };
    const samples = createDvfMapMetricCells([cell(2.35, 1000), cell(2.36, 9000)], "price", range, {});
    const smooth = createDeckRealEstateMetricLayer(samples, range, 64, 0.78, "smooth", "labels") as HeatmapLayer;
    const sharp = createDeckRealEstateMetricLayer(samples, range, 64, 0.78, "sharp", "labels", false) as HeatmapLayer;
    expect(smooth.props.getWeight).toBe(sharp.props.getWeight);
    const getWeight = smooth.props.getWeight as (sample: (typeof samples)[number]) => number;
    expect(getWeight(samples[0]!)).toBe(0);
    expect(smooth.props.colorDomain).toEqual(sharp.props.colorDomain);
    expect(smooth.props.weightsTextureSize).toBe(sharp.props.weightsTextureSize);
    expect(smooth.props.radiusPixels).toBe(sharp.props.radiusPixels);
    expect(smooth.props.extensions[0]).toBeInstanceOf(RealEstateHeatmapExtension);

    // Use the actual Heatmap display sublayer rather than importing a private
    // deck.gl module. The extension must not replace its aggregation shaders.
    expect(smooth.props.extensions[0]!.getShaders.call(smooth, smooth.props.extensions[0]!)).toBeNull();
    smooth.state = {} as HeatmapLayer["state"];
    sharp.state = {} as HeatmapLayer["state"];
    const display = smooth.renderLayers() as unknown as Layer;
    const sharpDisplay = sharp.renderLayers() as unknown as Layer;
    const smoothShaders = display.props.extensions[0]!.getShaders.call(display, display.props.extensions[0]!);
    const sharpShaders = sharpDisplay.props.extensions[0]!.getShaders.call(sharpDisplay, sharpDisplay.props.extensions[0]!);
    expect(smoothShaders.defines.DVF_SMOOTH_EDGES).toBe(1);
    expect(sharpShaders.defines.DVF_SMOOTH_EDGES).toBe(0);
    expect(smoothShaders.fs).toBe(sharpShaders.fs);
    const dots = new ScatterplotLayer({ id: "dots", data: [] });
    expect(smooth.props.extensions[0]!.getShaders.call(dots, smooth.props.extensions[0]!)).toBeNull();
  });
});
