<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useI18n, type TranslationKey } from "../../../i18n";
import { NATURE_IN_CITY_URL, type GreenMapReference } from "../../../../shared/natureInCity";
import type { TransportMapNetwork } from "../../transport-map/contracts/network";
import { NEARBY_PLACE_GROUPS, type NearbyPlaceGroupId } from "../nearbyPlacePresentation";
import {
  aggregateComparisonScopeTransport,
  aggregateComparisonTransport,
  perSquareKilometer,
  type ComparisonMeasure,
  type ComparisonPlaceAggregation,
  type ComparisonPlaceCounts,
  type ComparisonTheme,
  type EconomyGroup,
} from "./aggregate";
import { summarizeComparisonGreen } from "./neighborhoodComparisonRules";
import { buildNatureCommuneFocusUrl } from "./greenFocus";
import type { ComparisonGreen, ComparisonNeighborhood, NeighborhoodComparisonGeography } from "./types";
import ComparisonMap from "./ComparisonMap.vue";

const props = defineProps<{
  origin?: { lat: number; lon: number; code?: string };
  geography: NeighborhoodComparisonGeography;
  places?: ComparisonPlaceAggregation;
  placesDate?: string;
  placesStatus: "loading" | "ready" | "error";
  green?: Readonly<Record<string, ComparisonGreen>>;
  greenStatus: "loading" | "ready" | "error" | "unavailable";
  greenMap?: Extract<GreenMapReference, { scope: "commune" }>;
  canopyCoverage?: { period: string; coveredIris: number; totalIris: number };
  network?: TransportMapNetwork;
  transportReady: boolean;
  transportError?: boolean;
  transportDate?: { generatedAt: string; gtfs?: string };
}>();

const { t, n, d } = useI18n();
const themes: ComparisonTheme[] = ["commerce", "economic", "green", "transport"];
const themeKeys: Record<ComparisonTheme, TranslationKey> = {
  commerce: "nearbyStations.comparison.commerce",
  economic: "nearbyStations.comparison.economic",
  green: "nearbyStations.comparison.green",
  transport: "nearbyStations.comparison.transport",
};
const measureKeys: Record<ComparisonMeasure, TranslationKey> = {
  count: "nearbyStations.comparison.count",
  density: "nearbyStations.comparison.density",
  diversity: "nearbyStations.comparison.diversity",
  area: "nearbyStations.comparison.area",
  share: "nearbyStations.comparison.share",
  canopy: "nearbyStations.comparison.canopy",
  lines: "nearbyStations.comparison.lines",
  stations: "nearbyStations.comparison.stations",
};
const economyLabels: Record<EconomyGroup, TranslationKey> = {
  commerce: "nearbyStations.comparison.economyCommerce",
  offices: "nearbyStations.comparison.economyOffices",
  craft: "nearbyStations.comparison.economyCraft",
  health: "nearbyStations.comparison.economyHealth",
  other: "nearbyStations.comparison.economyOther",
};
const measures = reactive<Record<ComparisonTheme, ComparisonMeasure>>({
  commerce: "count", economic: "count", green: "canopy", transport: "lines",
});
const categoryFilters = reactive<Record<"commerce" | "economic", string>>({ commerce: "all", economic: "all" });
const selectedCodes = reactive<Record<ComparisonTheme, string | undefined>>({ commerce: undefined, economic: undefined, green: undefined, transport: undefined });
const pages = reactive<Record<ComparisonTheme, number>>({ commerce: 0, economic: 0, green: 0, transport: 0 });
const greenMeasureTouched = { value: false };
const PAGE_SIZE = 20;

watch(() => [props.geography.commune.code, props.geography.selectedCode] as const, ([, selected]) => {
  for (const theme of themes) { selectedCodes[theme] = selected; pages[theme] = 0; }
  greenMeasureTouched.value = false;
}, { immediate: true });

