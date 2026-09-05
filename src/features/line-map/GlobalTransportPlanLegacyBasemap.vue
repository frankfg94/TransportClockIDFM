<template>
  <div
    ref="basemapStackElement"
    class="global-transport-plan__basemap-stack"
    :class="{
      'global-transport-plan__basemap-stack--selected-line': coverEnabled,
      'global-transport-plan__basemap-stack--selected-line-interacting': coverEnabled && interacting,
    }"
    :style="stackStyle"
    aria-hidden="true"
  >
    <SelectedLineBasemapCover
      ref="selectedLineCoverRef"
      data-selected-line-basemap-cover-role="broad"
      :enabled="coverEnabled"
      :line-id="lineId"
      :camera="broadCoverCamera"
      :anchor-camera="coverAnchorCamera"
      :line-bounds="lineBounds"
      :layer="layer"
      :basemap-style="basemapStyle"
      :contrast="contrast"
      :interaction-active="interacting"
      :style="broadCoverStyle"
    />
    <SelectedLineBasemapCover
      v-for="bridge in bridges"
      :key="bridge.id"
      class="selected-line-basemap-cover--bridge"
      data-selected-line-basemap-bridge
      :data-selected-line-basemap-bridge-id="bridge.id"
      :enabled="coverEnabled"
      :line-id="lineId"
      :camera="bridgeCamera(bridge)"
      :anchor-camera="bridge.anchorCamera"
      :line-bounds="bridge.bounds"
      :layer="layer"
      :basemap-style="basemapStyle"
      :contrast="contrast"
      :interaction-active="interacting"
      :options="bridge.options"
      :style="bridgeStyle(bridge)"
    />
    <TransportMapBasemap
      ref="basemapRef"
      class="global-transport-plan__live-basemap"
      :camera="basemapCamera"
      :layer="layer"
      :basemap-style="basemapStyle"
      :contrast="contrast"
      :interaction-active="liveInteractionActive"
      :tile-refresh-camera="tileRefreshCamera"
      :debug-ready-delay-ms="debugReadyDelayMs"
      :style="liveRasterStyle"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { GlobalMapBounds } from "../transport-map/contracts/manifest";
import SelectedLineBasemapCover from "../transport-map/basemap/SelectedLineBasemapCover.vue";
import type {
  SelectedLineBasemapCoverDebugMetrics,
} from "../transport-map/basemap/selectedLineBasemapCover";
import TransportMapBasemap from "../transport-map/basemap/TransportMapBasemap.vue";
import type {
  TransportMapBasemapLayer,
  TransportMapBasemapStyle,
} from "../transport-map/basemap/tileMath";
import type { CameraState } from "../transport-map/geo/camera";
import type { TransportMapBasemapDebugMetrics } from "./selectedLineZoomScenario";
import type { GlobalTransportBasemapBridge } from "./useGlobalTransportLegacyBasemap";

const props = defineProps<{
  coverEnabled: boolean;
  interacting: boolean;
  stackStyle: Record<string, string>;
  lineId?: string;
  broadCoverCamera: CameraState;
  coverAnchorCamera?: CameraState;
  lineBounds?: GlobalMapBounds;
  layer: TransportMapBasemapLayer;
  basemapStyle: TransportMapBasemapStyle;
  contrast: number;
  broadCoverStyle: Record<string, string>;
  bridges: GlobalTransportBasemapBridge[];
  bridgeCamera: (bridge: GlobalTransportBasemapBridge) => CameraState;
  bridgeStyle: (bridge: GlobalTransportBasemapBridge) => Record<string, string>;
  basemapCamera: CameraState;
  liveInteractionActive: boolean;
  tileRefreshCamera?: CameraState;
  debugReadyDelayMs: number;
  liveRasterStyle: Record<string, string>;
}>();

const basemapStackElement = ref<HTMLElement>();
const basemapRef = ref<{
  getDebugMetrics?: () => TransportMapBasemapDebugMetrics;
  resetDebugMetrics?: () => void;
}>();
const selectedLineCoverRef = ref<{
  getDebugMetrics?: () => SelectedLineBasemapCoverDebugMetrics;
  resetDebugMetrics?: () => void;
  isReady?: () => boolean;
}>();

function getStackElement(): HTMLElement | undefined {
  return basemapStackElement.value;
}

function getBasemapDebugMetrics(): TransportMapBasemapDebugMetrics | undefined {
  return basemapRef.value?.getDebugMetrics?.();
}

function resetBasemapDebugMetrics(): void {
  basemapRef.value?.resetDebugMetrics?.();
}

function getSelectedLineCoverDebugMetrics(): SelectedLineBasemapCoverDebugMetrics | undefined {
  return selectedLineCoverRef.value?.getDebugMetrics?.();
}

function resetSelectedLineCoverDebugMetrics(): void {
  selectedLineCoverRef.value?.resetDebugMetrics?.();
}

function isSelectedLineCoverReady(): boolean {
  return selectedLineCoverRef.value?.isReady?.() === true;
}

defineExpose({
  getStackElement,
  getBasemapDebugMetrics,
  resetBasemapDebugMetrics,
  getSelectedLineCoverDebugMetrics,
  resetSelectedLineCoverDebugMetrics,
  isSelectedLineCoverReady,
});
</script>

<style scoped>
.global-transport-plan__basemap-stack {
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  isolation: isolate;
  contain: paint;
  pointer-events: none;
  background: var(--global-selected-line-basemap-background);
  opacity: var(--global-selected-line-basemap-opacity);
  /* Keep the overflowing gesture stack as native raster pixels. Filtering the
     full transformed stack allocates a viewport-plus-overscan GPU surface and
     caused long compositor frames on fast zooms. */
  filter: none;
}
.global-transport-plan__basemap-stack--selected-line-interacting {
  overflow: visible;
  contain: none;
  backface-visibility: hidden;
}
.global-transport-plan__basemap-stack :deep(.global-transport-plan__live-basemap) {
  z-index: 1;
  background: transparent;
  opacity: 1;
}
.global-transport-plan__basemap-stack :deep(.selected-line-basemap-cover) {
  /* Covers stay above the continuously visible committed raster. Their
     finite/masked edges therefore fall back to decoded live tiles instead of
     exposing the neutral stack background. */
  z-index: 2;
}
.global-transport-plan__basemap-stack :deep(.selected-line-basemap-cover--bridge) {
  z-index: 3;
}
.global-transport-plan__basemap-stack :deep(.selected-line-basemap-cover) {
  filter: none !important;
}
.global-transport-plan__basemap-stack :deep(.transport-map-basemap__tile),
.global-transport-plan__basemap-stack :deep(.selected-line-basemap-cover__definition img) {
  filter: none !important;
}
</style>
