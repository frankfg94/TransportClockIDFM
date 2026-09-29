<template>
  <aside
    class="global-map-real-estate"
    :class="{ 'global-map-real-estate--active': enabled }"
    data-global-map-real-estate-control
    @pointerdown.stop
    @click.stop
  >
    <div class="global-map-real-estate__header">
      <span class="global-map-real-estate__title">
        <Building2 :size="16" stroke-width="2.2" aria-hidden="true" />
        <span>{{ t("globalMap.realEstate.title") }}</span>
      </span>
      <button
        type="button"
        class="global-map-real-estate__switch"
        role="switch"
        :aria-checked="enabled"
        :aria-label="t('globalMap.realEstate.toggle')"
        :aria-busy="loading"
        data-global-map-real-estate-toggle
        @click="emit('toggle')"
      >
        <span>{{ enabled ? t("globalMap.realEstate.on") : t("globalMap.realEstate.off") }}</span>
        <span class="global-map-real-estate__track" aria-hidden="true"><span /></span>
      </button>
    </div>

    <template v-if="enabled">
      <p class="global-map-real-estate__measure">{{ t(measureKey) }}</p>
      <div class="global-map-real-estate__comparison">
        <span class="global-map-real-estate__comparison-label">
          {{ t("globalMap.realEstate.comparisonScope") }}
        </span>
        <MaterialCombobox
          :model-value="comparisonScope"
          :options="comparisonScopeOptions"
          :aria-label="t('globalMap.realEstate.comparisonScopeAria')"
          :teleport="true"
          @change="handleComparisonScopeChange"
        />
        <span class="global-map-real-estate__comparison-hint">
          {{ t("globalMap.realEstate.comparisonRangeMethod") }}
        </span>
      </div>
      <p class="global-map-real-estate__source">{{ t("globalMap.realEstate.pointZoom") }}</p>
      <div v-if="loading" class="global-map-real-estate__status" role="status" aria-live="polite">
        <span class="global-map-real-estate__spinner" aria-hidden="true" />
        {{ totalDepartmentCount
          ? t("globalMap.realEstate.loading", { loaded: completedDepartments, total: totalDepartmentCount })
          : t("globalMap.realEstate.preparing") }}
      </div>
      <div v-else-if="error" class="global-map-real-estate__status global-map-real-estate__status--error" role="status">
        {{ t("globalMap.realEstate.unavailable") }}
      </div>
      <template v-else-if="cellCount > 0">
        <p v-if="!metricAvailable" class="global-map-real-estate__status">
          {{ t("globalMap.realEstate.metricUnavailable") }}
        </p>
        <div v-else class="global-map-real-estate__scale" :aria-label="t(scaleAriaKey)">
          <span class="global-map-real-estate__gradient" :style="{ background: REAL_ESTATE_METRIC_CSS_GRADIENT }" aria-hidden="true" />
          <span class="global-map-real-estate__endpoints">
            <span>{{ formatMetric(lowValue) }}</span>
            <span>{{ formatMetric(highValue) }}</span>
          </span>
          <span class="global-map-real-estate__labels">
            <span>{{ t("globalMap.realEstate.low") }}</span>
            <span>{{ t("globalMap.realEstate.high") }}</span>
          </span>
        </div>
        <p class="global-map-real-estate__source">
          {{ t("globalMap.realEstate.coverage", { period: referencePeriod, cells: formatCount(cellCount), cities: formatCount(cityCount), total: formatCount(totalCityCount) }) }}
        </p>
        <p v-if="failedDepartmentCount > 0" class="global-map-real-estate__partial" role="status">
          {{ t("globalMap.realEstate.partialCoverage", {
            loaded: loadedDepartmentCount,
            total: totalDepartmentCount,
            failed: failedDepartmentCount,
          }) }}
        </p>
        <div v-if="metricAvailable" class="global-map-real-estate__data-notes">
          <span class="global-map-real-estate__data-notes-title">
            {{ t("globalMap.realEstate.sourcesAndMethod") }}
          </span>
          <span v-if="metricMode === 'price'">{{ t("globalMap.realEstate.liquidityMethod") }}</span>
          <template v-else>
            <span>{{ t("globalMap.realEstate.rentSource", { period: rentalReferencePeriod }) }}</span>
            <span v-if="metricMode === 'yield'">{{ t("globalMap.realEstate.grossYieldMethod") }}</span>
          </template>
        </div>
        <div v-if="metricMode === 'rent' && rentalEstimate" class="global-map-real-estate__estimate-details">
          <span class="global-map-real-estate__data-notes-title">
            {{ t("globalMap.realEstate.hoveredEstimate") }}
          </span>
          <span>
            {{ t("globalMap.realEstate.rentInterval", {
              low: formatRent(rentalEstimate.intervalLow),
              high: formatRent(rentalEstimate.intervalHigh),
            }) }}
          </span>
          <span>
            {{ t("globalMap.realEstate.rentCoverage", {
              level: rentalPredictionLevel,
              count: formatCount(rentalObservationCount),
            }) }}
          </span>
          <span v-if="rentalIsLowConfidence" class="global-map-real-estate__estimate-caution">
            {{ t("globalMap.realEstate.rentLowConfidence") }}
          </span>
        </div>
        <div v-else-if="metricMode === 'yield' && grossYieldInterval" class="global-map-real-estate__estimate-details">
          <span class="global-map-real-estate__data-notes-title">
            {{ t("globalMap.realEstate.hoveredEstimate") }}
          </span>
          <span>{{ t("globalMap.realEstate.grossYieldInterval", grossYieldInterval) }}</span>
        </div>
      </template>

      <div class="global-map-real-estate__metric-tabs" role="group" :aria-label="t('globalMap.realEstate.metricSelectorAria')">
        <button
          v-for="tab in metricTabs"
          :key="tab.mode"
          type="button"
          class="global-map-real-estate__metric-tab"
          :class="{ 'global-map-real-estate__metric-tab--active': metricMode === tab.mode }"
          :aria-pressed="metricMode === tab.mode"
          @click="emit('changeMetric', tab.mode)"
        >
          {{ t(tab.labelKey) }}
        </button>
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Building2 } from "lucide-vue-next";
import MaterialCombobox, { type MaterialComboboxOption } from "../../components/MaterialCombobox.vue";
import { useI18n, type TranslationKey } from "../../i18n";
import { REAL_ESTATE_METRIC_CSS_GRADIENT } from "../transport-map/real-estate/realEstateMetricColors";
import { DVF_MARKET_SCOPES, type DvfMarketScope, type DvfRentalEstimate } from "../../services/real-estate/compiledRealEstate";
import type { DvfMapMetricMode } from "../transport-map/next/deckRealEstateLayer";

