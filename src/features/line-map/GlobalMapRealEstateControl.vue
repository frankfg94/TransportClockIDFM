<template>
  <aside
    class="global-map-real-estate"
    :class="{ 'global-map-real-estate--active': enabled }"
    data-global-map-real-estate-control
    @pointerdown.stop
    @click.stop
    @click.self="openMetricPicker()"
  >
    <div class="global-map-real-estate__desktop-content">
      <div class="global-map-real-estate__header">
        <span class="global-map-real-estate__title">
          <Building2 :size="16" stroke-width="2.2" aria-hidden="true" />
          <span>{{ t("globalMap.realEstate.title") }}</span>
        </span>
        <button
          v-if="enabled"
          type="button"
          class="global-map-real-estate__desktop-info-button"
          :aria-label="t('globalMap.realEstate.dataInfo')"
          :title="t('globalMap.realEstate.dataInfo')"
          @click="openDesktopInfoModal"
        >
          <Info :size="17" stroke-width="2" aria-hidden="true" />
        </button>
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
          <p v-if="failedDepartmentCount > 0" class="global-map-real-estate__partial" role="status">
            {{ t("globalMap.realEstate.partialCoverage", {
              loaded: loadedDepartmentCount,
              total: totalDepartmentCount,
              failed: failedDepartmentCount,
            }) }}
          </p>
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
    </div>

    <div v-if="!enabled" class="global-map-real-estate__mobile-pill">
      <button
        type="button"
        class="global-map-real-estate__mobile-main"
        :aria-label="`${t('globalMap.realEstate.title')} · ${t('globalMap.realEstate.off')}`"
        :aria-expanded="metricPickerOpen"
        aria-controls="global-map-real-estate-picker"
        data-global-map-real-estate-picker-toggle
        @click="openMetricPicker()"
      >
        <Building2 :size="17" stroke-width="2.1" aria-hidden="true" />
        <span class="global-map-real-estate__mobile-name">{{ t("globalMap.realEstate.title") }}</span>
        <span class="global-map-real-estate__mobile-separator" aria-hidden="true">·</span>
        <span class="global-map-real-estate__mobile-value">{{ t("globalMap.realEstate.off") }}</span>
      </button>
      <button
        type="button"
        class="global-map-real-estate__switch global-map-real-estate__mobile-switch"
        :aria-label="t('globalMap.realEstate.toggle')"
        :aria-busy="loading"
        :aria-expanded="metricPickerOpen"
        aria-haspopup="dialog"
        aria-controls="global-map-real-estate-picker"
        data-global-map-real-estate-toggle
        @click="toggleMobileRealEstate"
      >
        <span class="global-map-real-estate__track" aria-hidden="true"><span /></span>
      </button>
    </div>

    <section v-else class="global-map-real-estate__mobile-active" :aria-label="t('globalMap.realEstate.title')">
      <div class="global-map-real-estate__mobile-active-header">
        <button
          type="button"
          class="global-map-real-estate__mobile-active-metric"
          :aria-label="`${t('globalMap.realEstate.metricSelectorAria')} · ${metricLabel}`"
          :aria-expanded="metricPickerOpen"
          aria-controls="global-map-real-estate-picker"
          data-global-map-real-estate-picker-toggle
          @click="openMetricPicker()"
        >
          <Building2 :size="16" stroke-width="2.1" aria-hidden="true" />
          <span>{{ metricLabel }}</span>
          <ChevronDown :size="15" stroke-width="2.2" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="global-map-real-estate__mobile-info"
          :aria-label="t('globalMap.realEstate.dataInfo')"
          :aria-expanded="metricPickerOpen"
          aria-controls="global-map-real-estate-picker"
          data-global-map-real-estate-info
          @click="openMetricPicker(true)"
        >
          <Info :size="18" stroke-width="2" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="global-map-real-estate__mobile-switch"
          role="switch"
          :aria-checked="enabled"
          :aria-label="t('globalMap.realEstate.toggle')"
          :aria-busy="loading"
          data-global-map-real-estate-toggle
          @click="toggleMobileRealEstate"
        >
          <span class="global-map-real-estate__track" aria-hidden="true"><span /></span>
        </button>
      </div>
      <div v-if="metricAvailable" class="global-map-real-estate__mobile-scale" :aria-label="t(scaleAriaKey)">
        <span class="global-map-real-estate__gradient" :style="{ background: REAL_ESTATE_METRIC_CSS_GRADIENT }" aria-hidden="true" />
        <span class="global-map-real-estate__mobile-endpoints">
          <span>{{ formatLegendMetric(lowValue) }}</span>
          <span>{{ formatLegendMetric(highValue) }}</span>
        </span>
      </div>
      <div v-else class="global-map-real-estate__mobile-status" role="status" aria-live="polite">
        <span v-if="loading" class="global-map-real-estate__spinner" aria-hidden="true" />
        {{ loading
          ? (totalDepartmentCount
            ? t("globalMap.realEstate.loading", { loaded: completedDepartments, total: totalDepartmentCount })
            : t("globalMap.realEstate.preparing"))
          : error
            ? t("globalMap.realEstate.unavailable")
            : t("globalMap.realEstate.metricUnavailable") }}
      </div>
    </section>
  </aside>

  <Teleport to="body">
    <AppRightPanel
      :open="metricPickerOpen"
      :title="t('globalMap.realEstate.title')"
      :close-label="t('globalMap.realEstate.closePicker')"
      :mobile-sheet="true"
      mobile-sheet-stage="full"
      :mobile-sheet-resize-label="t('globalMap.realEstate.closePicker')"
      @close="closeMetricPicker"
      @mobile-sheet-stage-change="handleMetricPickerStageChange"
    >
      <template #header>
        <div class="global-map-real-estate__picker-heading">
          <strong>{{ t("globalMap.realEstate.title") }}</strong>
          <span>{{ t("globalMap.realEstate.chooseMetric") }}</span>
        </div>
      </template>
      <div
        id="global-map-real-estate-picker"
        class="global-map-real-estate__picker-content"
        data-global-map-real-estate-picker
      >
        <div class="global-map-real-estate__comparison global-map-real-estate__picker-comparison">
          <span class="global-map-real-estate__comparison-label">
            {{ t("globalMap.realEstate.comparisonScope") }}
          </span>
          <MaterialCombobox
            :model-value="comparisonScope"
            :options="comparisonScopeOptions"
            :aria-label="t('globalMap.realEstate.comparisonScopeAria')"
            :teleport="true"
            menu-class="global-map-real-estate__mobile-comparison-menu"
            @change="handleComparisonScopeChange"
          />
          <span class="global-map-real-estate__comparison-hint">
            {{ t("globalMap.realEstate.comparisonRangeMethod") }}
          </span>
        </div>
        <div class="global-map-real-estate__metric-options" role="group" :aria-label="t('globalMap.realEstate.metricSelectorAria')">
          <button
            v-for="tab in metricTabs"
            :key="tab.mode"
            type="button"
            class="global-map-real-estate__metric-option"
            :class="{ 'global-map-real-estate__metric-option--active': metricMode === tab.mode }"
            :aria-pressed="metricMode === tab.mode"
            :data-global-map-real-estate-metric="tab.mode"
            @click="selectMobileMetric(tab.mode)"
          >
            <span>{{ t(tab.labelKey) }}</span>
            <Check v-if="metricMode === tab.mode" :size="19" stroke-width="2.5" aria-hidden="true" />
          </button>
        </div>

        <details
          class="global-map-real-estate__mobile-disclosure"
          :open="sourceInfoExpanded"
          @toggle="handleInfoDisclosureToggle($event, 'source')"
        >
          <summary>
            <Info :size="17" aria-hidden="true" />
            <span>{{ t("globalMap.realEstate.sourceInfo") }}</span>
            <ChevronDown :size="17" aria-hidden="true" />
          </summary>
          <div class="global-map-real-estate__disclosure-content">
            <p class="global-map-real-estate__source">{{ t("globalMap.realEstate.pointZoom") }}</p>
            <p v-if="cellCount > 0" class="global-map-real-estate__source">
              {{ t("globalMap.realEstate.coverage", { period: referencePeriod, cells: formatCount(cellCount), cities: formatCount(cityCount), total: formatCount(totalCityCount) }) }}
            </p>
          </div>
        </details>

        <details
          class="global-map-real-estate__mobile-disclosure"
          :open="dataInfoExpanded"
          @toggle="handleInfoDisclosureToggle($event, 'data')"
        >
          <summary>
            <Info :size="17" aria-hidden="true" />
            <span>{{ t("globalMap.realEstate.dataInfo") }}</span>
            <ChevronDown :size="17" aria-hidden="true" />
          </summary>
          <div class="global-map-real-estate__disclosure-content">
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
                <span v-for="(note, index) in dataNotes" :key="`${metricMode}:${index}`">{{ note }}</span>
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

          </div>
        </details>
      </div>
    </AppRightPanel>
  </Teleport>

  <AppModal
    :open="desktopInfoModalOpen && !isMobileControlViewport()"
    :title="t('globalMap.realEstate.dataInfo')"
    panel-class="global-map-real-estate__desktop-info-modal"
    @close="desktopInfoModalOpen = false"
  >
    <div class="global-map-real-estate__desktop-info-body">
      <section class="global-map-real-estate__desktop-info-section">
        <h3>{{ t("globalMap.realEstate.sourceInfo") }}</h3>
        <p>{{ t("globalMap.realEstate.pointZoom") }}</p>
      </section>
      <section class="global-map-real-estate__desktop-info-section">
        <h3>{{ t("globalMap.realEstate.sourcesAndMethod") }}</h3>
        <p v-if="cellCount > 0">
          {{ t("globalMap.realEstate.coverage", { period: referencePeriod, cells: formatCount(cellCount), cities: formatCount(cityCount), total: formatCount(totalCityCount) }) }}
        </p>
        <p v-if="failedDepartmentCount > 0" class="global-map-real-estate__partial">
          {{ t("globalMap.realEstate.partialCoverage", {
            loaded: loadedDepartmentCount,
            total: totalDepartmentCount,
            failed: failedDepartmentCount,
          }) }}
        </p>
        <div v-if="metricAvailable" class="global-map-real-estate__desktop-info-notes">
          <span v-for="(note, index) in dataNotes" :key="metricMode + ':' + index">{{ note }}</span>
        </div>
      </section>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { Building2, Check, ChevronDown, Info } from "lucide-vue-next";
