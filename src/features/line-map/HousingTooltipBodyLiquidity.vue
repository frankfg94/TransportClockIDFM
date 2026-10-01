<template>
  <section class="housing-tooltip-body__section">
    <span class="housing-tooltip-body__metric">
      {{ t(isPurchasePoint ? "globalMap.realEstate.nearestCellLiquidity" : "globalMap.realEstate.cellLiquidity") }}
    </span>
    <strong>{{ formatCount(cell.transactionCount) }} {{ t("globalMap.realEstate.salesUnit") }}</strong>
    <span class="housing-tooltip-body__detail">
      {{ t("globalMap.realEstate.liquidityCellPeriod", { period: referencePeriod }) }}
    </span>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "../../i18n";
import type { DvfMapGridCell } from "../../services/real-estate/realEstateMapLayer";

defineProps<{
  cell: DvfMapGridCell;
  isPurchasePoint: boolean;
  referencePeriod: string;
}>();

const { locale, t } = useI18n();

function formatCount(value: number): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(value);
}
</script>
