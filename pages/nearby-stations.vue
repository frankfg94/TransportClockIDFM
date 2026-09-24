<template>
  <component :is="loadedNearbyPage" v-if="loadedNearbyPage" />
  <TransportMapPageLoading
    v-else
    :label="t(loadingFailed ? 'nearbyStations.pageLoadFailed' : 'nearbyStations.pageLoading')"
    :busy="!loadingFailed"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, type Component } from "vue";
import TransportMapPageLoading from "../src/features/transport-map/TransportMapPageLoading.vue";
import { useI18n } from "../src/i18n";

const { t } = useI18n();
const loadedNearbyPage = shallowRef<Component>();
const loadingFailed = shallowRef(false);

let firstPaintFrame: number | undefined;
let nearbyLoadFrame: number | undefined;
let disposed = false;

async function loadNearbyPage(): Promise<void> {
  try {
    const module = await import("../src/features/nearby-stations/MyNearbyStationsPage.vue");
    if (!disposed) loadedNearbyPage.value = module.default;
  } catch {
    if (!disposed) loadingFailed.value = true;
  }
}

onMounted(() => {
  // Paint the route shell before starting the nearby page and its providers.
  firstPaintFrame = window.requestAnimationFrame(() => {
    nearbyLoadFrame = window.requestAnimationFrame(() => {
      void loadNearbyPage();
    });
  });
});

onBeforeUnmount(() => {
  disposed = true;
  if (firstPaintFrame !== undefined) window.cancelAnimationFrame(firstPaintFrame);
  if (nearbyLoadFrame !== undefined) window.cancelAnimationFrame(nearbyLoadFrame);
});
</script>