const neighborhoods = computed(() => props.geography.neighborhoods.map(item => ({
  ...item,
  green: props.green?.[item.codeIris] ?? item.green,
})));
const transport = computed(() => props.network && props.transportReady && !props.transportError
  ? aggregateComparisonTransport(neighborhoods.value, props.network) : undefined);
const scopeItems = computed(() => neighborhoods.value.filter(item => item.codeIris !== props.geography.selectedCode));
const scopeArea = computed(() => scopeItems.value.reduce((sum, item) => sum + item.areaM2, 0));
const scopeGreen = computed(() => summarizeComparisonGreen(scopeItems.value.map(item => item.green)));
const scopeTransport = computed(() => props.network && props.transportReady && !props.transportError
  ? aggregateComparisonScopeTransport(scopeItems.value, props.network) : undefined);
const hasCanopy = computed(() => neighborhoods.value.some(item => {
  const canopy = item.green.canopy;
  return Boolean(canopy && canopy.areaM2 > 0 && Number.isFinite(canopy.canopyM2));
}));
const hasInventoryArea = computed(() => neighborhoods.value.some(item =>
  item.green.publicParkAreaM2 !== undefined || (item.green.areaM2 !== undefined && !item.green.error)));
const greenMeasures = computed<ComparisonMeasure[]>(() => [
  ...(hasCanopy.value ? ["canopy" as const] : []),
  ...(hasInventoryArea.value ? ["area" as const, "share" as const] : []),
  ...(!hasCanopy.value && !hasInventoryArea.value ? ["canopy" as const] : []),
]);
const measureOptions = computed<Record<ComparisonTheme, ComparisonMeasure[]>>(() => ({
  commerce: ["count", "density", "diversity"],
  economic: ["count", "density"],
  green: greenMeasures.value,
  transport: ["lines", "stations"],
}));
watch([hasCanopy, hasInventoryArea], ([canopy, inventory]) => {
  if (!greenMeasureTouched.value) measures.green = canopy ? "canopy" : inventory ? "area" : "canopy";
}, { immediate: true });

function onMeasureChange(theme: ComparisonTheme): void {
  pages[theme] = 0;
  if (theme === "green") greenMeasureTouched.value = true;
  if ((theme === "commerce" || theme === "economic") && measures[theme] === "diversity") categoryFilters[theme] = "all";
}

const categoryOptions = computed(() => ({
  commerce: NEARBY_PLACE_GROUPS
    .filter(group => Object.values(props.places?.counts ?? {}).some(counts => (counts.commerceGroups[group.id] ?? 0) > 0))
    .map(group => ({ id: group.id, label: t(group.labelKey) })),
  economic: (Object.keys(economyLabels) as EconomyGroup[]).map(id => ({ id, label: t(economyLabels[id]) })),
}));

function filteredCount(theme: "commerce" | "economic", counts: ComparisonPlaceCounts): number {
  const filter = categoryFilters[theme];
  if (theme === "commerce") return filter === "all" ? counts.commerce : counts.commerceGroups[filter as NearbyPlaceGroupId] ?? 0;
  return filter === "all" ? counts.economic : counts.economyGroups[filter as EconomyGroup] ?? 0;
}

