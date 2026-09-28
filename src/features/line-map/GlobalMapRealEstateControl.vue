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
          <span class="global-map-real-estate__gradient" aria-hidden="true" />
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
import { useI18n } from "../../i18n";
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
  metricMode: DvfMapMetricMode;
  metricAvailable: boolean;
  lowValue: number;
  highValue: number;
  referencePeriod: string;
}>();

const emit = defineEmits<{ toggle: []; changeMetric: [mode: DvfMapMetricMode] }>();
const { locale, t } = useI18n();
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

function formatMetric(value: number): string {
  const isYield = props.metricMode === "yield";
  const formatted = new Intl.NumberFormat(locale.value, {
    maximumFractionDigits: isYield || props.metricMode === "rent" ? 1 : 0,
  }).format(value);
  return `${formatted} ${isYield ? "%" : "€"}`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(value);
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
  background: linear-gradient(90deg, #16a34a 0%, #84cc16 24%, #facc15 46%, #f97316 66%, #dc2626 84%, #7f1d1d 100%);
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
