<template>
  <section class="housing-tooltip-body__section">
    <template v-if="grossYield !== undefined">
      <span class="housing-tooltip-body__metric">{{ t("globalMap.realEstate.grossYield") }}</span>
      <strong class="housing-tooltip-body__yield-value">{{ formatPercent(grossYield) }} %</strong>
      <span class="housing-tooltip-body__detail">
        {{ t("globalMap.realEstate.yieldInputs", {
          rent: formatRent(rentalEstimate?.rentPerSquareMeter ?? 0),
          price: formatPrice(cell.medianPriceM2),
        }) }}
      </span>
      <span v-if="grossYieldInterval" class="housing-tooltip-body__detail">
        {{ t("globalMap.realEstate.grossYieldInterval", grossYieldInterval) }}
      </span>
    </template>
    <span v-else class="housing-tooltip-body__detail">
      {{ t("globalMap.realEstate.yieldUnavailable") }}
    </span>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "../../i18n";
import type { DvfMapGridCell } from "../../services/real-estate/realEstateMapLayer";
import type { DvfRentalEstimate } from "../../services/real-estate/compiledRealEstate";

const props = defineProps<{
  cell: DvfMapGridCell;
  rentalEstimate?: DvfRentalEstimate;
}>();

const { locale, t } = useI18n();
const grossYield = computed(() => {
  const rent = props.rentalEstimate?.rentPerSquareMeter;
  const price = props.cell.medianPriceM2;
  if (!rent || !price || price <= 0) return undefined;
  return rent * 12 / price * 100;
});
const grossYieldInterval = computed(() => {
  const estimate = props.rentalEstimate;
  const price = props.cell.medianPriceM2;
  if (!estimate || price <= 0) return undefined;
  return {
    low: formatPercent(estimate.intervalLow * 12 / price * 100),
    high: formatPercent(estimate.intervalHigh * 12 / price * 100),
  };
});

function formatPrice(value: number): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(value);
}

function formatRent(value: number): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}
</script>
