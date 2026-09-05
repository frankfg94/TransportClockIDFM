import { getCurrentInstance, onBeforeUnmount } from "vue";
import {
  panCameraByScreen,
  transformCameraForPinch,
  zoomCameraAroundScreenPoint,
  type CameraState,
} from "../transport-map/geo/camera";
import { screenToWorld, type ScreenPoint, type WorldPoint } from "../transport-map/geo/coordinateKernel";
import {
  clampInertiaVelocity,
  createInertiaState,
  startInertia,
  stepInertia,
  type InertiaState,
} from "../transport-map/interaction/inertia";
import { createKeyboardController } from "../transport-map/interaction/keyboardController";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../transport-map/config/globalTransportPlanConfig";
import type { TransportMapHitCandidates } from "../transport-map/spatial/hitTest";

export interface UseGlobalTransportMapInteractionOptions {
  isMounted: () => boolean;
  getCanvas: () => HTMLCanvasElement | undefined;
  getCamera: () => CameraState;
  applyCamera: (camera: CameraState, query?: boolean, refresh?: boolean, render?: boolean) => void;
  draw: () => void;
  drawNow: () => void;
  cancelQueuedDraw: () => void;
  setInteractionActive: (active: boolean) => void;
  isInteractionActive: () => boolean;
  setDisplayZoom: (zoom: number) => void;
  setWheelScrolling: (scrolling: boolean) => void;
  isLineChoiceOpen: () => boolean;
  shouldClearHoverOnWheel?: () => boolean;
  closeLineChoice: () => void;
  clearHover: () => void;
  updateHovered: (point: ScreenPoint) => void;
  hitAt: (point: ScreenPoint) => TransportMapHitCandidates;
  selectFeature: (hit: TransportMapHitCandidates, event?: MouseEvent) => void;
  scheduleViewportRefresh: () => void;
  cancelScheduledViewportRefresh: () => void;
  captureSelectedLineInteractionSceneIfReady: () => boolean;
  isSelectedLineCoverEnabled: () => boolean;
  beginSelectedLineBasemapGestureSurface: () => void;
  applySelectedLineWheelCamera: (camera: CameraState) => void;
  releaseSelectedLineBasemapGestureSurface: () => void;
  clearSelectedLineInteractionScene?: () => void;
  setBasemapTileRefreshCamera: (camera: CameraState) => void;
  captureSelectedLineBasemapCoverSnapshot: (reanchorBroadCover?: boolean) => void;
  getGhostLineRefreshPending: () => boolean;
  setGhostLineRefreshPending: (pending: boolean) => void;
  getActiveLineId: () => string | undefined;
  onReset: () => void;
  onSelect: () => void;
  onEscape: () => void;
  onFocusNext?: (direction: 1 | -1) => void;
  onContextMenu?: (point: ScreenPoint, event: MouseEvent) => void;
  getReduceMotion?: () => boolean;
}

export interface GlobalTransportCameraTarget {
  centerWorldX: number;
  centerWorldY: number;
  zoom: number;
}

