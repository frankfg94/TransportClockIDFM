<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useI18n, type TranslationKey } from "../../../i18n";
import LineIconBadge from "../../../components/LineIconBadge.vue";
import type { TransitFamily } from "../../../types/transit";
import type { TransportMapNetwork } from "../../transport-map/contracts/network";
import type { GlobalMapLine } from "../../transport-map/contracts/manifest";
import { NEARBY_PLACE_GROUPS, type NearbyPlaceGroupId } from "../nearbyPlacePresentation";
import { aggregateComparisonPlacesAsync, aggregateComparisonTransport, perSquareKilometer, type ComparisonMeasure, type ComparisonPlaceAggregation, type ComparisonPlaceCounts, type ComparisonTheme, type EconomyGroup } from "./aggregate";
import { fetchComparisonGeography, fetchComparisonGreen, fetchComparisonPlaces, fetchComparisonTransportMetadata, invalidateComparisonCaches } from "./api";
import type { ComparisonNeighborhood, NeighborhoodComparisonGeography } from "./types";
import ComparisonMap from "./ComparisonMap.vue";

const props = defineProps<{ origin?: { lat: number; lon: number; code?: string }; initialCode?: string; network?: TransportMapNetwork; transportReady: boolean; transportError?: boolean }>();
const { t, n, d } = useI18n();
const geography = shallowRef<NeighborhoodComparisonGeography>();
const geoStatus = ref<"loading" | "ready" | "outside" | "ambiguous" | "context" | "error">("loading");
const placesStatus = ref<"loading" | "ready" | "error">("loading");
const greenStatus = ref<"idle" | "loading" | "ready" | "error" | "unavailable">("idle");
const placesData = shallowRef<ComparisonPlaceAggregation>();
const placesDate = ref("");
const transportMetadata = shallowRef<{ generatedAt: string; gtfs?: string }>();
const selectedCode = ref<string>();
const theme = ref<ComparisonTheme>("commerce");
const measure = ref<ComparisonMeasure>("count");
const categoryFilter = ref("all");
const neighborhoodSearch = ref("");
const chartPage = ref(0);
const CHART_PAGE_SIZE = 40;
const revision = ref(0);
let request = 0;
let metadataRequest = 0;
let controller: AbortController | undefined;
let greenController: AbortController | undefined;
let greenRequest = 0;

const themes: ComparisonTheme[] = ["commerce", "economic", "green", "transport"];
function loadTransportMetadata(): void {
  const current = ++metadataRequest;
  void fetchComparisonTransportMetadata().then(value => { if (current === metadataRequest) transportMetadata.value = value; }).catch(() => { if (current === metadataRequest) transportMetadata.value = undefined; });
}
function refresh(): void {
  invalidateComparisonCaches();
  transportMetadata.value = undefined;
  loadTransportMetadata();
  revision.value++;
}
loadTransportMetadata();
const themeKeys: Record<ComparisonTheme, TranslationKey> = {
  commerce: "nearbyStations.comparison.commerce", economic: "nearbyStations.comparison.economic", green: "nearbyStations.comparison.green", transport: "nearbyStations.comparison.transport",
};
const measureKeys: Record<ComparisonMeasure, TranslationKey> = {
  count: "nearbyStations.comparison.count", density: "nearbyStations.comparison.density", diversity: "nearbyStations.comparison.diversity",
  area: "nearbyStations.comparison.area", share: "nearbyStations.comparison.share", lines: "nearbyStations.comparison.lines", stations: "nearbyStations.comparison.stations",
  canopy: "nearbyStations.comparison.canopy",
};
const measures = computed<ComparisonMeasure[]>(() => theme.value === "commerce" ? ["count", "density", "diversity"]
  : theme.value === "economic" ? ["count", "density"] : theme.value === "green" ? ["area", "share"] : ["lines", "stations"]);
watch(theme, () => { measure.value = measures.value[0]!; categoryFilter.value = "all"; });
watch(measure, () => { if (measure.value === "diversity") categoryFilter.value = "all"; });