type RankingRow = { item: ComparisonNeighborhood; value?: number; counts?: ComparisonPlaceCounts; transport?: { stationCount: number; lineCount: number } };
const rankings = computed<Record<ComparisonTheme, RankingRow[]>>(() => {
  const rows: Record<ComparisonTheme, RankingRow[]> = { commerce: [], economic: [], green: [], transport: [] };
  for (const item of neighborhoods.value) {
    const counts = props.places?.counts[item.codeIris];
    const transit = transport.value?.get(item.id);
    const greenArea = item.green.publicParkAreaM2 ?? (!item.green.error ? item.green.areaM2 : undefined);
    const green = item.green;
    const commerceValue = props.placesStatus === "ready" && counts
      ? measures.commerce === "density" ? perSquareKilometer(filteredCount("commerce", counts), item.areaM2)
        : measures.commerce === "diversity" ? Object.values(counts.commerceGroups).filter(value => value > 0).length
          : filteredCount("commerce", counts) : undefined;
    const economicValue = props.placesStatus === "ready" && counts
      ? measures.economic === "density" ? perSquareKilometer(filteredCount("economic", counts), item.areaM2)
        : filteredCount("economic", counts) : undefined;
    let greenValue: number | undefined;
    if (measures.green === "canopy" && green.canopy && green.canopy.areaM2 > 0 && Number.isFinite(green.canopy.canopyM2)) {
      greenValue = 100 * green.canopy.canopyM2 / green.canopy.areaM2;
    } else if (measures.green === "area" && greenArea !== undefined) greenValue = greenArea / 10_000;
    else if (measures.green === "share" && greenArea !== undefined && item.areaM2 > 0) greenValue = greenArea / item.areaM2 * 100;
    rows.commerce.push({ item, value: commerceValue, counts });
    rows.economic.push({ item, value: economicValue, counts });
    rows.green.push({ item, value: greenValue });
    rows.transport.push({ item, value: transit ? measures.transport === "stations" ? transit.stationCount : transit.lineCount : undefined,
      transport: transit && { stationCount: transit.stationCount, lineCount: transit.lineCount } });
  }
  for (const theme of themes) rows[theme].sort((a, b) => (b.value ?? -1) - (a.value ?? -1)
    || a.item.name.localeCompare(b.item.name, undefined, { numeric: true }));
  return rows;
});

function visibleRows(theme: ComparisonTheme) {
  return rankings.value[theme].slice(pages[theme] * PAGE_SIZE, (pages[theme] + 1) * PAGE_SIZE);
}
function pageCount(theme: ComparisonTheme) { return Math.max(1, Math.ceil(rankings.value[theme].length / PAGE_SIZE)); }
function format(value: number, digits = 1) { return n(value, { maximumFractionDigits: digits }); }
function display(theme: ComparisonTheme, value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    const loading = (theme === "commerce" || theme === "economic") && props.placesStatus === "loading"
      || theme === "green" && props.greenStatus === "loading"
      || theme === "transport" && !props.transportReady && !props.transportError;
    return t(loading ? "nearbyStations.comparison.loadingValue" : "nearbyStations.comparison.unavailable");
  }
  const measure = measures[theme];
  const digits = ["density", "area", "share", "canopy"].includes(measure) ? 1 : 0;
  const printed = format(value, digits);
  if (measure === "density") return t("nearbyStations.comparison.perKm2", { value: printed });
  if (measure === "area") return `${printed} ha`;
  if (measure === "share" || measure === "canopy") return `${printed} %`;
  return printed;
}
function summary(theme: ComparisonTheme): string {
  if (theme === "commerce" || theme === "economic") {
    if (props.placesStatus !== "ready" || !props.places) return t(props.placesStatus === "loading" ? "nearbyStations.comparison.placesLoading" : "nearbyStations.comparison.placesError");
    const count = scopeItems.value.reduce((sum, item) => {
      const row = props.places?.counts[item.codeIris];
      return sum + (row ? filteredCount(theme, row) : 0);
    }, 0);
    return t("nearbyStations.comparison.scopeInventory", { count: n(count), density: t("nearbyStations.comparison.perKm2", { value: format(perSquareKilometer(count, scopeArea.value) ?? 0) }) });
  }
  if (theme === "green") {
    if (props.greenStatus === "loading") return t("nearbyStations.comparison.greenLoading");
    if (props.greenStatus === "error" || props.greenStatus === "unavailable") return t("nearbyStations.comparison.greenLoadError");
    if (measures.green === "canopy") {
      if (scopeGreen.value?.canopy === undefined) return t("nearbyStations.comparison.canopyUnavailable");
      const coverage = `${scopeGreen.value.canopyCoveredIris}/${scopeGreen.value.canopyTotalIris}`;
      return t("nearbyStations.comparison.scopeCanopyCoverage", { percent: format(scopeGreen.value.canopy), coverage });
    }
    const areaM2 = scopeGreen.value?.parks;
    if (areaM2 === undefined) return t("nearbyStations.comparison.unavailable");
    return measures.green === "area"
      ? t("nearbyStations.comparison.scopeGreenArea", { hectares: format(areaM2 / 10_000) })
      : t("nearbyStations.comparison.scopeParks", { hectares: format(areaM2 / 10_000), percent: format(scopeArea.value > 0 ? areaM2 / scopeArea.value * 100 : 0) });
  }
  if (!props.transportReady && !props.transportError) return t("nearbyStations.comparison.transportLoading");
  if (!scopeTransport.value) return t("nearbyStations.comparison.transportError");
  return t("nearbyStations.comparison.transportDetail", { stations: n(scopeTransport.value.stationCount), lines: n(scopeTransport.value.lineCount) });
}

