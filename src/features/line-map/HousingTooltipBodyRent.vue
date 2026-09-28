<template>
  <section class="housing-tooltip-body__section">
    <template v-if="rentalEstimate">
      <span class="housing-tooltip-body__metric">{{ t("globalMap.realEstate.rentTitle") }}</span>
      <div class="housing-tooltip-body__row">
        <span>{{ t("globalMap.realEstate.rentLabel") }}</span>
        <strong>{{ formatRent(rentalEstimate.rentPerSquareMeter) }} {{ t("globalMap.realEstate.rentUnit") }}</strong>
      </div>
    </template>
    <span v-else class="housing-tooltip-body__detail">
      {{ t("globalMap.realEstate.rentUnavailable") }}
    </span>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "../../i18n";
import type { DvfRentalEstimate } from "../../services/real-estate/compiledRealEstate";

const props = defineProps<{
  rentalEstimate?: DvfRentalEstimate;
}>();

const { locale, t } = useI18n();

function formatRent(value: number): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(value);
}

</script>
