<template>
  <div class="global-map-real-estate-tooltip" role="tooltip" :style="style">
    <span v-if="isPurchasePoint" class="global-map-real-estate-tooltip__point">
      {{ t("globalMap.realEstate.purchasePoint") }}
    </span>
    <span v-if="cell" class="global-map-real-estate-tooltip__city">{{ cell.cityName }}</span>
    <template v-if="cell">
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
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";
import { useI18n } from "../../i18n";
import type { DvfMapGridCell, DvfMapLiquidity } from "../../services/real-estate/realEstateMapLayer";
import type { DvfRentalEstimate } from "../../services/real-estate/compiledRealEstate";
import type { DvfMapMetricMode } from "../transport-map/next/deckRealEstateLayer";
import HousingTooltipBodyPrice from "./HousingTooltipBodyPrice.vue";
import HousingTooltipBodyRent from "./HousingTooltipBodyRent.vue";
import HousingTooltipBodyYield from "./HousingTooltipBodyYield.vue";

withDefaults(defineProps<{
  cell?: DvfMapGridCell;
  isPurchasePoint?: boolean;
  rentalEstimate?: DvfRentalEstimate;
  liquidity?: DvfMapLiquidity;
  referencePeriod?: string;
  metricMode: DvfMapMetricMode;
  style: CSSProperties;
}>(), {
  isPurchasePoint: false,
  referencePeriod: "",
});

const { t } = useI18n();
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
.global-map-real-estate-tooltip__point {
  overflow: hidden;
  color: #475569;
  font-size: 0.68rem;
  font-weight: 750;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
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