const metricTabs = [
  { mode: "price", labelKey: "globalMap.realEstate.modePrice" },
  { mode: "rent", labelKey: "globalMap.realEstate.modeRent" },
  { mode: "yield", labelKey: "globalMap.realEstate.modeYield" },
] as const;

const props = defineProps<{
  enabled: boolean;
  loading: boolean;
  error: string;
  completedDepartments: number;
  loadedDepartmentCount: number;
  totalDepartmentCount: number;
  failedDepartmentCount: number;
  totalCityCount: number;
  cityCount: number;
  cellCount: number;
  comparisonScope: DvfMarketScope;
  metricMode: DvfMapMetricMode;
  metricAvailable: boolean;
  lowValue: number;
  highValue: number;
  referencePeriod: string;
  rentalReferencePeriod: string;
  rentalEstimate?: DvfRentalEstimate;
  yieldPrice?: number;
}>();

const emit = defineEmits<{
  toggle: [];
  changeMetric: [mode: DvfMapMetricMode];
  changeComparisonScope: [scope: DvfMarketScope];
}>();
const { locale, t } = useI18n();
const comparisonScopeLabelKeys: Record<DvfMarketScope, TranslationKey> = {
  "paris-intramuros": "globalMap.realEstate.marketScopeParis",
  "petite-couronne": "globalMap.realEstate.marketScopePetite",
  "grande-couronne": "globalMap.realEstate.marketScopeGrande",
  idf: "globalMap.realEstate.marketScopeIdf",
};
const comparisonScopeOptions = computed<MaterialComboboxOption[]>(() => DVF_MARKET_SCOPES.map((scope) => ({
  id: scope,
  label: t(comparisonScopeLabelKeys[scope]),
})));
const measureKeys = {
  price: "globalMap.realEstate.measurePrice",
  rent: "globalMap.realEstate.measureRent",
  yield: "globalMap.realEstate.measureYield",
} as const;
const scaleAriaKeys = {
  price: "globalMap.realEstate.scaleAriaPrice",
  rent: "globalMap.realEstate.scaleAriaRent",
  yield: "globalMap.realEstate.scaleAriaYield",
} as const;
const measureKey = computed(() => measureKeys[props.metricMode]);
const scaleAriaKey = computed(() => scaleAriaKeys[props.metricMode]);
const rentalObservationCount = computed(() => props.rentalEstimate
  ? props.rentalEstimate.observationsInCommune || props.rentalEstimate.observationsInMesh
  : 0);
