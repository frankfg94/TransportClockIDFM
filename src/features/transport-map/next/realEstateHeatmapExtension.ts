import { LayerExtension, type Layer } from "@deck.gl/core";

// Keep metric colors independent of sample coverage. deck.gl's default shader
// fades by metric value and divides by colorDomain[0], which is zero for our
// normalized palette. It also discards valid samples at the green endpoint.
export const REAL_ESTATE_HEATMAP_FRAGMENT_SHADER = `\
#version 300 es
precision highp float;

uniform sampler2D weightsTexture;
uniform sampler2D colorTexture;
in vec2 vTexCoords;
out vec4 fragColor;

void main(void) {
  vec4 weights = texture(weightsTexture, vTexCoords);
  float coverage = weights.a;
  float edgeAlpha = 1.0;
#if DVF_SMOOTH_EDGES
  // The Gaussian kernel has peak 1 / (sqrt(pi) / 6) and exp(-18*d*d).
  // Fade its outer quarter independently of the metric. Cap the derivative
  // contribution: at overview zoom an entire kernel can span one fragment
  // quad, and an uncapped derivative would make its interior checkerboard.
  const float fadeCoverage = 3.385 * exp(-18.0 * 0.75 * 0.75);
  float edgeWidth = min(1.5 * fwidth(coverage), fadeCoverage);
  edgeAlpha = smoothstep(0.0, fadeCoverage + edgeWidth, coverage);
#endif
  if (coverage <= 0.0) {
    discard;
  }

  float meanValue = weights.r / max(coverage, 1e-20);
  float domainWidth = max(triangle.colorDomain.y - triangle.colorDomain.x, 1e-20);
  float factor = clamp((meanValue * triangle.intensity - triangle.colorDomain.x) / domainWidth, 0.0, 1.0);
  vec4 color = texture(colorTexture, vec2(factor, 0.5));
  color.a *= edgeAlpha * layer.opacity;
  fragColor = color;
}
`;

/** Only change the heatmap display shader; leave GPU aggregation untouched. */
export class RealEstateHeatmapExtension extends LayerExtension<{ antialias: boolean }> {
  static override extensionName = "RealEstateHeatmapExtension";

  override getShaders(this: Layer, extension: RealEstateHeatmapExtension) {
    // HeatmapLayer also builds its aggregation shaders through getShaders().
    // Its display sublayer alone receives the weightsTexture prop.
    if (!("weightsTexture" in this.props)) return null;
    return {
      fs: REAL_ESTATE_HEATMAP_FRAGMENT_SHADER,
      defines: { DVF_SMOOTH_EDGES: extension.opts.antialias ? 1 : 0 },
    };
  }
}

export const REAL_ESTATE_HEATMAP_EXTENSIONS = [new RealEstateHeatmapExtension({ antialias: true })];
export const REAL_ESTATE_HEATMAP_UNSMOOTHED_EXTENSIONS = [new RealEstateHeatmapExtension({ antialias: false })];
