<template>
  <section class="housing-tooltip-body__section">
    <template v-if="rentalEstimate">
      <span class="housing-tooltip-body__metric">{{ t("globalMap.realEstate.rentTitle") }}</span>
      <div class="housing-tooltip-body__row">
        <span>{{ t("globalMap.realEstate.rentLabel") }}</span>
        <strong>{{ formatRent(rentalEstimate.rentPerSquareMeter) }} {{ t("globalMap.realEstate.rentUnit") }}</strong>
      </div>
      <span class="housing-tooltip-body__detail">
        {{ t("globalMap.realEstate.rentInterval", {
          low: formatRent(rentalEstimate.intervalLow),
          high: formatRent(rentalEstimate.intervalHigh),
        }) }}
      </span>
      <span class="housing-tooltip-body__detail">
        {{ t("globalMap.realEstate.rentCoverage", {
          level: rentalPredictionLevel,
          count: formatCount(rentalObservationCount),
        }) }}
      </span>
      <span v-if="rentalIsLowConfidence" class="housing-tooltip-body__caution">
        {{ t("globalMap.realEstate.rentLowConfidence") }}
      </span>
    </template>
    <span v-else class="housing-tooltip-body__detail">
      {{ t("globalMap.realEstate.rentUnavailable") }}
    </span>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "../../i18n";
import type { DvfRentalEstimate } from "../../services/real-estate/compiledRealEstate";

const props = defineProps<{
  rentalEstimate?: DvfRentalEstimate;
}>();

const { locale, t } = useI18n();
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

function formatRent(value: number): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(value);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(value);
}
</script>
