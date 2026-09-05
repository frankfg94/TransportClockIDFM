import { describe, expect, it } from "vitest";
import {
  GLOBAL_TRANSPORT_PLAN_CONFIG,
  globalTransportPlanLineWidth,
} from "../src/features/transport-map/config/globalTransportPlanConfig";

describe("global transport plan renderer configuration", () => {
  it("exposes Bus and Noctilien as primary network choices", () => {
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.primaryModes).toEqual(
      expect.arrayContaining(["BUS", "NOCTILIEN"]),
    );
  });

  it("keeps family-specific widths in the shared configuration", () => {
    expect(globalTransportPlanLineWidth("METRO")).toBe(GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.modeLineWidth.METRO);
    expect(globalTransportPlanLineWidth("RER")).toBeGreaterThan(globalTransportPlanLineWidth("BUS"));
    expect(globalTransportPlanLineWidth("RER")).toBeGreaterThan(globalTransportPlanLineWidth("METRO"));
    expect(globalTransportPlanLineWidth("TRAIN")).toBeGreaterThan(globalTransportPlanLineWidth("METRO"));
    expect(globalTransportPlanLineWidth("METRO")).toBeGreaterThan(globalTransportPlanLineWidth("BUS"));
    expect(globalTransportPlanLineWidth("METRO")).toBeGreaterThan(globalTransportPlanLineWidth("TRAM"));
    expect(globalTransportPlanLineWidth("TRAM")).toBeGreaterThan(globalTransportPlanLineWidth("BUS"));
    expect(globalTransportPlanLineWidth("TRAM")).toBeGreaterThan(globalTransportPlanLineWidth("NOCTILIEN"));
    expect(globalTransportPlanLineWidth("BUS")).toBe(GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.modeLineWidth.BUS);
    expect(globalTransportPlanLineWidth("NOCTILIEN")).toBe(GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.modeLineWidth.NOCTILIEN);
    expect(globalTransportPlanLineWidth("NOCTILIEN")).toBeLessThan(globalTransportPlanLineWidth("METRO"));
    expect(globalTransportPlanLineWidth("METRO", true)).toBe(GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.activeLineWidth);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.showBusOnlyStationNodesInOverview).toBe(false);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.limitHeavyLineWidthAtOverviewZoom).toBe(true);
    expect(globalTransportPlanLineWidth("RER", false, 8)).toBe(
      GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.overviewHeavyLineWidthMaxCssPx,
    );
    expect(globalTransportPlanLineWidth("METRO", false, 8)).toBe(
      GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.overviewHeavyLineWidthMaxCssPx,
    );
    expect(globalTransportPlanLineWidth("BUS", false, 8)).toBe(
      GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.modeLineWidth.BUS,
    );
    expect(globalTransportPlanLineWidth("RER", false, 15)).toBe(
      GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.modeLineWidth.RER,
    );
    expect(globalTransportPlanLineWidth("RER", true, 8)).toBe(
      GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.activeLineWidth,
    );
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.selectedStationRadius).toBe(12);
    expect(globalTransportPlanLineWidth("METRO")).toBeGreaterThan(
      GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.modeLineWidth.BUS,
    );
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.pathRounding.maximumCornerRadiusCssPx).toBeGreaterThan(0);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.pathRounding.activeLineMinimumPointDistanceCssPx).toBeLessThan(
      GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.pathRounding.minimumPointDistanceCssPx,
    );
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.pathRounding.activeLineMicroSegmentLengthMultiplier).toBe(0);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.pathRounding.railMicroSegmentLengthMultiplier).toBe(0);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.ghostLineAlpha).toBeGreaterThan(0);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.ghostLineAlpha).toBeLessThan(
      GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.modePathAlpha.DEFAULT,
    );
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.ghostLineAlpha).toBeLessThan(
      GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.modePathAlpha.ACTIVE,
    );
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.lod.minimumLevelByMode.TRAIN).toBe(2);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.lod.minimumLevelByMode.TRANSILIEN).toBe(2);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.hoveredGhostLineAlpha).toBe(1);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.enabled).toBe(true);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.zoomDurationMs).toBeGreaterThan(
      GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation.panDurationMs,
    );
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.camera.wheelViewportRefreshLeadMs).toBe(700);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.camera.panSensitivity).toBeCloseTo(0.92);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.camera.wheelZoomFactor).toBeCloseTo(0.0024);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.camera.zoomSmoothingMs).toBe(45);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.wheelTilePreloading.zoomOut).toBe(true);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.wheelTilePreloading.duringZoom).toBe(true);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.wheelTilePreloading.intervalMs).toBeGreaterThan(0);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.overscanTiles).toBe(1);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.background).toBe("#fffbf0");
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.showCityAndStreetLabels).toBe(true);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.style.default).toBe("light");
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.style.options).toEqual(["voyager", "light"]);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.keepStationLabelsDuringZoom).toBe(true);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.detailLineMinZoom).toBe(9);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.biggerTiles).toBe(true);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.fallbackLineMinZoom).toBe(11);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.maxContinuousGtfsEndpointAlignmentMeters).toBe(25);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.preloadActiveLineTiles).toBe(false);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.basemapCover).toMatchObject({
      enabled: true,
      coveredZoomOutLevels: 4.5,
      anchorZoom: 15.75,
      detailLeadLevels: 2,
      maxSourceZoom: 14,
      maxTiles: 64,
      maxEstimatedDecodedBytes: 32 * 1024 * 1024,
      boundsPaddingRatio: 0.05,
      retryCount: 1,
      retryDelayMs: 500,
      liveRefreshIntervalMs: 240,
      maxLiveRefreshesDuringGesture: 0,
    });
    expect(
      GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.basemapCover.maxEstimatedDecodedBytes,
    ).toBeLessThanOrEqual(32 * 1024 * 1024);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.basemapBridgeCovers).toEqual([
      expect.objectContaining({ id: "mid", anchorZoom: 14.6, maxSourceZoom: 14, maxTiles: 64 }),
      expect.objectContaining({ id: "z14-detail-low", anchorZoom: 13.85, maxSourceZoom: 14, maxTiles: 64 }),
      expect.objectContaining({ id: "detail", anchorZoom: 14.7, maxSourceZoom: 15, maxTiles: 64 }),
      expect.objectContaining({ id: "high-viewport", anchorZoom: 15.8, maxSourceZoom: 16, maxTiles: 64 }),
    ]);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.data).toMatchObject({
      decodedChunkCacheMaxEntries: 96,
      decodedChunkCacheMaxBytes: 96 * 1024 * 1024,
    });
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.highFidelityGhostCorrespondences).toBe(true);
    expect(GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.svg.resizeStrokesDuringZoom).toBe(true);
  });
});
