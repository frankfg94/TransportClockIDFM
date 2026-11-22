<script setup lang="ts">
import { summarizeComparisonGreen } from "./neighborhoodComparisonRules";
import { computed, defineAsyncComponent, ref, shallowRef, watch } from "vue";
import { useI18n, type TranslationKey } from "../../../i18n";
import type { TransportMapNetwork } from "../../transport-map/contracts/network";
import { aggregateComparisonPlacesAsync, aggregateComparisonScopeTransport, comparisonScope, perSquareKilometer } from "./aggregate";
import type { ComparisonPlaceAggregation } from "./aggregate";
import { fetchComparisonGeography, fetchComparisonGreen, fetchComparisonPlaces } from "./api";
import type { ComparisonGreen, NeighborhoodComparisonGeography } from "./types";

const props = defineProps<{
  origin?: { lat: number; lon: number; code?: string };
  scope: "neighborhood" | "rest";
  network?: TransportMapNetwork;
  transportReady: boolean;
}>();
const { t, n } = useI18n();
const NeighborhoodComparison = defineAsyncComponent(() => import("./NeighborhoodComparison.vue"));
const showDetails = ref(false);
const geography = shallowRef<NeighborhoodComparisonGeography>();
const places = shallowRef<ComparisonPlaceAggregation>();
const green = shallowRef<Record<string, ComparisonGreen>>();
const loading = shallowRef(false);

watch(() => [props.origin?.lat, props.origin?.lon, props.origin?.code] as const, async (_, __, onCleanup) => {
  const origin = props.origin;
  geography.value = places.value = green.value = undefined;
  loading.value = Boolean(origin);
  if (!origin) return;
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  const signal = controller.signal;
  try {
    const data = await fetchComparisonGeography(origin, signal);
    signal.throwIfAborted();
    geography.value = data;
    if (!data.selectedCode) return;
    await Promise.allSettled([
      fetchComparisonPlaces(data.commune.code)
        .then(({ city }) => aggregateComparisonPlacesAsync(data.neighborhoods, city.places, signal))
        .then(value => { if (!signal.aborted) places.value = value; }),
      fetchComparisonGreen(data.commune.code, data.generatedAt, signal)
        .then(value => { if (!signal.aborted) green.value = value; }),
    ]);
  } catch {
    // Keep the local Verdict usable when the comparison is unavailable.
  } finally {
    if (!signal.aborted) loading.value = false;
  }
}, { immediate: true });

const neighborhoods = computed(() => comparisonScope(geography.value?.neighborhoods ?? [], geography.value?.selectedCode, props.scope));
const area = computed(() => neighborhoods.value.reduce((sum, item) => sum + item.areaM2, 0));
const transport = computed(() => props.transportReady && props.network && neighborhoods.value.length
  ? aggregateComparisonScopeTransport(neighborhoods.value, props.network) : undefined);
const counts = computed(() => {
  const inventory = places.value;
  if (!inventory || !neighborhoods.value.length) return undefined;
  return neighborhoods.value.reduce((total, item) => {
    const row = inventory.counts[item.codeIris];
    return { commerce: total.commerce + (row?.commerce ?? 0), economic: total.economic + (row?.economic ?? 0) };
  }, { commerce: 0, economic: 0 });
});
const greenTotals = computed(() => summarizeComparisonGreen(neighborhoods.value.map(item => green.value?.[item.codeIris])));
const format = (value: number) => n(value, { maximumFractionDigits: 1 });
function density(count: number) {
  const value = perSquareKilometer(count, area.value);
  return value === undefined ? "" : t("nearbyStations.comparison.perKm2", { value: format(value) });
}
const sections = computed<{ title: TranslationKey; details: string[] }[]>(() => [
  { title: "nearbyStations.comparison.commerce", details: counts.value ? [t("nearbyStations.comparison.scopeInventory", { count: n(counts.value.commerce), density: density(counts.value.commerce) })] : [] },
  { title: "nearbyStations.comparison.economic", details: counts.value ? [t("nearbyStations.comparison.scopeInventory", { count: n(counts.value.economic), density: density(counts.value.economic) })] : [] },
  { title: "nearbyStations.comparison.green", details: [
    ...(greenTotals.value?.canopy !== undefined ? [t("nearbyStations.comparison.scopeCanopy", { percent: format(greenTotals.value.canopy) })] : []),
    ...(greenTotals.value?.parks !== undefined && area.value > 0 ? [t("nearbyStations.comparison.scopeParks", { hectares: format(greenTotals.value.parks / 10000), percent: format(100 * greenTotals.value.parks / area.value) })] : []),
  ] },
  { title: "nearbyStations.comparison.transport", details: transport.value ? [
    t("nearbyStations.comparison.transportDetail", { stations: n(transport.value.stationCount), lines: n(transport.value.lineCount) }),
    density(transport.value.stationCount),
  ] : [] },
]);
</script>

<template>
  <section class="verdict-scope" :aria-label="t('nearbyStations.comparison.title')" data-testid="verdict-scope-comparison">
    <p v-if="loading && !neighborhoods.length" role="status">{{ t('nearbyStations.comparison.loading') }}</p>
    <p v-else-if="!neighborhoods.length" role="status">{{ t(geography && !geography.selectedCode ? 'nearbyStations.comparison.scopeBoundary' : scope === 'rest' && geography?.selectedCode ? 'nearbyStations.comparison.scopeNoRest' : 'nearbyStations.comparison.unavailable') }}</p>
    <template v-else>
      <p class="verdict-scope__area">{{ scope === 'neighborhood' ? neighborhoods[0]?.name : geography?.commune.name }} · {{ format(area / 1_000_000) }} km²</p>
      <div class="verdict-scope__cards">
        <article v-for="section in sections" :key="section.title">
          <h3>{{ t(section.title) }}</h3>
          <p v-for="detail in section.details" :key="detail">{{ detail }}</p>
          <p v-if="!section.details.length">{{ t(loading ? 'nearbyStations.comparison.loadingValue' : 'nearbyStations.comparison.unavailable') }}</p>
        </article>
      </div>
      <details v-if="scope === 'rest'" class="verdict-scope__details" @toggle="showDetails = ($event.currentTarget as HTMLDetailsElement).open">
        <summary>{{ t('nearbyStations.comparison.irisDetails') }}</summary>
        <NeighborhoodComparison v-if="showDetails" :origin="origin" :network="network" :transport-ready="transportReady" />
      </details>
    </template>
  </section>
</template>

<style scoped>
.verdict-scope { margin-block: 1rem; }
.verdict-scope__area { color: var(--muted); }
.verdict-scope__details { margin-top: .9rem; }
.verdict-scope__details summary { cursor: pointer; font-weight: 650; padding-block: .5rem; }
.verdict-scope__cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap: .75rem; }
article { padding: .875rem; background: var(--surface-soft); border-radius: .75rem; }
h3, p { margin: 0 0 .3rem; }
</style>
