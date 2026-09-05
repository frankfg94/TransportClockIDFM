import { describe, expect, it } from "vitest";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { screenToWorld, worldToScreen } from "../src/features/transport-map/geo/coordinateKernel";
import {
  BASEMAP_TILE_EDGE_OVERLAP_CSS_PX,
  createTransportMapBasemapTiles,
  reprojectTransportMapBasemapTile,
} from "../src/features/transport-map/basemap/tileMath";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../src/features/transport-map/config/globalTransportPlanConfig";

describe("global map basemap tile math", () => {
  it("uses the same camera transform as the transport canvas", () => {
    const camera = createCamera({
      centerWorldX: 0.5065,
      centerWorldY: 0.352,
      zoom: 12.4,
      viewportWidthCssPx: 900,
      viewportHeightCssPx: 560,
      pixelRatio: 2,
    });
    const tiles = createTransportMapBasemapTiles(camera, { maxTiles: 48 });
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(48);
    expect(tiles.some((tile) => tile.priority === "visible")).toBe(true);

    const tile = tiles.find((candidate) => candidate.priority === "visible")!;
    const scale = 2 ** tile.zoom;
    const expectedTopLeft = worldToScreen({ x: tile.tileX / scale, y: tile.tileY / scale }, camera);
    const expectedBottomRight = worldToScreen({ x: (tile.tileX + 1) / scale, y: (tile.tileY + 1) / scale }, camera);
    expect(tile.leftCssPx).toBeCloseTo(expectedTopLeft.x, 10);
    expect(tile.topCssPx).toBeCloseTo(expectedTopLeft.y, 10);
    expect(tile.widthCssPx).toBeCloseTo(
      expectedBottomRight.x - expectedTopLeft.x + BASEMAP_TILE_EDGE_OVERLAP_CSS_PX,
      10,
    );
    expect(tile.heightCssPx).toBeCloseTo(
      expectedBottomRight.y - expectedTopLeft.y + BASEMAP_TILE_EDGE_OVERLAP_CSS_PX,
      10,
    );

    const centerScreen = { x: camera.viewportWidthCssPx / 2, y: camera.viewportHeightCssPx / 2 };
    const centerWorld = screenToWorld(centerScreen, camera);
    expect(centerWorld.x).toBe(camera.centerWorldX);
    expect(centerWorld.y).toBe(camera.centerWorldY);
  });

  it("keeps the raster request bounded and selects high-density tiles", () => {
    const camera = createCamera({
      centerWorldX: 0.5065,
      centerWorldY: 0.352,
      zoom: 18.75,
      viewportWidthCssPx: 1440,
      viewportHeightCssPx: 900,
      pixelRatio: 3,
    });
    const tiles = createTransportMapBasemapTiles(camera, { maxTiles: 24, overscanTiles: 1 });
    expect(tiles.length).toBeLessThanOrEqual(24);
    expect(tiles.every((tile) => tile.url.includes("basemaps.cartocdn.com/light_nolabels/"))).toBe(true);
    expect(tiles.every((tile) => tile.url.endsWith("@2x.png"))).toBe(true);
    expect(new Set(tiles.map((tile) => tile.id)).size).toBe(tiles.length);
  });

  it("supports keyless OpenStreetMap tiles without retina suffixes", () => {
    const camera = createCamera({
      centerWorldX: 0.5065,
      centerWorldY: 0.352,
      zoom: 14,
      viewportWidthCssPx: 900,
      viewportHeightCssPx: 560,
      pixelRatio: 3,
    });
    const tiles = createTransportMapBasemapTiles(camera, {
      provider: "openstreetmap",
      maxTiles: 24,
    });

    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((tile) => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/u.test(tile.url))).toBe(true);
    expect(tiles.every((tile) => !tile.url.includes("@2x"))).toBe(true);
    expect(tiles.every((tile) => tile.id.endsWith("/openstreetmap"))).toBe(true);
  });

  it("can switch city and street labels on independently of the tile math", () => {
    const camera = createCamera({
      centerWorldX: 0.5065,
      centerWorldY: 0.352,
      zoom: 12,
      viewportWidthCssPx: 900,
      viewportHeightCssPx: 560,
    });

    const labelledTile = createTransportMapBasemapTiles(camera, {
      maxTiles: 8,
      style: "voyager",
      showCityAndStreetLabels: true,
    })[0]!;
    const plainTile = createTransportMapBasemapTiles(camera, {
      maxTiles: 8,
      style: "voyager",
      showCityAndStreetLabels: false,
    })[0]!;
    const lightTile = createTransportMapBasemapTiles(camera, {
      maxTiles: 8,
      style: "light",
      showCityAndStreetLabels: true,
    })[0]!;

    expect(labelledTile.url).toContain("basemaps.cartocdn.com/rastertiles/voyager/");
    expect(plainTile.url).toContain("basemaps.cartocdn.com/rastertiles/voyager_nolabels/");
    expect(lightTile.url).toContain("basemaps.cartocdn.com/light_all/");
    expect(lightTile.id).not.toBe(labelledTile.id);
  });

  it("builds satellite tiles with a separate raster identity", () => {
    const camera = createCamera({
      centerWorldX: 0.5065,
      centerWorldY: 0.352,
      zoom: 12,
      viewportWidthCssPx: 900,
      viewportHeightCssPx: 560,
      pixelRatio: 3,
    });

    const planTile = createTransportMapBasemapTiles(camera, { maxTiles: 8 })[0]!;
    const satelliteTile = createTransportMapBasemapTiles(camera, {
      layer: "satellite",
      maxTiles: 8,
    })[0]!;

    expect(satelliteTile.url).toContain(
      "server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/",
    );
    expect(satelliteTile.url).not.toContain("@2x");
    expect(satelliteTile.id).toMatch(/^satellite\//);
    expect(satelliteTile.id).not.toBe(planTile.id);
  });

  it("keeps the detailed XYZ level for fractional line-view zooms", () => {
    const camera = createCamera({
      centerWorldX: 0.5065,
      centerWorldY: 0.352,
      zoom: 12.4,
      viewportWidthCssPx: 1_385,
      viewportHeightCssPx: 905,
      pixelRatio: 1.25,
    });
    const tiles = createTransportMapBasemapTiles(camera, {
      maxTiles: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.maxTiles,
      highZoomMin: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.highZoomMin,
      highZoomMaxTiles: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.highZoomMaxTiles,
      overscanTiles: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.overscanTiles,
    });

    expect(new Set(tiles.map((tile) => tile.zoom))).toEqual(new Set([13]));
    expect(tiles.length).toBeGreaterThan(48);
    expect(tiles.length).toBeLessThanOrEqual(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.highZoomMaxTiles);
  });

  it("keeps native raster detail at the initial fractional line zoom", () => {
    const camera = createCamera({
      centerWorldX: 0.5065,
      centerWorldY: 0.344,
      zoom: 9.6,
      viewportWidthCssPx: 1_265,
      viewportHeightCssPx: 625,
      pixelRatio: 1.25,
    });
    const tiles = createTransportMapBasemapTiles(camera, {
      maxTiles: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.maxTiles,
      highZoomMin: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.highZoomMin,
      highZoomMaxTiles: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.highZoomMaxTiles,
      overscanTiles: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.overscanTiles,
    });

    expect(new Set(tiles.map((tile) => tile.zoom))).toEqual(new Set([Math.ceil(camera.zoom)]));
    expect(tiles.length).toBeLessThanOrEqual(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.maxTiles);
  });

  it("falls back to a coarser raster level when the visible window exceeds the budget", () => {
    const camera = createCamera({
      centerWorldX: 0.5,
      centerWorldY: 0.5,
      zoom: 8,
      viewportWidthCssPx: 2200,
      viewportHeightCssPx: 1400,
      pixelRatio: 1,
    });
    const tiles = createTransportMapBasemapTiles(camera, { maxTiles: 8, overscanTiles: 1 });
    expect(tiles.length).toBeLessThanOrEqual(8);
    expect(Math.max(...tiles.map((tile) => tile.zoom))).toBeLessThanOrEqual(camera.zoom);
  });

  it("can enumerate the complete tile rectangle of a focused line", () => {
    const camera = createCamera({
      centerWorldX: 0.5,
      centerWorldY: 0.35,
      zoom: 8,
      viewportWidthCssPx: 900,
      viewportHeightCssPx: 560,
    });
    const bounds = { minX: 0.48, minY: 0.33, maxX: 0.52, maxY: 0.37 };
    const tiles = createTransportMapBasemapTiles(camera, {
      maxTiles: Number.MAX_SAFE_INTEGER,
      highZoomMaxTiles: Number.MAX_SAFE_INTEGER,
      overscanTiles: 0,
      worldBounds: bounds,
    });

    expect(tiles.length).toBeGreaterThan(48);
    expect(tiles.every((tile) => tile.zoom === Math.ceil(camera.zoom))).toBe(true);
    expect(new Set(tiles.map((tile) => tile.id)).size).toBe(tiles.length);
  });

  it("reprojects a retained fallback tile without changing its raster identity", () => {
    const initialCamera = createCamera({
      centerWorldX: 0.5,
      centerWorldY: 0.5,
      zoom: 12.2,
      viewportWidthCssPx: 900,
      viewportHeightCssPx: 560,
    });
    const nextCamera = { ...initialCamera, centerWorldX: 0.501, zoom: 13.1, generation: 2 };
    const tile = createTransportMapBasemapTiles(initialCamera, { maxTiles: 8 })[0]!;
    const reprojected = reprojectTransportMapBasemapTile(tile, nextCamera);

    expect(reprojected.id).toBe(tile.id);
    expect(reprojected.url).toBe(tile.url);
    expect(reprojected.zoom).toBe(tile.zoom);
    expect(reprojected.leftCssPx).not.toBe(tile.leftCssPx);
    expect(reprojected.widthCssPx).not.toBe(tile.widthCssPx);
  });
});
