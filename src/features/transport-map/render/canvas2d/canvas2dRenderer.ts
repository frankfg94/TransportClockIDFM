import type {
  GlobalMapBounds,
  GlobalMapLine,
  GlobalMapMode,
  GlobalMapPath,
  GlobalMapStation,
} from "../../contracts/manifest";
import type {
  TransportMapRenderScene,
  TransportMapRenderer,
  TransportMapRendererKind,
  TransportMapRendererMetrics,
  TransportMapTrafficImpactKind,
  TransportMapTrafficPathSpan,
} from "../../contracts/renderer";
import type { CameraState } from "../../geo/camera";
import { writeVisibleWorldBounds, worldScaleAtZoom } from "../../geo/coordinateKernel";
import {
  GLOBAL_TRANSPORT_PLAN_CONFIG,
  globalTransportPlanLineWidth,
} from "../../config/globalTransportPlanConfig";
import {
  isStationNodeVisible,
  GLOBAL_TRANSPORT_PLAN_STATION_DETAIL_ZOOM,
} from "../stationNodeVisibility";
import {
  TRAFFIC_DISTURBANCE_COLOR,
  TRAFFIC_INTERRUPTION_COLOR,
  TRAFFIC_INTERRUPTION_GAP_COLOR,
} from "../trafficStyleTokens";
import {
  PreparedWorldPathGeometryCache,
  type PreparedWorldPathSubpath,
} from "../preparedPathGeometry";
import { TransportMapRenderSceneIndex } from "../renderSceneIndex";
import { GlobalIsochroneCanvasLayer } from "../../isochrones/canvasLayer";
import { resolveTransportMapPathStyle } from "../pathRenderStyle";
import {
  TRANSPORT_MAP_STATION_LABEL_OFFSETS,
} from "../labelRenderTokens";
import { appendRoundedPolylineToPathDirect } from "../../../line-map/lineGeometry";
import type { RoundedPolylineOptions, RoundedPolylineScratch } from "../../../line-map/lineGeometry";

interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface PreparedPathSubpath extends PreparedWorldPathSubpath {
  screenPoints: Array<{ x: number; y: number }>;
  scratch: RoundedPolylineScratch;
  trafficRangeViews: CanvasTrafficRangeView[];
  trafficRangeSource?: readonly TransportMapTrafficPathSpan[];
  trafficRangesPrepared: boolean;
}

interface CanvasTrafficRangeView {
  startVertexIndex: number;
  endVertexIndex: number;
  kind: TransportMapTrafficImpactKind | undefined;
  points: Array<{ x: number; y: number }>;
  protectedPointIndices: number[];
}

