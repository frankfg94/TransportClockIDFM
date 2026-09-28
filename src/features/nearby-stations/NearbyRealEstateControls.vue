<script setup lang="ts">
import { computed } from "vue";
import {
  DVF_MARKET_SCOPES,
  DVF_SOURCE_PAGE_URL,
  type DvfComparisonScope,
  type DvfMarketScope,
} from "../../services/real-estate/compiledRealEstate";
import { useI18n } from "../../i18n";

const props = defineProps<{
  enabled: boolean;
  showLayerToggle?: boolean;
  mode: "prices" | "liquidity";
  reference: DvfComparisonScope;
  measure: "median" | "mean";
  referenceLabel: string;
  selectedRank?: { rank: number; cityCount: number };
}>();

const emit = defineEmits<{
  "toggle-layer": [];
  "update:mode": [mode: "prices" | "liquidity"];
  "update:reference": [reference: DvfComparisonScope];
  "update:measure": [measure: "median" | "mean"];
}>();

const { n, t } = useI18n();
const priceLegendLabel = computed(() => t("nearbyStations.realEstate.priceLegendAria", {
  measure: props.measure === "median" ? t("nearbyStations.realEstate.median") : t("nearbyStations.realEstate.mean"),
  reference: props.referenceLabel,
}));

function scopeLabelKey(scope: DvfMarketScope): "nearbyStations.realEstate.parisScope" | "nearbyStations.realEstate.petiteCouronneScope" | "nearbyStations.realEstate.grandeCouronneScope" | "nearbyStations.realEstate.idfScope" {
  if (scope === "paris-intramuros") return "nearbyStations.realEstate.parisScope";
  if (scope === "petite-couronne") return "nearbyStations.realEstate.petiteCouronneScope";
  if (scope === "grande-couronne") return "nearbyStations.realEstate.grandeCouronneScope";
  return "nearbyStations.realEstate.idfScope";
}

function updateReference(event: Event): void {
  emit("update:reference", (event.target as HTMLSelectElement).value as DvfComparisonScope);
}

function updateMeasure(event: Event): void {
  emit("update:measure", (event.target as HTMLSelectElement).value as "median" | "mean");
}
</script>

<template>
  <div class="nearby-map__real-estate-controls">
    <label v-if="showLayerToggle" class="nearby-map__real-estate-layer-switch">
      <span>{{ t("nearbyStations.realEstate.layerControl") }}</span>
      <input
        type="checkbox"
        :checked="enabled"
        :aria-label="t('nearbyStations.realEstate.layerControl')"
        @change.stop="emit('toggle-layer')"
      >
    </label>
    <div class="nearby-map__real-estate-mode" role="group" :aria-label="t('nearbyStations.realEstate.layerMode')">
      <button
        type="button"
        :aria-pressed="mode === 'prices'"
        :class="{ 'nearby-map__real-estate-mode--active': mode === 'prices' }"
        @click.stop="emit('update:mode', 'prices')"
      >{{ t('nearbyStations.realEstate.prices') }}</button>
      <button
        type="button"
        :aria-pressed="mode === 'liquidity'"
        :class="{ 'nearby-map__real-estate-mode--active': mode === 'liquidity' }"
        @click.stop="emit('update:mode', 'liquidity')"
      >{{ t('nearbyStations.realEstate.liquidity') }}</button>
    </div>
    <div class="nearby-map__real-estate-selects">
      <label>
        <span>{{ t('nearbyStations.realEstate.reference') }}</span>
        <select :value="reference" :aria-label="t('nearbyStations.realEstate.reference')" @change="updateReference" @click.stop>
          <option value="city">{{ t('nearbyStations.realEstate.cityScope') }}</option>
          <option v-for="scope in DVF_MARKET_SCOPES" :key="scope" :value="scope">{{ t(scopeLabelKey(scope)) }}</option>
        </select>
      </label>
      <label v-if="mode === 'prices'">
        <span>{{ t('nearbyStations.realEstate.measure') }}</span>
        <select :value="measure" :aria-label="t('nearbyStations.realEstate.measure')" @change="updateMeasure" @click.stop>
          <option value="median">{{ t('nearbyStations.realEstate.median') }}</option>
          <option value="mean">{{ t('nearbyStations.realEstate.mean') }}</option>
        </select>
      </label>
    </div>
    <div
      v-if="mode === 'prices'"
      class="nearby-map__real-estate-gradient nearby-map__real-estate-gradient--price"
      role="img"
      :aria-label="priceLegendLabel"
    >
      <span>{{ t('nearbyStations.realEstate.lowPriceBand') }}</span>
      <span>{{ t('nearbyStations.realEstate.typicalPriceBand') }}</span>
      <span>{{ t('nearbyStations.realEstate.veryHighPriceBand') }}</span>
    </div>
    <div
      v-else
      class="nearby-map__real-estate-gradient nearby-map__real-estate-gradient--liquidity"
      role="img"
      :aria-label="t('nearbyStations.realEstate.liquidityLegendAria', { reference: referenceLabel })"
    >
      <span>{{ t('nearbyStations.realEstate.lowLiquidity') }}</span>
      <span>{{ t('nearbyStations.realEstate.typicalLiquidity') }}</span>
      <span>{{ t('nearbyStations.realEstate.veryHighLiquidity') }}</span>
    </div>
    <p v-if="mode === 'prices' && selectedRank" class="nearby-map__real-estate-rank">
      {{ t('nearbyStations.realEstate.rank', { rank: selectedRank.rank, count: selectedRank.cityCount }) }} · {{ t('nearbyStations.realEstate.rankNote') }}
    </p>
    <p class="nearby-map__real-estate-disclaimer">
      {{ t(mode === 'prices' ? 'nearbyStations.realEstate.priceDisclaimer' : 'nearbyStations.realEstate.liquidityDisclaimer') }}
      <a :href="DVF_SOURCE_PAGE_URL" target="_blank" rel="noreferrer" @click.stop>{{ t('nearbyStations.realEstate.sourceShort') }}</a>
    </p>
  </div>
</template>
