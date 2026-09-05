import type { GlobalMapMode } from "../contracts/manifest.js";
import { STATION_CORRESPONDENCE_RADIUS_METERS } from "../spatial/stationCorrespondences.js";
import { DEFAULT_NEXT_VECTOR_STYLE_URL } from "../next/nextMapConfig.js";

export type TransportMapBasemapStyle = "light" | "voyager";

/**
 * Runtime tuning for the web global map. Data-owned values such as line
 * colours deliberately do not live here: they come from the precompiled
 * line presentation palette shared with the V1 map.
 */
export const GLOBAL_TRANSPORT_PLAN_CONFIG = {
  camera: {
    minZoom: 0,
    maxZoom: 20,
    // Keep wheel increments small while settling each gesture quickly. This
    // leaves a short visual transition without making the map feel slippery.
    wheelZoomFactor: 0.0024,
    // Keep pointer panning slightly calmer than the raw pointer delta while
    // preserving the same ratio for the inertia that follows release.
    panSensitivity: 0.92,
    inertiaFrictionPerSecond: 0.0015,
    inertiaMaxFrameMs: 100,
    zoomSmoothingMs: 45,
    // Start the viewport data refresh before the wheel easing fully settles,
    // so chunk loading overlaps the last part of the camera animation.
    wheelViewportRefreshLeadMs: 700,
    viewportRefreshDebounceMs: 70,
    maxDevicePixelRatio: 3,
    progressiveNavigation: {
      // Navigation combines these durations into one simultaneous center/zoom
      // flight while preserving the established total timing.
      enabled: true,
      zoomDurationMs: 850,
      panDurationMs: 220,
    },
  },
  lineMap: {
    // A focused line is small enough to keep its scene data, labels and stroke
    // geometry available while zooming in or out. Station dot visibility still
    // follows the shared overview LOD so hidden dots cannot capture a pointer.
    keepStationLabelsDuringZoom: true,
    // Kept as the legacy detailed-view threshold for configuration
    // compatibility. A line selected through ?line now keeps its GTFS detail
    // at every camera zoom.
    detailLineMinZoom: 9,
    // Use a wider logical chunk envelope while a line is focused. The static
    // pack remains on its z11 grid; this only keeps more neighbouring chunks
    // ready for comfortable panning around a selected line.
    biggerTiles: true,
    // Keep the overview fallback available until the normal detailed layer
    // becomes visible when no line is focused.
    fallbackLineMinZoom: 11,
    // Do not translate a complete GTFS route to a canonical station when the
    // provider endpoint is farther away than this. The GTFS curve stays in
    // place and receives only a short local connector to the station, so
    // endpoint reconciliation cannot move it across nearby buildings.
    maxContinuousGtfsEndpointAlignmentMeters: 25,
    // Preload the raster tiles covering the complete focused-line rectangle,
    // not only the current camera viewport.
    // TODO : buggy, tofix
    preloadActiveLineTiles: false,
    // A bounded, single-source-zoom safety mosaic is prepared only by
    // GlobalTransportPlan when a line is selected. It is intentionally kept
    // separate from the legacy preloadBounds path and from Nearby's cover.
    basemapCover: {
      enabled: true,
      // Four and a half levels cover the complete supported dezoom while the retained
      // live mosaic handles the first part of the gesture. The bounded budget
      // forces a coarser source for unusually broad line envelopes.
      coveredZoomOutLevels: 4.5,
      // Keep the fixed safety mosaic detailed at the reference gesture's
      // destination (13.5 -> 11.6). This is an immutable raster anchor, not
      // a per-frame camera target; the live layer still owns the normal map.
      anchorZoom: 15.75,
      detailLeadLevels: 2,
      maxSourceZoom: 14,
      maxTiles: 64,
      maxEstimatedDecodedBytes: 32 * 1024 * 1024,
      boundsPaddingRatio: 0.05,
      retryCount: 1,
      retryDelayMs: 500,
      // The immutable covers and the retained previous live definition are the
      // safety net during a selected-line gesture. Do not remount a hidden live
      // grid while frames are being presented; the exact destination refreshes
      // atomically after settle and then becomes the next retained fallback.
      liveRefreshIntervalMs: 240,
      maxLiveRefreshesDuringGesture: 0,
    },
    // Immutable viewport composites bridge the gap between the detailed live
    // raster and the broad z12 line cover. They are decoded before a gesture
    // and never remounted while the wheel is moving.
    basemapBridgeCovers: [
      {
        id: "mid",
        anchorZoom: 14.6,
        coveredZoomOutLevels: 1.8,
        detailLeadLevels: 0,
        maxSourceZoom: 14,
        maxTiles: 64,
        maxEstimatedDecodedBytes: 32 * 1024 * 1024,
        boundsPaddingRatio: 0.01,
        // Cover the complete supported z12.1 floor directly with z12 pixels;
        // this avoids a late switch to the broad z11 safety mosaic.
        fadeStartZoom: 12.1,
        fadeEndZoom: 12.3,
        fadeOutStartZoom: 12.9,
        fadeOutEndZoom: 13.2,
      },
      {
        // The broad z14 viewport bridge falls back to z13 once its four
        // off-centre zoom paths are included. Two narrow single-density bands
        // stay below 64 tiles while preserving genuine z14 pixels until the
        // z15 detail cover takes over.
        id: "z14-detail-low",
        anchorZoom: 13.85,
        coveredZoomOutLevels: 0,
        detailLeadLevels: 0,
        maxSourceZoom: 14,
        maxTiles: 64,
        maxEstimatedDecodedBytes: 32 * 1024 * 1024,
        boundsPaddingRatio: 0,
        fadeStartZoom: 13.5,
        fadeEndZoom: 13.7,
        fadeOutStartZoom: 13.95,
        fadeOutEndZoom: 14.1,
      },
      {
        id: "detail",
        anchorZoom: 14.7,
        coveredZoomOutLevels: 0,
        detailLeadLevels: 1,
        maxSourceZoom: 15,
        maxTiles: 64,
        maxEstimatedDecodedBytes: 32 * 1024 * 1024,
        boundsPaddingRatio: 0.01,
        fadeStartZoom: 14.3,
        fadeEndZoom: 14.6,
        fadeOutStartZoom: 15.45,
        fadeOutEndZoom: 15.8,
      },
      {
        id: "high-viewport",
        anchorZoom: 15.8,
        coveredZoomOutLevels: 0,
        detailLeadLevels: 1,
        maxSourceZoom: 16,
        maxTiles: 64,
        maxEstimatedDecodedBytes: 32 * 1024 * 1024,
        boundsPaddingRatio: 0.01,
        fadeStartZoom: 15.45,
        fadeEndZoom: 15.8,
        fadeOutStartZoom: 16.7,
        fadeOutEndZoom: 17,
      },
    ] as const,
    // Keep GTFS ghost correspondences on the most detailed compiled LOD at
    // every camera zoom. The focused line already keeps its complete geometry;
    // this flag only opts the secondary correspondence lines into the same
    // high-fidelity treatment.
    highFidelityGhostCorrespondences: true,
    svg: {
      // Live SVG updates are more faithful during a wheel animation but can
      // make large line maps more expensive to render. Disable this when the
      // compositor-only path is preferred on lower-powered devices.
      resizeStrokesDuringZoom: true,
    },
  },
  initialView: {
    paddingCssPx: 32,
    minZoom: 0,
    maxZoom: 16,
  },
  lineView: {
    paddingCssPx: 64,
    minZoom: 5,
    maxZoom: 17,
  },
  selection: {
    stationZoom: 15,
    entranceZoom: 17,
  },
  layout: {
    linePanelTopCssPx: 112,
    linePanelMobileTopCssPx: 154,
  },
  data: {
    maxChunkConcurrency: 2,
    // Keep the union of the detailed Saint-Lazare viewport and its z12
    // overview decoded. Repeated zoom cycles then reuse geometry instead of
    // evicting and decoding the same 60+ chunks on every direction change.
    decodedChunkCacheMaxEntries: 96,
    decodedChunkCacheMaxBytes: 96 * 1024 * 1024,
  },
  nextMap: {
    enabled: true,
    // The provider is configuration, never renderer knowledge. Deployments
    // can replace this with NUXT_PUBLIC_NEXT_MAP_STYLE_URL at build time.
    vectorStyleUrl: DEFAULT_NEXT_VECTOR_STYLE_URL,
    deckInterleaved: true,
    binaryCacheMaxBytes: 64 * 1024 * 1024,
    prefetch: {
      // Keep /map on MapLibre's normal vector-tile loading path. The
      // application must not warm off-screen transport chunks or tiles ahead
      // of the camera; MapLibre owns the basemap pipeline and cache.
      enabled: false,
      horizonMs: 280,
      intervalMs: 120,
      maxChunks: 8,
      maxBytes: 16 * 1024 * 1024,
      overscanRatio: 0.18,
      maxZoomDelta: 2,
    },
  },
  lod: {
    // The regional layer is allowed to be coarse for the heavy surface layer,
    // but rail lines keep a 25 m corridor so their GTFS route does not turn
    // into a station-to-station zigzag between zoom 11 and 14.
    regionalErrorMeters: 250,
    detailedErrorMeters: 25,
    modeErrorMeters: {
      BUS: 250,
      METRO: 25,
      RER: 25,
      TRAIN: 25,
      TRANSILIEN: 25,
      TRAM: 25,
      CABLE: 25,
      NOCTILIEN: 100,
      BIKE: 250,
    } as Record<GlobalMapMode, number>,
    // Rail paths skip the 250 m intermediate LOD as soon as the detailed
    // chunk layer is available. The current pack stores LOD1 plus full
    // vertices, so level 2 resolves to the full route geometry and keeps
    // long GTFS corridors (including TER and Transilien J) from collapsing
    // into a visibly misplaced straight segment during a global zoom.
    minimumLevelByMode: {
      // Bus regional LOD1 is intentionally station-anchored, but its
      // station-to-station chords are not a street trace. Once `/map`
      // enters the chunked urban envelope, use LOD2 (or the full vertices
      // carried by the chunk) for road modes as well.
      BUS: 2,
      NOCTILIEN: 2,
      TRAIN: 2,
      TRANSILIEN: 2,
    } as Partial<Record<GlobalMapMode, number>>,
  },
  connections: {
    // A station selection keeps the selected stop as the anchor, then exposes
    // nearby physical stops as entrance/context data. Ghost correspondences
    // themselves stay limited to the exact selected station.
    radiusMeters: STATION_CORRESPONDENCE_RADIUS_METERS,
  },
  dashboard: {
    maxStations: 12,
  },
  search: {
    debounceMs: 280,
    busRevealHoverMs: 2_000,
    majorStationMinLines: 4,
    stationLimit: 10,
    lineLimit: 10,
    // Nearby same-name records from different Paris districts are merged only
    // when the cluster is supported by several heavy-transport lines.
    sameNameMergeMaxDistanceM: 200,
    sameNameMergeMinHeavyLines: 2,
  },
  basemap: {
    // Match the blank area behind the raster tiles so an abrupt zoom-out does
    // not reveal a different colour while the next tile definition loads.
    background: "#fffbf0",
    // Keep the native XYZ level for the broad desktop viewport used by line
    // views. Forty-eight tiles forced z9 at the initial fractional z9.6
    // camera, which made the Carto raster visibly soft before any interaction.
    maxTiles: 96,
    // Carto's full styles add contextual city and street names alongside
    // the transport canvas' line and station annotations.
    showCityAndStreetLabels: true,
    style: {
      default: "light" as TransportMapBasemapStyle,
      options: ["voyager", "light"] as const,
    },
    // Keep the default just above neutral contrast so streets remain legible
    // underneath the coloured transport network while staying configurable.
    contrast: {
      default: 1.02,
      min: 0.9,
      max: 1.18,
      step: 0.02,
    },
    // Line-focused views start around z12. Fractional camera zooms at this
    // scale otherwise exceed the regional tile budget and silently fall back
    // to the previous XYZ level, which makes the Carto basemap look blurry.
    highZoomMin: 12,
    highZoomMaxTiles: 128,
    // Keep one detailed definition plus its previous fallback during a smooth
    // zoom transition. Otherwise the loading definition can expose the map
    // background before its first complete frame is ready.
    cacheMaxTiles: 256,
    // Two decoded guard rings are intentionally visible outside the definition
    // box (the basemap root performs the final clipping), so an off-centre
    // wheel anchor has real cached pixels to reveal. tileMath reduces the guard
    // before reducing source zoom when a large viewport reaches the budget.
    overscanTiles: 1,
    maxZoom: 20,
    retinaPixelRatio: 1.5,
    // Keep the Carto layer ahead of a wheel gesture. Zooming out preloads the
    // eventual viewport because the currently visible raster becomes smaller
    // during the animation and otherwise exposes the basemap background.
    wheelTilePreloading: {
      zoomOut: true,
      duringZoom: true,
      intervalMs: 240,
      maxRefreshesPerGesture: 4,
    },
  },
  renderer: {
    pathCacheMaxPixelRatio: 1.5,
    // The overview remains readable when bus is enabled without drawing a
    // node for every road stop. Hubs and selected/focused context still have
    // their own visibility rules in GlobalTransportPlan.
    showBusOnlyStationNodesInOverview: false,
    // Keep the strong family hierarchy at detailed zoom, but cap the heavy
    // rail strokes while the whole Île-de-France is on screen. This is a
    // switch because the cap is a presentation choice, not a data rule.
    limitHeavyLineWidthAtOverviewZoom: true,
    overviewHeavyLineWidthMaxZoom: 11,
    overviewHeavyLineWidthMaxCssPx: 4,
    // A selected station must remain immediately legible above dense linework;
    // the 12 px radius is twice the previous 6 px selected marker.
    selectedStationRadius: 12,
    hubStationRadius: 4,
    hoveredStationRadius: 9,
    // Match the V1 line map's 7 px station dots when a line is selected. The
    // global network keeps hub dots slightly smaller until that detail view is
    // active so the full Île-de-France surface remains readable.
    detailStationRadius: 6.5,
    // `isHub` also covers every two-line interchange in the source catalogue.
    // Keep overview dots for actual major poles, while detail zoom restores
    // every station node. Three lines is the smallest reliable major-pole
    // signal in the split quay/stop-place catalogue (Châtelet included).
    overviewMajorHubMinLines: 3,
    stationLabelZoom: 10.5,
    entranceRadius: 2.5,
    entranceLabelZoom: 15,
    // Correspondence lines stay readable, but remain visibly secondary to the
    // the focused line and to the normal network layer. The hierarchy is
    // intentional: Train/RER > Metro > Tram > Bus/Noctilien.
    ghostLineAlpha: 0.35,
    // Hovering a correspondence must make the selected path unambiguous.
    hoveredGhostLineAlpha: 1,
    // A normal line also needs a visible hover treatment when several paths
    // are stacked at the same location. It is rendered last by the Canvas
    // renderer, so a modest width increase is enough to expose the choice.
    hoveredLineAlpha: 1,
    hoveredLineWidthBoostCssPx: 2,
    // V1 uses a 10 CSS-pixel SVG stroke for its detailed line.
    activeLineWidth: 10,
    // Shared CSS-pixel rhythm for red interruption overlays. Canvas2D consumes
    // these values directly; Deck converts them to its half-stroke units.
    trafficInterruptionDashArray: [10, 12] as const,
    modeLineWidth: {
      BUS: 3,
      METRO: 6.5,
      RER: 9,
      TRAIN: 8.5,
      TRANSILIEN: 8.5,
      TRAM: 4.5,
      CABLE: 3.5,
      NOCTILIEN: 2,
      BIKE: 1.8,
    } as Record<GlobalMapMode, number>,
    pathRounding: {
      minimumPointDistanceCssPx: 0.35,
      minimumCornerSegmentLengthCssPx: 1.2,
      maximumCornerRadiusCssPx: 10,
      cornerRadiusRatio: 0.3,
      // A focused GTFS route must keep short road bends while it is visible at
      // an intermediate zoom. Otherwise the active 10 px stroke makes a
      // stop-area loop look like a straight segment through a building.
      activeLineMinimumPointDistanceCssPx: 0.1,
      activeLineMicroSegmentLengthMultiplier: 0,
      // Train geometry is already promoted to the full GTFS vertices by the
      // rail LOD floor above. Do not then erase its short successive bends in
      // the Canvas renderer: on Transilien J around Poissy that decimation
      // otherwise turns a rail curve into a diagonal chord through the map.
      railMicroSegmentLengthMultiplier: 0,
      // A disproportionate sub-stroke segment can create a visible spike at
      // high zoom. Remove only unanchored micro-segments; station vertices are
      // protected by the renderer before the shared rounding algorithm runs.
      microSegmentLengthMultiplier: 5,
      microSegmentMaxRatio: 0.12,
      // A smaller interior angle is allowed in GTFS data, but it must be
      // rendered through a quadratic curve rather than as a raw right-angle
      // vertex. This is also the high-zoom DOM regression threshold.
      maxUnroundedInteriorAngleDegrees: 75,
    },
    modePathAlpha: {
      BUS: 0.35,
      DEFAULT: 0.72,
      ACTIVE: 0.95,
    },
  },
  // The quick preset list follows the product order. Bike is optional and is
  // kept out of the initial selection by useTransportMapFilters.
  primaryModes: ["METRO", "RER", "TRAIN", "TRANSILIEN", "TRAM", "CABLE", "BUS", "NOCTILIEN", "BIKE"] as GlobalMapMode[],
  coreModes: ["METRO", "RER", "TRAIN", "TRANSILIEN", "TRAM", "CABLE", "BIKE"] as GlobalMapMode[],
  busMode: "BUS" as const,
} as const;

export type GlobalTransportPlanConfig = typeof GLOBAL_TRANSPORT_PLAN_CONFIG;

const HEAVY_GLOBAL_MAP_MODES = new Set<GlobalMapMode>([
  "METRO",
  "RER",
  "TRAIN",
  "TRANSILIEN",
]);

export function globalTransportPlanLineWidth(
  mode: GlobalMapMode,
  active = false,
  zoom?: number,
): number {
  const configuredWidth = active
    ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.activeLineWidth
    : GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.modeLineWidth[mode];

  if (
    active ||
    zoom === undefined ||
    !GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.limitHeavyLineWidthAtOverviewZoom ||
    !HEAVY_GLOBAL_MAP_MODES.has(mode) ||
    zoom >= GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.overviewHeavyLineWidthMaxZoom
  ) {
    return configuredWidth;
  }

  return Math.min(
    configuredWidth,
    GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.overviewHeavyLineWidthMaxCssPx,
  );
}