function rowLabel(row: RankingRow): string {
  return props.geography.commune.code === "75056" ? `${row.item.name} · ${row.item.communeName}` : row.item.name;
}
function maxValue(theme: ComparisonTheme): number {
  return Math.max(1, ...rankings.value[theme].map(row => row.value ?? 0));
}
function selectedRow(theme: ComparisonTheme) {
  return rankings.value[theme].find(row => row.item.codeIris === selectedCodes[theme]);
}
function date(value: string) { return d(value, { year: "numeric", month: "short", day: "numeric" }); }

const greenFocusUrl = computed(() => {
  const reference = props.greenMap;
  if (!reference) return undefined;
  return buildNatureCommuneFocusUrl(reference, props.geography.commune.name, props.origin);
});

const hasGreenMapData = computed(() => hasCanopy.value);
const canopySourceLabel = computed(() => props.canopyCoverage?.period
  ?? neighborhoods.value.find(item => item.green.canopy)?.green.canopy?.period);
const activeGreenDataCount = computed(() => scopeGreen.value?.canopyCoveredIris ?? 0);
const greenMetric = computed(() => {
  const values = Object.fromEntries(neighborhoods.value.map(item => {
    const greenArea = item.green.publicParkAreaM2 ?? (!item.green.error ? item.green.areaM2 : undefined);
    let value: number | undefined;
    if (measures.green === "canopy" && item.green.canopy && item.green.canopy.areaM2 > 0
      && Number.isFinite(item.green.canopy.canopyM2)) {
      value = 100 * item.green.canopy.canopyM2 / item.green.canopy.areaM2;
    } else if (measures.green === "area" && greenArea !== undefined) value = greenArea / 10_000;
    else if (measures.green === "share" && greenArea !== undefined && item.areaM2 > 0) value = greenArea / item.areaM2 * 100;
    return [item.codeIris, value];
  }));
  const maximum = Math.max(0, ...Object.values(values).filter((value): value is number => value !== undefined && Number.isFinite(value)));
  return {
    label: t(measureKeys[measures.green]),
    unit: measures.green === "area" ? "ha" : "%",
    max: maximum,
    values,
  };
});
</script>