const rentalPredictionLevel = computed(() => {
  const level = props.rentalEstimate?.predictionLevel.toLowerCase();
  if (level === "commune") return t("globalMap.realEstate.rentLevelCommune");
  if (level === "epci") return t("globalMap.realEstate.rentLevelEpci");
  return t("globalMap.realEstate.rentLevelMesh");
});
const rentalIsLowConfidence = computed(() => Boolean(props.rentalEstimate
  && (props.rentalEstimate.observationsInCommune < 30
    || (props.rentalEstimate.modelR2 !== undefined && props.rentalEstimate.modelR2 < 0.5))));
const grossYieldInterval = computed(() => {
  const estimate = props.rentalEstimate;
  const price = props.yieldPrice;
  if (!estimate || price === undefined || !Number.isFinite(price) || price <= 0) return undefined;
  return {
    low: formatPercent(estimate.intervalLow * 12 / price * 100),
    high: formatPercent(estimate.intervalHigh * 12 / price * 100),
  };
});

function formatMetric(value: number): string {
  const isYield = props.metricMode === "yield";
  const formatted = new Intl.NumberFormat(locale.value, {
    maximumFractionDigits: isYield || props.metricMode === "rent" ? 1 : 0,
  }).format(value);
  return `${formatted} ${isYield ? "%" : "€"}`;
}

function handleComparisonScopeChange(value: string): void {
  if (DVF_MARKET_SCOPES.some((scope) => scope === value)) {
    emit("changeComparisonScope", value as DvfMarketScope);
  }
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(value);
}

function formatRent(value: number): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}
</script>

<style scoped>
.global-map-real-estate {
  position: absolute;
  z-index: 7;
  right: 16px;
  bottom: 57px;
  width: min(274px, calc(100% - 32px));
  padding: 11px 12px 10px;
  border: 1px solid rgba(100, 116, 139, 0.2);
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.93);
  box-shadow: 0 7px 22px rgba(15, 23, 42, 0.15);
  color: #172033;
  backdrop-filter: blur(12px);
}

.global-map-real-estate--active {
  border-color: rgba(185, 28, 28, 0.2);
}

.global-map-real-estate__header,
.global-map-real-estate__title,
.global-map-real-estate__switch,
.global-map-real-estate__endpoints,
.global-map-real-estate__labels {
  display: flex;
  align-items: center;
}

.global-map-real-estate__header {
  justify-content: space-between;
  gap: 10px;
}

.global-map-real-estate__title {
  gap: 7px;
  color: #7f1d1d;
  font-size: 0.8rem;
  font-weight: 850;
}

.global-map-real-estate__switch {
  gap: 7px;
  min-height: 30px;
  padding: 3px 5px 3px 8px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #475569;
  font: inherit;
  font-size: 0.7rem;
  font-weight: 750;
  cursor: pointer;
}

.global-map-real-estate__switch:hover,
.global-map-real-estate__switch:focus-visible {
  background: rgba(241, 245, 249, 0.9);
  outline: 0;
}

.global-map-real-estate__track {
  display: block;
  width: 29px;
  height: 17px;
  padding: 2px;
  border-radius: 999px;
  background: #cbd5e1;
  transition: background-color 150ms ease;
}

.global-map-real-estate__track > span {
  display: block;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);
  transition: transform 150ms ease;
}

