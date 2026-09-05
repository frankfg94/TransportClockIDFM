import { computed, nextTick, shallowRef, triggerRef, type ShallowRef } from "vue";
import type { GlobalMapQuayMarker } from "../transport-map/contracts/renderer";
import type {
  GlobalMapBounds,
  GlobalMapLine,
  GlobalMapPath,
} from "../transport-map/contracts/manifest";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../transport-map/config/globalTransportPlanConfig";
import {
  clampCameraToBounds,
  type CameraState,
} from "../transport-map/geo/camera";
import {
  visibleWorldBounds,
  worldToScreen,
} from "../transport-map/geo/coordinateKernel";
import { definitionTransformStyle } from "../transport-map/basemap/basemapDefinition";
import type {
  SelectedLineBasemapCoverOptions,
} from "../transport-map/basemap/selectedLineBasemapCover";
import type {
  TransportMapBasemapLayer,
  TransportMapBasemapStyle,
} from "../transport-map/basemap/tileMath";
import {
  measureBasemapCoverage,
} from "../transport-map/performance/basemapCoverage";
import type { ChaosZoomBasemapCoverage } from "./useChaosZoom";

export interface GlobalTransportBasemapBridge {
  id: string;
  anchorCamera: CameraState;
  bounds: GlobalMapBounds;
  floorZoom: number;
  fadeStartZoom: number;
  fadeEndZoom: number;
  fadeOutStartZoom: number;
  fadeOutEndZoom: number;
  options: Partial<SelectedLineBasemapCoverOptions>;
}

interface LegacyBasemapHandle {
  getStackElement: () => HTMLElement | undefined;
  isSelectedLineCoverReady: () => boolean;
}

export interface UseGlobalTransportLegacyBasemapOptions {
  camera: ShallowRef<CameraState>;
  getStage: () => HTMLElement | undefined;
  getLegacyBasemap: () => LegacyBasemapHandle | undefined;
  getActiveLine: () => GlobalMapLine | undefined;
  getLineMetadataPaths: () => readonly GlobalMapPath[];
  getVisibleSelectedBusDirectionQuays: () => readonly GlobalMapQuayMarker[];
  getSelectedBusDirectionStationIds: () => readonly string[] | undefined;
  getSelectedLineGeometryBounds: () => GlobalMapBounds | undefined;
  isLegacyExperience: () => boolean;
  getCoverOverride: () => boolean | undefined;
  getInteractionActive: () => boolean;
  hasNetwork: () => boolean;
  getMapBounds: () => GlobalMapBounds;
  getBasemapLayer: () => TransportMapBasemapLayer;
  getBasemapStyle: () => TransportMapBasemapStyle;
  getBasemapContrast: () => number;
}