<template>
  <section class="rest-comparison" data-testid="rest-comparison" :aria-label="t('nearbyStations.comparison.restSections')">
    <section v-for="theme in themes" :key="theme" class="rest-comparison__section" :class="`rest-comparison__section--${theme}`" :data-testid="`rest-section-${theme}`">
      <header class="rest-comparison__heading">
        <div><h3>{{ t(themeKeys[theme]) }}</h3><p class="rest-comparison__summary">{{ summary(theme) }}</p></div>
        <label class="rest-comparison__measure">
          {{ t('nearbyStations.comparison.measure') }}
          <select v-model="measures[theme]" :data-testid="`rest-measure-${theme}`" @change="onMeasureChange(theme)">
            <option v-for="measure in measureOptions[theme]" :key="measure" :value="measure">{{ t(measureKeys[measure]) }}</option>
          </select>
        </label>
      </header>

      <template v-if="(theme === 'commerce' || theme === 'economic') && placesStatus === 'ready'">
        <p class="rest-comparison__source">{{ t('nearbyStations.comparison.placesPartial') }} {{ t('nearbyStations.comparison.osmMethod') }}</p>
        <p v-if="placesDate && places" class="rest-comparison__source">{{ t('nearbyStations.comparison.osmSample', { date: date(placesDate), assigned: n(places.assigned), total: n(places.sample), outside: n(places.outside), ambiguous: n(places.ambiguous) }) }}</p>
        <p v-if="theme === 'economic'" class="rest-comparison__source">{{ t('nearbyStations.comparison.economyMethod') }}</p>
      </template>
      <p v-if="(theme === 'commerce' || theme === 'economic') && placesStatus === 'error'" class="rest-comparison__state" role="status">{{ t('nearbyStations.comparison.placesError') }}</p>
      <p v-if="theme === 'green' && measures.green === 'canopy' && greenStatus === 'ready' && !hasCanopy" class="rest-comparison__state" role="status">{{ t('nearbyStations.comparison.canopyUnavailable') }}</p>
      <p v-if="theme === 'green' && measures.green === 'canopy' && activeGreenDataCount < (scopeGreen?.canopyTotalIris ?? 0) && activeGreenDataCount > 0" class="rest-comparison__partial" role="status">
        {{ t('nearbyStations.comparison.canopyCoverageNotice', { covered: activeGreenDataCount, total: scopeGreen?.canopyTotalIris ?? 0 }) }}
      </p>
      <p v-if="theme === 'green' && greenStatus === 'error'" class="rest-comparison__state" role="status">{{ t('nearbyStations.comparison.greenLoadError') }}</p>
      <p v-if="theme === 'green' && measures.green === 'canopy' && canopySourceLabel" class="rest-comparison__source">
        {{ t('nearbyStations.comparison.canopySource', { period: canopySourceLabel }) }} · <a :href="NATURE_IN_CITY_URL" target="_blank" rel="noopener noreferrer">{{ t('nearbyStations.comparison.sourceLink') }}</a>
      </p>
      <p v-if="theme === 'green' && measures.green !== 'canopy' && geography.greenSource" class="rest-comparison__source">
        {{ t('nearbyStations.comparison.greenMethod', { source: geography.greenSource.title, period: geography.greenSource.referencePeriod ?? date(geography.generatedAt) }) }} · <a :href="geography.greenSource.pageUrl" target="_blank" rel="noopener noreferrer">{{ t('nearbyStations.comparison.sourceLink') }}</a>
      </p>
      <p v-if="theme === 'transport' && !transport" class="rest-comparison__state" role="status">{{ t(transportError ? 'nearbyStations.comparison.transportError' : 'nearbyStations.comparison.transportLoading') }}</p>
      <p v-if="theme === 'transport' && transportDate" class="rest-comparison__source">{{ t('nearbyStations.comparison.transportDate', { date: date(transportDate.generatedAt), version: transportDate.gtfs ?? t('nearbyStations.comparison.unavailable') }) }}</p>
      <p v-if="theme === 'transport'" class="rest-comparison__source">{{ t('nearbyStations.comparison.transportMethod') }}</p>

      <div v-if="theme === 'commerce' || theme === 'economic'" class="rest-comparison__filter-row">
        <label class="rest-comparison__filter">
          {{ t('nearbyStations.comparison.categoryFilter') }}
          <select v-model="categoryFilters[theme]" :data-testid="`rest-filter-${theme}`" :disabled="placesStatus !== 'ready' || measures[theme] === 'diversity'">
            <option value="all">{{ t('nearbyStations.comparison.allCategories') }}</option>
            <option v-for="option in categoryOptions[theme]" :key="option.id" :value="option.id">{{ option.label }}</option>
          </select>
        </label>
      </div>

      <div class="rest-comparison__layout" :class="{ 'rest-comparison__layout--green': theme === 'green' }">
        <div v-if="theme === 'green'" class="rest-comparison__map-column">
          <div class="rest-comparison__map-actions">
            <NuxtLink v-if="greenFocusUrl" class="rest-comparison__focus-link" :to="greenFocusUrl" data-testid="open-green-focus">{{ t('nearbyStations.comparison.openGreenMap') }}</NuxtLink>
            <span v-if="greenMap && !hasGreenMapData" class="rest-comparison__source">{{ t('nearbyStations.comparison.canopyGeometryUnavailable') }}</span>
          </div>
          <ComparisonMap :key="`${geography.commune.code}-green`" :neighborhoods="neighborhoods" :selected-code="selectedCodes.green"
            :metric="greenMetric" @select="selectedCodes.green = $event" />
        </div>
        <div class="rest-comparison__ranking">
          <p class="rest-comparison__ranking-title">{{ t('nearbyStations.comparison.ranking', { measure: t(measureKeys[measures[theme]]) }) }}</p>
          <div class="rest-comparison__bars">
            <button v-for="row in visibleRows(theme)" :key="row.item.codeIris" type="button" class="rest-comparison__bar"
              :class="{ 'rest-comparison__bar--selected': selectedCodes[theme] === row.item.codeIris, 'rest-comparison__bar--missing': theme === 'green' && row.value === undefined }"
              :aria-pressed="selectedCodes[theme] === row.item.codeIris" :data-code="row.item.codeIris" @click="selectedCodes[theme] = row.item.codeIris">
              <span class="rest-comparison__label">{{ rowLabel(row) }} <small>{{ row.item.codeIris }}</small></span>
              <span class="rest-comparison__track"><i v-if="row.value !== undefined" :style="{ width: `${100 * row.value / maxValue(theme)}%` }" /></span>
              <strong>{{ row.value === undefined && theme === 'green' && measures.green === 'canopy' && greenStatus === 'ready' ? t('nearbyStations.comparison.canopyNoData') : display(theme, row.value) }}</strong>
            </button>
          </div>
          <div v-if="pageCount(theme) > 1" class="rest-comparison__pagination" :aria-label="t('nearbyStations.comparison.pages')">
            <button type="button" :disabled="pages[theme] === 0" @click="pages[theme]--">{{ t('nearbyStations.comparison.previous') }}</button>
            <span>{{ t('nearbyStations.comparison.page', { page: pages[theme] + 1, total: pageCount(theme) }) }}</span>
            <button type="button" :disabled="pages[theme] + 1 >= pageCount(theme)" @click="pages[theme]++">{{ t('nearbyStations.comparison.next') }}</button>
          </div>
        </div>
      </div>

      <p v-if="selectedRow(theme)" class="rest-comparison__selected" aria-live="polite">
        <strong>{{ rowLabel(selectedRow(theme)!) }} · {{ selectedRow(theme)!.item.codeIris }}</strong>
        · {{ t('nearbyStations.comparison.selectedValue', { measure: t(measureKeys[measures[theme]]), value: display(theme, selectedRow(theme)!.value) }) }}
        · {{ t('nearbyStations.comparison.irisArea', { area: format(selectedRow(theme)!.item.areaM2 / 1_000_000, 2) }) }}
      </p>
    </section>
    <p class="rest-comparison__boundary-source">{{ t('nearbyStations.comparison.boundarySource', { source: geography.irisSource.title, producer: geography.irisSource.producer, period: geography.irisSource.referencePeriod ?? t('nearbyStations.comparison.unavailable'), date: date(geography.generatedAt) }) }} <a :href="geography.irisSource.pageUrl" target="_blank" rel="noopener noreferrer">{{ t('nearbyStations.comparison.sourceLink') }}</a></p>
  </section>
