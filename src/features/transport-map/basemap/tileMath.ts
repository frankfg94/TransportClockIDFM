import type { CameraState } from "../geo/camera";
import { visibleWorldBounds, worldToScreen } from "../geo/coordinateKernel";
import type { GlobalMapBounds } from "../contracts/manifest";
import {
  GLOBAL_TRANSPORT_PLAN_CONFIG,
  type TransportMapBasemapStyle,
} from "../config/globalTransportPlanConfig";

export type { TransportMapBasemapStyle } from "../config/globalTransportPlanConfig";

export type TransportMapBasemapTilePriority = "visible" | "overscan";
export type TransportMapBasemapLayer = "plan" | "satellite";
export type TransportMapBasemapProvider = "carto" | "openstreetmap";

export interface TransportMapBasemapTile {
  id: string;
  url: string;
  priority: TransportMapBasemapTilePriority;
  zoom: number;
  tileX: number;
  tileY: number;
  leftCssPx: number;
  topCssPx: number;
  widthCssPx: number;
  heightCssPx: number;
}

export interface TransportMapBasemapOptions {
  layer?: TransportMapBasemapLayer;
  provider?: TransportMapBasemapProvider;
  style?: TransportMapBasemapStyle;
  pixelRatio?: number;
  maxTiles?: number;
  highZoomMin?: number;
  highZoomMaxTiles?: number;
  overscanTiles?: number;
  minZoom?: number;
  maxZoom?: number;
  retinaPixelRatio?: number;
  /** Uses the selected Carto style for city and street names. */
  showCityAndStreetLabels?: boolean;
  /** Optional world rectangle to cover in addition to the visible camera. */
  worldBounds?: GlobalMapBounds;
}

const CARTO_SHARDS = ["a", "b", "c"] as const;
const DEFAULT_MAX_TILES = 48;
const DEFAULT_HIGH_ZOOM_MIN = 12;
const DEFAULT_HIGH_ZOOM_MAX_TILES = 128;
const DEFAULT_OVERSCAN_TILES = 1;
const DEFAULT_MAX_ZOOM = 20;
const DEFAULT_RETINA_PIXEL_RATIO = 1.5;
const DEFAULT_BASEMAP_LAYER: TransportMapBasemapLayer = "plan";
const DEFAULT_BASEMAP_PROVIDER: TransportMapBasemapProvider = "carto";
const DEFAULT_BASEMAP_STYLE: TransportMapBasemapStyle =
  GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.style.default;
const ESRI_SATELLITE_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
// CSS/device-pixel rounding can leave a hairline gap between adjacent raster
// tiles at fractional camera zooms. A small overlap keeps the basemap covered
// while preserving the exact camera projection at each tile's top-left edge.
export const BASEMAP_TILE_EDGE_OVERLAP_CSS_PX = 1;

/**
 * Projects XYZ raster tiles into the exact same CSS-space camera as the
 * transport renderer. The tile layer is deliberately independent from the
 * line/station canvas: it can fail or be disabled without changing any
 * semantic transport coordinate.
 */
