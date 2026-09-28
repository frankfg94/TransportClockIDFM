import { describe, expect, it } from "vitest";
import {
  createDeckRealEstatePriceLayers,
  REAL_ESTATE_HIT_LAYER_ID,
  REAL_ESTATE_PRICE_LAYER_ID,
} from "../src/features/transport-map/next/deckRealEstateLayer";
import type { DvfMapGridCell } from "../src/services/real-estate/realEstateMapLayer";

describe("real-estate Deck layers", () => {
  it("keeps the existing rendering values while reusing cell accessors", () => {
    const cells: readonly DvfMapGridCell[] = [{
      cityCode: "75056",
      cityName: "Paris",
      lon: 2.35,
      lat: 48.86,
      transactionCount: 2,
      meanPriceM2: 7000,
      medianPriceM2: 6000,
    }];
    const range = { low: 3000, high: 10000 };
    const first = createDeckRealEstatePriceLayers(cells, range, 72, "labels");
    const second = createDeckRealEstatePriceLayers(cells, range, 72, "labels");
    const heatmap = first.find((layer) => layer.id === REAL_ESTATE_PRICE_LAYER_ID)!.props as unknown as {
      data: readonly DvfMapGridCell[];
      radiusPixels: number;
      weightsTextureSize: number;
      debounceTimeout: number;
      opacity: number;
      colorDomain: readonly number[];
      colorRange: readonly unknown[];
      getPosition: (cell: DvfMapGridCell) => readonly [number, number];
      getWeight: (cell: DvfMapGridCell) => number;
      updateTriggers: { getWeight: readonly [number, number] };
    };
    const nextHeatmap = second.find((layer) => layer.id === REAL_ESTATE_PRICE_LAYER_ID)!.props as unknown as typeof heatmap;
    const hitTargets = first.find((layer) => layer.id === REAL_ESTATE_HIT_LAYER_ID)!.props as unknown as {
      data: readonly DvfMapGridCell[];
      opacity: number;
      radiusMinPixels: number;
      radiusMaxPixels: number;
      getRadius: number;
      getFillColor: readonly number[];
    };

    expect(heatmap.data).toBe(cells);
    expect(heatmap.radiusPixels).toBe(72);
    expect(heatmap.weightsTextureSize).toBe(1024);
    expect(heatmap.debounceTimeout).toBe(120);
    expect(heatmap.opacity).toBe(0.78);
    expect(heatmap.colorDomain).toEqual([3000, 10000]);
    expect(heatmap.getPosition(cells[0]!)).toEqual([2.35, 48.86]);
    expect(heatmap.getWeight(cells[0]!)).toBe(6000);
    expect(heatmap.getWeight).toBe(nextHeatmap.getWeight);
    expect(heatmap.getPosition).toBe(nextHeatmap.getPosition);
    expect(heatmap.colorRange).toBe(nextHeatmap.colorRange);
    expect(heatmap.updateTriggers).toBe(nextHeatmap.updateTriggers);
    expect(hitTargets.data).toBe(cells);
    expect(hitTargets.opacity).toBe(0);
    expect(hitTargets.radiusMinPixels).toBe(6);
    expect(hitTargets.radiusMaxPixels).toBe(12);
    expect(hitTargets.getRadius).toBe(95);
    expect(hitTargets.getFillColor).toEqual([0, 0, 0, 0]);
  });
});
