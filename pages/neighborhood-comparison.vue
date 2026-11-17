<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useRoute } from "#imports";
import { useI18n } from "../src/i18n";
import NeighborhoodComparison from "../src/features/nearby-stations/neighborhood-comparison/NeighborhoodComparison.vue";
import { TransportMapDataSource } from "../src/features/transport-map/data/createTransportMapDataSource";
import type { TransportMapNetwork } from "../src/features/transport-map/contracts/network";

const route = useRoute();
const { t } = useI18n();
const origin = computed(() => {
  const lat = Number(route.query.lat), lon = Number(route.query.lon);
  if (typeof route.query.lat !== "string" || typeof route.query.lon !== "string" || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  return { lat, lon, code: typeof route.query.code === "string" ? route.query.code : undefined };
});
const network = shallowRef<TransportMapNetwork>();
const transportError = ref(false);
let source: TransportMapDataSource | undefined;
let disposed = false;
onMounted(async () => {
  source = new TransportMapDataSource();
  try {
    await source.initialize();
    const loaded = await source.ensureCatalog();
    if (!disposed) network.value = loaded;
  } catch { if (!disposed) transportError.value = true; }
});
onBeforeUnmount(() => { disposed = true; source?.dispose(); });
</script>

<template>
  <main class="neighborhood-comparison-page">
    <NuxtLink to="/nearby-stations">{{ t('nearbyStations.neighborhoodScore.backToNearby') }}</NuxtLink>
    <NeighborhoodComparison :origin="origin" :initial-code="typeof route.query.iris === 'string' ? route.query.iris : undefined" :network="network" :transport-ready="Boolean(network)" :transport-error="transportError" />
  </main>
</template>

<style scoped>
.neighborhood-comparison-page { display: grid; gap: 16px; max-width: 1240px; margin: 0 auto; padding: 24px 18px 100px; }
</style>
