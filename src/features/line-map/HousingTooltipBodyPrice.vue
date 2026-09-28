<template>
  <section class="housing-tooltip-body__section">
    <span class="housing-tooltip-body__metric">
      {{ t(isPurchasePoint ? "globalMap.realEstate.nearestCellMedian" : "globalMap.realEstate.cellMedian") }}
    </span>
    <strong>{{ formatPrice(cell.medianPriceM2) }} €/m²</strong>
    <span class="housing-tooltip-body__detail">
      {{ t(isPurchasePoint ? "globalMap.realEstate.nearestCellSales" : "globalMap.realEstate.cellSales", {
        count: formatCount(cell.transactionCount),
        period: referencePeriod,
      }) }}
    </span>
    <span class="housing-tooltip-body__detail">
      {{ t("globalMap.realEstate.cellMeanSecondary", { mean: formatPrice(cell.meanPriceM2) }) }}
    </span>

    <div v-if="liquidity" class="housing-tooltip-body__subsection">
      <span class="housing-tooltip-body__metric">
        {{ t("globalMap.realEstate.liquidityTitle", { year: liquidity.year }) }}
      </span>
      <div class="housing-tooltip-body__row">
        <span>{{ t("globalMap.realEstate.liquidityCityTransactions", { city: cell.cityName }) }}</span>
        <strong v-if="cityTransactions !== undefined">{{ formatCount(cityTransactions) }}</strong>
        <span v-else class="housing-tooltip-body__detail">{{ t("globalMap.realEstate.liquiditySuppressed") }}</span>
      </div>
      <ul v-if="liquidity.benchmarks.length" class="housing-tooltip-body__benchmarks">
        <li v-for="benchmark in liquidity.benchmarks" :key="benchmark.scope">
          <span>{{ scopeLabel(benchmark.scope) }}</span>
          <span>{{ formatCount(benchmark.medianTransactionsPerCity) }} / {{ t("globalMap.realEstate.commune") }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "../../i18n";
import type { DvfMapGridCell, DvfMapLiquidity } from "../../services/real-estate/realEstateMapLayer";
import type { DvfMarketScope } from "../../services/real-estate/compiledRealEstate";

const props = withDefaults(defineProps<{
  cell: DvfMapGridCell;
  isPurchasePoint?: boolean;
  liquidity?: DvfMapLiquidity;
  referencePeriod: string;
}>(), { isPurchasePoint: false });

const { locale, t } = useI18n();
const cityTransactions = computed(() => props.liquidity?.transactionsByCityCode[props.cell.cityCode]);

function scopeLabel(scope: DvfMarketScope): string {
  if (scope === "paris-intramuros") return t("globalMap.realEstate.liquidityScopeParis");
  if (scope === "petite-couronne") return t("globalMap.realEstate.liquidityScopePetite");
  if (scope === "grande-couronne") return t("globalMap.realEstate.liquidityScopeGrande");
  return t("globalMap.realEstate.liquidityScopeIdf");
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(value);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(value);
}
</script>
