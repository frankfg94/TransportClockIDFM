import { describe, expect, it } from "vitest";
import { createCamera } from "../src/features/transport-map/geo/camera";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../src/features/transport-map/config/globalTransportPlanConfig";
import {
  calculateSelectedLineCoverageBounds,
  createSelectedLineBasemapCoverDefinition,
  expandGlobalMapBounds,
  selectedLineBasemapCoverDefinitionKey,
  selectedLineBasemapCoverDensity,
  unionGlobalMapBounds,
  type SelectedLineBasemapCoverOptions,
} from "../src/features/transport-map/basemap/selectedLineBasemapCover";
import type { GlobalMapBounds } from "../src/features/transport-map/contracts/manifest";

const coverOptions: SelectedLineBasemapCoverOptions = {
  ...GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.basemapCover,
  retinaPixelRatio: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.retinaPixelRatio,
  showCityAndStreetLabels: GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.showCityAndStreetLabels,
};

const lineBounds: GlobalMapBounds = {
  minX: 0.492,
  minY: 0.338,
  maxX: 0.508,
  maxY: 0.362,
};

function anchorCamera() {
  return createCamera({
    centerWorldX: 0.5,
    centerWorldY: 0.35,
    viewportWidthCssPx: 900,
    viewportHeightCssPx: 560,
    pixelRatio: 1,
    zoom: 12,
  });
}

function definitionInput(overrides: Partial<ReturnType<typeof anchorCamera>> = {}) {
  return {
    lineId: "line:IDFM:C01384",
    anchorCamera: { ...anchorCamera(), ...overrides },
    lineBounds,
    layer: "plan" as const,
    basemapStyle: "light" as const,
    options: coverOptions,
  };
}

describe("selected line basemap cover geometry", () => {
  it("unions the anchor viewport, the five floor-zoom samples, and line geometry", () => {
    const result = calculateSelectedLineCoverageBounds(anchorCamera(), lineBounds, 4.5, 0.05);

    expect(result).toBeDefined();
    expect(result?.floorZoom).toBe(7.5);
    expect(result?.coverageBounds.minX).toBeLessThan(lineBounds.minX);
    expect(result?.coverageBounds.minY).toBeLessThan(lineBounds.minY);
    expect(result?.coverageBounds.maxX).toBeGreaterThan(lineBounds.maxX);
    expect(result?.coverageBounds.maxY).toBeGreaterThan(lineBounds.maxY);
  });

  it("clamps expanded world bounds without producing invalid coordinates", () => {
    const expanded = expandGlobalMapBounds({ minX: 0.9, minY: 0.8, maxX: 1, maxY: 1 }, 1);
    expect(expanded?.minX).toBeCloseTo(0.8);
    expect(expanded?.minY).toBeCloseTo(0.6);
    expect(expanded?.maxX).toBeCloseTo(1.1);
    expect(expanded?.maxY).toBeCloseTo(1.2);
    const result = calculateSelectedLineCoverageBounds(
      createCamera({ centerWorldX: 0.99, centerWorldY: 0.99, zoom: 20 }),
      { minX: 0.98, minY: 0.98, maxX: 1, maxY: 1 },
      0,
      1,
    );
    const bounds = result?.coverageBounds;
    expect(bounds).toBeDefined();
    expect(bounds?.minX).toBeGreaterThanOrEqual(0);
    expect(bounds?.minY).toBeGreaterThanOrEqual(0);
    expect(bounds?.maxX).toBeLessThanOrEqual(1);
    expect(bounds?.maxY).toBeLessThanOrEqual(1);
  });

  it("unions only finite bounds and returns undefined for an empty list", () => {
    expect(unionGlobalMapBounds([undefined, { minX: 0.2, minY: 0.3, maxX: 0.4, maxY: 0.5 }])).toEqual({
      minX: 0.2,
      minY: 0.3,
      maxX: 0.4,
      maxY: 0.5,
    });
    expect(unionGlobalMapBounds([])).toBeUndefined();
  });
});

