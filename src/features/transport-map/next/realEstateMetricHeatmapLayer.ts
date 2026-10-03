import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { UpdateParameters } from "@deck.gl/core";
import type { DvfMapMetricCell } from "./deckRealEstateLayer";

/** Fixed-domain MEAN surface: its display shader never samples maxTexture. */
export class RealEstateMetricHeatmapLayer extends HeatmapLayer<DvfMapMetricCell> {
  static override layerName = "RealEstateMetricHeatmapLayer";

  // deck.gl 9.3's default reduction draws textureSize squared points into a
  // single pixel. The metric shader uses only weights / coverage and [0, 1],
  // so this pass contributes nothing to either colors or smoothed contours.
  override _updateMaxWeightValue(): void {}

  override _getChangeFlags(opts: UpdateParameters<this>) {
    // Radius is a view-dependent CSS measurement of the same 500 m kernel.
    // Treat that update like native viewport zoom: reuse the weight model and
    // texture during the gesture, then refresh with deck.gl's existing timer.
    // Data, accessors and extensions retain the normal immediate invalidation.
    const radiusChanged = opts.props.radiusPixels !== opts.oldProps.radiusPixels;
    const flags = super._getChangeFlags(radiusChanged ? {
      ...opts,
      oldProps: Object.create(opts.oldProps, { radiusPixels: { value: opts.props.radiusPixels, enumerable: true } }),
    } : opts);
    if (radiusChanged) flags.viewportZoomChanged = true;
    return flags;
  }
}
