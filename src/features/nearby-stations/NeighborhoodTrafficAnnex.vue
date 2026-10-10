<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "../../i18n";
import { toServerApiUrl } from "../../services/serverApi";
import TrafficDisruptionCard from "../traffic/TrafficDisruptionCard.vue";
import { getCurrentTrafficDisruptions } from "../traffic/trafficTiming";
import type { TrafficResponse } from "../traffic/types";
const props = defineProps<{ lineRefs: string[]; originKey: string }>();
const { d, t } = useI18n();
const response = ref<TrafficResponse>();
const loading = ref(false), failed = ref(false);
let controller: AbortController | undefined;
const disruptions = computed(() => getCurrentTrafficDisruptions(response.value?.lines.flatMap(line => line.disruptions) ?? [])
  .filter((item, i, all) => all.findIndex(other => other.id === item.id) === i));
const incomplete = computed(() => response.value?.cache?.lastError
  || ["stale", "rate-limited", "error", "refreshing"].includes(response.value?.cache?.state ?? "")
  || response.value?.lines.some(line => line.error || line.status === "error" || line.status === "unknown"));
function reset() { controller?.abort(); controller = undefined; loading.value = false; failed.value = false; response.value = undefined; }
watch(() => props.originKey, reset);
onBeforeUnmount(reset);
async function load() {
  controller?.abort();
  const request = new AbortController(); controller = request;
  loading.value = true; failed.value = false;
  try {
    const query = new URLSearchParams({ lineRefs: props.lineRefs.join(",") });
    const result = await fetch(toServerApiUrl("/api/traffic?" + query), { signal: request.signal });
    if (!result.ok) throw new Error("Traffic unavailable");
    const payload = await result.json() as TrafficResponse;
    if (!payload.configured || !Array.isArray(payload.lines)) throw new Error("Traffic unavailable");
    if (controller === request) response.value = payload;
  } catch { if (controller === request && !request.signal.aborted) failed.value = true; }
  finally { if (controller === request) loading.value = false; }
}
</script>
<template>
  <section class="traffic-annex">
    <h2>{{ t("nearbyStations.neighborhoodScore.trafficAnnex.title") }}</h2>
    <p>{{ t("nearbyStations.neighborhoodScore.trafficAnnex.description") }}</p>
    <button type="button" :disabled="loading || !lineRefs.length" @click="load">
      {{ t(loading ? "nearbyStations.neighborhoodScore.loading" : "nearbyStations.neighborhoodScore.trafficAnnex.load") }}
    </button>
    <p v-if="failed" role="alert">{{ t("nearbyStations.neighborhoodScore.trafficAnnex.error") }}</p>
    <template v-if="response">
      <p>{{ t("nearbyStations.neighborhoodScore.updatedAt", { time: d(response.cache?.refreshedAt ?? response.generatedAt, { dateStyle: "short", timeStyle: "short" }) }) }}</p>
      <p v-if="incomplete">{{ t("nearbyStations.neighborhoodScore.trafficAnnex.stale") }}</p>
      <p v-else-if="!disruptions.length">{{ t("nearbyStations.neighborhoodScore.trafficAnnex.empty") }}</p>
      <TrafficDisruptionCard v-for="disruption in disruptions" :key="disruption.id" :disruption="disruption" compact />
    </template>
  </section>
</template>
<style scoped>
.traffic-annex { padding: 1rem; border: 1px solid var(--border-color, #d5dce6); border-radius: 1rem; }
.traffic-annex h2 { font-size: 1.1rem; margin: 0; }
.traffic-annex p { margin: .6rem 0; }
.traffic-annex button { padding: .6rem 1rem; border-radius: .5rem; border: 1px solid currentColor; }
</style>