describe("selected line basemap cover definition", () => {
  it("does not include camera generation in the immutable definition key", () => {
    const first = definitionInput({ generation: 10 });
    const second = definitionInput({ generation: 11 });

    expect(selectedLineBasemapCoverDefinitionKey(first)).toBe(
      selectedLineBasemapCoverDefinitionKey(second),
    );
  });

  it("changes the key for line identity, anchor camera, geometry, and raster style", () => {
    const base = definitionInput();
    expect(selectedLineBasemapCoverDefinitionKey({ ...base, lineId: "line:IDFM:C014" })).not.toBe(
      selectedLineBasemapCoverDefinitionKey(base),
    );
    expect(
      selectedLineBasemapCoverDefinitionKey({
        ...base,
        lineBounds: { ...lineBounds, maxX: lineBounds.maxX + 0.001 },
      }),
    ).not.toBe(selectedLineBasemapCoverDefinitionKey(base));
    expect(
      selectedLineBasemapCoverDefinitionKey({ ...base, basemapStyle: "voyager" }),
    ).not.toBe(selectedLineBasemapCoverDefinitionKey(base));
  });

  it("uses density two only for retina plan tiles and density one for satellite", () => {
    expect(selectedLineBasemapCoverDensity("plan", 2, 1.5)).toBe(2);
    expect(selectedLineBasemapCoverDensity("plan", 1, 1.5)).toBe(1);
    expect(selectedLineBasemapCoverDensity("satellite", 3, 1.5)).toBe(1);
  });

  it("builds one fixed source zoom and reprojects every tile to the anchor", () => {
    const definition = createSelectedLineBasemapCoverDefinition(definitionInput());

    expect(definition).toBeDefined();
    expect(definition?.tiles.length).toBeGreaterThan(0);
    expect(new Set(definition?.tiles.map((tile) => tile.zoom)).size).toBe(1);
    expect(definition?.sourceZoom).toBeGreaterThanOrEqual(0);
    expect(definition?.sourceZoom).toBeLessThanOrEqual(coverOptions.maxSourceZoom);
    expect(definition?.tiles.every((tile) => tile.priority === "visible")).toBe(true);
    expect(definition?.tiles.every((tile) => Number.isFinite(tile.leftCssPx))).toBe(true);
  });

  it("enforces the tile and decoded-memory budgets for retina plan output", () => {
    const definition = createSelectedLineBasemapCoverDefinition(definitionInput({ pixelRatio: 2 }));

    expect(definition).toBeDefined();
    expect(definition?.density).toBe(2);
    expect(definition?.bytesPerDecodedTile).toBe(1_048_576);
    expect(definition?.tiles.length).toBeLessThanOrEqual(coverOptions.maxTiles);
    expect(definition?.estimatedDecodedBytes).toBeLessThanOrEqual(
      coverOptions.maxEstimatedDecodedBytes,
    );
  });

  it("keeps satellite memory at one density even on a retina camera", () => {
    const definition = createSelectedLineBasemapCoverDefinition({
      ...definitionInput({ pixelRatio: 2 }),
      layer: "satellite",
    });

    expect(definition).toBeDefined();
    expect(definition?.density).toBe(1);
    expect(definition?.bytesPerDecodedTile).toBe(262_144);
    expect(definition?.estimatedDecodedBytes).toBeLessThanOrEqual(
      coverOptions.maxEstimatedDecodedBytes,
    );
  });

  it("falls back to a coarser single source level when the requested level exceeds the budget", () => {
    const definition = createSelectedLineBasemapCoverDefinition({
      ...definitionInput({ zoom: 18 }),
      lineBounds: { minX: 0.1, minY: 0.1, maxX: 0.9, maxY: 0.9 },
      options: { ...coverOptions, maxTiles: 2, maxEstimatedDecodedBytes: 2 * 262_144 },
    });

    expect(definition).toBeDefined();
    expect(definition?.tiles.length).toBeLessThanOrEqual(2);
    expect(new Set(definition?.tiles.map((tile) => tile.zoom)).size).toBe(1);
    expect(definition?.sourceZoom).toBeLessThan(definition?.requestedSourceZoom ?? Number.POSITIVE_INFINITY);
  });

  it("rejects invalid camera, bounds, identity, and budget options", () => {
    expect(
      selectedLineBasemapCoverDefinitionKey({
        ...definitionInput(),
        lineId: "",
      }),
    ).toBeUndefined();
    expect(
      selectedLineBasemapCoverDefinitionKey({
        ...definitionInput({ zoom: Number.NaN }),
      }),
    ).toBeUndefined();
    expect(
      selectedLineBasemapCoverDefinitionKey({
        ...definitionInput(),
        lineBounds: { minX: 0.5, minY: 0.5, maxX: 0.4, maxY: 0.6 },
      }),
    ).toBeUndefined();
    expect(
      selectedLineBasemapCoverDefinitionKey({
        ...definitionInput(),
        options: { ...coverOptions, maxTiles: 0 },
      }),
    ).toBeUndefined();
  });

  it("keeps the signature deterministic for the same fixed tile set", () => {
    const first = createSelectedLineBasemapCoverDefinition(definitionInput());
    const second = createSelectedLineBasemapCoverDefinition(definitionInput());

    expect(first?.signature).toBe(second?.signature);
    expect(first?.key).toBe(second?.key);
  });
});
