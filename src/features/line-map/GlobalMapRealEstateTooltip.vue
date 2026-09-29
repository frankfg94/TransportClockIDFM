<template>
  <div ref="tooltipElement" class="global-map-real-estate-tooltip" role="tooltip" :style="style">
    <span v-if="isPurchasePoint" class="global-map-real-estate-tooltip__point">
      {{ t("globalMap.realEstate.purchasePoint") }}
    </span>
    <span v-if="cell" class="global-map-real-estate-tooltip__city">{{ cell.cityName }}</span>
    <template v-if="estimatedMetricValue !== undefined && !cell">
      <span class="global-map-real-estate-tooltip__estimate-label">
        {{ t("globalMap.realEstate.localEstimate") }}
      </span>
      <div class="housing-tooltip-body__section">
        <span class="housing-tooltip-body__metric">{{ t(measureKey) }}</span>
        <strong>{{ formatEstimatedMetric(estimatedMetricValue) }}</strong>
      </div>
      <span class="housing-tooltip-body__detail">
        {{ t("globalMap.realEstate.localEstimateMethod") }}
      </span>
    </template>
    <template v-else-if="cell">
      <HousingTooltipBodyPrice
        v-if="metricMode === 'price'"
        :cell="cell"
        :is-purchase-point="isPurchasePoint"
        :liquidity="liquidity"
        :reference-period="referencePeriod"
      />
      <HousingTooltipBodyRent
        v-else-if="metricMode === 'rent'"
        :rental-estimate="rentalEstimate"
      />
      <HousingTooltipBodyYield
        v-else
        :cell="cell"
        :rental-estimate="rentalEstimate"
      />
    </template>
    <span v-else class="housing-tooltip-body__detail">
      {{ t("globalMap.realEstate.purchasePointNoAggregate") }}
    </span>
    <div v-if="cell && marketRankRows.length" class="housing-tooltip-body__subsection">
      <strong class="housing-tooltip-body__metric">{{ t("globalMap.realEstate.marketRankingTitle") }}</strong>
      <ul class="housing-tooltip-body__benchmarks">
        <li v-for="entry in marketRankRows" :key="entry.scope">
          <span>{{ t(scopeLabelKeys[entry.scope]) }}</span>
          <span>{{ t("globalMap.realEstate.marketRankValue", { rank: entry.rank.rank, count: entry.rank.cityCount }) }}</span>
        </li>
      </ul>
      <span class="housing-tooltip-body__detail">{{ t("globalMap.realEstate.marketRankingMethod") }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from "vue";
import { useI18n, type TranslationKey } from "../../i18n";
import type { DvfMapGridCell, DvfMapLiquidity } from "../../services/real-estate/realEstateMapLayer";
import {
  DVF_MARKET_SCOPES,
  type DvfCityRank,
  type DvfMarketScope,
  type DvfRentalEstimate,
} from "../../services/real-estate/compiledRealEstate";
import type { DvfMapMetricMode } from "../transport-map/next/deckRealEstateLayer";
import HousingTooltipBodyPrice from "./HousingTooltipBodyPrice.vue";
import HousingTooltipBodyRent from "./HousingTooltipBodyRent.vue";
import HousingTooltipBodyYield from "./HousingTooltipBodyYield.vue";

const emit = defineEmits<{ heightChange: [height: number] }>();
const props = withDefaults(defineProps<{
  cell?: DvfMapGridCell;
  isPurchasePoint?: boolean;
  estimatedMetricValue?: number;
  rentalEstimate?: DvfRentalEstimate;
  marketRanks?: Partial<Record<DvfMarketScope, DvfCityRank>>;
  liquidity?: DvfMapLiquidity;
  referencePeriod?: string;
  metricMode: DvfMapMetricMode;
  style: CSSProperties;
}>(), {
  isPurchasePoint: false,
  referencePeriod: "",
});

const tooltipElement = ref<HTMLElement>();
let resizeObserver: ResizeObserver | undefined;

const { locale, t } = useI18n();
const measureKeys = {
  price: "globalMap.realEstate.measurePrice",
  rent: "globalMap.realEstate.measureRent",
  yield: "globalMap.realEstate.measureYield",
} as const;
const measureKey = computed(() => measureKeys[props.metricMode]);
const scopeLabelKeys: Record<DvfMarketScope, TranslationKey> = {
  "paris-intramuros": "globalMap.realEstate.marketScopeParis",
  "petite-couronne": "globalMap.realEstate.marketScopePetite",
  "grande-couronne": "globalMap.realEstate.marketScopeGrande",
  idf: "globalMap.realEstate.marketScopeIdf",
};
const marketRankRows = computed(() => DVF_MARKET_SCOPES.flatMap((scope) => {
  const rank = props.marketRanks?.[scope];
  return rank ? [{ scope, rank }] : [];
}));

function formatEstimatedMetric(value: number): string {
  const formatted = new Intl.NumberFormat(locale.value, {
    maximumFractionDigits: props.metricMode === "price" ? 0 : 1,
  }).format(value);
  return `${formatted} ${props.metricMode === "yield" ? "%" : "€"}`;
}

function reportTooltipHeight(): void {
  const height = tooltipElement.value?.getBoundingClientRect().height;
  if (height && Number.isFinite(height)) emit("heightChange", height);
}

onMounted(() => {
  reportTooltipHeight();
  if (tooltipElement.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(reportTooltipHeight);
    resizeObserver.observe(tooltipElement.value);
  } else if (typeof window !== "undefined") {
    window.addEventListener("resize", reportTooltipHeight);
  }
});

watch(() => [props.metricMode, props.rentalEstimate, props.estimatedMetricValue, props.marketRanks] as const, reportTooltipHeight, { flush: "post" });

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (typeof window !== "undefined") window.removeEventListener("resize", reportTooltipHeight);
});
</script>