import AppModal from "../../components/AppModal.vue";
import AppRightPanel from "../../components/AppRightPanel.vue";
import MaterialCombobox, { type MaterialComboboxOption } from "../../components/MaterialCombobox.vue";
import { useI18n, type TranslationKey } from "../../i18n";
import { REAL_ESTATE_METRIC_CSS_GRADIENT } from "../transport-map/real-estate/realEstateMetricColors";
import { DVF_MARKET_SCOPES, type DvfMarketScope, type DvfRentalEstimate } from "../../services/real-estate/compiledRealEstate";
import type { DvfMapMetricMode } from "../transport-map/next/deckRealEstateLayer";

const metricTabs = [
  { mode: "price", labelKey: "globalMap.realEstate.modePrice" },
  { mode: "rent", labelKey: "globalMap.realEstate.modeRent" },
  { mode: "yield", labelKey: "globalMap.realEstate.modeYield" },
  { mode: "liquidity", labelKey: "globalMap.realEstate.modeLiquidity" },
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
const metricPickerOpen = ref(false);
const desktopInfoModalOpen = ref(false);
const sourceInfoExpanded = ref(false);
const dataInfoExpanded = ref(false);
function closeDesktopInfoModalOnMobileResize(): void {
  if (isMobileControlViewport()) desktopInfoModalOpen.value = false;
}
onMounted(() => window.addEventListener("resize", closeDesktopInfoModalOnMobileResize));
onUnmounted(() => window.removeEventListener("resize", closeDesktopInfoModalOnMobileResize));
watch(metricPickerOpen, async (open) => {
  if (typeof document === "undefined") return;
  await nextTick();
  if (open) {
    document
      .querySelector<HTMLButtonElement>("[data-global-map-real-estate-metric][aria-pressed='true']")
      ?.focus({ preventScroll: true });
    return;
  }
  document
    .querySelector<HTMLButtonElement>(".global-map-real-estate__mobile-main, .global-map-real-estate__mobile-active-metric")
    ?.focus({ preventScroll: true });
});
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
  liquidity: "globalMap.realEstate.measureLiquidity",
} as const;
const scaleAriaKeys = {
  price: "globalMap.realEstate.scaleAriaPrice",
  rent: "globalMap.realEstate.scaleAriaRent",
  yield: "globalMap.realEstate.scaleAriaYield",
  liquidity: "globalMap.realEstate.scaleAriaLiquidity",
} as const;
const metricLabelKeys: Record<DvfMapMetricMode, TranslationKey> = {
  price: "globalMap.realEstate.modePrice",
  rent: "globalMap.realEstate.modeRent",
  yield: "globalMap.realEstate.modeYield",
  liquidity: "globalMap.realEstate.modeLiquidity",
};
const measureKey = computed(() => measureKeys[props.metricMode]);
const scaleAriaKey = computed(() => scaleAriaKeys[props.metricMode]);
const metricLabel = computed(() => t(metricLabelKeys[props.metricMode]));
const dataNotes = computed(() => {
  if (props.metricMode === "liquidity") {
    return [t("globalMap.realEstate.liquidityCellMethod", { period: props.referencePeriod })];
  }
  if (props.metricMode === "price") return [t("globalMap.realEstate.liquidityMethod")];
  const notes = [t("globalMap.realEstate.rentSource", { period: props.rentalReferencePeriod })];
  if (props.metricMode === "yield") notes.push(t("globalMap.realEstate.grossYieldMethod"));
  return notes;
});
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
  const isLiquidity = props.metricMode === "liquidity";
  const formatted = new Intl.NumberFormat(locale.value, {
    maximumFractionDigits: isYield || props.metricMode === "rent" ? 1 : 0,
  }).format(value);
  const unit = isYield ? "%" : isLiquidity ? t("globalMap.realEstate.salesUnit") : "€";
  return `${formatted} ${unit}`;
}

