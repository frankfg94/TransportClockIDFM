import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from "vue";
import type { CameraState } from "../transport-map/geo/camera";
import {
  expandBounds,
  screenToWorld,
  visibleWorldBounds,
  WEB_MERCATOR_EARTH_RADIUS_METERS,
  type ScreenPoint,
} from "../transport-map/geo/coordinateKernel";
import type { GlobalMapBounds } from "../transport-map/contracts/manifest";
import type { NearbyNoiseLevel } from "./nearbyNoiseZones";
import { isNearbyNoiseDetailZoomActive } from "./nearbyMapZoom";
import { NearbyNoiseWmsColorizer } from "./nearbyNoiseWmsColorizerClient";

const BRUITPARIF_WMS_URL = "https://raster.bruitparif.fr/mapproxy/service";
const BRUITPARIF_LAYER = "CSAB_2024_wCSAB_cl_idf";
const VIEWPORT_BUFFER_RATIO = 0.18;
const MAX_IMAGE_DIMENSION = 2_048;

export interface NearbyNoiseWmsImage {
  href: string;
  bounds: GlobalMapBounds;
  width: number;
  height: number;
  levels: Uint8Array;
}

export type NearbyNoiseWmsStatus = "idle" | "loading" | "ready" | "error";

export function useNearbyNoiseWms(
  camera: Ref<CameraState>,
  enabled: Ref<boolean>,
  referenceZoom: Ref<number>,
  highPrecisionEnabled: Readonly<Ref<boolean>>,
) {
  const image = shallowRef<NearbyNoiseWmsImage>();
  const status = ref<NearbyNoiseWmsStatus>("idle");
  const retryRevision = ref(0);
  const isHighPrecisionActive = computed(() =>
    enabled.value
      && highPrecisionEnabled.value
      && isNearbyNoiseDetailZoomActive(camera.value.zoom, referenceZoom.value),
  );
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let activeController: AbortController | undefined;
  let requestRevision = 0;
  const colorizer = new NearbyNoiseWmsColorizer();

  function clearImage(): void {
    if (image.value?.href.startsWith("blob:")) URL.revokeObjectURL(image.value.href);
    image.value = undefined;
  }

  function retry(): void {
    retryRevision.value += 1;
  }

  async function load(bounds: GlobalMapBounds, snapshot: CameraState, revision: number, signal: AbortSignal): Promise<void> {
    try {
      const response = await fetch(buildWmsUrl(bounds, snapshot), {
        cache: "force-cache",
        mode: "cors",
        signal,
      });
      if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/png")) {
        throw new Error(`Bruitparif WMS returned HTTP ${response.status}.`);
      }

      const rendered = await colorizer.recolor(await response.blob(), signal);
      if (signal.aborted || revision !== requestRevision) {
        URL.revokeObjectURL(rendered.href);
        return;
      }

      clearImage();
      image.value = {
        ...rendered,
        bounds,
      };
      status.value = "ready";
    } catch {
      if (!signal.aborted && revision === requestRevision) status.value = "error";
    }
  }

  watch(
    [
      isHighPrecisionActive,
      () => camera.value.centerWorldX,
      () => camera.value.centerWorldY,
      () => camera.value.zoom,
      () => camera.value.viewportWidthCssPx,
      () => camera.value.viewportHeightCssPx,
      () => camera.value.pixelRatio,
      retryRevision,
    ],
    (_values, _previous, onCleanup) => {
      const revision = ++requestRevision;
      if (debounceTimer) clearTimeout(debounceTimer);
      activeController?.abort();
      activeController = undefined;

      if (!isHighPrecisionActive.value || !import.meta.client) {
        status.value = "idle";
        clearImage();
        return;
      }

      status.value = "loading";
      const controller = new AbortController();
      activeController = controller;
      const snapshot = { ...camera.value };
      const bounds = expandBounds(visibleWorldBounds(snapshot), VIEWPORT_BUFFER_RATIO);
      debounceTimer = setTimeout(() => {
        void load(bounds, snapshot, revision, controller.signal);
      }, 240);

      onCleanup(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        controller.abort();
      });
    },
    { immediate: true, flush: "post" },
  );

  function levelAtScreenPoint(point: ScreenPoint): NearbyNoiseLevel | undefined {
    const current = image.value;
    if (!isHighPrecisionActive.value || !current) return undefined;
    const world = screenToWorld(point, camera.value);
    const xRatio = (world.x - current.bounds.minX) / (current.bounds.maxX - current.bounds.minX);
    const yRatio = (world.y - current.bounds.minY) / (current.bounds.maxY - current.bounds.minY);
    if (xRatio < 0 || xRatio >= 1 || yRatio < 0 || yRatio >= 1) return undefined;
    const x = Math.floor(xRatio * current.width);
    const y = Math.floor(yRatio * current.height);
    const level = current.levels[y * current.width + x];
    return level === 1 || level === 2 || level === 3 ? level : undefined;
  }

  onBeforeUnmount(() => {
    requestRevision += 1;
    if (debounceTimer) clearTimeout(debounceTimer);
    activeController?.abort();
    colorizer.dispose();
    clearImage();
  });

  return { image, isHighPrecisionActive, levelAtScreenPoint, retry, status };
}

function buildWmsUrl(bounds: GlobalMapBounds, camera: CameraState): string {
  const cssWidth = Math.max(1, camera.viewportWidthCssPx * (1 + VIEWPORT_BUFFER_RATIO * 2));
  const cssHeight = Math.max(1, camera.viewportHeightCssPx * (1 + VIEWPORT_BUFFER_RATIO * 2));
  const maxPixelRatio = Math.min(MAX_IMAGE_DIMENSION / cssWidth, MAX_IMAGE_DIMENSION / cssHeight);
  const pixelRatio = Math.max(0.25, Math.min(2, camera.pixelRatio || 1, maxPixelRatio));
  const width = Math.max(1, Math.round(cssWidth * pixelRatio));
  const height = Math.max(1, Math.round(cssHeight * pixelRatio));
  const metersPerWorldUnit = 2 * Math.PI * WEB_MERCATOR_EARTH_RADIUS_METERS;
  const minX = (bounds.minX - 0.5) * metersPerWorldUnit;
  const maxX = (bounds.maxX - 0.5) * metersPerWorldUnit;
  const minY = (0.5 - bounds.maxY) * metersPerWorldUnit;
  const maxY = (0.5 - bounds.minY) * metersPerWorldUnit;
  const query = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: BRUITPARIF_LAYER,
    STYLES: "default",
    CRS: "EPSG:3857",
    BBOX: [minX, minY, maxX, maxY].map((value) => value.toFixed(2)).join(","),
    WIDTH: String(width),
    HEIGHT: String(height),
    FORMAT: "image/png",
    TRANSPARENT: "TRUE",
  });
  return `${BRUITPARIF_WMS_URL}?${query.toString()}`;
}