export function useGlobalTransportMapInteraction(options: UseGlobalTransportMapInteractionOptions) {
  const pointers = new Map<number, ScreenPoint>();
  let pinchState:
    | { distance: number; midpoint: ScreenPoint; anchorWorld: WorldPoint; camera: CameraState }
    | undefined;
  let inertiaState: InertiaState = createInertiaState();
  let inertiaFrame: number | undefined;
  let wheelFrame: number | undefined;
  let pendingWheelDelta = 0;
  let pendingWheelPoint: ScreenPoint | undefined;
  let wheelCanvasOrigin: ScreenPoint | undefined;
  let wheelTargetZoom: number | undefined;
  let lastWheelTimestamp: number | undefined;
  let wheelEarlyRefreshScheduled = false;
  let lastWheelTileRefreshTimestamp: number | undefined;
  let wheelTileRefreshCount = 0;
  let lastInertiaTimestamp: number | undefined;
  let dragMoved = false;
  let dragVelocity = { x: 0, y: 0 };
  let dragLast: ScreenPoint | undefined;
  let lastPointerTime = 0;
  let cameraAnimationFrame: number | undefined;
  let cameraAnimationToken = 0;
  let dragDistance = 0;
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  let longPressStart: ScreenPoint | undefined;
  let suppressClickUntil = 0;

  function cancelLongPress(): void {
    clearTimeout(longPressTimer);
    longPressTimer = undefined;
    longPressStart = undefined;
  }

  // Register before the menu mounts: its document capture listener would
  // otherwise close it on the compatibility click following a touch release.
  function suppressLongPressClick(event: MouseEvent): void {
    if (Date.now() > suppressClickUntil || event.target !== options.getCanvas()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClickUntil = 0;
  }
  if (typeof document !== "undefined") document.addEventListener("click", suppressLongPressClick, true);

  const requestFrame = (callback: FrameRequestCallback): number => {
    if (typeof requestAnimationFrame !== "undefined") return requestAnimationFrame(callback);
    return window.setTimeout(() => callback(Date.now()), 16);
  };
  const cancelFrame = (frame: number): void => {
    if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(frame);
    else window.clearTimeout(frame);
  };

  function cancelCameraAnimation(): void {
    const wasCameraAnimating = cameraAnimationFrame !== undefined;
    cameraAnimationToken += 1;
    if (cameraAnimationFrame !== undefined) {
      cancelFrame(cameraAnimationFrame);
      cameraAnimationFrame = undefined;
    }
    // Wheel/pointer gestures also own interactionActive. Cancelling a camera
    // flight must not toggle that shared flag during an already active gesture.
    if (wasCameraAnimating && options.isInteractionActive()) {
      options.setInteractionActive(false);
      options.setDisplayZoom(options.getCamera().zoom);
    }
  }

  function animateCameraToTarget(
    target: GlobalTransportCameraTarget,
    onComplete?: () => void,
  ): void {
    const progressive = GLOBAL_TRANSPORT_PLAN_CONFIG.camera.progressiveNavigation;
    const start = { ...options.getCamera() };
    const targetZoom = clampZoom(target.zoom);
    const targetCenter = { x: target.centerWorldX, y: target.centerWorldY };
    const zoomChanged = Math.abs(targetZoom - start.zoom) > 0.001;
    const centerChanged =
      Math.abs(targetCenter.x - start.centerWorldX) > 0.0000001 ||
      Math.abs(targetCenter.y - start.centerWorldY) > 0.0000001;
    const totalDuration = zoomChanged
      ? progressive.zoomDurationMs + progressive.panDurationMs
      : centerChanged
        ? progressive.panDurationMs
        : 0;

    cancelCameraAnimation();
    cancelInertia();
    cancelWheelZoom();
    if (
      !progressive.enabled ||
      options.getReduceMotion?.() === true ||
      typeof requestAnimationFrame === "undefined" ||
      totalDuration <= 0 ||
      (!zoomChanged && !centerChanged)
    ) {
      options.applyCamera(
        {
          ...start,
          centerWorldX: targetCenter.x,
          centerWorldY: targetCenter.y,
          zoom: targetZoom,
        },
        false,
      );
      onComplete?.();
      return;
    }

    options.setInteractionActive(true);
    const token = ++cameraAnimationToken;
    let startedAt: number | undefined;

    const finish = () => {
      if (token !== cameraAnimationToken) return;
      cameraAnimationFrame = undefined;
      options.setInteractionActive(false);
      options.applyCamera(
        {
          ...options.getCamera(),
          centerWorldX: targetCenter.x,
          centerWorldY: targetCenter.y,
          zoom: targetZoom,
        },
        false,
        true,
        true,
      );
      onComplete?.();
    };

    const step = (timestamp: number) => {
      if (token !== cameraAnimationToken || !options.isMounted()) return;
      startedAt ??= timestamp;
      const elapsed = Math.max(0, timestamp - startedAt);
      if (elapsed >= totalDuration) {
        finish();
        return;
      }

      const progress = easeInOutCubic(elapsed / Math.max(1, totalDuration));
      options.applyCamera(
        {
          ...options.getCamera(),
          centerWorldX:
            start.centerWorldX + (targetCenter.x - start.centerWorldX) * progress,
          centerWorldY:
            start.centerWorldY + (targetCenter.y - start.centerWorldY) * progress,
          zoom: start.zoom + (targetZoom - start.zoom) * progress,
        },
        false,
        false,
        true,
      );
      cameraAnimationFrame = requestFrame(step);
    };

    cameraAnimationFrame = requestFrame(step);
  }

  function animateCameraToStation(station: { worldX: number; worldY: number }): void {
    animateCameraToTarget({
      centerWorldX: station.worldX,
      centerWorldY: station.worldY,
      zoom: GLOBAL_TRANSPORT_PLAN_CONFIG.selection.stationZoom,
    });
  }

  function localPoint(event: { clientX: number; clientY: number }): ScreenPoint {
    const rect = options.getCanvas()?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }

  function localWheelPoint(event: WheelEvent): ScreenPoint {
    if (!wheelCanvasOrigin) {
      const rect = options.getCanvas()?.getBoundingClientRect();
      wheelCanvasOrigin = { x: rect?.left ?? 0, y: rect?.top ?? 0 };
    }
    return {
      x: event.clientX - wheelCanvasOrigin.x,
      y: event.clientY - wheelCanvasOrigin.y,
    };
  }

  function distanceBetween(left: ScreenPoint, right: ScreenPoint): number {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }

  function midpoint(left: ScreenPoint, right: ScreenPoint): ScreenPoint {
    return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
  }

  function clampZoom(zoom: number): number {
    return Math.max(
      GLOBAL_TRANSPORT_PLAN_CONFIG.camera.minZoom,
      Math.min(GLOBAL_TRANSPORT_PLAN_CONFIG.camera.maxZoom, zoom),
    );
  }

  function cancelInertia(): void {
    if (inertiaFrame !== undefined) {
      cancelFrame(inertiaFrame);
      inertiaFrame = undefined;
    }
    inertiaState = createInertiaState();
    dragVelocity = { x: 0, y: 0 };
    lastInertiaTimestamp = undefined;
  }

  function cancelWheelZoom(): void {
    options.setWheelScrolling(false);
    pendingWheelDelta = 0;
    pendingWheelPoint = undefined;
    wheelCanvasOrigin = undefined;
    wheelTargetZoom = undefined;
    lastWheelTimestamp = undefined;
    wheelEarlyRefreshScheduled = false;
    lastWheelTileRefreshTimestamp = undefined;
    wheelTileRefreshCount = 0;
    if (wheelFrame !== undefined) {
      cancelFrame(wheelFrame);
      wheelFrame = undefined;
    }
    options.releaseSelectedLineBasemapGestureSurface();
    options.clearSelectedLineInteractionScene?.();
  }

  function finishWheelZoom(): void {
    options.setWheelScrolling(false);
    wheelTargetZoom = undefined;
    pendingWheelPoint = undefined;
    wheelCanvasOrigin = undefined;
    lastWheelTimestamp = undefined;
    wheelEarlyRefreshScheduled = false;
    lastWheelTileRefreshTimestamp = undefined;
    wheelTileRefreshCount = 0;
    options.setInteractionActive(false);
    options.releaseSelectedLineBasemapGestureSurface();
    options.clearSelectedLineInteractionScene?.();
    options.setDisplayZoom(options.getCamera().zoom);
    options.captureSelectedLineBasemapCoverSnapshot(false);
    options.draw();
    if (options.getGhostLineRefreshPending()) {
      options.setGhostLineRefreshPending(false);
      options.scheduleViewportRefresh();
    } else if (!options.getActiveLineId()) {
      options.scheduleViewportRefresh();
    }
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    options.setWheelScrolling(true);
    if (options.shouldClearHoverOnWheel?.() ?? options.isLineChoiceOpen()) options.clearHover();
    cancelCameraAnimation();
    cancelInertia();
    options.cancelScheduledViewportRefresh();
    options.captureSelectedLineInteractionSceneIfReady();
    if (!options.isInteractionActive() && options.isSelectedLineCoverEnabled()) {
      options.beginSelectedLineBasemapGestureSurface();
    }
    options.setInteractionActive(true);
    pendingWheelDelta += event.deltaY;
    pendingWheelPoint = localWheelPoint(event);
    wheelTargetZoom = clampZoom(
      (wheelTargetZoom ?? options.getCamera().zoom) -
        pendingWheelDelta * GLOBAL_TRANSPORT_PLAN_CONFIG.camera.wheelZoomFactor,
    );
    pendingWheelDelta = 0;
    const wheelCamera = options.getCamera();
    const wheelPoint = pendingWheelPoint ?? {
      x: wheelCamera.viewportWidthCssPx / 2,
      y: wheelCamera.viewportHeightCssPx / 2,
    };
    if (wheelFrame === undefined) wheelFrame = requestFrame(stepWheelZoom);
  }

  function stepWheelZoom(timestamp: number): void {
    wheelFrame = undefined;
    const elapsed =
      lastWheelTimestamp === undefined
        ? 16
        : Math.min(100, Math.max(0, timestamp - lastWheelTimestamp));
    lastWheelTimestamp = timestamp;
    const targetZoom = wheelTargetZoom;
    if (targetZoom === undefined) {
      lastWheelTimestamp = undefined;
      return;
    }
    const camera = options.getCamera();
    const point = pendingWheelPoint ?? {
      x: camera.viewportWidthCssPx / 2,
      y: camera.viewportHeightCssPx / 2,
    };
    const previousZoom = camera.zoom;
    const smoothing = GLOBAL_TRANSPORT_PLAN_CONFIG.camera.zoomSmoothingMs;
    const alpha = smoothing <= 0 ? 1 : 1 - Math.exp(-elapsed / smoothing);
    const distance = targetZoom - camera.zoom;
    const nextZoom = Math.abs(distance) <= 0.001 ? targetZoom : camera.zoom + distance * alpha;
    const nextCamera = zoomCameraAroundScreenPoint(camera, nextZoom, point);
    if (options.isSelectedLineCoverEnabled()) options.applySelectedLineWheelCamera(nextCamera);
    else options.applyCamera(nextCamera, false, false, false);
    options.cancelQueuedDraw();
    options.drawNow();
    refreshBasemapDuringWheelZoom(timestamp, targetZoom, previousZoom, point);
    const leadMs = GLOBAL_TRANSPORT_PLAN_CONFIG.camera.wheelViewportRefreshLeadMs;
    if (
      !options.getActiveLineId() &&
      !wheelEarlyRefreshScheduled &&
      leadMs > 0 &&
      estimateWheelSettleMs(targetZoom - nextZoom, smoothing) <= leadMs
    ) {
      wheelEarlyRefreshScheduled = true;
      options.scheduleViewportRefresh();
    }
    if (Math.abs(targetZoom - nextZoom) <= 0.001) {
      finishWheelZoom();
      return;
    }
    wheelFrame = requestFrame(stepWheelZoom);
  }

  function refreshBasemapDuringWheelZoom(
    timestamp: number,
    targetZoom: number,
    previousZoom: number,
    point: ScreenPoint,
  ): void {
    const preloadOptions = GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.wheelTilePreloading;
    const zoomingOut = targetZoom < previousZoom - 0.001;
    const firstRefresh = lastWheelTileRefreshTimestamp === undefined;
    const coverOptions = GLOBAL_TRANSPORT_PLAN_CONFIG.lineMap.basemapCover;
    const selectedLineRefreshTuning = options.isSelectedLineCoverEnabled();
    const intervalMs = Math.max(
      0,
      selectedLineRefreshTuning
        ? Math.min(preloadOptions.intervalMs, coverOptions.liveRefreshIntervalMs)
        : preloadOptions.intervalMs,
    );
    const intervalElapsed =
      firstRefresh || timestamp - lastWheelTileRefreshTimestamp! >= intervalMs;
    const shouldPreloadZoomOut = preloadOptions.zoomOut && zoomingOut && firstRefresh;
    if (
      (!preloadOptions.duringZoom && !shouldPreloadZoomOut) ||
      (!intervalElapsed && !shouldPreloadZoomOut)
    ) return;
    const maxRefreshes = selectedLineRefreshTuning
      ? Math.min(
          preloadOptions.maxRefreshesPerGesture,
          Math.max(0, coverOptions.maxLiveRefreshesDuringGesture),
        )
      : preloadOptions.maxRefreshesPerGesture;
    if (maxRefreshes <= 0 || wheelTileRefreshCount >= Math.max(1, maxRefreshes)) return;

    const refreshZoom = selectedLineRefreshTuning && zoomingOut
      ? options.getCamera().zoom
      : targetZoom;
    options.setBasemapTileRefreshCamera(
      zoomingOut && preloadOptions.zoomOut
        ? zoomCameraAroundScreenPoint(options.getCamera(), refreshZoom, point)
        : options.getCamera(),
    );
    lastWheelTileRefreshTimestamp = timestamp;
    wheelTileRefreshCount += 1;
  }

  function runInertia(): void {
    if (inertiaFrame !== undefined) cancelFrame(inertiaFrame);
    lastInertiaTimestamp = undefined;
    const tick = (timestamp: number) => {
      const elapsed =
        lastInertiaTimestamp === undefined
          ? 16
          : Math.min(
              GLOBAL_TRANSPORT_PLAN_CONFIG.camera.inertiaMaxFrameMs,
              Math.max(0, timestamp - lastInertiaTimestamp),
            );
      lastInertiaTimestamp = timestamp;
      const step = stepInertia(
        inertiaState,
        elapsed,
        GLOBAL_TRANSPORT_PLAN_CONFIG.camera.inertiaFrictionPerSecond,
      );
      inertiaState = step.state;
      if (step.deltaX || step.deltaY) {
        options.applyCamera(
          panCameraByScreen(options.getCamera(), { x: step.deltaX, y: step.deltaY }),
          false,
          false,
          false,
        );
        options.cancelQueuedDraw();
        options.drawNow();
      }
      if (inertiaState.active) inertiaFrame = requestFrame(tick);
      else {
        inertiaFrame = undefined;
        options.setInteractionActive(false);
        options.setDisplayZoom(options.getCamera().zoom);
        options.draw();
        options.scheduleViewportRefresh();
      }
    };
    if (inertiaState.active) inertiaFrame = requestFrame(tick);
  }

  function onPointerDown(event: PointerEvent): void {
    cancelLongPress();
    suppressClickUntil = 0;
    if (event.button !== undefined && event.button !== 0) return;
    const canvas = options.getCanvas();
    if (!canvas) return;
    if (options.isLineChoiceOpen()) {
      options.closeLineChoice();
      options.draw();
    }
    const point = localPoint(event);
    cancelCameraAnimation();
    cancelInertia();
    cancelWheelZoom();
    options.setInteractionActive(true);
    pointers.set(event.pointerId, point);
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic benchmark pointers are intentionally routed through this
      // same handler, but browsers do not grant them native pointer capture.
      // The controller's own pointer map still provides the complete drag.
    }
    dragLast = point;
    dragMoved = false;
    dragDistance = 0;
    lastPointerTime = typeof performance === "undefined" ? Date.now() : performance.now();
    if (event.pointerType === "touch" && pointers.size === 1 && options.onContextMenu) {
      longPressStart = point;
      longPressTimer = setTimeout(() => {
        cancelLongPress();
        if (!options.isMounted() || !pointers.has(event.pointerId)) return;
        onContextMenu(event);
      }, 550);
    }
    if (pointers.size === 2) {
      dragLast = undefined;
      dragMoved = true;
      dragVelocity = { x: 0, y: 0 };
      const values = [...pointers.values()];
      const initialMidpoint = midpoint(values[0]!, values[1]!);
      const anchor = options.getCamera();
      pinchState = {
        distance: distanceBetween(values[0]!, values[1]!),
        midpoint: initialMidpoint,
        anchorWorld: screenToWorld(initialMidpoint, anchor),
        camera: anchor,
      };
    }
  }

  function onPointerMove(event: PointerEvent): void {
    const point = localPoint(event);
    if (longPressStart) {
      if (distanceBetween(point, longPressStart) <= 8) return;
      cancelLongPress();
    }
    if (!pointers.has(event.pointerId)) {
      options.updateHovered(point);
      return;
    }
    pointers.set(event.pointerId, point);
    if (pointers.size >= 2 && pinchState) {
      dragLast = undefined;
      dragVelocity = { x: 0, y: 0 };
      dragMoved = true;
      const values = [...pointers.values()];
      const distance = distanceBetween(values[0]!, values[1]!);
      const currentMidpoint = midpoint(values[0]!, values[1]!);
      options.applyCamera(
        transformCameraForPinch(
          pinchState.camera,
          pinchState.distance,
          pinchState.anchorWorld,
          distance,
          currentMidpoint,
          GLOBAL_TRANSPORT_PLAN_CONFIG.camera.minZoom,
          GLOBAL_TRANSPORT_PLAN_CONFIG.camera.maxZoom,
        ),
        false,
        false,
      );
      return;
    }
    if (dragLast) {
      const dx = point.x - dragLast.x;
      const dy = point.y - dragLast.y;
      const now = typeof performance === "undefined" ? Date.now() : performance.now();
      const elapsed = Math.max(1, now - lastPointerTime);
      if (Math.hypot(dx, dy) > 0) {
        dragDistance += Math.hypot(dx, dy);
        // A slow drag can be made of many sub-threshold samples. Classify it
        // using the total gesture distance so it cannot end as an accidental
        // feature tap merely because no single sample moved 2 px.
        dragMoved = dragMoved || dragDistance > 2;
        const panSensitivity = GLOBAL_TRANSPORT_PLAN_CONFIG.camera.panSensitivity;
        const panDelta = { x: dx * panSensitivity, y: dy * panSensitivity };
        const nextCamera = panCameraByScreen(options.getCamera(), panDelta);
        options.applyCamera(nextCamera, false, false);
        dragVelocity = clampInertiaVelocity(panDelta.x / elapsed, panDelta.y / elapsed);
      }
      dragLast = point;
      lastPointerTime = now;
      return;
    }
    options.updateHovered(point);
  }

  function onPointerUp(event: PointerEvent): void {
    cancelLongPress();
    if (!pointers.has(event.pointerId)) {
      if (suppressClickUntil) suppressClickUntil = Date.now() + 1500;
      return;
    }
    if (event.button !== undefined && event.button !== 0) return;
    const point = localPoint(event);
    const wasPinching = Boolean(pinchState);
    pointers.delete(event.pointerId);
    if (pointers.size < 2) {
      pinchState = undefined;
      if (wasPinching) dragVelocity = { x: 0, y: 0 };
      if (pointers.size === 1) {
        dragLast = [...pointers.values()][0];
        lastPointerTime = typeof performance === "undefined" ? Date.now() : performance.now();
      }
    }
    const canvas = options.getCanvas();
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!dragMoved && pointers.size === 0) {
      const hit = options.hitAt(point);
      if (hit.station || hit.lines.length) options.selectFeature(hit, event);
    } else if (dragMoved && pointers.size === 0) {
      inertiaState = startInertia(inertiaState, dragVelocity.x, dragVelocity.y);
      runInertia();
    }
    if (pointers.size === 0) dragLast = undefined;
    if (pointers.size === 0) dragDistance = 0;
    if (pointers.size === 0 && !inertiaState.active) {
      options.setInteractionActive(false);
      options.setDisplayZoom(options.getCamera().zoom);
      options.draw();
      options.scheduleViewportRefresh();
    }
  }

  function onPointerCancel(event: PointerEvent): void {
    cancelLongPress();
    pointers.delete(event.pointerId);
    pinchState = undefined;
    dragVelocity = { x: 0, y: 0 };
    if (pointers.size === 1) {
      dragLast = [...pointers.values()][0];
      lastPointerTime = typeof performance === "undefined" ? Date.now() : performance.now();
      dragMoved = true;
      return;
    }
    dragLast = undefined;
    dragMoved = false;
    dragDistance = 0;
    cancelInertia();
    if (pointers.size === 0) {
      options.setInteractionActive(false);
      options.setDisplayZoom(options.getCamera().zoom);
      options.draw();
      options.scheduleViewportRefresh();
    }
  }

  function onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    cancelLongPress();
    if (pointers.size) {
      suppressClickUntil = Date.now() + 1500;
      const ids = [...pointers.keys()];
      pointers.clear();
      pinchState = undefined;
      dragLast = undefined;
      cancelInertia();
      options.setInteractionActive(false);
      const canvas = options.getCanvas();
      for (const id of ids) {
        if (canvas?.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
      }
      options.draw();
      options.scheduleViewportRefresh();
    }
    options.onContextMenu?.(localPoint(event), event);
  }

  function onLostPointerCapture(event: PointerEvent): void {
    if (!pointers.has(event.pointerId)) return;
    onPointerCancel(event);
  }

  function isScrolling(): boolean {
    return options.isInteractionActive() || wheelFrame !== undefined || wheelTargetZoom !== undefined;
  }

  function isCameraAnimationActive(): boolean {
    return cameraAnimationFrame !== undefined;
  }

  function isWheelScrolling(): boolean {
    return wheelFrame !== undefined || wheelTargetZoom !== undefined;
  }

  function onKeydown(event: KeyboardEvent): void {
    createKeyboardController({
      getCamera: options.getCamera,
      setCamera: (nextCamera) => {
        cancelCameraAnimation();
        options.applyCamera(nextCamera);
      },
      onReset: options.onReset,
      onSelect: options.onSelect,
      onEscape: options.onEscape,
      onFocusNext: options.onFocusNext,
      reduceMotion: options.getReduceMotion?.() ?? false,
    })(event);
  }

  function dispose(): void {
    cancelLongPress();
    if (typeof document !== "undefined") document.removeEventListener("click", suppressLongPressClick, true);
    cancelCameraAnimation();
    cancelInertia();
    cancelWheelZoom();
    pointers.clear();
    pinchState = undefined;
    dragLast = undefined;
  }

  const result = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    onContextMenu,
    onWheel,
    onKeydown,
    cancelInertia,
    cancelWheelZoom,
    cancelCameraAnimation,
    animateCameraToTarget,
    animateCameraToStation,
    isScrolling,
    isCameraAnimationActive,
    isWheelScrolling,
    isWheelActive: () => wheelFrame !== undefined || wheelTargetZoom !== undefined,
    hasActivePointers: () => pointers.size > 0,
    dispose,
  };
  if (getCurrentInstance()) onBeforeUnmount(dispose);
  return result;
}

function estimateWheelSettleMs(distance: number, smoothingMs: number): number {
  const epsilon = 0.001;
  const absoluteDistance = Math.abs(distance);
  if (absoluteDistance <= epsilon || smoothingMs <= 0) return 0;
  return smoothingMs * Math.log(absoluteDistance / epsilon);
}

function easeInOutCubic(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}