export function useGlobalTransportLegacyBasemap(
  options: UseGlobalTransportLegacyBasemapOptions,
) {
  const selectedLineCoverAnchorCamera = shallowRef<CameraState>();
  const selectedLineCoverGeometryBounds = shallowRef<GlobalMapBounds>();
  const selectedLineBridgeCoverSnapshots = shallowRef<GlobalTransportBasemapBridge[]>([]);
  const basemapTileRefreshCamera = shallowRef<CameraState>();
  const selectedLineBasemapInteractionAnchor = shallowRef<CameraState>();

  const selectedLineCoverEnabled = computed(() => {
    if (!options.isLegacyExperience()) return false;
    const hasContext = Boolean(
      options.getActiveLine() &&
        selectedLineCoverAnchorCamera.value &&
        selectedLineCoverGeometryBounds.value,
    );
    const enabled =
      options.getCoverOverride() ?? GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.basemapCover.enabled;
    return Boolean(hasContext && enabled);
  });

  const liveBasemapInteractionActive = computed(() => options.getInteractionActive());
  const basemapRenderCamera = computed<CameraState>(() =>
    selectedLineCoverEnabled.value &&
    options.getInteractionActive() &&
    selectedLineBasemapInteractionAnchor.value
      ? selectedLineBasemapInteractionAnchor.value
      : options.camera.value,
  );

  const selectedLineActiveBridgeId = (zoom: number): string | undefined => {
    const bridges = selectedLineBridgeCoverSnapshots.value;
    if (!bridges.length) return undefined;
    // Every immutable bridge is fully decoded before interaction. Switching at
    // the beginning of the next bridge's former fade-in interval keeps one and
    // only one native raster surface active, avoiding two/three full-screen
    // alpha blends while retaining the same source-level progression.
    let active = bridges[0];
    if (!active) return undefined;
    const firstActivation = active.fadeStartZoom;
    if (zoom < firstActivation) return undefined;
    for (let index = 1; index < bridges.length; index += 1) {
      const candidate = bridges[index];
      if (!candidate) continue;
      const activation = candidate.fadeStartZoom;
      if (zoom >= activation) active = candidate;
      else break;
    }
    return active.id;
  };

  const selectedLineBroadCoverStyle = computed<Record<string, string>>(() => {
    const opacity = selectedLineCoverEnabled.value &&
      !selectedLineActiveBridgeId(options.camera.value.zoom)
      ? 1
      : 0;
    return {
      opacity: String(opacity),
      visibility: opacity === 0 ? "hidden" : "visible",
      "--selected-line-cover-will-change": opacity > 0 && options.getInteractionActive()
        ? "transform"
        : "auto",
    };
  });

  const selectedLineBroadCoverCamera = computed<CameraState>(() => {
    const opacity = Number(selectedLineBroadCoverStyle.value.opacity ?? 0);
    return opacity > 0.001
      ? basemapRenderCamera.value
      : selectedLineCoverAnchorCamera.value ?? options.camera.value;
  });

  const selectedLineLiveRasterStyle = computed<Record<string, string>>(() => {
    // The live committed raster is the non-negotiable fallback below the
    // immutable covers. Hiding it in the intermediate zoom bands made a cover
    // rectangle translated outside the viewport expose the stack background
    // indefinitely, even though decoded live tiles were already available.
    return {
      opacity: "1",
      visibility: "visible",
    };
  });

  const basemapStackStyle = computed<Record<string, string>>(() => {
    const interactionTransform =
      selectedLineCoverEnabled.value &&
      options.getInteractionActive() &&
      selectedLineBasemapInteractionAnchor.value
        ? definitionTransformStyle(selectedLineBasemapInteractionAnchor.value, options.camera.value)
        : undefined;
    const basemapStyle = options.getBasemapStyle();
    const basemapContrast = options.getBasemapContrast();
    const layer = options.getBasemapLayer();
    return {
      "--global-selected-line-basemap-background":
        layer === "satellite"
          ? "#1b2430"
          : GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.background,
      "--global-selected-line-basemap-opacity":
        layer === "satellite"
          ? "0.92"
          : basemapStyle === "voyager"
            ? "1"
            : "0.94",
      "--global-selected-line-basemap-filter":
        layer === "satellite"
          ? `saturate(0.82) contrast(${basemapContrast}) brightness(0.82)`
          : basemapStyle === "voyager"
            ? `saturate(1.32) contrast(${basemapContrast}) brightness(0.96)`
            : `saturate(1.08) contrast(${basemapContrast}) brightness(0.98)`,
      transformOrigin: "0 0",
      willChange: interactionTransform ? "transform" : "auto",
      ...(interactionTransform ?? { transform: "none" }),
    };
  });

  function selectedLineGeometryFingerprint(): string {
    const line = options.getActiveLine();
    if (!line) return "";
    let hash = 2_166_136_261;
    const add = (value: string | number): void => {
      const textValue = String(value);
      for (let index = 0; index < textValue.length; index += 1) {
        hash ^= textValue.charCodeAt(index);
        hash = Math.imul(hash, 16_777_619) >>> 0;
      }
    };
    add(line.id);
    for (const path of options.getLineMetadataPaths()) {
      add(path.id);
      add(path.sourceVersion);
      add(path.vertices.length);
      for (const vertex of path.vertices) {
        add(vertex.x.toFixed(9));
        add(vertex.y.toFixed(9));
      }
    }
    for (const quay of options.getVisibleSelectedBusDirectionQuays()) {
      add(quay.id);
      add(quay.worldX.toFixed(9));
      add(quay.worldY.toFixed(9));
    }
    return `${hash >>> 0}`;
  }

  const selectedLineCoverGeometryKey = computed(() => {
    const bounds = options.getSelectedLineGeometryBounds();
    return [
      options.getActiveLine()?.id ?? "",
      options.getSelectedBusDirectionStationIds()?.join(",") ?? "",
      bounds
        ? [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]
            .map((value) => value.toFixed(12))
            .join(",")
        : "",
      selectedLineGeometryFingerprint(),
    ].join("|");
  });

  function captureSelectedLineBasemapCoverSnapshot(reanchorBroadCover = true): void {
    // ResizeObserver may report fractional layout hand-offs while a wheel
    // animation is running. Re-anchoring here used the current intermediate
    // zoom and rebuilt every decoded cover on nearly every input event. Keep
    // the already prepared immutable pyramid until the gesture has settled.
    if (
      options.getInteractionActive() &&
      selectedLineCoverAnchorCamera.value &&
      selectedLineBridgeCoverSnapshots.value.length > 0
    ) {
      return;
    }
    const line = options.getActiveLine();
    const bounds = options.getSelectedLineGeometryBounds();
    if (!line || !bounds) {
      selectedLineCoverAnchorCamera.value = undefined;
      selectedLineCoverGeometryBounds.value = undefined;
      selectedLineBridgeCoverSnapshots.value = [];
      return;
    }

    if (!reanchorBroadCover && selectedLineBridgeCoverSnapshots.value.length > 0) {
      const previousAnchor = selectedLineBridgeCoverSnapshots.value[0]!.anchorCamera;
      const previousCenter = worldToScreen(
        { x: previousAnchor.centerWorldX, y: previousAnchor.centerWorldY },
        options.camera.value,
      );
      const offsetX = Math.abs(
        previousCenter.x - options.camera.value.viewportWidthCssPx / 2,
      );
      const offsetY = Math.abs(
        previousCenter.y - options.camera.value.viewportHeightCssPx / 2,
      );
      // Every bridge already contains the four corner zoom trajectories. Keep
      // that decoded pyramid until the settled camera has moved by more than a
      // fifth of the viewport; recomposing it after every centred wheel gesture
      // only adds memory bandwidth and frame-time spikes.
      if (
        offsetX <= options.camera.value.viewportWidthCssPx * 0.2 &&
        offsetY <= options.camera.value.viewportHeightCssPx * 0.2
      ) {
        return;
      }
    }

    // The geometry is copied in one synchronous transaction. The live camera
    // may then move freely; this immutable raster anchor is the only input that
    // is allowed to rebuild the cover during a later explicit context change.
    // A high, deterministic anchor keeps the one-source cover detailed at the
    // supported fast dezoom destination instead of magnifying a z6/z8 fallback
    // around the edges of the live definition.
    if (reanchorBroadCover || !selectedLineCoverAnchorCamera.value) {
      selectedLineCoverAnchorCamera.value = {
        ...options.camera.value,
        zoom: Math.max(
          options.camera.value.zoom,
          GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.basemapCover.anchorZoom,
        ),
      };
      selectedLineCoverGeometryBounds.value = { ...bounds };
    }
    selectedLineBridgeCoverSnapshots.value =
      GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.basemapBridgeCovers.map((bridge) => {
        const anchorCamera = {
          ...options.camera.value,
          zoom: bridge.anchorZoom,
        };
        // A zoom around a pointer near any viewport edge also translates the
        // camera. Size each immutable bridge down to the beginning of its band;
        // calculateSelectedLineCoverageBounds then unions all four corner paths.
        // A rectangle sized only at fadeEndZoom shrank together with the live
        // definition and exposed exactly the same side gaps it was meant to hide.
        const coveredZoomOutLevels = Math.max(
          bridge.coveredZoomOutLevels,
          bridge.anchorZoom - bridge.fadeStartZoom,
        );
        return {
          id: bridge.id,
          anchorCamera,
          bounds: visibleWorldBounds(anchorCamera),
          floorZoom: bridge.anchorZoom - coveredZoomOutLevels,
          fadeStartZoom: bridge.fadeStartZoom,
          fadeEndZoom: bridge.fadeEndZoom,
          fadeOutStartZoom: bridge.fadeOutStartZoom,
          fadeOutEndZoom: bridge.fadeOutEndZoom,
          options: {
            coveredZoomOutLevels,
            detailLeadLevels: bridge.detailLeadLevels,
            maxSourceZoom: bridge.maxSourceZoom,
            maxTiles: bridge.maxTiles,
            maxEstimatedDecodedBytes: bridge.maxEstimatedDecodedBytes,
            boundsPaddingRatio: bridge.boundsPaddingRatio,
            // Carto's @2x tiles provide one extra level of real raster detail
            // without multiplying the geographical tile rectangle. This keeps
            // zoom-in sharp while preserving the 32–64 tile cover budget.
            retinaPixelRatio: bridge.id === "detail" || bridge.id === "high-viewport"
              ? 1
              : GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.retinaPixelRatio,
          },
        };
      });
  }

  function selectedLineBridgeOpacity(bridge: GlobalTransportBasemapBridge): number {
    return selectedLineActiveBridgeId(options.camera.value.zoom) === bridge.id ? 1 : 0;
  }

  function selectedLineBridgeCoverStyle(
    bridge: GlobalTransportBasemapBridge,
  ): Record<string, string> {
    const opacity = selectedLineBridgeOpacity(bridge);
    return {
      opacity: String(opacity),
      visibility: opacity === 0 ? "hidden" : "visible",
      "--selected-line-cover-will-change": opacity > 0 && options.getInteractionActive()
        ? "transform"
        : "auto",
    };
  }

  function selectedLineBridgeCamera(bridge: GlobalTransportBasemapBridge): CameraState {
    // Hidden canvases keep their immutable anchor transform. Only the active
    // source level receives per-frame camera props, avoiding needless Vue style
    // patches and compositor work for the whole pyramid.
    return selectedLineBridgeOpacity(bridge) > 0.001
      ? basemapRenderCamera.value
      : bridge.anchorCamera;
  }

  let selectedLineBroadCoverElement: HTMLElement | undefined;
  let selectedLineBroadCoverOpacity: number | undefined;
  let selectedLineBridgeElements: Array<{
    bridge: GlobalTransportBasemapBridge;
    element: HTMLElement;
    opacity?: number;
  }> = [];

  function cacheSelectedLineBasemapGestureElements(): void {
    const stage = options.getStage();
    selectedLineBroadCoverElement = stage?.querySelector<HTMLElement>(
      '[data-selected-line-basemap-cover-role="broad"]',
    ) ?? undefined;
    const byId = new Map(
      [...(stage?.querySelectorAll<HTMLElement>("[data-selected-line-basemap-bridge]") ?? [])]
        .map((element) => [element.dataset.selectedLineBasemapBridgeId, element] as const),
    );
    selectedLineBridgeElements = selectedLineBridgeCoverSnapshots.value.flatMap((bridge) => {
      const element = byId.get(bridge.id);
      return element ? [{ bridge, element, opacity: undefined }] : [];
    });
  }

  function updateSelectedLineBasemapGestureSurface(nextCamera: CameraState): void {
    const anchor = selectedLineBasemapInteractionAnchor.value;
    const stack = options.getLegacyBasemap()?.getStackElement();
    if (!anchor || !stack) return;
    const transform = definitionTransformStyle(anchor, nextCamera)?.transform ?? "none";
    stack.style.transform = transform;
    const nextWillChange = transform === "none" ? "auto" : "transform";
    if (stack.style.willChange !== nextWillChange) stack.style.willChange = nextWillChange;
    const activeBridgeId = selectedLineActiveBridgeId(nextCamera.zoom);
    const broadOpacity = activeBridgeId ? 0 : 1;
    if (
      selectedLineBroadCoverElement &&
      (selectedLineBroadCoverOpacity === undefined ||
        Math.abs(selectedLineBroadCoverOpacity - broadOpacity) > 0.0001)
    ) {
      selectedLineBroadCoverElement.style.opacity = String(broadOpacity);
      selectedLineBroadCoverElement.style.visibility = broadOpacity === 0 ? "hidden" : "visible";
      selectedLineBroadCoverOpacity = broadOpacity;
    }
    for (const entry of selectedLineBridgeElements) {
      const opacity = selectedLineActiveBridgeId(nextCamera.zoom) === entry.bridge.id ? 1 : 0;
      if (entry.opacity !== undefined && Math.abs(entry.opacity - opacity) <= 0.0001) continue;
      entry.element.style.opacity = String(opacity);
      entry.element.style.visibility = opacity === 0 ? "hidden" : "visible";
      entry.opacity = opacity;
    }
  }

  function beginSelectedLineBasemapGestureSurface(): void {
    selectedLineBasemapInteractionAnchor.value = { ...options.camera.value };
    cacheSelectedLineBasemapGestureElements();
  }

  function applySelectedLineWheelCamera(nextCamera: CameraState): void {
    const next = options.hasNetwork()
      ? clampCameraToBounds(nextCamera, options.getMapBounds())
      : nextCamera;
    // Preserve the CameraState object identity during the gesture. Canvas and
    // audit code read the fresh values directly, while Vue and all hidden cover
    // components remain untouched until the atomic settle synchronization.
    Object.assign(options.camera.value, next);
    updateSelectedLineBasemapGestureSurface(options.camera.value);
  }

  function releaseSelectedLineBasemapGestureSurface(): void {
    if (selectedLineBasemapInteractionAnchor.value) triggerRef(options.camera);
    const stack = options.getLegacyBasemap()?.getStackElement();
    if (stack) {
      stack.style.transform = "none";
      stack.style.willChange = "auto";
    }
    selectedLineBasemapInteractionAnchor.value = undefined;
    selectedLineBroadCoverElement = undefined;
    selectedLineBroadCoverOpacity = undefined;
    selectedLineBridgeElements = [];
  }

  function setBasemapTileRefreshCamera(nextCamera: CameraState): void {
    basemapTileRefreshCamera.value = nextCamera;
  }

  function selectedLineZoomBasemapReady(): boolean {
    const committed = options.getStage()?.querySelector<HTMLElement>(
      '[data-definition-role="committed"]',
    );
    if (!committed) return false;
    const visibleTiles = [
      ...committed.querySelectorAll<HTMLImageElement>('img[data-tile-priority="visible"]'),
    ];
    return visibleTiles.length > 0 && visibleTiles.every(
      (tile) => tile.dataset.tileState === "decoded",
    );
  }

  function selectedLineZoomBasemapSettled(): boolean {
    if (!selectedLineZoomBasemapReady()) return false;
    return options.getStage()?.querySelector('[data-definition-role="pending"]') === null;
  }

  function selectedLineZoomCoverReady(): boolean {
    if (!selectedLineCoverEnabled.value) return true;
    if (options.getLegacyBasemap()?.isSelectedLineCoverReady() === true) return true;
    return options.getStage()?.querySelector<HTMLElement>(
      '[data-selected-line-basemap-cover][data-cover-ready="true"]',
    ) !== null;
  }

  function selectedLineZoomBridgeCoversReady(): boolean {
    if (!selectedLineCoverEnabled.value) return true;
    const bridges = [
      ...(options.getStage()?.querySelectorAll<HTMLElement>(
        "[data-selected-line-basemap-bridge]",
      ) ?? []),
    ];
    return (
      bridges.length === GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.basemapBridgeCovers.length &&
      bridges.every(
        (bridge) =>
          bridge.dataset.coverReady === "true" && bridge.dataset.coverPending !== "true",
      )
    );
  }

  function readSelectedLineBasemapCoverage(): ChaosZoomBasemapCoverage | undefined {
    const stage = options.getStage();
    if (!stage) return undefined;
    const stageRect = stage.getBoundingClientRect();
    const viewport = {
      left: 0,
      top: 0,
      right: Math.max(0, stageRect.width),
      bottom: Math.max(0, stageRect.height),
    };
    if (viewport.right === 0 || viewport.bottom === 0) return undefined;

    const toStageRectangle = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left - stageRect.left,
        top: rect.top - stageRect.top,
        right: rect.right - stageRect.left,
        bottom: rect.bottom - stageRect.top,
      };
    };
    const visibleLiveTiles = [
      ...stage.querySelectorAll<HTMLImageElement>(
        '[data-definition-role="committed"] img[data-tile-priority="visible"][data-tile-state="decoded"]',
      ),
    ];
    const liveRectangles = visibleLiveTiles.map(toStageRectangle);
    const coverElements = [
      ...stage.querySelectorAll<HTMLElement>(
        '[data-selected-line-basemap-cover][data-cover-ready="true"]',
      ),
    ];
    const coverRectangles = coverElements.map(toStageRectangle);
    const live = measureBasemapCoverage(viewport, liveRectangles);
    const combined = measureBasemapCoverage(viewport, [...liveRectangles, ...coverRectangles]);
    const liveDefinition = stage.querySelector<HTMLElement>(
      '[data-definition-role="committed"]',
    );
    const coverSignatures = coverElements
      .map((element) => element.dataset.coverDefinitionSignature)
      .filter((signature): signature is string => Boolean(signature));
    const verifiedCoverSurfaces = coverElements.filter(
      (element) => element.dataset.coverCompositeVerified === "true",
    ).length;
    return {
      live,
      combined,
      liveSignature: liveDefinition?.dataset.definitionSignature,
      coverSignature: coverSignatures.length > 0 ? coverSignatures.join("|") : undefined,
      coverReady: !selectedLineCoverEnabled.value || selectedLineZoomCoverReady(),
      pixelHealth: {
        verifiedCoverSurfaces,
        unverifiedCoverSurfaces: Math.max(0, coverElements.length - verifiedCoverSurfaces),
      },
    };
  }

  function waitForBasemapPrewarmFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  async function prewarmSelectedLineCoverTextures(): Promise<void> {
    await nextTick();
    const covers = [
      ...(options.getStage()?.querySelectorAll<HTMLElement>(
        '[data-selected-line-basemap-cover][data-cover-ready="true"]' +
          '[data-cover-pending="false"][data-cover-composite-verified="true"]',
      ) ?? []),
    ];
    for (const cover of covers) {
      const opacity = Number.parseFloat(cover.style.opacity || "1");
      if (opacity > 0.001 && cover.style.visibility !== "hidden") continue;
      const previous = {
        opacity: cover.style.opacity,
        visibility: cover.style.visibility,
        willChange: cover.style.willChange,
      };
      // 0.1% remains visually imperceptible above the fully opaque live raster,
      // but forces Chromium to upload this already verified canvas while idle.
      cover.style.visibility = "visible";
      cover.style.opacity = "0.001";
      cover.style.willChange = "transform";
      await waitForBasemapPrewarmFrame();
      await waitForBasemapPrewarmFrame();
      cover.style.opacity = previous.opacity;
      cover.style.visibility = previous.visibility;
      cover.style.willChange = previous.willChange;
    }
    await waitForBasemapPrewarmFrame();
  }

  return {
    selectedLineCoverAnchorCamera,
    selectedLineCoverGeometryBounds,
    selectedLineBridgeCoverSnapshots,
    basemapTileRefreshCamera,
    selectedLineCoverEnabled,
    basemapStackStyle,
    selectedLineBroadCoverStyle,
    selectedLineBroadCoverCamera,
    selectedLineLiveRasterStyle,
    liveBasemapInteractionActive,
    basemapRenderCamera,
    selectedLineCoverGeometryKey,
    selectedLineBridgeCoverStyle,
    selectedLineBridgeCamera,
    beginSelectedLineBasemapGestureSurface,
    applySelectedLineWheelCamera,
    releaseSelectedLineBasemapGestureSurface,
    setBasemapTileRefreshCamera,
    captureSelectedLineBasemapCoverSnapshot,
    selectedLineZoomBasemapReady,
    selectedLineZoomBasemapSettled,
    selectedLineZoomCoverReady,
    selectedLineZoomBridgeCoversReady,
    readSelectedLineBasemapCoverage,
    prewarmSelectedLineCoverTextures,
  };
}
