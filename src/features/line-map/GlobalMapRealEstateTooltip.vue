<template>
  <div class="global-map-real-estate-tooltip" role="tooltip" :style="style">
    <span v-if="isPurchasePoint" class="global-map-real-estate-tooltip__point">
      {{ t("globalMap.realEstate.purchasePoint") }}
    </span>
    <span v-if="cell" class="global-map-real-estate-tooltip__city">{{ cell.cityName }}</span>
    <template v-if="cell">
      <span class="global-map-real-estate-tooltip__metric">
        {{ t(isPurchasePoint ? "globalMap.realEstate.nearestCellMean" : "globalMap.realEstate.cellMean") }}
      </span>
      <strong>{{ formatPrice(cell.meanPriceM2) }} €/m²</strong>
      <span class="global-map-real-estate-tooltip__sales">
        {{ t(isPurchasePoint ? "globalMap.realEstate.nearestCellSales" : "globalMap.realEstate.cellSales", {
          count: formatCount(cell.transactionCount),
          median: formatPrice(cell.medianPriceM2),
        }) }}
      </span>
      <span v-if="isPurchasePoint && referencePeriod" class="global-map-real-estate-tooltip__period">
        DVF · {{ referencePeriod }}
      </span>
    </template>
    <span v-else class="global-map-real-estate-tooltip__sales">
      {{ t("globalMap.realEstate.purchasePointNoAggregate") }}
    </span>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";
import { useI18n } from "../../i18n";
import type { DvfMapGridCell } from "../../services/real-estate/realEstateMapLayer";

withDefaults(defineProps<{
  cell?: DvfMapGridCell;
  isPurchasePoint?: boolean;
  referencePeriod?: string;
  style: CSSProperties;
}>(), {
  isPurchasePoint: false,
  referencePeriod: "",
});
const { locale, t } = useI18n();

function formatPrice(value: number): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(value);
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
  gap: 3px;
  min-width: 170px;
  max-width: min(250px, calc(100% - 16px));
  padding: 9px 11px;
  border: 1px solid rgba(127, 29, 29, 0.18);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.2);
  color: #172033;
  pointer-events: none;
  backdrop-filter: blur(10px);
}

.global-map-real-estate-tooltip__city {
  overflow: hidden;
  color: #475569;
  font-size: 0.68rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.global-map-real-estate-tooltip__point {
  color: #475569;
  font-size: 0.68rem;
  font-weight: 750;
  line-height: 1.3;
}

.global-map-real-estate-tooltip strong {
  color: #991b1b;
  font-size: 0.94rem;
  font-variant-numeric: tabular-nums;
}

.global-map-real-estate-tooltip__sales {
  color: #64748b;
  font-size: 0.63rem;
}

.global-map-real-estate-tooltip__metric,
.global-map-real-estate-tooltip__period {
  color: #64748b;
  font-size: 0.63rem;
  line-height: 1.3;
}
</style>