<style>
/* These selectors style content rendered by the three child tooltip bodies. */
.global-map-real-estate-tooltip {
  position: absolute;
  z-index: 6;
  display: grid;
  gap: 6px;
  width: min(282px, calc(100% - 16px));
  max-height: min(370px, calc(100vh - 16px));
  overflow-y: auto;
  padding: 10px 12px;
  border: 1px solid rgba(127, 29, 29, 0.18);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.2);
  color: #172033;
  pointer-events: none;
  backdrop-filter: blur(10px);
}

.global-map-real-estate-tooltip__city,
.global-map-real-estate-tooltip__point,
.global-map-real-estate-tooltip__estimate-label {
  overflow: hidden;
  color: #475569;
  font-size: 0.68rem;
  font-weight: 750;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.global-map-real-estate-tooltip__estimate-label {
  color: #166534;
}

.housing-tooltip-body__section {
  display: grid;
  gap: 3px;
  padding-top: 5px;
  border-top: 1px solid rgba(148, 163, 184, 0.24);
}

.housing-tooltip-body__metric {
  color: #64748b;
  font-size: 0.63rem;
  line-height: 1.3;
}

.housing-tooltip-body__section > strong {
  color: #991b1b;
  font-size: 0.92rem;
  font-variant-numeric: tabular-nums;
}

.housing-tooltip-body__detail,
.housing-tooltip-body__caution {
  color: #64748b;
  font-size: 0.61rem;
  line-height: 1.32;
}

.housing-tooltip-body__caution {
  color: #9a3412;
}

.housing-tooltip-body__row,
.housing-tooltip-body__benchmarks li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  color: #334155;
  font-size: 0.65rem;
  line-height: 1.3;
}

.housing-tooltip-body__row strong {
  color: #334155;
  font-size: 0.65rem;
}

.housing-tooltip-body__subsection {
  display: grid;
  gap: 3px;
  margin-top: 4px;
  padding-top: 5px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
}

.housing-tooltip-body__benchmarks {
  display: grid;
  gap: 2px;
  margin: 1px 0 0;
  padding: 0;
  list-style: none;
}

.housing-tooltip-body__benchmarks li > span:last-child {
  flex: 0 0 auto;
  color: #475569;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.housing-tooltip-body__yield-value {
  color: #166534 !important;
}
</style>
