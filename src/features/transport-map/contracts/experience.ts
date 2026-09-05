import type {
  TransportMapBasemapKind,
  TransportMapExperienceKind,
  TransportMapRenderer,
  TransportMapRendererKind,
} from "./renderer";

export type { TransportMapExperienceKind } from "./renderer";

/**
 * Product-level strategy boundary. A legacy experience owns the existing
 * raster stack; the next experience owns the MapLibre vector surface. Both
 * receive the same scene/camera through the renderer contract.
 */
export interface TransportMapExperience {
  readonly kind: TransportMapExperienceKind;
  readonly basemap: TransportMapBasemapKind;
  readonly rendererKind: TransportMapRendererKind | "deckgl-webgl2";
  createRenderer(): TransportMapRenderer;
}