export function createTransportMapBasemapTiles(
  camera: CameraState,
  options: TransportMapBasemapOptions = {},
): TransportMapBasemapTile[] {
  const standardMaxTiles = Math.max(1, Math.floor(options.maxTiles ?? DEFAULT_MAX_TILES));
  const highZoomMin = Math.max(0, options.highZoomMin ?? DEFAULT_HIGH_ZOOM_MIN);
  const highZoomMaxTiles = Math.max(
    standardMaxTiles,
    Math.floor(
      options.highZoomMaxTiles ??
        (options.maxTiles === undefined ? DEFAULT_HIGH_ZOOM_MAX_TILES : standardMaxTiles),
    ),
  );
  const overscanTiles = Math.max(0, Math.floor(options.overscanTiles ?? DEFAULT_OVERSCAN_TILES));
  const minZoom = Math.max(0, Math.floor(options.minZoom ?? 0));
  const maxZoom = Math.max(minZoom, Math.floor(options.maxZoom ?? DEFAULT_MAX_ZOOM));
  const layer = options.layer ?? DEFAULT_BASEMAP_LAYER;
  const provider = layer === "satellite"
    ? DEFAULT_BASEMAP_PROVIDER
    : options.provider ?? DEFAULT_BASEMAP_PROVIDER;
  const style = options.style ?? DEFAULT_BASEMAP_STYLE;
  const pixelRatio = Math.max(1, options.pixelRatio ?? camera.pixelRatio ?? 1);
  const retinaPixelRatio = Math.max(1, options.retinaPixelRatio ?? DEFAULT_RETINA_PIXEL_RATIO);
  const worldBounds = options.worldBounds ?? visibleWorldBounds(camera);
  const maxTiles = camera.zoom >= highZoomMin ? highZoomMaxTiles : standardMaxTiles;
  // Ceil keeps fractional zooms on the most detailed available source level;
  // the bounded tile budget still falls back to a coarser level for broad views.
  let tileZoom = clamp(Math.ceil(camera.zoom), minZoom, maxZoom);
  let effectiveOverscanTiles = overscanTiles;
  let ranges = createTileRanges(worldBounds, tileZoom, effectiveOverscanTiles);

  // Raster detail is more valuable than an extra guard ring. Fit the
  // configured overscan to the budget before lowering the XYZ source level;
  // otherwise increasing the guard from one to two tiles made z12.4 silently
  // fall back from z13 to z12 and reintroduced the blur the cover is meant to
  // avoid. When a coarser source is genuinely required, retry the full guard
  // at that cheaper level.
  while (ranges.tileCount > maxTiles) {
    if (effectiveOverscanTiles > 0) {
      effectiveOverscanTiles -= 1;
    } else if (tileZoom > minZoom) {
      tileZoom -= 1;
      effectiveOverscanTiles = overscanTiles;
    } else {
      break;
    }
    ranges = createTileRanges(worldBounds, tileZoom, effectiveOverscanTiles);
  }

  const scale = 2 ** tileZoom;
  const cartoStyle = style === "light"
    ? options.showCityAndStreetLabels
      ? "light_all"
      : "light_nolabels"
    : options.showCityAndStreetLabels
      ? "rastertiles/voyager"
      : "rastertiles/voyager_nolabels";
  const tiles: TransportMapBasemapTile[] = [];
  for (let tileX = ranges.minTileX; tileX <= ranges.maxTileX; tileX += 1) {
    for (let tileY = ranges.minTileY; tileY <= ranges.maxTileY; tileY += 1) {
      const topLeft = worldToScreen({ x: tileX / scale, y: tileY / scale }, camera);
      const bottomRight = worldToScreen({ x: (tileX + 1) / scale, y: (tileY + 1) / scale }, camera);
      const shard = CARTO_SHARDS[Math.abs(tileX + tileY + scale) % CARTO_SHARDS.length];
      const wrappedTileX = ((tileX % scale) + scale) % scale;
      const densitySuffix = provider === "carto" && pixelRatio >= retinaPixelRatio ? "@2x" : "";
      const baseId = `${layer}/${style}/${tileZoom}/${tileX}/${tileY}${densitySuffix}`;
      tiles.push({
        // Keep legacy Carto ids stable, but include an alternate provider in
        // the id so a source switch cannot reuse a decoded tile from another
        // raster service.
        id: provider === "carto" ? baseId : `${baseId}/${provider}`,
        url: layer === "satellite"
          ? `${ESRI_SATELLITE_TILE_URL}/${tileZoom}/${tileY}/${wrappedTileX}`
          : provider === "openstreetmap"
            ? `https://tile.openstreetmap.org/${tileZoom}/${wrappedTileX}/${tileY}.png`
          :
            // With the label-free style, station names remain vector-only, which
            // avoids stale raster station text during a zoom. The config-controlled
            // full style adds the contextual city and street labels.
            `https://${shard}.basemaps.cartocdn.com/${cartoStyle}/${tileZoom}/${wrappedTileX}/${tileY}${densitySuffix}.png`,
        priority:
          tileX >= ranges.coreMinTileX &&
          tileX <= ranges.coreMaxTileX &&
          tileY >= ranges.coreMinTileY &&
          tileY <= ranges.coreMaxTileY
            ? "visible"
            : "overscan",
        zoom: tileZoom,
        tileX,
        tileY,
        leftCssPx: topLeft.x,
        topCssPx: topLeft.y,
        widthCssPx: bottomRight.x - topLeft.x + BASEMAP_TILE_EDGE_OVERLAP_CSS_PX,
        heightCssPx: bottomRight.y - topLeft.y + BASEMAP_TILE_EDGE_OVERLAP_CSS_PX,
      });
    }
  }

  return tiles.sort((left, right) =>
    left.priority === right.priority
      ? left.id.localeCompare(right.id)
      : left.priority === "visible"
        ? -1
        : 1,
  );
}

/**
 * Reprojects a tile that is still being kept as a visual fallback while a
 * newer source definition loads. The raster itself is not recreated: only
 * its CSS placement follows the current camera.
 */
export function reprojectTransportMapBasemapTile(
  tile: TransportMapBasemapTile,
  camera: CameraState,
): TransportMapBasemapTile {
  const scale = 2 ** tile.zoom;
  const topLeft = worldToScreen({ x: tile.tileX / scale, y: tile.tileY / scale }, camera);
  const bottomRight = worldToScreen({ x: (tile.tileX + 1) / scale, y: (tile.tileY + 1) / scale }, camera);
  return {
    ...tile,
    leftCssPx: topLeft.x,
    topCssPx: topLeft.y,
    widthCssPx: bottomRight.x - topLeft.x + BASEMAP_TILE_EDGE_OVERLAP_CSS_PX,
    heightCssPx: bottomRight.y - topLeft.y + BASEMAP_TILE_EDGE_OVERLAP_CSS_PX,
  };
}

function createTileRanges(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  zoom: number,
  overscanTiles: number,
): {
  coreMinTileX: number;
  coreMaxTileX: number;
  coreMinTileY: number;
  coreMaxTileY: number;
  minTileX: number;
  maxTileX: number;
  minTileY: number;
  maxTileY: number;
  tileCount: number;
} {
  const scale = 2 ** zoom;
  const coreMinTileX = Math.floor(bounds.minX * scale);
  const coreMaxTileX = Math.max(coreMinTileX, Math.ceil(bounds.maxX * scale) - 1);
  const coreMinTileY = clamp(Math.floor(bounds.minY * scale), 0, scale - 1);
  const coreMaxTileY = clamp(Math.max(coreMinTileY, Math.ceil(bounds.maxY * scale) - 1), 0, scale - 1);
  const minTileX = coreMinTileX - overscanTiles;
  const maxTileX = coreMaxTileX + overscanTiles;
  const minTileY = Math.max(0, coreMinTileY - overscanTiles);
  const maxTileY = Math.min(scale - 1, coreMaxTileY + overscanTiles);

  return {
    coreMinTileX,
    coreMaxTileX,
    coreMinTileY,
    coreMaxTileY,
    minTileX,
    maxTileX,
    minTileY,
    maxTileY,
    tileCount: Math.max(0, maxTileX - minTileX + 1) * Math.max(0, maxTileY - minTileY + 1),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
