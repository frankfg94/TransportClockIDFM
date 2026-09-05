import type { TransportMapRenderer } from "../contracts/renderer";
import type {
  TransportMapExperience,
  TransportMapExperienceKind,
} from "../contracts/experience";
import { Canvas2dRenderer } from "./canvas2d/canvas2dRenderer";
import { DeckGlRenderer } from "./deckgl/deckGlRenderer";

class LegacyCanvasMapExperience implements TransportMapExperience {
  readonly kind = "legacy" as const;
  readonly basemap = "legacy-raster" as const;
  readonly rendererKind = "canvas2d-main-thread" as const;

  createRenderer(): TransportMapRenderer {
    return new Canvas2dRenderer("canvas2d-main-thread");
  }
}

class MapLibreDeckMapExperience implements TransportMapExperience {
  readonly kind = "next" as const;
  readonly basemap = "maplibre-vector" as const;
  readonly rendererKind = "deckgl-webgl2" as const;

  createRenderer(): TransportMapRenderer {
    return new DeckGlRenderer();
  }
}

/**
 * The only production decision point between the two map experiences.
 * Adding another backend later does not require changing scene/business code.
 */
export function createTransportMapExperience(
  kind: TransportMapExperienceKind = "legacy",
): TransportMapExperience {
  switch (kind) {
    case "next":
      return new MapLibreDeckMapExperience();
    case "legacy":
    default:
      return new LegacyCanvasMapExperience();
  }
}

export function createTransportMapRenderer(options: {
  experience?: TransportMapExperienceKind;
} = {}): TransportMapRenderer {
  return createTransportMapExperience(options.experience ?? "legacy").createRenderer();
}
