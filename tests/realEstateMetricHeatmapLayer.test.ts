import { describe, expect, it, vi } from "vitest";
import { RealEstateMetricHeatmapLayer } from "../src/features/transport-map/next/realEstateMetricHeatmapLayer";

function layer(radiusPixels: number) {
  return new RealEstateMetricHeatmapLayer({ id: "metric", data: [], radiusPixels });
}

describe("fixed-domain metric heatmap", () => {
  it("avoids the unused four-million-pixel maximum reduction", () => {
    const surface = layer(72);
    const run = vi.fn();
    surface.state = { maxWeightTransform: { run } } as unknown as typeof surface.state;
    surface._updateMaxWeightValue();
    expect(run).not.toHaveBeenCalled();
  });

  it("debounces a zoom-radius change, while changed data and attributes still aggregate immediately", () => {
    const before = layer(72);
    const surface = layer(80);
    surface.state = {
      dimensions: { data: { props: ["radiusPixels"] } },
      ignoreProps: Object.fromEntries(Object.keys(surface.props).filter(key => key !== "radiusPixels").map(key => [key, true])),
      changedAttributes: {}, zoom: 10,
    } as typeof surface.state;
    const opts = {
      props: surface.props, oldProps: before.props,
      context: { viewport: { zoom: 10.15 } },
      changeFlags: { viewportChanged: true },
    } as Parameters<typeof surface._getChangeFlags>[0];
    expect(surface._getChangeFlags(opts)).toMatchObject({ dataChanged: false, viewportZoomChanged: true });
    expect(surface._getChangeFlags({ ...opts, changeFlags: { ...opts.changeFlags, dataChanged: "new cells" } }).dataChanged).toBeTruthy();
    surface.state.changedAttributes = { positions: {} };
    expect(surface._getChangeFlags(opts).dataChanged).toBeTruthy();
  });
});
