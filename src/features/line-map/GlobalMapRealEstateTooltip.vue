<template>
  <div class="global-map-real-estate-tooltip" role="tooltip" :style="style">
    <span v-if="isPurchasePoint" class="global-map-real-estate-tooltip__point">
      {{ t("globalMap.realEstate.purchasePoint") }}
    </span>
    <span v-if="cell" class="global-map-real-estate-tooltip__city">{{ cell.cityName }}</span>
    <template v-if="cell">
      <section class="global-map-real-estate-tooltip__section">
        <span class="global-map-real-estate-tooltip__metric">
          {{ t(isPurchasePoint ? "globalMap.realEstate.nearestCellMedian" : "globalMap.realEstate.cellMedian") }}
        </span>
        <strong>{{ formatPrice(cell.medianPriceM2) }} €/m²</strong>
        <span class="global-map-real-estate-tooltip__detail">
          {{ t(isPurchasePoint ? "globalMap.realEstate.nearestCellSales" : "globalMap.realEstate.cellSales", {
            count: formatCount(cell.transactionCount),
            period: referencePeriod,
          }) }}
        </span>
        <span class="global-map-real-estate-tooltip__detail">
          {{ t("globalMap.realEstate.cellMeanSecondary", { mean: formatPrice(cell.meanPriceM2) }) }}
        </span>
      </section>

      <section class="global-map-real-estate-tooltip__section">
        <template v-if="rentalEstimate">
          <span class="global-map-real-estate-tooltip__metric">{{ t("globalMap.realEstate.rentTitle") }}</span>
          <div class="global-map-real-estate-tooltip__row">
            <span>{{ t("globalMap.realEstate.rentLabel") }}</span>
            <strong>{{ formatRent(rentalEstimate.rentPerSquareMeter) }} {{ t("globalMap.realEstate.rentUnit") }}</strong>
          </div>
          <span class="global-map-real-estate-tooltip__detail">
            {{ t("globalMap.realEstate.rentInterval", {
              low: formatRent(rentalEstimate.intervalLow),
              high: formatRent(rentalEstimate.intervalHigh),
            }) }}
          </span>
          <span class="global-map-real-estate-tooltip__detail">
            {{ t("globalMap.realEstate.rentCoverage", {
              level: rentalPredictionLevel,
              count: formatCount(rentalObservationCount),
            }) }}
          </span>
          <span v-if="rentalIsLowConfidence" class="global-map-real-estate-tooltip__caution">
            {{ t("globalMap.realEstate.rentLowConfidence") }}
          </span>
          <div v-if="grossYield !== undefined" class="global-map-real-estate-tooltip__yield">
            <span>{{ t("globalMap.realEstate.grossYield") }}</span>
            <strong>{{ formatPercent(grossYield) }} %</strong>
          </div>
          <span v-if="grossYieldInterval" class="global-map-real-estate-tooltip__detail">
            {{ t("globalMap.realEstate.grossYieldInterval", grossYieldInterval) }}
          </span>
          <span v-if="grossYield !== undefined" class="global-map-real-estate-tooltip__detail">
            {{ t("globalMap.realEstate.grossYieldMethod") }}
          </span>
          <span class="global-map-real-estate-tooltip__source">
            {{ t("globalMap.realEstate.rentSource", { period: rentalReferencePeriod }) }}
          </span>
        </template>
        <span v-else class="global-map-real-estate-tooltip__detail">
          {{ t("globalMap.realEstate.rentUnavailable") }}
        </span>
      </section>

      <section v-if="liquidity" class="global-map-real-estate-tooltip__section">
        <span class="global-map-real-estate-tooltip__metric">
          {{ t("globalMap.realEstate.liquidityTitle", { year: liquidity.year }) }}
        </span>
        <div class="global-map-real-estate-tooltip__row">
          <span>{{ t("globalMap.realEstate.liquidityCityTransactions", { city: cell.cityName }) }}</span>
          <strong v-if="cityTransactions !== undefined">{{ formatCount(cityTransactions) }}</strong>
          <span v-else class="global-map-real-estate-tooltip__detail">{{ t("globalMap.realEstate.liquiditySuppressed") }}</span>
        </div>
        <ul v-if="liquidity.benchmarks.length" class="global-map-real-estate-tooltip__benchmarks">
          <li v-for="benchmark in liquidity.benchmarks" :key="benchmark.scope">
            <span>{{ scopeLabel(benchmark.scope) }}</span>
            <span>{{ formatCount(benchmark.medianTransactionsPerCity) }} / {{ t("globalMap.realEstate.commune") }}</span>
          </li>
        </ul>
        <span class="global-map-real-estate-tooltip__detail">
          {{ t("globalMap.realEstate.liquidityMethod") }}
        </span>
      </section>
    </template>
    <span v-else class="global-map-real-estate-tooltip__detail">
      {{ t("globalMap.realEstate.purchasePointNoAggregate") }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CSSProperties } from "vue";