</template>

<style scoped>
.rest-comparison { display: grid; gap: 22px; margin-top: 14px; }
.rest-comparison__section { display: grid; gap: 10px; min-width: 0; padding: 18px 0 21px; border-top: 2px solid var(--border); }
.rest-comparison__heading { display: flex; align-items: start; justify-content: space-between; gap: 14px; }
.rest-comparison__heading h3 { margin: 0; font-size: 1.12rem; }
.rest-comparison__summary { margin: 4px 0 0; color: var(--muted); font-weight: 650; font-variant-numeric: tabular-nums; }
.rest-comparison__measure, .rest-comparison__filter { display: grid; gap: 4px; font-size: .82rem; font-weight: 650; }
.rest-comparison select, .rest-comparison button { max-width: 100%; font: inherit; }
.rest-comparison select { min-height: 38px; padding: 6px 9px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--ink); }
.rest-comparison__filter-row { display: flex; gap: 10px; }
.rest-comparison__layout { display: grid; min-width: 0; gap: 12px; }
.rest-comparison__layout--green { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
.rest-comparison__map-column, .rest-comparison__ranking { display: grid; gap: 8px; min-width: 0; }
.rest-comparison__map-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.rest-comparison__focus-link { justify-self: start; padding: 8px 12px; border: 1px solid #23724d; border-radius: 9px; background: #edf8f1; color: #125333; font-weight: 700; text-decoration: none; }
.rest-comparison__focus-link:hover { background: #d9f0e1; }
.rest-comparison__focus-link:focus-visible, .rest-comparison button:focus-visible, .rest-comparison select:focus-visible { outline: 3px solid #eea417; outline-offset: 2px; }
.rest-comparison__ranking-title { margin: 0; font-weight: 700; }
.rest-comparison__bars { display: grid; gap: 4px; }
.rest-comparison__bar { display: grid; width: 100%; min-width: 0; grid-template-columns: minmax(90px, 1.15fr) minmax(35px, 1fr) auto; align-items: center; gap: 8px; padding: 7px; border: 1px solid transparent; border-radius: 8px; background: var(--surface-soft); color: inherit; text-align: left; cursor: pointer; }
.rest-comparison__bar--selected { border-color: #4234a9; background: #eceafd; }
.rest-comparison__bar--missing { background: repeating-linear-gradient(135deg,#eef0f1,#eef0f1 6px,#e3e6e8 6px,#e3e6e8 12px); }
.rest-comparison__label { min-width: 0; overflow-wrap: anywhere; }
.rest-comparison__label small { display: block; color: var(--muted); }
.rest-comparison__track { height: 10px; overflow: hidden; border-radius: 8px; background: #dce6e8; }
.rest-comparison__track i { display: block; height: 100%; border-radius: inherit; background: #2d8396; }
.rest-comparison__section--green .rest-comparison__track i { background: linear-gradient(90deg,#b5dba0,#16743f); }
.rest-comparison__bar--selected .rest-comparison__track i { background: #5146d9; }
.rest-comparison__bar strong { max-width: 180px; font-variant-numeric: tabular-nums; }
.rest-comparison__pagination { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: .85rem; }
.rest-comparison__pagination button { padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); cursor: pointer; }
.rest-comparison__selected, .rest-comparison__source, .rest-comparison__partial, .rest-comparison__state, .rest-comparison__boundary-source { margin: 0; color: var(--muted); font-size: .84rem; }
.rest-comparison__source a, .rest-comparison__boundary-source a { color: inherit; }
.rest-comparison__state, .rest-comparison__partial { padding: 8px 10px; border-left: 3px solid #a87116; background: #fff8e8; color: #684707; }
@media (max-width: 760px) {
  .rest-comparison__heading { display: grid; grid-template-columns: minmax(0, 1fr); }
  .rest-comparison__layout--green { grid-template-columns: minmax(0, 1fr); }
  .rest-comparison__section { padding-block: 17px 19px; }
}
</style>