.global-map-real-estate--active .global-map-real-estate__track {
  background: #b91c1c;
}

.global-map-real-estate--active .global-map-real-estate__track > span {
  transform: translateX(12px);
}

.global-map-real-estate__measure {
  margin: 7px 0 8px;
  color: #64748b;
  font-size: 0.68rem;
}

.global-map-real-estate__comparison {
  display: grid;
  gap: 4px;
  margin: 0 0 8px;
}

.global-map-real-estate__comparison-label {
  color: #475569;
  font-size: 0.63rem;
  font-weight: 750;
}

.global-map-real-estate__comparison :deep(.material-combobox) {
  width: 100%;
  min-width: 0;
}

.global-map-real-estate__comparison :deep(.material-combobox__trigger) {
  min-height: 31px;
  padding: 5px 8px;
}

.global-map-real-estate__comparison :deep(.material-combobox__value) {
  font-size: 0.68rem;
}

.global-map-real-estate__comparison-hint {
  color: #64748b;
  font-size: 0.58rem;
  line-height: 1.3;
}

.global-map-real-estate__metric-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 3px;
  margin-top: 10px;
  padding: 3px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 10px;
  background: rgba(241, 245, 249, 0.86);
}

.global-map-real-estate__metric-tab {
  min-width: 0;
  min-height: 30px;
  padding: 5px 4px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #475569;
  font: inherit;
  font-size: 0.64rem;
  font-weight: 750;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease, box-shadow 150ms ease;
}

.global-map-real-estate__metric-tab:hover,
.global-map-real-estate__metric-tab:focus-visible {
  background: white;
  color: #7f1d1d;
  outline: 0;
}

.global-map-real-estate__metric-tab--active {
  background: white;
  color: #7f1d1d;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.14);
}

.global-map-real-estate__gradient {
  display: block;
  height: 9px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
}

.global-map-real-estate__endpoints,
.global-map-real-estate__labels {
  justify-content: space-between;
  gap: 8px;
}

.global-map-real-estate__endpoints {
  margin-top: 4px;
  color: #334155;
  font-size: 0.66rem;
  font-variant-numeric: tabular-nums;
  font-weight: 750;
}

.global-map-real-estate__labels {
  margin-top: 2px;
  color: #64748b;
  font-size: 0.62rem;
}

.global-map-real-estate__source {
  margin: 8px 0 0;
  padding-top: 7px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  color: #64748b;
  font-size: 0.62rem;
  line-height: 1.35;
}

.global-map-real-estate__data-notes {
  display: grid;
  gap: 3px;
  margin-top: 7px;
  padding-top: 6px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  color: #64748b;
  font-size: 0.59rem;
  line-height: 1.32;
}

.global-map-real-estate__estimate-details {
  display: grid;
  gap: 3px;
  margin-top: 5px;
  padding-top: 5px;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
  color: #64748b;
  font-size: 0.59rem;
  line-height: 1.32;
}

.global-map-real-estate__data-notes-title {
  color: #475569;
  font-size: 0.61rem;
  font-weight: 750;
}

.global-map-real-estate__estimate-caution {
  color: #9a3412;
}

.global-map-real-estate__status {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
  color: #475569;
  font-size: 0.68rem;
}

.global-map-real-estate__status--error {
  color: #991b1b;
}

.global-map-real-estate__partial {
  margin: 6px 0 0;
  color: #92400e;
  font-size: 0.63rem;
  line-height: 1.35;
}

.global-map-real-estate__spinner {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
  border: 2px solid rgba(185, 28, 28, 0.18);
  border-top-color: #b91c1c;
  border-radius: 50%;
  animation: real-estate-spin 700ms linear infinite;
}

@keyframes real-estate-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 700px) {
  .global-map-real-estate {
    right: 10px;
    bottom: 48px;
    width: min(242px, calc(100% - 20px));
    padding: 9px 10px 8px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .global-map-real-estate__track,
  .global-map-real-estate__track > span,
  .global-map-real-estate__metric-tab {
    transition: none;
  }

  .global-map-real-estate__spinner {
    animation-duration: 1400ms;
  }
}
</style>
