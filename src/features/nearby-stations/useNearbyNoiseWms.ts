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

const BRUITPARIF_WMS_URL = "https://raster.bruitparif.fr/mapproxy/service";
const BRUITPARIF_LAYER = "CSAB_2024_wCSAB_cl_idf";
const DETAIL_ZOOM_SCALE = 4; // Show the detailed layer from 400% of the reference scale.
const VIEWPORT_BUFFER_RATIO = 0.18;
const MAX_IMAGE_DIMENSION = 2_048;
const OVERLAY_OPACITY = 0.25;

// Official Symbologie.xlsx colors, grouped by the first digit of each 9-class
// code (noise class first, air-quality class second).
const SOURCE_CLASS_COLORS: readonly { rgb: readonly [number, number, number]; level: NearbyNoiseLevel }[] = [
  { rgb: [221, 235, 247], level: 1 }, // 11
  { rgb: [142, 186, 226], level: 1 }, // 12
  { rgb: [47, 117, 181], level: 1 }, // 13
  { rgb: [190, 190, 190], level: 2 }, // 21
  { rgb: [255, 211, 71], level: 2 }, // 22
  { rgb: [173, 83, 170], level: 2 }, // 23
  { rgb: [128, 128, 128], level: 3 }, // 31
  { rgb: [184, 155, 84], level: 3 }, // 32
  { rgb: [213, 9, 9], level: 3 }, // 33
];

const DISPLAY_CLASS_COLORS: Record<NearbyNoiseLevel, readonly [number, number, number]> = {
  1: [34, 197, 94],
  2: [250, 204, 21],
  3: [239, 68, 68],
};

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
      && camera.value.zoom - referenceZoom.value >= Math.log2(DETAIL_ZOOM_SCALE),
  );
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let activeController: AbortController | undefined;
  let requestRevision = 0;

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

      const rendered = await recolorWmsImage(await response.blob());
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

async function recolorWmsImage(blob: Blob): Promise<Omit<NearbyNoiseWmsImage, "bounds">> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas is unavailable for the detailed noise overlay.");

    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const levels = new Uint8Array(bitmap.width * bitmap.height);
    for (let pixelIndex = 0, colorOffset = 0; pixelIndex < levels.length; pixelIndex += 1, colorOffset += 4) {
      const red = pixels.data[colorOffset] ?? 0;
      const green = pixels.data[colorOffset + 1] ?? 0;
      const blue = pixels.data[colorOffset + 2] ?? 0;
      const alpha = pixels.data[colorOffset + 3] ?? 0;
      const match = closestNoiseClass(red, green, blue);
      if (alpha === 0 || !match || (red > 248 && green > 248 && blue > 248)) {
        pixels.data[colorOffset + 3] = 0;
        continue;
      }

      levels[pixelIndex] = match.level;
      const target = DISPLAY_CLASS_COLORS[match.level];
      pixels.data[colorOffset] = target[0];
      pixels.data[colorOffset + 1] = target[1];
      pixels.data[colorOffset + 2] = target[2];
      pixels.data[colorOffset + 3] = Math.round(alpha * OVERLAY_OPACITY);
    }
    context.putImageData(pixels, 0, 0);

    const recolored = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Unable to encode the detailed noise overlay.")), "image/png");
    });
    return {
      href: URL.createObjectURL(recolored),
      width: bitmap.width,
      height: bitmap.height,
      levels,
    };
  } finally {
    bitmap.close();
  }
}

function closestNoiseClass(red: number, green: number, blue: number): typeof SOURCE_CLASS_COLORS[number] | undefined {
  let closest: typeof SOURCE_CLASS_COLORS[number] | undefined;
  let closestDistance = 68 ** 2;
  for (const candidate of SOURCE_CLASS_COLORS) {
    const deltaRed = red - candidate.rgb[0];
    const deltaGreen = green - candidate.rgb[1];
    const deltaBlue = blue - candidate.rgb[2];
    const distance = deltaRed ** 2 + deltaGreen ** 2 + deltaBlue ** 2;
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}