watch(() => [props.origin?.lat, props.origin?.lon, props.origin?.code, revision.value] as const, async ([lat, lon, code], previous) => {
  // Refreshing the same address should retain the user's selection and filters.
  // A different address starts a fresh comparison, including any explicit IRIS.
  const sameOrigin = previous !== undefined && lat === previous[0] && lon === previous[1] && code === previous[2];
  const refreshedSelection = sameOrigin ? selectedCode.value : undefined;
  const current = ++request;
  controller?.abort(); controller = new AbortController();
  greenController?.abort(); greenRequest++; greenStatus.value = "idle";
  const signal = controller.signal;
  geography.value = undefined; placesData.value = undefined; placesDate.value = ""; selectedCode.value = undefined;
  if (!sameOrigin) { categoryFilter.value = "all"; neighborhoodSearch.value = ""; }
  geoStatus.value = "loading"; placesStatus.value = "loading";
  if (!props.origin) { geoStatus.value = "outside"; return; }
  try {
    const data = await fetchComparisonGeography(props.origin, signal);
    if (current !== request || signal.aborted) return;
    const preferredCode = refreshedSelection ?? props.initialCode;
    geography.value = data; selectedCode.value = preferredCode && data.neighborhoods.some(item => item.codeIris === preferredCode) ? preferredCode : data.selectedCode; geoStatus.value = "ready";
    try {
      const { manifest, city } = await fetchComparisonPlaces(data.commune.code);
      if (current !== request || signal.aborted) return;
      const aggregated = await aggregateComparisonPlacesAsync(data.neighborhoods, city.places, signal);
      if (current !== request || signal.aborted) return;
      placesData.value = aggregated;
      placesDate.value = manifest.generatedAt;
      placesStatus.value = "ready";
    } catch {
      if (current === request && !signal.aborted) placesStatus.value = "error";
    }
  } catch (error) {
    if (current !== request || signal.aborted) return;
    geoStatus.value = error instanceof Error && error.message === "404" ? "outside" : error instanceof Error && error.message === "409" ? "ambiguous" : error instanceof Error && error.message === "422" ? "context" : "error";
  }
}, { immediate: true });
watch([theme, geography], async ([activeTheme, data]) => {
  if (activeTheme !== "green" || !data || greenStatus.value === "ready" || greenStatus.value === "loading") return;
  if (!data.greenSource) { greenStatus.value = "unavailable"; return; }
  const current = ++greenRequest;
  greenController?.abort(); greenController = new AbortController();
  const signal = greenController.signal;
  greenStatus.value = "loading";
  try {
    const values = await fetchComparisonGreen(data.commune.code, data.generatedAt, signal);
    if (current !== greenRequest || signal.aborted || geography.value !== data) return;
    greenStatus.value = "ready";
    geography.value = { ...data, neighborhoods: data.neighborhoods.map(item => ({ ...item, green: values[item.codeIris] ?? { status: "unavailable" } })) };
  } catch {
    if (current === greenRequest && !signal.aborted) greenStatus.value = "error";
  }
});
watch(() => props.initialCode, code => {
  if (code && geography.value?.neighborhoods.some(item => item.codeIris === code)) selectedCode.value = code;
});
onBeforeUnmount(() => { request++; greenRequest++; metadataRequest++; controller?.abort(); greenController?.abort(); });

const transport = computed(() => geography.value && props.network && props.transportReady && !props.transportError
  ? aggregateComparisonTransport(geography.value.neighborhoods, props.network) : undefined);