interface PreparedWorldLinePath {
  path: Path2D;
  paths: GlobalMapPath[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function createTransportMapPathRoundingOptions(
  activeLine: boolean,
  effectiveLineWidth: number,
  mode?: GlobalMapMode,
): RoundedPolylineOptions {
  const pathRounding = GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.pathRounding;
  const preserveRailCurve = mode === "TRAIN" || mode === "TRANSILIEN";
  const microSegmentLengthMultiplier = activeLine
    ? pathRounding.activeLineMicroSegmentLengthMultiplier
    : preserveRailCurve
      ? pathRounding.railMicroSegmentLengthMultiplier
      : pathRounding.microSegmentLengthMultiplier;

  return {
    minimumPointDistance: activeLine
      ? pathRounding.activeLineMinimumPointDistanceCssPx
      : pathRounding.minimumPointDistanceCssPx,
    minimumCornerSegmentLength: pathRounding.minimumCornerSegmentLengthCssPx,
    maximumCornerRadius: pathRounding.maximumCornerRadiusCssPx,
    cornerRadiusRatio: pathRounding.cornerRadiusRatio,
    maximumShortSegmentLength: microSegmentLengthMultiplier > 0
      ? Math.max(
        pathRounding.minimumCornerSegmentLengthCssPx * 4,
        effectiveLineWidth * microSegmentLengthMultiplier,
      )
      : undefined,
    maximumShortSegmentRatio: pathRounding.microSegmentMaxRatio,
  };
}

interface StationLabelAtlasEntry {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  cssWidth: number;
  cssHeight: number;
  textWidth: number;
  padding: number;
}

const STATION_LABEL_OFFSETS = TRANSPORT_MAP_STATION_LABEL_OFFSETS.map(([x, y]) => ({ x, y }));
const SOLID_LINE_DASH: number[] = [];
const STATION_LABEL_OUTLINE_WIDTH_CSS_PX = 2;
const STATION_LABEL_OUTLINE_COLOR = "rgba(255, 255, 255, 0.98)";
const TRAFFIC_INTERRUPTION_LINE_DASH = [
  ...GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.trafficInterruptionDashArray,
];

export class Canvas2dRenderer implements TransportMapRenderer {
  private static readonly pathCacheMaxPixelRatio = GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.pathCacheMaxPixelRatio;
  readonly kind: TransportMapRendererKind;
  private canvas?: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D;
  private pixelRatio = 1;
  private pathCachePixelRatio = 1;
  private widthCssPx = 1;
  private heightCssPx = 1;
  private metrics: TransportMapRendererMetrics;
  private visibleBoundsScratch: GlobalMapBounds = {
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
  };
  private linesSource?: GlobalMapLine[];
  private linesById = new Map<string, GlobalMapLine>();
  private pathsSource?: GlobalMapPath[];
  private pathsByLineId = new Map<string, GlobalMapPath[]>();
  private preparedPathSubpaths = new WeakMap<GlobalMapPath, PreparedPathSubpath[]>();
  private preparedWorldGeometry = new PreparedWorldPathGeometryCache();
  private sceneIndexes = new TransportMapRenderSceneIndex();
  private preparedWorldLinePaths = new Map<string, PreparedWorldLinePath>();
  private preparedWorldLinePathsSource?: GlobalMapPath[];
  private stationsSource?: GlobalMapStation[];
  private stationsById = new Map<string, GlobalMapStation>();
  private visibleLineIds = new Set<string>();
  private ghostLineIdsSource?: string[];
  private ghostLines = new Set<string>();
  private visibleModeMask = -1;
  private entranceStationIdsSource?: string[];
  private entranceStationIds = new Set<string>();
  private activeLineSource?: GlobalMapLine;
  private activeLineStationIds = new Set<string>();
  private labelPathsSource?: GlobalMapPath[];
  private labelStationsSource?: GlobalMapStation[];
  private labelOrder = new Map<string, number>();
  private labelTerminalIds = new Set<string>();
  private labelStations: GlobalMapStation[] = [];
  private stationLabelWidths = new Map<string, number>();
  private stationLabelPlacementRects: ScreenRect[] = [];
  private pathRoundingOptions = new Map<string, RoundedPolylineOptions>();
  private interruptionLineIdsSource?: string[];
  private interruptionLines = new Set<string>();
  private disturbanceLineIdsSource?: string[];
  private disturbanceLines = new Set<string>();
  private interruptedStationIdsSource?: string[];
  private interruptedStations = new Set<string>();
  private disturbedStationIdsSource?: string[];
  private disturbedStations = new Set<string>();
  private trafficPathSpansSource?: TransportMapTrafficPathSpan[];
  private selectedStationIdsSource?: string[];
  private selectedStations = new Set<string>();
  private hoveredPathsScratch: GlobalMapPath[] = [];
  private pathStyleScratch = {
    visible: false,
    active: false,
    ghost: false,
    hovered: false,
    trafficKind: undefined as TransportMapTrafficImpactKind | undefined,
    alpha: 1,
    lineWidthCssPx: 0,
    nativeColor: "",
    dash: "solid" as const,
    order: 0,
  };
  private stationLabelAtlasCanvas?: HTMLCanvasElement;
  private stationLabelAtlasEntries = new Map<string, StationLabelAtlasEntry>();
  private stationLabelAtlasSource?: GlobalMapStation[];
  private stationLabelAtlasPixelRatio = 0;
  private pathCacheCanvas?: HTMLCanvasElement;
  private pathCacheContext?: CanvasRenderingContext2D;
  private pathCacheCamera?: CameraState;
  private pathCachePaths?: GlobalMapPath[];
  private pathCacheLines?: GlobalMapLine[];
  private pathCacheInterruptionLineIds?: string[];
  private pathCacheDisturbanceLineIds?: string[];
  private pathCacheTrafficPathSpans?: TransportMapTrafficPathSpan[];
  private pathCacheVisibleModeMask = -1;
  private pathCacheActiveLineId?: string;
  private pathCacheGhostLineIds?: string[];
  private pathCacheHoveredLineId?: string;
  private pathCacheIsochrones?: TransportMapRenderScene["walkingIsochrones"];
  private pathCacheHoveredIsochroneIds?: TransportMapRenderScene["hoveredIsochroneIds"];
  private readonly isochroneLayer = new GlobalIsochroneCanvasLayer();
  private pathCacheVisiblePathCount = 0;
  private pathCacheValid = false;

  constructor(kind: "canvas2d-main-thread" | "canvas2d-worker" = "canvas2d-main-thread") {
    this.kind = kind;
    this.metrics = {
      renderer: kind,
      drawCalls: 0,
      visiblePathCount: 0,
      visibleStationCount: 0,
      renderMs: 0,
      cacheBytes: 0,
      focusedLineLiveRedraw: false,
      pathCacheCaptureCount: 0,
      pathCacheCaptureMs: 0,
      pathCacheCapturedBytes: 0,
    };
  }

  mount(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    // Keep the canvas presentation synchronized with the cleared frame. The
    // desynchronized hint can expose a previous backing buffer while a zoom
    // frame is being replaced, which looks like duplicated station labels on
    // Chromium/WebView even though the canvas was cleared correctly.
    this.context = canvas.getContext("2d") ?? undefined;
    this.ensurePathCacheCanvas();
    this.invalidatePathCache();
  }

  resize(widthCssPx: number, heightCssPx: number, pixelRatio: number): void {
    this.widthCssPx = Math.max(1, widthCssPx);
    this.heightCssPx = Math.max(1, heightCssPx);
    const nextPixelRatio = Math.max(1, pixelRatio);
    if (this.stationLabelAtlasPixelRatio !== nextPixelRatio) this.invalidateStationLabelAtlas();
    this.pixelRatio = nextPixelRatio;
    this.pathCachePixelRatio = Math.min(this.pixelRatio, Canvas2dRenderer.pathCacheMaxPixelRatio);
    if (!this.canvas) return;
    this.canvas.width = Math.ceil(this.widthCssPx * this.pixelRatio);
    this.canvas.height = Math.ceil(this.heightCssPx * this.pixelRatio);
    this.canvas.style.width = `${this.widthCssPx}px`;
    this.canvas.style.height = `${this.heightCssPx}px`;
    if (this.pathCacheCanvas) {
      this.pathCacheCanvas.width = this.pathCacheWidth();
      this.pathCacheCanvas.height = this.pathCacheHeight();
    }
    this.invalidatePathCache();
  }

  render(camera: CameraState, scene: TransportMapRenderScene): void {
    const startedAt = typeof performance === "undefined" ? Date.now() : performance.now();
    const redrawFocusedLineDuringZoom =
      GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.svg.resizeStrokesDuringZoom &&
      scene.interactionActive === true &&
      Boolean(scene.activeLineId);
    // These values describe one render invocation. Reset them before any
    // early return so a missing/detached canvas cannot leak the previous
    // frame's causal counters into the performance probe.
    this.metrics = {
      ...this.metrics,
      focusedLineLiveRedraw: redrawFocusedLineDuringZoom,
      pathCacheCaptureCount: 0,
      pathCacheCaptureMs: 0,
      pathCacheCapturedBytes: 0,
    };
    const context = this.context;
    if (!context) return;
    this.updateSceneIndexes(scene);
    const scale = worldScaleAtZoom(camera.zoom);
    const centerX = camera.viewportWidthCssPx / 2;
    const centerY = camera.viewportHeightCssPx / 2;
    const visibleBounds = writeVisibleWorldBounds(camera, this.visibleBoundsScratch);
    // A focused line is rendered in screen space on every live zoom frame.
    // Reusing the raster path cache here postpones the line's stroke/geometry
    // update until the gesture commits, which is especially visible on the
    // lightweight one-line view. Keep the cache for the full-network gesture,
    // where redrawing every path would be needlessly expensive.
    const focusedLineId = redrawFocusedLineDuringZoom ? scene.activeLineId : undefined;
    const useCachedPaths =
      scene.interactionActive === true &&
      !redrawFocusedLineDuringZoom &&
      this.isPathCacheCurrent(camera, scene);
    const shouldCapturePaths = !redrawFocusedLineDuringZoom;
    let drawCalls: number;
    let visiblePathCount: number;
    let isochroneDrawCalls = 0;
    if (useCachedPaths) {
      this.clearCanvas(context);
      this.blitPathCache(context, camera);
      drawCalls = 1;
      visiblePathCount = this.pathCacheVisiblePathCount;
      if (focusedLineId) {
        // The cache contains every background path except the focused line.
        // Redrawing only that line keeps its stroke width and rounded geometry
        // exact at the current zoom while the much larger network remains a
        // compositor transform. No visual layer is dropped.
        this.setCssTransform(context);
        const focusedMetrics = this.renderPaths(
          context,
          camera,
          scene,
          scale,
          centerX,
          centerY,
          { includeLineId: focusedLineId },
        );
        drawCalls += focusedMetrics.drawCalls;
        visiblePathCount += focusedMetrics.visiblePathCount;
      }
    } else {
      // Clear the physical backing buffer before applying the CSS-space
      // transform. During a focused camera flight the renderer redraws the
      // line on every frame; clearing with CSS dimensions while the context
      // is scaled by devicePixelRatio leaves a stale strip of the previous
      // frame on high-density displays. Those stale strokes accumulate as
      // oversized bands when the camera moves from one line to another.
      this.clearCanvas(context);
      this.setCssTransform(context);
      isochroneDrawCalls = this.isochroneLayer.draw(
        context,
        camera,
        scene.walkingIsochrones,
        scene.hoveredIsochroneIds,
      );
      const worldGhostMetrics = focusedLineId
        ? this.renderInteractionWorldGhostPaths(context, camera, scene, scale, visibleBounds)
        : undefined;
      if (worldGhostMetrics && focusedLineId) {
        this.setCssTransform(context);
        const focusedMetrics = this.renderPaths(
          context,
          camera,
          scene,
          scale,
          centerX,
          centerY,
          { includeLineId: focusedLineId },
        );
        drawCalls = worldGhostMetrics.drawCalls + focusedMetrics.drawCalls;
        visiblePathCount = worldGhostMetrics.visiblePathCount + focusedMetrics.visiblePathCount;
      } else {
        const prepareFocusedBackground = shouldCapturePaths && Boolean(scene.activeLineId);
        const backgroundMetrics = this.renderPaths(
          context,
          camera,
          scene,
          scale,
          centerX,
          centerY,
          prepareFocusedBackground ? { excludeLineId: scene.activeLineId } : undefined,
        );
        drawCalls = backgroundMetrics.drawCalls;
        visiblePathCount = backgroundMetrics.visiblePathCount;
        if (shouldCapturePaths) {
          this.capturePathCache(camera, scene, drawCalls, visiblePathCount);
        }
        if (prepareFocusedBackground && scene.activeLineId) {
          const focusedMetrics = this.renderPaths(
            context,
            camera,
            scene,
            scale,
            centerX,
            centerY,
            { includeLineId: scene.activeLineId },
          );
          drawCalls += focusedMetrics.drawCalls;
          visiblePathCount += focusedMetrics.visiblePathCount;
        }
      }
    }
    drawCalls += isochroneDrawCalls;
    // The path cache is an interaction-only raster approximation; station and
    // entrance geometry always return to the exact CSS-space transform for
    // every frame so their coordinates never inherit cache/DPR rounding.
    this.setCssTransform(context);
    let visibleStationCount = 0;
    const activeLine = scene.activeLineId ? this.linesById.get(scene.activeLineId) : undefined;
    // Ghost stations are supplied by GlobalTransportPlan only while their
    // correspondence line is hovered, so they can be rendered as nodes
    // without entering the station-label pipeline below.
    const hoveredGhostLine = scene.hoveredLineId &&
      scene.hoveredLineId !== scene.activeLineId &&
      this.ghostLines.has(scene.hoveredLineId)
      ? this.linesById.get(scene.hoveredLineId)
      : undefined;
    const hoveredGhostStationIds = this.sceneIndexes.hoveredGhostStationIds;
    for (const station of scene.stations) {
      if (!isStationNodeVisible(camera, scene, station, this.sceneIndexes.stationVisibility)) continue;
      const screenX = (station.worldX - camera.centerWorldX) * scale + centerX;
      const screenY = (station.worldY - camera.centerWorldY) * scale + centerY;
      if (screenX < -24 || screenX > this.widthCssPx + 24 || screenY < -24 || screenY > this.heightCssPx + 24) continue;
      const selectedStation = station.id === scene.activeStationId || this.selectedStations.has(station.id);
      const hoveredStation = station.id === scene.hoveredStationId;
      const hoveredGhostStation = hoveredGhostStationIds.has(station.id);
      const activeLineStation = Boolean(
        activeLine &&
        (this.activeLineStationIds.has(station.id) || station.lineIds.includes(activeLine.id)),
      );
      const detailStationVisible = activeLineStation || camera.zoom >= GLOBAL_TRANSPORT_PLAN_STATION_DETAIL_ZOOM;
      const baseRadius = selectedStation
        ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.selectedStationRadius
        : station.isHub
          ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.hubStationRadius
          : detailStationVisible
            ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.detailStationRadius
            : 0;
      const radius = Math.max(
        baseRadius,
        hoveredStation
          ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.hoveredStationRadius
          : hoveredGhostStation
            ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.detailStationRadius
            : 0,
      );
      if (radius <= 0) continue;
      context.beginPath();
      context.arc(screenX, screenY, radius, 0, Math.PI * 2);
      const interruptedStation = this.interruptedStations.has(station.id);
      const disturbedStation = !interruptedStation && this.disturbedStations.has(station.id);
      context.fillStyle = interruptedStation || disturbedStation
        ? "rgba(255, 255, 255, 0.96)"
        : selectedStation
          ? activeLine?.color ?? "#111827"
          : hoveredStation
            ? "#dbeafe"
            : hoveredGhostStation
              ? "#ffffff"
              : "#f8fafc";
      context.fill();
      context.lineWidth = interruptedStation || disturbedStation
        ? 2.5
        : hoveredStation
        ? 2.5
        : selectedStation
          ? 2.5
          : hoveredGhostStation || activeLineStation
            ? 2
            : 1.25;
      context.strokeStyle = interruptedStation
        ? TRAFFIC_INTERRUPTION_COLOR
        : disturbedStation
          ? TRAFFIC_DISTURBANCE_COLOR
          : selectedStation
        ? "#ffffff"
        : hoveredStation
          ? activeLine?.color ?? hoveredGhostLine?.color ?? "#2563eb"
          : hoveredGhostStation
            ? hoveredGhostLine?.color ?? "#2563eb"
            : activeLineStation && activeLine
              ? activeLine.color
              : "#334155";
      context.stroke();
      if (interruptedStation) {
        const crossRadius = Math.max(3.5, radius * 0.62);
        context.beginPath();
        context.moveTo(screenX - crossRadius, screenY - crossRadius);
        context.lineTo(screenX + crossRadius, screenY + crossRadius);
        context.moveTo(screenX + crossRadius, screenY - crossRadius);
        context.lineTo(screenX - crossRadius, screenY + crossRadius);
        context.lineWidth = 2;
        context.strokeStyle = TRAFFIC_INTERRUPTION_COLOR;
        context.stroke();
      }
      if (hoveredStation) {
        context.beginPath();
        context.arc(screenX, screenY, radius + 3.5, 0, Math.PI * 2);
        context.lineWidth = 2;
        context.strokeStyle = "rgba(37, 99, 235, 0.72)";
        context.stroke();
      }
      visibleStationCount += 1;
    }
    for (const quay of scene.quays ?? []) {
      if (camera.zoom < 12) continue;
      if (
        quay.worldX < visibleBounds.minX - 0.0001 ||
        quay.worldX > visibleBounds.maxX + 0.0001 ||
        quay.worldY < visibleBounds.minY - 0.0001 ||
        quay.worldY > visibleBounds.maxY + 0.0001
      ) continue;

      const screenX = (quay.worldX - camera.centerWorldX) * scale + centerX;
      const screenY = (quay.worldY - camera.centerWorldY) * scale + centerY;
      if (screenX < -24 || screenX > this.widthCssPx + 24 || screenY < -24 || screenY > this.heightCssPx + 24) continue;
      const color = activeLine?.color ?? "#0f766e";
      const parentStation = this.stationsById.get(quay.stationId);

      if (parentStation) {
        const stationScreenX = (parentStation.worldX - camera.centerWorldX) * scale + centerX;
        const stationScreenY = (parentStation.worldY - camera.centerWorldY) * scale + centerY;
        context.beginPath();
        context.setLineDash([2, 3]);
        context.moveTo(stationScreenX, stationScreenY);
        context.lineTo(screenX, screenY);
        context.globalAlpha = 0.38;
        context.lineWidth = 1;
        context.strokeStyle = color;
        context.stroke();
        context.setLineDash([]);
        context.globalAlpha = 1;
      }

      const radius = camera.zoom >= 15 ? 5.5 : 4.5;
      context.beginPath();
      context.moveTo(screenX, screenY - radius);
      context.lineTo(screenX + radius, screenY);
      context.lineTo(screenX, screenY + radius);
      context.lineTo(screenX - radius, screenY);
      context.closePath();
      context.fillStyle = "#ffffff";
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = color;
      context.stroke();
      context.beginPath();
      context.arc(screenX, screenY, 1.5, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
    }
    if (camera.zoom >= 14) {
      for (const entrance of scene.entrances ?? []) {
        const station = this.stationsById.get(entrance.stationId);
        const isSelectedStation = Boolean(
          station && (
            station.id === scene.activeStationId ||
            this.selectedStations.has(station.id) ||
            this.entranceStationIds.has(station.id)
          ),
        );
        if (!isSelectedStation) continue;
        if (entrance.worldX < visibleBounds.minX || entrance.worldX > visibleBounds.maxX || entrance.worldY < visibleBounds.minY || entrance.worldY > visibleBounds.maxY) continue;
        const screenX = (entrance.worldX - camera.centerWorldX) * scale + centerX;
        const screenY = (entrance.worldY - camera.centerWorldY) * scale + centerY;
        const stationScreenX = (station!.worldX - camera.centerWorldX) * scale + centerX;
        const stationScreenY = (station!.worldY - camera.centerWorldY) * scale + centerY;
        context.beginPath();
        context.setLineDash([2, 3]);
        context.moveTo(stationScreenX, stationScreenY);
        if (typeof context.quadraticCurveTo === "function") {
          const midX = (stationScreenX + screenX) / 2;
          const midY = (stationScreenY + screenY) / 2;
          context.quadraticCurveTo(midX, midY, screenX, screenY);
        } else {
          context.lineTo(screenX, screenY);
        }
        context.globalAlpha = 0.72;
        context.lineWidth = 1.15;
        context.strokeStyle = "#64748b";
        context.stroke();
        context.setLineDash([]);
        context.beginPath();
        context.arc(screenX, screenY, GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.entranceRadius, 0, Math.PI * 2);
        context.fillStyle = "#f59e0b";
        context.fill();
        if (camera.zoom >= GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.entranceLabelZoom && typeof context.fillText === "function") {
          context.globalAlpha = 0.92;
          context.font = "700 10px system-ui, sans-serif";
          context.fillStyle = "#334155";
          context.fillText(`${entrance.code ? `${entrance.code} · ` : ""}${entrance.name}`, screenX + 6, screenY - 6);
        }
      }
    }
    this.renderStationLabels(
      context,
      camera,
      scene,
      activeLine,
      scale,
      centerX,
      centerY,
    );
    context.globalAlpha = 1;
    this.metrics = {
      renderer: this.kind,
      drawCalls,
      visiblePathCount,
      visibleStationCount,
      renderMs: Number(((typeof performance === "undefined" ? Date.now() : performance.now()) - startedAt).toFixed(3)),
      cacheBytes: this.pathCacheCanvas ? this.pathCacheCanvas.width * this.pathCacheCanvas.height * 4 : 0,
      focusedLineLiveRedraw: redrawFocusedLineDuringZoom,
      pathCacheCaptureCount: this.metrics.pathCacheCaptureCount,
      pathCacheCaptureMs: this.metrics.pathCacheCaptureMs,
      pathCacheCapturedBytes: this.metrics.pathCacheCapturedBytes,
    };
  }

  getMetrics(): TransportMapRendererMetrics {
    return { ...this.metrics };
  }

  dispose(): void {
    this.context = undefined;
    this.canvas = undefined;
    this.linesSource = undefined;
    this.linesById.clear();
    this.pathsSource = undefined;
    this.pathsByLineId.clear();
    this.preparedPathSubpaths = new WeakMap();
    this.preparedWorldGeometry.clear();
    this.isochroneLayer.clear();
    this.sceneIndexes.dispose();
    this.hoveredPathsScratch.length = 0;
    this.preparedWorldLinePaths.clear();
    this.preparedWorldLinePathsSource = undefined;
    this.stationsSource = undefined;
    this.stationsById.clear();
    this.visibleLineIds.clear();
    this.ghostLineIdsSource = undefined;
    this.ghostLines.clear();
    this.entranceStationIdsSource = undefined;
    this.entranceStationIds.clear();
    this.activeLineSource = undefined;
    this.activeLineStationIds.clear();
    this.labelPathsSource = undefined;
    this.labelStationsSource = undefined;
    this.labelOrder.clear();
    this.labelTerminalIds.clear();
    this.labelStations = [];
    this.stationLabelWidths.clear();
    this.stationLabelPlacementRects.length = 0;
    this.pathRoundingOptions.clear();
    this.interruptionLineIdsSource = undefined;
    this.interruptionLines.clear();
    this.disturbanceLineIdsSource = undefined;
    this.disturbanceLines.clear();
    this.interruptedStationIdsSource = undefined;
    this.interruptedStations.clear();
    this.disturbedStationIdsSource = undefined;
    this.disturbedStations.clear();
    this.trafficPathSpansSource = undefined;
    this.selectedStationIdsSource = undefined;
    this.selectedStations.clear();
    this.invalidateStationLabelAtlas();
    this.pathCacheContext = undefined;
    this.pathCacheCanvas = undefined;
    this.invalidatePathCache();
  }

  private getPreparedPathSubpaths(
    path: GlobalMapPath,
    mode: GlobalMapMode,
  ): PreparedPathSubpath[] {
    const cached = this.preparedPathSubpaths.get(path);
    if (cached) return cached;
    const worldGeometry = this.preparedWorldGeometry.get(path, mode, this.stationsById);
    const prepared = worldGeometry.subpaths.map((subpath) => ({
      ...subpath,
      screenPoints: subpath.worldPoints.map(() => ({ x: 0, y: 0 })),
      scratch: { retainedIndices: [], dedupedIndices: [] },
      trafficRangeViews: [],
      trafficRangesPrepared: false,
    }));
    this.preparedPathSubpaths.set(path, prepared);
    return prepared;
  }

  private prepareWorldLinePaths(paths: GlobalMapPath[]): void {
    if (this.preparedWorldLinePathsSource === paths) return;
    this.preparedWorldLinePathsSource = paths;
    this.preparedWorldLinePaths.clear();
    if (typeof Path2D === "undefined") return;

    for (const sourcePath of paths) {
      const line = this.linesById.get(sourcePath.lineId);
      if (!line) continue;
      let prepared = this.preparedWorldLinePaths.get(sourcePath.lineId);
      if (!prepared) {
        prepared = {
          path: new Path2D(),
          paths: [],
          minX: Number.POSITIVE_INFINITY,
          minY: Number.POSITIVE_INFINITY,
          maxX: Number.NEGATIVE_INFINITY,
          maxY: Number.NEGATIVE_INFINITY,
        };
        this.preparedWorldLinePaths.set(sourcePath.lineId, prepared);
      }
      prepared.paths.push(sourcePath);
      prepared.minX = Math.min(prepared.minX, sourcePath.minX);
      prepared.minY = Math.min(prepared.minY, sourcePath.minY);
      prepared.maxX = Math.max(prepared.maxX, sourcePath.maxX);
      prepared.maxY = Math.max(prepared.maxY, sourcePath.maxY);
      for (const subpath of this.getPreparedPathSubpaths(sourcePath, line.mode)) {
        const first = subpath.worldPoints[0];
        if (!first) continue;
        prepared.path.moveTo(first.x, first.y);
        for (let index = 1; index < subpath.worldPoints.length; index += 1) {
          const point = subpath.worldPoints[index]!;
          prepared.path.lineTo(point.x, point.y);
        }
      }
    }
  }

  private renderInteractionWorldGhostPaths(
    context: CanvasRenderingContext2D,
    camera: CameraState,
    scene: TransportMapRenderScene,
    scale: number,
    visibleBounds: { minX: number; minY: number; maxX: number; maxY: number },
  ): { drawCalls: number; visiblePathCount: number } | undefined {
    if (
      typeof Path2D === "undefined" ||
      this.preparedWorldLinePathsSource !== scene.paths ||
      !scene.activeLineId
    ) {
      return undefined;
    }

    const translateX = camera.viewportWidthCssPx / 2 - camera.centerWorldX * scale;
    const translateY = camera.viewportHeightCssPx / 2 - camera.centerWorldY * scale;
    context.setTransform(
      scale * this.pixelRatio,
      0,
      0,
      scale * this.pixelRatio,
      translateX * this.pixelRatio,
      translateY * this.pixelRatio,
    );
    context.lineCap = "round";
    context.lineJoin = "round";
    context.setLineDash(SOLID_LINE_DASH);

    let drawCalls = 0;
    let visiblePathCount = 0;
    for (const lineId of this.sceneIndexes.ghostLineIds) {
      const prepared = this.preparedWorldLinePaths.get(lineId);
      const line = this.linesById.get(lineId);
      if (
        !prepared ||
        !line ||
        prepared.maxX < visibleBounds.minX ||
        prepared.minX > visibleBounds.maxX ||
        prepared.maxY < visibleBounds.minY ||
        prepared.minY > visibleBounds.maxY
      ) {
        continue;
      }
      const hovered = lineId === scene.hoveredLineId;
      const lineWidth = globalTransportPlanLineWidth(line.mode, false, camera.zoom) +
        (hovered ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.hoveredLineWidthBoostCssPx : 0);
      context.globalAlpha = hovered
        ? GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.hoveredGhostLineAlpha
        : GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.ghostLineAlpha;
      context.lineWidth = lineWidth / scale;
      context.strokeStyle = this.disturbanceLines.has(lineId)
        ? TRAFFIC_DISTURBANCE_COLOR
        : line.color;
      context.stroke(prepared.path);
      drawCalls += 1;
      for (const path of prepared.paths) {
        if (
          path.maxX >= visibleBounds.minX &&
          path.minX <= visibleBounds.maxX &&
          path.maxY >= visibleBounds.minY &&
          path.minY <= visibleBounds.maxY
        ) {
          visiblePathCount += 1;
        }
      }
    }
    context.globalAlpha = 1;
    return { drawCalls, visiblePathCount };
  }

  private renderPaths(
    context: CanvasRenderingContext2D,
    camera: CameraState,
    scene: TransportMapRenderScene,
    scale: number,
    centerX: number,
    centerY: number,
    filter?: { includeLineId?: string; excludeLineId?: string },
  ): { drawCalls: number; visiblePathCount: number } {
    const visibleBounds = writeVisibleWorldBounds(camera, this.visibleBoundsScratch);
    let drawCalls = 0;
    let visiblePathCount = 0;
    context.lineCap = "round";
    context.lineJoin = "round";
    let lastAlpha = Number.NaN;
    let lastStroke = "";
    let lastLineWidth = Number.NaN;
    let lastDash = "";
    let pathBatchOpen = false;
    const flushPathBatch = (): void => {
      if (!pathBatchOpen) return;
      context.stroke();
      drawCalls += 1;
      pathBatchOpen = false;
    };
    const setStrokeStyle = (
      alpha: number,
      stroke: string,
      lineWidth: number,
      dash: "solid" | "traffic-interruption",
    ): void => {
      const styleChanged =
        alpha !== lastAlpha ||
        stroke !== lastStroke ||
        lineWidth !== lastLineWidth ||
        dash !== lastDash;
      if (!styleChanged && pathBatchOpen) return;
      flushPathBatch();
      if (alpha !== lastAlpha) { context.globalAlpha = alpha; lastAlpha = alpha; }
      if (stroke !== lastStroke) { context.strokeStyle = stroke; lastStroke = stroke; }
      if (lineWidth !== lastLineWidth) { context.lineWidth = lineWidth; lastLineWidth = lineWidth; }
      if (dash !== lastDash) {
        context.setLineDash(
          dash === "traffic-interruption"
            ? TRAFFIC_INTERRUPTION_LINE_DASH
            : SOLID_LINE_DASH,
        );
        lastDash = dash;
      }
      context.beginPath();
      pathBatchOpen = true;
    };
    const appendStroke = (
      points: Array<{ x: number; y: number }>,
      protectedPointIndices: number[],
      roundingOptions: RoundedPolylineOptions,
      scratch: RoundedPolylineScratch,
      alpha: number,
      lineWidth: number,
      stroke: string,
      dash: "solid" | "traffic-interruption",
    ): void => {
      setStrokeStyle(alpha, stroke, lineWidth, dash);
      roundingOptions.protectedPointIndices = protectedPointIndices;
      appendRoundedPolylineToPathDirect(context, points, roundingOptions, scratch);
    };
    const strokeGeometry = (
      points: Array<{ x: number; y: number }>,
      kind: TransportMapTrafficImpactKind | undefined,
      protectedPointIndices: number[],
      roundingOptions: RoundedPolylineOptions,
      scratch: RoundedPolylineScratch,
      alpha: number,
      lineWidth: number,
      nativeColor: string,
    ): void => {
      if (kind === "interruption") {
        // A pale bed keeps interruption dash gaps visible on native red lines.
        appendStroke(
          points,
          protectedPointIndices,
          roundingOptions,
          scratch,
          alpha,
          lineWidth,
          TRAFFIC_INTERRUPTION_GAP_COLOR,
          "solid",
        );
        appendStroke(
          points,
          protectedPointIndices,
          roundingOptions,
          scratch,
          alpha,
          lineWidth,
          TRAFFIC_INTERRUPTION_COLOR,
          "traffic-interruption",
        );
        return;
      }
      appendStroke(
        points,
        protectedPointIndices,
        roundingOptions,
        scratch,
        alpha,
        lineWidth,
        kind === "disturbance" ? TRAFFIC_DISTURBANCE_COLOR : nativeColor,
        "solid",
      );
    };
    const renderPath = (path: GlobalMapPath, highlighted: boolean): void => {
      if (filter?.includeLineId && path.lineId !== filter.includeLineId) return;
      if (filter?.excludeLineId && path.lineId === filter.excludeLineId) return;
      const line = this.linesById.get(path.lineId);
      if (!line || !this.visibleLineIds.has(path.lineId)) return;
      const preparedSubpaths = this.getPreparedPathSubpaths(path, line.mode);
      if (preparedSubpaths.length === 0) return;
      if (path.maxX < visibleBounds.minX || path.minX > visibleBounds.maxX || path.maxY < visibleBounds.minY || path.minY > visibleBounds.maxY) return;
      if (!resolveTransportMapPathStyle({
        line,
        scene,
        highlighted,
        ghostLineIds: this.ghostLines,
        interruptionLines: this.interruptionLines,
        disturbanceLines: this.disturbanceLines,
        visibleLineIds: this.visibleLineIds,
        zoom: camera.zoom,
      }, this.pathStyleScratch)) return;
      const {
        active,
        ghost,
        hovered,
        trafficKind: lineTrafficKind,
        alpha,
        lineWidthCssPx: lineWidth,
      } = this.pathStyleScratch;
      const roundingOptions = this.getPathRoundingOptions(active, lineWidth, line.mode);
      // A clipped path can leave and re-enter this tile. Stroke each retained
      // fragment separately so Canvas2D never invents the missing segment.
      for (const subpath of preparedSubpaths) {
        const { worldPoints, screenPoints } = subpath;
        for (let index = 0; index < worldPoints.length; index += 1) {
          const worldPoint = worldPoints[index]!;
          const screenPoint = screenPoints[index]!;
          screenPoint.x = (worldPoint.x - camera.centerWorldX) * scale + centerX;
          screenPoint.y = (worldPoint.y - camera.centerWorldY) * scale + centerY;
        }
        const trafficRangeViews = subpath.trafficRangeViews;
        if (trafficRangeViews.length === 0) {
          strokeGeometry(
            screenPoints,
            lineTrafficKind,
            subpath.protectedPointIndices,
            roundingOptions,
            subpath.scratch,
            alpha,
            lineWidth,
            line.color,
          );
        } else {
          for (const range of trafficRangeViews) {
            strokeGeometry(
              range.points,
              range.kind,
              range.protectedPointIndices,
              roundingOptions,
              subpath.scratch,
              alpha,
              lineWidth,
              line.color,
            );
          }
        }
        // Keep clipped fragments as independent Canvas2D subpaths. A tile
        // path may leave and re-enter the visible source geometry; batching
        // across those fragments would make Canvas2D invent the missing gap.
        flushPathBatch();
      }
      visiblePathCount += 1;
    };
    const candidatePaths = filter?.includeLineId
      ? this.pathsByLineId.get(filter.includeLineId) ?? []
      : scene.paths;
    const hoveredPaths = this.hoveredPathsScratch;
    hoveredPaths.length = 0;
    for (const path of candidatePaths) {
      if (this.linesById.get(path.lineId)?.id === scene.hoveredLineId) {
        hoveredPaths.push(path);
        continue;
      }
      renderPath(path, false);
    }
    for (const path of hoveredPaths) renderPath(path, true);
    flushPathBatch();
    hoveredPaths.length = 0;
    context.globalAlpha = 1;
    if (lastDash !== "solid") context.setLineDash(SOLID_LINE_DASH);
    return { drawCalls, visiblePathCount };
  }

  private getPathRoundingOptions(
    activeLine: boolean,
    effectiveLineWidth: number,
    mode: GlobalMapMode,
  ): RoundedPolylineOptions {
    const key = `${activeLine ? 1 : 0}:${mode}:${effectiveLineWidth}`;
    const cached = this.pathRoundingOptions.get(key);
    if (cached) return cached;
    const options = createTransportMapPathRoundingOptions(activeLine, effectiveLineWidth, mode);
    this.pathRoundingOptions.set(key, options);
    return options;
  }

  private renderStationLabels(
    context: CanvasRenderingContext2D,
    camera: CameraState,
    scene: TransportMapRenderScene,
    activeLine: GlobalMapLine | undefined,
    scale: number,
    centerX: number,
    centerY: number,
  ): void {
    if (!activeLine) return;
    const keepFocusedLineLabels = GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.keepStationLabelsDuringZoom;
    if (!keepFocusedLineLabels && camera.zoom < GLOBAL_TRANSPORT_PLAN_CONFIG.renderer.stationLabelZoom) return;
    if (typeof context.fillText !== "function") return;

    const activeStations = this.labelStations;
    if (!activeStations.length) return;

    const placed = this.stationLabelPlacementRects;
    let placedCount = 0;
    context.font = "800 13px system-ui, sans-serif";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.lineWidth = STATION_LABEL_OUTLINE_WIDTH_CSS_PX;
    context.strokeStyle = STATION_LABEL_OUTLINE_COLOR;
    context.fillStyle = "#0f172a";
    const labelAtlas = this.ensureStationLabelAtlas(context);

    for (const station of activeStations) {
      const label = station.name.trim();
      if (!label) continue;
      const screenX = (station.worldX - camera.centerWorldX) * scale + centerX;
      const screenY = (station.worldY - camera.centerWorldY) * scale + centerY;
      if (
        screenX < -160 ||
        screenX > this.widthCssPx + 160 ||
        screenY < -40 ||
        screenY > this.heightCssPx + 40
      ) continue;

      const measuredWidth = this.stationLabelWidths.get(station.id) ?? (() => {
        const width = typeof context.measureText === "function"
          ? context.measureText(label).width
          : label.length * 7.2;
        this.stationLabelWidths.set(station.id, width);
        return width;
      })();
      const labelWidth = measuredWidth + 8;
      const labelHeight = 18;
      const required = this.labelTerminalIds.has(station.id) ||
        station.id === scene.activeStationId ||
        this.selectedStations.has(station.id) ||
        station.isHub;
      const placementRect = placed[placedCount] ?? { left: 0, top: 0, right: 0, bottom: 0 };
      let placementX = 0;
      let placementY = 0;
      let placementAlign: CanvasTextAlign = "left";
      let hasPlacement = false;

      for (const offset of STATION_LABEL_OFFSETS) {
        const align: CanvasTextAlign = offset.x < -4
          ? "right"
          : offset.x > 4
            ? "left"
            : "center";
        const x = screenX + offset.x;
        const y = screenY + offset.y;
        setLabelRect(placementRect, x, y, labelWidth, labelHeight, align);
        if (
          placementRect.right < -8 ||
          placementRect.left > this.widthCssPx + 8 ||
          placementRect.bottom < -8 ||
          placementRect.top > this.heightCssPx + 8
        ) continue;
        let overlaps = false;
        for (let index = 0; index < placedCount; index += 1) {
          if (rectanglesOverlap(placementRect, placed[index]!, 4)) {
            overlaps = true;
            break;
          }
        }
        if (!overlaps) {
          placementX = x;
          placementY = y;
          placementAlign = align;
          hasPlacement = true;
          break;
        }
      }

      if (!hasPlacement && !required) continue;
      if (!hasPlacement) {
        const offset = STATION_LABEL_OFFSETS[0];
        placementX = screenX + offset.x;
        placementY = screenY + offset.y;
        placementAlign = "left";
        setLabelRect(
          placementRect,
          placementX,
          placementY,
          labelWidth,
          labelHeight,
          placementAlign,
        );
      }

      placed[placedCount] = placementRect;
      placedCount += 1;
      context.textAlign = placementAlign;
      const atlasEntry = labelAtlas?.entries.get(station.id);
      if (labelAtlas && atlasEntry) {
        const textLeft = placementAlign === "right"
          ? placementX - atlasEntry.textWidth
          : placementAlign === "center"
            ? placementX - atlasEntry.textWidth / 2
            : placementX;
        context.drawImage(
          labelAtlas.canvas,
          atlasEntry.sourceX,
          atlasEntry.sourceY,
          atlasEntry.sourceWidth,
          atlasEntry.sourceHeight,
          textLeft - atlasEntry.padding,
          placementY - atlasEntry.cssHeight / 2,
          atlasEntry.cssWidth,
          atlasEntry.cssHeight,
        );
      } else if (typeof context.strokeText === "function") {
        context.strokeText(label, placementX, placementY);
        context.fillText(label, placementX, placementY);
      } else {
        context.fillText(label, placementX, placementY);
      }
    }
  }

  private ensureStationLabelAtlas(
    measurementContext: CanvasRenderingContext2D,
  ): { canvas: HTMLCanvasElement; entries: Map<string, StationLabelAtlasEntry> } | undefined {
    if (
      this.stationLabelAtlasCanvas &&
      this.stationLabelAtlasSource === this.labelStations &&
      this.stationLabelAtlasPixelRatio === this.pixelRatio
    ) {
      return { canvas: this.stationLabelAtlasCanvas, entries: this.stationLabelAtlasEntries };
    }
    const ownerDocument = this.canvas?.ownerDocument;
    if (!ownerDocument || this.labelStations.length === 0) return undefined;
    const atlas = ownerDocument.createElement("canvas");
    const atlasContext = atlas.getContext("2d");
    if (!atlasContext || typeof atlasContext.strokeText !== "function") return undefined;

    const padding = 4;
    const cssHeight = 20;
    const maxCssWidth = 2_048;
    const measured = this.labelStations.map((station) => {
      const label = station.name.trim();
      const textWidth = this.stationLabelWidths.get(station.id) ??
        measurementContext.measureText(label).width;
      this.stationLabelWidths.set(station.id, textWidth);
      return {
        station,
        label,
        textWidth,
        cssWidth: Math.max(1, Math.ceil(textWidth + padding * 2)),
      };
    });
    let cursorX = 0;
    let cursorY = 0;
    let usedWidth = 1;
    const cssPlacements = measured.map((entry) => {
      if (cursorX > 0 && cursorX + entry.cssWidth > maxCssWidth) {
        cursorX = 0;
        cursorY += cssHeight;
      }
      const placement = { ...entry, x: cursorX, y: cursorY };
      cursorX += entry.cssWidth;
      usedWidth = Math.max(usedWidth, cursorX);
      return placement;
    });
    const usedHeight = Math.max(cssHeight, cursorY + cssHeight);
    const ratio = this.pixelRatio;
    atlas.width = Math.ceil(usedWidth * ratio);
    atlas.height = Math.ceil(usedHeight * ratio);
    atlasContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    atlasContext.clearRect(0, 0, usedWidth, usedHeight);
    atlasContext.font = "800 13px system-ui, sans-serif";
    atlasContext.textBaseline = "middle";
    atlasContext.textAlign = "left";
    atlasContext.lineJoin = "round";
    atlasContext.lineWidth = STATION_LABEL_OUTLINE_WIDTH_CSS_PX;
    atlasContext.strokeStyle = STATION_LABEL_OUTLINE_COLOR;
    atlasContext.fillStyle = "#0f172a";

    const entries = new Map<string, StationLabelAtlasEntry>();
    for (const entry of cssPlacements) {
      const textX = entry.x + padding;
      const textY = entry.y + cssHeight / 2;
      atlasContext.strokeText(entry.label, textX, textY);
      atlasContext.fillText(entry.label, textX, textY);
      entries.set(entry.station.id, {
        sourceX: Math.floor(entry.x * ratio),
        sourceY: Math.floor(entry.y * ratio),
        sourceWidth: Math.ceil(entry.cssWidth * ratio),
        sourceHeight: Math.ceil(cssHeight * ratio),
        cssWidth: entry.cssWidth,
        cssHeight,
        textWidth: entry.textWidth,
        padding,
      });
    }
    this.stationLabelAtlasCanvas = atlas;
    this.stationLabelAtlasEntries = entries;
    this.stationLabelAtlasSource = this.labelStations;
    this.stationLabelAtlasPixelRatio = ratio;
    return { canvas: atlas, entries };
  }

  private invalidateStationLabelAtlas(): void {
    this.stationLabelAtlasCanvas = undefined;
    this.stationLabelAtlasEntries.clear();
    this.stationLabelAtlasSource = undefined;
    this.stationLabelAtlasPixelRatio = 0;
  }

  private setCssTransform(context: CanvasRenderingContext2D): void {
    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
  }

  private clearCanvas(context: CanvasRenderingContext2D): void {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas?.width ?? 0, this.canvas?.height ?? 0);
  }

  private blitPathCache(context: CanvasRenderingContext2D, camera: CameraState): void {
    const cachedCamera = this.pathCacheCamera;
    const cacheCanvas = this.pathCacheCanvas;
    if (!cachedCamera || !cacheCanvas) return;
    const previousScale = worldScaleAtZoom(cachedCamera.zoom);
    const currentScale = worldScaleAtZoom(camera.zoom);
    const ratio = currentScale / previousScale;
    const translateX = (cachedCamera.centerWorldX - camera.centerWorldX) * currentScale
      + (1 - ratio) * camera.viewportWidthCssPx / 2;
    const translateY = (cachedCamera.centerWorldY - camera.centerWorldY) * currentScale
      + (1 - ratio) * camera.viewportHeightCssPx / 2;
    context.globalAlpha = 1;
    context.setLineDash([]);
    context.setTransform(
      ratio * (this.pixelRatio / this.pathCachePixelRatio),
      0,
      0,
      ratio * (this.pixelRatio / this.pathCachePixelRatio),
      translateX * this.pixelRatio,
      translateY * this.pixelRatio,
    );
    context.drawImage(cacheCanvas, 0, 0);
  }

  private ensurePathCacheCanvas(): void {
    if (this.pathCacheCanvas || !this.canvas) return;
    const ownerDocument = this.canvas.ownerDocument ?? (typeof document === "undefined" ? undefined : document);
    if (!ownerDocument) return;
    const cacheCanvas = ownerDocument.createElement("canvas");
    cacheCanvas.width = this.pathCacheWidth();
    cacheCanvas.height = this.pathCacheHeight();
    this.pathCacheCanvas = cacheCanvas;
    this.pathCacheContext = cacheCanvas.getContext("2d") ?? undefined;
  }

  private isPathCacheCurrent(camera: CameraState, scene: TransportMapRenderScene): boolean {
    const cachedCamera = this.pathCacheCamera;
    return Boolean(
      this.pathCacheValid &&
      cachedCamera &&
      this.pathCacheCanvas &&
      this.pathCachePaths === scene.paths &&
      this.pathCacheLines === scene.lines &&
      this.pathCacheVisibleModeMask === scene.visibleModeMask &&
      this.pathCacheInterruptionLineIds === scene.interruptionLineIds &&
      this.pathCacheDisturbanceLineIds === scene.disturbanceLineIds &&
      this.pathCacheTrafficPathSpans === scene.trafficPathSpans &&
      this.pathCacheActiveLineId === scene.activeLineId &&
      this.pathCacheGhostLineIds === scene.ghostLineIds &&
      this.pathCacheHoveredLineId === scene.hoveredLineId &&
      this.pathCacheIsochrones === scene.walkingIsochrones &&
      sameStringList(this.pathCacheHoveredIsochroneIds, scene.hoveredIsochroneIds) &&
      cachedCamera.viewportWidthCssPx === camera.viewportWidthCssPx &&
      cachedCamera.viewportHeightCssPx === camera.viewportHeightCssPx &&
      cachedCamera.pixelRatio === camera.pixelRatio &&
      this.pathCacheCanvas.width === this.pathCacheWidth() &&
      this.pathCacheCanvas.height === this.pathCacheHeight(),
    );
  }

  private capturePathCache(
    camera: CameraState,
    scene: TransportMapRenderScene,
    drawCalls: number,
    visiblePathCount: number,
  ): void {
    this.ensurePathCacheCanvas();
    const cacheContext = this.pathCacheContext;
    const cacheCanvas = this.pathCacheCanvas;
    const sourceCanvas = this.canvas;
    if (!cacheContext || !cacheCanvas || !sourceCanvas) {
      this.invalidatePathCache();
      return;
    }
    cacheContext.setTransform(1, 0, 0, 1, 0, 0);
    const captureStartedAt = typeof performance === "undefined" ? Date.now() : performance.now();
    cacheContext.clearRect(0, 0, cacheCanvas.width, cacheCanvas.height);
    cacheContext.drawImage(sourceCanvas, 0, 0, cacheCanvas.width, cacheCanvas.height);
    const captureEndedAt = typeof performance === "undefined" ? Date.now() : performance.now();
    this.metrics.pathCacheCaptureCount = 1;
    this.metrics.pathCacheCaptureMs = Number((captureEndedAt - captureStartedAt).toFixed(3));
    this.metrics.pathCacheCapturedBytes = cacheCanvas.width * cacheCanvas.height * 4;
    this.pathCacheCamera = { ...camera };
    this.pathCachePaths = scene.paths;
    this.pathCacheLines = scene.lines;
    this.pathCacheInterruptionLineIds = scene.interruptionLineIds;
    this.pathCacheDisturbanceLineIds = scene.disturbanceLineIds;
    this.pathCacheTrafficPathSpans = scene.trafficPathSpans;
    this.pathCacheVisibleModeMask = scene.visibleModeMask;
    this.pathCacheActiveLineId = scene.activeLineId;
    this.pathCacheGhostLineIds = scene.ghostLineIds;
    this.pathCacheHoveredLineId = scene.hoveredLineId;
    this.pathCacheIsochrones = scene.walkingIsochrones;
    this.pathCacheHoveredIsochroneIds = scene.hoveredIsochroneIds;
    this.pathCacheVisiblePathCount = visiblePathCount;
    this.pathCacheValid = true;
  }

  private invalidatePathCache(): void {
    this.pathCacheValid = false;
    this.pathCacheCamera = undefined;
    this.pathCachePaths = undefined;
    this.pathCacheLines = undefined;
    this.pathCacheInterruptionLineIds = undefined;
    this.pathCacheDisturbanceLineIds = undefined;
    this.pathCacheTrafficPathSpans = undefined;
    this.pathCacheVisibleModeMask = -1;
    this.pathCacheActiveLineId = undefined;
    this.pathCacheGhostLineIds = undefined;
    this.pathCacheHoveredLineId = undefined;
    this.pathCacheIsochrones = undefined;
    this.pathCacheHoveredIsochroneIds = undefined;
    this.pathCacheVisiblePathCount = 0;
  }

  private pathCacheWidth(): number {
    return Math.ceil(this.widthCssPx * this.pathCachePixelRatio);
  }

  private pathCacheHeight(): number {
    return Math.ceil(this.heightCssPx * this.pathCachePixelRatio);
  }

  private prepareTrafficRangeViews(
    path: GlobalMapPath,
    mode: GlobalMapMode,
    trafficPathSpans: readonly TransportMapTrafficPathSpan[] | undefined,
  ): void {
    const preparedSubpaths = this.getPreparedPathSubpaths(path, mode);
    for (const subpath of preparedSubpaths) {
      if (subpath.trafficRangesPrepared && subpath.trafficRangeSource === trafficPathSpans) continue;
      subpath.trafficRangeViews.length = 0;
      subpath.trafficRangeSource = trafficPathSpans;
      subpath.trafficRangesPrepared = true;
      const spans = this.sceneIndexes.trafficRanges.getGrouped(path.id);
      if (spans.length === 0) continue;
      const ranges = this.sceneIndexes.trafficRanges.getForSubpath(
        subpath,
        subpath.start,
        subpath.end,
        path.id,
      );
      for (const range of ranges) {
        if (range.endVertexIndex <= range.startVertexIndex) continue;
        const relativeStart = range.startVertexIndex - subpath.start;
        const relativeEnd = range.endVertexIndex - subpath.start;
        const points: Array<{ x: number; y: number }> = [];
        const protectedPointIndices: number[] = [];
        for (let index = relativeStart; index <= relativeEnd; index += 1) {
          const point = subpath.screenPoints[index];
          if (!point) continue;
          points.push(point);
          if (subpath.vertices[index]?.stationId) {
            protectedPointIndices.push(points.length - 1);
          }
        }
        if (points.length >= 2) {
          subpath.trafficRangeViews.push({
            startVertexIndex: range.startVertexIndex,
            endVertexIndex: range.endVertexIndex,
            kind: range.kind,
            points,
            protectedPointIndices,
          });
        }
      }
    }
  }

  private updateSceneIndexes(scene: TransportMapRenderScene): void {
    const pathsChanged = this.pathsSource !== scene.paths;
    const stationsChanged = this.stationsSource !== scene.stations;
    const trafficChanged = this.trafficPathSpansSource !== scene.trafficPathSpans;
    this.sceneIndexes.update(scene);
    this.linesSource = scene.lines;
    this.pathsSource = scene.paths;
    this.stationsSource = scene.stations;
    this.linesById = this.sceneIndexes.linesById;
    this.pathsByLineId = this.sceneIndexes.pathsByLineId;
    this.stationsById = this.sceneIndexes.stationsById;
    this.visibleLineIds = this.sceneIndexes.visibleLineIds;
    this.ghostLines = this.sceneIndexes.ghostLineIds;
    this.entranceStationIds = this.sceneIndexes.entranceStationIds;
    this.activeLineStationIds = this.sceneIndexes.activeLineStationIds;
    this.interruptionLines = this.sceneIndexes.interruptionLineIds;
    this.disturbanceLines = this.sceneIndexes.disturbanceLineIds;
    this.interruptedStations = this.sceneIndexes.interruptedStationIds;
    this.disturbedStations = this.sceneIndexes.disturbedStationIds;
    this.selectedStations = this.sceneIndexes.selectedStationIds;
    this.visibleModeMask = scene.visibleModeMask;
    this.ghostLineIdsSource = scene.ghostLineIds;
    this.entranceStationIdsSource = scene.entranceStationIds;
    this.interruptionLineIdsSource = scene.interruptionLineIds;
    this.disturbanceLineIdsSource = scene.disturbanceLineIds;
    this.interruptedStationIdsSource = scene.interruptedStationIds;
    this.disturbedStationIdsSource = scene.disturbedStationIds;
    this.selectedStationIdsSource = scene.selectedStationIds;
    this.trafficPathSpansSource = scene.trafficPathSpans;
    this.preparedWorldGeometry.setStationsSource(scene.stations);
    if (stationsChanged) {
      this.preparedPathSubpaths = new WeakMap();
    }
    if (pathsChanged || stationsChanged) {
      // Prepare the complete focused scene while it is stable. A fast zoom-out
      // can expose hundreds of paths that were outside the z16 viewport; doing
      // station-anchor resolution lazily at first visibility would move that
      // one-time work into the critical wheel frame.
      for (const path of scene.paths) {
        const line = this.linesById.get(path.lineId);
        if (line) this.getPreparedPathSubpaths(path, line.mode);
      }
      this.prepareWorldLinePaths(scene.paths);
    }
    if (pathsChanged || stationsChanged || trafficChanged) {
      for (const path of scene.paths) {
        const line = this.linesById.get(path.lineId);
        if (!line) continue;
        this.prepareTrafficRangeViews(path, line.mode, scene.trafficPathSpans);
      }
    }
    const activeLine = scene.activeLineId ? this.linesById.get(scene.activeLineId) : undefined;
    if (
      this.activeLineSource !== activeLine ||
      this.labelPathsSource !== scene.paths ||
      this.labelStationsSource !== scene.stations
    ) {
      this.activeLineSource = activeLine;
      this.labelPathsSource = scene.paths;
      this.labelStationsSource = scene.stations;
      this.activeLineStationIds = this.sceneIndexes.activeLineStationIds;

      const orderedStationIds = activeLine
        ? activeLine.stationIds.length
          ? activeLine.stationIds
          : scene.paths
            .filter((path) => path.lineId === activeLine.id)
            .flatMap((path) => path.stationIds)
        : [];
      this.labelOrder = new Map(orderedStationIds.map((stationId, index) => [stationId, index]));
      this.labelTerminalIds = new Set(
        orderedStationIds.length > 1
          ? [orderedStationIds[0], orderedStationIds[orderedStationIds.length - 1]]
          : orderedStationIds,
      );
      this.labelStations = activeLine
        ? scene.stations
          .filter((station) => this.activeLineStationIds.has(station.id))
          .sort((left, right) =>
            (this.labelOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
              (this.labelOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
          )
        : [];
      this.stationLabelWidths.clear();
      this.invalidateStationLabelAtlas();
    }
  }
}

function setLabelRect(
  target: ScreenRect,
  x: number,
  y: number,
  width: number,
  height: number,
  align: CanvasTextAlign,
): void {
  const left = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
  target.left = left;
  target.top = y - height / 2;
  target.right = left + width;
  target.bottom = y + height / 2;
}

function rectanglesOverlap(
  left: ScreenRect,
  right: ScreenRect,
  padding: number,
): boolean {
  return !(
    left.right + padding < right.left ||
    left.left - padding > right.right ||
    left.bottom + padding < right.top ||
    left.top - padding > right.bottom
  );
}

function sameStringList(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}
