import type { GlobalMapBounds } from "../contracts/manifest";
import {
  GLOBAL_TRANSPORT_PLAN_CONFIG,
  type TransportMapBasemapStyle,
} from "../config/globalTransportPlanConfig";
import {
  zoomCameraAroundScreenPoint,
  type CameraState,
} from "../geo/camera";
import { visibleWorldBounds } from "../geo/coordinateKernel";
import {
  createTransportMapBasemapTiles,
  reprojectTransportMapBasemapTile,
  type TransportMapBasemapLayer,
  type TransportMapBasemapTile,
} from "./tileMath";
import { tileDefinitionSignature } from "./basemapDefinition";

export interface SelectedLineBasemapCoverOptions {
  coveredZoomOutLevels: number;
  detailLeadLevels: number;
  maxSourceZoom: number;
  maxTiles: number;
  maxEstimatedDecodedBytes: number;
  boundsPaddingRatio: number;
  retinaPixelRatio: number;
  showCityAndStreetLabels: boolean;
}

export interface SelectedLineBasemapCoverDefinition {
  key: string;
  lineId: string;
  anchorCamera: CameraState;
  coverageBounds: GlobalMapBounds;
  floorZoom: number;
  requestedSourceZoom: number;
  sourceZoom: number;
  density: 1 | 2;
  bytesPerDecodedTile: number;
  estimatedDecodedBytes: number;
  effectiveMaxTiles: number;
  tiles: TransportMapBasemapTile[];
  signature: string;
}

export interface SelectedLineBasemapCoverDefinitionInput {
  lineId: string;
  anchorCamera: CameraState;
  lineBounds: GlobalMapBounds;
  layer: TransportMapBasemapLayer;
  basemapStyle: TransportMapBasemapStyle;
  options: SelectedLineBasemapCoverOptions;
}

export interface SelectedLineBasemapCoverDebugMetrics {
  enabled: boolean;
  mounted: boolean;
  ready: boolean;
  lineId?: string;
  definitionKey?: string;
  definitionSignature?: string;
  floorZoom?: number;
  requestedSourceZoom?: number;
  sourceZoom?: number;
  tileCount: number;
  loadedTiles: number;
  failedTiles: number;
  density: 1 | 2;
  estimatedDecodedBytes: number;
  rebuilds: number;
  rebuildsDuringInteraction: number;
  lateCallbacksIgnored: number;
  retries: number;
  terminalFailures: number;
  compositeVerified: boolean;
  rejectedComposites: number;
}