const selected = computed(() => geography.value?.neighborhoods.find(item => item.codeIris === selectedCode.value));
const selectedPlaces = computed(() => selectedCode.value ? placesData.value?.counts[selectedCode.value] : undefined);
const selectedTransport = computed(() => selected.value ? transport.value?.get(selected.value.id) : undefined);
const selectedLines = computed(() => (selectedTransport.value?.lineIds ?? []).map(id => props.network?.linesById.get(id)).filter((line): line is GlobalMapLine => Boolean(line)).sort((a, b) => a.mode.localeCompare(b.mode) || a.code.localeCompare(b.code, undefined, { numeric: true })));
const economyLabels: Record<EconomyGroup, TranslationKey> = { commerce: "nearbyStations.comparison.economyCommerce", offices: "nearbyStations.comparison.economyOffices", craft: "nearbyStations.comparison.economyCraft", health: "nearbyStations.comparison.economyHealth", other: "nearbyStations.comparison.economyOther" };
const categoryOptions = computed(() => theme.value === "commerce"
  ? NEARBY_PLACE_GROUPS.filter(group => Object.values(placesData.value?.counts ?? {}).some(counts => (counts.commerceGroups[group.id] ?? 0) > 0)).map(group => ({ id: group.id, label: t(group.labelKey) }))
  : theme.value === "economic" ? (Object.keys(economyLabels) as EconomyGroup[]).map(id => ({ id, label: t(economyLabels[id]) })) : []);
