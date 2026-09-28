<template>
  <div class="global-map-real-estate-tooltip" role="tooltip" :style="style">
    <span class="global-map-real-estate-tooltip__city">{{ cell.cityName }}</span>
    <strong>{{ formatPrice(cell.medianPriceM2) }} €/m²</strong>
    <span class="global-map-real-estate-tooltip__sales">
      {{ t("globalMap.realEstate.cellSales", { count: formatCount(cell.transactionCount) }) }}
    </span>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";
import { useI18n } from "../../i18n";
import type { DvfMapGridCell } from "../../services/real-estate/realEstateMapLayer";

defineProps<{ cell: DvfMapGridCell; style: CSSProperties }>();
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

.global-map-real-estate-tooltip strong {
  color: #991b1b;
  font-size: 0.94rem;
  font-variant-numeric: tabular-nums;
}

.global-map-real-estate-tooltip__sales {
  color: #64748b;
  font-size: 0.63rem;
}
</style>