const WORLD_MIN = 0;
const WORLD_MAX = 1;
// The configured five-percent margin remains the normal contract. When that
// margin makes the next complete XYZ level miss the hard tile budget by only
// a few edge tiles, this smaller deterministic fallback keeps one additional
// source level instead of falling back to a visibly coarse mosaic. The live
// layer and the fixed cover still provide the safety envelope around it.
const COVER_BUDGET_FALLBACK_PADDING_RATIO = 0.01;
const COVER_SCREEN_ANCHORS = [
  "center",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

export function isValidGlobalMapBounds(bounds: GlobalMapBounds | undefined): bounds is GlobalMapBounds {
  return Boolean(
    bounds &&
      Number.isFinite(bounds.minX) &&
      Number.isFinite(bounds.minY) &&
      Number.isFinite(bounds.maxX) &&
      Number.isFinite(bounds.maxY) &&
      bounds.maxX >= bounds.minX &&
      bounds.maxY >= bounds.minY,
  );
}

export function unionGlobalMapBounds(
  boundsList: ReadonlyArray<GlobalMapBounds | undefined>,
): GlobalMapBounds | undefined {
  const validBounds = boundsList.filter(isValidGlobalMapBounds);
  if (validBounds.length === 0) return undefined;
  return {
    minX: Math.min(...validBounds.map((bounds) => bounds.minX)),
    minY: Math.min(...validBounds.map((bounds) => bounds.minY)),
    maxX: Math.max(...validBounds.map((bounds) => bounds.maxX)),
    maxY: Math.max(...validBounds.map((bounds) => bounds.maxY)),
  };
}

export function expandGlobalMapBounds(
  bounds: GlobalMapBounds,
  paddingRatio: number,
): GlobalMapBounds | undefined {
  if (!isValidGlobalMapBounds(bounds) || !Number.isFinite(paddingRatio) || paddingRatio < 0) {
    return undefined;
  }
  const width = Math.max(bounds.maxX - bounds.minX, Number.EPSILON);
  const height = Math.max(bounds.maxY - bounds.minY, Number.EPSILON);
  const paddingX = width * paddingRatio;
  const paddingY = height * paddingRatio;
  return {
    minX: bounds.minX - paddingX,
    minY: bounds.minY - paddingY,
    maxX: bounds.maxX + paddingX,
    maxY: bounds.maxY + paddingY,
  };
}

function clampWorldBounds(bounds: GlobalMapBounds | undefined): GlobalMapBounds | undefined {
  if (!isValidGlobalMapBounds(bounds)) return undefined;
  const clamped = {
    minX: Math.max(WORLD_MIN, Math.min(WORLD_MAX, bounds.minX)),
    minY: Math.max(WORLD_MIN, Math.min(WORLD_MAX, bounds.minY)),
    maxX: Math.max(WORLD_MIN, Math.min(WORLD_MAX, bounds.maxX)),
    maxY: Math.max(WORLD_MIN, Math.min(WORLD_MAX, bounds.maxY)),
  };
  return isValidGlobalMapBounds(clamped) ? clamped : undefined;
}

function isValidCamera(camera: CameraState): boolean {
  return [
    camera.centerWorldX,
    camera.centerWorldY,
    camera.zoom,
    camera.generation,
    camera.viewportWidthCssPx,
    camera.viewportHeightCssPx,
    camera.pixelRatio,
  ].every(Number.isFinite) &&
    camera.bearing === 0 &&
    camera.viewportWidthCssPx > 0 &&
    camera.viewportHeightCssPx > 0 &&
    camera.pixelRatio >= 1;
}

function isValidCoverOptions(options: SelectedLineBasemapCoverOptions): boolean {
  return (
    Number.isFinite(options.coveredZoomOutLevels) &&
    options.coveredZoomOutLevels >= 0 &&
    Number.isFinite(options.detailLeadLevels) &&
    options.detailLeadLevels >= 0 &&
    Number.isFinite(options.maxSourceZoom) &&
    options.maxSourceZoom >= 0 &&
    Number.isFinite(options.maxTiles) &&
    options.maxTiles >= 1 &&
    Number.isFinite(options.maxEstimatedDecodedBytes) &&
    options.maxEstimatedDecodedBytes >= 1 &&
    Number.isFinite(options.boundsPaddingRatio) &&
    options.boundsPaddingRatio >= 0 &&
    Number.isFinite(options.retinaPixelRatio) &&
    options.retinaPixelRatio >= 1 &&
    typeof options.showCityAndStreetLabels === "boolean"
  );
}

export function calculateSelectedLineCoverageBounds(
  anchorCamera: CameraState,
  lineBounds: GlobalMapBounds,
  coveredZoomOutLevels: number,
  boundsPaddingRatio: number,
): { floorZoom: number; coverageBounds: GlobalMapBounds } | undefined {
  if (
    !isValidCamera(anchorCamera) ||
    !isValidGlobalMapBounds(lineBounds) ||
    !Number.isFinite(coveredZoomOutLevels) ||
    coveredZoomOutLevels < 0
  ) {
    return undefined;
  }

  const floorZoom = Math.max(
    GLOBAL_TRANSPORT_PLAN_CONFIG.camera.minZoom,
    anchorCamera.zoom - coveredZoomOutLevels,
  );
  const screenPoints = COVER_SCREEN_ANCHORS.map((anchor) => {
    switch (anchor) {
      case "center":
        return {
          x: anchorCamera.viewportWidthCssPx / 2,
          y: anchorCamera.viewportHeightCssPx / 2,
        };
      case "top-left":
        return { x: 0, y: 0 };
      case "top-right":
        return { x: anchorCamera.viewportWidthCssPx, y: 0 };
      case "bottom-left":
        return { x: 0, y: anchorCamera.viewportHeightCssPx };
      case "bottom-right":
        return {
          x: anchorCamera.viewportWidthCssPx,
          y: anchorCamera.viewportHeightCssPx,
        };
    }
  });
  const sampledBounds = screenPoints.map((screenPoint) =>
    visibleWorldBounds(zoomCameraAroundScreenPoint(anchorCamera, floorZoom, screenPoint)),
  );
  const union = unionGlobalMapBounds([
    visibleWorldBounds(anchorCamera),
    ...sampledBounds,
    lineBounds,
  ]);
  const expanded = union ? expandGlobalMapBounds(union, boundsPaddingRatio) : undefined;
  const coverageBounds = clampWorldBounds(expanded);
  if (!coverageBounds || coverageBounds.maxX <= coverageBounds.minX || coverageBounds.maxY <= coverageBounds.minY) {
    return undefined;
  }
  return { floorZoom, coverageBounds };
}

export const computeSelectedLineCoverageBounds = calculateSelectedLineCoverageBounds;

function stableNumber(value: number, precision: number): string {
  return value.toFixed(precision);
}

export function selectedLineBasemapCoverDefinitionKey(
  input: SelectedLineBasemapCoverDefinitionInput,
): string | undefined {
  if (
    !input.lineId.trim() ||
    !isValidCamera(input.anchorCamera) ||
    !isValidGlobalMapBounds(input.lineBounds) ||
    !isValidCoverOptions(input.options) ||
    (input.layer !== "plan" && input.layer !== "satellite") ||
    (input.basemapStyle !== "light" && input.basemapStyle !== "voyager")
  ) {
    return undefined;
  }
  const { anchorCamera, lineBounds, options } = input;
  return [
    input.lineId,
    stableNumber(anchorCamera.centerWorldX, 12),
    stableNumber(anchorCamera.centerWorldY, 12),
    stableNumber(anchorCamera.zoom, 4),
    Math.round(anchorCamera.viewportWidthCssPx),
    Math.round(anchorCamera.viewportHeightCssPx),
    stableNumber(anchorCamera.pixelRatio, 4),
    stableNumber(lineBounds.minX, 12),
    stableNumber(lineBounds.minY, 12),
    stableNumber(lineBounds.maxX, 12),
    stableNumber(lineBounds.maxY, 12),
    input.layer,
    input.basemapStyle,
    stableNumber(options.coveredZoomOutLevels, 4),
    stableNumber(options.detailLeadLevels, 4),
    Math.floor(options.maxSourceZoom),
    Math.floor(options.maxTiles),
    Math.floor(options.maxEstimatedDecodedBytes),
    stableNumber(options.boundsPaddingRatio, 6),
  ].join(":");
}

export function selectedLineBasemapCoverDensity(
  layer: TransportMapBasemapLayer,
  pixelRatio: number,
  retinaPixelRatio: number,
): 1 | 2 {
  return layer === "plan" && pixelRatio >= retinaPixelRatio ? 2 : 1;
}

export function createSelectedLineBasemapCoverDefinition(
  input: SelectedLineBasemapCoverDefinitionInput,
): SelectedLineBasemapCoverDefinition | undefined {
  const key = selectedLineBasemapCoverDefinitionKey(input);
  const options = input.options;
  const boundsResult = calculateSelectedLineCoverageBounds(
    input.anchorCamera,
    input.lineBounds,
    options.coveredZoomOutLevels,
    options.boundsPaddingRatio,
  );
  if (!key || !boundsResult) return undefined;

  const density = selectedLineBasemapCoverDensity(
    input.layer,
    input.anchorCamera.pixelRatio,
    options.retinaPixelRatio,
  );
  const bytesPerDecodedTile = (256 * density) ** 2 * 4;
  const maxEstimatedDecodedBytes = Math.floor(options.maxEstimatedDecodedBytes);
  const memoryTileBudget = Math.floor(maxEstimatedDecodedBytes / bytesPerDecodedTile);
  const configuredMaxTiles = Math.floor(options.maxTiles);
  const effectiveMaxTiles = Math.max(1, Math.min(configuredMaxTiles, memoryTileBudget));
  if (
    !Number.isFinite(bytesPerDecodedTile) ||
    !Number.isFinite(maxEstimatedDecodedBytes) ||
    maxEstimatedDecodedBytes < bytesPerDecodedTile ||
    !Number.isFinite(effectiveMaxTiles) ||
    effectiveMaxTiles < 1
  ) {
    return undefined;
  }

  const requestedSourceZoom = Math.max(
    0,
    Math.min(
      Math.floor(options.maxSourceZoom),
      Math.ceil(input.anchorCamera.zoom) + Math.max(0, options.detailLeadLevels),
    ),
  );
  const sourceCamera: CameraState = {
    ...input.anchorCamera,
    zoom: requestedSourceZoom,
  };
  const createSourceTiles = (coverageBounds: GlobalMapBounds): TransportMapBasemapTile[] =>
    createTransportMapBasemapTiles(sourceCamera, {
      layer: input.layer,
      style: input.basemapStyle,
      pixelRatio: input.anchorCamera.pixelRatio,
      maxTiles: effectiveMaxTiles,
      highZoomMaxTiles: effectiveMaxTiles,
      overscanTiles: 0,
      minZoom: 0,
      maxZoom: requestedSourceZoom,
      retinaPixelRatio: options.retinaPixelRatio,
      showCityAndStreetLabels: options.showCityAndStreetLabels,
      worldBounds: coverageBounds,
    });

  let coverageBounds = boundsResult.coverageBounds;
  let sourceTiles = createSourceTiles(coverageBounds);
  const currentSourceZoom = sourceTiles[0]?.zoom;
  if (currentSourceZoom !== undefined && currentSourceZoom < requestedSourceZoom) {
    const fallbackPadding = Math.min(
      options.boundsPaddingRatio,
      COVER_BUDGET_FALLBACK_PADDING_RATIO,
    );
    if (fallbackPadding < options.boundsPaddingRatio) {
      const fallbackBounds = calculateSelectedLineCoverageBounds(
        input.anchorCamera,
        input.lineBounds,
        options.coveredZoomOutLevels,
        fallbackPadding,
      )?.coverageBounds;
      if (fallbackBounds) {
        const fallbackTiles = createSourceTiles(fallbackBounds);
        if (
          fallbackTiles.length > 0 &&
          fallbackTiles.length <= effectiveMaxTiles &&
          fallbackTiles[0]?.zoom !== undefined &&
          fallbackTiles[0].zoom > currentSourceZoom &&
          fallbackTiles.every((tile) => tile.zoom === fallbackTiles[0]?.zoom)
        ) {
          coverageBounds = fallbackBounds;
          sourceTiles = fallbackTiles;
        }
      }
    }
  }
  if (sourceTiles.length === 0) return undefined;
  const sourceZoom = sourceTiles[0]?.zoom;
  if (sourceZoom === undefined || sourceTiles.some((tile) => tile.zoom !== sourceZoom)) return undefined;
  if (sourceTiles.length > effectiveMaxTiles) return undefined;

  const estimatedDecodedBytes = sourceTiles.length * bytesPerDecodedTile;
  if (estimatedDecodedBytes > maxEstimatedDecodedBytes) return undefined;
  const tiles = sourceTiles.map((tile) => reprojectTransportMapBasemapTile(tile, input.anchorCamera));
  return {
    key,
    lineId: input.lineId,
    anchorCamera: { ...input.anchorCamera },
    coverageBounds: boundsResult.coverageBounds,
    floorZoom: boundsResult.floorZoom,
    requestedSourceZoom,
    sourceZoom,
    density,
    bytesPerDecodedTile,
    estimatedDecodedBytes,
    effectiveMaxTiles,
    tiles,
    signature: tileDefinitionSignature(tiles),
  };
}

export const buildSelectedLineBasemapCoverDefinition = createSelectedLineBasemapCoverDefinition;