const activeCategoryLabel = computed(() => categoryFilter.value === "all" ? undefined : categoryOptions.value.find(option => option.id === categoryFilter.value)?.label);
function filteredCount(places: ComparisonPlaceCounts): number {
  if (theme.value === "commerce") return categoryFilter.value === "all" ? places.commerce : places.commerceGroups[categoryFilter.value as NearbyPlaceGroupId] ?? 0;
  return categoryFilter.value === "all" ? places.economic : places.economyGroups[categoryFilter.value as EconomyGroup] ?? 0;
}
const selectedGroups = computed(() => {
  if (!selectedPlaces.value) return [];
  if (theme.value === "commerce") return NEARBY_PLACE_GROUPS.flatMap(group => {
    const count = selectedPlaces.value?.commerceGroups[group.id] ?? 0;
    return count ? [{ id: group.id, label: t(group.labelKey), count }] : [];
  }).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (theme.value === "economic") {
    return (Object.keys(economyLabels) as EconomyGroup[]).flatMap(id => {
      const count = selectedPlaces.value?.economyGroups[id] ?? 0;
      return count ? [{ id, label: t(economyLabels[id]), count }] : [];
    }).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }
  return [];
});
const rows = computed(() => (geography.value?.neighborhoods ?? []).map(item => {
  const places = placesData.value?.counts[item.codeIris];
  const transit = transport.value?.get(item.id);
  let value: number | undefined;
  if (theme.value === "commerce" && placesStatus.value === "ready" && places) value = measure.value === "density" ? perSquareKilometer(filteredCount(places), item.areaM2) : measure.value === "diversity" ? Object.keys(places.commerceGroups).length : filteredCount(places);
  if (theme.value === "economic" && placesStatus.value === "ready" && places) value = measure.value === "density" ? perSquareKilometer(filteredCount(places), item.areaM2) : filteredCount(places);
  if (theme.value === "green" && item.green.status === "partial" && item.green.areaM2 !== undefined) value = measure.value === "share" ? item.green.areaM2 / item.areaM2 * 100 : item.green.areaM2 / 10_000;
  if (theme.value === "transport" && transit) value = measure.value === "stations" ? transit.stationCount : transit.lineCount;
  return { item, value };
}).sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.item.name.localeCompare(b.item.name, undefined, { numeric: true })));
const maxValue = computed(() => Math.max(1, ...rows.value.map(row => row.value ?? 0)));
const pageCount = computed(() => Math.max(1, Math.ceil(rows.value.length / CHART_PAGE_SIZE)));
const visibleRows = computed(() => rows.value.slice(chartPage.value * CHART_PAGE_SIZE, (chartPage.value + 1) * CHART_PAGE_SIZE));
const selectedValue = computed(() => rows.value.find(row => row.item.codeIris === selectedCode.value)?.value);
watch([selectedCode, rows], () => {
  const index = rows.value.findIndex(row => row.item.codeIris === selectedCode.value);
  chartPage.value = index < 0 ? 0 : Math.floor(index / CHART_PAGE_SIZE);
});
function neighborhoodLabel(item: ComparisonNeighborhood): string {
  return geography.value?.commune.code === "75056" ? `${item.name} · ${item.communeName}` : item.name;
}
const neighborhoodOptions = computed(() => {
  const items = geography.value?.neighborhoods ?? [];
  const normalized = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
  const query = normalized(neighborhoodSearch.value.trim());
  if (!query) return items;
  return items.filter(item => item.codeIris === selectedCode.value || normalized(`${item.name} ${item.communeName} ${item.codeIris}`).includes(query));
});
function displayValue(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    const loading = ((theme.value === "commerce" || theme.value === "economic") && placesStatus.value === "loading") || (theme.value === "green" && (greenStatus.value === "loading" || greenStatus.value === "idle")) || (theme.value === "transport" && !props.transportReady && !props.transportError);
    return t(loading ? "nearbyStations.comparison.loadingValue" : "nearbyStations.comparison.unavailable");
  }
  const formatted = formatNumber(value, measure.value === "share" || measure.value === "area" || measure.value === "density" ? 1 : 0);
  return measure.value === "share" ? `${formatted} %` : measure.value === "area" ? `${formatted} ha` : measure.value === "density" ? t("nearbyStations.comparison.perKm2", { value: formatted }) : formatted;
}
function formatNumber(value: number, digits: number): string {
  const threshold = 10 ** -digits;
  if (value > 0 && value < threshold / 2) return `< ${n(threshold, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  return n(value, { maximumFractionDigits: digits });
}
function lineBadge(line: GlobalMapLine) {
  const family: TransitFamily | undefined = line.mode === "TRAIN" ? "TRANSILIEN" : line.mode === "BIKE" ? undefined : line.mode;
  return { id: line.id, label: line.label || line.code, family, color: line.color, textColor: line.textColor, iconUrl: line.pictogram ?? undefined, ref: line.sourceLineId ?? line.id };
}
function date(value: string): string { return d(value, { year: "numeric", month: "short", day: "numeric" }); }
</script>

<template>
  <section class="comparison" data-testid="neighborhood-comparison" :aria-label="t('nearbyStations.comparison.title')">
    <header><h2>{{ t('nearbyStations.comparison.title') }}</h2><p>{{ t('nearbyStations.comparison.intro') }}</p></header>
    <p v-if="geoStatus === 'loading'" role="status">{{ t('nearbyStations.comparison.loading') }}</p>
    <div v-else-if="geoStatus !== 'ready'" role="alert">
      <p>{{ t(geoStatus === 'outside' ? 'nearbyStations.comparison.outside' : geoStatus === 'ambiguous' ? 'nearbyStations.comparison.ambiguous' : geoStatus === 'context' ? 'nearbyStations.comparison.contextMismatch' : 'nearbyStations.comparison.error') }}</p>
      <button type="button" @click="refresh">{{ t('nearbyStations.comparison.retry') }}</button>
    </div>
    <template v-else-if="geography">
      <p class="comparison__scope">{{ t('nearbyStations.comparison.scope', { city: geography.commune.name, code: geography.commune.code, count: geography.neighborhoods.length }) }}</p>
      <p v-if="!selectedCode" role="status">{{ t('nearbyStations.comparison.chooseBoundary') }}</p>
      <label v-if="geography.neighborhoods.length > CHART_PAGE_SIZE" class="comparison__select">{{ t('nearbyStations.comparison.search') }}
        <input v-model="neighborhoodSearch" type="search" data-testid="comparison-search" :placeholder="t('nearbyStations.comparison.searchPlaceholder')" />
      </label>
      <label class="comparison__select">{{ t('nearbyStations.comparison.select') }}
        <select v-model="selectedCode" data-testid="comparison-select">
          <option :value="undefined">{{ t('nearbyStations.comparison.selectPlaceholder') }}</option>
          <option v-for="item in neighborhoodOptions" :key="item.codeIris" :value="item.codeIris">{{ neighborhoodLabel(item) }} · {{ item.codeIris }}</option>
        </select>
      </label>
      <nav class="comparison__themes" :aria-label="t('nearbyStations.comparison.themes')">
        <button v-for="item in themes" :key="item" type="button" :aria-pressed="theme === item" :data-testid="`comparison-theme-${item}`" @click="theme = item">{{ t(themeKeys[item]) }}</button>
      </nav>
      <div class="comparison__layout">
        <div class="comparison__chart">
          <label class="comparison__select">{{ t('nearbyStations.comparison.measure') }}
            <select v-model="measure"><option v-for="item in measures" :key="item" :value="item">{{ t(measureKeys[item]) }}</option></select>
          </label>
          <label v-if="theme === 'commerce' || theme === 'economic'" class="comparison__select">{{ t('nearbyStations.comparison.categoryFilter') }}
            <select v-model="categoryFilter" data-testid="comparison-category" :disabled="measure === 'diversity' || placesStatus !== 'ready'">
              <option value="all">{{ t('nearbyStations.comparison.allCategories') }}</option>
              <option v-for="option in categoryOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
            </select>
          </label>
          <p v-if="(theme === 'commerce' || theme === 'economic') && placesStatus === 'loading'" role="status">{{ t('nearbyStations.comparison.placesLoading') }}</p>
          <p v-if="(theme === 'commerce' || theme === 'economic') && placesStatus === 'error'" role="status">{{ t('nearbyStations.comparison.placesError') }}</p>
          <p v-if="(theme === 'commerce' || theme === 'economic') && placesStatus === 'ready'">{{ t('nearbyStations.comparison.placesPartial') }}</p>
          <p v-if="theme === 'transport' && !transport" role="status">{{ t(transportError ? 'nearbyStations.comparison.transportError' : 'nearbyStations.comparison.transportLoading') }}</p>
          <p v-if="theme === 'green' && !geography.greenSource">{{ t('nearbyStations.comparison.greenUnavailable') }}</p>
          <p v-if="theme === 'green' && greenStatus === 'loading'" role="status">{{ t('nearbyStations.comparison.greenLoading') }}</p>
          <p v-if="theme === 'green' && greenStatus === 'error'" role="status">{{ t('nearbyStations.comparison.greenLoadError') }}</p>
          <p v-if="theme === 'green' && geography.greenSource">{{ t('nearbyStations.comparison.greenPartial') }}</p>
          <p class="comparison__chart-label">{{ t(activeCategoryLabel ? 'nearbyStations.comparison.rankingFiltered' : 'nearbyStations.comparison.ranking', { measure: t(measureKeys[measure]), category: activeCategoryLabel }) }}</p>
          <div class="comparison__bars" data-testid="comparison-bars">
            <button v-for="row in visibleRows" :key="row.item.codeIris" type="button" class="comparison__bar" :class="{ 'comparison__bar--selected': selectedCode === row.item.codeIris }" :aria-pressed="selectedCode === row.item.codeIris" :data-code="row.item.codeIris" @click="selectedCode = row.item.codeIris">
              <span class="comparison__bar-label">{{ neighborhoodLabel(row.item) }} <small>{{ row.item.codeIris }}</small></span>
              <span class="comparison__bar-track"><span v-if="row.value !== undefined" class="comparison__bar-fill" :style="{ width: `${100 * row.value / maxValue}%` }" /></span>
              <strong>{{ displayValue(row.value) }}</strong>
            </button>
          </div>
          <div v-if="pageCount > 1" class="comparison__pagination" :aria-label="t('nearbyStations.comparison.pages')">
            <button type="button" :disabled="chartPage === 0" @click="chartPage--">{{ t('nearbyStations.comparison.previous') }}</button>
            <span aria-live="polite">{{ t('nearbyStations.comparison.page', { page: chartPage + 1, total: pageCount }) }}</span>
            <button type="button" :disabled="chartPage + 1 >= pageCount" @click="chartPage++">{{ t('nearbyStations.comparison.next') }}</button>
          </div>
        </div>
        <ComparisonMap :key="geography.commune.code" :neighborhoods="geography.neighborhoods" :selected-code="selectedCode" @select="selectedCode = $event" />
      </div>
      <section v-if="selected" class="comparison__detail" aria-live="polite">
        <h3>{{ neighborhoodLabel(selected) }} · {{ selected.codeIris }}</h3>
        <p>{{ t(activeCategoryLabel ? 'nearbyStations.comparison.selectedFilteredValue' : 'nearbyStations.comparison.selectedValue', { measure: t(measureKeys[measure]), category: activeCategoryLabel, value: displayValue(selectedValue) }) }}</p>
        <p>{{ t('nearbyStations.comparison.irisArea', { area: formatNumber(selected.areaM2 / 1_000_000, 2) }) }}</p>
        <p>{{ t('nearbyStations.comparison.noVerdict') }}</p>
        <template v-if="(theme === 'commerce' || theme === 'economic') && selectedPlaces && placesStatus === 'ready'">
          <p>{{ t(activeCategoryLabel ? 'nearbyStations.comparison.observedAllTypes' : 'nearbyStations.comparison.observedTotal', { count: theme === 'commerce' ? selectedPlaces.commerce : selectedPlaces.economic, density: n(perSquareKilometer(theme === 'commerce' ? selectedPlaces.commerce : selectedPlaces.economic, selected.areaM2) ?? 0, { maximumFractionDigits: 1 }) }) }}</p>
          <p v-if="theme === 'commerce'">{{ t('nearbyStations.comparison.diversityDetail', { count: Object.keys(selectedPlaces.commerceGroups).length }) }}</p>
          <p v-if="selectedGroups.length">{{ t('nearbyStations.comparison.categories') }}</p>
          <ul v-if="selectedGroups.length" class="comparison__groups"><li v-for="group in selectedGroups" :key="group.id">{{ group.label }} · {{ n(group.count) }}</li></ul>
        </template>
        <template v-if="theme === 'green' && selected.green.status === 'partial'">
          <p>{{ t('nearbyStations.comparison.greenDetail', { sites: selected.green.sites ?? 0, area: formatNumber((selected.green.areaM2 ?? 0) / 10_000, 2), share: formatNumber((selected.green.areaM2 ?? 0) / selected.areaM2 * 100, 1) }) }}</p>
          <p v-if="selected.green.error">{{ t('nearbyStations.comparison.greenError') }}</p>
        </template>
        <template v-if="theme === 'transport' && selectedTransport">
          <p>{{ t('nearbyStations.comparison.transportDetail', { stations: selectedTransport.stationCount, lines: selectedTransport.lineCount }) }}</p>
          <div class="comparison__line-badges"><LineIconBadge v-for="line in selectedLines" :key="line.id" :line="lineBadge(line)" compact /></div>
        </template>
      </section>
      <div class="comparison__sources">
        <p>{{ t('nearbyStations.comparison.boundarySource', { source: geography.irisSource.title, producer: geography.irisSource.producer, period: geography.irisSource.referencePeriod ?? t('nearbyStations.comparison.unavailable'), date: date(geography.generatedAt) }) }} <a :href="geography.irisSource.pageUrl" target="_blank" rel="noopener noreferrer">{{ t(geography.irisSource.pageUrl === geography.irisSource.licence.url ? 'nearbyStations.comparison.licenceLink' : 'nearbyStations.comparison.sourceLink') }}</a></p>
        <p v-if="theme === 'commerce' || theme === 'economic'">{{ t('nearbyStations.comparison.osmMethod') }}</p>
        <p v-if="(theme === 'commerce' || theme === 'economic') && placesData">{{ t('nearbyStations.comparison.osmSample', { date: date(placesDate), assigned: n(placesData.assigned), total: n(placesData.sample), outside: n(placesData.outside), ambiguous: n(placesData.ambiguous) }) }}</p>
        <p v-if="theme === 'economic'">{{ t('nearbyStations.comparison.economyMethod') }}</p>
        <p v-if="theme === 'green' && geography.greenSource">{{ t('nearbyStations.comparison.greenMethod', { source: geography.greenSource.title, period: geography.greenSource.referencePeriod ?? date(geography.generatedAt) }) }} <a :href="geography.greenSource.pageUrl" target="_blank" rel="noopener noreferrer">{{ t('nearbyStations.comparison.sourceLink') }}</a></p>
        <p v-if="theme === 'green' && geography.greenSource?.freshness">{{ t(`nearbyStations.comparison.freshness.${geography.greenSource.freshness.status}`, { date: date(geography.greenSource.freshness.checkedAt) }) }}</p>
        <p v-if="theme === 'transport'">{{ t('nearbyStations.comparison.transportMethod') }}</p>
        <p v-if="theme === 'transport' && transportMetadata">{{ t('nearbyStations.comparison.transportDate', { date: date(transportMetadata.generatedAt), version: transportMetadata.gtfs ?? t('nearbyStations.comparison.unavailable') }) }}</p>
        <p>{{ t('nearbyStations.comparison.excluded') }}</p>
        <button type="button" @click="refresh">{{ t('nearbyStations.comparison.refresh') }}</button>
        <p>{{ t('nearbyStations.comparison.refreshNote') }}</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.comparison { display: grid; gap: 14px; padding: clamp(16px, 3vw, 26px); border: 1px solid var(--border); border-radius: 18px; background: var(--surface); color: var(--ink); }
.comparison h2, .comparison h3, .comparison p { margin: 0; }
.comparison header { display: grid; gap: 5px; }
.comparison__scope, .comparison__sources { color: var(--muted); font-size: .88rem; }
.comparison__select { display: grid; gap: 5px; font-weight: 700; }
.comparison select, .comparison input, .comparison button { font: inherit; }
.comparison select, .comparison input { padding: 9px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--ink); max-width: 100%; }
.comparison__themes { display: flex; flex-wrap: wrap; gap: 7px; }
.comparison__themes button, .comparison__sources button, .comparison button:not(.comparison__bar) { padding: 8px 12px; border: 1px solid #a8bac3; border-radius: 9px; background: #fff; color: #1a3a4a; cursor: pointer; }
.comparison__themes button[aria-pressed=true] { color: #fff; background: #4234a9; border-color: #4234a9; }
.comparison button:focus-visible, .comparison select:focus-visible, .comparison input:focus-visible { outline: 3px solid #eea417; outline-offset: 2px; }
.comparison__layout { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 14px; align-items: stretch; }
.comparison__chart { min-width: 0; display: grid; gap: 10px; align-content: start; }
.comparison__chart-label { font-weight: 700; }
.comparison__bars { display: grid; gap: 4px; max-height: 440px; overflow: auto; }
.comparison__pagination { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: .85rem; }
.comparison__bar { width: 100%; display: grid; grid-template-columns: minmax(90px, 1.2fr) minmax(40px,1fr) auto; align-items: center; gap: 8px; text-align: left; padding: 7px; border: 1px solid transparent; border-radius: 8px; background: var(--surface-soft); color: inherit; cursor: pointer; }
.comparison__bar--selected { border-color: #4234a9; background: #eceafd; }
.comparison__bar-label { overflow-wrap: anywhere; }.comparison__bar-label small { display: block; color: #526b78; }
.comparison__bar-track { height: 11px; background: #dce6e8; border-radius: 8px; overflow: hidden; }.comparison__bar-fill { display: block; height: 100%; background: #2d8396; }.comparison__bar--selected .comparison__bar-fill { background: #5146d9; }
.comparison__detail, .comparison__sources { display: grid; gap: 7px; padding-top: 12px; border-top: 1px solid #dce5e9; }.comparison__groups { margin: 0; padding-left: 20px; columns: 2; }.comparison__line-badges { display: flex; flex-wrap: wrap; gap: 6px; }.comparison__sources button { justify-self: start; }
@media (max-width: 700px) { .comparison__layout { grid-template-columns: 1fr; }.comparison__groups { columns: 1; } }
</style>