const metricUnitKeys: Record<DvfMapMetricMode, TranslationKey> = {
  price: "globalMap.realEstate.priceUnit",
  rent: "globalMap.realEstate.rentUnit",
  yield: "globalMap.realEstate.yieldUnit",
  liquidity: "globalMap.realEstate.salesUnit",
};

function formatLegendMetric(value: number): string {
  const formatted = new Intl.NumberFormat(locale.value, {
    maximumFractionDigits: props.metricMode === "yield" || props.metricMode === "rent" ? 1 : 0,
  }).format(value);
  return `${formatted} ${t(metricUnitKeys[props.metricMode])}`;
}

function handleComparisonScopeChange(value: string): void {
  if (DVF_MARKET_SCOPES.some((scope) => scope === value)) {
    emit("changeComparisonScope", value as DvfMarketScope);
  }
}

function isMobileControlViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches;
}

function openDesktopInfoModal(): void {
  if (isMobileControlViewport()) return;
  desktopInfoModalOpen.value = true;
}

function openMetricPicker(showInfo = false): void {
  if (!isMobileControlViewport()) return;
  sourceInfoExpanded.value = showInfo;
  dataInfoExpanded.value = showInfo;
  metricPickerOpen.value = true;
}

function closeMetricPicker(): void {
  metricPickerOpen.value = false;
  sourceInfoExpanded.value = false;
  dataInfoExpanded.value = false;
}

