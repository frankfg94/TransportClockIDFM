<template>
  <component
    :is="loadedMapPage"
    v-if="loadedMapPage"
    experience="next"
    :basemap-contrast="settings.globalMapBasemapContrast"
    :basemap-style="settings.globalMapBasemapStyle"
  />
  <TransportMapPageLoading
    v-else
    :label="t(loadingFailed ? 'globalMap.page.status.unavailable' : 'globalMap.page.status.loadingPage')"
    :busy="!loadingFailed"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, type Component } from "vue";
import TransportMapPageLoading from "../../src/features/transport-map/TransportMapPageLoading.vue";
import { useAppSettings } from "../../src/features/app-settings";
import { useI18n } from "../../src/i18n";

const { settings } = useAppSettings();
const { t } = useI18n();
const loadedMapPage = shallowRef<Component>();
const loadingFailed = shallowRef(false);

let firstPaintFrame: number | undefined;
let mapLoadFrame: number | undefined;
let disposed = false;

async function loadMapPage(): Promise<void> {
  try {
    const module = await import("../../src/features/line-map/GlobalTransportPlan.vue");
    if (!disposed) loadedMapPage.value = module.default;
  } catch {
    if (!disposed) loadingFailed.value = true;
  }
}

onMounted(() => {
  // Let the lightweight route shell reach a browser paint before importing
  // GlobalTransportPlan and creating its map/rendering surfaces.
  firstPaintFrame = window.requestAnimationFrame(() => {
    mapLoadFrame = window.requestAnimationFrame(() => {
      void loadMapPage();
    });
  });
});

onBeforeUnmount(() => {
  disposed = true;
  if (firstPaintFrame !== undefined) window.cancelAnimationFrame(firstPaintFrame);
  if (mapLoadFrame !== undefined) window.cancelAnimationFrame(mapLoadFrame);
});
</script>