import { useI18n } from "../../i18n";
import type { DvfMapGridCell, DvfMapLiquidity } from "../../services/real-estate/realEstateMapLayer";
import type { DvfMarketScope, DvfRentalEstimate } from "../../services/real-estate/compiledRealEstate";

const props = withDefaults(defineProps<{
  cell?: DvfMapGridCell;
  isPurchasePoint?: boolean;
  rentalEstimate?: DvfRentalEstimate;
  rentalReferencePeriod?: string;
  liquidity?: DvfMapLiquidity;
  referencePeriod?: string;
  style: CSSProperties;
}>(), {
  isPurchasePoint: false,
  referencePeriod: "",
});
const { locale, t } = useI18n();

const cityTransactions = computed(() => {
  if (!props.cell || !props.liquidity) return undefined;
  return props.liquidity.transactionsByCityCode[props.cell.cityCode];
});

const grossYield = computed(() => {
  const rent = props.rentalEstimate?.rentPerSquareMeter;
  const price = props.cell?.medianPriceM2;
  if (!rent || !price || price <= 0) return undefined;
  return rent * 12 / price * 100;
});

const grossYieldInterval = computed(() => {
  const estimate = props.rentalEstimate;
  const price = props.cell?.medianPriceM2;
  if (!estimate || !price || price <= 0) return undefined;
  return {
    low: formatPercent(estimate.intervalLow * 12 / price * 100),
    high: formatPercent(estimate.intervalHigh * 12 / price * 100),
  };
});

const rentalObservationCount = computed(() => {
  if (!props.rentalEstimate) return 0;
  return props.rentalEstimate.observationsInCommune || props.rentalEstimate.observationsInMesh;
});

const rentalPredictionLevel = computed(() => {
  const level = props.rentalEstimate?.predictionLevel.toLowerCase();
  if (level === "commune") return t("globalMap.realEstate.rentLevelCommune");
  if (level === "epci") return t("globalMap.realEstate.rentLevelEpci");
  return t("globalMap.realEstate.rentLevelMesh");
});

const rentalIsLowConfidence = computed(() => Boolean(props.rentalEstimate
  && (props.rentalEstimate.observationsInCommune < 30 || (props.rentalEstimate.modelR2 !== undefined && props.rentalEstimate.modelR2 < 0.5))));

function scopeLabel(scope: DvfMarketScope): string {
  if (scope === "paris-intramuros") return t("globalMap.realEstate.liquidityScopeParis");
  if (scope === "petite-couronne") return t("globalMap.realEstate.liquidityScopePetite");
  if (scope === "grande-couronne") return t("globalMap.realEstate.liquidityScopeGrande");
  return t("globalMap.realEstate.liquidityScopeIdf");
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(value);
}

function formatRent(value: number): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(value);
}
</script>

<style scoped>
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
.global-map-real-estate-tooltip__point {
  overflow: hidden;
  color: #475569;
  font-size: 0.68rem;
  font-weight: 750;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.global-map-real-estate-tooltip__section {
  display: grid;
  gap: 3px;
  padding-top: 5px;
  border-top: 1px solid rgba(148, 163, 184, 0.24);
}

.global-map-real-estate-tooltip__metric {
  color: #64748b;
  font-size: 0.63rem;
  line-height: 1.3;
}

.global-map-real-estate-tooltip strong {
  color: #991b1b;
  font-size: 0.92rem;
  font-variant-numeric: tabular-nums;
}

.global-map-real-estate-tooltip__detail,
.global-map-real-estate-tooltip__source,
.global-map-real-estate-tooltip__caution {
  color: #64748b;
  font-size: 0.61rem;
  line-height: 1.32;
}

.global-map-real-estate-tooltip__caution {
  color: #9a3412;
}

.global-map-real-estate-tooltip__row,
.global-map-real-estate-tooltip__yield,
.global-map-real-estate-tooltip__benchmarks li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  color: #334155;
  font-size: 0.65rem;
  line-height: 1.3;
}

.global-map-real-estate-tooltip__yield {
  padding-top: 3px;
  color: #166534;
  font-weight: 750;
}

.global-map-real-estate-tooltip__yield strong {
  color: #166534;
}

.global-map-real-estate-tooltip__benchmarks {
  display: grid;
  gap: 2px;
  margin: 1px 0 0;
  padding: 0;
  list-style: none;
}

.global-map-real-estate-tooltip__benchmarks li > span:last-child {
  flex: 0 0 auto;
  color: #475569;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.global-map-real-estate-tooltip__source {
  padding-top: 3px;
}
</style>