function handleMetricPickerStageChange(stage: "peek" | "mid" | "full"): void {
  if (stage !== "full") closeMetricPicker();
}

function handleInfoDisclosureToggle(event: Event, section: "source" | "data"): void {
  const isOpen = (event.currentTarget as HTMLDetailsElement).open;
  if (section === "source") sourceInfoExpanded.value = isOpen;
  else dataInfoExpanded.value = isOpen;
}

function toggleMobileRealEstate(): void {
  if (props.enabled) {
    emit("toggle");
    return;
  }
  openMetricPicker();
}

function selectMobileMetric(mode: DvfMapMetricMode): void {
  emit("changeMetric", mode);
  if (!props.enabled) emit("toggle");
  closeMetricPicker();
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

.global-map-real-estate__mobile-pill {
  display: none;
}

.global-map-real-estate__mobile-active {
  display: none;
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

.global-map-real-estate__desktop-info-button {
  display: grid;
  flex: 0 0 34px;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}

.global-map-real-estate__desktop-info-button:hover,
.global-map-real-estate__desktop-info-button:focus-visible {
  background: rgba(148, 163, 184, 0.14);
  color: #475569;
  outline: 0;
}

.global-map-real-estate__desktop-info-button:focus-visible {
  box-shadow: inset 0 0 0 2px rgba(71, 85, 105, 0.35);
}

.global-map-real-estate__desktop-info-body {
  display: grid;
  gap: 14px;
  color: #475569;
  font-size: 0.78rem;
  line-height: 1.5;
}

.global-map-real-estate__desktop-info-section + .global-map-real-estate__desktop-info-section {
  padding-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.global-map-real-estate__desktop-info-section h3 {
  margin: 0 0 5px;
  color: #334155;
  font-size: 0.78rem;
  font-weight: 800;
}

.global-map-real-estate__desktop-info-section p {
  margin: 0;
}

.global-map-real-estate__desktop-info-section .global-map-real-estate__partial {
  margin-top: 7px;
}

.global-map-real-estate__desktop-info-notes {
  display: grid;
  gap: 5px;
  margin-top: 7px;
  color: #64748b;
  font-size: 0.73rem;
}

:global(.modal-panel.global-map-real-estate__desktop-info-modal) {
  width: min(100%, 440px);
  max-width: 440px;
  max-height: min(480px, calc(100dvh - 40px));
}

:global(.global-map-real-estate__desktop-info-modal .modal-panel__header) {
  padding: 14px 18px;
}

:global(.global-map-real-estate__desktop-info-modal .app-modal__body) {
  gap: 14px;
  padding: 16px 18px 18px;
}

.global-map-real-estate__metric-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
    box-sizing: border-box;
    right: auto;
    bottom: 76px;
    left: 50%;
    width: max-content;
    max-width: calc(100% - 24px);
    padding: 3px 4px;
    border-color: rgba(100, 116, 139, 0.18);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 4px 13px rgba(15, 23, 42, 0.12);
    transform: translateX(-50%);
  }

  .global-map-real-estate--active {
    border-color: rgba(100, 116, 139, 0.2);
    width: min(420px, calc(100vw - 24px));
    padding: 5px 10px 8px;
    border-radius: 17px;
  }

  .global-map-real-estate__desktop-content {
    display: none;
  }

  .global-map-real-estate__mobile-pill {
    display: flex;
    align-items: center;
    gap: 1px;
    min-height: 44px;
    max-width: 100%;
  }

  .global-map-real-estate__mobile-active-header {
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 44px;
  }

  .global-map-real-estate__mobile-active {
    display: block;
  }

  .global-map-real-estate__mobile-main {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    min-height: 44px;
    padding: 0 5px 0 8px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #334155;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .global-map-real-estate__mobile-main svg {
    flex: 0 0 auto;
    color: #8b3131;
  }

  .global-map-real-estate__mobile-name {
    flex: 0 0 auto;
    font-size: 0.76rem;
    font-weight: 800;
    white-space: nowrap;
  }

  .global-map-real-estate__mobile-separator {
    color: #cbd5e1;
    font-size: 0.8rem;
  }

  .global-map-real-estate__mobile-value {
    overflow: hidden;
    color: #64748b;
    font-size: 0.66rem;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .global-map-real-estate__mobile-main:hover,
  .global-map-real-estate__mobile-main:focus-visible,
  .global-map-real-estate__mobile-switch:hover,
  .global-map-real-estate__mobile-switch:focus-visible,
  .global-map-real-estate__mobile-active-metric:hover,
  .global-map-real-estate__mobile-active-metric:focus-visible,
  .global-map-real-estate__mobile-info:hover,
  .global-map-real-estate__mobile-info:focus-visible {
    background: rgba(241, 245, 249, 0.82);
    outline: 0;
  }

  .global-map-real-estate__mobile-main:focus-visible,
  .global-map-real-estate__mobile-switch:focus-visible,
  .global-map-real-estate__mobile-active-metric:focus-visible,
  .global-map-real-estate__mobile-info:focus-visible {
    box-shadow: inset 0 0 0 2px rgba(71, 85, 105, 0.35);
  }

  .global-map-real-estate__mobile-switch {
    display: flex;
    flex: 0 0 44px;
    justify-content: center;
    width: 44px;
    min-height: 44px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    cursor: pointer;
  }

  .global-map-real-estate__mobile-switch .global-map-real-estate__track {
    width: 31px;
    height: 19px;
  }

  .global-map-real-estate__mobile-switch .global-map-real-estate__track > span {
    width: 15px;
    height: 15px;
  }

  .global-map-real-estate__mobile-active-metric {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    gap: 7px;
    min-width: 0;
    min-height: 44px;
    padding: 0 7px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #263449;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 800;
    text-align: left;
    cursor: pointer;
  }

  .global-map-real-estate__mobile-active-metric svg:first-child {
    flex: 0 0 auto;
    color: #8b3131;
  }

  .global-map-real-estate__mobile-active-metric span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .global-map-real-estate__mobile-active-metric svg:last-child {
    flex: 0 0 auto;
    color: #64748b;
  }

  .global-map-real-estate__mobile-info {
    display: inline-flex;
    flex: 0 0 44px;
    align-items: center;
    justify-content: center;
    width: 44px;
    min-height: 44px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #64748b;
    cursor: pointer;
  }

  .global-map-real-estate__mobile-scale {
    display: grid;
    gap: 4px;
    padding: 0 4px;
  }

  .global-map-real-estate__mobile-scale .global-map-real-estate__gradient {
    height: 7px;
  }

  .global-map-real-estate__mobile-endpoints {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    color: #475569;
    font-size: 0.64rem;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    line-height: 1.2;
  }

  .global-map-real-estate__mobile-endpoints span:last-child {
    text-align: right;
  }

  .global-map-real-estate__mobile-status {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 6px 2px;
    color: #64748b;
    font-size: 0.62rem;
    line-height: 1.25;
  }

  .global-map-real-estate__mobile-disclosure {
    border-top: 1px solid rgba(148, 163, 184, 0.2);
  }

  .global-map-real-estate__mobile-disclosure > summary {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 50px;
    color: #475569;
    font-size: 0.84rem;
    font-weight: 750;
    cursor: pointer;
    list-style: none;
  }

  .global-map-real-estate__mobile-disclosure > summary::-webkit-details-marker {
    display: none;
  }

  .global-map-real-estate__mobile-disclosure > summary svg:first-child {
    flex: 0 0 auto;
    color: #64748b;
  }

  .global-map-real-estate__mobile-disclosure > summary svg:last-child {
    flex: 0 0 auto;
    margin-left: auto;
    transition: transform 150ms ease;
  }

  .global-map-real-estate__mobile-disclosure[open] > summary svg:last-child {
    transform: rotate(180deg);
  }

  .global-map-real-estate__disclosure-content {
    display: grid;
    gap: 8px;
    padding: 0 0 14px;
  }

  .global-map-real-estate__metric-options {
    display: grid;
    gap: 8px;
    padding: 2px 0 14px;
  }

  .global-map-real-estate__picker-comparison {
    gap: 7px;
    margin-bottom: 12px;
    padding: 0 0 12px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  }

  .global-map-real-estate__picker-comparison .global-map-real-estate__comparison-label {
    color: #334155;
    font-size: 0.8rem;
    font-weight: 800;
  }

  .global-map-real-estate__picker-comparison :deep(.material-combobox) {
    min-width: 0;
  }

  .global-map-real-estate__picker-comparison :deep(.material-combobox__trigger) {
    min-height: 46px;
    padding: 8px 12px;
    border-radius: 11px;
  }

  .global-map-real-estate__picker-comparison :deep(.material-combobox__value) {
    font-size: 0.88rem;
  }

  .global-map-real-estate__picker-comparison .global-map-real-estate__comparison-hint {
    font-size: 0.66rem;
  }

  .global-map-real-estate__metric-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 58px;
    padding: 12px 15px;
    border: 1px solid rgba(100, 116, 139, 0.2);
    border-radius: 13px;
    background: #fff;
    color: #263449;
    font: inherit;
    font-size: 0.98rem;
    font-weight: 750;
    text-align: left;
    cursor: pointer;
    transition: border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease;
  }

  .global-map-real-estate__metric-option:hover,
  .global-map-real-estate__metric-option:focus-visible {
    border-color: rgba(139, 49, 49, 0.48);
    outline: 0;
  }

  .global-map-real-estate__metric-option--active {
    border-color: rgba(139, 49, 49, 0.36);
    background: rgba(139, 49, 49, 0.055);
    color: #7f2929;
  }

  .global-map-real-estate__picker-content {
    display: grid;
    align-content: start;
    gap: 2px;
  }

  .global-map-real-estate__picker-heading {
    display: grid;
    gap: 2px;
  }

  .global-map-real-estate__picker-heading strong {
    color: #172033;
    font-size: 1rem;
    letter-spacing: -0.02em;
  }

  .global-map-real-estate__picker-heading span {
    color: #64748b;
    font-size: 0.72rem;
  }

  :global(body:has(.global-map-real-estate__picker-content) .app-right-panel__backdrop--mobile-sheet) {
    display: block;
    background: rgba(15, 23, 42, 0.2);
  }

  :global(body:has(.global-map-real-estate__picker-content) .global-map-real-estate__mobile-comparison-menu) {
    z-index: 9410;
  }

  :global(.app-right-panel--mobile-sheet:has(.global-map-real-estate__picker-content)) {
    height: 92dvh;
    max-height: calc(100dvh - max(10px, env(safe-area-inset-top, 0px)));
    min-height: min(92dvh, 180px);
    border-radius: 22px 22px 0 0;
    box-shadow: 0 -16px 46px rgba(15, 23, 42, 0.16);
  }

  :global(.app-right-panel--mobile-sheet:has(.global-map-real-estate__picker-content) .app-right-panel__header) {
    min-height: 58px;
    padding: 4px 14px 11px 18px;
  }

  :global(.app-right-panel--mobile-sheet:has(.global-map-real-estate__picker-content) .app-right-panel__close) {
    width: 44px;
    height: 44px;
    min-height: 44px;
  }

  :global(.app-right-panel--mobile-sheet:has(.global-map-real-estate__picker-content) .app-right-panel__body) {
    padding: 0 18px calc(18px + env(safe-area-inset-bottom, 0px));
    overscroll-behavior: contain;
  }

}

@media (prefers-reduced-motion: reduce) {
  .global-map-real-estate__track,
  .global-map-real-estate__track > span,
  .global-map-real-estate__metric-tab {
    transition: none;
  }

  .global-map-real-estate__mobile-disclosure > summary svg:last-child,
  .global-map-real-estate__metric-option {
    transition: none;
  }

  .global-map-real-estate__spinner {
    animation-duration: 1400ms;
  }
}
</style>
