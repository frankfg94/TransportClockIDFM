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

<style scoped>
.nearby-map__real-estate-controls { color: #263247; display: grid; gap: 10px; }
.nearby-map__real-estate-layer-switch { align-items: center; border-bottom: 1px solid rgba(100,116,139,.12); color: #263247; cursor: pointer; display: flex; font-size: .82rem; font-weight: 800; gap: 12px; justify-content: space-between; min-height: 42px; padding-bottom: 8px; }
.nearby-map__real-estate-layer-switch input { accent-color: #9f1239; flex: 0 0 20px; height: 20px; margin: 0; width: 20px; }
.nearby-map__real-estate-mode { background: #f4f5f8; border: 1px solid rgba(100,116,139,.12); border-radius: 10px; display: grid; gap: 3px; grid-template-columns: 1fr 1fr; padding: 3px; }
.nearby-map__real-estate-mode button { background: transparent; border: 0; border-radius: 7px; color: #687589; cursor: pointer; font: inherit; font-size: .7rem; font-weight: 780; min-height: 34px; padding: 6px 7px; }
.nearby-map__real-estate-mode button:hover, .nearby-map__real-estate-mode button:focus-visible { outline: 2px solid rgba(159,18,57,.22); }
.nearby-map__real-estate-mode button.nearby-map__real-estate-mode--active { background: #fff; box-shadow: 0 1px 4px rgba(15,23,42,.12); color: #9f1239; }
.nearby-map__real-estate-selects { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0,1fr)); }
.nearby-map__real-estate-selects label { display: grid; gap: 4px; min-width: 0; }
.nearby-map__real-estate-selects label > span { color: #69768a; font-size: .67rem; font-weight: 760; }
.nearby-map__real-estate-selects select { background: #fff; border: 1px solid rgba(100,116,139,.22); border-radius: 8px; color: #243047; font: inherit; font-size: .69rem; font-weight: 720; min-height: 34px; min-width: 0; padding: 5px 7px; }
.nearby-map__real-estate-selects select:focus-visible { border-color: #be123c; outline: 2px solid rgba(190,18,60,.18); }
.nearby-map__real-estate-gradient { display: grid; gap: 6px; grid-template-columns: repeat(3, minmax(0,1fr)); padding-top: 13px; position: relative; }
.nearby-map__real-estate-gradient::before { background: linear-gradient(90deg, #16a34a 0%, #84cc16 20%, #facc15 40%, #f97316 60%, #dc2626 80%, #7f1d1d 100%); border-radius: 999px; content: ""; height: 8px; left: 0; position: absolute; right: 0; top: 0; }
.nearby-map__real-estate-gradient--liquidity::before { background: linear-gradient(90deg, #fecaca 0%, #f87171 36%, #dc2626 72%, #991b1b 100%); }
.nearby-map__real-estate-gradient span { color: #69768a; font-size: .64rem; line-height: 1.25; }
.nearby-map__real-estate-gradient span:nth-child(2) { text-align: center; }
.nearby-map__real-estate-gradient span:last-child { text-align: right; }
.nearby-map__real-estate-rank { background: rgba(254,242,242,.72); border-radius: 8px; color: #52627a; font-size: .69rem; line-height: 1.35; margin: 0; padding: 7px 8px; }
.nearby-map__real-estate-disclaimer { border-top: 1px solid rgba(100,116,139,.12); color: #738094; font-size: .67rem; line-height: 1.4; margin: 0; padding-top: 8px; }
.nearby-map__real-estate-disclaimer a { color: #9f1239; font-weight: 790; margin-left: 3px; text-decoration: underline; text-underline-offset: 2px; }
.nearby-map__real-estate-disclaimer a:focus-visible { outline: 2px solid rgba(159,18,57,.34); }
</style>
