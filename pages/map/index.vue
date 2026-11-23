<template>
  <component
    :is="loadedMapPage"
    v-if="loadedMapPage"
    v-bind="activeFocus ? { reference: activeFocus.reference, communeName: activeFocus.communeName, origin: activeFocus.origin } : {
      experience: 'next', basemapContrast: settings.globalMapBasemapContrast, basemapStyle: settings.globalMapBasemapStyle,
    }"
  />
  <TransportMapPageLoading
    v-else
    :label="t(loadingFailed ? 'globalMap.page.status.unavailable' : 'globalMap.page.status.loadingPage')"
    :busy="!loadingFailed"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch, type Component } from "vue";
import { useRoute } from "vue-router";
import TransportMapPageLoading from "../../src/features/transport-map/TransportMapPageLoading.vue";
import { useAppSettings } from "../../src/features/app-settings";
import { useI18n } from "../../src/i18n";
import { parseNatureCommuneFocusQuery } from "../../src/features/nearby-stations/neighborhood-comparison/greenFocus";

const { settings } = useAppSettings();
const { t } = useI18n();
const route = useRoute();
const loadedMapPage = shallowRef<Component>();
const loadingFailed = shallowRef(false);
const mounted = shallowRef(false);
let loadGeneration = 0;

const activeFocus = computed(() => parseNatureCommuneFocusQuery(route.query));
const focusedMode = computed(() => Boolean(activeFocus.value));

let firstPaintFrame: number | undefined;
let mapLoadFrame: number | undefined;
let disposed = false;

async function loadMapPage(): Promise<void> {
  const generation = ++loadGeneration;
  const focused = focusedMode.value;
  loadedMapPage.value = undefined;
  loadingFailed.value = false;
  try {
    const module = focused
      ? await import("../../src/features/nearby-stations/NatureCommuneFocusPage.vue")
      : await import("../../src/features/line-map/GlobalTransportPlan.vue");
    if (!disposed && generation === loadGeneration) loadedMapPage.value = module.default;
  } catch {
    if (!disposed && generation === loadGeneration) loadingFailed.value = true;
  }
}

watch(focusedMode, () => { if (mounted.value) void loadMapPage(); });

onMounted(() => {
  mounted.value = true;
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
  loadGeneration++;
  if (firstPaintFrame !== undefined) window.cancelAnimationFrame(firstPaintFrame);
  if (mapLoadFrame !== undefined) window.cancelAnimationFrame(mapLoadFrame);
});
</script>
